/**
 * FX1 regression tests for the M01-M06 core review (art-review/c6/core-review-m01-m06.md).
 * Each test names the finding it pins. They all failed before the matching fix.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));
const forecastSpy = vi.hoisted(() => ({ calls: 0 }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

vi.mock('@app/physical/power-forecast', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@app/physical/power-forecast')>();

  return {
    ...orig,
    projectPower: (...args: Parameters<typeof orig.projectPower>) => {
      forecastSpy.calls += 1;

      return orig.projectPower(...args);
    },
  };
});

import * as C from '@app/campaigns/frontline/frontline-conditions';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { DependencyGraph } from '@app/physical/dependency-graph';
import { scoreDiagnosis } from '@app/physical/diagnostic-scorer';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { projectPower } from '@app/physical/power-forecast';
import { ServiceModel } from '@app/physical/service-model';
import { ScenarioManager } from '@app/scenario-manager';
import { fnv1a, Rng, RngStream } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';

const run = (c: { params?: { evaluator?: unknown } }): boolean => (c.params as { evaluator: () => boolean }).evaluator();

function plantConfig(extra: Partial<PlantConfig> = {}): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      {
        id: 'skylink',
        kind: 'terminal',
        label: 'SkyLink',
        poweredBy: 'router',
        viaCable: 'dish-cable',
        nominalV: 12,
        mode: 'standby',
        modes: [
          { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
          { id: 'active', label: 'Active', loadW: 40, servesTraffic: true },
        ],
      },
    ],
    connectors: [
      { id: 'router:dc', feeds: 'router', partId: 'router' },
      { id: 'dish-plug', cableId: 'dish-cable', partId: 'skylink' },
    ],
    cables: [{ id: 'dish-cable', lengthM: 10, cableType: 'power-data', carries: ['power', 'data'], from: 'router', to: 'skylink' }],
    faults: [],
    power: { reserveWh: 100, planningHorizonS: 600, basis: 'battery-only' },
    service: {
      paths: [
        {
          id: 'skylink',
          label: 'SkyLink',
          terminalPartId: 'skylink',
          localPartIds: ['router'],
          linkTargetIds: ['dish-plug'],
          accountId: 'acct',
          providerId: 'prov',
          profile: { downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5 },
        },
      ],
      accounts: [{ id: 'acct', unitId: 'unit-1', authorized: true, capacityFactor: 1 }],
      providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
    },
    ...extra,
  };
}

function boot(cfg: PlantConfig): PhysicalPlantService {
  ScenarioManager.getInstance().settings = { physicalPlant: cfg } as never;

  return PhysicalPlantService.getInstance();
}

function tick(seconds: number): void {
  for (let i = 0; i < seconds; i++) {
    SimClock.skip(1000);
    EventBus.getInstance().emit(Events.UPDATE, 1 as never);
  }
}

function manager(cfg: PlantConfig): { plant: PhysicalPlantManager; tick: (s: number) => void; setT: (t: number) => void } {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const plant = new PhysicalPlantManager(cfg, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) streams.set(name, new RngStream(fnv1a(`fx1:${name}`)));

      return streams.get(name) as RngStream;
    },
  });

  return {
    plant,
    tick: (s) => {
      for (let i = 0; i < s; i++) {
        t += 1;
        plant.update(1);
      }
    },
    setT: (n) => {
      t = n;
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(11);
  objectives.states.clear();
  forecastSpy.calls = 0;
});

afterEach(() => {
  PhysicalPlantService.destroy();
  EventBus.destroy();
});

const dishFault = { id: 'f-dish', target: 'dish-plug', kind: 'partial-seat' } as const;

describe('FX1 H1 evidence conditions never lock', () => {
  it('H1 test-first path completes both conditions and the fix is supported', () => {
    const svc = boot(plantConfig({ faults: [{ ...dishFault }] }));
    const before = C.evidenceBeforeAction('dish-plug', 'x', 'dish-plug');
    const cleared = C.faultClearedWithEvidence('f-dish');
    expect(run(before)).toBe(false);
    expect(run(cleared)).toBe(false);
    svc.plant.wiggle('dish-plug');
    expect(run(before)).toBe(false);
    svc.plant.reseat('dish-plug');
    tick(1);
    expect(run(before)).toBe(true);
    expect(run(cleared)).toBe(true);
    const summary = scoreDiagnosis(svc.evidence as NonNullable<typeof svc.evidence>, svc.plant, new DependencyGraph(plantConfig()));
    expect(summary.unsupportedFixes).toBe(0);
  });

  it('H1 fix-first path still completes and the scorer records an unsupported fix', () => {
    const svc = boot(plantConfig({ faults: [{ ...dishFault }] }));
    const before = C.evidenceBeforeAction('dish-plug', 'x', 'dish-plug');
    const cleared = C.faultClearedWithEvidence('f-dish');
    svc.plant.reseat('dish-plug');
    svc.plant.wiggle('dish-plug');
    tick(1);
    expect(run(before)).toBe(true);
    expect(run(cleared)).toBe(true);
    const summary = scoreDiagnosis(svc.evidence as NonNullable<typeof svc.evidence>, svc.plant, new DependencyGraph(plantConfig()));
    expect(summary.unsupportedFixes).toBe(1);
  });
});

describe('FX1 H2 powerRead', () => {
  it('H2 reads the downstream load the meter shows for a battery', () => {
    const svc = boot(plantConfig());
    tick(1);
    const meter = svc.plant.getPowerReadings().loadW.battery;
    expect(meter).toBeGreaterThan(5);
    expect(run(C.powerRead('battery', { loadW: { min: meter - 1, max: meter + 1 } }))).toBe(true);
  });
});

describe('FX1 H3 reserveHeld window', () => {
  it('H3 a restart does not inherit the earlier run window start', () => {
    const held = C.reserveHeld({ windowS: 60 });
    boot(plantConfig());
    tick(20);
    expect(run(held)).toBe(false);
    PhysicalPlantService.destroy();
    SimClock.reset();
    boot(plantConfig());
    tick(2);
    expect(run(held)).toBe(false);
    tick(60);
    expect(run(held)).toBe(true);
  });

  it('H3 the window start rides in the checkpoint', () => {
    const held = C.reserveHeld({ windowS: 60 });
    const svc = boot(plantConfig());
    tick(2);
    run(held);
    const saved = JSON.parse(JSON.stringify(svc.getState()));
    tick(30);
    run(held);
    tick(40);
    expect(run(held)).toBe(true);
    // Restore to t = 2 s: the window is still open from there, 60 s have not passed
    SimClock.reset();
    tick(2);
    svc.restoreState(saved);
    tick(10);
    expect(run(held)).toBe(false);
    // A checkpoint taken before the window opened cleans it
    const cold = boot(plantConfig());
    expect(cold).toBe(svc);
  });
});

describe('FX1 M1 events without a service model', () => {
  it('M1 an event stamps the evidence log with no service block', () => {
    const cfg = plantConfig({ events: [{ id: 'storm', startAfterObjectiveId: 'obj-a', actions: [{ kind: 'set-flag', key: 'wet', value: true }] }] });
    delete cfg.service;
    const svc = boot(cfg);
    objectives.states.set('obj-a', { isActive: true, isCompleted: false });
    tick(2);
    expect(svc.evidence?.entries().some((e) => e.source.eventId === 'storm')).toBe(true);
  });

  it('M1 a fault an event injected resolves its target in the next test entry', () => {
    const cfg = plantConfig({
      events: [{ id: 'wet', offsetS: 1, actions: [{ kind: 'inject-fault', fault: { id: 'f-late', target: 'dish-plug', kind: 'partial-seat' } }] }],
    });
    delete cfg.service;
    const svc = boot(cfg);
    tick(3);
    svc.plant.wiggle('dish-plug');
    const [entry] = svc.evidence?.entries('observation') ?? [];
    expect(entry.revealedTargets).toEqual(['dish-plug']);
  });
});

describe('FX1 M2 authored config stays untouched', () => {
  it('M2 shutting a generator off does not leak into a new manager from the same config', () => {
    const cfg: PlantConfig = {
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
        { id: 'router', kind: 'router', poweredBy: 'generator', loadW: 20 },
      ],
      connectors: [],
      cables: [],
    };
    const a = manager(cfg);
    a.plant.setPartMode('generator', 'off');
    expect(a.plant.getPartMode('generator')).toBe('off');
    expect(cfg.parts[0].running).toBe(true);
    expect(manager(cfg).plant.getPartMode('generator')).toBe('run');
    a.plant.reset();
    expect(a.plant.getPartMode('generator')).toBe('run');
  });
});

describe('FX1 M3 forecast cache', () => {
  it('M3 repeated forecasts reuse the projection until the state or overrides change', () => {
    const m = manager(plantConfig());
    const first = m.plant.forecast();
    for (let i = 0; i < 100; i++) m.plant.forecast();
    expect(forecastSpy.calls).toBe(1);
    expect(m.plant.forecast()).toEqual(first);
    m.plant.forecast({ skylink: 'active' });
    m.plant.forecast({ skylink: 'active' });
    expect(forecastSpy.calls).toBeLessThanOrEqual(2);
    m.tick(1);
    m.plant.forecast();
    expect(forecastSpy.calls).toBeLessThanOrEqual(3);
    const calls = forecastSpy.calls;
    m.plant.injectFault({ id: 'x', target: 'router', kind: 'net' } as never);
    m.plant.forecast();
    expect(forecastSpy.calls).toBe(calls + 1);
  });
});

describe('FX1 M4 numeric samples keep the layer status', () => {
  it('M4 a downMbps sample does not replace a recorded down status', () => {
    const svc = boot(plantConfig());
    svc.services?.takeSample('skylink', 'registration', 'terminal-app');
    expect(svc.evidence?.symptoms()).toEqual(['skylink']);
    svc.plant.setPartMode('skylink', 'active');
    tick(60);
    svc.services?.takeSample('skylink', 'registration', 'terminal-app', undefined, 'downMbps');
    expect(svc.evidence?.symptoms()).toEqual(['skylink']);
  });
});

describe('FX1 M5 flap history across a skip', () => {
  it('M5 one long update records every moisture flap edge in the skipped interval', () => {
    let t = 100;
    const cfg = plantConfig({ events: undefined });
    const m = manager(cfg);
    const model = new ServiceModel(cfg.service as NonNullable<PlantConfig['service']>, m.plant, undefined, { now: () => t });
    m.plant.setPartMode('skylink', 'active');
    m.tick(60);
    model.update();
    m.plant.injectFault({ id: 'wet', target: 'dish-plug', kind: 'moisture', severity: 1 });
    m.tick(1);
    t = 101;
    model.update();
    // One 300 s jump, a single sync
    m.setT(401);
    model.update();
    const flaps = model.history('skylink').filter((h) => h.layer === 'registration');
    const downs = flaps.filter((h) => h.to === 'down').length;
    const ups = flaps.filter((h) => h.to === 'up').length;
    expect(downs).toBeGreaterThanOrEqual(3);
    expect(ups).toBeGreaterThanOrEqual(3);
  });
});

describe('FX1 L2 L3 L4', () => {
  it('L2 same-kind rows with different parameters get different ids', () => {
    expect(C.layerObserved('s', 'transport' as never, { status: 'down' }).id).not.toBe(C.layerObserved('s', 'transport' as never, { status: 'up' }).id);
    expect(C.samplesCurrent('s', ['registration']).id).not.toBe(C.samplesCurrent('s', ['registration', 'account']).id);
    expect(C.forecastMeetsReserve({ a: 'on' }).id).not.toBe(C.forecastMeetsReserve({ a: 'off' }).id);
    expect(C.reserveHeld({ windowS: 5 }).id).not.toBe(C.reserveHeld({ windowS: 9 }).id);
  });

  it('L3 a dip below the reserve that recovers does not meet it', () => {
    const f = projectPower({
      nodes: [
        { id: 'gen', steadyW: 0, startupW: 0, startRemainingS: 0 },
        { id: 'bat', steadyW: 0, startupW: 0, startRemainingS: 0 },
        { id: 'load', parentId: 'bat', steadyW: 100, startupW: 100, startRemainingS: 0 },
      ],
      batteries: [{ id: 'bat', socWh: 110, capacityWh: 1000, chargeW: 400, sourceId: 'gen' }],
      generators: [{ id: 'gen', running: true, startRemainingS: 1200, fuelL: 5, ratedW: 2000, burnLPerHour: 1.5 }],
      basis: 'with-generator',
      horizonS: 3600,
      reserveWh: 100,
      startupCostS: 0,
    });
    expect(f.projectedSocWh).toBeGreaterThan(100);
    expect(f.secondsToReserve).not.toBeNull();
    expect(f.meetsReserve).toBe(false);
  });

  it('L4 the forecast does not credit a generator that is out of fuel', () => {
    const cfg: PlantConfig = {
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
            { id: 'run', label: 'Run', loadW: 0 },
          ],
        },
        { id: 'power-station', kind: 'battery', poweredBy: 'generator', capacityWh: 1000, socWh: 400, maxOutputW: 600, nominalV: 12, loadW: 0 },
        { id: 'router', kind: 'router', poweredBy: 'power-station', loadW: 100 },
      ],
      connectors: [],
      cables: [],
      power: { reserveWh: 200, planningHorizonS: 1800, basis: 'with-generator' },
    };
    const m = manager(cfg);
    m.plant.injectFault({ id: 'dry', target: 'generator', kind: 'out-of-fuel' } as never);
    expect(m.plant.forecast().projectedSocWh).toBeCloseTo(400 - 100 * 0.5, 1);
  });
});
