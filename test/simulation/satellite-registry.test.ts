import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { SatelliteRegistry } from '@app/simulation/satellite-registry';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';
import { generateSyntheticTles } from '../../scripts/tle-sets/synth';

const observer = { name: 'T', lat: 30 as Degrees, lon: -100 as Degrees, alt: 0 as Kilometers };

function makeSet(n: number): TleSet {
  const tles = generateSyntheticTles({ count: n, seed: 1, epoch: '2026-11-09' });
  const shells = [...new Set(tles.map((t) => t.shell))];
  return {
    format: 'sr-tle-set/1',
    id: 'test-set',
    epoch: '2026-11-09',
    source: 'synthetic',
    groups: shells.map((id) => ({ id, label: id, count: tles.filter((t) => t.shell === id).length })),
    members: tles.map((t) => ({ noradId: t.noradId, name: t.name, tle1: t.tle1, tle2: t.tle2, group: t.shell })),
  };
}

function authoredSat(norad: number, base: TleSet): OrbitalSatellite {
  const m = base.members[0];
  return new OrbitalSatellite('AUTH', norad, [], [], { tle1: m.tle1 as TleLine1, tle2: m.tle2 as TleLine2, observer });
}

describe('SatelliteRegistry', () => {
  const set = makeSet(50);
  const first = set.members[0].noradId;
  const second = set.members[1].noradId;

  it('keeps authored satellites hydrated and returns them from get()', () => {
    const a = authoredSat(99001, set);
    const reg = new SatelliteRegistry([a], { observer });
    expect(reg.get(99001)).toBe(a);
    expect(reg.hydrated).toEqual([a]);
    expect(reg.isOperated(99001)).toBe(true);
    expect(reg.get(12345)).toBeUndefined();
  });

  it('adds members without hydrating them and hydrates on get()', () => {
    const reg = new SatelliteRegistry([], { observer });
    expect(reg.addConstellation(set, { tleSet: set.id })).toBe(50);
    expect(reg.memberCount).toBe(50);
    expect(reg.hydratedMemberCount).toBe(0);
    expect(reg.ref(first)?.isHydrated).toBe(false);
    const sat = reg.get(first);
    expect(sat).toBeInstanceOf(OrbitalSatellite);
    expect(reg.get(first)).toBe(sat);
    expect(reg.ref(first)?.isHydrated).toBe(true);
    expect(reg.hydrated).toContain(sat);
    expect(reg.peek(second)).toBeUndefined();
  });

  it('looks members up by NORAD and by group', () => {
    const reg = new SatelliteRegistry([], { observer });
    reg.addConstellation(set, { tleSet: set.id });
    expect(reg.ref(first)?.name).toBe(set.members[0].name);
    const g = set.groups[0];
    expect(reg.inGroup(g.id)).toHaveLength(g.count);
    expect(reg.ref(1)).toBeUndefined();
  });

  it('applies include and exclude filters', () => {
    const reg = new SatelliteRegistry([], { observer });
    const n = reg.addConstellation(set, { tleSet: set.id, include: { norad: [first, second] }, exclude: { norad: [second] } });
    expect(n).toBe(1);
    expect(reg.has(first)).toBe(true);
    expect(reg.has(second)).toBe(false);
  });

  it('lets an authored satellite replace a member with the same NORAD id', () => {
    const a = authoredSat(first, set);
    const reg = new SatelliteRegistry([a], { observer });
    expect(reg.addConstellation(set, { tleSet: set.id })).toBe(49);
    expect(reg.get(first)).toBe(a);
  });

  it('applies overrides at hydration and keeps overridden members hydrated', () => {
    const reg = new SatelliteRegistry([], { observer });
    reg.addConstellation(set, { tleSet: set.id, overrides: [{ norad: first, name: 'BESPOKE', health: 0.6 }] });
    expect(reg.ref(first)?.name).toBe('BESPOKE');
    const sat = reg.get(first)!;
    expect(sat.name).toBe('BESPOKE');
    expect(sat.health).toBe(0.6);
    expect(reg.pinned().map((r) => r.noradId)).toContain(first);
    expect(reg.release(first)).toBe(false);
  });

  it('releases clean members, refuses dirty ones, and sweeps cold members', () => {
    let now = 0;
    const released: number[] = [];
    const reg = new SatelliteRegistry([], { observer, now: () => now, onReleased: (s) => released.push(s.noradId) });
    reg.addConstellation(set, { tleSet: set.id });
    reg.get(first);
    reg.get(second);
    reg.markDirty(second);
    expect(reg.release(second)).toBe(false);
    now = 5 * 60_000;
    expect(reg.sweepCold()).toBe(0);
    now = 10 * 60_000;
    expect(reg.sweepCold()).toBe(1);
    expect(released).toEqual([first]);
    expect(reg.isHydrated(first)).toBe(false);
    expect(reg.isHydrated(second)).toBe(true);
    expect(reg.hydrated.map((s) => s.noradId)).toEqual([second]);
    // rehydrates on demand
    expect(reg.get(first)).toBeInstanceOf(OrbitalSatellite);
  });

  it('treats degraded health as dirty', () => {
    const reg = new SatelliteRegistry([], { observer });
    reg.addConstellation(set, { tleSet: set.id });
    reg.get(first)!.health = 0.8;
    expect(reg.release(first)).toBe(false);
  });

  it('gates commands on operated (set, override, authored)', () => {
    const reg = new SatelliteRegistry([authoredSat(99001, set)], { observer });
    reg.addConstellation(set, { tleSet: set.id, overrides: [{ norad: second, operated: true }] });
    expect(reg.isOperated(first)).toBe(false);
    expect(reg.isOperated(second)).toBe(true);
    expect(reg.isOperated(99001)).toBe(true);
    const reg2 = new SatelliteRegistry([], { observer });
    reg2.addConstellation(set, { tleSet: set.id, operated: true });
    expect(reg2.isOperated(first)).toBe(true);
    expect(reg2.ref(first)?.operated).toBe(true);
  });

  it('picks the RF template by group and honours rfTemplate overrides', () => {
    const reg = new SatelliteRegistry([], { observer });
    reg.addConstellation(set, { tleSet: set.id, rfTemplate: 'geo-c-ku-generic' });
    const sat = reg.get(first)!;
    expect((sat as unknown as { frequencyOffset: number }).frequencyOffset).toBe(3.7e9);
  });
});

describe('perf-constellation registry mode', () => {
  it('defaults to registry mode and honours ?perfMode=legacy', async () => {
    const { readPerfMode, buildPerfTleSet } = await import('@app/campaigns/perf/perf-constellation');
    expect(readPerfMode('?perfN=100')).toBe('registry');
    expect(readPerfMode('?perfMode=legacy')).toBe('legacy');
    const set = buildPerfTleSet(40);
    const reg = new SatelliteRegistry([], { observer });
    expect(reg.addConstellation(set, { tleSet: set.id })).toBe(40);
    expect(reg.hydratedMemberCount).toBe(0);
  });
});
