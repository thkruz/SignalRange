/**
 * Package H: the optional live link adapter. Same contract in both modes: authored is deterministic, live is a
 * function of physics inputs. A controlled outage changes the registration layer, the app reading and the workload
 * profile together; policy scales once; two terminals stay independent; no physical link is never healthy.
 */

import { LinkBudgetManager } from '@app/link-budget/link-budget-manager';
import { type LivePathInputs, type LivePhysicsReader, phasedArrayReader } from '@app/physical/live-link';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { ServiceModelConfig } from '@app/physical/service-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

const path = (id: string, term: string, down: number) => ({
  id,
  label: id,
  terminalPartId: term,
  localPartIds: ['router'],
  accountId: 'acct',
  providerId: 'prov',
  profile: { downMbps: down, upMbps: down / 5, rttMs: 40, lossPct: 0.5 },
});

const cfg = (mode?: 'authored' | 'live'): ServiceModelConfig => ({
  paths: [path('a', 'term-a', 100), path('b', 'term-b', 50)],
  accounts: [{ id: 'acct', unitId: 'u', authorized: true, capacityFactor: 1 }],
  providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
  ...(mode ? { linkMode: mode } : {}),
  ...(mode === 'live' ? { live: { mapping: { a: { nominalCnDb: 14, thresholdCnDb: 4 }, b: { nominalCnDb: 14, thresholdCnDb: 4 } } } } : {}),
});

const plantCfg = (): PlantConfig => {
  const terminal = (id: string) => ({
    id,
    kind: 'terminal' as const,
    label: id,
    poweredBy: 'battery',
    nominalV: 12,
    mode: 'active',
    modes: [{ id: 'active', label: 'Active', loadW: 20, servesTraffic: true }],
  });

  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 5000, socWh: 4900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      terminal('term-a'),
      terminal('term-b'),
    ],
    connectors: [],
    cables: [],
  };
};

/** A reader the test drives by hand */
function fakeReader(): { reader: LivePhysicsReader; set: (id: string, v: LivePathInputs | null) => void } {
  const v = new Map<string, LivePathInputs | null>([
    ['a', { outage: false, cnDb: 14 }],
    ['b', { outage: false, cnDb: 14 }],
  ]);

  return { reader: { read: (id) => v.get(id) ?? null }, set: (id, x) => v.set(id, x) };
}

