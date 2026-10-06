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
function chain(scenario: ScenarioData, stationId: string, sat: Satellite) {
  EventBus.destroy();
  SimClock.reset();
  document.body.innerHTML = '<div id="st-fe"></div><div id="st-rx"></div>';
  const gs = station(scenario, stationId);
  simSatellites = scenario.settings.satellites as Satellite[];
  for (const s of simSatellites) (s as unknown as { health: number }).health = 1;

  const state = { ...(gs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('st-ant', 'headless', gs.antennaConfigKey ?? gs.antennas[0], state, gs.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
  const frontEnd = createRFFrontEnd('st-fe', gs.rfFrontEnds[0], 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('st-rx', [antenna], gs.receivers?.[0], gs.teamId ?? 1);
  receiver.connectRfFrontEnd(frontEnd);
  // No uplink in these checks: the station's own carrier would sit on the payload
  frontEnd.bucModule.state.isMuted = true;

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

  return { antenna, receiver, fly, lossToSat, carrierCn };
}

describe('C1 step-track lessons (phase 19.4)', () => {
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

  it('S22: AURORA-7 under step-track sits a measurable margin above the step-track floor', () => {
    const sat = (scenario22Data.settings.satellites as Satellite[]).find((s) => s.name === 'AURORA-7')!;
    const { antenna, fly, lossToSat, carrierCn } = chain(scenario22Data, 'VT-01', sat);

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
    // The brief's trackability row: about 2.3 dB above the 6.5 dB floor (-6.3 vs -4.0 relative)
    expect(stBeacon - STEP_TRACK_FLOOR_DB).toBeGreaterThan(1.8);
    expect(stBeacon - STEP_TRACK_FLOOR_DB).toBeLessThan(2.8);
    expect(stCarrier).toBeGreaterThan(8);
  });
});
