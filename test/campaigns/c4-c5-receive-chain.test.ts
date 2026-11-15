/**
 * Phase 47 N3: the C4 (ccs) and C5 (signal-hunter) S1 receive chains deliver
 * their authored carriers to the spectrum analyzer tap, above the noise.
 *
 * The C5 service carrier was authored at 20 dBm EIRP, 15.6 dB under the 9 m
 * dish's noise in its 8 MHz. AntennaCore drops any carrier under a -10 dB C/N
 * (RX_DETECTION_FLOOR_DB, phase 19.4), so the analyzer never saw it and the
 * trace was flat except for the 40 s of the duty-cycled jammer. Every
 * full-completion spec stayed green because they read the jammer, not the
 * carrier.
 *
 * Drives the real antenna, RF front end and station config, like
 * nats-eu-rf-validation.test.ts, with the station location attached as
 * GroundStation does.
 */

import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let simNowMs = 0;

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

let simSatellites: import('@app/equipment/satellite/orbital-satellite').OrbitalSatellite[] = [];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatsByAzEl: (az: number, el: number) => simSatellites.filter((sat) => Math.abs(sat.az - az) <= 1 && Math.abs(sat.el - el) <= 1),
      getSatByNoradId: (noradId: number) => simSatellites.find((sat) => sat.noradId === noradId) ?? null,
      isDeveloperMode: false,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import { sandstormGroundStation } from '@app/campaigns/ccs/ground-stations';
import { cobalt4Satellite } from '@app/campaigns/ccs/satellites';
import { petersonGroundStation } from '@app/campaigns/signal-hunter/ground-stations';
import { sentry7Satellite, sentry9Satellite } from '@app/campaigns/signal-hunter/satellites';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import type { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '@app/events/event-bus';
import { thermalNoiseDbm } from '@app/simulation/noise-model';
import type { RfSignal } from '@app/types';

/** A carrier must clear the noise in its own bandwidth by about this much to show as a trace peak */
const MIN_VISIBLE_CN_DB = 8;

/** Antenna-input C/N of a carrier, dB, against the antenna's own system noise */
function carrierToNoiseDb(antenna: AntennaCore, signal: RfSignal): number {
  const a = antenna as unknown as { systemNoise(f: number): { systemK: number }; noiseReferenceHz: number };

  return (signal.power as number) - thermalNoiseDbm(a.systemNoise(a.noiseReferenceHz).systemK, signal.bandwidth as number);
}

interface Chain {
  antenna: AntennaCore;
  frontEnd: RFFrontEndCore;
}

interface StationLike {
  antennas: string[];
  rfFrontEnds: unknown[];
  location: { latitude: number; longitude: number; elevation: number };
}

/** Same wiring as GroundStation: antenna, location, front end, in that order */
function buildChain(station: StationLike, antennaIndex: number, antennaState: Record<string, unknown>): Chain {
  const antenna = new AntennaUIHeadless('n3-antenna', station.antennas[antennaIndex] as never, antennaState as never, antennaIndex + 1);
  antenna.attachStationLocation(station.location.latitude, station.location.longitude, station.location.elevation);
  const frontEnd = createRFFrontEnd('n3-fe', station.rfFrontEnds[antennaIndex] as never, 'standard');
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);

  return { antenna, frontEnd };
}

function settle(chain: Chain): void {
  for (let i = 0; i < 120; i++) {
    simNowMs += 16;
    SimClock.step();
    for (const sat of simSatellites) sat.update();
    chain.antenna.update();
  }
  chain.frontEnd.update();
  chain.frontEnd.update();
}

describe('C5 signal-hunter S1: PA-22 receive chain', () => {
  let chain: Chain;

  beforeEach(() => {
    simNowMs = Date.UTC(2027, 8, 1, 6, 0, 0);
    simSatellites = [sentry7Satellite, sentry9Satellite];
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    document.body.innerHTML = '<div id="n3-fe"></div>';

    chain = buildChain(petersonGroundStation as unknown as StationLike, 0, petersonGroundStation.antennasState[0] as Record<string, unknown>);
    settle(chain);
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('receives the allied service carrier with a C/N the analyzer can show', () => {
    const service = chain.antenna.state.rxSignalsIn.find((s) => s.signalId === 'SENTRY-7-SERVICE');

    expect(service, 'service carrier dropped under the antenna C/N floor').toBeDefined();
    expect(carrierToNoiseDb(chain.antenna, service!)).toBeGreaterThan(MIN_VISIBLE_CN_DB);
  });

  it('delivers the service carrier to the RX IF tap at 1365 MHz (LNB LO 5150)', () => {
    const atIf = chain.frontEnd.agcModule.outputSignals.find((s) => s.signalId === 'SENTRY-7-SERVICE');

    expect(atIf, 'service carrier missing at the analyzer RX IF tap').toBeDefined();
    expect(Math.abs((atIf!.frequency as number) - 1365e6)).toBeLessThan(1e3);
  });

  it('still relays the hostile uplink inside TP-1 to 1354 MHz IF', () => {
    const external = sentry7Satellite as unknown as { externalSignal: RfSignal[] };
    external.externalSignal.push({
      signalId: 'INTERFERER-test',
      serverId: 1,
      noradId: 71001,
      frequency: 6021e6,
      polarization: 'H',
      power: 76.2,
      bandwidth: 3e6,
      modulation: 'null',
      fec: 'null',
      feed: '',
      isDegraded: false,
      origin: 'SATELLITE_RX',
      noiseFloor: null,
      gainInPath: 0,
    } as never);
    settle(chain);
    external.externalSignal = [];

    const jam = chain.frontEnd.agcModule.outputSignals.find((s) => s.signalId === 'INTERFERER-test');

    expect(jam).toBeDefined();
    expect(Math.abs((jam!.frequency as number) - 1354e6)).toBeLessThan(1e3);
  });
});

describe('C4 ccs S1: SANDSTORM monitor aperture receive chain', () => {
  let chain: Chain;

  beforeEach(() => {
    simNowMs = Date.UTC(2027, 10, 5, 2, 0, 0);
    simSatellites = [cobalt4Satellite];
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    document.body.innerHTML = '<div id="n3-fe"></div>';

    // The operator slews the monitor onto COBALT-4 (true look angles)
    const monitor = { ...(sandstormGroundStation.antennasState[1] as Record<string, unknown>), azimuth: 174.9, elevation: 50.4, targetAzimuth: 174.9, targetElevation: 50.4 };
    chain = buildChain(sandstormGroundStation as unknown as StationLike, 1, monitor);
    settle(chain);
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // C4 is the jamming campaign: the service downlink is the J/S victim and is authored close to the noise
  // on purpose, so this only proves it is received (above the antenna C/N floor) and routed to the IF.
  it('receives the relayed service carrier and puts it at 1450 MHz IF', () => {
    const service = chain.antenna.state.rxSignalsIn.find((s) => s.signalId === 'COBALT-4-SVC-Uplink');

    expect(service, 'service downlink dropped under the antenna C/N floor').toBeDefined();
    expect(carrierToNoiseDb(chain.antenna, service!)).toBeGreaterThan(-10);

    const atIf = chain.frontEnd.agcModule.outputSignals.find((s) => s.signalId === 'COBALT-4-SVC-Uplink');

    expect(atIf).toBeDefined();
    expect(Math.abs((atIf!.frequency as number) - 1450e6)).toBeLessThan(1e3);
  });
});
