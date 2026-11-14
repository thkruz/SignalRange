/**
 * Shared feedback rules. Pure TypeScript: no DOM, no browser globals, no Node-only APIs and no
 * imports, so the client and a Deno Edge Function run identical code.
 */

export type FeedbackTier = 'player' | 'developer';

export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'content', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const TIER_LIMITS = {
  player: { maxChars: 4_000, maxLines: 200, maxSnapshotBytes: 256 * 1024 },
  developer: { maxChars: 10_000, maxLines: 1_000, maxSnapshotBytes: 2 * 1024 * 1024 },
} as const;

export const SNAPSHOT_LIMITS = { maxDepth: 8, maxKeys: 2_000, maxStringChars: 500, maxKeyChars: 100 } as const;

/** Inputs longer than this multiple of the tier limit are rejected before any scanning. */
const EARLY_REJECT_FACTOR = 8;
const MAX_SCREENSHOT_CHARS = 3_000_000;

export interface StripCounts {
  controls: number;
  bidi: number;
  zeroWidth: number;
  tags: number;
  variationSelectors: number;
  surrogates: number;
  blankLinesCollapsed: number;
}

export type TextRejection = 'not-a-string' | 'empty' | 'too-long' | 'too-many-lines';

export type TextResult = { ok: true; text: string; stripped: StripCounts } | { ok: false; reason: TextRejection; stripped: StripCounts };

const emptyCounts = (): StripCounts => ({ controls: 0, bidi: 0, zeroWidth: 0, tags: 0, variationSelectors: 0, surrogates: 0, blankLinesCollapsed: 0 });

// C0 (except \t=09 and \n=0A) and C1 controls, plus DEL.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;
const BIDI = /[\u202A-\u202E\u2066-\u2069]/gu;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/gu;
const TAGS = /[\u{E0000}-\u{E007F}]/gu;
// A single variation selector after an emoji is legitimate; runs are a smuggling channel.
const VARIATION_RUNS = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]{2,}/gu;
// With the u flag, only unpaired surrogates match this class.
const LONE_SURROGATES = /[\uD800-\uDFFF]/gu;
const BLANK_LINE_RUNS = /\n(?:[ \t]*\n){3,}/gu;
const LINE_ENDINGS = /\r\n?/gu;

function stripAll(input: string, re: RegExp): { text: string; count: number } {
  let count = 0;
  const text = input.replace(re, (match) => {
    count += Array.from(match).length;
    return '';
  });
  return { text, count };
}

function cleanCore(input: string, counts: StripCounts): string {
  let text = input.replace(LINE_ENDINGS, '\n').normalize('NFC');
  let r = stripAll(text, LONE_SURROGATES);
  text = r.text;
  counts.surrogates += r.count;
  r = stripAll(text, CONTROLS);
  text = r.text;
  counts.controls += r.count;
  r = stripAll(text, BIDI);
  text = r.text;
  counts.bidi += r.count;
  r = stripAll(text, ZERO_WIDTH);
  text = r.text;
  counts.zeroWidth += r.count;
  r = stripAll(text, TAGS);
  text = r.text;
  counts.tags += r.count;
  r = stripAll(text, VARIATION_RUNS);
  text = r.text;
  counts.variationSelectors += r.count;
  return text;
}

/** True when anything was removed, so the server can set a risk flag. */
export function wasStripped(counts: StripCounts): boolean {
  return Object.values(counts).some((n) => n > 0);
}

export function sanitizeText(input: unknown, tier: FeedbackTier): TextResult {
  const stripped = emptyCounts();
  if (typeof input !== 'string') return { ok: false, reason: 'not-a-string', stripped };
  const limits = TIER_LIMITS[tier];
  if (input.length > limits.maxChars * EARLY_REJECT_FACTOR) return { ok: false, reason: 'too-long', stripped };
  let text = cleanCore(input, stripped);
  text = text.replace(BLANK_LINE_RUNS, () => {
    stripped.blankLinesCollapsed += 1;
    return '\n\n';
  });
  text = text.trim();
  if (text.length === 0) return { ok: false, reason: 'empty', stripped };
  if (text.length > limits.maxChars) return { ok: false, reason: 'too-long', stripped };
  if (text.split('\n').length > limits.maxLines) return { ok: false, reason: 'too-many-lines', stripped };
  return { ok: true, text, stripped };
}

// ---------------------------------------------------------------- field validators

export const ROUTE_PATTERN = /^\/[a-z0-9/-]{0,128}$/u;
export const SEMVER_PATTERN = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,64})?(?:\+[0-9A-Za-z.-]{1,64})?$/u;
export const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/iu;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const isFeedbackCategory = (v: unknown): v is FeedbackCategory => typeof v === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(v);
export const isValidRoute = (v: unknown): v is string => typeof v === 'string' && v.length <= 129 && ROUTE_PATTERN.test(v);
export const isValidVersion = (v: unknown): v is string => typeof v === 'string' && v.length <= 140 && SEMVER_PATTERN.test(v);
export const isValidCommit = (v: unknown): v is string => typeof v === 'string' && COMMIT_PATTERN.test(v);
export const isValidSubmissionId = (v: unknown): v is string => typeof v === 'string' && UUID_PATTERN.test(v);

