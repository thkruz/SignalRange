/**
 * Scenario cards (Phase 35, Lane C). One 3:2 image per scenario from scripts/art/card-style.json.
 *
 *   node scripts/art/cards.mjs --campaign nats --scenario 14,21 --model gemini-3-pro-image --takes 2 --budget 1 [--dry]
 *   node scripts/art/cards.mjs --campaign nats-eu --scenario all --budget 3
 *   node scripts/art/cards.mjs --promote <sha prefix> --campaign nats --scenario 14 [--dry]
 *
 * --model takes a list (default: the first model in card-style.json); every model gets --takes images per scenario.
 * Takes: src/private/art/cards/<campaign>/<N>/<sha1>.png + .take.json. Ledger: src/private/art/ledger.jsonl.
 * Promote: resize/crop to 1536x1024 into public/assets/campaigns/<campaign>/<N>/card.png; the previous file is
 * moved to src/private/art/superseded/<campaign>/<N>/card-<timestamp>.png (nothing is ever deleted).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { makeArgs } from './lib/args.mjs';
import { ART, CAMPAIGN_ASSETS, STYLE_FILE, SUPERSEDED } from './lib/paths.mjs';
import { die, findTake, runJobs, supersede, writeEnsured } from './lib/run.mjs';
import { MODELS } from './lib/spend.mjs';

const TOOL = 'cards';
const A = makeArgs();
const style = JSON.parse(readFileSync(STYLE_FILE, 'utf8'));
const campaign = A.opt('--campaign');
if (!campaign || !Object.hasOwn(style.scenarios, campaign)) die(TOOL, `--campaign is required: ${Object.keys(style.scenarios).join(' | ')}`);
const all = Object.keys(style.scenarios[campaign]);
const scenarioArg = A.list('--scenario');
if (!scenarioArg?.length) die(TOOL, '--scenario <N | N,N | all> is required');
const scenarios = scenarioArg.includes('all') ? all : scenarioArg;
for (const n of scenarios) if (!Object.hasOwn(style.scenarios[campaign], n)) die(TOOL, `unknown scenario ${campaign}/${n} (1-${all.length})`);
const dry = A.has('--dry');

export function cardPrompt(c, n) {
  const s = style.scenarios[c][n];
  return [`Scenario card illustration: ${s.subject}`, `Lighting: ${s.lighting}.`, `Palette: ${style.$palette[c]}`, style.$style].join(' ');
}

const promote = A.opt('--promote');
if (promote) {
  if (scenarios.length !== 1) die(TOOL, '--promote needs exactly one --scenario');
  const n = scenarios[0];
  const src = findTake(TOOL, join(ART, 'cards', campaign, n), promote);
  const dest = join(CAMPAIGN_ASSETS, campaign, n, 'card.png');
  console.log(`cards: promote ${src} -> ${dest} (1536x1024, cover crop)`);
  if (dry) {
    console.log('dry run: nothing written.');
    process.exit(0);
  }
  const buf = await sharp(src).resize(1536, 1024, { fit: 'cover', position: 'centre' }).png().toBuffer();
  const old = supersede(dest, join(SUPERSEDED, campaign, n));
  writeEnsured(dest, buf);
  console.log(`cards: wrote ${dest}${old ? `; previous moved to ${old}` : ''}`);
  process.exit(0);
}

const models = A.list('--model') ?? [style.models[0]];
for (const m of models) if (!Object.hasOwn(MODELS, m)) die(TOOL, `unknown model ${m}; supported: ${Object.keys(MODELS).join(', ')}`);
const takes = Number(A.opt('--takes', '1'));
if (!Number.isInteger(takes) || takes < 1) die(TOOL, '--takes must be a positive integer');
if (!dry) {
  const todo = scenarios.filter((n) => /^TODO/u.test(style.scenarios[campaign][n].subject) || /^TODO/u.test(style.scenarios[campaign][n].lighting));
  if (todo.length) die(TOOL, `subject/lighting still TODO for ${campaign} ${todo.join(', ')}; fill card-style.json first`);
}

const jobs = [];
for (const n of scenarios) {
  for (const model of models) {
    for (let t = 1; t <= takes; t++) {
      jobs.push({
        kind: 'card',
        model,
        prompt: cardPrompt(campaign, n),
        aspectRatio: style.aspect ?? '3:2',
        references: [],
        refNames: [],
        outDir: join(ART, 'cards', campaign, n),
        meta: { campaign, scenario: Number(n), label: `${campaign}/${n} ${style.scenarios[campaign][n].title} take ${t}` },
      });
    }
  }
}
await runJobs(TOOL, jobs, { dry, budget: Number(A.opt('--budget')) });
