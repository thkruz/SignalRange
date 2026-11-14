import type { StripCounts } from '../_shared/feedback-rules.ts';

/**
 * Risk flags mark rows for human review. They never reject a submission.
 * Every regex carries the u flag. Rules run on the stored text and on an NFKC-folded,
 * lowercased copy, so NBSP, fullwidth letters and repeated spaces cannot hide a phrase.
 * Words are separated by `\s+` for the same reason.
 */
const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  // Instruction-shaped only: the verb, optional determiners, a "previous" word and then an instruction noun
  // or the end of the sentence. "the override from the previous scenario" and "forget my previous frequency" pass.
  ['instruction-phrase', /(?:ignore|disregard|forget|override)\s+(?:(?:all|any|your|my|the|everything|these|those)\s+)*(?:(?:previous|prior|above|earlier|preceding|before)(?:\s+(?:instructions?|prompts?|rules?|messages?|directions?|directives?|commands?|orders?|guidelines?|context|conversation)\b|\s*(?:[.!?,;:]|$))|(?:everything|anything)\s+(?:above|before))|system\s+prompt|you\s+are\s+now|new\s+instructions/iu],
  ['role-marker', /^\W*(?:system|assistant|user|human)\W*:|<\|im_(?:start|end)\|>|\[\/?inst\]|<<\/?sys>>/imu],
  ['tool-name', /(?:execute|run)[\s_]sql|delete[\s_]feedback|apply[\s_]migration|(?:deploy|create|get)[\s_]edge[\s_]function|(?:merge|reset|rebase|delete|create)[\s_]branch|(?:restore|pause|create)[\s_]project|list[\s_]tables|tool[\s_]?(?:calls?|use)\b|function_?calls?\b|invoke[\s_]tool|\bgh\s|\brm\s+-|\bcurl\b|\bwget\b|\bsudo\b|\bpowershell\b|\bbash\b/iu],
  ['code-fence', /```|~~~/u],
  ['url', /\b(?:https?|ftp|file|data|javascript):\/?\/?[^\s]+|\bwww\.[^\s]+/iu],
  ['long-base64', /[A-Za-z0-9+/=]{200,}/u],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u],
  ['phone', /(?<![\d.])(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/u],
];

const MAX_FLAGS = 48;

export interface RiskInput {
  message: string;
  stripped: StripCounts;
  snapshotSanitized: boolean;
  /** The cleaned snapshot as stored. Every string in it, keys included, is scanned. */
  snapshot?: unknown;
}

const ASCII_ONLY = /^[\x00-\x7f]*$/u;
/** NFKC fold, done once per text. ASCII text needs none: every rule carries the i flag. */
const fold = (s: string): string => (ASCII_ONLY.test(s) ? s : s.normalize('NFKC').toLowerCase());
/** Folded copy with every run of non-letters and non-digits (hyphen, underscore, dots) as one space. */
const collapse = (folded: string): string => folded.replace(/[^\p{L}\p{N}]+/gu, ' ');
/** Rules that also run on the collapsed copy, so "ignore-previous" and "execute_sql" match. */
const COLLAPSED_RULES = new Set(['instruction-phrase', 'tool-name']);

/** The only rules the cross-field joins run: PII, URL and base64 rules gain nothing from a join. */
const JOIN_RULES: ReadonlyArray<readonly [string, RegExp]> = RULES.filter(([name]) => name === 'instruction-phrase' || name === 'tool-name' || name === 'role-marker');

const LATIN = /\p{Script=Latin}/u;
const OTHER_ALPHABET = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
/** Greek letters used as unit and maths symbols (μV, Δf, kΩ, λ/4, π, θ, Σ, Φ, Ψ): not homoglyph evidence. */
const UNIT_SYMBOLS = /[μµΔΩΩλπθΣΦΨ]/gu;
const WORD = /[\p{L}\p{M}]+/gu;
const COMBINING_ON_ASCII = /[A-Za-z]\p{M}/u;
/** A word mixing Latin with Cyrillic or Greek letters: a homoglyph substitution. */
function hasMixedScriptWord(text: string): boolean {
  if (!OTHER_ALPHABET.test(text)) return false;
  for (const m of text.matchAll(WORD)) {
    const word = m[0].replace(UNIT_SYMBOLS, '');
    if (LATIN.test(word) && OTHER_ALPHABET.test(word)) return true;
  }
  return false;
}

function matchRules(text: string, rules: ReadonlyArray<readonly [string, RegExp]> = RULES, perField = true): string[] {
  const folded = fold(text);
  const collapsed = collapse(folded);
  const hits: string[] = [];
  for (const [name, re] of rules) {
    if (re.test(text) || (folded !== text && re.test(folded)) || (COLLAPSED_RULES.has(name) && re.test(collapsed))) hits.push(name);
  }
  if (perField) {
    if (hasMixedScriptWord(text)) hits.push('mixed-script');
    if (COMBINING_ON_ASCII.test(text)) hits.push('combining-on-ascii');
  }
  return hits;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Every [field, text] pair stored in the snapshot. Field labels are fixed names (the rebuilt
 * snapshot only has allowlisted keys outside gameState), never attacker text, so a flag cannot
 * smuggle content into risk_flags. Inside gameState the labels are `gameState.key` and `gameState.value`.
 */
export function snapshotStrings(snapshot: unknown): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (!isRecord(snapshot)) return out;
  for (const [k, v] of Object.entries(snapshot)) {
    if (k === 'gameState') {
      const stack: unknown[] = [v];
      while (stack.length > 0) {
        const node = stack.pop();
        if (typeof node === 'string') out.push(['gameState.value', node]);
        else if (Array.isArray(node)) for (const item of node) stack.push(item);
        else if (isRecord(node)) {
          for (const [key, item] of Object.entries(node)) {
            out.push(['gameState.key', key]);
            stack.push(item);
          }
        }
      }
    } else if (typeof v === 'string') out.push([k, v]);
    else if (isRecord(v)) {
      for (const [sub, item] of Object.entries(v)) {
        if (typeof item === 'string') out.push([`${k}.${sub}`, item]);
        else if (Array.isArray(item)) for (const el of item) if (typeof el === 'string') out.push([`${k}.${sub}`, el]);
      }
    }
  }
  return out;
}

export function computeRiskFlags(input: RiskInput): string[] {
  const flags = new Set<string>();
  for (const name of matchRules(input.message)) flags.add(name);
  const strings = snapshotStrings(input.snapshot);
  for (const [field, text] of strings) {
    for (const name of matchRules(text)) if (flags.size < MAX_FLAGS) flags.add(`snapshot-${name}@${field}`);
  }
  // A phrase split across fields ("Ignore" / "previous instructions"): scan everything joined with spaces.
  // Two joins: everything, and the message plus free-text gameState values only (so fixed metadata
  // such as version and route cannot sit between the halves of a phrase).
  const joins = [
    [input.message, ...strings.map(([, text]) => text)].join(' '),
    [input.message, ...strings.filter(([field]) => field === 'gameState.value').map(([, text]) => text)].join(' '),
  ];
  for (const joined of joins) {
    for (const name of matchRules(joined, JOIN_RULES, false)) {
      const seen = flags.has(name) || [...flags].some((f) => f.startsWith(`snapshot-${name}@`));
      if (!seen && flags.size < MAX_FLAGS) flags.add(`cross-field-${name}`);
    }
  }
  const s = input.stripped;
  if (s.bidi + s.zeroWidth + s.tags + s.variationSelectors + s.controls + s.surrogates > 0) flags.add('hidden-characters');
  if (s.tags > 0) flags.add('unicode-tags');
  if (input.snapshotSanitized) flags.add('snapshot-sanitized');
  return [...flags];
}