export interface FeedbackDeps {
  isRegisteredScenario(id: string): boolean;
}

export const isValidScenarioId = (v: unknown, deps: FeedbackDeps): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && deps.isRegisteredScenario(v);

// ---------------------------------------------------------------- snapshot rebuild

export interface SnapshotFlags {
  stripped: StripCounts;
  truncatedStrings: number;
  droppedKeys: number;
  droppedValues: number;
  depthExceeded: boolean;
  keyLimitHit: boolean;
}

export interface CleanSnapshot {
  capturedAt?: string;
  version?: string;
  commit?: string;
  route?: string;
  scenarioId?: string | null;
  viewport?: { width: number; height: number; pixelRatio: number };
  screen?: { dialogs: string[]; tabs: string[] };
  clock?: { runMs: number; scenarioMs: number; speed: number };
  gameState?: unknown;
  screenshotCapture?: { status: string; renderer: string; stage: string; reason: string; message: string };
}

export type SnapshotResult = { ok: true; snapshot: CleanSnapshot; flags: SnapshotFlags } | { ok: false; reason: 'not-an-object' | 'too-large'; flags: SnapshotFlags };

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** UTF-8 byte length without TextEncoder or Buffer. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

class Rebuilder {
  keys = 0;
  readonly flags: SnapshotFlags = {
    stripped: emptyCounts(),
    truncatedStrings: 0,
    droppedKeys: 0,
    droppedValues: 0,
    depthExceeded: false,
    keyLimitHit: false,
  };

  str(v: string): string {
    // Bound the work first: a huge string never reaches the regexes.
    const cap = SNAPSHOT_LIMITS.maxStringChars * 4;
    let s = v.length > cap ? v.slice(0, cap) : v;
    s = cleanCore(s, this.flags.stripped).trim();
    if (s.length > SNAPSHOT_LIMITS.maxStringChars || v.length > cap) {
      this.flags.truncatedStrings += 1;
      // Slicing can split a surrogate pair; remove any half left behind.
      s = s.slice(0, SNAPSHOT_LIMITS.maxStringChars).replace(LONE_SURROGATES, '');
    }
    return s;
  }

  key(k: string): string | null {
    if (FORBIDDEN_KEYS.has(k) || k.length === 0 || k.length > SNAPSHOT_LIMITS.maxKeyChars) return null;
    return cleanCore(k, emptyCounts()) === k ? k : null;
  }

  /** Returns undefined when the value is dropped. */
  value(v: unknown, depth: number): unknown {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) return v;
      this.flags.droppedValues += 1;
      return undefined;
    }
    if (typeof v === 'string') return this.str(v);
    if (typeof v !== 'object') {
      this.flags.droppedValues += 1;
      return undefined;
    }
    if (depth >= SNAPSHOT_LIMITS.maxDepth) {
      this.flags.depthExceeded = true;
      this.flags.droppedValues += 1;
      return undefined;
    }
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      for (const element of v) {
        if (this.keys >= SNAPSHOT_LIMITS.maxKeys) {
          this.flags.keyLimitHit = true;
          break;
        }
        this.keys += 1;
        const item = this.value(element, depth + 1);
        if (item !== undefined) out.push(item);
      }
      return out;
    }
    const source = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(source)) {
      const safe = this.key(k);
      if (safe === null) {
        this.flags.droppedKeys += 1;
        continue;
      }
      if (this.keys >= SNAPSHOT_LIMITS.maxKeys) {
        this.flags.keyLimitHit = true;
        break;
      }
      this.keys += 1;
      const item = this.value(source[k], depth + 1);
      if (item !== undefined) out[safe] = item;
    }
    return out;
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function stringList(rb: Rebuilder, v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v.slice(0, 50)) if (typeof item === 'string') out.push(rb.str(item));
  return out;
}

function numberGroup<K extends string>(v: unknown, names: readonly K[]): Record<K, number> | undefined {
  if (!isRecord(v)) return undefined;
  const out = {} as Record<K, number>;
  for (const n of names) {
    const x = v[n];
    if (!finite(x)) return undefined;
    out[n] = x;
  }
  return out;
}

