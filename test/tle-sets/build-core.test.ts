import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGeoSet, buildStarlinkSet, type CatalogRecord, parseElements } from '../../scripts/tle-sets/build-core';
import type { TleSet } from '../../src/tle-sets/tle-set-types';
import { isValidTleLine, parseNoradId, validateTleSet } from '../../src/tle-sets/tle-set-validate';

const fixture = (name: string): TleSet => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const opts = { id: 't', title: 't', source: 'test', snapshotUtc: '2026-11-09T00:00:00.000Z' };
const asRecord = (m: { tle1: string; tle2: string; name: string }, type: number): CatalogRecord => ({ tle1: m.tle1, tle2: m.tle2, name: m.name, type });

describe('TLE helpers', () => {
  it('decodes plain and Alpha-5 catalog numbers', () => {
    expect(parseNoradId('1 25544U 98067A   26312.03955916  .00000481  00000+0  63481-3 0  9999')).toBe(25544);
    expect(parseNoradId('1 A0006U 26160F   26312.04168772  .00036874  00000+0  12468-2 0  9990')).toBe(100006);
    expect(parseNoradId('1 Z9999U 26160F   26312.04168772  .00036874  00000+0  12468-2 0  9990')).toBe(339999);
  });

  it('validates fixture TLE lines', () => {
    for (const m of fixture('geo-mini.json').members) {
      expect(isValidTleLine(m.tle1, 1)).toBe(true);
      expect(isValidTleLine(m.tle2, 2)).toBe(true);
    }
  });
});

describe('builders', () => {
  const starlinkMembers = fixture('starlink-mini.json').members;
  const geoMembers = fixture('geo-mini.json').members;

  it('keeps only Starlink payloads and groups them', () => {
    const records = [...starlinkMembers.map((m) => asRecord(m, 1)), ...geoMembers.map((m) => asRecord(m, 1))];
    const { set, report } = buildStarlinkSet(records, opts);

    expect(report.matched).toBe(set.members.length);
    expect(set.members.length).toBeGreaterThan(150);
    expect(set.members.every((m) => /^STARLINK/iu.test(m.name))).toBe(true);
    expect(() => validateTleSet(set, 't')).not.toThrow();
    expect(set.groups.reduce((s, g) => s + g.count, 0)).toBe(set.members.length);
  });

  it('applies the GEO belt filter and groups by object type', () => {
    const records = [...geoMembers.map((m, i) => asRecord(m, (i % 3) + 1)), ...starlinkMembers.map((m) => asRecord(m, 1))];
    const { set, report } = buildGeoSet(records, opts);

    expect(set.members.length).toBe(geoMembers.length);
    expect(report.droppedOffOrbit).toBe(starlinkMembers.length);
    expect(set.groups.map((g) => g.id).sort()).toEqual(['geo-debris', 'geo-payload', 'geo-rocket-body']);
    for (const m of set.members) {
      const el = parseElements(m.tle2);

      expect(el.meanMotionRevPerDay).toBeGreaterThanOrEqual(0.99);
      expect(el.meanMotionRevPerDay).toBeLessThanOrEqual(1.01);
      expect(el.eccentricity).toBeLessThan(0.01);
      expect(el.inclinationDeg).toBeLessThan(15);
    }
    expect(() => validateTleSet(set, 't')).not.toThrow();
  });

  it('drops element sets older than 30 days before the snapshot', () => {
    const records = geoMembers.map((m) => asRecord(m, 1));
    const { set, report } = buildGeoSet(records, { ...opts, snapshotUtc: '2027-06-01T00:00:00.000Z' });

    expect(set.members).toHaveLength(0);
    expect(report.droppedStale).toBe(geoMembers.length);
  });
});
