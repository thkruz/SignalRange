/**
 * M11 workload panel: card list, start, live progress, result stamps, S5 shares and priority,
 * hold (waitForRun), hidden without workloads.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { buildRunLine, describeCard, FieldWorkloadPanel, priorityForWeight } from '@app/pages/mission-control/tabs/field-workload-panel';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ScenarioManager } from '@app/scenario-manager';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function config(withWorkloads = true): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink', poweredBy: 'battery', nominalV: 12, loadW: 50 },
    ],
    connectors: [],
    cables: [],
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
    ...(withWorkloads
      ? {
          workloads: {
            cards: [
              { id: 'chat', version: 1, label: 'Chat', minDownMbps: 1, windowS: 20, priority: 'routine' as const },
              { id: 'video', version: 1, label: 'Video', minDownMbps: 80, windowS: 20, priority: 'mission' as const },
              { id: 'sync', version: 1, label: 'Map sync', minDownMbps: 5, windowS: 30, priority: 'background' as const },
            ],
          },
        }
      : {}),
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

function panel(): { host: HTMLElement; p: FieldWorkloadPanel } {
  const host = document.createElement('div');
  const p = new FieldWorkloadPanel(
    host,
    () => PhysicalPlantService.workloadsOrNull(),
    () => PhysicalPlantService.servicesOrNull(),
    () => PhysicalPlantService.plantOrNull()?.getTimeSeconds() ?? 0
  );

  return { host, p };
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

describe('M11 workload panel', () => {
  it('is hidden without workloads', () => {
    boot(config(false));
    const { host, p } = panel();
    p.sync();
    expect(host.style.display).toBe('none');
  });

  it('lists cards with background transfers grouped apart, and plain requirement text', () => {
    boot(config());
    const { host, p } = panel();
    p.sync();
    expect(host.style.display).toBe('');
    expect(host.querySelectorAll('[data-wl-card]')).toHaveLength(3);
    expect(host.textContent).toContain('Background transfers');
    expect(describeCard({ id: 'x', version: 1, label: 'X', minDownMbps: 5, maxRttMs: 80, windowS: 30, priority: 'routine' })).toBe(
      'down at least 5 Mbps, latency under 80 ms, 30 s window'
    );
    expect(priorityForWeight(4)).toBe('mission');
    expect(priorityForWeight(1)).toBe('background');
  });

  it('Start button runs a card, progress advances, result has timestamps', () => {
    boot(config());
    const { host, p } = panel();
    p.sync();
    host.querySelector<HTMLButtonElement>('[data-wl-card="chat"] button[data-wl-act="start"]')?.click();
    const li = host.querySelector('[data-wl-run]');
    expect(li?.textContent).toContain('Chat on SkyLink');
    expect(li?.textContent).toContain('Running');
    tick(10);
    p.sync();
    const bar = host.querySelector<HTMLProgressElement>('progress');
    expect(bar?.value).toBeGreaterThan(30);
    expect(bar?.value).toBeLessThan(80);
    tick(12);
    p.sync();
    const done = host.querySelector('[data-wl-run]');
    expect(done?.textContent).toContain('Supported');
    expect(done?.textContent).toMatch(/Started \d\d:\d\d, ended \d\d:\d\d/u);
    expect(done?.querySelector('button')).toBeNull();
  });

  it('a second start of the same card on the same service is refused with a message', () => {
    boot(config());
    const { host, p } = panel();
    p.sync();
    expect(typeof p.start('chat', 'skylink')).toBe('object');
    expect(p.start('chat', 'skylink')).toBe('already-running');
    expect(host.querySelector('[data-fwp="last"]')?.textContent).toContain('already running');
  });

  it('shows capacity share for concurrent runs and the priority control changes it', () => {
    const svc = boot(config());
    const { host, p } = panel();
    p.sync();
    p.start('chat', 'skylink');
    p.start('sync', 'skylink');
    tick(1);
    p.sync();
    expect(host.textContent).toContain('% of capacity');
    const runner = svc.workloads;
    if (!runner) throw new Error('no runner');
    const syncRun = runner.running().find((r) => r.cardId === 'sync');
    if (!syncRun) throw new Error('no sync run');
    const before = runner.shareOf(syncRun);
    const sel = host.querySelector<HTMLSelectElement>('[data-wl-card="sync"] select[data-wl-priority]');
    expect(sel?.value).toBe('background');
    if (sel) {
      sel.value = 'mission';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect(runner.getPriority('sync')).toBe(4);
    expect(runner.shareOf(syncRun)).toBeGreaterThan(before);
  });

  it('Hold burns the remaining window and finishes the run', () => {
    const svc = boot(config());
    const { host, p } = panel();
    p.sync();
    p.start('chat', 'skylink');
    const t0 = svc.plant?.getTimeSeconds() ?? 0;
    host.querySelector<HTMLButtonElement>('button[data-wl-act="hold"]')?.click();
    expect((svc.plant?.getTimeSeconds() ?? 0) - t0).toBeGreaterThanOrEqual(19);
    expect(host.querySelector('[data-wl-run]')?.textContent).toContain('Supported');
  });

  it('Stop aborts a run and says so', () => {
    boot(config());
    const { host, p } = panel();
    p.sync();
    const r = p.start('chat', 'skylink');
    expect(p.abort((r as { id: string }).id)).toBe(true);
    expect(host.querySelector('[data-wl-run]')?.textContent).toContain('Stopped by you');
  });

  it('a run line lists the metrics that fell short', () => {
    const svc = boot(config());
    const runner = svc.workloads;
    if (!runner) throw new Error('no runner');
    const res = runner.start('video', 'skylink');
    if (!res.ok) throw new Error('start failed');
    const run = { ...res.run, status: 'unsupported' as const, unmet: ['downMbps'], endS: res.run.startS + 20 };
    const line = buildRunLine(run, runner, 'SkyLink', run.endS);
    expect(line.result).toBe('Unsupported, fell short on download.');
    expect(line.stamps).toMatch(/^Started \d\d:\d\d, ended \d\d:\d\d$/u);
  });
});
