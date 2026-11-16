import { PropagatorCore, STATION_STRIDE } from '@app/simulation/propagation/propagation-core';
import { describe, expect, it } from 'vitest';

const TLE1 = '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996';
const TLE2 = '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451';

function core(): PropagatorCore {
  const stations = new Float64Array(STATION_STRIDE);
  stations.set([53.27, -9.05, 0.02]);
  return new PropagatorCore([TLE1], [TLE2], stations);
}

describe('PropagatorCore member index validation', () => {
  const date = new Date(Date.UTC(2027, 2, 15, 14, 0, 0));

  it('propagates a valid member', () => {
    const c = core();
    const out = new Float64Array(1);
    expect(c.elevations(0, date, c.stationFrames(date), out)).toBe(true);
  });

  it.each([-1, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects member index %s without touching the cache', (index) => {
    const c = core();
    const out = new Float64Array(1);
    expect(c.elevations(index, date, c.stationFrames(date), out)).toBe(false);
    expect(out[0]).toBe(-90);
  });

  it.each([-1, 1])('compute rejects out-of-range member index %s', (index) => {
    expect(() => core().compute(0, new Int32Array([index]), new Float64Array(6), new Float64Array(2))).toThrow(RangeError);
  });
});
