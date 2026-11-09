import { PropagatorCore } from '@app/simulation/propagation/propagation-core';
import { InlineBackend, PropagationService, type PropagationStation } from '@app/simulation/propagation/propagation-service';
import { Satellite as OotkSatellite, type TleLine1, type TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';
import { generateSyntheticTles } from '../../../scripts/tle-sets/synth';

const EPOCH_MS = Date.UTC(2026, 10, 9, 2, 0, 0);
const STATIONS: PropagationStation[] = [{ latDeg: 38.9, lonDeg: -104.8, altKm: 1.9 }];

function build(n: number, backend: InlineBackend | null) {
  const tles = generateSyntheticTles({ count: n, seed: 1, epoch: '2026-11-09' });
  const svc = new PropagationService({
    tle1: tles.map((t) => t.tle1),
    tle2: tles.map((t) => t.tle2),
    norad: Int32Array.from(tles.map((t) => t.noradId)),
    stations: STATIONS,
    backend,
  });
  return { tles, svc };
}

function direct(tle1: string, tle2: string, ms: number) {
  const sat = new OotkSatellite({ name: 'x', tle1: tle1 as TleLine1, tle2: tle2 as TleLine2 });
  const pv = sat.eci(new Date(ms));
  if (!pv) throw new Error('propagation failed');
  return pv;
}

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('PropagationService', () => {
  it('worker-path samples equal main-thread SGP4 within 1 m at grid points', () => {
    const backend = new InlineBackend(true);
    const { tles, svc } = build(200, backend);
    const warm = tles.filter((_, i) => i % 10 === 0).map((t) => t.noradId);
    svc.setWarm(warm);
    const t0 = EPOCH_MS + 3600e3;
    svc.update(t0, 1);
    const out = svc.newSample();
    let maxM = 0;
    for (let i = 0; i < tles.length; i += 7) {
      for (const dt of [0, 1000, 3000]) {
        const t = t0 + dt;
        if (!svc.isWarm(tles[i].noradId) && dt % 60000 !== 0) continue;
        const gridT = svc.isWarm(tles[i].noradId) ? t : Math.floor(t / 60000) * 60000;
        expect(svc.sampleAt(tles[i].noradId, gridT, out)).toBe(true);
        const ref = direct(tles[i].tle1, tles[i].tle2, gridT);
        maxM = Math.max(maxM, dist(out, ref.position) * 1000);
      }
    }
    expect(maxM).toBeLessThan(1);
    expect(svc.fallbacks).toBe(0);
    expect(svc.resultsReceived).toBeGreaterThan(0);
  });

  it('1 s Hermite interpolation error for LEO (reported)', () => {
    const { tles, svc } = build(300, new InlineBackend(true));
    const leo = tles.filter((t) => t.shell !== 'geo' && !/geo/iu.test(t.shell)).slice(0, 60);
    svc.setWarm(leo.map((t) => t.noradId));
    const t0 = EPOCH_MS + 7200e3;
    svc.update(t0, 1);
    const out = svc.newSample();
    let max1s = 0;
    for (const t of leo) {
      for (const frac of [0.13, 0.5, 0.87]) {
        const ms = t0 + 1000 + frac * 1000;
        svc.sampleAt(t.noradId, ms, out);
        max1s = Math.max(max1s, dist(out, direct(t.tle1, t.tle2, ms).position) * 1000);
      }
    }
    // 60 s grid (cold) for comparison
    const cold = build(300, new InlineBackend(true));
    cold.svc.update(t0, 1);
    let max60 = 0;
    for (const t of leo.slice(0, 20)) {
      const ms = Math.floor(t0 / 60000) * 60000 + 30000;
      cold.svc.sampleAt(t.noradId, ms, out);
      max60 = Math.max(max60, dist(out, direct(t.tle1, t.tle2, ms).position) * 1000);
    }
    console.log(`INTERP_ERR leo 1s max=${max1s.toExponential(2)} m; 60s max=${max60.toExponential(2)} m`);
    expect(max1s).toBeLessThan(1);
  });

  it('counts a fallback per locally computed grid point and works with no backend', () => {
    const { tles, svc } = build(20, null);
    const out = svc.newSample();
    expect(svc.sampleAt(tles[0].noradId, EPOCH_MS + 12345, out)).toBe(true);
    expect(svc.fallbacks).toBe(2); // two bracketing 60 s points
    svc.sampleAt(tles[0].noradId, EPOCH_MS + 12999, out);
    expect(svc.fallbacks).toBe(2); // memoised
    svc.sampleAt(tles[0].noradId, EPOCH_MS + 61000, out);
    expect(svc.fallbacks).toBe(3);
    expect(svc.sampleAt(999999999, EPOCH_MS, out)).toBe(false);
  });

  it('gives identical answers with the worker absent, immediate, or delayed', () => {
    const run = (mode: 'none' | 'immediate' | 'delayed') => {
      const backend = mode === 'none' ? null : new InlineBackend(mode === 'immediate');
      const { tles, svc } = build(120, backend);
      const warm = tles.filter((_, i) => i % 5 === 0).map((t) => t.noradId);
      svc.setWarm(warm);
      const vals: number[] = [];
      const out = svc.newSample();
      for (let step = 0; step < 40; step++) {
        const t = EPOCH_MS + 5000 + step * 733;
        svc.update(t, 1);
        // delayed worker: results arrive only every 9th step
        if (mode === 'delayed' && step % 9 === 8) backend?.deliver();
        for (let i = 0; i < tles.length; i += 3) {
          svc.sampleAt(tles[i].noradId, t, out);
          vals.push(out.x, out.y, out.z, out.vx, out.vy, out.vz, out.elDeg[0], out.rangeKm[0]);
        }
      }
      return { vals, fallbacks: svc.fallbacks };
    };
    const none = run('none');
    const imm = run('immediate');
    const del = run('delayed');
    expect(imm.vals).toEqual(none.vals);
    expect(del.vals).toEqual(none.vals);
    expect(imm.fallbacks).toBeLessThan(none.fallbacks);
    expect(del.fallbacks).toBeGreaterThan(imm.fallbacks);
  });

  it('5x with a late worker: holding for coverage gives the main-thread answers with zero fallbacks', () => {
    const run = (late: boolean) => {
      const backend = late ? new InlineBackend(false) : null;
      const { tles, svc } = build(120, backend);
      const setA = tles.filter((_, i) => i % 5 === 0).map((t) => t.noradId);
      const setB = tles.filter((_, i) => i % 4 === 1).map((t) => t.noradId);
      svc.setWarm(setA);
      const vals: number[] = [];
      const out = svc.newSample();
      let holds = 0;
      backend?.deliver(); // worker ready
      svc.update(EPOCH_MS, 5);
      backend?.deliver();
      for (let step = 0; step < 300; step++) {
        const t = EPOCH_MS + step * 1000;
        if (step === 150) {
          // tier recompute swaps the warm set mid-run: slots are dropped, the new set is prefetched
          svc.setWarm(setB);
        }
        if (late) {
          // The sim holds until the worker has delivered; each retry is one late-worker frame
          let guard = 0;
          while (!svc.hasWarmCoverage(t + 1000)) {
            holds++;
            backend?.deliver(2);
            if (++guard > 500) throw new Error('worker never covered the step');
          }
        }
        svc.update(t, 5);
        for (let i = 0; i < tles.length; i += 3) {
          if (!svc.isWarm(tles[i].noradId)) continue;
          svc.sampleAt(tles[i].noradId, t + 500, out);
          vals.push(out.x, out.y, out.z, out.elDeg[0]);
        }
      }
      return { vals, fallbacks: svc.fallbacks, holds, lead: svc.warmLeadS };
    };
    const none = run(false);
    const late = run(true);
    expect(late.vals).toEqual(none.vals);
    expect(late.fallbacks).toBe(0);
    expect(late.holds).toBeGreaterThan(0);
    expect(late.lead).toBeGreaterThanOrEqual(26);
  });

  it('invalidate drops results in flight and cached slots', () => {
    const backend = new InlineBackend(false);
    const { tles, svc } = build(30, backend);
    backend.deliver(); // ready
    svc.update(EPOCH_MS, 1);
    svc.invalidate();
    backend.deliver();
    expect(svc.staleDropped).toBeGreaterThan(0);
    const out = svc.newSample();
    expect(svc.sampleAt(tles[0].noradId, EPOCH_MS + 500, out)).toBe(true);
    // invalidate re-requests the current window under the new generation, so the answer comes from the worker
    expect(svc.fallbacks).toBe(0);
  });

  it('sweepAt returns a per-member view and is worker independent', () => {
    const a = build(50, null).svc.sweepAt(EPOCH_MS);
    const b = build(50, new InlineBackend(true)).svc;
    b.update(EPOCH_MS, 1);
    const bs = b.sweepAt(EPOCH_MS);
    expect(Array.from(bs.pos)).toEqual(Array.from(a.pos));
    expect(Array.from(bs.look)).toEqual(Array.from(a.look));
    expect(b.fallbacks).toBe(0);
  });

  it('lookAhead matches direct SGP4 look angles and flags unknown members', async () => {
    for (const backend of [null, new InlineBackend(true)]) {
      const { tles, svc } = build(20, backend);
      const ids = [tles[3].noradId, tles[9].noradId, 999999999];
      const grid = await svc.lookAhead({ noradIds: ids, station: 0, startMs: EPOCH_MS, stepMs: 15_000, count: 41 });

      expect(grid.norads).toEqual([tles[3].noradId, tles[9].noradId]);
      expect(grid.data.length).toBe(2 * 41 * 2);
      const frames = new PropagatorCore(
        tles.map((t) => t.tle1),
        tles.map((t) => t.tle2),
        Float64Array.from([STATIONS[0].latDeg, STATIONS[0].lonDeg, STATIONS[0].altKm])
      );
      const out = new Float64Array(3);
      const date = new Date(EPOCH_MS + 30 * 15_000);

      frames.lookAt(9, 0, date, frames.stationFrames(date), out);
      expect(grid.data[(1 * 41 + 30) * 2]).toBeCloseTo(out[0], 3);
      expect(grid.data[(1 * 41 + 30) * 2 + 1]).toBeCloseTo(out[1], 3);
    }
  });
});
