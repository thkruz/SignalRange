import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { SatelliteRegistry } from '@app/simulation/satellite-registry';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';
import { generateSyntheticTles } from '../../scripts/tle-sets/synth';

const observer = { name: 'T', lat: 30 as Degrees, lon: -100 as Degrees, alt: 0 as Kilometers };
const tles = generateSyntheticTles({ count: 60, seed: 3, epoch: '2026-11-09' });
const set: TleSet = {
  format: 'sr-tle-set/1',
  id: 'lane-set',
  epoch: '2026-11-09',
  source: 'synthetic',
  groups: [...new Set(tles.map((t) => t.shell))].map((id) => ({ id, label: id, count: tles.filter((t) => t.shell === id).length })),
  members: tles.map((t) => ({ noradId: t.noradId, name: t.name, tle1: t.tle1, tle2: t.tle2, group: t.shell })),
};

describe('timeline lane selection', () => {
  const authored = new OrbitalSatellite('AUTH', 99001, [], [], { tle1: set.members[0].tle1 as TleLine1, tle2: set.members[0].tle2 as TleLine2, observer });

  it('gives full lanes to authored, pinned and the selected member only', () => {
    const reg = new SatelliteRegistry([authored], { observer });
    reg.addConstellation(set, { tleSet: set.id });
    const n = (i: number) => set.members[i].noradId;

    expect(reg.laneSatellites()).toEqual([authored]);

    reg.get(n(5)); // hydrated but neither pinned nor selected: summary lane only
    reg.pin(n(1));
    reg.pin(n(2));
    expect(reg.laneSatellites().map((s) => s.noradId)).toEqual([99001, n(1), n(2)]);

    reg.setSelected(n(7));
    reg.get(n(7));
    expect(reg.laneSatellites().map((s) => s.noradId)).toEqual([99001, n(1), n(2), n(7)]);

    reg.setSelected(null);
    expect(reg.laneSatellites().map((s) => s.noradId)).toEqual([99001, n(1), n(2)]);
  });

  it('assigns every member to a constellation summary lane', () => {
    const reg = new SatelliteRegistry([], { observer });
    reg.addConstellation(set, { tleSet: set.id });
    const lanes = reg.memberRefIndices();

    expect(lanes).toHaveLength(60);
    expect(new Set(lanes)).toEqual(new Set([0]));
  });
});
