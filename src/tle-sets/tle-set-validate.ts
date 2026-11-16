import { TLE_SET_FORMAT, type TleSet } from './tle-set-types';

/** Modulo-10 checksum of the first 68 characters of a TLE line (digits count, '-' counts 1). */
export function tleLineChecksum(line: string): number {
  let sum = 0;

  for (let i = 0; i < 68; i++) {
    const c = line.charCodeAt(i);

    if (c >= 48 && c <= 57) {
      sum += c - 48;
    } else if (c === 45) {
      sum += 1;
    }
  }

  return sum % 10;
}

/** True when the line is 69 characters long and its last digit matches the checksum. */
export function isValidTleLine(line: string, lineNumber: 1 | 2): boolean {
  return typeof line === 'string' && line.length === 69 && line.charAt(0) === String(lineNumber) && Number(line.charAt(68)) === tleLineChecksum(line);
}

/** Decode the catalog number from TLE line 1, including Alpha-5 ids such as "A0006" (= 100006). */
export function parseNoradId(tle1: string): number {
  const field = tle1.slice(2, 7).trim();

  if (/^\d+$/u.test(field)) {
    return Number(field);
  }
  const first = field.charAt(0).toUpperCase();
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const idx = letters.indexOf(first);

  if (idx < 0 || !/^\d{4}$/u.test(field.slice(1))) {
    return Number.NaN;
  }

  return (10 + idx) * 10000 + Number(field.slice(1));
}

/** Element-set epoch of a TLE line 1 as a UTC Date. */
export function tleEpochDate(tle1: string): Date {
  const yy = Number(tle1.slice(18, 20));
  const doy = Number(tle1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;

  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86_400_000);
}

/**
 * Throw if `data` is not a well-formed sr-tle-set/1 document. Checks the format tag, id, group
 * references and counts, unique NORAD ids, and the TLE line checksums of every member.
 */
export function validateTleSet(data: unknown, expectedId?: string): TleSet {
  const fail = (msg: string): never => {
    throw new Error(`Invalid TLE set${expectedId ? ` "${expectedId}"` : ''}: ${msg}`);
  };

  if (typeof data !== 'object' || data === null) {
    return fail('not an object');
  }
  const set = data as TleSet;

  if (set.format !== TLE_SET_FORMAT) {
    fail(`format is ${JSON.stringify(set.format)}, expected ${TLE_SET_FORMAT}`);
  }
  if (typeof set.id !== 'string' || set.id === '') {
    fail('missing id');
  }
  if (expectedId !== undefined && set.id !== expectedId) {
    fail(`id mismatch (document says "${set.id}")`);
  }
  if (typeof set.epoch !== 'string' || Number.isNaN(Date.parse(set.epoch))) {
    fail('epoch is not an ISO date');
  }
  if (typeof set.source !== 'string') {
    fail('missing source');
  }
  if (!Array.isArray(set.groups) || !Array.isArray(set.members)) {
    return fail('groups and members must be arrays');
  }

  const groupCounts = new Map<string, number>();

  for (const g of set.groups) {
    if (typeof g?.id !== 'string' || groupCounts.has(g.id)) {
      fail(`bad or duplicate group id ${JSON.stringify(g?.id)}`);
    }
    groupCounts.set(g.id, 0);
  }

  const seen = new Set<number>();

  for (const m of set.members) {
    if (!Number.isInteger(m?.noradId) || seen.has(m.noradId)) {
      fail(`bad or duplicate noradId ${JSON.stringify(m?.noradId)}`);
    }
    seen.add(m.noradId);
    if (!isValidTleLine(m.tle1, 1) || !isValidTleLine(m.tle2, 2)) {
      fail(`bad TLE or checksum for NORAD ${m.noradId}`);
    }
    if (parseNoradId(m.tle1) !== m.noradId) {
      fail(`NORAD ${m.noradId} does not match its TLE`);
    }
    if (!groupCounts.has(m.group)) {
      fail(`NORAD ${m.noradId} references unknown group ${JSON.stringify(m.group)}`);
    }
    groupCounts.set(m.group, (groupCounts.get(m.group) ?? 0) + 1);
  }
  for (const g of set.groups) {
    if (g.count !== groupCounts.get(g.id)) {
      fail(`group ${g.id} declares ${g.count} members but has ${groupCounts.get(g.id)}`);
    }
  }
  if (set.count !== undefined && set.count !== set.members.length) {
    fail(`count ${set.count} does not match ${set.members.length} members`);
  }

  return set;
}
