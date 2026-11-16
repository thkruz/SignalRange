/**
 * M03 power modes, readings and forecast. Modes change the real draw, the forecast is a pure
 * preview that matches a stepped run, and the S2 sandbox numbers behave as planned.
 */

import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PartModeConfig, PlantConfig } from '@app/physical/physical-plant-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

interface Rig {
  plant: PhysicalPlantManager;
  now: () => number;
  streamsAsked: Set<string>;
  tick: (seconds: number) => void;
}

function makeRig(config: PlantConfig): Rig {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const streamsAsked = new Set<string>();
  let plant: PhysicalPlantManager;
  const tick = (seconds: number): void => {
    for (let i = 0; i < seconds; i++) {
      t += 1;
      plant.update(1);
    }
  };
  plant = new PhysicalPlantManager(config, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      streamsAsked.add(name);
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`m03:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });

  return { plant, now: () => t, streamsAsked, tick };
}

const standbyActive = (activeW: number, startupS = 0, startupW?: number): PartModeConfig[] => [
  { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
  { id: 'active', label: 'Active', loadW: activeW, startupS, startupW, servesTraffic: true },
];

/** The S2 sandbox: battery-only, loads station 10, router 20, SkyLink 50, VSAT modem+antenna+LNB 50 as one mode, laptop 45 */
function s2Config(skylink: string, vsat: string, extra: Partial<PlantConfig> = {}): PlantConfig {
  return {
    parts: [
      { id: 'power-station', kind: 'battery', label: 'Power station', capacityWh: 1000, socWh: 450, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'power-strip', kind: 'strip', label: 'Power strip', poweredBy: 'power-station', loadW: 10, nominalV: 12 },
      { id: 'skylink-router', kind: 'router', label: 'Router', poweredBy: 'power-strip', loadW: 20, nominalV: 12 },
      { id: 'laptop', kind: 'client', label: 'Laptop', poweredBy: 'power-strip', loadW: 45, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink dish', poweredBy: 'power-strip', nominalV: 12, mode: skylink, modes: standbyActive(50) },
      { id: 'vsat-modem', kind: 'modem', label: 'VSAT modem', poweredBy: 'power-strip', nominalV: 12, mode: vsat, modes: standbyActive(50) },
    ],
    connectors: [],
    cables: [],
    power: { reserveWh: 200, planningHorizonS: 5400, basis: 'battery-only' },
    ...extra,
  };
}

describe('M03 modes change the draw', () => {
  it('mode load drives getLoadW, readings and battery drain', () => {
    const { plant, tick } = makeRig(s2Config('standby', 'standby'));
    expect(plant.getPartMode('skylink')).toBe('standby');
    expect(plant.getLoadW('skylink')).toBe(0);
    expect(plant.getPowerReadings().totalDrawW).toBe(10 + 20 + 45);
    const before = plant.getPowerReadings().socWh['power-station'];
    tick(3600);
    const used = before - plant.getPowerReadings().socWh['power-station'];
    expect(used).toBeCloseTo(75, 0);

    const result = plant.setPartMode('skylink', 'active');
    expect(result.costSeconds).toBe(20);
    expect(plant.getPartMode('skylink')).toBe('active');
    expect(plant.getLoadW('skylink')).toBe(50);
    expect(plant.getPowerReadings().totalDrawW).toBe(125);
    expect(plant.getPowerReadings().modes.skylink).toBe('active');
    expect(plant.getPowerReadings().reserveWh).toBe(200);
  });

  it('a mode with startupS draws startupW while starting, then settles', () => {
    const config = s2Config('standby', 'standby');
    config.parts[4] = { ...config.parts[4], modes: standbyActive(50, 60, 90) };
    const { plant, tick } = makeRig(config);
    plant.setPartMode('skylink', 'active');
    expect(plant.isStarting('skylink')).toBe(true);
    expect(plant.getPartState('skylink')?.starting).toBe(true);
    expect(plant.getPowerReadings().totalDrawW).toBe(75 + 90);
    tick(59);
    expect(plant.isStarting('skylink')).toBe(true);
    tick(2);
    expect(plant.isStarting('skylink')).toBe(false);
    expect(plant.getPowerReadings().totalDrawW).toBe(75 + 50);
  });

  it('a repeat of the current mode is a free refusal', () => {
    const { plant } = makeRig(s2Config('active', 'standby'));
    expect(plant.setPartMode('skylink', 'active').costSeconds).toBe(0);
    expect(plant.setPartMode('skylink', 'nonsense').costSeconds).toBe(0);
  });

  it('parts without modes behave as before and offer no mode switch', () => {
    const { plant } = makeRig(s2Config('standby', 'standby'));
    expect(plant.getLoadW('skylink-router')).toBe(20);
    expect(plant.getPartMode('skylink-router')).toBeUndefined();
    expect(plant.verbApplies('setMode', 'skylink-router')).toBe(false);
    expect(plant.verbApplies('setMode', 'skylink')).toBe(true);
    expect(plant.getNextMode('skylink')).toBe('active');
  });

  it('modes survive a checkpoint', () => {
    const a = makeRig(s2Config('standby', 'standby'));
    a.plant.setPartMode('skylink', 'active');
    const state = a.plant.getState();
    const b = makeRig(s2Config('standby', 'standby'));
    b.plant.restoreState(state);
    expect(b.plant.getPartMode('skylink')).toBe('active');
  });

  it('generator mode "off" on the config starts it stopped', () => {
    const config: PlantConfig = {
      parts: [
        {
          id: 'generator',
          kind: 'generator',
          ratedW: 2000,
          running: true,
          fuelL: 5,
          mode: 'off',
          modes: [
            { id: 'off', label: 'Off', loadW: 0 },
            { id: 'run', label: 'Run', loadW: 0, startupS: 10 },
          ],
        },
        { id: 'router', kind: 'router', poweredBy: 'generator', loadW: 20 },
      ],
      connectors: [],
      cables: [],
    };
    const { plant } = makeRig(config);
    expect(plant.getPartMode('generator')).toBe('off');
    expect(plant.isPartPowered('router')).toBe(false);
  });
});

describe('M03 forecast', () => {
  it('S2 numbers: both paths fail the reserve, SkyLink-only passes', () => {
    const both = makeRig(s2Config('active', 'active')).plant.forecast();
    const skylink = makeRig(s2Config('active', 'standby')).plant.forecast();
    const vsat = makeRig(s2Config('standby', 'active')).plant.forecast();
    expect(both.projectedSocWh).toBeCloseTo(450 - 175 * 1.5, 1);
    expect(both.meetsReserve).toBe(false);
    expect(both.secondsToReserve).not.toBeNull();
    expect(skylink.projectedSocWh).toBeCloseTo(450 - 125 * 1.5, 1);
    expect(skylink.meetsReserve).toBe(true);
    expect(skylink.secondsToReserve).toBeNull();
    expect(skylink.servicesAvailable).toEqual(['skylink']);
    expect(vsat.meetsReserve).toBe(true);
    expect(both.servicesAvailable.sort()).toEqual(['skylink', 'vsat-modem']);
  });

  it('overrides preview a change without touching state, clock or random streams', () => {
    const { plant, streamsAsked, now } = makeRig(s2Config('standby', 'standby'));
    const state = JSON.stringify(plant.getState());
    const t0 = now();
    const asked = streamsAsked.size;
    const preview = plant.forecast({ skylink: 'active', vsat: 'active' }, 600);
    expect(preview.horizonS).toBe(600);
    expect(JSON.stringify(plant.getState())).toBe(state);
    expect(now()).toBe(t0);
    expect(streamsAsked.size).toBe(asked);
    expect(plant.getPartMode('skylink')).toBe('standby');
    expect(plant.forecast({ skylink: 'active' }, 600).projectedSocWh).toBeLessThan(plant.forecast({}, 600).projectedSocWh);
  });

  it('matches a stepped simulation within 1 percent (with a startup)', () => {
    const config = s2Config('standby', 'standby');
    config.parts[4] = { ...config.parts[4], modes: standbyActive(50, 120, 100) };
    const preview = makeRig(config).plant.forecast({ skylink: 'active' }, 1800);
    const live = makeRig(config);
    live.plant.setPartMode('skylink', 'active');
    const start = live.plant.getPowerReadings().socWh['power-station'];
    live.tick(1800);
    const actual = live.plant.getPowerReadings().socWh['power-station'];
    const previewUsed = 450 - preview.projectedSocWh;
    const actualUsed = start - actual;
    expect(Math.abs(previewUsed - actualUsed) / actualUsed).toBeLessThan(0.01);
    expect(preview.startupCostS).toBe(140);
    expect(preview.startupWh).toBeGreaterThan(0);
  });

  it('with-generator basis charges the battery and burns fuel; battery-only does not', () => {
    const gen: PlantConfig = {
      parts: [
        {
          id: 'generator',
          kind: 'generator',
          ratedW: 2000,
          running: true,
          fuelL: 5,
          burnLPerHour: 1.5,
          nominalV: 230,
          modes: [
            { id: 'off', label: 'Off', loadW: 0 },
            { id: 'run', label: 'Run', loadW: 0, startupS: 40 },
          ],
        },
        { id: 'power-station', kind: 'battery', poweredBy: 'generator', capacityWh: 1000, socWh: 400, maxOutputW: 600, nominalV: 12, loadW: 0 },
        { id: 'router', kind: 'router', poweredBy: 'power-station', loadW: 100 },
      ],
      connectors: [],
      cables: [],
      power: { reserveWh: 200, planningHorizonS: 1800, basis: 'with-generator' },
    };
    const withGen = makeRig(gen).plant.forecast();
    expect(withGen.fuelUsedL).toBeGreaterThan(0);
    expect(withGen.projectedSocWh).toBeGreaterThan(400);
    const only = makeRig({ ...gen, power: { ...(gen.power as NonNullable<PlantConfig['power']>), basis: 'battery-only' } }).plant.forecast();
    expect(only.fuelUsedL).toBe(0);
    expect(only.projectedSocWh).toBeCloseTo(400 - 100 * 0.5, 1);

    const live = makeRig(gen);
    const fuel0 = live.plant.getPowerReadings().fuelL.generator;
    live.tick(1800);
    const r = live.plant.getPowerReadings();
    expect(Math.abs(fuel0 - r.fuelL.generator - withGen.fuelUsedL) / withGen.fuelUsedL).toBeLessThan(0.01);
    expect(Math.abs(r.socWh['power-station'] - withGen.projectedSocWh) / withGen.projectedSocWh).toBeLessThan(0.01);

    const stopped = makeRig(gen).plant.forecast({ generator: 'off' });
    expect(stopped.fuelUsedL).toBe(0);
    expect(stopped.projectedSocWh).toBeLessThan(400);
  });
});
