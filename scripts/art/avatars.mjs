/**
 * Character avatars (Phase 35, Lane D). Expressions derived from an existing portrait, or a brand-new base.
 *
 *   node scripts/art/avatars.mjs --character james-okafor --emotion sad,angry --takes 2 --budget 1 [--model M] [--dry]
 *   node scripts/art/avatars.mjs --character francis-martin --base --desc "<casting description>" --ref a.png,b.png --takes 3 --budget 1
 *   (--expression-line "<text>" replaces the bare emotion word in the prompt, for retakes)
 *   node scripts/art/avatars.mjs --promote <sha> --character james-okafor --emotion sad [--dry]
 *   node scripts/art/avatars.mjs --promote <sha> --character francis-martin --base [--dry]
 *
 * Expression reference: public/assets/characters/<slug>.png. Takes: src/private/art/avatars/<slug>/<emotion|base>/<sha1>.png.
 * Promote of an emotion writes public/assets/characters/<slug>-<emotion>.png (neutral writes <slug>-neutral.png).
 * Emotion promotes recolour the take's near-white background to the base portrait's corner-median colour
 * (flood fill from the source's own corner colour within --bg-tol, default 12, or pure white for near-white sources; 1-px feather; --no-bg-match disables; stats go to <sha>.bg.json beside the untouched take).
 * Promote with --base writes <slug>.png and the identical <slug>-neutral.png copy. Replaced files move to
 * src/private/art/superseded/avatars/<slug>/ (never deleted).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';
import { makeArgs } from './lib/args.mjs';
import { ART, CHARACTERS, SUPERSEDED } from './lib/paths.mjs';
import { die, findTake, runJobs, supersede, writeEnsured } from './lib/run.mjs';
import { MODELS } from './lib/spend.mjs';

const TOOL = 'avatars';
export const EMOTIONS = ['angry', 'concerned', 'confident', 'excited', 'frustrated', 'happy', 'neutral', 'sad', 'skeptical', 'surprised'];
const SIZE = 1024;
const WHITE_MIN = 245; // channel floor for "pure white" background pixels
const PATCH = 16;
const BG_TOL = 12; // max per-channel delta from the source's own corner colour counted as background

/** Median background colour of the four 16x16 corner patches of a raw RGBA buffer. */
function cornerMedian(data, w, h) {
  const px = [[], [], []];
  for (const [x0, y0] of [
    [0, 0],
    [w - PATCH, 0],
    [0, h - PATCH],
    [w - PATCH, h - PATCH],
  ]) {
    for (let y = y0; y < y0 + PATCH; y++) {
      for (let x = x0; x < x0 + PATCH; x++) for (let c = 0; c < 3; c++) px[c].push(data[(y * w + x) * 4 + c]);
    }
  }
  return px.map((a) => a.sort((m, n) => m - n)[a.length >> 1]);
}

/**
 * Recolour the near-white background of a take to the base portrait's flat background colour.
 * Flood fill from the four corners through pixels with every channel >= WHITE_MIN, then blend the 1-px ring
 * of neighbours toward the fill colour in proportion to how white they are (removes the white halo).
 */
async function matchBackground(takeFile, size, tol = BG_TOL) {
  const baseFile = join(CHARACTERS, `${slug}.png`);
  const b = await sharp(baseFile).resize(size, size, { fit: 'cover' }).ensureAlpha().raw().toBuffer();
  const fill = cornerMedian(b, size, size);
  const { data, info } = await sharp(takeFile).resize(size, size, { fit: 'cover', position: 'centre' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const seed = cornerMedian(data, w, h);
  const seedWhite = seed.every((v) => v >= WHITE_MIN);
  const dist = (i) => Math.max(Math.abs(data[i] - seed[0]), Math.abs(data[i + 1] - seed[1]), Math.abs(data[i + 2] - seed[2]));
  // Near-white sources keep the original pure-white rule; tinted or warm sources flood within tol of their own corner colour.
  const isWhite = (i) => (seedWhite ? data[i] >= WHITE_MIN && data[i + 1] >= WHITE_MIN && data[i + 2] >= WHITE_MIN : dist(i) <= tol);
  const mask = new Uint8Array(w * h);
  const stack = [];
  for (const [x, y] of [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ]) {
    if (!mask[y * w + x] && isWhite((y * w + x) * 4)) {
      mask[y * w + x] = 1;
      stack.push(y * w + x);
    }
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p - x) / w;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (!mask[q] && isWhite(q * 4)) {
        mask[q] = 1;
        stack.push(q);
      }
    }
  }
  let filled = 0;
  const ring = [];
  for (let p = 0; p < w * h; p++) {
    if (mask[p]) {
      filled++;
      continue;
    }
    const x = p % w;
    const y = (p - x) / w;
    if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w])) ring.push(p);
  }
  for (let p = 0; p < w * h; p++) if (mask[p]) for (let c = 0; c < 3; c++) data[p * 4 + c] = fill[c];
  for (const p of ring) {
    const m = Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    const t = seedWhite ? Math.max(0, Math.min(1, (m - 200) / (WHITE_MIN - 200))) : Math.max(0, Math.min(1, (2 * tol - dist(p * 4)) / tol));
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.round(data[p * 4 + c] * (1 - t) + fill[c] * t);
  }
  const out = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
  return { out, fill, seed, seedWhite, filledPct: Number(((100 * filled) / (w * h)).toFixed(2)), ringPx: ring.length };
}

