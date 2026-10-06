/**
 * C1 modem lessons on the real chain (phase 19.5).
 *
 * Since 19.5 the modem locks on Es/N0 against its MODCOD's DVB-S2 threshold
 * (QPSK 3/4: 5.0 dB), so two Phase 26 stories are numbers the engine
 * produces:
 *
 * - S5 (VT-01, TIDEMARK-1, nats-s05-F1): the cross-pol spike leaves the
 *   customer "degraded, not down" - locked with under 1 dB of margin, never
 *   dropping lock - and the notch restores the link.
 * - S21 (ME-02, TIDEMARK-2, nats-s21-F6): the jammer is denser than the
 *   carrier where they overlap (so the analyzer shows it) and costs the
 *   carrier most of its margin while each burst is on, without a hard outage.
 *
 * Each station's chain (antenna, RF front end, receiver) is built from the
 * scenario's own ground-station config and flown at 60 Hz on SimClock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let simNowMs = Date.UTC(2026, 1, 4, 14, 30, 0);

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
import { scenario5Data } from '@app/campaigns/nats/scenario5';
import { scenario21Data } from '@app/campaigns/nats/scenario21';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { Receiver } from '@app/equipment/receiver/receiver';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import { Rng } from '@app/simulation/rng';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';
import { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';

function station(scenario: ScenarioData, id: string): GroundStationConfig {
  const gs = (scenario.settings.groundStations as GroundStationConfig[]).find((s) => s.id === id);
  if (!gs) throw new Error(`${scenario.id}: no ${id}`);
  return gs;
}

/** One station's antenna + front end + receiver, wired as GroundStation does, on `sat` */
function chain(scenario: ScenarioData, stationId: string, sat: Satellite) {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(1234);
  document.body.innerHTML = '<div id="mv-fe"></div><div id="mv-rx"></div>';
  const gs = station(scenario, stationId);
  simSatellites = scenario.settings.satellites as Satellite[];
  for (const s of simSatellites) (s as unknown as { health: number }).health = 1;

  const state = { ...(gs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('mv-ant', 'headless', gs.antennaConfigKey ?? gs.antennas[0], state, gs.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
  const frontEnd = createRFFrontEnd('mv-fe', gs.rfFrontEnds[0], 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('mv-rx', [antenna], gs.receivers?.[0], gs.teamId ?? 1);
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

  /** Modem 1 over `ms`, sampled every step: lock seconds, margins, degraded seconds */
  const watch = (ms: number) => {
    const modem = receiver.state.modems[0];
    let locked = 0;
    let degraded = 0;
    let minMargin = Number.POSITIVE_INFINITY;
    let maxMargin = Number.NEGATIVE_INFINITY;
    let sumMargin = 0;
    let n = 0;
    const steps = Math.round(ms / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      fly(FIXED_STEP_MS);
      const info = receiver.getSignalsInBandwidth(modem);
      if (info.hasLock) locked++;
      if (info.isLowMargin) degraded++;
      const m = info.lockMargin_dB ?? Number.NEGATIVE_INFINITY;
      minMargin = Math.min(minMargin, m);
      maxMargin = Math.max(maxMargin, m);
      sumMargin += m;
      n++;
    }
    return { lockedFraction: locked / n, degradedFraction: degraded / n, minMargin, maxMargin, meanMargin: sumMargin / n };
  };

  return { antenna, frontEnd, receiver, fly, watch };
}

describe('C1 modem lessons (phase 19.5)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('S5: the cross-pol spike leaves TIDEMARK-1 degraded but locked, never down', () => {
    const sat = (scenario5Data.settings.satellites as Satellite[]).find((s) => s.noradId === 61525)!;
    const { watch, fly } = chain(scenario5Data, 'VT-01', sat);

    fly(60_000);
    const w = watch(180_000);
    console.info(
      `S5 VT-01 TM-1 with the spike: locked ${(w.lockedFraction * 100).toFixed(0)} %, degraded ${(w.degradedFraction * 100).toFixed(0)} %, margin ${w.minMargin.toFixed(2)}..${w.maxMargin.toFixed(2)} dB (mean ${w.meanMargin.toFixed(2)})`
    );

    // The customer's story: degraded service, not an outage
    expect(w.lockedFraction).toBe(1);
    expect(w.degradedFraction).toBe(1);
    expect(w.minMargin).toBeGreaterThan(-0.5);
    expect(w.maxMargin).toBeLessThan(1.5);
  });

  it('S5: with the notch on the spike (1515 MHz IF, 1 MHz, 40 dB) the link is back to a good margin', () => {
    const sat = (scenario5Data.settings.satellites as Satellite[]).find((s) => s.noradId === 61525)!;
    const { watch, fly, frontEnd } = chain(scenario5Data, 'VT-01', sat);

    const notch = frontEnd.notchFilterModule;
    notch.state.isPowered = true;
    notch.state.notches[0] = { ...notch.state.notches[0], enabled: true, centerFrequency: 1515, bandwidth: 1, depth: 40 };
    fly(60_000);
    const w = watch(60_000);
    console.info(`S5 VT-01 TM-1 notched: margin ${w.minMargin.toFixed(2)}..${w.maxMargin.toFixed(2)} dB`);

    expect(w.lockedFraction).toBe(1);
    expect(w.degradedFraction).toBe(0);
    expect(w.minMargin).toBeGreaterThan(5);
  });

  it('S21: the jammer stands above the carrier on the analyzer and costs it most of its margin, without an outage', () => {
    const sat = (scenario21Data.settings.satellites as Satellite[]).find((s) => s.noradId === 61526)!;
    const { watch, fly, frontEnd } = chain(scenario21Data, 'ME-02', sat);
    fly(60_000);
    const clean = watch(20_000);

    // Radiate the scenario's jammer into the transponder as InterferenceManager does
    const event = (scenario21Data.settings as { interferenceEvents: Array<{ frequency: number; bandwidth: number; power: number; polarization: 'H' | 'V' }> })
      .interferenceEvents[0];
    sat.externalSignal.push({
      signalId: 'mv-jammer',
      serverId: 1,
      noradId: sat.noradId,
      frequency: event.frequency as RfFrequency,
      polarization: event.polarization,
      power: event.power as dBm,
      bandwidth: event.bandwidth as Hertz,
      modulation: 'null' as ModulationType,
      fec: 'null' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    });
    fly(5_000);
    const jammed = watch(60_000);

    // Spectral density at the IF: the jammer is above the carrier where they overlap
    const outputs = frontEnd.agcModule.outputSignals;
    const jammer = outputs.find((s) => s.signalId === 'mv-jammer');
    const carrier = outputs.find((s) => s.signalId === 'TIDEMARK-2-TDMA-Composite');
    expect(jammer, 'jammer reaches the receiver').toBeDefined();
    expect(carrier).toBeDefined();
    const density = (s: { power: number; bandwidth: number }) => s.power - 10 * Math.log10(s.bandwidth);
    const shelfDb = density(jammer!) - density(carrier!);

    console.info(
      `S21 ME-02 TM-2: clean margin ${clean.meanMargin.toFixed(2)} dB; jammed ${jammed.minMargin.toFixed(2)}..${jammed.maxMargin.toFixed(2)} dB, locked ${(jammed.lockedFraction * 100).toFixed(0)} %; jammer density ${shelfDb.toFixed(2)} dB over the carrier`
    );

    expect(clean.minMargin).toBeGreaterThan(7.5); // 19.3: the relayed uplink noise (C/N_up ~24 dB) costs ~0.6 dB
    // On the analyzer the jammed 6 MHz reads carrier + jammer: a shelf of
    // 10 log(1 + 10^(shelf/10)) over the carrier's own level
    expect(10 * Math.log10(1 + 10 ** (shelfDb / 10))).toBeGreaterThan(2);
    expect(jammed.meanMargin).toBeLessThan(2);
    expect(jammed.minMargin).toBeLessThan(1);
    expect(jammed.lockedFraction).toBeGreaterThan(0.95);
    sat.externalSignal = sat.externalSignal.filter((s) => s.signalId !== 'mv-jammer');
  });
});
