// Request handler for feedback-submit. All I/O comes in through `Deps`, so the
// whole policy (auth, limits, validation, image handling) runs without a network.
import { type CleanFeedback, type FeedbackDeps, type FeedbackTier, validateFeedback, wasStripped } from '../_shared/feedback-rules.ts';
import { DATA_URL_PREFIX, decodeBase64, hasJpegMagic, MAX_SCREENSHOT_BASE64_CHARS, MAX_SCREENSHOT_BYTES, MAX_SCREENSHOT_HEIGHT, MAX_SCREENSHOT_PIXELS, MAX_SCREENSHOT_WIDTH, inspectJpeg } from './jpeg.ts';
import { computeRiskFlags } from './risk-flags.ts';

export const RATE_LIMITS = { perHour: 5, perDay: 20, globalPerHour: 300 } as const;
/** Raw request body cap in bytes: a 1.5 MB image is ~2 MB of base64, plus snapshot and text. */
export const MAX_BODY_BYTES = 3_300_000;
/** The body must arrive within this long; a slow-drip sender is cut off. */
export const BODY_READ_TIMEOUT_MS = 10_000;

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
  /** Stores without overwriting. Resolves 'exists' when the object is already there. */
  putScreenshot(path: string, bytes: Uint8Array): Promise<'stored' | 'exists'>;
  /** Best-effort delete of an object this request uploaded. */
  removeScreenshot(path: string): Promise<void>;
  /** Decode and re-encode. Throws on anything that is not a decodable JPEG. */
  reencodeJpeg(bytes: Uint8Array): Promise<Uint8Array>;
  insert(row: FeedbackRow): Promise<'inserted' | 'duplicate' | 'conflict'>;
  now(): number;
  log?(event: string, detail?: Record<string, unknown>): void;
  allowedOrigin?: string;
  /** Body read timeout in ms; defaults to BODY_READ_TIMEOUT_MS. */
  bodyTimeoutMs?: number;
  /** Concurrent body reads allowed per user and per isolate; defaults to MAX_READS_PER_USER / MAX_READS_PER_ISOLATE. */
  maxReadsPerUser?: number;
  maxReadsPerIsolate?: number;
}

export const MAX_READS_PER_USER = 2;
export const MAX_READS_PER_ISOLATE = 12;

// In-flight body reads (a concurrency limit, not quota). Module state is per isolate.
const readsByUser = new Map<string, number>();
let readsInIsolate = 0;

/** Test hook: current in-flight counts. */
export function inflightReads(): { total: number; users: number } {
  return { total: readsInIsolate, users: readsByUser.size };
}

function acquireRead(userId: string, deps: Deps): boolean {
  const mine = readsByUser.get(userId) ?? 0;
  if (mine >= (deps.maxReadsPerUser ?? MAX_READS_PER_USER) || readsInIsolate >= (deps.maxReadsPerIsolate ?? MAX_READS_PER_ISOLATE)) return false;
  readsByUser.set(userId, mine + 1);
  readsInIsolate++;
  return true;
}

