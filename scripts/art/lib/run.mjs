/** Shared generation loop, take lookup and supersede helpers for cards.mjs and avatars.mjs. */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import sharp from 'sharp';
import { loadApiKey } from './env.mjs';
import { generateImage, makeClient } from './gemini.mjs';
import { LEDGER } from './paths.mjs';
import { appendLedger, checkBudget, ledgerTotalUsd, modelInfo, readLedger, usageCostUsd } from './spend.mjs';

export function die(tool, msg) {
  console.error(`${tool}: ${msg}`);
  process.exit(1);
}

export const stamp = () => new Date().toISOString().replace(/[:.]/gu, '-');

/**
 * jobs: [{ kind, model, prompt, aspectRatio, references, refNames, outDir, meta }] (one per image).
 * Prints the plan, honours dry, enforces the budget, runs sequentially, stops on the first error.
 */
export async function runJobs(tool, jobs, { dry, budget }) {
  const items = [];
  for (const j of jobs) {
    const hit = items.find((i) => i.model === j.model);
    if (hit) hit.count++;
    else items.push({ model: j.model, count: 1 });
  }
  const guard = checkBudget({ items, budget });
  const before = ledgerTotalUsd(readLedger(LEDGER));
  console.log(`${tool}: ${jobs.length} image(s); estimate $${guard.estimate.toFixed(3)} (estimates); ledger so far $${before.toFixed(3)}`);
  if (dry) {
    for (const j of jobs) {
      const size = modelInfo(j.model).imageSize;
      const refs = j.references.length ? ` | ${j.references.length} reference image(s): ${j.refNames.join(', ')}` : '';
      console.log(`\n--- ${j.meta.label} | ${j.model} | ${j.aspectRatio}${size ? ` ${size}` : ''}${refs}\n${j.prompt}`);
    }
    console.log(`\ndry run: no calls made. Guard: ${guard.ok ? `OK within $${budget}` : guard.reason}`);
    return;
  }
  if (!guard.ok) die(tool, guard.reason);
  const key = loadApiKey();
  if (!key) die(tool, 'no GEMINI_API_KEY in the environment, signal-range .env or 05-games/hq/.env');
  const ai = makeClient(key.key);
  let spent = 0;
  for (const j of jobs) {
    const info = modelInfo(j.model);
    const base = { time: new Date().toISOString(), kind: j.kind, ...j.meta, model: j.model, aspectRatio: j.aspectRatio };
    let result;
    try {
      result = await generateImage(ai, { model: j.model, prompt: j.prompt, references: j.references, aspectRatio: j.aspectRatio, imageSize: info.imageSize ?? undefined });
    } catch (err) {
      appendLedger(LEDGER, { ...base, usd: info.priceUsdPerImage, usage: err.usage ?? null, error: String(err?.message ?? err).slice(0, 2000) });
      die(tool, `${j.meta.label}: ${err?.message ?? err} (stopped; nothing retried)`);
    }
    // The call is paid: record it first, so a local decode/write failure cannot hide the spend.
    appendLedger(LEDGER, { ...base, usd: info.priceUsdPerImage, usage: result.usage, usageCostUsd: usageCostUsd(result.usage, j.model) });
    let png;
    let meta;
    let sha1;
    try {
      png = await sharp(result.png).png().toBuffer();
      meta = await sharp(png).metadata();
      sha1 = createHash('sha1').update(png).digest('hex');
      mkdirSync(j.outDir, { recursive: true });
      const pngPath = join(j.outDir, `${sha1}.png`);
      const takePath = join(j.outDir, `${sha1}.take.json`);
      if (!existsSync(pngPath)) writeFileSync(pngPath, png);
      const take = { ...base, sha1, prompt: j.prompt, references: j.refNames, width: meta.width, height: meta.height, modelVersion: result.modelVersion, text: result.text };
      // identical bytes from a later call keep their own provenance instead of replacing the first take's
      writeFileSync(existsSync(takePath) ? join(j.outDir, `${sha1}.${stamp()}.take.json`) : takePath, `${JSON.stringify(take, null, 2)}\n`);
    } catch (err) {
      die(tool, `${j.meta.label}: paid call succeeded (ledger written) but saving failed: ${err?.message ?? err}`);
    }
    spent += info.priceUsdPerImage;
    console.log(`  ${j.meta.label}  ${j.model}  ${sha1.slice(0, 10)}  ${meta.width}x${meta.height}  $${info.priceUsdPerImage}`);
  }
  console.log(`${tool}: ${jobs.length} take(s), this run ~$${spent.toFixed(3)}; ledger total $${ledgerTotalUsd(readLedger(LEDGER)).toFixed(3)}`);
}

/** Find the single <sha prefix>.png in dir. */
export function findTake(tool, dir, prefix) {
  if (!existsSync(dir)) die(tool, `no takes in ${dir}`);
  const hits = readdirSync(dir).filter((f) => f.endsWith('.png') && f.startsWith(prefix));
  if (hits.length !== 1) die(tool, `${hits.length} take(s) match "${prefix}" in ${dir}`);
  return join(dir, hits[0]);
}

/** Move an existing target into supersededDir as <base>-<timestamp>.png (never deletes). Returns the new path or null. */
export function supersede(target, supersededDir) {
  if (!existsSync(target)) return null;
  mkdirSync(supersededDir, { recursive: true });
  const dest = join(supersededDir, `${basename(target, '.png')}-${stamp()}.png`);
  copyFileSync(target, dest); // copy, not move: the target stays until writeEnsured replaces it atomically
  return dest;
}

export function writeEnsured(dest, buf) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  writeFileSync(tmp, buf);
  renameSync(tmp, dest);
}
