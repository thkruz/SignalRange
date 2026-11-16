/**
 * C1 step-track lessons on the real chain (phase 19.4, nats-s18-F3, s22-F6).
 *
 * Step-track is a hill-climb on the measured beacon since 19.4, so its
 * lessons are numbers the engine produces, not authored ones:
 *
 * - S18 (ME-02, drifting TIDEMARK-2): the stale ephemeris costs program-track
 *   several dB on the beacon and pushes the customer carrier under the
 *   recovery threshold; step-track finds the beacon and brings both back.
 * - S22 (VT-01, AURORA-7 at end of life): the beacon C/N step-track holds
 *   today, and how far above the step-track floor (beacon lock, 6.5 dB in
 *   the 1 kHz tracking bandwidth) that leaves - the number the brief's
 *   trackability row quotes.
 * - S24 (VT-01, AURORA-7 under the front's rain band, Phase 29 D13): the
 *   rain costs the step-tracked beacon about a dB and leaves it locked; the
 *   same rain would unlock the program-tracked beacon, which is why the rain
 *   is anchored after the step-track step.
 *
 * Each station's chain (antenna, RF front end, receiver) is built from the
 * scenario's own ground-station config and flown at 60 Hz on SimClock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let simNowMs = Date.UTC(2026, 2, 2, 9, 15, 0);

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

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

import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { scenario18Data } from '@app/campaigns/nats/scenario18';
import { scenario22Data } from '@app/campaigns/nats/scenario22';
import { scenario24Data } from '@app/campaigns/nats/scenario24';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { Receiver } from '@app/equipment/receiver/receiver';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { ScenarioData } from '@app/ScenarioData';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';

/** Beacon lock threshold step-track holds, dB in the 1 kHz tracking bandwidth */
const STEP_TRACK_FLOOR_DB = 6.5;

function station(scenario: ScenarioData, id: string): GroundStationConfig {
  const gs = (scenario.settings.groundStations as GroundStationConfig[]).find((s) => s.id === id);
  if (!gs) throw new Error(`${scenario.id}: no ${id}`);
  return gs;
}

