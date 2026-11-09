import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig, PlantEnvironment } from '@app/physical/physical-plant-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

function config(): PlantConfig {
  return {
    stationId: 'gs1',
    parts: [
      { id: 'generator', kind: 'generator', ratedW: 1000, fuelL: 5, nominalV: 230 },
      { id: 'power-station', kind: 'battery', poweredBy: 'generator', maxOutputW: 500, socWh: 0, nominalV: 12, loadW: 20 },
      { id: 'skylink-router', kind: 'router', poweredBy: 'power-station', loadW: 15 },
      { id: 'skylink-dish', kind: 'terminal', poweredBy: 'skylink-router', viaCable: 'skylink-cable', loadW: 60 },
    ],
    cables: [{ id: 'skylink-cable', lengthM: 25, cableType: 'power-data', carries: ['power', 'data'], from: 'skylink-router', to: 'skylink-dish' }],
    connectors: [{ id: 'skylink-cable:dish', cableId: 'skylink-cable' }],
  };
}

function make() {
  let t = 100;
  const env: PlantEnvironment = { windMps: 0, rainMmH: 0, ambientC: 15 };
  const streams = new Map<string, RngStream>();
  const clock = { tod: 0 };
  const plant: PhysicalPlantManager = new PhysicalPlantManager(config(), {
    now: () => t,
    skip: (s) => {
      for (let i = 0; i < s; i++) {
        t += 1;
        plant.update(1);
      }
    },
    env: () => env,
    timeOfDayS: () => clock.tod + t,
    rng: (name) => {
      let s = streams.get(name);
      if (!s) {
        s = new RngStream(fnv1a(name));
        streams.set(name, s);
      }

      return s;
    },
  });
  const advance = (s: number): void => {
    for (let i = 0; i < s; i++) {
      t += 1;
      plant.update(1);
    }
  };

  return { plant, env, clock, advance, now: () => t };
}

describe('terminal app verbs (E2)', () => {
  it('reboot spends sim time, runs the boot through rebootUntilS and books downtime', () => {
    const { plant, advance, now } = make();
    advance(5);
    const start = now();
    const r = plant.reboot();

    expect(r.costSeconds).toBe(10);
    expect(now()).toBe(start + 10);
    expect(plant.skylinkStatus()).toBe('booting');
    expect(r.downtimeSeconds).toBeGreaterThanOrEqual(90);
    advance(95);
    expect(plant.skylinkStatus()).toBe('online');
    expect(plant.getLog().at(-1)?.verb).toBe('reboot');
  });

  it('snow melt shows heating on a snowed dish, draws more power, and the heater gives up after its window', () => {
    const { plant, advance } = make();
    plant.injectFault({ id: 'snow', target: 'skylink-dish', kind: 'snow' });
    advance(2);
    expect(plant.skylinkStatus()).toBe('obstructed');
    const base = plant.getLoadW('skylink-dish');

    expect(plant.setSnowMelt('automatic').costSeconds).toBe(5);
    expect(plant.skylinkStatus()).toBe('heating');
    expect(plant.getLoadW('skylink-dish')).toBeGreaterThan(base);
    expect(plant.forecast().servicesAvailable).toBeDefined();
    advance(700);
    expect(plant.skylinkStatus()).toBe('obstructed');
    expect(plant.getLoadW('skylink-dish')).toBe(base);
  });

  it('snow melt off never heats; pre-heat draws power in the cold without snow', () => {
    const { plant, env, advance } = make();
    plant.injectFault({ id: 'snow', target: 'skylink-dish', kind: 'snow' });
    plant.setSnowMelt('off');
    expect(plant.skylinkStatus()).toBe('obstructed');
    plant.clearSnow('skylink-dish');
    const base = plant.getLoadW('skylink-dish');
    env.ambientC = -5;
    plant.setSnowMelt('preheat');
    advance(1);
    expect(plant.getLoadW('skylink-dish')).toBeGreaterThan(base);
    expect(plant.skylinkStatus()).toBe('online');
  });

  it('the sleep window gives status sleeping, no service and low draw; it crosses midnight', () => {
    const { plant, clock, advance, now } = make();
    clock.tod = 0;
    const tod = (): number => (clock.tod + now()) % 86400;
    plant.setSleep({ startS: (tod() + 30) % 86400, endS: (tod() + 300) % 86400 });
    expect(plant.skylinkStatus()).toBe('online');
    advance(60);
    expect(plant.skylinkStatus()).toBe('sleeping');
    expect(plant.getLoadW('skylink-dish')).toBeLessThan(20);
    advance(400);
    expect(plant.skylinkStatus()).toBe('online');

    clock.tod = 86400 - 100 - now();
    plant.setSleep({ startS: 86400 - 200, endS: 100 });
    expect(plant.isSleeping()).toBe(true);
    plant.setSleep(null);
    expect(plant.isSleeping()).toBe(false);
  });

  it('settings survive a checkpoint and Wi-Fi is stored', () => {
    const { plant } = make();
    plant.setSnowMelt('preheat');
    plant.setSleep({ startS: 100, endS: 200 });
    plant.setRouterWifi({ ssid: 'Camp', password: 'longenough' });
    const state = plant.getState();
    const other = make().plant;
    other.restoreState(state);

    expect(other.getTerminalSettings()).toEqual({ snowMelt: 'preheat', sleep: { startS: 100, endS: 200 }, wifi: { ssid: 'Camp', password: 'longenough' } });
  });
});
