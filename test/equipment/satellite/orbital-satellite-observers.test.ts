/**
 * Per-station propagation (phase 16, E1).
 *
 * An OrbitalSatellite keeps one canonical observer behind az/el/rangeKm/
 * dopplerFactor/txSignal, and answers for any other station through
 * geometryFor / predictedFor / txSignalsFor. These tests pin that the second
 * view is real geometry (it matches an independent ootk propagation for that
 * station), that the two sites disagree the way two sites should, and that an
 * antenna attached to a station sees the sky from there.
 */

import { shetlandGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import { createMeridianSar1, type MeridianTle } from '@app/campaigns/nats-eu/satellites';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import { groundObjectFor, type OrbitalObserver, type OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { PassPlannerService } from '@app/services/pass-planner-service';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** S9 epoch: 2027-03-17 06:10:00 UTC. SAR-1 rises over Galway at T+8 (30 deg) and over Shetland at T+9 (73 deg). */
const START_MS = Date.UTC(2027, 2, 17, 6, 10, 0);
const SAR1_S9_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27076.25694444  .00001000  00000-0  10000-3 0  9995' as TleLine1,
  tle2: '2 61701  97.2000 280.0000 0010000  90.0000 275.7500 15.60000000123458' as TleLine2,
};

let simNowMs = START_MS;
let simSatellites: OrbitalSatellite[] = [];

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      groundStations: [],
      getSatsByAzEl: () => [],
      getSatByNoradId: (noradId: number) => simSatellites.find((s) => s.noradId === noradId) ?? null,
      isDeveloperMode: false,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const GALWAY: OrbitalObserver = { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as never };
const SHETLAND = observerFromLocation(shetlandGroundStation.location, 'SH-02');

/** Drive the satellite's throttled propagation to `simNowMs`. */
function propagate(sat: OrbitalSatellite): void {
  sat.update();
}

describe('OrbitalSatellite per-station geometry', () => {
  let sat: OrbitalSatellite;

  beforeEach(() => {
    simNowMs = START_MS;
    sat = createMeridianSar1(SAR1_S9_TLE);
    simSatellites = [sat];
  });

  it('answers for a second station with independent ootk geometry', () => {
    simNowMs = START_MS + 846_000; // Shetland max elevation
    propagate(sat);

    const view = sat.geometryFor(SHETLAND);
    const rae = sat.ootkSatellite.rae(groundObjectFor(SHETLAND), new Date(simNowMs));

    expect(rae).toBeDefined();
    expect(view.el).toBeCloseTo(rae!.el, 6);
    expect(view.az).toBeCloseTo((((rae!.az % 360) + 360) % 360) as number, 6);
    expect(view.rangeKm).toBeCloseTo(rae!.rng, 6);
    expect(view.el).toBeGreaterThan(70);
  });

  it('keeps the canonical (Galway) telemetry unchanged and different from Shetland', () => {
    simNowMs = START_MS + 846_000; // Shetland max elevation (72.8 deg); Galway is on the way down
    propagate(sat);

    const galway = sat.geometryFor(GALWAY);
    const shetland = sat.geometryFor(SHETLAND);

    expect(galway.el).toBeCloseTo(sat.el, 6);
    expect(galway.az).toBeCloseTo(sat.az, 6);
    expect(galway.dopplerFactor).toBeCloseTo(sat.dopplerFactor, 12);
    expect(shetland.el).toBeGreaterThan(70);
    expect(galway.el).toBeLessThan(30.6);
    expect(Math.abs(shetland.el - galway.el)).toBeGreaterThan(30);
    expect(Math.abs(shetland.dopplerFactor - galway.dopplerFactor)).toBeGreaterThan(1e-7);
  });

  it("rises on each station's own horizon", () => {
    // T+8.5 min: above Galway's horizon (AOS T+8.0), still below Shetland's (AOS T+9.1)
    simNowMs = START_MS + 510_000;
    propagate(sat);

    expect(sat.isAboveHorizon).toBe(true);
    expect(sat.isAboveHorizonFor(SHETLAND)).toBe(false);
    expect(sat.txSignal.length).toBeGreaterThan(0);
    expect(sat.txSignalsFor(SHETLAND)).toEqual([]);
    expect(sat.txSignalsFor(GALWAY).map((s) => s.frequency)).toEqual(sat.txSignal.map((s) => s.frequency));
  });

  it('Doppler-shifts the downlink for the requested station', () => {
    simNowMs = START_MS + 700_000; // both sites in view, satellite approaching
    propagate(sat);

    const raw = sat.txSignalsFor({ ...GALWAY }).length;
    expect(raw).toBeGreaterThan(0);

    const galwayFreqs = sat.txSignalsFor(GALWAY).map((s) => s.frequency as number);
    const shetlandFreqs = sat.txSignalsFor(SHETLAND).map((s) => s.frequency as number);
    const shetlandFactor = sat.geometryFor(SHETLAND).dopplerFactor;

    expect(shetlandFactor).not.toBe(1);
    galwayFreqs.forEach((f, i) => {
      expect(f).toBeCloseTo(sat.txSignal[i].frequency as number, 3);
      expect(shetlandFreqs[i]).toBeCloseTo((f / sat.dopplerFactor) * shetlandFactor, 3);
    });
  });

  it('applies the authored ephemeris error to the per-station prediction', () => {
    sat.ephemerisErrorAz = 0.3 as Degrees;
    sat.ephemerisErrorEl = -0.2 as Degrees;
    simNowMs = START_MS + 800_000;
    propagate(sat);

    const view = sat.geometryFor(SHETLAND);
    const predicted = sat.predictedFor(SHETLAND);
    expect(predicted.az).toBeCloseTo((view.az as number) + 0.3, 9);
    expect(predicted.el).toBeCloseTo((view.el as number) - 0.2, 9);
  });

  it('caches per observer per propagation and refreshes after a TLE reload', () => {
    simNowMs = START_MS + 800_000;
    propagate(sat);
    const first = sat.geometryFor(SHETLAND);
    expect(sat.geometryFor(SHETLAND)).toBe(first);

    sat.reloadTle(SAR1_S9_TLE.tle1, SAR1_S9_TLE.tle2);
    const second = sat.geometryFor(SHETLAND);
    expect(second).not.toBe(first);
    expect(second.el).toBeCloseTo(first.el, 6);
  });
});

describe('OrbitalSatellite prediction vs truth (phase 16, S7)', () => {
  let sat: OrbitalSatellite;

  beforeEach(() => {
    simNowMs = START_MS;
    sat = createMeridianSar1(SAR1_S9_TLE);
    simSatellites = [sat];
  });

  /** The S9 set nudged 0.04 deg along track: a small avoidance burn. */
  const BURNED_TLE2 = '2 61701  97.2000 280.0000 0010000  90.0000 275.7900 15.60000000123458' as TleLine2;

  it('starts with the station on the truth', () => {
    expect(sat.isPredictionStale).toBe(false);
    expect(sat.predictionSatellite).toBe(sat.ootkSatellite);
  });

  it('a manoeuvre moves the spacecraft but not the pointing prediction', () => {
    simNowMs = START_MS + 700_000;
    propagate(sat);
    const before = sat.geometryFor(GALWAY);
    const predictedBefore = sat.predictedFor(GALWAY);

    sat.maneuverTo(SAR1_S9_TLE.tle1, BURNED_TLE2);
    propagate(sat);

    expect(sat.isPredictionStale).toBe(true);
    const after = sat.geometryFor(GALWAY);
    const predictedAfter = sat.predictedFor(GALWAY);

    // The bird moved (truth), by a fraction of a degree...
    const moved = Math.hypot((after.az as number) - (before.az as number), (after.el as number) - (before.el as number));
    expect(moved).toBeGreaterThan(0.05);
    expect(moved).toBeLessThan(2);
    // ...but the station still points where the old set says it is.
    expect(predictedAfter.az).toBeCloseTo(predictedBefore.az as number, 6);
    expect(predictedAfter.el).toBeCloseTo(predictedBefore.el as number, 6);
    expect(sat.predictedAz).toBeCloseTo(predictedBefore.az as number, 6);
    // and the pass planner predicts from the station's set, not the truth.
    const planned = new PassPlannerService().getPasses(sat, START_MS, { horizonHours: 1, stepS: 10 })[0];
    const truthPlanned = new PassPlannerService().getPasses(createMeridianSar1({ tle1: SAR1_S9_TLE.tle1, tle2: BURNED_TLE2 }), START_MS, { horizonHours: 1, stepS: 10 })[0];
    expect(Math.abs(planned.maxElMs - truthPlanned.maxElMs)).toBeGreaterThan(0);
  });

  it('loading the ephemeris puts the station back on the truth', () => {
    simNowMs = START_MS + 700_000;
    propagate(sat);
    sat.maneuverTo(SAR1_S9_TLE.tle1, BURNED_TLE2);
    sat.reloadTle(SAR1_S9_TLE.tle1, BURNED_TLE2);
    propagate(sat);

    expect(sat.isPredictionStale).toBe(false);
    const g = sat.geometryFor(GALWAY);
    const p = sat.predictedFor(GALWAY);
    expect(p.az).toBeCloseTo((g.az as number) + (sat.ephemerisErrorAz as number), 9);
    expect(p.el).toBeCloseTo((g.el as number) + (sat.ephemerisErrorEl as number), 9);
  });
});

describe('PassPlannerService with an explicit observer', () => {
  it('predicts different passes for Galway and Shetland from one satellite', () => {
    const sat = createMeridianSar1(SAR1_S9_TLE);
    const planner = new PassPlannerService();

    const galway = planner.getPasses(sat, START_MS, { horizonHours: 1, minElevation: 0 as Degrees, stepS: 10 })[0];
    const galwayExplicit = planner.getPasses(sat, START_MS, { horizonHours: 1, minElevation: 0 as Degrees, stepS: 10, observer: GALWAY })[0];
    const shetland = planner.getPasses(sat, START_MS, { horizonHours: 1, minElevation: 0 as Degrees, stepS: 10, observer: SHETLAND })[0];

    expect(galwayExplicit.aosMs).toBe(galway.aosMs);
    expect(galway.maxEl).toBeCloseTo(30.5, 0);
    expect(shetland.maxEl).toBeCloseTo(72.8, 0);
    expect((shetland.aosMs - START_MS) / 1000).toBeCloseTo(547, -1);
    expect((shetland.losMs - START_MS) / 1000).toBeCloseTo(1145, -1);
  });
});

describe('Antenna attached to a station sees the sky from there', () => {
  it('two Ku trackers at Galway and Shetland get different geometry for one bird', () => {
    simNowMs = START_MS + 846_000;
    const sat = createMeridianSar1(SAR1_S9_TLE);
    simSatellites = [sat];
    propagate(sat);

    const galwayAntenna = new AntennaUIHeadless('gw-ant', ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER, {}, 1);
    galwayAntenna.attachStationLocation(53.27, -9.05, 20);
    const shetlandAntenna = new AntennaUIHeadless('sh-ant', ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER, {}, 1);
    shetlandAntenna.attachStationLocation(shetlandGroundStation.location.latitude, shetlandGroundStation.location.longitude, shetlandGroundStation.location.elevation);
    const detachedAntenna = new AntennaUIHeadless('no-station', ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER, {}, 1);

    type Viewer = { satView_(s: OrbitalSatellite): { az: number; el: number; rangeKm: number | null; txSignal: unknown[] } };
    const gw = (galwayAntenna as unknown as Viewer).satView_(sat);
    const sh = (shetlandAntenna as unknown as Viewer).satView_(sat);
    const none = (detachedAntenna as unknown as Viewer).satView_(sat);

    expect(gw.el).toBeCloseTo(sat.el, 4);
    expect(none.el).toBeCloseTo(sat.el, 9);
    expect(sh.el).toBeCloseTo(sat.geometryFor(SHETLAND).el, 9);
    expect(Math.abs(sh.el - gw.el)).toBeGreaterThan(30);
    expect(sh.rangeKm).not.toBeCloseTo(gw.rangeKm as number, 0);
    expect(sh.txSignal.length).toBeGreaterThan(0);
  });
});
