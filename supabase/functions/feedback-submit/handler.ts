// Request handler for feedback-submit. All I/O comes in through `Deps`, so the
// whole policy (auth, limits, validation, image handling) runs without a network.
import { type CleanFeedback, type FeedbackDeps, type FeedbackTier, validateFeedback, wasStripped } from '../_shared/feedback-rules.ts';
import { DATA_URL_PREFIX, decodeBase64, hasJpegMagic, MAX_SCREENSHOT_BYTES, MAX_SCREENSHOT_DIMENSION, readJpegSize } from './jpeg.ts';
import { computeRiskFlags } from './risk-flags.ts';

export const RATE_LIMITS = { perHour: 5, perDay: 20, globalPerHour: 300 } as const;
/** Raw request body cap in bytes: a 1.5 MB image is ~2 MB of base64, plus snapshot and text. */
export const MAX_BODY_BYTES = 3_300_000;

export interface AuthUser {
  id: string;
  isAnonymous: boolean;
}

export type RateDecision = { allowed: true } | { allowed: false; scope: 'hour' | 'day' | 'global'; retryAfterSec: number };

export interface FeedbackRow {
  id: string;
  userId: string;
  category: string;
  message: string;
  snapshot: unknown;
  screenshotPath: string | null;
  riskFlags: string[];
}

export interface Deps {
  /** Verifies the bearer token with the auth server. Returns null for any invalid token. */
  verifyUser(jwt: string): Promise<AuthUser | null>;
  tierFor(userId: string): Promise<FeedbackTier>;
  isRegisteredScenario(id: string): boolean;
  /** Owner of an existing submission with this id, or null. */
  findOwner(id: string): Promise<string | null>;
  /** Records the attempt and decides atomically. */
  consumeRate(userId: string, nowMs: number): Promise<RateDecision>;
  putScreenshot(path: string, bytes: Uint8Array): Promise<void>;
  /** Decode and re-encode. Throws on anything that is not a decodable JPEG. */
  reencodeJpeg(bytes: Uint8Array): Promise<Uint8Array>;
  insert(row: FeedbackRow): Promise<'inserted' | 'duplicate' | 'conflict'>;
  now(): number;
  log?(event: string, detail?: Record<string, unknown>): void;
  allowedOrigin?: string;
}

function respond(status: number, body: Record<string, unknown>, deps: Deps, extra: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': deps.allowedOrigin ?? '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
      ...extra,
    },
  });
}

const fail = (status: number, error: string, deps: Deps, extra?: Record<string, unknown>, headers?: Record<string, string>) => respond(status, { ok: false, error, ...extra }, deps, headers);

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const m = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/iu.exec(h.trim());
  return m ? m[1] : null;
}

export async function handleFeedbackRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return respond(204, {}, deps);
  if (req.method !== 'POST') return fail(405, 'method-not-allowed', deps, undefined, { Allow: 'POST, OPTIONS' });

  try {
    // 1. Authenticate before reading the body.
    const jwt = bearer(req);
    if (!jwt) return fail(401, 'unauthorized', deps);
    const user = await deps.verifyUser(jwt);
    if (!user) return fail(401, 'unauthorized', deps);
    if (user.isAnonymous) return fail(403, 'sign-in-required', deps);

    // 2. Bounded body read.
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, 'payload-too-large', deps);
    if (!/^application\/json\b/iu.test(req.headers.get('content-type') ?? '')) return fail(415, 'unsupported-media-type', deps);
    const raw = await readBounded(req, MAX_BODY_BYTES);
    if (raw === null) return fail(413, 'payload-too-large', deps);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return fail(400, 'invalid-json', deps);
    }

    // 3. Re-run the shared rules. The client result is never trusted.
    const tier = await deps.tierFor(user.id);
    const scenarioDeps: FeedbackDeps = { isRegisteredScenario: (id) => deps.isRegisteredScenario(id) };
    const result = validateFeedback(payload, tier, scenarioDeps);
    if (result.ok === false) return fail(400, 'invalid-feedback', deps, { reasons: result.reasons });
    const clean = result.value;

    // 4. Idempotency before rate limiting: a replay costs the player nothing.
    const owner = await deps.findOwner(clean.id);
    if (owner !== null) return owner === user.id ? respond(200, { ok: true, id: clean.id, duplicate: true }, deps) : fail(409, 'id-conflict', deps);

    // 5. Rate limits.
    const rate = await deps.consumeRate(user.id, deps.now());
    if (rate.allowed === false) {
      deps.log?.('rate-limited', { scope: rate.scope });
      return fail(429, 'rate-limited', deps, { scope: rate.scope === 'global' ? 'global' : rate.scope }, { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterSec))) });
    }

    // 6. Screenshot: validate, re-encode, store the path only.
    let screenshotPath: string | null = null;
    if (clean.screenshot !== null) {
      const processed = await processScreenshot(clean, deps);
      if (processed.ok === false) return fail(processed.status, processed.error, deps);
      screenshotPath = `${user.id}/${clean.id}.jpg`;
      await deps.putScreenshot(screenshotPath, processed.bytes);
    }

    // 7. Flag, do not reject.
    const riskFlags = computeRiskFlags({
      message: clean.message,
      stripped: clean.stripped,
      snapshotSanitized: snapshotWasSanitized(clean),
    });

    const outcome = await deps.insert({
      id: clean.id,
      userId: user.id,
      category: clean.category,
      message: clean.message,
      snapshot: clean.snapshot,
      screenshotPath,
      riskFlags,
    });
    if (outcome === 'conflict') return fail(409, 'id-conflict', deps);
    return respond(200, { ok: true, id: clean.id, duplicate: outcome === 'duplicate' }, deps);
  } catch (err) {
    // Detail goes to the server log only.
    deps.log?.('internal-error', { name: err instanceof Error ? err.name : 'unknown' });
    return fail(500, 'internal-error', deps);
  }
}

function snapshotWasSanitized(c: CleanFeedback): boolean {
  const f = c.snapshotFlags;
  return wasStripped(f.stripped) || f.truncatedStrings > 0 || f.droppedKeys > 0 || f.droppedValues > 0 || f.depthExceeded || f.keyLimitHit;
}

async function readBounded(req: Request, max: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(all);
}

type Processed = { ok: true; bytes: Uint8Array } | { ok: false; status: number; error: string };

async function processScreenshot(clean: CleanFeedback, deps: Deps): Promise<Processed> {
  const shot = clean.screenshot as string;
  if (!shot.startsWith(DATA_URL_PREFIX)) return { ok: false, status: 400, error: 'invalid-screenshot' };
  const bytes = decodeBase64(shot.slice(DATA_URL_PREFIX.length));
  if (bytes === null || !hasJpegMagic(bytes)) return { ok: false, status: 400, error: 'invalid-screenshot' };
  if (bytes.length > MAX_SCREENSHOT_BYTES) return { ok: false, status: 413, error: 'screenshot-too-large' };
  const size = readJpegSize(bytes);
  if (size === null || size.width < 1 || size.height < 1) return { ok: false, status: 400, error: 'invalid-screenshot' };
  if (size.width > MAX_SCREENSHOT_DIMENSION || size.height > MAX_SCREENSHOT_DIMENSION) return { ok: false, status: 413, error: 'screenshot-too-large' };
  try {
    const out = await deps.reencodeJpeg(bytes);
    if (!hasJpegMagic(out) || out.length > MAX_SCREENSHOT_BYTES * 2) return { ok: false, status: 400, error: 'invalid-screenshot' };
    return { ok: true, bytes: out };
  } catch {
    return { ok: false, status: 400, error: 'invalid-screenshot' };
  }
}
