/**
 * Shared plumbing for the phase 19.1 reference cases.
 *
 * A reference case compares the engine to a published value (an ITU-R
 * Recommendation, a datasheet, a standard's table, a verification vector).
 * When the engine is known to deviate, the case names the deviation ID from
 * `docs/known-deviations.md` and runs as `it.fails`: it passes while the
 * engine is still wrong, and errors the day the model is fixed, so the doc and
 * the test move together. `deviations.test.ts` checks every cited ID exists
 * in the doc (by scanning these files for DEV-* literals).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

export const REFERENCE_DATA_DIR = resolve(__dirname, 'data');

/**
 * A reference case. With `deviation`, the engine is known not to meet the
 * reference yet: the case must fail, and names the ID that explains why.
 *
 * `REFERENCE_STRICT=1 npx vitest run test/reference` runs deviation cases as
 * ordinary tests, so each shows how far the engine is from the reference (and
 * that it fails on the assertion, not on a harness error).
 */
export function referenceCase(title: string, deviation: string | undefined, fn: () => void): void {
  if (deviation === undefined) {
    it(title, fn);
    return;
  }
  const strict = process.env.REFERENCE_STRICT === '1';
  (strict ? it : it.fails)(`${title} [${deviation}]`, fn);
}

/**
 * Parse one of the ITU validation CSVs: a header row of names, a row of units,
 * then numeric rows. Returns objects keyed by column name.
 */
export function readItuCsv(fileName: string): Array<Record<string, number>> {
  const lines = readFileSync(resolve(REFERENCE_DATA_DIR, fileName), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const names = lines[0].split(',').map((n) => n.trim());

  return lines.slice(2).map((line) => {
    const cells = line.split(',');
    const row: Record<string, number> = {};
    names.forEach((name, i) => {
      if (name !== '') {
        row[name] = Number(cells[i]);
      }
    });
    return row;
  });
}

/** Free-space path loss, dB, from first principles: 20 log10(4 pi d f / c). */
export function fsplDb(distanceKm: number, frequencyHz: number): number {
  return 20 * Math.log10((4 * Math.PI * distanceKm * 1e3 * frequencyHz) / 299_792_458);
}

/** Boltzmann's constant in dBW/K/Hz: 10 log10(1.380649e-23) */
export const BOLTZMANN_DBW = 10 * Math.log10(1.380649e-23);

/** Assert `actual` is within `relTol` (fraction, e.g. 0.05 = 5 %) of `expected`. */
export function expectWithinRel(actual: number, expected: number, relTol: number): void {
  expect(Math.abs(actual / expected - 1), `${actual} vs ${expected}`).toBeLessThanOrEqual(relTol);
}

/** Assert `actual` is within `absTol` of `expected`. */
export function expectWithinAbs(actual: number, expected: number, absTol: number): void {
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(absTol);
}
