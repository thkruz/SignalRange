/**
 * Downlink propagation: every satellite carrier, beacons included, arrives
 * through the antenna pattern at its true off-axis angle (Phase 32 D18,
 * nats-r7-s06-F2).
 *
 * Built on S6 "Old Faithful" as authored: VT-01 in program-track on
 * TIDEMARK-1 (Az 153.2 / El 35.2) with the beacon receiver pre-set to
 * AURORA-7's 4165 MHz, AURORA-7 about 35 deg away. The analyzer reads the
 * RX IF tap (after LNB, IF filter and AGC), so that is what is measured.
 *
 * - On TIDEMARK-1 AURORA-7's beacon sits at the sidelobe floor (~55 dB under
 *   boresight), far under the noise: nothing at 1085 MHz.
 * - Program-track on AURORA-7 (its ~0.4 deg ephemeris error) puts the beacon
 *   at the S6 ledger's -74.3 dBm with the AGC at max (no carrier yet);
 *   step-track only raises it.
 * - With the station's own carrier relayed, the AGC backs off and the same
 *   beacon reads several dB lower at the IF: that is the AGC holding its
 *   output, not the pointing (the -79.5 dBm the r7 run read at 14:09).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let simNowMs = Date.UTC(2026, 1, 5, 14, 0, 0);

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
import { scenario6Data } from '@app/campaigns/nats/scenario6';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { Receiver } from '@app/equipment/receiver/receiver';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';

const AURORA_7 = 28899;
const BEACON_ID = 'AURORA-7-Beacon';
/** S6 calibration ledger: AURORA-7's beacon at the IF under program-track, AGC at max (test/calibration/nats-scenario6.json) */
const LEDGER_BEACON_IF_DBM = -74.28;

