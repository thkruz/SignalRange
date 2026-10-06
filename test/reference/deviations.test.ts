/**
 * The deviations doc and the reference cases move together (phase 19.1).
 * Every DEV-* ID a reference case cites must be listed in
 * docs/known-deviations.md, IDs are unique, and each has a status.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOC = readFileSync(resolve(__dirname, '../../docs/known-deviations.md'), 'utf8');
const ID = /DEV-[A-Z]+-\d+/gu;

/** Table rows of the doc: ID -> status */
const ROWS = new Map<string, string>();
const duplicates: string[] = [];
for (const line of DOC.split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length > 3 && /^DEV-[A-Z]+-\d+$/u.test(cells[1])) {
    if (ROWS.has(cells[1])) duplicates.push(cells[1]);
    ROWS.set(cells[1], cells[2]);
  }
}

const cited = new Set<string>();
for (const file of readdirSync(__dirname).filter((f) => f.endsWith('.reference.test.ts'))) {
  for (const match of readFileSync(resolve(__dirname, file), 'utf8').matchAll(ID)) {
    cited.add(match[0]);
  }
}

describe('docs/known-deviations.md', () => {
  it('lists every deviation a reference case cites', () => {
    expect([...cited].filter((id) => !ROWS.has(id))).toEqual([]);
  });

  it('has unique IDs', () => {
    expect(duplicates).toEqual([]);
  });

  it('gives each entry a status of open or kept', () => {
    expect([...ROWS].filter(([, status]) => status !== 'open' && status !== 'kept').map(([id]) => id)).toEqual([]);
  });

  it('has entries (the table parser found the rows)', () => {
    expect(ROWS.size).toBeGreaterThan(30);
  });
});
