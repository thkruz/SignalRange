import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig, PlantEnvironment, PlantState } from '@app/physical/physical-plant-types';
import { getActivePlant, plantPostLnaLossDb, plantPowers, plantPreLnaLossDb, setActivePlant } from '@app/physical/plant-bridge';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { afterEach, describe, expect, it } from 'vitest';

const STATION = 'gs1';

const config: PlantConfig = {
  stationId: STATION,
  parts: [
    { id: 'generator', kind: 'generator', ratedW: 1000, fuelL: 5, nominalV: 230 },
    { id: 'power-station', kind: 'battery', poweredBy: 'generator', maxOutputW: 500, socWh: 200, nominalV: 12, loadW: 20 },
    { id: 'vsat-modem', kind: 'modem', poweredBy: 'power-station', loadW: 40 },
    { id: 'vsat-dish', kind: 'dish', poweredBy: 'vsat-modem', viaCable: 'vsat-ifl', loadW: 5 },
  ],
  cables: [{ id: 'vsat-ifl', lengthM: 30, cableType: 'coax', carries: ['rf', 'power'], from: 'vsat-modem', to: 'vsat-dish', role: 'post-lna' }],
  connectors: [{ id: 'vsat-feed', partId: 'vsat-dish', role: 'pre-lna' }],
};

function makePlant(): { plant: PhysicalPlantManager; advance: (s: number) => void } {
  let t = 100;
  const env: PlantEnvironment = { windMps: 0, rainMmH: 0, ambientC: 15 };
  const streams = new Map<string, RngStream>();
  const holder: { plant: PhysicalPlantManager | null } = { plant: null };
  const advance = (seconds: number): void => {
    for (let i = 0; i < seconds; i++) {
      t += 1;
      holder.plant?.update(1);
    }
  };
  holder.plant = new PhysicalPlantManager(config, {
    now: () => t,
    skip: advance,
    env: () => env,
    rng: (name) => {
      let s = streams.get(name);
      if (!s) {
        s = new RngStream(fnv1a(`1:${name}`));
        streams.set(name, s);
      }

      return s;
    },
  });

  return { plant: holder.plant, advance };
}

afterEach(() => setActivePlant(null));

describe('plant bridge (engine hooks)', () => {
  it('is neutral with no plant, which keeps C1 to C5 bit-identical', () => {
    expect(getActivePlant()).toBeNull();
    expect(plantPreLnaLossDb(STATION)).toBe(0);
    expect(plantPostLnaLossDb(STATION)).toBe(0);
    expect(plantPowers('antenna')).toBe(true);
    expect(plantPowers('lnb')).toBe(true);
    expect(plantPowers('modem')).toBe(true);
    expect(plantPreLnaLossDb(null)).toBe(0);
  });

  it('a healthy plant is also neutral', () => {
    const { plant, advance } = makePlant();
    setActivePlant(plant);
    advance(120);

    expect(plantPreLnaLossDb(STATION)).toBe(0);
    expect(plantPostLnaLossDb(STATION)).toBe(0);
    expect(plantPowers('antenna')).toBe(true);
  });

  it('an unseated pre-LNA connector adds loss; fixing it removes the loss', () => {
    const { plant, advance } = makePlant();
    setActivePlant(plant);
    plant.injectFault({ id: 'f1', target: 'vsat-feed', kind: 'unseated' });
    advance(5);

    expect(plantPreLnaLossDb(STATION)).toBeGreaterThan(0);
    expect(plantPostLnaLossDb(STATION)).toBe(0);
    plant.reseat('vsat-feed');
    advance(200);

    expect(plantPreLnaLossDb(STATION)).toBe(0);
  });

  it('a crushed IFL cuts the dish supply and the post-LNA path, then a swap restores it', () => {
    const { plant, advance } = makePlant();
    setActivePlant(plant);
    plant.injectFault({ id: 'f2', target: 'vsat-ifl', kind: 'cable-crush' });
    advance(5);

    expect(plantPowers('antenna')).toBe(false);
    expect(plantPowers('modem')).toBe(true);
    plant.swap('vsat-ifl');
    advance(200);

    expect(plantPowers('antenna')).toBe(true);
    expect(plantPostLnaLossDb(STATION)).toBe(0);
  });
});

