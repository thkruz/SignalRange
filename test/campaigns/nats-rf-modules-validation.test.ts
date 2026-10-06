/**
 * C1 RF-module lessons on the real chain (phase 19.6).
 *
 * - S21 (ME-02, TIDEMARK-2): the brief's notch (Notch 1, 1470 MHz IF, 8 MHz,
 *   30 dB) takes the jammer out and costs the carrier only the energy in that
 *   slice (about 1 dB, "a little SNR in that slice"), so the margin comes back.
 * - S16 (VT-01, TIDEMARK-1): the LNB's sticky reference-lock fault leaves its
 *   LO free-running; its phase noise degrades the customer receive (Es/N0
 *   down by a couple of dB, still locked) until the power cycle relocks it.
 *
 * Each station's chain (antenna, RF front end, receiver) is built from the
 * scenario's own ground-station config and flown at 60 Hz on SimClock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let simNowMs = Date.UTC(2026, 1, 20, 14, 34, 0);

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
import { scenario13Data } from '@app/campaigns/nats/scenario13';
import { scenario16Data } from '@app/campaigns/nats/scenario16';
import { scenario21Data } from '@app/campaigns/nats/scenario21';
import { scenario24Data } from '@app/campaigns/nats/scenario24';
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
import { dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';

function station(scenario: ScenarioData, id: string): GroundStationConfig {
  const gs = (scenario.settings.groundStations as GroundStationConfig[]).find((s) => s.id === id);
  if (!gs) throw new Error(`${scenario.id}: no ${id}`);
  return gs;
}

function chain(scenario: ScenarioData, stationId: string, noradId: number) {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(1234);
  document.body.innerHTML = '<div id="rv-fe"></div><div id="rv-rx"></div>';
  const gs = station(scenario, stationId);
  simSatellites = scenario.settings.satellites as Satellite[];
  for (const s of simSatellites) (s as unknown as { health: number }).health = 1;
  const sat = simSatellites.find((s) => s.noradId === noradId)!;

  const state = { ...(gs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('rv-ant', 'headless', gs.antennaConfigKey ?? gs.antennas[0], state, gs.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
  const frontEnd = createRFFrontEnd('rv-fe', gs.rfFrontEnds[0], 'standard');
  frontEnd.groundStationId = gs.id;
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('rv-rx', [antenna], gs.receivers?.[0], gs.teamId ?? 1);
  receiver.connectRfFrontEnd(frontEnd);
  // Receive-only checks: the station's own uplink would sit on the payload
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

  /** Modem 1 over `ms`: lock fraction, mean Es/N0 and margin */
  const watch = (ms: number) => {
    const modem = receiver.state.modems[0];
    let locked = 0;
    let sumEs = 0;
    let sumMargin = 0;
    let n = 0;
    const steps = Math.round(ms / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      fly(FIXED_STEP_MS);
      const info = receiver.getSignalsInBandwidth(modem);
      if (info.hasLock) locked++;
      sumEs += info.effectiveEsN0_dB ?? Number.NEGATIVE_INFINITY;
      sumMargin += info.lockMargin_dB ?? Number.NEGATIVE_INFINITY;
      n++;
    }
    return { lockedFraction: locked / n, meanEsN0: sumEs / n, meanMargin: sumMargin / n };
  };

  return { sat, frontEnd, receiver, fly, watch };
}

