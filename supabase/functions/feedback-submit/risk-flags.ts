import type { StripCounts } from '../_shared/feedback-rules.ts';

/**
 * Risk flags mark rows for human review. They never reject a submission.
 * Every regex carries the u flag. Rules run on the stored text and on an NFKC-folded,
 * lowercased copy, so NBSP, fullwidth letters and repeated spaces cannot hide a phrase.
 * Words are separated by `\s+` for the same reason.
 */
const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ['instruction-phrase', /ignore\s+(?:(?:all|any)\s+)?(?:the\s+)?(?:previous|prior|above)|system\s+prompt|you\s+are\s+now|disregard\s+(?:(?:the|all)\s+)*(?:previous|prior|above)|new\s+instructions/iu],
  ['role-marker', /^\W*(?:system|assistant|user|human)\W*:|<\|im_(?:start|end)\|>|\[\/?inst\]|<<\/?sys>>/imu],
  ['tool-name', /execute_sql|\bgh\s|\brm\s+-|\bcurl\b|\bwget\b|\bsudo\b|\bpowershell\b|\bbash\b/iu],
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

const fold = (s: string): string => s.normalize('NFKC').toLowerCase();

function matchRules(text: string): string[] {
  const folded = fold(text);
  const hits: string[] = [];
  for (const [name, re] of RULES) if (re.test(text) || (folded !== text && re.test(folded))) hits.push(name);
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
  for (const [field, text] of snapshotStrings(input.snapshot)) {
    for (const name of matchRules(text)) if (flags.size < MAX_FLAGS) flags.add(`snapshot-${name}@${field}`);
  }
  const s = input.stripped;
  if (s.bidi + s.zeroWidth + s.tags + s.variationSelectors + s.controls + s.surrogates > 0) flags.add('hidden-characters');
  if (s.tags > 0) flags.add('unicode-tags');
  if (input.snapshotSanitized) flags.add('snapshot-sanitized');
  return [...flags];
}
