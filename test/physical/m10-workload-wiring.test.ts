/**
 * M10 service wiring: the runner exists only when the plant authors workloads and services, rides in
 * checkpoints, feeds the workloadVerified condition and shows in __fieldStatus.
 */

import * as C from '@app/campaigns/frontline/frontline-conditions';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ScenarioManager } from '@app/scenario-manager';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const run = (c: { params?: { evaluator?: unknown } }): boolean => (c.params as { evaluator: () => boolean }).evaluator();

function config(withWorkloads = true): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'Skylink', poweredBy: 'battery', nominalV: 12, loadW: 50 },
    ],
    connectors: [],
    cables: [],
    faults: [],
    service: {
      paths: [
        {
          id: 'skylink',
          label: 'Skylink',
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
    ...(withWorkloads ? { workloads: { cards: [{ id: 'chat', version: 1, label: 'Chat', minDownMbps: 1, windowS: 20, priority: 'routine' as const }] } } : {}),
  } as PlantConfig;
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

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(5);
});

afterEach(() => {
  PhysicalPlantService.destroy();
  EventBus.destroy();
});

describe('M10 wiring', () => {
  it('builds the runner only when workloads are authored', () => {
    expect(boot(config(false)).workloads).toBeNull();
    PhysicalPlantService.destroy();
    const svc = boot(config());
    expect(svc.workloads).not.toBeNull();
    expect(PhysicalPlantService.fieldOrNull()?.workloads).toBe(svc.workloads);
    expect(PhysicalPlantService.workloadsOrNull()).toBe(svc.workloads);
  });

  it('drives runs from the update tick and satisfies workloadVerified', () => {
    const svc = boot(config());
    const cond = C.workloadVerified({ card: 'chat', service: 'skylink' });
    expect(run(cond)).toBe(false);
    svc.workloads?.start('chat', 'skylink');
    tick(19);
    expect(run(cond)).toBe(false);
    tick(2);
    expect(run(cond)).toBe(true);
    const status = (window as unknown as { __fieldStatus: () => { workloads: Array<{ status: string }> } }).__fieldStatus();
    expect(status.workloads[0].status).toBe('supported');
  });

  it('round-trips through the checkpoint: a running run comes back aborted', () => {
    const svc = boot(config());
    svc.workloads?.start('chat', 'skylink');
    tick(5);
    const states = JSON.parse(JSON.stringify(collectManagerStates()));
    expect(states.physicalPlant.workloads.runs).toHaveLength(1);
    PhysicalPlantService.destroy();
    const again = boot(config());
    restoreManagerStates(states);
    expect(again.workloads?.getRuns()[0].status).toBe('aborted');
    expect(again.workloads?.getRuns()[0].invalidatedBy).toBe('reload');
  });
});