describe('C1 RF-module lessons (phase 19.6)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('S21: the brief notch removes the jammer and costs the carrier only its 8 MHz slice', () => {
    const { sat, fly, watch, frontEnd } = chain(scenario21Data, 'ME-02', 61526);
    fly(60_000);
    // Carrier power out of the notch filter (the AGC after it re-levels the composite)
    const carrierPower = () => frontEnd.notchFilterModule.outputSignals.find((s) => s.signalId === 'TIDEMARK-2-TDMA-Composite')?.power ?? Number.NaN;

    const event = (scenario21Data.settings as { interferenceEvents: Array<{ frequency: number; bandwidth: number; power: number; polarization: 'H' | 'V' }> })
      .interferenceEvents[0];
    sat.externalSignal.push({
      signalId: 'rv-jammer',
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
    const jammed = watch(20_000);
    const beforeNotch = carrierPower();

    const notch = frontEnd.notchFilterModule;
    notch.state.isPowered = true;
    notch.handleNotchChange(0, { centerFrequency: 1470 as MHz, bandwidth: 8 as MHz, depth: 30 as never, enabled: true });
    fly(2_000);
    const notched = watch(20_000);
    const carrierCostDb = beforeNotch - carrierPower();
    const jammer = frontEnd.agcModule.outputSignals.find((s) => s.signalId === 'rv-jammer');

    console.info(
      `S21 ME-02 TM-2: jammed margin ${jammed.meanMargin.toFixed(2)} dB; notched margin ${notched.meanMargin.toFixed(2)} dB; carrier pays ${carrierCostDb.toFixed(2)} dB; jammer notch loss ${(jammer?.notchLossDb ?? 0).toFixed(1)} dB`
    );

    // The slice, not depth x overlap (that was ~5 dB)
    expect(carrierCostDb).toBeGreaterThan(0.4);
    expect(carrierCostDb).toBeLessThan(1.6);
    // The 6 MHz jammer sits inside the 8 MHz stop band (its edges on the skirts)
    expect(jammer?.notchLossDb ?? 0).toBeGreaterThan(20);
    expect(notched.meanMargin).toBeGreaterThan(jammed.meanMargin + 2);
    expect(notched.lockedFraction).toBe(1);
    sat.externalSignal = sat.externalSignal.filter((s) => s.signalId !== 'rv-jammer');
  });

  it('S16: the LNB reference unlock degrades the customer receive until the power cycle relocks it', () => {
    const { fly, watch, frontEnd } = chain(scenario16Data, 'VT-01', 61525);
    fly(60_000);
    expect(frontEnd.lnbModule.state.isExtRefLocked).toBe(false);
    const faulted = watch(20_000);

    // The recovery the scenario teaches: power cycle clears the sticky fault
    frontEnd.lnbModule.handlePowerToggle(false);
    fly(1_000);
    frontEnd.lnbModule.handlePowerToggle(true);
    fly(30_000);
    expect(frontEnd.lnbModule.state.isExtRefLocked).toBe(true);
    const relocked = watch(20_000);

    console.info(
      `S16 VT-01 TM-1: LNB unlocked Es/N0 ${faulted.meanEsN0.toFixed(2)} dB (locked ${(faulted.lockedFraction * 100).toFixed(0)} %); relocked ${relocked.meanEsN0.toFixed(2)} dB`
    );

    expect(relocked.meanEsN0 - faulted.meanEsN0).toBeGreaterThan(1.5);
    expect(faulted.lockedFraction).toBe(1);
    expect(relocked.lockedFraction).toBe(1);
  });
});