function releaseRead(userId: string): void {
  const mine = (readsByUser.get(userId) ?? 1) - 1;
  if (mine <= 0) readsByUser.delete(userId);
  else readsByUser.set(userId, mine);
  readsInIsolate = Math.max(0, readsInIsolate - 1);
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
    // 0. Refuse on the headers alone, before auth and before the body is touched: a declared length over the
    // limit, a length that is not a plain integer, or no length at all on a body that is not chunked.
    if (declaredLengthRefused(req)) return fail(413, 'payload-too-large', deps);

    // 1. Authenticate before reading the body.
    const jwt = bearer(req);
    if (!jwt) return fail(401, 'unauthorized', deps);
    const user = await deps.verifyUser(jwt);
    if (!user) return fail(401, 'unauthorized', deps);
    if (user.isAnonymous) return fail(403, 'sign-in-required', deps);

    // 2. Bounded body read.
    if (!/^application\/json\b/iu.test(req.headers.get('content-type') ?? '')) return fail(415, 'unsupported-media-type', deps);
    if (!acquireRead(user.id, deps)) {
      deps.log?.('read-limited');
      return fail(429, 'too-many-requests', deps, undefined, { 'Retry-After': '2' });
    }
    let raw: string | null | 'timeout';
    try {
      raw = await readBounded(req, MAX_BODY_BYTES, deps.bodyTimeoutMs ?? BODY_READ_TIMEOUT_MS);
    } finally {
      releaseRead(user.id);
    }
    if (raw === 'timeout') return fail(408, 'request-timeout', deps);
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
    // Ids are compared and stored lowercase: the path check and the uuid column both expect it.
    const clean = { ...result.value, id: result.value.id.toLowerCase() };

    // 4. Idempotency before rate limiting: a replay costs the player nothing.
    const owner = await deps.findOwner(clean.id);
    if (owner !== null) return owner === user.id ? respond(200, { ok: true, id: clean.id, duplicate: true }, deps) : fail(409, 'id-conflict', deps);

    // 5. Rate limits.
    const rate = await deps.consumeRate(user.id, deps.now());
    if (rate.allowed === false) {
      deps.log?.('rate-limited', { scope: rate.scope });
      return fail(429, 'rate-limited', deps, { scope: rate.scope === 'global' ? 'global' : rate.scope }, { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterSec))) });
    }

    // 6. Screenshot: validate and re-encode before anything is stored.
    let processedBytes: Uint8Array | null = null;
    if (clean.screenshot !== null) {
      const processed = await processScreenshot(clean, deps);
      if (processed.ok === false) return fail(processed.status, processed.error, deps);
      processedBytes = processed.bytes;
    }

    // 7. Flag, do not reject. Every stored string is scanned, not only the message.
    const riskFlags = computeRiskFlags({
      message: clean.message,
      stripped: clean.stripped,
      snapshotSanitized: snapshotWasSanitized(clean),
      snapshot: clean.snapshot,
    });

    // 8. Upload last, and take the object back if the row does not end up referencing it.
    let screenshotPath: string | null = null;
    // True only when this request stored the object; only then may it remove it again.
    let storedHere = false;
    if (processedBytes !== null) {
      const path = `${user.id}/${clean.id}.jpg`;
      if ((await deps.putScreenshot(path, processedBytes)) === 'exists') {
        // The path starts with the caller's own id, so the object is theirs: an earlier attempt that
        // uploaded but never inserted, or a concurrent request. A row owned by someone else still refuses.
        const now = await deps.findOwner(clean.id);
        if (now === user.id) return respond(200, { ok: true, id: clean.id, duplicate: true }, deps);
        if (now !== null) return fail(409, 'id-conflict', deps);
        // No row yet: finish the insert against the existing object (never overwritten, never removed here).
      } else {
        storedHere = true;
      }
      screenshotPath = path;
    }

    let outcome: 'inserted' | 'duplicate' | 'conflict';
    try {
      outcome = await deps.insert({
        id: clean.id,
        userId: user.id,
        category: clean.category,
        message: clean.message,
        snapshot: clean.snapshot,
        screenshotPath,
        riskFlags,
      });
    } catch (err) {
      // The insert may have committed before the error (lost response) or a concurrent request by this same
      // user may have inserted a row on the shared path. Remove only when this request stored the object and
      // no row exists for the id; if the lookup fails too, keep it: the orphan sweep collects it after a day.
      if (storedHere && screenshotPath !== null) {
        let owner: string | null | undefined;
        try {
          owner = await deps.findOwner(clean.id);
        } catch {
          owner = undefined;
        }
        if (owner === null) await removeQuietly(deps, screenshotPath);
      }
      throw err;
    }
    // On 'duplicate' keep the object: the path is fixed per user and id, so a row by this same user
    // (a concurrent request that inserted first) may reference it; the orphan sweep collects it otherwise.
    if (outcome === 'conflict' && storedHere && screenshotPath !== null) await removeQuietly(deps, screenshotPath);
    if (outcome === 'conflict') return fail(409, 'id-conflict', deps);
    return respond(200, { ok: true, id: clean.id, duplicate: outcome === 'duplicate' }, deps);
  } catch (err) {
    // Detail goes to the server log only.
    deps.log?.('internal-error', { name: err instanceof Error ? err.name : 'unknown' });
    return fail(500, 'internal-error', deps);
  }
}

async function removeQuietly(deps: Deps, path: string): Promise<void> {
  try {
    await deps.removeScreenshot(path);
  } catch {
    deps.log?.('orphan-cleanup-failed');
  }
}

function snapshotWasSanitized(c: CleanFeedback): boolean {
  const f = c.snapshotFlags;
  return wasStripped(f.stripped) || f.truncatedStrings > 0 || f.droppedKeys > 0 || f.droppedValues > 0 || f.depthExceeded || f.keyLimitHit;
}

/** True when the headers alone say the body must not be read. */
function declaredLengthRefused(req: Request): boolean {
  const cl = req.headers.get('content-length');
  if (cl !== null) {
    if (!/^\d{1,12}$/u.test(cl.trim())) return true;
    return Number(cl) > MAX_BODY_BYTES;
  }
  return !/\bchunked\b/iu.test(req.headers.get('transfer-encoding') ?? '');
}

const MAX_BODY_READS = 4096;
const INITIAL_BODY_BUFFER = 65_536;

const MIN_BYOB_READ = 4096;

/** Reads at most `max` bytes as text. Null on overrun, 'timeout' when the sender is too slow. */
async function readBounded(req: Request, max: number, timeoutMs: number): Promise<string | null | 'timeout'> {
  const bytes = await readBodyBytes(req, max, timeoutMs);
  return bytes === null || bytes === 'timeout' ? bytes : new TextDecoder().decode(bytes);
}

/**
 * Reads at most `max` bytes within `timeoutMs`. Null on overrun (bytes or read count), 'timeout' when the sender is too slow.
 * Each chunk is copied into one buffer and the read view dropped at once: on Deno a 1-byte read is a view over a
 * 64 KB ArrayBuffer, so keeping views would pin 64 KB per read.
 * Exported for the integrity tests.
 */