/** One station's antenna + front end + receiver, wired as GroundStation does, flying `sat` */
function chain(scenario: ScenarioData, stationId: string, sat: Satellite, txModems?: unknown[]) {
  EventBus.destroy();
  SimClock.reset();
  document.body.innerHTML = '<div id="st-fe"></div><div id="st-rx"></div>';
  const gs = station(scenario, stationId);
  simSatellites = scenario.settings.satellites as Satellite[];
  for (const s of simSatellites) {
    (s as unknown as { health: number }).health = 1;
    // Module-singleton satellites: drop the last test's arrivals (phase 27)
    s.rxSignal = [];
  }

  const state = { ...(gs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('st-ant', 'headless', gs.antennaConfigKey ?? gs.antennas[0], state, gs.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
  const frontEnd = createRFFrontEnd('st-fe', gs.rfFrontEnds[0], 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('st-rx', [antenna], gs.receivers?.[0], gs.teamId ?? 1);
  receiver.connectRfFrontEnd(frontEnd);
  // The station's own uplink (authored, or the test's): since phase 27 there
  // is no stand-in, so the carrier on the payload is the one it radiates, and
  // a pointing error costs it on the way up and on the way down
  const modems = txModems ?? ((gs.transmitters?.[0]?.modems ?? []) as unknown[]);
  frontEnd.connectTransmitter({ state: { modems }, isModemInIntermittentDropout: () => false } as never);

  antenna.handleTrackingModeChange('program-track');
  antenna.handleTargetSatelliteChange(sat.noradId);

  const fly = (ms: number) => {
    const steps = Math.round(ms / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      simNowMs += FIXED_STEP_MS;
      SimClock.step();
      for (const s of simSatellites) s.update();
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
    }
  };

  /** Pattern loss toward where the satellite really is, dB */
  const lossToSat = () => {
    const view = antenna.viewOf(sat);
    return antenna.pointingLossDb(view.az, view.el);
  };

  /** Mean carrier C/N on modem 1 over `ms`, dB (the relayed carrier fades +/-1 dB slowly) */
  const carrierCn = (ms: number) => {
    let sum = 0;
    let n = 0;
    const steps = Math.round(ms / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      fly(FIXED_STEP_MS);
      const info = receiver.getSignalsInBandwidth(receiver.state.modems[0]);
      if (Number.isFinite(info.cnRatio_dB)) {
        sum += info.cnRatio_dB;
        n++;
      }
    }
    return n > 0 ? sum / n : -Infinity;
  };

  return { antenna, frontEnd, receiver, fly, lossToSat, carrierCn };
}

// Each case runs minutes of scenario time at the 60 Hz step, about 5 s apiece: past vitest's default.
describe('C1 step-track lessons (phase 19.4)', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('S18: program-track on the stale ephemeris loses the carrier threshold; step-track recovers beacon and carrier', () => {
    const sat = (scenario18Data.settings.satellites as Satellite[]).find((s) => s.noradId === 61526)!;
    const { antenna, fly, lossToSat, carrierCn } = chain(scenario18Data, 'ME-02', sat);

    fly(60_000);
    const ptLoss = lossToSat();
    const ptBeacon = antenna.state.beaconCN!;
    const ptCarrier = carrierCn(20_000);
    // Program-track reads LOCKED on its stale track
    expect(antenna.state.isLocked).toBe(true);

    antenna.handleStepTrackToggle(true);
    fly(120_000);
    const stLoss = lossToSat();
    const stBeacon = antenna.state.beaconCN!;
    const stCarrier = carrierCn(20_000);

    console.info(
      `S18 ME-02 TM-2: program-track loss ${ptLoss.toFixed(2)} dB, beacon ${ptBeacon.toFixed(1)} dB, carrier ${ptCarrier.toFixed(1)} dB | step-track loss ${stLoss.toFixed(2)} dB, beacon ${stBeacon.toFixed(1)} dB, carrier ${stCarrier.toFixed(1)} dB`
    );

    expect(ptLoss).toBeGreaterThan(4);
    expect(stLoss).toBeLessThan(0.5);
    // The S18 thresholds: Beacon Recovery (beacon C/N >= 32 dB) and Carrier
    // Recovery (C/N >= 12 dB) are out of reach on program-track and met on step-track,
    // with a margin for the relayed carrier's +/-1 dB fading
    expect(ptBeacon).toBeLessThan(30);
    expect(stBeacon).toBeGreaterThan(33);
    expect(ptCarrier).toBeLessThan(10.5);
    expect(stCarrier).toBeGreaterThan(13.2);
  });

  it('S18: the stale-ephemeris gap opens on scenario time, so program-track bleeds about 1.5 dB in five minutes (Phase 30 D16)', () => {
    const sat = (scenario18Data.settings.satellites as Satellite[]).find((s) => s.noradId === 61526)!;
    const { antenna, fly, lossToSat } = chain(scenario18Data, 'ME-02', sat);

    fly(30_000);
    const lossStart = lossToSat();
    const beaconStart = antenna.state.beaconCN!;
    fly(300_000);
    const lossEnd = lossToSat();
    const beaconEnd = antenna.state.beaconCN!;

    console.info(`S18 bleed over 5 min: loss ${lossStart.toFixed(2)} -> ${lossEnd.toFixed(2)} dB, beacon ${beaconStart.toFixed(1)} -> ${beaconEnd.toFixed(1)} dB`);

    expect(lossEnd - lossStart).toBeGreaterThan(1.1);
    expect(lossEnd - lossStart).toBeLessThan(2.2);
    expect(beaconStart - beaconEnd).toBeGreaterThan(0.8);
    // Program-track still reads LOCKED on its stale track while it bleeds
    expect(antenna.state.isLocked).toBe(true);
  });

  it('S18: TIDEMARK-2 starts on the brief nominal slot and its daily figure-8 moves it only hundredths of a degree in the scenario (Phase 32 D19)', () => {
    const sat = (scenario18Data.settings.satellites as Satellite[]).find((s) => s.noradId === 61526)!;
    const { antenna, fly } = chain(scenario18Data, 'ME-02', sat);

    fly(1_000);
    const start = antenna.viewOf(sat);
    const ptStart = { az: antenna.state.azimuth, el: antenna.state.elevation };
    fly(360_000);
    const end = antenna.viewOf(sat);
    const ptEnd = { az: antenna.state.azimuth, el: antenna.state.elevation };

    console.info(
      `S18 ME-02 TM-2 over 6 min: bird ${(start.az as number).toFixed(3)}/${(start.el as number).toFixed(3)} -> ${(end.az as number).toFixed(3)}/${(end.el as number).toFixed(3)} | program-track ${ptStart.az.toFixed(3)}/${ptStart.el.toFixed(3)} -> ${ptEnd.az.toFixed(3)}/${ptEnd.el.toFixed(3)}`
    );

    // b18 "Nominal slot position (from ME-02) Az 147.0, El 32.4": the bird is on it at 0915
    expect(start.az as number).toBeCloseTo(147.0, 1);
    expect(start.el as number).toBeCloseTo(32.4, 1);
    // 24 h figure-8: ~0.34 deg/h in elevation, ~0.7 deg/h in azimuth at the node, so 6 min is a few hundredths
    // (the legacy 41-minute 8 moved it ~0.7 deg in elevation in the same 6 min, nats-r7-s18-F1)
    expect(Math.abs((end.el as number) - (start.el as number))).toBeLessThan(0.05);
    expect(Math.abs((end.az as number) - (start.az as number))).toBeLessThan(0.1);
    // Program-track sits on the stale prediction, a few tenths from the slot, and moves by the gap growth only
    expect(Math.hypot(ptStart.az - 147.0, ptStart.el - 32.4)).toBeLessThan(0.6);
    expect(Math.hypot(ptEnd.az - ptStart.az, ptEnd.el - ptStart.el)).toBeLessThan(0.15);
  });

  it('S22: AURORA-7 under step-track sits a measurable margin above the step-track floor', () => {
    const sat = (scenario22Data.settings.satellites as Satellite[]).find((s) => s.name === 'AURORA-7')!;
    // VT-01 starts off the air with its chain staged for AURORA-7 (TP-1 6053
    // MHz = BUC LO 7500 - IF 1447, phase 27); the player keys it after the
    // beacon measurement. With no stand-in it is the only carrier there
    const vt = (scenario22Data.settings.groundStations as GroundStationConfig[]).find((g) => g.id === 'VT-01')!;
    const base = (vt.transmitters?.[0]?.modems?.[0] ?? {}) as { ifSignal?: object };
    const aurora = { ...base, isTransmitting: true, isTransmittingSwitchUp: true };
    const { antenna, frontEnd, fly, lossToSat, carrierCn } = chain(scenario22Data, 'VT-01', sat, [aurora]);
    // The player's bring-up: drive first, then the amplifier
    frontEnd.bucModule.handleMuteToggle(false);
    frontEnd.hpaModule.handleHpaToggle();

    fly(120_000);
    const ptBeacon = antenna.state.beaconCN!;
    antenna.handleStepTrackToggle(true);
    fly(150_000);
    const stBeacon = antenna.state.beaconCN!;
    const stCarrier = carrierCn(20_000);

    console.info(
      `S22 VT-01 AURORA-7: program-track beacon ${ptBeacon.toFixed(1)} dB | step-track loss ${lossToSat().toFixed(2)} dB, beacon ${stBeacon.toFixed(1)} dB (floor ${STEP_TRACK_FLOOR_DB} dB, margin ${(stBeacon - STEP_TRACK_FLOOR_DB).toFixed(1)} dB), carrier ${stCarrier.toFixed(1)} dB`
    );

    expect(antenna.state.isBeaconLocked).toBe(true);
    // S22 engage-step-track: program-track under the 8.3 dB hold, step-track over it
    expect(ptBeacon).toBeLessThan(8.3);
    expect(stBeacon).toBeGreaterThan(8.5);
    // The brief's trackability row: about 2.3 dB above the 6.5 dB floor. The beacon sits 6.3 dB down
    // (Phase 28, D6: the story, quiz and beacon log now record the -6.3 dB the physics gives)
    expect(stBeacon - STEP_TRACK_FLOOR_DB).toBeGreaterThan(1.8);
    expect(stBeacon - STEP_TRACK_FLOOR_DB).toBeLessThan(2.8);
    expect(stCarrier).toBeGreaterThan(8);
  });

  it('S24: the rain band costs the step-tracked AURORA-7 beacon about a dB and keeps the lock', () => {
    const sat = (scenario24Data.settings.satellites as Satellite[]).find((s) => s.name === 'AURORA-7')!;
    const rain = (scenario24Data.settings.weatherEvents ?? []).find((e) => e.id === 'vermont-rain-band')!;
    expect(rain.startAfterObjectiveId).toBe('pass-go-nogo-quiz');
    const { antenna, fly } = chain(scenario24Data, 'VT-01', sat);

    fly(120_000);
    const ptBeacon = antenna.state.beaconCN!;
    antenna.handleStepTrackToggle(true);
    // The step-track step: engage, then the beacon held 15 s; the rain anchors to the next step
    fly(15_000);
    const dryBeacon = antenna.state.beaconCN!;
    const skyDry = antenna.state.rfMetrics?.skyTemp_K ?? 0;
    // WeatherManager's ramp: min(300 s, 15 % of the duration), linear
    const rampS = Math.min(300, rain.duration * 0.15);
    let minBeacon = Infinity;
    let unlockedS = 0;
    for (let t = 0; t < rampS + 120; t++) {
      antenna.updateRainRate(rain.rainRateMmPerHour! * Math.min(1, t / rampS));
      fly(1000);
      minBeacon = Math.min(minBeacon, antenna.state.beaconCN ?? -Infinity);
      if (!antenna.state.isBeaconLocked) {
        unlockedS++;
      }
    }
    const wetBeacon = antenna.state.beaconCN!;
    const skyWet = antenna.state.rfMetrics?.skyTemp_K ?? 0;
    const rainAlarm = antenna.getStatusAlarms().find((a) => a.message.startsWith('RAIN FADE'));

    console.info(
      `S24 VT-01 AURORA-7: program-track ${ptBeacon.toFixed(1)} dB | step-track dry ${dryBeacon.toFixed(1)} dB, sky ${skyDry.toFixed(0)} K | rain ${rain.rainRateMmPerHour} mm/h ${wetBeacon.toFixed(1)} dB (min ${minBeacon.toFixed(1)}), sky ${skyWet.toFixed(0)} K, attenuation ${antenna.rainAttenuationDb.toFixed(2)} dB, rain C/N loss ${antenna.rainCnLossDb().toFixed(2)} dB, alarm ${rainAlarm?.severity} "${rainAlarm?.message}"`
    );

    // The storm-hold quiz: about a dB of fade, Sky Temp up, still locked
    expect(dryBeacon - wetBeacon).toBeGreaterThan(0.7);
    expect(dryBeacon - wetBeacon).toBeLessThan(1.6);
    expect(skyWet - skyDry).toBeGreaterThan(15);
    expect(unlockedS).toBe(0);
    expect(minBeacon).toBeGreaterThan(STEP_TRACK_FLOOR_DB + 0.5);
    // The ticker: the alarm keys on the C/N loss (attenuation + sky-noise rise), so the
    // 0.3 dB of C-band attenuation still shows as "RAIN FADE (about 1 dB)", info
    expect(rainAlarm?.severity).toBe('info');
    expect(rainAlarm?.message).toMatch(/^RAIN FADE \((0\.[89]|1\.[0-3]) dB\)$/u);
    // Why the anchor: program-track has under 1 dB over the lock, less than the rain costs
    expect(ptBeacon - STEP_TRACK_FLOOR_DB).toBeLessThan(dryBeacon - wetBeacon);
  });
});