/** VT-01 as S6 authors it, wired as GroundStation does; `txIfHz` keys the AURORA-7 carrier at that IF */
function s6Station(txIfHz?: number) {
  EventBus.destroy();
  SimClock.reset(simNowMs);
  document.body.innerHTML = '<div id="p-fe"></div><div id="p-rx"></div>';
  const gs = (scenario6Data.settings.groundStations as GroundStationConfig[]).find((s) => s.id === 'VT-01')!;
  simSatellites = scenario6Data.settings.satellites as Satellite[];
  for (const s of simSatellites) {
    (s as unknown as { health: number }).health = 1;
    // Module-singleton satellites: drop the last test's arrivals
    s.rxSignal = [];
  }

  const state = { ...(gs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('p-ant', 'headless', gs.antennaConfigKey ?? gs.antennas[0], state, gs.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
  const frontEnd = createRFFrontEnd('p-fe', gs.rfFrontEnds[0], 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('p-rx', [antenna], gs.receivers?.[0], gs.teamId ?? 1);
  receiver.connectRfFrontEnd(frontEnd);

  const base = (gs.transmitters?.[0]?.modems?.[0] ?? {}) as { ifSignal?: object };
  const modems = txIfHz === undefined ? [] : [{ ...base, ifSignal: { ...base.ifSignal, frequency: txIfHz }, isTransmitting: true, isTransmittingSwitchUp: true }];
  frontEnd.connectTransmitter({ state: { modems }, isModemInIntermittentDropout: () => false } as never);

  const fly = (ms: number) => {
    const steps = Math.round(ms / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      simNowMs += FIXED_STEP_MS;
      SimClock.step();
      for (const s of simSatellites) {
        s.update();
      }
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
    }
  };

  const aurora = simSatellites.find((s) => s.noradId === AURORA_7)!;
  /** Pattern loss toward where AURORA-7 really is, dB, at its beacon frequency */
  const lossToAurora = () => {
    const view = antenna.viewOf(aurora);
    return antenna.pointingLossDb(view.az, view.el, 4165e6);
  };
  /** AURORA-7's beacon at the antenna output and at the analyzer's RX IF tap, dBm (null: not received) */
  const beacon = () => ({
    antennaDbm: antenna.state.rxSignalsIn.find((s) => s.signalId === BEACON_ID)?.power ?? null,
    ifDbm: (frontEnd.agcModule.outputSignals.find((s) => s.signalId === BEACON_ID)?.power as number | undefined) ?? null,
  });

  return { antenna, frontEnd, fly, lossToAurora, beacon };
}

describe('Downlink propagation follows the antenna pattern (Phase 32 D18)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('S6 start: with the dish on TIDEMARK-1, AURORA-7 (35 deg off) is at the sidelobe floor and its beacon is not at the IF', () => {
    const { antenna, fly, lossToAurora, beacon } = s6Station();
    fly(5_000);

    expect(antenna.state.targetSatelliteId).toBe(61525);
    expect(antenna.state.azimuth).toBeCloseTo(153.2, 0);
    expect(antenna.state.elevation).toBeCloseTo(35.2, 0);
    // The pattern 30-40 deg off a 9 m dish at 4 GHz: the far-sidelobe floor, ~55 dB under the main beam
    const loss = lossToAurora();
    expect(loss).toBeGreaterThan(45);
    // The beacon carries that loss: under the antenna's detection floor, so not at the analyzer
    expect(beacon()).toEqual({ antennaDbm: null, ifDbm: null });
  });

  it('pointing at AURORA-7 never lowers its beacon: program-track reads the ledger level, step-track a little more', () => {
    const { antenna, frontEnd, fly, lossToAurora, beacon } = s6Station();
    fly(5_000);
    antenna.handleTargetSatelliteChange(AURORA_7);
    antenna.moveToTargetSatellite();
    // 35 deg at the pedestal's slew rate, then settle
    fly(110_000);

    const pt = beacon();
    const ptLoss = lossToAurora();
    expect(frontEnd.agcModule.state.currentGain).toBeCloseTo(frontEnd.agcModule.state.maxGain, 1);
    expect(pt.ifDbm).not.toBeNull();
    // The ephemeris error costs program-track a couple of dB; the ledger flies program-track too
    expect(ptLoss).toBeGreaterThan(1);
    expect(ptLoss).toBeLessThan(3);
    expect(pt.ifDbm!).toBeGreaterThan(LEDGER_BEACON_IF_DBM - 1);
    expect(pt.ifDbm!).toBeLessThan(LEDGER_BEACON_IF_DBM + 1);

    antenna.handleStepTrackToggle(true);
    fly(90_000);
    const st = beacon();
    console.info(
      `S6 AURORA-7 beacon at IF: program-track ${pt.ifDbm!.toFixed(2)} dBm (loss ${ptLoss.toFixed(2)} dB) | step-track ${st.ifDbm!.toFixed(2)} dBm (loss ${lossToAurora().toFixed(2)} dB), AGC ${frontEnd.agcModule.state.currentGain.toFixed(1)} dB`
    );
    expect(lossToAurora()).toBeLessThan(0.5);
    expect(st.ifDbm!).toBeGreaterThan(pt.ifDbm! + 1);
    expect(st.antennaDbm!).toBeGreaterThan(pt.antennaDbm! + 1);
  });

  it('with our carrier relayed the AGC backs off, so the same beacon reads lower at the IF while the antenna output does not move', () => {
    // S6's TX IF: BUC LO 7500 - TP-1 6053 = 1447 MHz
    const { antenna, frontEnd, fly, lossToAurora, beacon } = s6Station(1447e6);
    antenna.handleTargetSatelliteChange(AURORA_7);
    antenna.moveToTargetSatellite();
    fly(110_000);
    antenna.handleStepTrackToggle(true);
    fly(90_000);
    const before = beacon();
    const gainBefore = frontEnd.agcModule.state.currentGain;
    const cnBefore = antenna.state.beaconCN!;

    frontEnd.bucModule.handleMuteToggle(false);
    frontEnd.hpaModule.handleHpaToggle();
    fly(30_000);
    const after = beacon();
    const gainAfter = frontEnd.agcModule.state.currentGain;
    const cnAfter = antenna.state.beaconCN!;
    console.info(
      `S6 carrier up: beacon C/N ${cnBefore.toFixed(1)} -> ${cnAfter.toFixed(1)} dB, AGC ${gainBefore.toFixed(1)} -> ${gainAfter.toFixed(1)} dB, beacon IF ${before.ifDbm!.toFixed(2)} -> ${after.ifDbm!.toFixed(2)} dBm, antenna ${before.antennaDbm!.toFixed(2)} -> ${after.antennaDbm!.toFixed(2)} dBm (loss ${lossToAurora().toFixed(2)} dB)`
    );

    expect(gainAfter).toBeLessThan(gainBefore - 3);
    // The drop at the IF is the AGC's, within the beacon's slow fade
    expect(before.ifDbm! - after.ifDbm!).toBeGreaterThan(3);
    expect(Math.abs(before.ifDbm! - after.ifDbm! - (gainBefore - gainAfter))).toBeLessThan(1);
    expect(Math.abs(after.antennaDbm! - before.antennaDbm!)).toBeLessThan(1);
    // The ACU's beacon C/N is a ratio: the AGC moves signal and noise together
    expect(Math.abs(cnAfter - cnBefore)).toBeLessThan(1);
  });
});