export async function readBodyBytes(req: Request, max: number, timeoutMs: number): Promise<Uint8Array | null | 'timeout'> {
  if (!req.body) return new Uint8Array(0);
  // A BYOB reader lands bytes straight in our buffer, so a flood of tiny reads allocates nothing per read. Streams that
  // are not byte streams (tests, other runtimes) refuse it and use the default reader.
  let byob: ReadableStreamBYOBReader | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | ReadableStreamBYOBReader;
  try {
    byob = req.body.getReader({ mode: 'byob' });
    reader = byob;
  } catch {
    reader = req.body.getReader();
  }
  // Never size the buffer from the declared length: a sender can declare a large body and then stall.
  let buf = new Uint8Array(Math.min(INITIAL_BODY_BUFFER, max));
  // Deno.serve hangs a BYOB read into a view of 3 bytes or fewer on chunked bodies, so every BYOB read gets at least
  // MIN_BYOB_READ bytes of room: the main buffer when it has that much, this scratch view when it does not.
  let scratch: Uint8Array | null = null;
  let total = 0;
  let timedOut = false;
  const grow = (need: number) => {
    const grown = new Uint8Array(Math.min(max, Math.max(buf.length * 2, need)));
    grown.set(buf.subarray(0, total));
    buf = grown;
  };
  // One timer for the whole body. Cancelling resolves a pending read as done; it is not awaited, so a stalled sender cannot hold us.
  const timer = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => undefined);
  }, timeoutMs);
  try {
    for (let reads = 0; ; reads++) {
      if (reads >= MAX_BODY_READS) {
        reader.cancel().catch(() => undefined);
        return null;
      }
      if (byob) {
        // Grow before the room gets small, so the scratch path only runs once the buffer is at the cap.
        if (buf.length - total < MIN_BYOB_READ && buf.length < max) grow(total + MIN_BYOB_READ);
        const room = buf.length - total;
        const direct = room >= MIN_BYOB_READ;
        const view: Uint8Array = direct ? new Uint8Array(buf.buffer, total, room) : (scratch ??= new Uint8Array(MIN_BYOB_READ));
        // Reading transfers the underlying buffer, so the view that comes back replaces the one handed in.
        const next = await byob.read(view);
        if (timedOut) return 'timeout';
        const got = next.value;
        if (got) {
          if (direct) buf = new Uint8Array(got.buffer as ArrayBuffer);
          else scratch = new Uint8Array(got.buffer as ArrayBuffer);
        }
        if (next.done) break;
        const n = got ? got.byteLength : 0;
        if (direct) {
          total += n;
        } else {
          // Only the cap's last bytes fit; anything beyond them is over the limit.
          if (n > room) {
            reader.cancel().catch(() => undefined);
            return null;
          }
          buf.set((scratch as Uint8Array).subarray(0, n), total);
          total += n;
        }
        continue;
      }
      const next = await (reader as ReadableStreamDefaultReader<Uint8Array>).read();
      if (timedOut) return 'timeout';
      if (next.done) break;
      const chunk = next.value;
      if (total + chunk.length > max) {
        reader.cancel().catch(() => undefined);
        return null;
      }
      if (total + chunk.length > buf.length) grow(total + chunk.length);
      buf.set(chunk, total);
      total += chunk.length;
    }
  } finally {
    clearTimeout(timer);
  }
  return buf.slice(0, total);
}

type Processed = { ok: true; bytes: Uint8Array } | { ok: false; status: number; error: string };

async function processScreenshot(clean: CleanFeedback, deps: Deps): Promise<Processed> {
  const shot = clean.screenshot as string;
  if (!shot.startsWith(DATA_URL_PREFIX)) return { ok: false, status: 400, error: 'invalid-screenshot' };
  if (shot.length - DATA_URL_PREFIX.length > MAX_SCREENSHOT_BASE64_CHARS) return { ok: false, status: 413, error: 'screenshot-too-large' };
  const bytes = decodeBase64(shot.slice(DATA_URL_PREFIX.length));
  if (bytes === null || !hasJpegMagic(bytes)) return { ok: false, status: 400, error: 'invalid-screenshot' };
  if (bytes.length > MAX_SCREENSHOT_BYTES) return { ok: false, status: 413, error: 'screenshot-too-large' };
  // Strict pre-parse: anything it cannot account for byte by byte never reaches the decoder.
  const info = inspectJpeg(bytes);
  if (info === null) return { ok: false, status: 400, error: 'invalid-screenshot' };
  if (info.width > MAX_SCREENSHOT_WIDTH || info.height > MAX_SCREENSHOT_HEIGHT || info.width * info.height > MAX_SCREENSHOT_PIXELS) return { ok: false, status: 413, error: 'screenshot-too-large' };
  try {
    const out = await deps.reencodeJpeg(bytes);
    if (!hasJpegMagic(out) || out.length > MAX_SCREENSHOT_BYTES * 2) return { ok: false, status: 400, error: 'invalid-screenshot' };
    return { ok: true, bytes: out };
  } catch {
    return { ok: false, status: 400, error: 'invalid-screenshot' };
  }
}
