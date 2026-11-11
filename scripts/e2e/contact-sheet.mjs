#!/usr/bin/env node
/**
 * Contact sheet: tile every PNG/JPG in a folder into one JPEG with a filename caption under each tile.
 *
 *   node scripts/e2e/contact-sheet.mjs --in art-review/gallery --out art-review/gallery/sheet.jpg \
 *     [--cols 2] [--tile 800] [--max 1700] [--q 80] [--filter "radio-*"]
 *
 * --tile is the tile width in px (height follows 16:10), --max caps the longer side of the final sheet
 * (the sheet is scaled down to fit, so it can be read in one image view), --q is the JPEG quality,
 * --filter is a glob on the file name without extension (* and ? only). Requires `sharp` (a dev dependency).
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = { cols: 2, tile: 800, max: 1700, q: 80, filter: '*' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/u, '');
    const value = argv[i + 1];
    if (!key || value === undefined) throw new Error(`Missing value for ${argv[i]}`);
    args[key] = ['cols', 'tile', 'max', 'q'].includes(key) ? Number(value) : value;
  }
  if (!args.in || !args.out) throw new Error('Usage: contact-sheet.mjs --in <dir> --out <file.jpg> [--cols 2 --tile 800 --max 1700 --q 80 --filter <glob>]');

  return args;
}

const escapeXml = (s) => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;');

function globToRegExp(glob) {
  const body = glob.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*').replace(/\?/gu, '.');

  return new RegExp(`^${body}$`, 'u');
}

const args = parseArgs(process.argv.slice(2));
const dir = resolve(args.in);
const outPath = resolve(args.out);
const match = globToRegExp(args.filter);
const files = readdirSync(dir)
  .filter((f) => /\.(png|jpe?g)$/iu.test(f) && match.test(basename(f, extname(f))) && resolve(dir, f) !== outPath)
  .sort();
if (files.length === 0) throw new Error(`No images in ${dir} matching ${args.filter}`);

const CAPTION = 26;
const GAP = 8;
const tileH = Math.round((args.tile * 10) / 16);
const rows = Math.ceil(files.length / args.cols);
const width = args.cols * args.tile + (args.cols + 1) * GAP;
const height = rows * (tileH + CAPTION) + (rows + 1) * GAP;

const layers = await Promise.all(
  files.map(async (file, i) => {
    const left = GAP + (i % args.cols) * (args.tile + GAP);
    const top = GAP + Math.floor(i / args.cols) * (tileH + CAPTION + GAP);
    const image = await sharp(join(dir, file)).resize(args.tile, tileH, { fit: 'contain', background: '#000' }).toBuffer();
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${args.tile}" height="${CAPTION}"><text x="4" y="18" font-family="Arial,sans-serif" font-size="16" fill="#e8eef5">${escapeXml(basename(file, extname(file)))}</text></svg>`
    );

    return [
      { input: image, left, top },
      { input: label, left, top: top + tileH },
    ];
  })
);

mkdirSync(dirname(outPath), { recursive: true });
let sheet = sharp({ create: { width, height, channels: 3, background: '#1b2128' } }).composite(layers.flat());
const longer = Math.max(width, height);
if (longer > args.max) {
  const scaled = await sheet.png().toBuffer();
  sheet = sharp(scaled).resize({ width: width >= height ? args.max : undefined, height: height > width ? args.max : undefined });
}
await sheet.jpeg({ quality: args.q }).toFile(outPath);
console.log(`contact-sheet: ${files.length} tiles, ${args.cols} cols -> ${outPath}`);
