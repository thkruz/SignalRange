#!/usr/bin/env node
/**
 * Phase 45 B codemod: turn long literal waits into simAdvance() and (with --enable) opt a spec into the
 * test clock (e2e/utils/test-clock.ts).
 *
 *   node scripts/e2e/codemod-sim-advance.mjs [--enable] [--min=1000] [--dry] <file...>
 *
 * - `<recv>.waitForTimeout(N)` with a numeric literal N >= --min becomes `simAdvance(<recv>, N)`.
 *   Shorter waits are UI settle waits and stay as they are.
 * - Adds `simAdvance` (and with --enable `useTestClock`) to an import from the test-clock module.
 * - --enable, spec files only:
 *     imports `test` from fixtures/test-fixtures  -> `test.use({ testClock: true });` after the imports
 *     `<v> = await <ctx>.newPage();`              -> `await useTestClock(<v>);` on the next line
 *     otherwise                                   -> top-level `test.beforeEach(({ page }) => useTestClock(page))`
 * Idempotent: a second run changes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const enable = args.includes('--enable');
const dry = args.includes('--dry');
const minArg = args.find((a) => a.startsWith('--min='));
const minMs = minArg ? Number(minArg.slice(6)) : 1000;
const files = args.filter((a) => !a.startsWith('--'));

const CLOCK_MODULE = path.resolve('e2e/utils/test-clock');

function importPath(file) {
  let rel = path.relative(path.dirname(path.resolve(file)), CLOCK_MODULE).replaceAll('\\', '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function addImports(src, file, names) {
  const spec = importPath(file);
  const re = new RegExp(`import \\{([^}]*)\\} from '${spec.replaceAll('.', '\\.')}';`, 'u');
  const m = src.match(re);
  if (m) {
    const have = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const all = [...new Set([...have, ...names])].sort();
    return src.replace(re, `import { ${all.join(', ')} } from '${spec}';`);
  }
  const line = `import { ${[...names].sort().join(', ')} } from '${spec}';\n`;
  // after the last top-level import statement (imports may span lines)
  const importRe = /^import[\s\S]*?from\s+'[^']+';\n/gmu;
  let last = 0;
  for (const im of src.matchAll(importRe)) last = im.index + im[0].length;
  return src.slice(0, last) + line + src.slice(last);
}

function afterImportsIndex(src) {
  const importRe = /^import[\s\S]*?from\s+'[^']+';\n/gmu;
  let last = 0;
  for (const im of src.matchAll(importRe)) last = im.index + im[0].length;
  return last;
}

let changedFiles = 0;
let replaced = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let src = before;
  const names = new Set();
  let n = 0;
  src = src.replace(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\.waitForTimeout\((\d[\d_]*)\)/gu, (all, recv, lit) => {
    const ms = Number(lit.replaceAll('_', ''));
    if (ms < minMs) return all;
    n++;
    return `simAdvance(${recv}, ${lit})`;
  });
  if (n > 0) names.add('simAdvance');

  const isSpec = /\.spec\.ts$/u.test(file);
  if (enable && isSpec && !/useTestClock\(|testClock: true/u.test(src)) {
    if (/import \{[^}]*\btest\b[^}]*\} from '\.\.\/fixtures\/test-fixtures';/u.test(src)) {
      const at = afterImportsIndex(src);
      src = `${src.slice(0, at)}\ntest.use({ testClock: true });\n${src.slice(at)}`;
    } else if (/^(\s*)([\w$]+) = await [\w$.]+\.newPage\(\);$/mu.test(src)) {
      src = src.replace(/^(\s*)([\w$]+) = await [\w$.]+\.newPage\(\);$/gmu, (all, indent, v) => `${all}\n${indent}await useTestClock(${v});`);
      names.add('useTestClock');
    } else {
      const at = afterImportsIndex(src);
      src = `${src.slice(0, at)}\ntest.beforeEach(async ({ page }) => {\n  await useTestClock(page);\n});\n${src.slice(at)}`;
      names.add('useTestClock');
    }
  }

  if (names.size > 0) src = addImports(src, file, names);
  if (src !== before) {
    changedFiles++;
    replaced += n;
    if (!dry) fs.writeFileSync(file, src);
    console.log(`${file}: ${n} wait(s)${enable && isSpec ? ', clock on' : ''}`);
  }
}
console.log(`codemod: ${changedFiles} file(s), ${replaced} wait(s) -> simAdvance${dry ? ' (dry run)' : ''}`);
