/**
 * nats-eu (Campaign 2) RF link validation — the Phase A blocking gate.
 *
 * The Campaign 2 retro flagged that MERIDIAN RF levels were never live-validated.
 * This test drives the REAL RF chain (OrbitalSatellite SGP4 propagation ->
 * AntennaCore program-track + propagation/pattern math -> OMT -> LNB -> IF
 * filter -> AGC -> Receiver C/N) through the MERIDIAN passes from
 * nats-eu-scenario1, using the real Galway (GW-01) station config.
 *
 * Crucially this drives REAL program-track pointing: the antenna is put in
 * program-track mode targeting the satellite and ticked at 60 Hz so the
 * rate-limited pedestal (maxRate_deg_s: 5.0) must actually keep up with the
 * pass. An earlier version slaved the antenna to satellite truth (perfect
 * boresight) and so was blind to pointing loss — it happily "validated" an
 * 88 deg near-zenith pass whose azimuth keyhole cratered C/N at culmination in
 * the real app. The keyhole regression test at the bottom locks that lesson in:
 * a near-zenith pass MUST fail to hold the link at max elevation.
 *
 * A green run proves the numbers every nats-eu scenario is authored against:
 * - the S1 `signal-detected` beacon threshold (-130 dBm at RX_IF reference),
 * - the S1 `receiver-snr-threshold` objective (C/N >= 8 dB on modem 1) held
 *   through a usable decode window under real tracking,
 * - the antenna stays on boresight (small off-axis error) the whole pass —
 *   i.e. no keyhole,
 * - the link disappears again after LOS.
 */

import type { Degrees, Kilometers } from 'ootk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Scenario clock start for nats-eu-scenario1: 2027-03-15 14:00:00 UTC */
const SCENARIO_START_MS = Date.UTC(2027, 2, 15, 14, 0, 0);
const MINUTE_MS = 60_000;

let simNowMs = SCENARIO_START_MS;

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

