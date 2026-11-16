import { Events } from '@app/events/events';
import { InlineBackend, PropagationService, type PropagationStation } from '@app/simulation/propagation/propagation-service';
import { PINNED_CAP, SatelliteRegistry } from '@app/simulation/satellite-registry';
import { classifyWarm, HYSTERESIS_DEG, SMALL_SCENARIO_THRESHOLD, Tier, TierScheduler } from '@app/simulation/tier-scheduler';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import { describe, expect, it } from 'vitest';
import { generateSyntheticTles } from '../../scripts/tle-sets/synth';

const EPOCH_MS = Date.UTC(2026, 10, 9, 2, 0, 0);
const STATIONS: PropagationStation[] = [{ latDeg: 38.9, lonDeg: -104.8, altKm: 1.9 }];

function makeSet(n: number): TleSet {
  const tles = generateSyntheticTles({ count: n, seed: 1, epoch: '2026-11-09' });
  const counts = new Map<string, number>();
  for (const t of tles) counts.set(t.shell, (counts.get(t.shell) ?? 0) + 1);
  return {
    format: 'sr-tle-set/1',
    id: `sched-${n}`,
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
  count(event: string) {
    return this.handlers_.get(event)?.size ?? 0;
  }
}

interface Rig {
  registry: SatelliteRegistry;
  scheduler: TierScheduler;
  service: PropagationService;
  backend: InlineBackend | null;
  bus: FakeBus;
  clock: { ms: number };
}

function rig(n: number, backend: InlineBackend | null): Rig {
  const set = makeSet(n);
  const clock = { ms: EPOCH_MS };
  const registry = new SatelliteRegistry([], { now: () => clock.ms });
  registry.addConstellation(set, { tleSet: set.id });
  const service = new PropagationService({
    ...registry.memberTleLines(),
    norad: registry.memberNoradIds(),
    stations: STATIONS,
    backend,
  });
  const bus = new FakeBus();
  const scheduler = new TierScheduler({
    registry,
    service,
    stations: STATIONS,
    now: () => clock.ms,
    bus: bus as never,
    smallThreshold: 64,
  });
  scheduler.start();
  // Startup priming: the sim stays paused until the worker's first grid points are in
  for (let i = 0; i < 50 && !scheduler.prime(EPOCH_MS); i++) {
    backend?.deliver(1);
  }
  return { registry, scheduler, service, backend, bus, clock };
}

/** Run `minutes` of sim time at 1 s per emitted tick, snapshotting tiers each minute. */
function run(r: Rig, minutes: number, onSecond?: (s: number) => void): string[] {
  const timeline: string[] = [];
  for (let s = 0; s < minutes * 60; s++) {
    r.clock.ms = EPOCH_MS + s * 1000;
    onSecond?.(s);
    r.bus.emit(Events.UPDATE);
    if (s % 60 === 0) {
      timeline.push(`${r.scheduler.tierSnapshot().join('')}|${r.scheduler.warmNoradIds().join(',')}`);
    }
  }
  return timeline;
}

describe('classifyWarm hysteresis', () => {
  it('enters at the edge and leaves only HYSTERESIS_DEG beyond it', () => {
    expect(classifyWarm(10, 10, false)).toBe(true);
    expect(classifyWarm(10.01, 10, false)).toBe(false);
    expect(classifyWarm(10.01, 10, true)).toBe(true);
    expect(classifyWarm(10 + HYSTERESIS_DEG, 10, true)).toBe(true);
    expect(classifyWarm(10 + HYSTERESIS_DEG + 0.01, 10, true)).toBe(false);
  });

  it('a member oscillating inside the band does not change tier', () => {
    let warm = false;
    let changes = 0;
    for (const g of [9.9, 10.5, 11, 10.2, 11.9, 10.4, 11.5]) {
      const next = classifyWarm(g, 10, warm);
      if (next !== warm) changes++;
      warm = next;
    }
    expect(changes).toBe(1);
  });
});

describe('TierScheduler', () => {
  it('tier timelines are identical whatever the worker timing', () => {
    const fast = rig(400, new InlineBackend(true));
    const late = rig(400, new InlineBackend(false));
    const none = rig(400, null);
    const a = run(fast, 8);
    let k = 0;
    const b = run(late, 8, () => {
      // A varying trickle of worker replies, some seconds none at all
      k++;
      late.backend?.deliver(k % 3);
    });
    const c = run(none, 8);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a.some((line) => line.split('|')[0].includes('1'))).toBe(true);
    expect(fast.scheduler.recomputes).toBe(8);
    expect(fast.scheduler.primeFellBack).toBe(false);
    expect(fast.service.fallbacks).toBe(0);
  });

  it('keeps tiers stable: few changes per member over 30 minutes', () => {
    const r = rig(300, new InlineBackend(true));
    const changes = new Map<number, number>();
    let prev = r.scheduler.tierSnapshot();
    run(r, 30, (s) => {
      if (s % 60 !== 0 || s === 0) return;
      const cur = r.scheduler.tierSnapshot();
      for (let i = 0; i < cur.length; i++) if (cur[i] !== prev[i]) changes.set(i, (changes.get(i) ?? 0) + 1);
      prev = cur;
    });
    const worst = Math.max(0, ...changes.values());
    // A LEO pass is one warm interval; the margin plus hysteresis keep it from chattering
    expect(worst).toBeLessThanOrEqual(6);
  });

  it('hydrated members are hot and listed; pinned members survive the cold sweep', () => {
    const r = rig(300, new InlineBackend(true));
    run(r, 1);
    const snap = r.scheduler.tierSnapshot();
    const cold = [...snap.keys()].find((i) => snap[i] === Tier.Cold) as number;
    const norad = r.registry.memberNorad(cold);
    const pinned = r.registry.memberNorad(cold + 1);
    r.registry.get(norad);
    r.registry.pin(pinned);
    expect(r.scheduler.tierOf(norad)).toBe(Tier.Hot);
    expect(r.scheduler.candidatesFor().some((s) => s.noradId === norad)).toBe(true);
    for (let s = 0; s < 14 * 60; s++) {
      r.clock.ms = EPOCH_MS + (60 + s) * 1000;
      r.bus.emit(Events.UPDATE);
    }
    expect(r.registry.isHydrated(pinned)).toBe(true);
    expect(r.scheduler.tierOf(pinned)).toBe(Tier.Hot);
  });

  it('updates hot satellites in stable order: members by NORAD id', () => {
    const r = rig(300, new InlineBackend(true));
    run(r, 1);
    const ids = [250, 3, 77, 120].map((i) => r.registry.memberNorad(i));
    for (const id of [...ids].reverse()) r.registry.get(id);
    const order = r.scheduler.candidatesFor().map((s) => s.noradId);
    expect(order).toEqual([...ids].sort((x, y) => x - y));
  });

  it('invalidate() clears tiers, and a backward jump triggers a recompute', () => {
    const r = rig(300, new InlineBackend(true));
    run(r, 3);
    expect(r.scheduler.warmCount).toBeGreaterThan(0);
    const before = r.scheduler.recomputes;
    r.clock.ms = EPOCH_MS - 3600e3;
    r.bus.emit(Events.UPDATE);
    expect(r.scheduler.recomputes).toBe(before + 1);
    r.scheduler.invalidate();
    expect(r.scheduler.warmCount).toBe(0);
  });

  it('is not tiered below the small-scenario threshold: every member is hot', () => {
    const n = SMALL_SCENARIO_THRESHOLD - 4;
    const set = makeSet(n);
    const registry = new SatelliteRegistry([], { now: () => EPOCH_MS });
    registry.addConstellation(set, { tleSet: set.id });
    const scheduler = new TierScheduler({ registry, service: null, stations: STATIONS, now: () => EPOCH_MS, bus: new FakeBus() as never });
    expect(scheduler.isTiered).toBe(false);
    expect(registry.hydratedMemberCount).toBe(n);
    expect(scheduler.tierOf(registry.memberNorad(5))).toBe(Tier.Hot);
  });

  it('priming waits for the worker, then needs no main-thread fallbacks', () => {
    const backend = new InlineBackend(false);
    const r = rig(300, backend);
    expect(r.scheduler.isPrimed).toBe(true);
    // A rig whose worker never answers stays unprimed until the timeout
    const set = makeSet(300);
    const registry = new SatelliteRegistry([], { now: () => EPOCH_MS });
    registry.addConstellation(set, { tleSet: set.id });
    const slow = new InlineBackend(false);
    const service = new PropagationService({ ...registry.memberTleLines(), norad: registry.memberNoradIds(), stations: STATIONS, backend: slow });
    const s = new TierScheduler({ registry, service, stations: STATIONS, now: () => EPOCH_MS, bus: new FakeBus() as never, primeTimeoutMs: 1e9 });
    expect(s.prime(EPOCH_MS)).toBe(false);
    expect(s.primePhase).toBe('worker');
    slow.deliver(1);
    expect(s.prime(EPOCH_MS)).toBe(false);
    expect(s.primePhase).toBe('positions');
    for (let i = 0; i < 20 && !s.prime(EPOCH_MS); i++) slow.deliver(1);
    expect(s.isPrimed).toBe(true);
    expect(s.primeFellBack).toBe(false);
    expect(service.fallbacks).toBe(0);
  });

  it('priming falls back to the main thread after the timeout, with a warning', () => {
    const set = makeSet(300);
    const registry = new SatelliteRegistry([], { now: () => EPOCH_MS });
    registry.addConstellation(set, { tleSet: set.id });
    const service = new PropagationService({ ...registry.memberTleLines(), norad: registry.memberNoradIds(), stations: STATIONS, backend: new InlineBackend(false) });
    const s = new TierScheduler({ registry, service, stations: STATIONS, now: () => EPOCH_MS, bus: new FakeBus() as never, primeTimeoutMs: -1 });
    expect(s.prime(EPOCH_MS)).toBe(true);
    expect(s.primeFellBack).toBe(true);
    expect(service.fallbacks).toBeGreaterThan(0);
  });

  it('start/stop subscribe once', () => {
    const r = rig(100, null);
    expect(r.bus.count(Events.UPDATE)).toBe(1);
    r.scheduler.start();
    expect(r.bus.count(Events.UPDATE)).toBe(1);
    r.scheduler.stop();
    expect(r.bus.count(Events.UPDATE)).toBe(0);
  });
});

describe('registry pinned cap', () => {
  it(`refuses a pin beyond ${PINNED_CAP}`, () => {
    const set = makeSet(100);
    const registry = new SatelliteRegistry([], { now: () => EPOCH_MS });
    registry.addConstellation(set, { tleSet: set.id });
    for (let i = 0; i < PINNED_CAP; i++) expect(registry.pin(registry.memberNorad(i))).toBe(true);
    expect(registry.pin(registry.memberNorad(PINNED_CAP))).toBe(false);
    expect(registry.pin(registry.memberNorad(0))).toBe(true);
    registry.pin(registry.memberNorad(0), false);
    expect(registry.pin(registry.memberNorad(PINNED_CAP))).toBe(true);
    expect(registry.tracked().length).toBe(PINNED_CAP);
  });
});
