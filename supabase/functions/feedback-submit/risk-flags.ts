import type { StripCounts } from '../_shared/feedback-rules.ts';

/**
 * Risk flags mark rows for human review. They never reject a submission.
 * Every regex carries the u flag.
 */
const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ['instruction-phrase', /ignore (?:all |any )?(?:previous|prior|above)|system prompt|you are now|disregard (?:the |all )?(?:previous|prior|above)|new instructions/iu],
  ['role-marker', /(?:^|\n)\s*(?:assistant|system|user|human)\s*:/iu],
  ['tool-name', /execute_sql|\bgh\s|\brm\s+-|\bcurl\b|\bwget\b|\bsudo\b|\bpowershell\b|\bbash\b/iu],
  ['code-fence', /```|~~~/u],
  ['url', /\b(?:https?|ftp|file|data|javascript):\/?\/?[^\s]+|\bwww\.[^\s]+/iu],
  ['long-base64', /[A-Za-z0-9+/=]{200,}/u],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u],
  ['phone', /(?<![\d.])(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/u],
];

export interface RiskInput {
  message: string;
  stripped: StripCounts;
  snapshotSanitized: boolean;
}

export function computeRiskFlags(input: RiskInput): string[] {
  const flags: string[] = [];
  for (const [name, re] of RULES) if (re.test(input.message)) flags.push(name);
  const s = input.stripped;
  if (s.bidi + s.zeroWidth + s.tags + s.variationSelectors + s.controls + s.surrogates > 0) flags.push('hidden-characters');
  if (s.tags > 0) flags.push('unicode-tags');
  if (input.snapshotSanitized) flags.push('snapshot-sanitized');
  return flags;
}
