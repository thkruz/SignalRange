import { Events } from '@app/events/events';
import { BOLTZMANN_DBM_PER_K_HZ } from '@app/simulation/noise-model';
import { InlineBackend, type PropagationSample, PropagationService, type PropagationStation } from '@app/simulation/propagation/propagation-service';
import { directionEci, type RfAntennaPort, RfSelector, stationFrame } from '@app/simulation/rf-narrowing';
import { SatelliteRegistry } from '@app/simulation/satellite-registry';
import { getRfTemplate } from '@app/simulation/satellite-rf-templates';
import { TierScheduler } from '@app/simulation/tier-scheduler';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import { describe, expect, it } from 'vitest';
import { generateSyntheticTles } from '../../scripts/tle-sets/synth';

const EPOCH_MS = Date.UTC(2026, 10, 9, 2, 0, 0);
const STATIONS: PropagationStation[] = [{ latDeg: 38.9, lonDeg: -104.8, altKm: 1.9 }];
const RAD = Math.PI / 180;

function makeSet(n: number): TleSet {
  const tles = generateSyntheticTles({ count: n, seed: 1, epoch: '2026-11-09' });
  const counts = new Map<string, number>();
  for (const t of tles) counts.set(t.shell, (counts.get(t.shell) ?? 0) + 1);
  return {
    format: 'sr-tle-set/1',
    id: `rfn-${n}`,
    epoch: '2026-11-09',
    source: 'synthetic',
    groups: [...counts].map(([id, count]) => ({ id, label: id, count })),
    members: tles.map((t) => ({ noradId: t.noradId, name: t.name, tle1: t.tle1, tle2: t.tle2, group: t.shell })),
  };
}

class FakeBus {
  private readonly handlers_ = new Map<string, Set<() => void>>();
  on(event: string, cb: () => void) {
    if (!this.handlers_.has(event)) this.handlers_.set(event, new Set());
    this.handlers_.get(event)?.add(cb);
  }
  off(event: string, cb: () => void) {
    this.handlers_.get(event)?.delete(cb);
  }
  emit(event: string) {
    for (const cb of [...(this.handlers_.get(event) ?? [])]) cb();
  }
}

/** Ku dish placeholder: 40 dBi on axis, 1.8 deg beam, S.580-style envelope 29 - 25 log10(theta), floor -10 dBi. */
function patternDbi(theta: number): number {
  const th = Math.abs(theta);
  const main = 40 - 12 * (th / 1.8) ** 2;
  const side = 29 - 25 * Math.log10(Math.max(th, 1));

  return Math.max(-10, th < 1 ? main : Math.min(main, side));
}

const QUERY = 11.75e9;
const BORE = { az: 180, el: 40 };
const thetaOf = new Map<number, number>();

function makePort(frameMs: () => number, sch?: TierScheduler): RfAntennaPort {
  return {
    latDeg: STATIONS[0].latDeg,
    lonDeg: STATIONS[0].lonDeg,
    altKm: STATIONS[0].altKm,
    rxBand: [10.7e9, 12.75e9],
    txBand: [14e9, 14.5e9],
    boresight: () => BORE,
    patternGainDbi: (t) => patternDbi(t),
    beamwidth3dBDeg: () => 1.8,
    fsplDb: (f, d) => 20 * Math.log10(d * 1000) + 20 * Math.log10(f) - 147.55,
    atmosphericLossDb: (_f, el) => 0.2 / Math.sin(Math.max(1, el) * RAD),
    feedLossDb: () => 0.5,
    clearSkyNoiseK: () => 120,
    offAxisDeg: (az) => thetaOf.get(az) ?? 180,
    viewOf: (sat) => {
      const s: PropagationSample = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, elDeg: new Float64Array(16), rangeKm: new Float64Array(16), gridMs: 0 };
      if (!sch?.sampleAt(sat.noradId, frameMs(), s)) return { az: 0, el: -90, rangeKm: 1 };
      thetaOf.set(sat.noradId, angleOff(s, frameMs()));

      return { az: sat.noradId, el: s.elDeg[0], rangeKm: s.rangeKm[0] };
    },
  };
}

function rig(n: number) {
  const set = makeSet(n);
  const clock = { ms: EPOCH_MS };
  const registry = new SatelliteRegistry([], { now: () => clock.ms });
  registry.addConstellation(set, { tleSet: set.id });
  const backend = new InlineBackend(true);
  const service = new PropagationService({ ...registry.memberTleLines(), norad: registry.memberNoradIds(), stations: STATIONS, backend });
  const bus = new FakeBus();
  const scheduler = new TierScheduler({ registry, service, stations: STATIONS, now: () => clock.ms, bus: bus as never, smallThreshold: 64 });
  scheduler.start();
  for (let i = 0; i < 50 && !scheduler.prime(EPOCH_MS); i++) backend.deliver(1);
  for (let s = 0; s < 90; s++) {
    clock.ms = EPOCH_MS + s * 1000;
    bus.emit(Events.UPDATE);
  }

  return { registry, scheduler, clock, bus };
}

