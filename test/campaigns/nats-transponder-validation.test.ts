/**
 * C1 transponder on the real chain (phase 19.3).
 *
 * VT-01 radiates TIDEMARK-1-Teleport into TM-1 TP-1 through the uplink path
 * (FSPL, pattern) and the transponder (SFD, G/T, TWTA), and receives it back:
 *
 * - its carrier replaces the authored TDMA composite it stands in for, at
 *   about the composite's level (IBO ~3 dB, C/N ~13 dB; it decoded itself at
 *   43.5 dB while the uplink had no path loss, DEV-XPDR-01);
 * - the C/N it reports is the composite of the uplink and downlink terms;
 * - more HPA power runs the transponder into saturation (a fraction of a dB
 *   more downlink for 6 dB more uplink);
 * - muting the transmit chain hands the transponder back to the stand-in.
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
import { scenario1Data } from '@app/campaigns/nats/scenario1';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { Receiver } from '@app/equipment/receiver/receiver';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { combineCn0DbHz } from '@app/equipment/satellite/transponder-model';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Rng } from '@app/simulation/rng';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';

const TM1 = 61525;

function vt01Chain() {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(1234);
  document.body.innerHTML = '<div id="tv-fe"></div><div id="tv-rx"></div><div id="tv-tx"></div>';
  const gs = (scenario1Data.settings.groundStations as GroundStationConfig[]).find((s) => s.id === 'VT-01') as GroundStationConfig;
  simSatellites = scenario1Data.settings.satellites as Satellite[];
  for (const s of simSatellites) {
    (s as unknown as { health: number }).health = 1;
    s.rxSignal = [];
    s.configureDegradation({ powerVariation: false });
  }
  const sat = simSatellites.find((s) => s.noradId === TM1) as Satellite;

  const state = { ...(gs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('tv-ant', 'headless', gs.antennaConfigKey ?? gs.antennas[0], state, gs.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
  const frontEnd = createRFFrontEnd('tv-fe', gs.rfFrontEnds[0], 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('tv-rx', [antenna], gs.receivers?.[0], gs.teamId ?? 1);
  receiver.connectRfFrontEnd(frontEnd);
  const modems = (gs as unknown as { transmitters: Array<{ modems: unknown[] }> }).transmitters[0].modems;
  frontEnd.connectTransmitter({ state: { modems }, isModemInIntermittentDropout: () => false } as never);

  antenna.handleTrackingModeChange('program-track');
  antenna.handleTargetSatelliteChange(TM1);

  const fly = (ms: number) => {
    const steps = Math.round(ms / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      simNowMs += FIXED_STEP_MS;
      SimClock.step();
      for (const s of simSatellites) s.update();
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
    }
  };
  const read = () => receiver.getSignalsInBandwidth(receiver.state.modems[0]);
  const tp = () => sat.operatingPoint('TP-1');

  return { sat, antenna, frontEnd, receiver, fly, read, tp };
}

describe('C1 transponder (phase 19.3)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    for (const s of simSatellites) s.configureDegradation({ powerVariation: true });
    EventBus.destroy();
    vi.restoreAllMocks();
  });

  it("VT-01's own carrier replaces the composite stand-in, ~3 dB under saturation, at the composite's C/N", () => {
    const { fly, read, tp } = vt01Chain();
    fly(60_000);

    const info = read();
    const point = tp();
    expect(info.targetSignalId).toBe('TIDEMARK-1-Teleport');
    expect(point?.carriers.map((c) => c.signalId)).toEqual(['TIDEMARK-1-Teleport']);
    expect(point?.iboDb).toBeGreaterThan(2);
    expect(point?.iboDb).toBeLessThan(4.5);
    expect(info.cnRatio_dB).toBeGreaterThan(12);
    expect(info.cnRatio_dB).toBeLessThan(15);
    expect(info.hasLock).toBe(true);
  });

  it('the C/N it reports is (C/N_up)^-1 + (C/N_down)^-1', () => {
    const { sat, fly, read } = vt01Chain();
    fly(60_000);
    const composite = read();
    const relayed = sat.txSignal.find((s) => s.signalId === 'TIDEMARK-1-Teleport');
    const cnUpDb = (relayed?.upstreamCn0DbHz as number) - 10 * Math.log10(36e6);

    // The same downlink with a noiseless uplink: G/T raised out of the way
    const tp1 = sat.transponders.find((tp) => tp.id === 'TP-1');
    if (!tp1) throw new Error('TM-1 has no TP-1');
    const gOverT = tp1.physics.gOverTDbK;
    tp1.physics.gOverTDbK = 60;
    fly(1_000);
    const downlinkOnly = read();
    tp1.physics.gOverTDbK = gOverT;

    expect(cnUpDb).toBeGreaterThan(20);
    expect(cnUpDb).toBeLessThan(28);
    expect(composite.cnRatio_dB).toBeCloseTo(combineCn0DbHz(cnUpDb, downlinkOnly.cnRatio_dB), 1);
    expect(downlinkOnly.cnRatio_dB - composite.cnRatio_dB).toBeGreaterThan(0.1);
  });

  it('6 dB more HPA power saturates the transponder: well under a dB more downlink', () => {
    const { frontEnd, fly, read, tp } = vt01Chain();
    fly(60_000);
    const nominal = read().cnRatio_dB;
    const nominalObo = tp()?.oboDb as number;

    frontEnd.hpaModule.state.backOff = 4;
    fly(10_000);
    const hot = read().cnRatio_dB;

    expect(tp()?.iboDb).toBeLessThan(-2);
    expect(nominalObo).toBeGreaterThan(0.3);
    expect(hot - nominal).toBeLessThan(0.8);
    expect(hot - nominal).toBeGreaterThan(-1.5);
  });

  it('muting the transmit chain hands TP-1 back to the authored stand-in', () => {
    const { sat, frontEnd, fly, read, tp } = vt01Chain();
    fly(30_000);
    expect(read().targetSignalId).toBe('TIDEMARK-1-Teleport');

    frontEnd.bucModule.state.isMuted = true;
    fly(5_000);

    // A muted BUC's noise still leaves the HPA, far under the transponder's
    // own noise: it loads TP-1 but is not relayed, and the stand-in is back
    const relayed = sat.txSignal.filter((s) => s.upstreamCn0DbHz !== undefined).map((s) => s.signalId);
    expect(relayed).toEqual(['TIDEMARK-1-TDMA-Composite']);
    expect(tp()?.carriers.map((c) => c.signalId)).toContain('TIDEMARK-1-TDMA-Composite');
    expect(read().targetSignalId).toBe('TIDEMARK-1-TDMA-Composite');
    expect(read().cnRatio_dB).toBeGreaterThan(12);
  });
});
