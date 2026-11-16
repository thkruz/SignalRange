/**
 * C1 transponder on the real chain (phase 19.3).
 *
 * VT-01 radiates TIDEMARK-1-Teleport into TM-1 TP-1 through the uplink path
 * (FSPL, pattern) and the transponder (SFD, G/T, TWTA), and receives it back:
 *
 * - its carrier is the only one in TP-1 (IBO ~3 dB, C/N ~13 dB; it decoded
 *   itself at 43.5 dB while the uplink had no path loss, DEV-XPDR-01);
 * - the C/N it reports is the composite of the uplink and downlink terms;
 * - more HPA power runs the transponder into saturation (a fraction of a dB
 *   more downlink for 6 dB more uplink);
 * - muting the transmit chain leaves TP-1 empty: since phase 27 there is no
 *   stand-in composite, the downlink is only what a station radiates;
 * - two sites radiating the hub carrier at once interfere; a break-before-make
 *   handover keeps the link (phase 27, DEV-XPDR-07 closed).
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
import { scenario6Data } from '@app/campaigns/nats/scenario6';
import { scenario8Data } from '@app/campaigns/nats/scenario8';
import { scenario11Data } from '@app/campaigns/nats/scenario11';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { Receiver } from '@app/equipment/receiver/receiver';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { combineCn0DbHz } from '@app/equipment/satellite/transponder-model';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SignalOrigin } from '@app/signal-origin';
import { Rng } from '@app/simulation/rng';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';
import type { dBi, dBm, FECType, Hertz, IfFrequency, ModulationType } from '@app/types';

const TM1 = 61525;

interface ChainOptions {
  scenario?: { settings: { groundStations?: unknown; satellites?: unknown } };
  stationId?: string;
  target?: number;
  /** Replace the station's TX modems (the player's configuration) */
  txModems?: unknown[];
  /** Front-end overrides applied after the scenario's own (a muted BUC, an HPA switched on) */
  prep?: (frontEnd: ReturnType<typeof createRFFrontEnd>) => void;
  /** Receiver modem 1 tuning, MHz */
  rx?: { frequency: number; bandwidth: number };
  /** A second station flown in the same sky (its TX only): a handover partner */
  partner?: { stationId: string; scenario?: ChainOptions['scenario']; txModems: unknown[]; prep?: ChainOptions['prep'] };
}

