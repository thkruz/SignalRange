import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { ServiceModelConfig } from '@app/physical/service-types';
import { FAULT_KINDS, validTargets } from '@app/physical/ui/plant-ui-helpers';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

const path = (id: string, terminal: string) => ({
  id,
  label: id,
  terminalPartId: terminal,
  localPartIds: ['router'],
  accountId: 'acct',
  providerId: 'prov',
  endpointIds: ['hq'],
  profile: { downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5 },
});

const serviceCfg = (): ServiceModelConfig => ({
  paths: [path('skylink', 'skylink-dish'), path('eurosat', 'eurosat-modem')],
  accounts: [{ id: 'acct', unitId: 'unit-1', authorized: true, capacityFactor: 1 }],
  providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
  endpoints: [{ id: 'hq', reachable: true }],
});

function config(): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink-dish', kind: 'terminal', poweredBy: 'battery', nominalV: 12, loadW: 50 },
      { id: 'eurosat-modem', kind: 'modem', poweredBy: 'battery', nominalV: 12, loadW: 20 },
    ],
    connectors: [],
    cables: [],
  };
}

function rig() {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const plant: PhysicalPlantManager = new PhysicalPlantManager(config(), {
    now: () => t,
    skip: (s) => {
      for (let i = 0; i < s; i++) {
        t += 1;
        plant.update(1);
      }
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(name)));
      }

      return streams.get(name) as RngStream;
    },
  });
  const model = new ServiceModel(serviceCfg(), plant, undefined, { now: () => t });
  const tick = (s: number): void => {
    for (let i = 0; i < s; i++) {
      t += 1;
      plant.update(1);
      model.update();
    }
  };
  tick(5);

  return { plant, model, tick };
}

const registration = (model: ServiceModel, id: string) => model.layers(id).find((l) => l.layer === 'registration');

describe('gnss-denied fault (E5)', () => {
  it('is offered to the trainer for terminal parts', () => {
    const { plant } = rig();

    expect(FAULT_KINDS.some((k) => k.kind === 'gnss-denied')).toBe(true);
    expect(validTargets(plant, 'gnss-denied')).toEqual(['skylink-dish']);
  });

  it('inject gives no location, no satellites and no SkyLink service; clear restores them', () => {
    const { plant, model, tick } = rig();

    expect(plant.skylinkStatus()).toBe('online');
    expect(plant.getGnssState()).toEqual({ locationValid: true, satellites: 12 });
    plant.injectFault({ id: 'jam', target: 'skylink-dish', kind: 'gnss-denied' });
    tick(2);

    expect(plant.skylinkStatus()).toBe('no-location');
    expect(plant.getGnssState()).toEqual({ locationValid: false, satellites: 0 });
    expect(registration(model, 'skylink')?.status).toBe('down');
    expect(plant.clearFault('jam')).toBe(true);
    tick(2);

    expect(plant.skylinkStatus()).toBe('online');
    expect(plant.getGnssState().locationValid).toBe(true);
    expect(registration(model, 'skylink')?.status).toBe('up');
  });

  it('a reboot does not clear it', () => {
    const { plant, tick } = rig();
    plant.injectFault({ id: 'jam', target: 'skylink-dish', kind: 'gnss-denied' });
    plant.reboot();
    tick(400);

    expect(plant.skylinkStatus()).toBe('no-location');
    expect(plant.getGnssState().locationValid).toBe(false);
    expect(plant.isFaultActive('skylink-dish', 'gnss-denied')).toBe(true);
  });

  it('does not change other services', () => {
    const { plant, model, tick } = rig();
    plant.injectFault({ id: 'jam', target: 'skylink-dish', kind: 'gnss-denied' });
    tick(2);

    expect(registration(model, 'eurosat')?.status).toBe('up');
    expect(model.layers('eurosat').find((l) => l.layer === 'application')?.status).not.toBe('down');
  });
});