describe('C1 BUC thermal stories (phase 19.6)', () => {
  /** The scenario's VT-01/ME-02 front end with its staged buc-overtemp fault applied as HardwareFaultManager trips it */
  function bucChain(scenario: ScenarioData, stationId: string) {
    EventBus.destroy();
    SimClock.reset();
    Rng.setSeed(1234);
    document.body.innerHTML = '<div id="bt-fe"></div>';
    const gs = station(scenario, stationId);
    const frontEnd = createRFFrontEnd('bt-fe', gs.rfFrontEnds[0], 'standard');
    frontEnd.groundStationId = gs.id;
    const tx = (gs as unknown as { transmitters: Array<{ modems: Array<Record<string, unknown>> }> }).transmitters[0];
    frontEnd.connectTransmitter({ state: { modems: tx.modems.map((m) => ({ ...m, isFaulted: false, isLoopback: false })) }, isModemInIntermittentDropout: () => false } as never);
    const fault = (
      scenario.settings as {
        hardwareFaultEvents: Array<{ groundStationId: string; target: string; params: { startTemperatureC?: number; coolingFactor?: number; excessCurrentA?: number } }>;
      }
    ).hardwareFaultEvents.find((e) => e.groundStationId === stationId && e.target === 'buc-overtemp')!;
    const buc = frontEnd.bucModule;
    frontEnd.update();
    buc.setCoolingFactor(fault.params.coolingFactor ?? 1);
    buc.setExcessCurrent(fault.params.excessCurrentA ?? 0);
    buc.setTemperature(fault.params.startTemperatureC ?? buc.state.temperature);
    const run = (seconds: number) => {
      const steps = Math.round((seconds * 1000) / FIXED_STEP_MS);
      for (let i = 0; i < steps; i++) {
        SimClock.step();
        frontEnd.update();
      }
    };
    run(5);
    return { buc, run };
  }

  afterEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('S13: 62 degC climbing ~0.3 degC/min at 33 dB, 4.0 A; the 10 dB de-rate turns it under 61 degC within the 6 min step', () => {
    const { buc, run } = bucChain(scenario13Data, 'VT-01');
    const t0 = buc.state.temperature;
    run(60);
    const slope = buc.state.temperature - t0;
    expect(slope).toBeGreaterThan(0.2);
    expect(slope).toBeLessThan(0.45);
    expect(buc.state.currentDraw).toBeCloseTo(4.04, 1);
    expect(buc.state.temperature).toBeLessThan(70);

    buc.handleGainChange(23);
    run(10);
    expect(buc.state.currentDraw).toBeLessThan(3.2);
    let seconds = 10;
    while (buc.state.temperature >= 61 && seconds < 600) {
      run(10);
      seconds += 10;
    }
    console.info(`S13: climb ${slope.toFixed(2)} degC/min, under 61 degC ${seconds} s after the de-rate`);
    // The e2e spec waits up to 4 min; the step's timer is 6
    expect(seconds).toBeLessThan(3 * 60);
  });

  it('S16: over 70 degC with a high-current alarm; muted it idles at 2.6 A and passes under 70 in about a minute', () => {
    const { buc, run } = bucChain(scenario16Data, 'VT-01');
    expect(buc.state.temperature).toBeGreaterThan(70);
    expect(buc.state.currentDraw).toBeGreaterThan(4.5);
    expect(buc.getAlarms().some((a) => a.includes('high current'))).toBe(true);
    const before = buc.state.temperature;
    run(60);
    expect(buc.state.temperature).toBeGreaterThan(before);

    buc.handleMuteToggle(true);
    let seconds = 0;
    while (buc.state.temperature >= 70 && seconds < 600) {
      run(5);
      seconds += 5;
    }
    console.info(`S16: under 70 degC ${seconds} s after the mute, ${buc.state.currentDraw.toFixed(2)} A`);
    expect(buc.state.currentDraw).toBeLessThan(4.5);
    expect(seconds).toBeGreaterThan(30);
    expect(seconds).toBeLessThan(150);
  });

  it('S24: ME-02 63 degC and climbing at 33 dB; the de-rate brings current under 3.5 A and holds the temperature under 65 degC', () => {
    const { buc, run } = bucChain(scenario24Data, 'ME-02');
    const t0 = buc.state.temperature;
    run(60);
    expect(buc.state.temperature).toBeGreaterThan(t0);
    expect(buc.state.temperature).toBeLessThan(65);
    buc.handleGainChange(23);
    run(10);
    expect(buc.state.currentDraw).toBeLessThanOrEqual(3.5);
    expect(buc.state.temperature).toBeLessThanOrEqual(65);
    run(120);
    expect(buc.state.temperature).toBeLessThan(t0);
  });
});
