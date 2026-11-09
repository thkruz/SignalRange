/**
 * Phase 38.1 WP3: the physical plant on the real RF chain.
 *
 * - C1 identity: a nats station (VT-01, TIDEMARK-1) flown with no plant and with
 *   a healthy attached plant produces exactly the same C/N, Es/N0, Tsys and cable loss.
 * - Frontline sandbox: the healthy link locks; an unseated feed connector breaks
 *   it and a reseat restores it; a crushed IFL cuts the LNB but not the antenna drive.
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
import { frontlineSandboxData } from '@app/campaigns/frontline/sandbox';
import { scenario16Data } from '@app/campaigns/nats/scenario16';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { createAntenna } from '@app/equipment/antenna/antenna-factory';
import { Receiver } from '@app/equipment/receiver/receiver';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { plantPowers, setActivePlant } from '@app/physical/plant-bridge';
import type { ScenarioData } from '@app/ScenarioData';
import { fnv1a, Rng, RngStream } from '@app/simulation/rng';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';

function station(scenario: ScenarioData, id: string): GroundStationConfig {
  const gs = (scenario.settings.groundStations as GroundStationConfig[]).find((s) => s.id === id);
  if (!gs) throw new Error(`${scenario.id}: no ${id}`);
  return gs;
}

function chain(scenario: ScenarioData, stationId: string, noradId: number, plantConfig?: PlantConfig) {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(1234);
  document.body.innerHTML = '<div id="rv-fe"></div><div id="rv-rx"></div>';
  const gs = station(scenario, stationId);
  simSatellites = scenario.settings.satellites as Satellite[];
  for (const s of simSatellites) s.rxSignal = [];
  for (const s of simSatellites) (s as unknown as { health: number }).health = 1;
  const sat = simSatellites.find((s) => s.noradId === noradId)!;

  let plant: PhysicalPlantManager | null = null;
  // Same bookkeeping as PhysicalPlantService: feed the plant the scenario seconds since the last sync
  let lastSyncS = 0;
  const sync = () => {
    const nowS = SimClock.scenarioElapsedMs() / 1000;
    const dt = nowS - lastSyncS;
    lastSyncS = nowS;
    if (dt > 0) plant?.update(dt);
  };
  if (plantConfig) {
    const streams = new Map<string, RngStream>();
    plant = new PhysicalPlantManager(plantConfig, {
      now: () => SimClock.scenarioElapsedMs() / 1000,
      skip: (seconds) => {
        SimClock.skip(seconds * 1000);
        sync();
      },
      env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
      rng: (name) => {
        let s = streams.get(name);
        if (!s) {
          s = new RngStream(fnv1a(`1:${name}`));
          streams.set(name, s);
        }

        return s;
      },
    });
    setActivePlant(plant);
  } else {
    setActivePlant(null);
  }

  const state = { ...(gs.antennasState?.[0] ?? {}), isPowered: true, isOperational: true };
  const antenna = createAntenna('rv-ant', 'headless', gs.antennaConfigKey ?? gs.antennas[0], state, gs.teamId ?? 1) as AntennaCore;
  antenna.attachStationLocation(gs.location.latitude, gs.location.longitude, gs.location.elevation);
  const frontEnd = createRFFrontEnd('rv-fe', gs.rfFrontEnds[0], 'standard');
  frontEnd.groundStationId = gs.id;
  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('rv-rx', [antenna], gs.receivers?.[0], gs.teamId ?? 1);
  receiver.connectRfFrontEnd(frontEnd);
  const txModems = (gs.transmitters?.[0]?.modems ?? []) as unknown[];
  frontEnd.connectTransmitter({ state: { modems: txModems }, isModemInIntermittentDropout: () => false } as never);

  antenna.handleTrackingModeChange('program-track');
  antenna.handleTargetSatelliteChange(sat.noradId);

  const fly = (seconds: number) => {
    const steps = Math.round((seconds * 1000) / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      simNowMs += FIXED_STEP_MS;
      SimClock.step();
      sync();
      for (const s of simSatellites) s.update();
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
    }
  };

  const read = () => {
    const info = receiver.getSignalsInBandwidth(receiver.state.modems[0]);

    return {
      hasLock: info.hasLock,
      cn: info.cnRatio_dB,
      esN0: info.effectiveEsN0_dB,
      margin: info.lockMargin_dB,
      level: info.signalLevel_dBm,
      tsys: frontEnd.signalPathManager.systemNoiseK(),
      cableRxIf: frontEnd.cableLossDb('rxIf'),
    };
  };

  return { sat, antenna, frontEnd, receiver, plant, fly, read };
}

describe('physical plant on the real chain (phase 38.1)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    setActivePlant(null);
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('C1 identity: a healthy attached plant leaves VT-01 C/N, level, Tsys and cable loss exactly equal', () => {
    const healthy: PlantConfig = {
      stationId: 'VT-01',
      parts: [
        { id: 'generator', kind: 'generator', ratedW: 2000, fuelL: 6, nominalV: 230 },
        { id: 'power-station', kind: 'battery', poweredBy: 'generator', maxOutputW: 600, socWh: 900, capacityWh: 1000, nominalV: 12, loadW: 20 },
        { id: 'vsat-modem', kind: 'modem', poweredBy: 'power-station', loadW: 40 },
        { id: 'vsat-dish', kind: 'dish', poweredBy: 'power-station', loadW: 5 },
      ],
      cables: [],
      connectors: [{ id: 'vsat-feed', partId: 'vsat-dish', role: 'pre-lna' }],
    };
    const run = (cfg?: PlantConfig) => {
      const c = chain(scenario16Data, 'VT-01', 61525, cfg);
      c.fly(120);
      const out = c.read();
      c.fly(5);

      return { first: out, second: c.read() };
    };
    const bare = run();
    const withPlant = run(healthy);

    expect(bare.first.hasLock).toBe(true);
    expect(withPlant.first).toEqual(bare.first);
    expect(withPlant.second).toEqual(bare.second);
  });

  describe('frontline sandbox', () => {
    const sandbox = () => chain(frontlineSandboxData, 'FL-01', 62009, frontlineSandboxData.settings.physicalPlant);

    it('healthy link: the modem locks with margin, LNB and drive powered', () => {
      const c = sandbox();
      c.fly(150);
      const r = c.read();

      expect(r.hasLock).toBe(true);
      expect(r.margin).toBeGreaterThan(2);
      expect(plantPowers('lnb')).toBe(true);
      expect(plantPowers('antenna')).toBe(true);
    });

    it('unseated vsat-feed drops C/N and loses lock; reseat recovers', () => {
      const c = sandbox();
      c.fly(150);
      const healthy = c.read();
      c.plant!.injectFault({ id: 'f-feed', target: 'vsat-feed', kind: 'unseated' });
      c.fly(10);
      const broken = c.read();

      expect(healthy.hasLock).toBe(true);
      expect(broken.hasLock).toBe(false);
      expect(broken.cn).toBeLessThan(healthy.cn - 20);

      const rs = c.plant!.reseat('vsat-feed');
      expect(rs.cleared?.length).toBeGreaterThan(0);
      c.fly(30);
      const fixed = c.read();
      expect(fixed.hasLock).toBe(true);
      expect(fixed.cn).toBeCloseTo(healthy.cn, 1);
    });

    it('a 6 dB feed connector fault breaks lock', () => {
      const c = sandbox();
      c.fly(150);
      const healthy = c.read();
      c.plant!.injectFault({ id: 'f-corr', target: 'vsat-feed', kind: 'corrosion', severity: 1 } as never);
      c.fly(10);
      const broken = c.read();

      expect(broken.cn).toBeLessThan(healthy.cn - 4);
      expect(broken.hasLock).toBe(false);
    });

    it('cable-crush on vsat-ifl cuts the LNB but not the antenna drive; swap recovers', () => {
      const c = sandbox();
      c.fly(150);
      expect(c.read().hasLock).toBe(true);
      c.plant!.injectFault({ id: 'f-ifl', target: 'vsat-ifl', kind: 'cable-crush', atMeters: 12 });
      c.fly(10);

      expect(plantPowers('lnb')).toBe(false);
      expect(plantPowers('antenna')).toBe(true);
      expect(c.antenna.isLivePowered).toBe(true);
      expect(c.read().hasLock).toBe(false);

      const sw = c.plant!.swap('vsat-ifl');
      expect(sw.cleared?.length).toBeGreaterThan(0);
      c.fly(60);
      expect(plantPowers('lnb')).toBe(true);
      expect(c.read().hasLock).toBe(true);
    });
  });
});
