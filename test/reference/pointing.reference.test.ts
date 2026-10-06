/**
 * Pointing reference cases (phase 19.4): GEO look angles from a slot, the
 * per-station geometry of legacy GEO satellites, program-track lock from the
 * pattern, the servo's rate limit, and step-track as a real hill-climb on the
 * measured beacon.
 *
 * The step-track and program-track cases fly the real C1 VT-01 chain (9 m
 * C-band antenna, RF front end, beacon receiver) on the scenario clock: the
 * beacon C/N the loop climbs is the one the ACU shows.
 */

import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

let simSatellites: import('@app/equipment/satellite/satellite').Satellite[] = [];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatByNoradId: (noradId: number) => simSatellites.find((sat) => sat.noradId === noradId) ?? null,
      isDeveloperMode: false,
      groundStations: [],
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import { maineGroundStation, vermontGroundStation } from '@app/campaigns/nats/ground-stations';
import { tidemark2Satellite, VERMONT_LOOK_ANGLE_SITE } from '@app/campaigns/nats/satellites';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import { StepTrackController } from '@app/equipment/antenna/step-track-controller';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { GEO_RADIUS_KM, geoLookAngles, geoPolarizationSkewDeg } from '@app/simulation/geo-geometry';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';
import type { Degrees } from 'ootk';
import { expectWithinAbs, referenceCase } from './reference-helpers';

const WGS84_A_KM = 6378.137;

describe('GEO look angles from a slot (spherical geometry, Pratt & Bostian ch. 2)', () => {
  referenceCase('a satellite on the station meridian over the equator is at the zenith, 35,786 km up', undefined, () => {
    const look = geoLookAngles({ latitude: 0, longitude: 0 }, 0);
    expectWithinAbs(look.el, 90, 1e-6);
    expectWithinAbs(look.rangeKm, GEO_RADIUS_KM - WGS84_A_KM, 0.01);
  });

  referenceCase('equator station, slot 30 deg east: az 90, el = atan((cos g - Re/r) / sin g), range by the cosine rule', undefined, () => {
    const look = geoLookAngles({ latitude: 0, longitude: 0 }, 30);
    const cosG = Math.cos((30 * Math.PI) / 180);
    const sinG = Math.sin((30 * Math.PI) / 180);
    const el = (Math.atan((cosG - WGS84_A_KM / GEO_RADIUS_KM) / sinG) * 180) / Math.PI;
    const range = Math.sqrt(GEO_RADIUS_KM ** 2 + WGS84_A_KM ** 2 - 2 * GEO_RADIUS_KM * WGS84_A_KM * cosG);
    expectWithinAbs(look.az, 90, 1e-6);
    expectWithinAbs(look.el, el, 0.01);
    expectWithinAbs(look.rangeKm, range, 0.5);
  });

  referenceCase('a slot on the station meridian has no polarization skew; one east of a northern site skews positive', undefined, () => {
    expectWithinAbs(geoPolarizationSkewDeg({ latitude: 45, longitude: -70 }, -70), 0, 1e-9);
    expect(geoPolarizationSkewDeg({ latitude: 45, longitude: -70 }, -60)).toBeGreaterThan(0);
  });
});

describe('legacy GEO satellites seen from two stations (nats-s03-F2)', () => {
  const vt = VERMONT_LOOK_ANGLE_SITE;
  const me = { latitude: maineGroundStation.location.latitude, longitude: maineGroundStation.location.longitude, elevationM: maineGroundStation.location.elevation };

  referenceCase('the reference station sees the authored az/el exactly', undefined, () => {
    const offsets = tidemark2Satellite.stationOffsets(vt)!;
    expectWithinAbs(offsets.dAz, 0, 1e-9);
    expectWithinAbs(offsets.dEl, 0, 1e-9);
    expectWithinAbs(offsets.dRotation, 0, 1e-9);
  });

  referenceCase('Maine sees TIDEMARK-2 at the authored angles plus the real geometric difference between the sites', undefined, () => {
    const lon = tidemark2Satellite.slotLongitudeDeg!;
    const offsets = tidemark2Satellite.stationOffsets(me)!;
    expectWithinAbs(offsets.dAz, geoLookAngles(me, lon).az - geoLookAngles(vt, lon).az, 1e-9);
    expectWithinAbs(offsets.dEl, geoLookAngles(me, lon).el - geoLookAngles(vt, lon).el, 1e-9);
    // 300 km apart: several degrees of azimuth, far outside a 0.6 deg beam
    expect(Math.abs(offsets.dAz)).toBeGreaterThan(2);
  });
});

