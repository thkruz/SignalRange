/**
 * Guards NIST NICE annotations across all campaigns:
 *   - every `nice: [...]` code is in the checked-in catalog
 *     (scripts/nice-catalog.json) — this would have caught the off-catalog
 *     K0108 that shipped in the signal-hunter sandbox,
 *   - every code is well-formed (letter + 4 digits),
 *   - the product still claims a healthy distinct-code count.
 *
 * The catalog is regenerated from the nist-nice-reviewer skill reference files
 * by scripts/gen-nice-catalog.mjs; scripts/nice-coverage.mjs prints the full
 * coverage table. This test enforces the same off-catalog rule in CI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const campaignsDir = join(repoRoot, 'src', 'campaigns');
const catalog = JSON.parse(
  readFileSync(join(repoRoot, 'scripts', 'nice-catalog.json'), 'utf8'),
) as { count: number; codes: string[] };
const validCodes = new Set(catalog.codes);

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

interface Claim {
  code: string;
  campaign: string;
  file: string;
  line: number;
}

function extractClaims(): Claim[] {
  const niceArray = /nice:\s*\[([^\]]*)\]/g;
  const codeRe = /['"]([A-Z]\d{4})['"]/g;
  const claims: Claim[] = [];
  for (const file of walkTs(campaignsDir)) {
    const rel = file.slice(repoRoot.length + 1).replace(/\\/g, '/');
    const campaign = rel.split('/')[2] ?? '(root)';
    const text = readFileSync(file, 'utf8');
    let arr: RegExpExecArray | null;
    while ((arr = niceArray.exec(text)) !== null) {
      const line = text.slice(0, arr.index).split('\n').length;
      let code: RegExpExecArray | null;
      codeRe.lastIndex = 0;
      while ((code = codeRe.exec(arr[1])) !== null) {
        claims.push({ code: code[1], campaign, file: rel, line });
      }
    }
  }
  return claims;
}

describe('NICE coverage', () => {
  const claims = extractClaims();

  it('finds NICE annotations across campaigns', () => {
    expect(claims.length).toBeGreaterThan(100);
  });

  it('claims only in-catalog codes (would have caught K0108)', () => {
    const offCatalog = claims.filter((c) => !validCodes.has(c.code));
    const report = offCatalog.map((c) => `${c.code} @ ${c.file}:${c.line}`);
    expect(report, `off-catalog codes:\n${report.join('\n')}`).toEqual([]);
  });

  it('uses well-formed code ids (letter + 4 digits)', () => {
    const malformed = claims.filter((c) => !/^[KST]\d{4}$/.test(c.code));
    expect(malformed.map((c) => `${c.code} @ ${c.file}:${c.line}`)).toEqual([]);
  });

  it('maintains a healthy distinct in-catalog code count product-wide', () => {
    const distinct = new Set(claims.map((c) => c.code).filter((c) => validCodes.has(c)));
    // Campaign 1 alone claims ~45 distinct codes; this is a regression floor.
    expect(distinct.size).toBeGreaterThanOrEqual(40);
  });
});
