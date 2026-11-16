/**
 * Satellite figure-8 position (Phase 32 D19, nats-r7-s18-F1).
 *
 * An inclined GEO bird traces its figure-8 once a day. The legacy training
 * rate (peak 0.1 deg per 30 s whatever the swing) stays the default, so
 * AURORA-7's step-track lessons do not move; a satellite that authors
 * `periodHours` runs its 8 on scenario time at that period instead.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let simNowMs = Date.UTC(2026, 2, 2, 9, 15, 0);

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

import { aurora7Satellite } from '@app/campaigns/nats/satellites';
import { scenario18Data } from '@app/campaigns/nats/scenario18';
import { type GeosyncOrbitConfig, Satellite, type SatelliteState } from '@app/equipment/satellite/satellite';
import { SimClock } from '@app/simulation/sim-clock';
import type { Hertz } from '@app/types';
import type { Degrees } from 'ootk';

const SWING: GeosyncOrbitConfig = {
  minAz: 142.0 as Degrees,
  maxAz: 144.6 as Degrees,
  minEl: 30.5 as Degrees,
  maxEl: 33.1 as Degrees,
};

function inclinedSat(geosyncConfig: GeosyncOrbitConfig): Satellite {
  const state: SatelliteState = {
    az: 143.3 as Degrees,
    el: 31.8 as Degrees,
    rotation: 0 as Degrees,
    frequencyOffset: 2.225e9 as Hertz,
    orbitType: 'geosynchronous',
    geosyncConfig,
  };

  return new Satellite('TEST-INCLINED', 99001, [], [], state);
}

/** Largest elevation step between 1-minute samples over `hours` of scenario time, deg/h */
function peakElRateDegPerH(sat: Satellite, hours: number): number {
  let peak = 0;
  let lastEl = sat.el as number;
  for (let m = 0; m < hours * 60; m++) {
    SimClock.skip(60_000);
    simNowMs += 60_000;
    sat.update();
    peak = Math.max(peak, Math.abs((sat.el as number) - lastEl) * 60);
    lastEl = sat.el as number;
  }

  return peak;
}

describe('Satellite figure-8 period (Phase 32 D19)', () => {
  beforeEach(() => {
    SimClock.reset(simNowMs);
  });

  afterEach(() => {
    SimClock.reset();
  });

  it('a 24 h period on a +/-1.3 deg swing peaks at about 0.34 deg/h and starts at its authored phase', () => {
    const sat = inclinedSat({ ...SWING, initialPhase: 0, periodHours: 24 });
    sat.update();
    // Phase 0 is the node: the nominal slot
    expect(sat.az as number).toBeCloseTo(143.3, 6);
    expect(sat.el as number).toBeCloseTo(31.8, 6);

    const peak = peakElRateDegPerH(sat, 2);
    // 1.3 x 2 pi / 24 = 0.340 deg/h at the node
    expect(peak).toBeGreaterThan(0.32);
    expect(peak).toBeLessThan(0.35);
  });

  it('a period runs on scenario time: the same elapsed time gives the same position, whatever the calendar', () => {
    const a = inclinedSat({ ...SWING, initialPhase: 0.3, periodHours: 24 });
    const b = inclinedSat({ ...SWING, initialPhase: 0.3, periodHours: 24 });
    SimClock.skip(1_800_000);
    a.update();
    // A different calendar date, same scenario-elapsed time
    simNowMs += 86_400_000 * 40;
    b.update();
    expect(b.az as number).toBeCloseTo(a.az as number, 9);
    expect(b.el as number).toBeCloseTo(a.el as number, 9);
    // Six hours of scenario time is a quarter of the 8: phase 0.3 + pi/2
    SimClock.skip(6 * 3_600_000 - 1_800_000);
    a.update();
    expect(a.el as number).toBeCloseTo(31.8 + 1.3 * Math.sin(0.3 + Math.PI / 2), 6);
  });

  it('without a period the legacy rate stands: peak about 0.1 deg per 30 s (12 deg/h)', () => {
    const sat = inclinedSat({ ...SWING, initialPhase: 0 });
    sat.update();
    let peak = 0;
    let lastEl = sat.el as number;
    for (let s = 0; s < 600; s++) {
      simNowMs += 1000;
      sat.update();
      peak = Math.max(peak, Math.abs((sat.el as number) - lastEl));
      lastEl = sat.el as number;
    }
    // 0.1 deg / 30 s = 0.00333 deg/s
    expect(peak).toBeGreaterThan(0.003);
    expect(peak).toBeLessThan(0.0035);
  });

  it('S18 TIDEMARK-2 authors a 24 h figure-8; AURORA-7 keeps the legacy rate', () => {
    const tm2 = (scenario18Data.settings.satellites as Satellite[]).find((s) => s.noradId === 61526)!;
    const config = (tm2 as unknown as { geosyncConfig_: { periodMs: number | null; initialPhase: number } }).geosyncConfig_;
    expect(config.periodMs).toBe(24 * 3_600_000);
    expect(config.initialPhase).toBe(0);
    const aurora = (aurora7Satellite as unknown as { geosyncConfig_: { periodMs: number | null } }).geosyncConfig_;
    expect(aurora.periodMs).toBeNull();
  });
});
