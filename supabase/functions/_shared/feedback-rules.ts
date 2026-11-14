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
// Invisible and format characters: every default-ignorable and format (Cf) code point, the bidi
// controls, the Hangul fillers and the whole tag/plane-14 block. Variation selectors and ZWJ are in
// this class too; the callback below keeps the few legitimate emoji uses.
const INVISIBLES = /[\p{Bidi_Control}\p{Default_Ignorable_Code_Point}\p{Cf}\u115F\u1160\u3164\uFFA0\u{E0000}-\u{E0FFF}]/gu;
const BIDI_ONE = /^\p{Bidi_Control}$/u;
const TAG_ONE = /^[\u{E0000}-\u{E0FFF}]$/u;
const VS_ONE = /^[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]$/u;
const PICTO_ONE = /^\p{Extended_Pictographic}$/u;
const KEYCAP_BASE = /^[#*0-9]$/u;
// With the u flag, only unpaired surrogates match this class.
const LONE_SURROGATES = /[\uD800-\uDFFF]/gu;
const BLANK_LINE_RUNS = /\n(?:[\p{Zs}\t]*\n){3,}/gu;
const LINE_ENDINGS = /\r\n?|[\u2028\u2029]/gu;

function stripAll(input: string, re: RegExp): { text: string; count: number } {
  let count = 0;
  const text = input.replace(re, (match) => {
    count += Array.from(match).length;
    return '';
  });
  return { text, count };
}

/** Code point that ends just before index i ('' at the start). Input has no lone surrogates. */
function cpBefore(s: string, i: number): string {
  if (i <= 0) return '';
  const low = s.charCodeAt(i - 1);
  if (low >= 0xdc00 && low <= 0xdfff && i >= 2) return s.slice(i - 2, i);
  return s.slice(i - 1, i);
}

/** Code point that starts at index i ('' at the end). */
function cpAt(s: string, i: number): string {
  if (i >= s.length) return '';
  const cp = s.codePointAt(i) as number;
  return String.fromCodePoint(cp);
}

function stripInvisibles(input: string, counts: StripCounts): string {
  return input.replace(INVISIBLES, (ch, offset: number, whole: string) => {
    const before = cpBefore(whole, offset);
    if (ch === '\uFE0F' || ch === '\uFE0E') {
      if (PICTO_ONE.test(before)) return ch;
      if (ch === '\uFE0F' && KEYCAP_BASE.test(before) && cpAt(whole, offset + 1) === '\u20E3') return ch;
    } else if (ch === '\u200D') {
      let prev = before;
      if (prev === '\uFE0F' || prev === '\uFE0E') prev = cpBefore(whole, offset - 1);
      if (PICTO_ONE.test(prev) && PICTO_ONE.test(cpAt(whole, offset + 1))) return ch;
    }
    if (VS_ONE.test(ch)) counts.variationSelectors += 1;
    else if (BIDI_ONE.test(ch)) counts.bidi += 1;
    else if (TAG_ONE.test(ch)) counts.tags += 1;
    else counts.zeroWidth += 1;
    return '';
  });
}

/** Cut to at most max UTF-16 units without leaving half of a surrogate pair. */
function safeSlice(s: string, max: number): string {
  if (s.length <= max) return s;
  let end = max;
  const last = s.charCodeAt(end - 1);
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  return s.slice(0, end);
}

function cleanCore(input: string, counts: StripCounts): string {
  let text = input.replace(LINE_ENDINGS, '\n').normalize('NFC');
  let r = stripAll(text, LONE_SURROGATES);
  text = r.text;
  counts.surrogates += r.count;
  r = stripAll(text, CONTROLS);
  text = r.text;
  counts.controls += r.count;
  text = stripInvisibles(text, counts);
  // Stripping can unblock a composition (e + ZWSP + U+0301), so normalise again.
  return text.normalize('NFC');
}

/** True when a hostile or invisible character was removed (blank-line collapsing is only formatting). */
export function wasStripped(counts: StripCounts): boolean {
  return Object.entries(counts).some(([name, n]) => name !== 'blankLinesCollapsed' && n > 0);
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

export const ROUTE_PATTERN = /^(?!.*\/\/)\/[a-z0-9/-]{0,128}$/u;
export const SEMVER_PATTERN = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,64})?(?:\+[0-9A-Za-z.-]{1,64})?$/u;
export const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/iu;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const CAPTURED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
export const SCREENSHOT_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/u;

export const isFeedbackCategory = (v: unknown): v is FeedbackCategory => typeof v === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(v);
export const isValidRoute = (v: unknown): v is string => typeof v === 'string' && v.length <= 129 && ROUTE_PATTERN.test(v);
export const isValidVersion = (v: unknown): v is string => typeof v === 'string' && v.length <= 140 && SEMVER_PATTERN.test(v);
export const isValidCapturedAt = (v: unknown): v is string => typeof v === 'string' && v.length <= 24 && CAPTURED_AT_PATTERN.test(v) && !Number.isNaN(Date.parse(v));
export const isValidCommit = (v: unknown): v is string => typeof v === 'string' && COMMIT_PATTERN.test(v);
export const isValidSubmissionId = (v: unknown): v is string => typeof v === 'string' && UUID_PATTERN.test(v);

export interface FeedbackDeps {
  /** Must be an own-property check (Set.has or Object.hasOwn), never `id in registry`: 'constructor' and '__proto__' are not scenarios. */
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

/** Visited keys (valid or dropped) allowed per snapshot, as a multiple of maxKeys. */
const KEY_VISIT_FACTOR = 4;

class Rebuilder {
  keys = 0;
  visited = 0;
  readonly flags: SnapshotFlags = {
    stripped: emptyCounts(),
    truncatedStrings: 0,
    droppedKeys: 0,
    droppedValues: 0,
    depthExceeded: false,
    keyLimitHit: false,
  };

  str(v: string, maxChars: number = SNAPSHOT_LIMITS.maxStringChars): string {
    // Bound the work first: a huge string never reaches the regexes.
    const cap = maxChars * 4;
    let s = v.length > cap ? safeSlice(v, cap) : v;
    s = cleanCore(s, this.flags.stripped).trim();
    if (s.length > maxChars || v.length > cap) {
      this.flags.truncatedStrings += 1;
      s = safeSlice(s, maxChars);
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
      // Dropped keys cost scan time too, so every visited key counts against a budget.
      this.visited += 1;
      if (this.visited > SNAPSHOT_LIMITS.maxKeys * KEY_VISIT_FACTOR) {
        this.flags.keyLimitHit = true;
        break;
      }
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
  if (isValidCapturedAt(raw.capturedAt)) snap.capturedAt = raw.capturedAt;
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
    const f = (x: unknown): string => (typeof x === 'string' ? rb.str(x, 200) : '');
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
    if (typeof shot !== 'string' || shot.length > MAX_SCREENSHOT_CHARS || !SCREENSHOT_PATTERN.test(shot)) reasons.push('invalid-screenshot');
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
