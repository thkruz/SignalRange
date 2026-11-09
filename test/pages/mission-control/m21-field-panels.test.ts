/**
 * M21 panels: a check spends scenario time by its provenance cost, and the notebook offers a
 * graded cause select when the plant authors cause options.
 */

import { EventBus } from '@app/events/event-bus';
import { FieldNotebookPanel } from '@app/pages/mission-control/tabs/field-notebook-panel';
import { CHECK_COST_S, FieldServicePanel } from '@app/pages/mission-control/tabs/field-service-panel';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ScenarioManager } from '@app/scenario-manager';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function config(causeOptions?: PlantConfig['causeOptions']): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'Skylink', poweredBy: 'battery', nominalV: 12, loadW: 50 },
    ],
    connectors: [],
    cables: [],
    faults: [],
    ...(causeOptions ? { causeOptions } : {}),
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
  } as PlantConfig;
}

function boot(cfg: PlantConfig): PhysicalPlantService {
  ScenarioManager.getInstance().settings = { physicalPlant: cfg } as never;

  return PhysicalPlantService.getInstance();
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

describe('M21 check cost', () => {
  it('prices the provenances', () => {
    expect(CHECK_COST_S['device-indicator']).toBe(5);
    expect(CHECK_COST_S['provider-portal']).toBe(15);
    expect(CHECK_COST_S['workload-run']).toBe(0);
  });

  it('spends the provenance cost when a check is made, and nothing without a spender', () => {
    const svc = boot(config());
    const spent: number[] = [];
    const host = document.createElement('div');
    const panel = new FieldServicePanel(
      host,
      () => svc.services,
      () => svc.plant.getTimeSeconds(),
      (s) => spent.push(s)
    );
    panel.sync();
    const row = host.querySelector<HTMLElement>('[data-svc-layer="power"]') as HTMLElement;
    (row.querySelector('button[data-svc-check]') as HTMLButtonElement).click();
    expect(spent).toEqual([CHECK_COST_S['device-indicator']]);

    const free = document.createElement('div');
    const quiet = new FieldServicePanel(
      free,
      () => svc.services,
      () => svc.plant.getTimeSeconds()
    );
    quiet.sync();
    expect(() => (free.querySelector('[data-svc-layer="power"] button[data-svc-check]') as HTMLButtonElement).click()).not.toThrow();
  });
});

describe('M21 notebook cause select', () => {
  const OPTIONS = [
    { id: 'connector-moisture', label: 'Moisture at a connector' },
    { id: 'router', label: 'Router problem' },
  ];

  function panel(options: PlantConfig['causeOptions']) {
    const host = document.createElement('div');
    const p = new FieldNotebookPanel(
      host,
      () => PhysicalPlantService.evidenceOrNull(),
      () => [{ id: 'router', label: 'Router' }],
      () => options ?? null
    );
    p.sync();

    return host;
  }

  it('renders a select of the authored causes plus Something else', () => {
    boot(config(OPTIONS));
    const host = panel(OPTIONS);
    const select = host.querySelector<HTMLSelectElement>('select[data-nb-cause]');
    expect(select).not.toBeNull();
    expect([...(select?.options ?? [])].map((o) => o.value)).toEqual(['', 'connector-moisture', 'router', 'other']);
  });

  it('keeps the free text input without authored causes', () => {
    boot(config());
    const host = panel(undefined);
    expect(host.querySelector('input[data-nb-cause]')).not.toBeNull();
    expect(host.querySelector('select[data-nb-cause]')).toBeNull();
  });

  it('files the chosen cause id on the claim and the label in the text', () => {
    const svc = boot(config(OPTIONS));
    const host = panel(OPTIONS);
    svc.plant.inspect('router');
    const select = host.querySelector<HTMLSelectElement>('select[data-nb-cause]') as HTMLSelectElement;
    select.value = 'connector-moisture';
    host.querySelector<HTMLButtonElement>('button[data-nb-act="add"]')?.click();
    const h = svc.evidence?.entries('hypothesis')[0] as unknown as { claim: { cause?: string }; text: string };
    expect(h.claim.cause).toBe('connector-moisture');
    expect(h.text).toContain('Moisture at a connector');
  });
});
