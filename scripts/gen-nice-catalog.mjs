/**
 * Generate scripts/nice-catalog.json — the checked-in list of valid NIST NICE
 * codes this product may claim — from the nist-nice-reviewer skill reference
 * files (`.claude/skills/nist-nice-reviewer/references/*.txt`).
 *
 * The reference .txt files are the authoritative source but live under the
 * gitignored `.claude/` tree, so CI can't see them. This script snapshots the
 * valid-code set into a repo-tracked JSON that scripts/nice-coverage.mjs and
 * test/campaigns/nice-coverage.test.ts read.
 *
 * Run from the repo root after editing the reference files:
 *   node scripts/gen-nice-catalog.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const refDir = join(repoRoot, '.claude', 'skills', 'nist-nice-reviewer', 'references');

const codeLine = /^([KST]\d{4})\t/;
const codes = new Set();
const byRole = {};

for (const file of readdirSync(refDir).filter((f) => f.endsWith('.txt'))) {
  const role = file.replace(/\.txt$/, '');
  byRole[role] = [];
  for (const line of readFileSync(join(refDir, file), 'utf8').split(/\r?\n/)) {
    const match = codeLine.exec(line);
    if (match) {
      codes.add(match[1]);
      byRole[role].push(match[1]);
    }
  }
}

const sorted = [...codes].sort((a, b) => a.localeCompare(b));
const payload = {
  _comment:
    'Valid NIST NICE (2024 components) codes this product may claim. Generated ' +
    'from the gitignored nist-nice-reviewer skill reference files via ' +
    'scripts/gen-nice-catalog.mjs. Consumed by scripts/nice-coverage.mjs and ' +
    'test/campaigns/nice-coverage.test.ts. Do not edit by hand.',
  count: sorted.length,
  roles: Object.fromEntries(
    Object.entries(byRole).map(([role, list]) => [role, list.length]),
  ),
  codes: sorted,
};

writeFileSync(join(scriptsDir, 'nice-catalog.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote scripts/nice-catalog.json: ${sorted.length} codes across ${Object.keys(byRole).length} role files.`);