/** Build a new snapshot key by key from an allowlist; never copies the input object. */
export function rebuildSnapshot(raw: unknown, tier: FeedbackTier): SnapshotResult {
  const rb = new Rebuilder();
  if (!isRecord(raw)) return { ok: false, reason: 'not-an-object', flags: rb.flags };
  const snap: CleanSnapshot = {};
  if (typeof raw.capturedAt === 'string') snap.capturedAt = rb.str(raw.capturedAt).slice(0, 40);
  if (isValidVersion(raw.version)) snap.version = raw.version;
  if (isValidCommit(raw.commit)) snap.commit = raw.commit;
  if (isValidRoute(raw.route)) snap.route = raw.route;
  if (raw.scenarioId === null) snap.scenarioId = null;
  else if (typeof raw.scenarioId === 'string' && raw.scenarioId.length <= 128) snap.scenarioId = rb.str(raw.scenarioId);
  const viewport = numberGroup(raw.viewport, ['width', 'height', 'pixelRatio'] as const);
  if (viewport) snap.viewport = viewport;
  const clock = numberGroup(raw.clock, ['runMs', 'scenarioMs', 'speed'] as const);
  if (clock) snap.clock = clock;
  if (isRecord(raw.screen)) snap.screen = { dialogs: stringList(rb, raw.screen.dialogs), tabs: stringList(rb, raw.screen.tabs) };
  if (isRecord(raw.screenshotCapture)) {
    const c = raw.screenshotCapture;
    const f = (x: unknown): string => (typeof x === 'string' ? rb.str(x).slice(0, 200) : '');
    snap.screenshotCapture = { status: f(c.status), renderer: f(c.renderer), stage: f(c.stage), reason: f(c.reason), message: f(c.message) };
  }
  if ('gameState' in raw) {
    const gs = rb.value(raw.gameState, 0);
    if (gs !== undefined) snap.gameState = gs;
  }
  if (utf8Length(JSON.stringify(snap)) > TIER_LIMITS[tier].maxSnapshotBytes) return { ok: false, reason: 'too-large', flags: rb.flags };
  return { ok: true, snapshot: snap, flags: rb.flags };
}

// ---------------------------------------------------------------- whole payload

export type ValidationReason =
  | 'payload-not-object'
  | 'invalid-id'
  | 'invalid-category'
  | 'message-not-a-string'
  | 'message-empty'
  | 'message-too-long'
  | 'message-too-many-lines'
  | 'snapshot-not-an-object'
  | 'snapshot-too-large'
  | 'invalid-route'
  | 'invalid-version'
  | 'invalid-commit'
  | 'unknown-scenario'
  | 'invalid-screenshot';

export interface CleanFeedback {
  id: string;
  category: FeedbackCategory;
  message: string;
  screenshot: string | null;
  snapshot: CleanSnapshot;
  /** Anything stripped or dropped; the server turns these into risk flags. */
  stripped: StripCounts;
  snapshotFlags: SnapshotFlags;
}

export type ValidationResult = { ok: true; value: CleanFeedback } | { ok: false; reasons: ValidationReason[] };

const MESSAGE_REASONS: Record<TextRejection, ValidationReason> = {
  'not-a-string': 'message-not-a-string',
  empty: 'message-empty',
  'too-long': 'message-too-long',
  'too-many-lines': 'message-too-many-lines',
};

export function validateFeedback(payload: unknown, tier: FeedbackTier, deps: FeedbackDeps): ValidationResult {
  if (!isRecord(payload)) return { ok: false, reasons: ['payload-not-object'] };
  const reasons: ValidationReason[] = [];
  if (!isValidSubmissionId(payload.id)) reasons.push('invalid-id');
  if (!isFeedbackCategory(payload.category)) reasons.push('invalid-category');
  const text = sanitizeText(payload.message, tier);
  if (text.ok === false) reasons.push(MESSAGE_REASONS[text.reason]);

  let screenshot: string | null = null;
  const shot = payload.screenshot;
  if (shot !== undefined && shot !== null) {
    if (typeof shot !== 'string' || shot.length > MAX_SCREENSHOT_CHARS || !shot.startsWith('data:image/jpeg;base64,')) reasons.push('invalid-screenshot');
    else screenshot = shot;
  }

  const snap = rebuildSnapshot(payload.snapshot, tier);
  if (snap.ok === false) reasons.push(snap.reason === 'too-large' ? 'snapshot-too-large' : 'snapshot-not-an-object');
  else {
    // Rebuild drops invalid fields silently; for a submission they are rejections.
    const raw = payload.snapshot as Record<string, unknown>;
    if (!isValidRoute(raw.route)) reasons.push('invalid-route');
    if (!isValidVersion(raw.version)) reasons.push('invalid-version');
    if (!isValidCommit(raw.commit)) reasons.push('invalid-commit');
    if (raw.scenarioId !== null && raw.scenarioId !== undefined && !isValidScenarioId(raw.scenarioId, deps)) reasons.push('unknown-scenario');
  }

  if (reasons.length > 0 || !text.ok || !snap.ok) return { ok: false, reasons };
  return {
    ok: true,
    value: {
      id: payload.id as string,
      category: payload.category as FeedbackCategory,
      message: text.text,
      screenshot,
      snapshot: snap.snapshot,
      stripped: text.stripped,
      snapshotFlags: snap.flags,
    },
  };
}