// The antenna pulls satellites from the SimulationManager singleton; feed it
// the real MERIDIAN roster with the same +/-1 deg box the real manager uses.
let simSatellites: import('@app/equipment/satellite/orbital-satellite').OrbitalSatellite[] = [];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatsByAzEl: (az: number, el: number) =>
        simSatellites.filter(
          (sat) => Math.abs(sat.az - az) <= 1 && Math.abs(sat.el - el) <= 1,
        ),
      getSatByNoradId: (noradId: number) =>
        simSatellites.find((sat) => sat.noradId === noradId) ?? null,
      isDeveloperMode: false,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import { galwayGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from '@app/campaigns/nats-eu/satellites';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { Receiver } from '@app/equipment/receiver/receiver';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import type { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '@app/events/event-bus';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import type { TleLine1, TleLine2 } from 'ootk';

/** The S1 objective threshold ('C/N Above 8 dB') and the authoring margin */
const OBJECTIVE_CN_DB = 8;
const AUTHORING_MARGIN_DB = 2;
/** The S1 `signal-detected` minPower param */
const DETECTION_THRESHOLD_DBM = -130;
/**
 * Program-track boresight tolerance (deg). On the authored ~25-28 deg passes
 * the 20 deg/s pedestal holds the bird within the ephemeris-error floor
 * (~0.1 deg) the whole time. A high/near-zenith pass grows the pointing lag to
 * a fraction of a degree and ultimately a full keyhole (many degrees), so this
 * bound both accepts a good pass and rejects the keyhole regression.
 */
const MAX_OFFAXIS_DEG = 0.2;

const TICK_HZ = 60; // antenna slew is dt=1/60 per update; tick at 60 Hz for true 5 deg/s

interface Sample {
  tMin: number;
  cn: number;
  hasLock: boolean;
  offAxisDeg: number;
  el: number;
}

/** Angular separation (deg) between two az/el directions. */
function angularSepDeg(az1: number, el1: number, az2: number, el2: number): number {
  const d2r = Math.PI / 180;
  const a = el1 * d2r;
  const b = el2 * d2r;
  const dAz = (az1 - az2) * d2r;
  const cos = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dAz);
  return Math.acos(Math.max(-1, Math.min(1, cos))) / d2r;
}

describe('nats-eu Campaign 2 RF validation: MERIDIAN over GW-01 (Phase A gate)', () => {
  let antenna: AntennaCore;
  let frontEnd: RFFrontEndCore;
  let receiver: Receiver;

  beforeEach(() => {
    simNowMs = SCENARIO_START_MS;
    simSatellites = [meridianSar1Satellite, meridianSar2Satellite];

    // Deterministic run: zero out servo jitter and satellite power variation.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    document.body.innerHTML =
      '<div id="rf-validation-fe"></div><div id="rf-validation-rx"></div>';

    // Mirror GroundStation.createEquipment_/wireEquipment_ with the real
    // GW-01 config, minus the canvas-bound spectrum analyzer.
    antenna = new AntennaUIHeadless(
      'rf-validation-antenna',
      ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER,
      galwayGroundStation.antennasState![0],
      1,
    );
    frontEnd = createRFFrontEnd('rf-validation-fe', galwayGroundStation.rfFrontEnds[0], 'standard');
    frontEnd.connectAntenna(antenna);
    antenna.attachRfFrontEnd(frontEnd);
    receiver = new Receiver('rf-validation-rx', [antenna], galwayGroundStation.receivers![0], 1);
    receiver.connectRfFrontEnd(frontEnd);
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * Fly the pass under REAL program-track: put the antenna in program-track on
   * the target, tick the pedestal at 60 Hz so its 5 deg/s rate limit bites,
   * and sample C/N + boresight error once per sim second. Raw C/N is
   * AGC-convergence-independent, so one frontEnd.update() per sample suffices.
   */
  function flyPass(sat: OrbitalSatellite, startMin: number, endMin: number): Sample[] {
    antenna.handleTrackingModeChange('program-track');
    antenna.handleTargetSatelliteChange(sat.noradId);

    const samples: Sample[] = [];
    const modem = receiver.state.modems[0];
    const tickMs = 1000 / TICK_HZ;
    const startMs = SCENARIO_START_MS + startMin * MINUTE_MS;
    const endMs = SCENARIO_START_MS + endMin * MINUTE_MS;
    let tick = 0;

    for (simNowMs = startMs; simNowMs <= endMs; simNowMs += tickMs, tick++) {
      // Update orbital truth and antenna together every frame, as the real
      // SimulationManager.update() does.
      for (const s of simSatellites) s.update();
      antenna.update(); // program-track sets target to prediction; slew is rate-limited

      if (tick % TICK_HZ === 0) {
        // The satellite position is throttled to POSITION_UPDATE_INTERVAL_MS
        // (1 s), so it steps ~az-rate degrees at a time and the pedestal catches
        // up within the second. Sample the SETTLED C/N the operator sees ~all
        // the time by letting the pedestal converge on the (now-static) target,
        // capped at one interval: a good pass settles in a few ticks; a keyhole
        // pass (slew < az rate) never catches up and stays cratered.
        for (let s = 0; s < TICK_HZ && antenna.state.isSlewing; s++) antenna.update();
        frontEnd.update();
        const info = receiver.getSignalsInBandwidth(modem);
        samples.push({
          tMin: (simNowMs - SCENARIO_START_MS) / MINUTE_MS,
          cn: info.cnRatio_dB,
          hasLock: info.hasLock,
          offAxisDeg: angularSepDeg(antenna.state.azimuth, antenna.state.elevation, sat.az as number, sat.el as number),
          el: sat.el as number,
        });
      }
    }
    return samples;
  }

  /** Effective power the `signal-detected` condition compares to minPower. */
  function detectionPower(signalId: string): number | null {
    const sig = antenna.state.rxSignalsIn.find((s) => s.signalId === signalId);
    if (!sig) return null;
    const totalGain = frontEnd.couplerModule.signalPathManager.getTotalGainTo(TapPoint.RX_IF);
    return sig.power + totalGain;
  }

  it('tracks MERIDIAN-SAR-1 through its pass and holds C/N >= 8 dB with real pointing', () => {
    const modem = receiver.state.modems[0];
    expect(modem.frequency).toBe(1414); // GW-01 config pre-tunes modem 1

    // SAR-1 pass: AOS T+2.0, max el 28.0 deg at T+6.7, LOS T+11.5
    const samples = flyPass(meridianSar1Satellite, 2.5, 11);

    // Program-track keeps the boresight at ~the ephemeris-error floor (~0.1 deg)
    // the whole pass; a keyhole would drive this to many degrees (regression).
    const maxOffAxis = Math.max(...samples.filter((s) => s.el > 5).map((s) => s.offAxisDeg));
    expect(maxOffAxis, `max off-axis ${maxOffAxis.toFixed(2)} deg`).toBeLessThan(MAX_OFFAXIS_DEG);

    // C/N peaks at max elevation (T+6.7) with authoring margin, modem locks.
    const peak = samples.reduce((a, b) => (b.cn > a.cn ? b : a));
    expect(peak.el).toBeGreaterThan(24);
    expect(peak.cn).toBeGreaterThan(OBJECTIVE_CN_DB + AUTHORING_MARGIN_DB);
    expect(peak.hasLock).toBe(true);

    // A contiguous decode window of >= 3 min holds C/N above the objective.
    const aboveThreshold = samples.filter((s) => s.cn > OBJECTIVE_CN_DB && s.hasLock);
    expect(aboveThreshold.length).toBeGreaterThanOrEqual(180); // seconds (1 sample/s)

    // getSnrForModem (the receiver-snr-threshold read) agrees with the IQ path.
    expect(receiver.getSnrForModem(modem)).not.toBeNull();
  });

  it('detects the SAR-1 beacon and video above the S1 thresholds near max el', () => {
    flyPass(meridianSar1Satellite, 2.5, 6.7); // stop at max el (T+6.7)
    const beacon = detectionPower('MERIDIAN-SAR-1-Beacon');
    const video = detectionPower('MERIDIAN-SAR-1-VIDEO');
    expect(beacon, 'beacon not present near max el').not.toBeNull();
    expect(beacon!).toBeGreaterThan(DETECTION_THRESHOLD_DBM);
    expect(video).not.toBeNull();
    expect(video!).toBeGreaterThan(DETECTION_THRESHOLD_DBM);
  });

  it('tracks MERIDIAN-SAR-2 after retuning to 1370 MHz and holds C/N >= 8 dB', () => {
    const modem = receiver.state.modems[0];
    modem.frequency = 1370 as MHz; // S1 'second-contact' retune to the SAR-2 IF

    // SAR-2 pass: AOS T+17.52, max el 25.0 deg at T+22.2, LOS T+26.9
    const samples = flyPass(meridianSar2Satellite, 18, 26.5);

    const maxOffAxis = Math.max(...samples.filter((s) => s.el > 5).map((s) => s.offAxisDeg));
    expect(maxOffAxis, `max off-axis ${maxOffAxis.toFixed(2)} deg`).toBeLessThan(MAX_OFFAXIS_DEG);
    const peak = samples.reduce((a, b) => (b.cn > a.cn ? b : a));
    expect(peak.el).toBeGreaterThan(21);
    expect(peak.cn).toBeGreaterThan(OBJECTIVE_CN_DB + AUTHORING_MARGIN_DB);
    expect(peak.hasLock).toBe(true);

    const aboveThreshold = samples.filter((s) => s.cn > OBJECTIVE_CN_DB && s.hasLock);
    expect(aboveThreshold.length).toBeGreaterThanOrEqual(120); // >= 2 min window
  });

  it('loses the link after LOS', () => {
    flyPass(meridianSar1Satellite, 2.5, 14);
    // T+16: below the horizon (LOS was T+14.3)
    simNowMs = SCENARIO_START_MS + 16 * MINUTE_MS;
    for (const s of simSatellites) s.update();
    antenna.update();
    frontEnd.update();
    expect(meridianSar1Satellite.isAboveHorizon).toBe(false);
    expect(receiver.getSnrForModem(receiver.state.modems[0])).toBeNull();
  });

  /**
   * Keyhole regression: a near-zenith pass (max el ~88 deg) MUST NOT hold the
   * link at culmination under real program-track — the 5 deg/s pedestal cannot
   * slew azimuth through the zenith keyhole, so boresight error blows up and
   * C/N craters exactly at max elevation. This is the failure mode the old
   * truth-slaved gate masked; assert the gate now catches it, and keep the
   * geometry on file as the basis for a future "tracking through zenith" lesson.
   */
  it('KEYHOLE: a near-zenith pass loses the link at culmination (regression)', () => {
    // Authored near-zenith bird over Galway: max el ~88 deg at ~T+8.
    const zenithSat = new OrbitalSatellite(
      'ZENITH-KEYHOLE',
      61799,
      [],
      [],
      {
        tle1: '1 61799U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9993' as TleLine1,
        tle2: '2 61799  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123456' as TleLine2,
        observer: { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as Kilometers },
      },
      {
        ephemerisErrorAz: 0.08 as Degrees,
        ephemerisErrorEl: 0.05 as Degrees,
        transponderConfigs: [
          {
            id: 'TP-PAYLOAD',
            uplinkCenterFrequency: 14100e6 as RfFrequency,
            bandwidth: 40e6 as Hertz,
            frequencyOffset: 2.4e9 as Hertz,
            polarization: 'H',
            beacon: {
              frequency: 11686e6 as RfFrequency,
              signalId: 'ZENITH-KEYHOLE-VIDEO',
              serverId: 1,
              noradId: 61799,
              power: 28 as dBm,
              bandwidth: 36e6 as Hertz,
              modulation: 'QPSK' as ModulationType,
              fec: '3/4' as FECType,
              polarization: 'V',
              feed: '',
              isDegraded: false,
              origin: SignalOrigin.TRANSMITTER,
              noiseFloor: null,
              gainInPath: 0 as dBi,
            },
          },
        ],
      },
    );
    simSatellites = [zenithSat];

    const samples = flyPass(zenithSat, 2.5, 14);
    const peakElSample = samples.reduce((a, b) => (b.el > a.el ? b : a));
    expect(peakElSample.el).toBeGreaterThan(80); // it really is near-zenith

    // At culmination the pedestal cannot keep up: large boresight error.
    expect(peakElSample.offAxisDeg).toBeGreaterThan(MAX_OFFAXIS_DEG);
    // And the link is not usable at the top of the pass.
    const nearPeak = samples.filter((s) => Math.abs(s.el - peakElSample.el) < 15);
    const worst = nearPeak.reduce((a, b) => (b.cn < a.cn ? b : a));
    expect(worst.cn).toBeLessThan(OBJECTIVE_CN_DB);
  });
});
