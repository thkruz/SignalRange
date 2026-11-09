import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { PassPlannerService } from '@app/services/pass-planner-service';
import { PASS_STRIDE, PassField, PassSearchJob, VisibilityJob } from '@app/simulation/propagation/pass-search';
import { PropagatorCore } from '@app/simulation/propagation/propagation-core';
import { PropagationService } from '@app/simulation/propagation/propagation-service';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';

const START_MS = Date.UTC(2027, 2, 15, 14, 0, 0);
const OBSERVER = { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as Kilometers };
const TLES = [
  { norad: 61701, tle1: '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996', tle2: '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451' },
  { norad: 61702, tle1: '1 61702U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9997', tle2: '2 61702  98.1000  30.0000 0010000  90.0000 236.0000 14.60000000123456' },
];
const sats = TLES.map((t) => new OrbitalSatellite(`SAT-${t.norad}`, t.norad, [], [], { tle1: t.tle1 as TleLine1, tle2: t.tle2 as TleLine2, observer: OBSERVER }));

function service(): PropagationService {
  return new PropagationService({
    tle1: TLES.map((t) => t.tle1),
    tle2: TLES.map((t) => t.tle2),
    norad: Int32Array.from(TLES.map((t) => t.norad)),
    stations: [{ latDeg: OBSERVER.lat, lonDeg: OBSERVER.lon, altKm: OBSERVER.alt }],
    backend: null,
  });
}

describe('worker pass search', () => {
  it('matches main-thread prediction within 1 s', async () => {
    const planner = new PassPlannerService();
    const found = await service().searchPasses({ noradIds: [61701, 61702], minEl: 0, startMs: START_MS, horizonMs: 12 * 3_600_000, maxPasses: 40 });

    for (const sat of sats) {
      const ref = planner.getPasses(sat, START_MS, { horizonHours: 12, aosElevation: 'receivable', observer: OBSERVER, maxPasses: 40 });
      const mine = found.filter((p) => p.noradId === sat.noradId);

      expect(ref.length).toBeGreaterThanOrEqual(2);
      expect(mine).toHaveLength(ref.length);
      mine.forEach((p, i) => {
        expect(Math.abs(p.aosMs - ref[i].aosMs)).toBeLessThanOrEqual(1000);
        expect(Math.abs(p.losMs - ref[i].losMs)).toBeLessThanOrEqual(1000);
        expect(Math.abs(p.maxEl - ref[i].maxEl)).toBeLessThan(0.5);
      });
    }
  });

  it('is deterministic and sorted by AOS', async () => {
    const req = { noradIds: [61702, 61701], minEl: 5, startMs: START_MS, horizonMs: 6 * 3_600_000 };
    const a = await service().searchPasses(req);
    const b = await service().searchPasses(req);

    expect(a).toEqual(b);
    expect(a.map((p) => p.aosMs)).toEqual([...a.map((p) => p.aosMs)].sort((x, y) => x - y));
  });

  it('applies the per-id elevation mask and peak filter', async () => {
    const all = await service().searchPasses({ noradIds: [61701], minEl: 0, startMs: START_MS, horizonMs: 6 * 3_600_000 });
    const high = await service().searchPasses({ noradIds: [61701], minEl: 0, minPeak: 60, startMs: START_MS, horizonMs: 6 * 3_600_000 });

    expect(high.length).toBeLessThan(all.length);
    expect(high.every((p) => p.maxEl >= 60)).toBe(true);
  });

  it('PassSearchJob yields in slices and finishes with packed records', () => {
    const core = new PropagatorCore(
      TLES.map((t) => t.tle1),
      TLES.map((t) => t.tle2),
      Float64Array.from([OBSERVER.lat, OBSERVER.lon, OBSERVER.alt])
    );
    const job = new PassSearchJob(core, {
      indices: Int32Array.from([0]),
      minEl: Float64Array.from([0]),
      minPeak: 0,
      startMs: START_MS,
      horizonMs: 3 * 3_600_000,
      stepMs: 60_000,
      maxPasses: 10,
      stations: Int32Array.from([0]),
    });
    let slices = 0;
    while (!job.run(0)) slices++;
    const rec = job.result();

    expect(slices).toBeGreaterThan(1);
    expect(rec.length % PASS_STRIDE).toBe(0);
    expect(rec[PassField.Los]).toBeGreaterThan(rec[PassField.Aos]);
  });
});

describe('VisibilityJob', () => {
  it('counts members above the horizon per group and grid time', () => {
    const core = new PropagatorCore(
      TLES.map((t) => t.tle1),
      TLES.map((t) => t.tle2),
      Float64Array.from([OBSERVER.lat, OBSERVER.lon, OBSERVER.alt])
    );
    const points: number[][] = [];
    const job = new VisibilityJob(core, { startMs: START_MS, stepMs: 300_000, count: 24, minEl: 0, groupOf: Uint16Array.from([0, 1]), groupCount: 2 }, (i, counts) => {
      points[i] = [...counts];
    });

    expect(job.run(Number.POSITIVE_INFINITY)).toBe(true);
    expect(points).toHaveLength(24);
    // SAT_A is up from about T+2 to T+14.5 min (see pass-planner tests)
    expect(points[1][0]).toBe(1);
    expect(points[4][0]).toBe(0);
    expect(points.every((c) => c[0] <= 1 && c[1] <= 1)).toBe(true);
  });
});
