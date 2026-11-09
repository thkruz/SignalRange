import { EvidenceLog } from '@app/physical/evidence-log';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig, PlantFault } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';
import { ObstructionAccumulator, plantObstructionReader } from '../../../src/plugins-builtin/terminal-app/obstruction-map';
import { plantTerminalReader, TerminalAppModel } from '../../../src/plugins-builtin/terminal-app/terminal-app-model';
import { plantLinkReader, TerminalLink } from '../../../src/plugins-builtin/terminal-app/terminal-link';
import { SKYLINK_SKIN, type TerminalSkin } from '../../../src/plugins-builtin/terminal-app/terminal-skin';

function plantConfig(): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink', poweredBy: 'router', viaCable: 'dish-cable', nominalV: 12, loadW: 40 },
    ],
    connectors: [
      { id: 'router:dc', feeds: 'router', partId: 'router' },
      { id: 'dish-plug', cableId: 'dish-cable', partId: 'skylink' },
    ],
    cables: [{ id: 'dish-cable', lengthM: 10, cableType: 'power-data', carries: ['power', 'data'], from: 'router', to: 'skylink' }],
    faults: [],
    service: {
      paths: [
        {
          id: 'skylink',
          label: 'SkyLink',
          terminalPartId: 'skylink',
          localPartIds: ['router'],
          accountId: 'acct',
          providerId: 'prov',
          profile: { downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5 },
        },
      ],
      accounts: [{ id: 'acct', unitId: 'unit-1', authorized: true, capacityFactor: 1 }],
      providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
    },
  };
}

interface RigOptions {
  faults?: PlantFault[];
  /** Seconds the plant runs before the app model is created */
  settleS?: number;
  skin?: TerminalSkin;
  warmStart?: boolean;
  /** Press the reboot just before the app opens */
  reboot?: boolean;
}

function rig(opts: RigOptions = {}) {
  let t = 1000;
  const streams = new Map<string, RngStream>();
  const cfg = plantConfig();
  const plant = new PhysicalPlantManager(cfg, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`warm:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });
  for (const f of opts.faults ?? []) {
    plant.injectFault(f);
  }
  const services = new ServiceModel(cfg.service as NonNullable<PlantConfig['service']>, plant, undefined, { now: () => t });
  const log = new EvidenceLog(plant, services);
  plant.update(1);
  const run = (s: number) => {
    for (let i = 0; i < s; i++) {
      t += 1;
      plant.update(1);
    }
  };
  run(opts.settleS ?? 600);
  if (opts.reboot) {
    plant.reboot();
  }
  const obstruction = new ObstructionAccumulator(plantObstructionReader(plant, () => ({ beam: { az: 120, el: 55 }, inOutage: false })));
  const model = new TerminalAppModel({
    skin: opts.skin ?? SKYLINK_SKIN,
    plant: plantTerminalReader(plant),
    link: new TerminalLink(plantLinkReader(plant)),
    services,
    serviceId: 'skylink',
    obstruction,
    warmStart: opts.warmStart ?? true,
  });

  return { plant, log, model, obstruction, run };
}

const trees: PlantFault = { id: 'f-trees', target: 'skylink', kind: 'net' };

describe('terminal app warm start', () => {
  it('has an hour of history at creation: statistics, obstruction map, uptime', () => {
    const { model, obstruction } = rig();
    const s = model.stats('15m');
    expect(s.points.some((p) => p.downMbps !== null && p.downMbps > 0)).toBe(true);
    expect(model.stats('6h').points.filter((p) => p.downMbps !== null).length).toBeGreaterThan(10);
    expect(obstruction.summary().coverage).toBeGreaterThan(0.2);
    expect(obstruction.summary().obstructionFraction).toBe(0);
    const data = model.view().data;
    expect(data?.uptimeS).toBeGreaterThanOrEqual(3600);
    expect(data?.bootCount).toBe(1);
    expect(data?.measured).toBe(true);
    expect(data?.outages).toEqual([]);
  });

  it('records nothing in evidence, keeps the clock and adds no transmit time', () => {
    const noWarm = rig({ warmStart: false });
    const warm = rig();
    expect(warm.log.entries()).toHaveLength(noWarm.log.entries().length);
    expect(warm.plant.getTimeSeconds()).toBe(noWarm.plant.getTimeSeconds());
    expect(warm.plant.getTransmitSeconds()).toBe(noWarm.plant.getTransmitSeconds());
  });

  it('is deterministic across two runs', () => {
    const a = rig();
    const b = rig();
    expect(a.model.getState()).toEqual(b.model.getState());
  });

  it('is off without the flag and follows the skin duration', () => {
    expect(
      rig({ warmStart: false })
        .model.stats('6h')
        .points.every((p) => p.downMbps === null)
    ).toBe(true);
    const short = rig({ skin: { ...SKYLINK_SKIN, warmStartS: 600 } });
    expect(short.model.getState().samples).toHaveLength(20);
    expect(rig({ skin: { ...SKYLINK_SKIN, warmStartS: 0 } }).model.getState().samples).toHaveLength(0);
  });

  it('gives no fake uptime when the dish is booting at creation', () => {
    const { plant, model } = rig({ reboot: true });
    expect(plant.skylinkStatus()).not.toBe('online');
    expect(model.getState().samples).toHaveLength(0);
    expect(model.getState().uptimeStartS).toBeNull();
    expect(model.view().data?.uptimeS ?? 0).toBe(0);
  });

  it('reflects an obstruction present at creation, but not one injected later', () => {
    const later = rig();
    const before = later.model.getState().samples.map((x) => ({ ...x }));
    later.plant.injectFault(trees);
    later.run(5);
    later.model.update();
    expect(later.model.getState().samples.slice(0, before.length)).toEqual(before);
    expect(later.model.getState().outages).toEqual([]);

    const initial = rig({ faults: [trees] });
    const state = initial.model.getState();
    expect(state.samples.every((x) => x.downMbps === 0 && x.pingDropPct === 100)).toBe(true);
    expect(state.open?.key).toBe('obstructed');
    expect(initial.obstruction.summary().obstructionFraction).toBeGreaterThan(0.9);
  });
});