const A = makeArgs();
const slug = A.opt('--character');
if (!slug || !/^[a-z0-9-]+$/u.test(slug)) die(TOOL, '--character <slug> is required (e.g. james-okafor)');
const dry = A.has('--dry');
const base = A.has('--base');
const emotions = A.list('--emotion') === null ? [] : A.list('--emotion').includes('all') ? EMOTIONS : A.list('--emotion');
for (const e of emotions) if (!EMOTIONS.includes(e)) die(TOOL, `unknown emotion ${e}; supported: ${EMOTIONS.join(', ')}`);

const promote = A.opt('--promote');
if (promote) {
  if (base === emotions.length > 0 || emotions.length > 1) die(TOOL, '--promote needs exactly one of --base or a single --emotion');
  const group = base ? 'base' : emotions[0];
  const src = findTake(TOOL, join(ART, 'avatars', slug, group), promote);
  const targets = base ? [`${slug}.png`, `${slug}-neutral.png`] : [`${slug}-${group}.png`];
  console.log(`avatars: promote ${src} -> ${targets.join(' + ')} (${SIZE}x${SIZE})`);
  if (dry) {
    console.log('dry run: nothing written.');
    process.exit(0);
  }
  let buf;
  if (!base && !A.has('--no-bg-match')) {
    const r = await matchBackground(src, SIZE, Number(A.opt('--bg-tol') ?? BG_TOL));
    console.log(`avatars: bg match seed ${r.seed.join(',')} -> fill ${r.fill.join(',')}, ${r.filledPct}% filled`);
    buf = r.out;
    const stats = { source: basename(src), fill: r.fill, filledPct: r.filledPct, feathered1pxRing: r.ringPx, whiteMinChannel: WHITE_MIN, seed: r.seed, seedWhite: r.seedWhite };
    writeFileSync(
      src.replace(/\.png$/u, '.bg.json'),
      `${JSON.stringify(stats, null, 2)}
`
    );
    console.log(`avatars: background match fill rgb(${r.fill.join(',')}) filled ${r.filledPct}% (+${r.ringPx} feathered px)`);
  } else {
    buf = await sharp(src).resize(SIZE, SIZE, { fit: 'cover', position: 'centre' }).png().toBuffer();
  }
  for (const t of targets) {
    const dest = join(CHARACTERS, t);
    const old = supersede(dest, join(SUPERSEDED, 'avatars', slug));
    writeEnsured(dest, buf);
    console.log(`avatars: wrote ${dest}${old ? `; previous moved to ${old}` : ''}`);
  }
  process.exit(0);
}

const models = A.list('--model') ?? ['gemini-2.5-flash-image'];
for (const m of models) if (!Object.hasOwn(MODELS, m)) die(TOOL, `unknown model ${m}; supported: ${Object.keys(MODELS).join(', ')}`);
const takes = Number(A.opt('--takes', '1'));
if (!Number.isInteger(takes) || takes < 1) die(TOOL, '--takes must be a positive integer');
const png = (p) => ({ data: readFileSync(p), mimeType: 'image/png' });

const jobs = [];
if (base) {
  const desc = A.opt('--desc');
  if (!desc) die(TOOL, '--base needs --desc "<casting description>"');
  const refPaths = (A.list('--ref') ?? []).map((p) => resolve(p));
  const prompt = [
    'Illustrated character portrait in the style of the attached reference portraits (GTA-V-style illustrated portrait, realistic proportions with mild stylization,',
    'sharp defined eyes, bold expressive eyebrows, stubble as short strokes, intentional shading).',
    'Head and shoulders, 1024 x 1024, neutral relaxed expression, looking at the camera, pure white (#FFFFFF) background, no props, no gradients, no text.',
    refPaths.length
      ? 'The attached images are style references only: match their illustration style, framing and lighting. Do not copy their faces; this is a different person.'
      : '',
    `The person: ${desc}`,
  ]
    .filter(Boolean)
    .join(' ');
  for (const model of models) {
    for (let t = 1; t <= takes; t++) {
      jobs.push({
        kind: 'avatar-base',
        model,
        prompt,
        aspectRatio: '1:1',
        references: refPaths.map(png),
        refNames: refPaths.map((p) => basename(p)),
        outDir: join(ART, 'avatars', slug, 'base'),
        meta: { character: slug, emotion: 'base', label: `${slug}/base take ${t}` },
      });
    }
  }
} else {
  if (!emotions.length) die(TOOL, '--emotion <e | e,e | all> is required (or --base, or --promote)');
  const refFile = join(CHARACTERS, `${slug}.png`);
  let ref;
  try {
    ref = png(refFile);
  } catch {
    die(TOOL, `reference portrait missing: ${refFile}`);
  }
  const exprLine = A.opt('--expression-line');
  for (const emotion of emotions) {
    const prompt = `same person, same framing, same lighting, flat warm off-white background exactly like the reference base portrait, not pure white, untextured, only the expression changes: ${exprLine ?? emotion}`;
    for (const model of models) {
      for (let t = 1; t <= takes; t++) {
        jobs.push({
          kind: 'avatar',
          model,
          prompt,
          aspectRatio: '1:1',
          references: [ref],
          refNames: [`${slug}.png`],
          outDir: join(ART, 'avatars', slug, emotion),
          meta: { character: slug, emotion, label: `${slug}/${emotion} take ${t}` },
        });
      }
    }
  }
}
await runJobs(TOOL, jobs, { dry, budget: Number(A.opt('--budget')) });