function stationChain(opts: ChainOptions = {}) {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(1234);
  document.body.innerHTML = '<div id="tv-fe"></div><div id="tv-rx"></div><div id="tv-tx"></div>';
  const data = opts.scenario ?? scenario1Data;
  const stationId = opts.stationId ?? 'VT-01';
  const target = opts.target ?? TM1;
  const gs = (data.settings.groundStations as GroundStationConfig[]).find((s) => s.id === stationId) as GroundStationConfig;
  simSatellites = data.settings.satellites as Satellite[];
  for (const s of simSatellites) {
    (s as unknown as { health: number }).health = 1;
    s.rxSignal = [];
    s.configureDegradation({ powerVariation: false });
  }
  const sat = simSatellites.find((s) => s.noradId === target) as Satellite;

  const state = { ...(gs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('tv-ant', 'headless', gs.antennaConfigKey ?? gs.antennas[0], state, gs.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
  const frontEnd = createRFFrontEnd('tv-fe', gs.rfFrontEnds[0], 'standard');
  opts.prep?.(frontEnd);
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('tv-rx', [antenna], gs.receivers?.[0], gs.teamId ?? 1);
  if (opts.rx) {
    receiver.state.modems[0].frequency = opts.rx.frequency as never;
    receiver.state.modems[0].bandwidth = opts.rx.bandwidth as never;
  }
  receiver.connectRfFrontEnd(frontEnd);
  const modems = opts.txModems ?? (gs as unknown as { transmitters: Array<{ modems: unknown[] }> }).transmitters[0].modems;
  frontEnd.connectTransmitter({ state: { modems }, isModemInIntermittentDropout: () => false } as never);

  antenna.handleTrackingModeChange('program-track');
  antenna.handleTargetSatelliteChange(target);

  let partnerFrontEnd: ReturnType<typeof createRFFrontEnd> | null = null;
  if (opts.partner) {
    const pdata = opts.partner.scenario ?? data;
    const pgs = (pdata.settings.groundStations as GroundStationConfig[]).find((s) => s.id === opts.partner?.stationId) as GroundStationConfig;
    const pAntenna = createAntenna(
      'tv-ant-2',
      'headless',
      pgs.antennaConfigKey ?? pgs.antennas[0],
      { ...(pgs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true },
      1
    ) as AntennaCore;
    pAntenna.attachStationLocation(pgs.location.latitude, pgs.location.longitude, pgs.location.elevation);
    document.body.insertAdjacentHTML('beforeend', '<div id="tv-fe-2"></div>');
    partnerFrontEnd = createRFFrontEnd('tv-fe-2', pgs.rfFrontEnds[0], 'standard');
    opts.partner.prep?.(partnerFrontEnd);
    partnerFrontEnd.connectAntenna(pAntenna);
    pAntenna.attachRfFrontEnd(partnerFrontEnd);
    partnerFrontEnd.connectTransmitter({ state: { modems: opts.partner.txModems }, isModemInIntermittentDropout: () => false } as never);
    pAntenna.handleTrackingModeChange('program-track');
    pAntenna.handleTargetSatelliteChange(target);
  }

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

  return { sat, antenna, frontEnd, receiver, fly, read, tp, partnerFrontEnd };
}

const vt01Chain = () => stationChain();

/** A modem's IF carrier as the player configures it (phase 27 P1 cases) */
function txModem(modemNumber: number, signalId: string, frequencyHz: number, bandwidthHz: number, noradId: number, isTransmitting = true) {
  return {
    isPowered: true,
    antenna_id: 1,
    modem_number: modemNumber,
    id: modemNumber,
    isFaulted: false,
    isLoopback: false,
    isTransmitting,
    isTransmittingSwitchUp: isTransmitting,
    isFaultSwitchUp: false,
    ifSignal: {
      signalId,
      serverId: 1,
      noradId,
      polarization: 'V',
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.TRANSMITTER,
      noiseFloor: null,
      gainInPath: 0 as dBi,
      frequency: frequencyHz as IfFrequency,
      power: -7 as dBm,
      bandwidth: bandwidthHz as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
    },
  };
}

const relayedIds = (sat: Satellite) => sat.txSignal.filter((s) => s.upstreamCn0DbHz !== undefined).map((s) => s.signalId);

describe('C1 transponder (phase 19.3)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    for (const s of simSatellites) s.configureDegradation({ powerVariation: true });
    EventBus.destroy();
    vi.restoreAllMocks();
  });

  it("VT-01's own carrier is TP-1's only carrier, ~3 dB under saturation, ~13 dB C/N", () => {
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

  it('muting the transmit chain leaves TP-1 empty: no stand-in, no carrier (phase 27)', () => {
    const { sat, frontEnd, fly, read } = vt01Chain();
    fly(30_000);
    expect(read().targetSignalId).toBe('TIDEMARK-1-Teleport');

    frontEnd.bucModule.state.isMuted = true;
    fly(5_000);

    // A muted BUC's noise still leaves the HPA, far under the transponder's
    // own noise: it loads TP-1 but is not relayed, and nothing else is up
    expect(relayedIds(sat)).toEqual([]);
    expect(read().hasLock).toBe(false);
  });
});

/**
 * Phase 27: the C1 stand-in composites are gone. A station's downlink is only
 * what a TX chain radiates, and two sites on one carrier interfere.
 */
describe('hub carriers are what the stations radiate (phase 27)', () => {
  const AURORA7 = 28899;

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    for (const s of simSatellites) s.configureDegradation({ powerVariation: true });
    EventBus.destroy();
    vi.restoreAllMocks();
  });

  it('S6 starts off-air on AURORA-7 (modem keyed into a muted BUC): no carrier until the player brings the chain up', () => {
    const chain = stationChain({ scenario: scenario6Data, target: AURORA7, rx: { frequency: 1422, bandwidth: 24 } });
    chain.fly(30_000);
    expect(relayedIds(chain.sat)).toEqual([]);
    expect(chain.read().hasLock).toBe(false);

    // Player: TX IF 1447, BUC unmuted, HPA on
    const modem = (chain.frontEnd.transmitters[0] as unknown as { state: { modems: Array<{ ifSignal: { frequency: number } }> } }).state.modems[0];
    modem.ifSignal.frequency = 1447e6;
    chain.frontEnd.bucModule.state.isMuted = false;
    chain.frontEnd.hpaModule.state.isHpaEnabled = true;
    chain.frontEnd.hpaModule.state.isHpaSwitchEnabled = true;
    // S6 starts on TIDEMARK-1's look angles (153.1 / 35.1, Phase 29): about 37 deg
    // of azimuth to AURORA-7 at 0.5 deg/s, so the dish needs ~75 s to arrive
    chain.fly(90_000);
    expect(relayedIds(chain.sat)).toEqual(['AURORA-7-Uplink']);
    expect(chain.read().cnRatio_dB).toBeGreaterThan(9);
  });

  it('S8: Modem 2 (default signal id) is the AURORA-7 carrier once keyed', () => {
    const { sat, fly, read } = stationChain({
      scenario: scenario8Data,
      target: AURORA7,
      txModems: [txModem(1, 'AURORA-7-Uplink', 1047e6, 24e6, AURORA7, false), txModem(2, 'gs-vt01-tx1-2-default', 1047e6, 24e6, AURORA7)],
      // The LNB's sticky reference fault is the S8 fault the player clears first
      prep: (fe) => {
        fe.lnbModule.state.isExtRefLocked = true;
        (fe.lnbModule.state as { hasRefLockFault?: boolean }).hasRefLockFault = false;
      },
    });
    fly(60_000);
    expect(relayedIds(sat)).toEqual(['gs-vt01-tx1-2-default']);
    expect(read().cnRatio_dB).toBeGreaterThan(9);
    expect(read().cnRatio_dB).toBeLessThan(16);
  });

  const me02Hot = (fe: ReturnType<typeof createRFFrontEnd>) => {
    fe.bucModule.state.isMuted = false;
    fe.hpaModule.state.isHpaEnabled = true;
    fe.hpaModule.state.isHpaSwitchEnabled = true;
  };

  it('a sloppy S11 handover (VT-01 and ME-02 both at full power on TM-1) is real co-channel interference', () => {
    const solo = stationChain({ scenario: scenario11Data });
    solo.fly(30_000);
    const clean = solo.read().cnRatio_dB;

    const both = stationChain({
      scenario: scenario11Data,
      partner: { stationId: 'ME-02', txModems: [txModem(1, 'TIDEMARK-1-Teleport', 1057e6, 36e6, TM1)], prep: me02Hot },
    });
    both.fly(30_000);
    // The stronger arrival (ME-02 hot) keeps the bare id, the weaker is the copy (Phase 32 D3)
    expect(relayedIds(both.sat)).toEqual(['TIDEMARK-1-Teleport#2', 'TIDEMARK-1-Teleport']);
    // Two copies on one frequency: the weaker is co-channel I on the stronger
    expect(clean).toBeGreaterThan(12);
    expect(clean - both.read().cnRatio_dB).toBeGreaterThan(6);
  });

  it('a break-before-make S11 handover keeps the link: ME-02 alone carries TM-1 at the same C/N', () => {
    const chain = stationChain({
      scenario: scenario11Data,
      partner: { stationId: 'ME-02', txModems: [txModem(1, 'TIDEMARK-1-Teleport', 1057e6, 36e6, TM1)] },
    });
    chain.fly(30_000);
    const before = chain.read().cnRatio_dB;
    // VT-01 drops, ME-02 comes up in the same step (TrafficControlManager.executeHandover)
    chain.frontEnd.hpaModule.state.isHpaEnabled = false;
    chain.frontEnd.bucModule.state.isMuted = true;
    if (chain.partnerFrontEnd) me02Hot(chain.partnerFrontEnd);
    chain.fly(10_000);
    expect(relayedIds(chain.sat)).toEqual(['TIDEMARK-1-Teleport']);
    expect(chain.read().hasLock).toBe(true);
    expect(Math.abs(chain.read().cnRatio_dB - before)).toBeLessThan(1.5);
  });
});
