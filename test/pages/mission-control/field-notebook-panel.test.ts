/**
 * M12 notebook panel: hidden without a log, timeline of plant actions, hypothesis form, cites,
 * frozen text, scope-dependent targets.
 */

import { EventBus } from '@app/events/event-bus';
import { buildNotebookLine, describeHypothesis, FieldNotebookPanel } from '@app/pages/mission-control/tabs/field-notebook-panel';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ScenarioManager } from '@app/scenario-manager';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function config(withService = true): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink', poweredBy: 'battery', nominalV: 12, loadW: 50 },
    ],
    connectors: [],
    cables: [],
    faults: [],
    ...(withService
      ? {
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
        }
      : {}),
  } as PlantConfig;
}

function boot(cfg: PlantConfig): PhysicalPlantService {
  ScenarioManager.getInstance().settings = { physicalPlant: cfg } as never;

  return PhysicalPlantService.getInstance();
}

function panel(): { host: HTMLElement; p: FieldNotebookPanel } {
  const host = document.createElement('div');
  const p = new FieldNotebookPanel(
    host,
    () => PhysicalPlantService.evidenceOrNull(),
    (scope) => (scope === 'part' ? [{ id: 'router', label: 'Router' }] : scope === 'provider' ? [{ id: 'prov', label: 'prov' }] : [])
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

describe('M12 notebook panel', () => {
  it('is hidden without an evidence log', () => {
    boot(config(false));
    const { host, p } = panel();
    p.sync();
    expect(host.style.display).toBe('none');
  });

  it('shows plant actions on the timeline, newest first', () => {
    const svc = boot(config());
    const { host, p } = panel();
    p.sync();
    expect(host.style.display).toBe('');
    expect(host.textContent).toContain('Nothing recorded yet');
    svc.plant.inspect('router');
    svc.plant.inspect('skylink');
    p.sync();
    const rows = host.querySelectorAll('[data-nb-entry]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-nb-entry')).toBe(svc.evidence?.entries()[1].id);
    expect(host.querySelectorAll('input[data-nb-cite]')).toHaveLength(2);
  });

  it('adds a hypothesis with cites and frozen text', () => {
    const svc = boot(config());
    const { host, p } = panel();
    p.sync();
    svc.plant.inspect('router');
    p.sync();
    const first = svc.evidence?.entries()[0];
    const res = p.addHypothesis({ scope: 'part', targetId: 'router', cause: 'loose plug', confidence: 'high', citedEntryIds: [first?.id ?? '', 'bogus'] });
    expect(typeof res).toBe('object');
    const h = svc.evidence?.entries('hypothesis')[0] as never as { claim: unknown; citedEntryIds: string[]; confidence: string; text: string; subject: string };
    expect(h.claim).toEqual({ scope: 'part', targetId: 'router', cause: 'loose plug' });
    expect(h.citedEntryIds).toEqual([first?.id]);
    expect(h.confidence).toBe('high');
    expect(h.text).toContain('Router: loose plug');
    expect(h.text).toContain('high confidence');
    expect(h.text).toContain('1 cited entry');
    expect(h.subject).toBe('router');
    expect(host.querySelectorAll('.fnb-k-hypothesis')).toHaveLength(1);
    expect(host.textContent).toContain('cites #1');
    // hypotheses are not citable
    expect(host.querySelectorAll('input[data-nb-cite]')).toHaveLength(1);
  });

  it('rejects a hypothesis with no valid target', () => {
    const svc = boot(config());
    const { p } = panel();
    p.sync();
    expect(p.addHypothesis({ scope: 'endpoint', targetId: 'x', confidence: 'low', citedEntryIds: [] })).toBe('no-target');
    expect(svc.evidence?.entries('hypothesis')).toHaveLength(0);
  });

  it('button path reads the form and the scope change swaps targets', () => {
    const svc = boot(config());
    const { host, p } = panel();
    p.sync();
    const scope = host.querySelector<HTMLSelectElement>('select[data-nb-scope]');
    const target = host.querySelector<HTMLSelectElement>('select[data-nb-target]');
    expect(target?.options[0].value).toBe('router');
    if (scope) scope.value = 'provider';
    scope?.dispatchEvent(new Event('change', { bubbles: true }));
    expect(host.querySelector<HTMLSelectElement>('select[data-nb-target]')?.options[0].value).toBe('prov');
    host.querySelector<HTMLButtonElement>('button[data-nb-act="add"]')?.click();
    const h = svc.evidence?.entries('hypothesis')[0] as never as { claim: { scope: string; targetId: string } };
    expect(h.claim).toMatchObject({ scope: 'provider', targetId: 'prov' });
  });

  it('describeHypothesis and buildNotebookLine are plain language', () => {
    expect(describeHypothesis({ scope: 'power', targetId: 'b' }, 'Battery', 'low', 0)).toBe('Suspect Battery (power supply), low confidence, no cited entries.');
    const line = buildNotebookLine({ id: 'e1', kind: 'action', tS: 75, subject: 's', source: {}, facts: [], text: 'x' }, []);
    expect(line.stamp).toBe('elapsed 01:15');
    expect(line.kindLabel).toBe('Did');
  });
});