/** The real VT-01 chain on a GEO satellite, flown at 60 Hz on SimClock */
function vt01Chain(sat: Satellite) {
  document.body.innerHTML = '<div id="pt-fe"></div>';
  const state = {
    ...vermontGroundStation.antennasState![0],
    azimuth: sat.predictedAz,
    elevation: sat.predictedEl,
    targetAzimuth: sat.predictedAz,
    targetElevation: sat.predictedEl,
    polarization: sat.rotation,
    targetPolarization: sat.rotation,
    targetSatelliteId: sat.noradId,
    beaconFrequencyHz: sat.transponders[0].beacon!.frequency as number,
  };
  const antenna = new AntennaUIHeadless('pt-antenna', ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, state, 1);
  antenna.attachStationLocation(vt.latitude, vt.longitude, vt.elevationM);
  const frontEnd = createRFFrontEnd('pt-fe', vermontGroundStation.rfFrontEnds[0], 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  antenna.handleTrackingModeChange('program-track');
  antenna.handleTargetSatelliteChange(sat.noradId);

  const fly = (ms: number, each?: () => void) => {
    const steps = Math.round(ms / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      SimClock.step();
      sat.update();
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
      each?.();
    }
  };

  /** Pattern loss toward where the satellite really is, dB */
  const lossToSat = () => {
    const view = antenna.viewOf(sat);
    return antenna.pointingLossDb(view.az, view.el);
  };

  return { antenna, frontEnd, fly, lossToSat };
}

const vt = VERMONT_LOOK_ANGLE_SITE;

/** A TIDEMARK-2-like GEO with a beacon and the given ephemeris error */
function geoWithError(errAz: number, errEl: number): Satellite {
  return new Satellite('REF-GEO', 61526, [], [], {
    az: 219.7 as Degrees,
    el: 26.3 as Degrees,
    rotation: -25 as Degrees,
    frequencyOffset: 2.225e9 as never,
    ephemerisErrorAz: errAz as Degrees,
    ephemerisErrorEl: errEl as Degrees,
    lookAnglesFrom: vt,
    transponderConfigs: tidemark2Satellite.transponders.map((tp) => ({
      id: tp.id,
      uplinkCenterFrequency: tp.uplinkFrequency,
      bandwidth: tp.bandwidth,
      frequencyOffset: tp.frequencyOffset,
      polarization: tp.polarization,
      beacon: tp.beacon,
    })) as never,
  });
}

describe('program-track lock and the servo', () => {
  beforeEach(() => {
    EventBus.destroy();
    SimClock.reset();
  });

  afterEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  referenceCase('program-track LOCKED is the servo on its commanded track within 1 dB of beam, whatever the ephemeris error', undefined, () => {
    // A 0.4 deg stale ephemeris costs ~5.6 dB at 4.18 GHz, yet the pedestal
    // is exactly where it was told to go: LOCKED (a real ACU's "on track")
    const sat = geoWithError(0, 0.4);
    simSatellites = [sat];
    const { antenna, fly, lossToSat } = vt01Chain(sat);
    fly(20_000);
    expect(lossToSat()).toBeGreaterThan(5);
    expect(antenna.state.isLocked).toBe(true);

    // Drive the pedestal off its track by more than 1 dB of beam: not LOCKED
    const theta3 = antenna.beamwidthAtTrackingDeg();
    antenna.state.elevation = ((antenna.state.elevation as number) + 0.35 * theta3) as Degrees;
    antenna.state.targetElevation = antenna.state.elevation;
    antenna.update(FIXED_STEP_MS);
    // 12 (0.35)^2 = 1.5 dB off the commanded track
    expect(antenna.state.isLocked).toBe(false);
  });

  referenceCase('the 9 m pedestal slews 20 deg of elevation at its 0.5 deg/s limit (40 s plus a 1 s acceleration ramp)', undefined, () => {
    const sat = geoWithError(0, 0);
    simSatellites = [sat];
    const { antenna, fly } = vt01Chain(sat);
    fly(2_000);
    antenna.handleTrackingModeChange('manual');
    antenna.state.stagedTargetElevation = ((antenna.state.elevation as number) + 20) as Degrees;
    antenna.state.hasStagedChanges = true;
    antenna.applyChanges();
    let arrivedS = Number.NaN;
    let t = 0;
    fly(60_000, () => {
      t += FIXED_STEP_MS / 1000;
      if (Number.isNaN(arrivedS) && !antenna.state.isSlewing) arrivedS = t;
    });
    expectWithinAbs(arrivedS, 41, 0.5);
  });
});

describe('step-track hill-climb on the measured beacon', () => {
  beforeEach(() => {
    EventBus.destroy();
    SimClock.reset();
  });

  afterEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  referenceCase('from a stale ephemeris costing ~4.7 dB, step-track climbs to within 0.3 dB of the beacon peak, taking real dwell time', undefined, () => {
    const sat = geoWithError(0.3, 0.25);
    simSatellites = [sat];
    const { antenna, fly, lossToSat } = vt01Chain(sat);

    // Program-track alone, settled (LNB warm, beacon receiver averaging)
    fly(30_000);
    const programTrackLoss = lossToSat();
    expect(programTrackLoss).toBeGreaterThan(4);
    // The pedestal is on its (stale) track: program-track says LOCKED
    expect(antenna.state.isLocked).toBe(true);
    const programTrackCn = antenna.state.beaconCN!;

    antenna.handleStepTrackToggle(true);
    const controller = (antenna as unknown as { stepTrackController_: StepTrackController }).stepTrackController_;

    // Not instant: after 10 s the loop has taken only a step or two
    fly(10_000);
    expect(lossToSat()).toBeGreaterThan(1);

    fly(110_000);
    const state = controller.getState();
    expect(state.isConverged).toBe(true);
    expect(lossToSat()).toBeLessThan(0.3);
    // The beacon receiver shows the recovery the pattern loss says it should
    expectWithinAbs(antenna.state.beaconCN! - programTrackCn, programTrackLoss - lossToSat(), 0.5);
    expect(antenna.state.isBeaconLocked).toBe(true);
    expect(antenna.state.isLocked).toBe(true);
    // Real dwell times: tens of seconds, not a fixed 25 s ease
    expect(state.convergedAfterMs!).toBeGreaterThan(20_000);
    expect(state.convergedAfterMs!).toBeLessThan(120_000);
  });

  referenceCase('a converged step-track keeps dithering and holds the peak on a drifting satellite', undefined, () => {
    const sat = geoWithError(0.2, -0.15);
    simSatellites = [sat];
    const { antenna, fly, lossToSat } = vt01Chain(sat);
    fly(10_000);
    antenna.handleStepTrackToggle(true);
    fly(120_000);
    expect(lossToSat()).toBeLessThan(0.3);

    // The satellite drifts 0.1 deg in elevation over a minute
    let worst = 0;
    const startEl = sat.el as number;
    let t = 0;
    fly(60_000, () => {
      t += FIXED_STEP_MS / 1000;
      sat.el = (startEl + (0.1 * t) / 60) as Degrees;
      worst = Math.max(worst, lossToSat());
    });
    expect(worst).toBeLessThan(0.6);
    expect(lossToSat()).toBeLessThan(0.3);
    void antenna;
  });
});

void ({} as AntennaCore);
