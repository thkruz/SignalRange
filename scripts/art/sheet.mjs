/**
 * Contact sheet: a grid of images with the sha prefix printed under each cell.
 *
 *   node scripts/art/sheet.mjs --out sheet.png --cols 4 --cell 512 a.png b.png c.png
 *   node scripts/art/sheet.mjs --out sheet.png --cols 4 --cell 512 --glob "src/private/art/cards/nats/14/*.png"
 *
 * Cells keep the order given on the command line (positional files first, then --glob matches in glob order);
 * nothing is re-sorted by name. The order used is printed, one line per cell, left to right then top to bottom.
 * Rows are computed from the image count. The cell is a square of --cell px (default 512, images fit inside it);
 * the label is the file name's first 8 characters (the sha prefix) plus the parent folder name.
 */
import { globSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { makeArgs } from './lib/args.mjs';

const A = makeArgs();
const out = A.opt('--out');
if (!out) {
  console.error('sheet: --out <file.png> is required');
  process.exit(1);
}
const cols = Number(A.opt('--cols', '4'));
const cell = Number(A.opt('--cell', '512'));
const labelH = 36;
const flagsWithValue = new Set(['--out', '--cols', '--cell', '--glob']);
const positional = [];
for (let i = 0; i < A.argv.length; i++) {
  if (flagsWithValue.has(A.argv[i])) i++;
  else if (!A.argv[i].startsWith('--')) positional.push(A.argv[i]);
}
const globs = A.opt('--glob') ? globSync(A.opt('--glob')).filter((f) => /\.(png|jpe?g|webp)$/iu.test(f)) : [];
const files = [...positional, ...globs].map((f) => resolve(f));
if (!files.length) {
  console.error('sheet: no input images');
  process.exit(1);
}
if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(cell) || cell < 64) {
  console.error('sheet: --cols must be >= 1 and --cell >= 64');
  process.exit(1);
}
if (files.includes(resolve(out)) || !/.png$/iu.test(out)) {
  console.error('sheet: --out must be a .png and must not be one of the input images');
  process.exit(1);
}
files.forEach((f, i) => console.log(`sheet: cell ${i + 1} (row ${Math.floor(i / cols) + 1}, col ${(i % cols) + 1}) = ${f}`));
const rows = Math.ceil(files.length / cols);
const esc = (s) => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;');
const tiles = [];
for (let i = 0; i < files.length; i++) {
  const x = (i % cols) * cell;
  const y = Math.floor(i / cols) * (cell + labelH);
  const img = await sharp(files[i]).resize(cell, cell, { fit: 'contain', background: '#202020' }).png().toBuffer();
  const name = basename(files[i]).replace(/\.[^.]+$/u, '');
  const label = `${name.slice(0, 8)}  ${basename(dirname(files[i]))}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${labelH}"><rect width="100%" height="100%" fill="#101010"/><text x="8" y="24" font-family="sans-serif" font-size="18" fill="#e0e0e0">${esc(label)}</text></svg>`;
  tiles.push({ input: img, left: x, top: y }, { input: Buffer.from(svg), left: x, top: y + cell });
}
await sharp({ create: { width: cols * cell, height: rows * (cell + labelH), channels: 3, background: '#101010' } })
  .composite(tiles)
  .png()
  .toFile(resolve(out));
console.log(`sheet: ${files.length} image(s), ${cols}x${rows} at ${cell}px -> ${resolve(out)}`);
