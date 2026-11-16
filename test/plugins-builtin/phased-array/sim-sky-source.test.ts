import { SimSkySource } from '@app/plugins-builtin/phased-array/sim-sky-source';
import { describe, expect, it, vi } from 'vitest';

const members = new Map<number, number>([
  [44001, 0], // Starlink
  [44002, 0],
  [60001, 1], // GEO set member
]);
const refs = [{ tleSet: 'starlink-2026-11' }, { tleSet: 'geo-belt-2026-11' }];
const authored = { noradId: 90001, name: 'KU-SAT 1' };
const lookAhead = vi.fn(() => Promise.resolve({ norads: [] as number[], startMs: 0, stepMs: 1, count: 1, data: new Float32Array(0) }));

const scheduler = {
  registry: {
    memberIndexOf: (n: number) => (members.has(n) ? n : -1),
    memberRefIndex: (idx: number) => members.get(idx) ?? 0,
    constellationRefs: () => refs,
    peek: (n: number) => (n === 90001 ? authored : undefined),
    hydrated: [authored],
    isHydrated: () => false,
    memberName: () => 'x',
  },
  anyService: { lookAhead },
  stationIndexOf: () => 0,
  isTiered: false,
  warmFor: () => [],
};

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ scheduler, satellites: [authored], getSatByNoradId: () => authored }) },
}));
vi.mock('@app/simulation/sim-time', () => ({ getSimulatedNowMs: () => 0 }));

const host = {
  location: () => ({ latitude: 38, longitude: -109, elevationM: 1800 }),
  viewOf: () => ({ az: 180, el: 40 }),
};

describe('SimSkySource served constellations', () => {
  it('serves Starlink members only: never an authored or GEO satellite', () => {
    const src = new SimSkySource(host);

    expect(src.isServed(44001)).toBe(true);
    expect(src.isServed(60001)).toBe(false);
    expect(src.isServed(90001)).toBe(false);
    expect(src.positionOf(90001, 0)).toBeNull();
    expect(src.positionOf(60001, 0)).toBeNull();
    expect(src.list(0, 100).map((o) => o.norad)).toEqual([]);
  });

  it('follows the configured constellations', () => {
    const src = new SimSkySource({ ...host, servedConstellations: ['geo-belt-2026-11'] });

    expect(src.isServed(60001)).toBe(true);
    expect(src.isServed(44001)).toBe(false);
  });

  it('does not freeze a moving satellite when the sample ring has no answer', () => {
    const src = new SimSkySource(host);

    expect(src.positionOf(44001, 300_000)).toBeNull();
  });

  it('asks the propagation worker for served satellites only', async () => {
    const src = new SimSkySource(host);

    await src.lookAhead([44001, 60001, 90001], 0, 15_000, 41);
    expect(lookAhead).toHaveBeenCalledWith(expect.objectContaining({ noradIds: [44001], station: 0, count: 41 }));
  });
});