function rig(mode: 'authored' | 'live' | undefined, reader?: LivePhysicsReader, mutate?: (c: ServiceModelConfig) => void) {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const plant = new PhysicalPlantManager(plantCfg(), {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`c6h:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });
  const c = cfg(mode);
  mutate?.(c);
  const model = new ServiceModel(c, plant, undefined, { now: () => t }, reader);
  const tick = (n: number): void => {
    for (let i = 0; i < n; i++) {
      t += 1;
      plant.update(1);
      model.update();
    }
  };
  plant.update(1);
  tick(60);

  return { model, tick, plant };
}

const reg = (m: ServiceModel, id: string) => m.layers(id).find((l) => l.layer === 'registration');

describe('H authored mode (default)', () => {
  it('is deterministic and tagged authored', () => {
    const { model } = rig(undefined);
    const a = model.linkProfile('a');
    expect(a).toMatchObject({ downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5, provenance: 'authored' });
    expect(model.linkProfile('a')).toEqual(a);
  });

  it('explicit authored equals default', () => {
    expect(rig('authored').model.linkProfile('a')).toEqual(rig(undefined).model.linkProfile('a'));
  });

  it('refuses a live reader without live mode, and live mode without a reader or with authored impairments', () => {
    expect(() => rig('authored', fakeReader().reader)).toThrow(/not "live"/u);
    expect(() => rig('live', undefined)).toThrow(/needs a physics reader/u);
    expect(() =>
      rig('live', fakeReader().reader, (c) => {
        c.impairments = [{ id: 'x', serviceId: 'a', seed: 1, periodS: 100, downMinS: 10, downMaxS: 20, jitterS: 5 }];
      })
    ).toThrow(/cannot be combined/u);
  });
});

describe('H live mode', () => {
  it('derives the sample from the physics inputs and tags it sdk', () => {
    const f = fakeReader();
    const { model } = rig('live', f.reader);
    expect(model.linkProfile('a')).toMatchObject({ downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5, provenance: 'sdk' });
    f.set('a', { outage: false, cnDb: 9, extraRttMs: 5 });
    const p = model.linkProfile('a');
    expect(p?.downMbps).toBeCloseTo(50, 6);
    expect(p?.rttMs).toBe(45);
    expect(p?.jitterMs).toBeUndefined();
    f.set('a', { outage: false, cnDb: 5 });
    expect(model.linkProfile('a')?.lossPct).toBeGreaterThan(0.5);
    expect(model.linkProfile('a')?.downMbps).toBeCloseTo(10, 6);
    f.set('a', { outage: false, cnDb: 30 });
    expect(model.linkProfile('a')?.downMbps).toBe(100);
  });

  it('a controlled outage changes registration, the app reading and the workload profile together, and recovery is consistent', () => {
    const f = fakeReader();
    const { model, tick } = rig('live', f.reader);
    expect(reg(model, 'a')?.status).toBe('up');
    expect(model.takeSample('a', 'registration', 'terminal-app', undefined, 'downMbps').value).toBe(100);

    f.set('a', { outage: true, cnDb: 14 });
    tick(1);
    expect(reg(model, 'a')).toMatchObject({ status: 'down', reason: 'link-lost' });
    expect(model.takeSample('a', 'registration', 'terminal-app', undefined, 'downMbps').value).toBe('down');
    expect(model.linkProfile('a')).toBeNull();
    expect(
      model
        .history('a')
        .filter((h) => h.layer === 'registration')
        .at(-1)
    ).toMatchObject({ to: 'down', reason: 'link-lost' });

    f.set('a', { outage: false, cnDb: 14 });
    tick(1);
    expect(reg(model, 'a')?.status).toBe('up');
    expect(model.takeSample('a', 'registration', 'terminal-app', undefined, 'downMbps').value).toBe(100);
    expect(model.linkProfile('a')?.downMbps).toBe(100);
    expect(
      model
        .history('a')
        .filter((h) => h.layer === 'registration')
        .at(-1)
    ).toMatchObject({ to: 'up' });
  });

  it('a C/N at or below threshold carries nothing', () => {
    const f = fakeReader();
    const { model, tick } = rig('live', f.reader);
    f.set('a', { outage: false, cnDb: 4 });
    tick(1);
    expect(model.linkProfile('a')).toBeNull();
    expect(reg(model, 'a')?.reason).toBe('link-lost');
  });

  it('applies account and provider restrictions exactly once', () => {
    const f = fakeReader();
    const { model } = rig('live', f.reader, (c) => {
      c.accounts[0].capacityFactor = 0.5;
      c.providers[0].capacityFactor = 0.5;
    });
    expect(model.linkProfile('a')?.downMbps).toBeCloseTo(25, 6);
    f.set('a', { outage: false, cnDb: 9 });
    expect(model.linkProfile('a')?.downMbps).toBeCloseTo(12.5, 6);
  });

  it('keeps two terminal paths independent', () => {
    const f = fakeReader();
    const { model, tick } = rig('live', f.reader);
    f.set('a', { outage: true, cnDb: null });
    tick(1);
    expect(reg(model, 'a')?.status).toBe('down');
    expect(reg(model, 'b')?.status).toBe('up');
    expect(model.linkProfile('b')?.downMbps).toBe(50);
  });

  it('a missing physical link never becomes a healthy authored profile', () => {
    const f = fakeReader();
    const { model, tick } = rig('live', f.reader);
    f.set('a', null);
    tick(1);
    expect(model.linkProfile('a')).toBeNull();
    expect(reg(model, 'a')).toMatchObject({ status: 'down', reason: 'link-lost' });
  });

  it('local power loss still wins over the physics (layer order)', () => {
    const f = fakeReader();
    const { model, plant, tick } = rig('live', f.reader);
    plant.setPartMode('term-a', 'active');
    expect(reg(model, 'a')?.status).toBe('up');
    tick(1);
    expect(model.linkProfile('a')).not.toBeNull();
  });

  it('save and restore round trip: a fresh model on the same physics reads the same, history survives', () => {
    const f = fakeReader();
    const first = rig('live', f.reader);
    f.set('a', { outage: true, cnDb: 14 });
    first.tick(2);
    f.set('a', { outage: false, cnDb: 9 });
    first.tick(2);
    const saved = JSON.parse(JSON.stringify(first.model.getState()));
    expect(saved.impairments).toEqual({ episodes: [] });

    const second = rig('live', f.reader);
    second.model.restoreState(saved);
    expect(second.model.history('a')).toEqual(first.model.history('a'));
    expect(second.model.linkProfile('a')).toEqual(first.model.linkProfile('a'));
    expect(second.model.linkProfile('a')?.downMbps).toBeCloseTo(50, 6);
  });
});

describe('H phased array reader', () => {
  const terms = { eirpDbm: 60, fsplDb: 205, systemNoiseTempK: 150, bandwidthHz: 10e6, miscLossDb: 1 };

  it('uses the existing Friis budget with the scanned gain, and reports the array outage', () => {
    let slice = { inOutage: false, gainDbi: 33 };
    const r = phasedArrayReader(() => slice, terms, ['a']);
    const clear = r.read('a', 0);
    expect(clear?.cnDb).toBeCloseTo(LinkBudgetManager.computeCNRDb({ ...terms, rxGainDbi: 33 }), 9);
    slice = { inOutage: false, gainDbi: 30 };
    expect(r.read('a', 0)?.cnDb).toBeCloseTo((clear?.cnDb ?? 0) - 3, 9);
    slice = { inOutage: true, gainDbi: 30 };
    expect(r.read('a', 0)?.outage).toBe(true);
    expect(r.read('b', 0)).toBeNull();
  });

  it('drives the model: scan loss slows the service, an array outage stops it', () => {
    let slice = { inOutage: false, gainDbi: 33 };
    const reader = phasedArrayReader(() => slice, terms, ['a', 'b']);
    const nominal = LinkBudgetManager.computeCNRDb({ ...terms, rxGainDbi: 33 });
    const { model, tick } = rig('live', reader, (c) => {
      c.live = { mapping: { a: { nominalCnDb: nominal, thresholdCnDb: nominal - 10 }, b: { nominalCnDb: nominal, thresholdCnDb: nominal - 10 } } };
    });
    expect(model.linkProfile('a')?.downMbps).toBeCloseTo(100, 6);
    slice = { inOutage: false, gainDbi: 28 };
    expect(model.linkProfile('a')?.downMbps).toBeCloseTo(50, 6);
    slice = { inOutage: true, gainDbi: 28 };
    tick(1);
    expect(reg(model, 'a')?.reason).toBe('link-lost');
    expect(model.linkProfile('a')).toBeNull();
  });
});
