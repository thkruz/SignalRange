#!/usr/bin/env node
/**
 * Builds the public Campaign 3 quiz data from the private course material.
 * The OSS build never reads src/private at runtime; run this to regenerate
 * the committed copies:
 *   src/campaigns/ham-sdr/quiz/technician-pool.json
 *   src/campaigns/ham-sdr/quiz/c3-quiz-items.json
 *   public/assets/campaigns/home-sdr/figures/figure-T*.jpg
 * Exits non-zero when counts do not match.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src/private/course-material/technician-2026-2030');
const outDir = join(root, 'src/campaigns/ham-sdr/quiz');
const figDir = join(root, 'public/assets/campaigns/home-sdr/figures');

const fail = (msg) => {
  console.error(`build-c3-quiz-data: ${msg}`);
  process.exit(1);
};

if (!existsSync(srcDir)) fail(`missing ${srcDir} (private submodule not checked out)`);

const pool = JSON.parse(readFileSync(join(srcDir, 'pool.json'), 'utf8'));
const design = JSON.parse(readFileSync(join(srcDir, 'quiz-design.json'), 'utf8'));
const revision = pool.revision;
const idx = (letter) => 'ABCD'.indexOf(letter);

const poolItems = pool.questions.map((q) => ({
  id: q.id,
  group: q.group,
  revision,
  stem: q.question,
  options: q.options,
  correctIndex: idx(q.answer),
  figure: q.figure ?? null,
}));

const poolById = new Map(poolItems.map((q) => [q.id, q]));
const groups = new Set(poolItems.map((q) => q.group));

const items = [];
for (const sc of design.scenarios) {
  for (const it of sc.items) {
    const official = it.kind === 'official';
    const officialId = official ? it.id : (it.relatedOfficialIds?.[0] ?? null);
    if (official) {
      const p = poolById.get(it.id);
      if (!p) fail(`design item ${it.localId} references unknown pool id ${it.id}`);
      if (p.stem !== it.question || JSON.stringify(p.options) !== JSON.stringify(it.options) || p.correctIndex !== idx(it.answer)) {
        fail(`design item ${it.localId} differs from pool item ${it.id}`);
      }
    }
    items.push({
      localId: it.localId,
      scenario: sc.scenario,
      checkpoint: it.checkpoint,
      kind: it.kind,
      officialId,
      ...(it.relatedOfficialIds ? { relatedOfficialIds: it.relatedOfficialIds } : {}),
      group: official ? it.group : (officialId ? poolById.get(officialId)?.group ?? null : null),
      stem: it.question,
      options: it.options,
      correctIndex: idx(it.answer),
      explanation: it.explanation,
      figure: it.figure ?? null,
    });
  }
}

const officialUnique = new Set(items.filter((i) => i.kind === 'official').map((i) => i.officialId));
const checks = [
  [poolItems.length, 409, 'pool items'],
  [groups.size, 35, 'groups'],
  [items.length, 120, 'scenario items'],
  [officialUnique.size, 96, 'unique official scenario items'],
];
for (const [got, want, label] of checks) if (got !== want) fail(`${label}: got ${got}, expected ${want}`);
if (poolItems.some((q) => q.correctIndex < 0 || q.options.length !== 4)) fail('pool item with bad answer/options');

mkdirSync(outDir, { recursive: true });
mkdirSync(figDir, { recursive: true });
writeFileSync(join(outDir, 'technician-pool.json'), `${JSON.stringify({ source: pool.source, revision, questions: poolItems }, null, 2)}\n`);
writeFileSync(join(outDir, 'c3-quiz-items.json'), `${JSON.stringify({ revision, items }, null, 2)}\n`);
for (const f of new Set(poolItems.map((q) => q.figure).filter(Boolean))) copyFileSync(join(srcDir, f), join(figDir, f));

console.log(`build-c3-quiz-data: ok (${poolItems.length} pool, ${groups.size} groups, ${items.length} items, ${officialUnique.size} official unique)`);