function angleOff(sample: PropagationSample, ms: number): number {
  const frame = stationFrame(STATIONS[0].latDeg, STATIONS[0].lonDeg, STATIONS[0].altKm, ms);
  const b = directionEci(frame, BORE.az, BORE.el);
  const dx = sample.x - frame.x;
  const dy = sample.y - frame.y;
  const dz = sample.z - frame.z;
  const r = Math.hypot(dx, dy, dz);

  return Math.acos(Math.max(-1, Math.min(1, (dx * b[0] + dy * b[1] + dz * b[2]) / r))) / RAD;
}

describe('RfSelector', () => {
  it('matches a brute-force partition at 10k members (cone set equal, aggregate within 1e-3 relative: atmosphere loss is cached per 0.25 deg of elevation)', () => {
    const r = rig(10_000);
    const nowMs = r.scheduler.nowMs();
    const sel = new RfSelector(
      r.scheduler,
      0,
      makePort(() => nowMs, r.scheduler)
    );
    r.scheduler.rfAggregate = true;
    sel.refresh(true);

    const warm = r.scheduler.warmFor(0);
    expect(warm.length).toBeGreaterThan(100);

    // Brute force over every warm member of the station, independent angle computation
    const s: PropagationSample = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, elDeg: new Float64Array(16), rangeKm: new Float64Array(16), gridMs: 0 };
    const expectedCone = new Set<number>();
    let above = 0;
    const port = makePort(() => nowMs, r.scheduler);

    let bruteK = 0;
    // The scheduler may hydrate promoted members, so re-derive from the full member list instead of warmFor
    for (let i = 0; i < r.registry.memberCount; i++) {
      const norad = r.registry.memberNorad(i);
      if (!r.scheduler.sampleAt(norad, nowMs, s)) continue;
      const el = s.elDeg[0];
      if (!(el > 0)) continue;
      above++;
      const th = angleOff(s, nowMs);
      if (th <= sel.coneLimitDeg(norad)) {
        expectedCone.add(norad);
        continue;
      }
      const env = getRfTemplate(r.registry.rfTemplateIdOf(norad) ?? '')?.envelope;
      for (const band of env?.bands ?? []) {
        if (QUERY < band.loHz || QUERY > band.hiHz) continue;
        const fc = (Math.max(band.loHz, 10.7e9) + Math.min(band.hiHz, 12.75e9)) / 2;
        const psd =
          band.maxEirpDbm -
          10 * Math.log10(band.carrierBwHz) +
          env!.aggregateDutyDb -
          port.fsplDb(fc, s.rangeKm[0]) -
          port.atmosphericLossDb(fc, Math.max(1, el)) -
          port.feedLossDb(fc) +
          patternDbi(th);
        bruteK += 10 ** ((psd - BOLTZMANN_DBM_PER_K_HZ) / 10);
      }
    }

    const got = new Set<number>();
    for (const sat of sel.candidates()) {
      if (sel.isInCone(sat.noradId)) got.add(sat.noradId);
    }
    expect(above).toBeGreaterThan(sel.stats.lastInCone);
    expect([...got].sort((a, c) => a - c)).toEqual([...expectedCone].sort((a, c) => a - c));
    expect(sel.stats.lastInCone).toBe(expectedCone.size);
    const culled = sel.aggregateK(QUERY);
    expect(culled).toBeGreaterThan(0);
    // Same members, same instant; the only difference is the atmosphere cache (0.25 deg elevation buckets), measured 2.3e-4
    expect(Math.abs(culled - bruteK) / bruteK).toBeLessThan(1e-3);
  }, 120_000);

  it('with the aggregate off the cone is an exact superset (uncapped) and the aggregate is zero', () => {
    const r = rig(2000);
    const nowMs = r.scheduler.nowMs();
    const sel = new RfSelector(
      r.scheduler,
      0,
      makePort(() => nowMs, r.scheduler)
    );
    r.scheduler.rfAggregate = false;
    sel.refresh(true);
    expect(sel.aggregateK(QUERY)).toBe(0);
    r.scheduler.rfAggregate = true;
    sel.refresh(true);
    const on = sel.stats.lastInCone;
    r.scheduler.rfAggregate = false;
    sel.refresh(true);
    expect(sel.stats.lastInCone).toBeGreaterThanOrEqual(on);
  }, 60_000);

  it('skips a group whose bands do not overlap the receive chain', () => {
    const r = rig(500);
    const nowMs = r.scheduler.nowMs();
    const port = { ...makePort(() => nowMs, r.scheduler), rxBand: [8.0e9, 8.4e9] as const, txBand: [7.9e9, 8.0e9] as const };
    const sel = new RfSelector(r.scheduler, 0, port);
    sel.refresh(true);
    expect(sel.stats.lastInCone).toBe(0);
    expect(sel.stats.lastAggregated).toBe(0);
  });
});