describe('refuel and recharge', () => {
  it('refuel clears out-of-fuel and consumes a fuel can', () => {
    const { plant } = makePlant();
    plant.injectFault({ id: 'dry', target: 'generator', kind: 'out-of-fuel' });
    const before = plant.getSpares()['fuel-can'] ?? 0;
    const result = plant.refuel('generator');

    expect(result.cleared).toEqual(['dry']);
    expect(plant.getSpares()['fuel-can']).toBe(before - 1);
    expect(plant.isFaultCleared('dry')).toBe(true);
  });

  it('refuel on a full generator is ineffective and counted', () => {
    const { plant } = makePlant();
    plant.refuel('generator');

    expect(plant.ineffectiveActionCount()).toBe(1);
  });

  it('trainer setSpares overrides scenario spares', () => {
    const { plant } = makePlant();
    plant.setSpares({ 'fuel-can': 0 });

    expect(plant.getSpares()['fuel-can']).toBe(0);
  });
});

describe('plant conditions (action log queries)', () => {
  it('track inspect, measure, swap and fault clearing', () => {
    const { plant } = makePlant();
    plant.injectFault({ id: 'f3', target: 'vsat-ifl', kind: 'cable-nick' });

    expect(plant.hasInspected('vsat-ifl')).toBe(false);
    plant.inspect('vsat-ifl');
    expect(plant.hasInspected('vsat-ifl')).toBe(true);
    expect(plant.hasMeasured('vsat-ifl')).toBe(false);
    plant.measure('cable-tester', 'vsat-ifl');
    expect(plant.hasMeasured('vsat-ifl')).toBe(true);
    expect(plant.hasMeasured('vsat-ifl', 'cable-tester')).toBe(true);
    expect(plant.hasMeasured('vsat-ifl', 'multimeter')).toBe(false);
    expect(plant.isFaultCleared('f3')).toBe(false);
    expect(plant.hasSwapped('vsat-ifl')).toBe(false);
    plant.swap('vsat-ifl');
    expect(plant.hasSwapped('vsat-ifl')).toBe(true);
    expect(plant.isFaultCleared('f3')).toBe(true);
    expect(plant.isFaultCleared('never-existed')).toBe(false);
  });
});

describe('plant state round trip (checkpoint)', () => {
  it('survives JSON and keeps faults, spares, log and cleared ids', () => {
    const { plant, advance } = makePlant();
    plant.injectFault({ id: 'f4', target: 'vsat-feed', kind: 'unseated' });
    plant.injectFault({ id: 'f5', target: 'vsat-ifl', kind: 'cable-nick' });
    advance(30);
    plant.swap('vsat-ifl');
    const state = JSON.parse(JSON.stringify(plant.getState())) as PlantState;

    const { plant: other } = makePlant();
    other.restoreState(state);

    expect(other.getState()).toEqual(plant.getState());
    expect(other.isFaultCleared('f5')).toBe(true);
    expect(other.hasSwapped('vsat-ifl')).toBe(true);
    expect(other.getFaults().map((f) => f.id)).toEqual(['f4']);
  });
});

describe('campaigns without a plant', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full, out);
      } else if (name.endsWith('.ts')) {
        out.push(full);
      }
    }

    return out;
  };

  it('no C1 to C5 campaign file sets physicalPlant (the dev-only frontline sandbox is C6)', () => {
    const files = walk(join(__dirname, '../../src/campaigns'));
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((file) => !file.replaceAll('\\', '/').includes('/campaigns/frontline/')).filter((file) => readFileSync(file, 'utf8').includes('physicalPlant'));

    expect(offenders).toEqual([]);
  });
});
