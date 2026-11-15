import { hamTechS01Data } from '@app/campaigns/ham-sdr/tech/s01-first-signal';
import { EventBus } from '@app/events/event-bus';
import { LocatePulse } from '@app/objectives/locate-pulse';
import type { Condition, Objective } from '@app/objectives/objective-types';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { collectWhereEntries, locatorUsesTrip, renderWherePage, whereSuffix } from '@app/objectives/where-locator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const cond = (extra: Partial<Condition> = {}): Condition => ({ type: 'hpa-enabled', description: 'Do the thing', mustMaintain: false, ...extra }) as Condition;

const objective = (id: string, conditions: Condition[], prerequisiteObjectiveIds: string[] = []): Objective =>
  ({ id, title: `Title ${id}`, description: 'd', conditions, prerequisiteObjectiveIds, points: 1 }) as Objective;

describe('where locator', () => {
  beforeEach(() => {
    EventBus.destroy();
  });
  afterEach(() => {
    ObjectivesManager.destroy();
    document.body.innerHTML = '';
  });

  it('trims the locator and brackets it for the row suffix', () => {
    expect(whereSuffix({ where: ' Logbook > Worksheets ' })).toBe('(Logbook > Worksheets)');
    expect(whereSuffix({ where: '   ' })).toBeNull();
    expect(whereSuffix({})).toBeNull();
  });

  it('renders the locator as a suffix on an incomplete checklist row, escaped, and omits it when absent', () => {
    ObjectivesManager.initialize([objective('a', [cond({ where: 'Logbook > Worksheets' }), cond({ description: 'Plain row' })])]);
    const html = ObjectivesManager.getInstance().generateHtmlChecklist();

    expect(html).toContain('class="condition-where condition-observe-hint">(Logbook &gt; Worksheets)</span>');
    expect(html.match(/condition-where/gu)).toHaveLength(1);
  });

  it('replaces the automatic observation suffix when a locator is given', () => {
    const row = cond({ where: 'TX Chain > HPA', params: { requiresObservation: true, observationTab: 'rx-analysis' } as Condition['params'] });
    ObjectivesManager.initialize([objective('a', [row])]);
    const html = ObjectivesManager.getInstance().generateHtmlChecklist();

    expect(html).toContain('(TX Chain &gt; HPA)');
    expect(html).not.toContain('check it on the');
  });

  it('orders entries active, later, done and skips hidden rows', () => {
    ObjectivesManager.initialize([
      objective('a', [cond({ where: 'A place' }), cond({ where: 'Hidden place', hidden: true })]),
      objective('b', [cond({ where: 'B place (outside, uses a trip)' })], ['a']),
    ]);
    const entries = collectWhereEntries(ObjectivesManager.getInstance().getObjectiveStates());

    expect(entries.map((e) => [e.where, e.status])).toEqual([
      ['A place', 'active'],
      ['B place (outside, uses a trip)', 'later'],
    ]);
    expect(entries[1].usesTrip).toBe(true);
    expect(locatorUsesTrip('Logbook')).toBe(false);
  });

  it('renders nothing for a scenario with no locators', () => {
    ObjectivesManager.initialize([objective('a', [cond()])]);

    expect(renderWherePage(collectWhereEntries(ObjectivesManager.getInstance().getObjectiveStates()), { kind: 'index-card', title: 'T' })).toBeNull();
  });

  it('renders entries, status and glossary into the page', () => {
    ObjectivesManager.initialize([objective('a', [cond({ where: 'A place' })])]);
    const page = renderWherePage(collectWhereEntries(ObjectivesManager.getInstance().getObjectiveStates()), {
      kind: 'console-map',
      title: 'Console map',
      glossary: [['modem 2', 'TX 2']],
    });

    expect(page?.className).toContain('where-page--console-map');
    expect(page?.querySelectorAll('[data-testid="where-entry"]')).toHaveLength(1);
    expect(page?.querySelector('dt')?.textContent).toBe('modem 2');
  });

  it('C3 S1 carries the Logbook naming fix and the five findability locators', () => {
    const rows = hamTechS01Data.objectives.flatMap((o) => o.conditions).filter((c) => c.where);

    expect(rows.map((c) => c.where)).toEqual([
      'Logbook > Worksheets, or click each part on the bench',
      'laptop > Open SkyWatcher SDR',
      'SDR program: volume, squelch, filter',
      'SDR program > heard list',
      'Logbook > Worksheets',
    ]);
    expect(JSON.stringify(hamTechS01Data)).not.toContain('Notebook');
  });
});

describe('locate pulse', () => {
  const tray = (): HTMLElement => {
    document.body.innerHTML = '<nav><button data-locate="kit:logbook" id="lb">Logbook</button><button data-locate="kit:cards" id="cd">Cards</button></nav>';

    return document.getElementById('lb') as HTMLElement;
  };

  afterEach(() => {
    LocatePulse.destroy();
    document.body.innerHTML = '';
  });

  it('pulses the target once when an objective opens, and a click clears it for good', () => {
    const lb = tray();
    const pulse = LocatePulse.getInstance();
    const o = objective('trace', [cond({ locate: 'kit:logbook' })]);

    pulse.objectiveActivated(o);
    expect(lb.classList.contains('locate-pulse')).toBe(true);
    expect(document.getElementById('cd')?.classList.contains('locate-pulse')).toBe(false);

    lb.click();
    expect(lb.classList.contains('locate-pulse')).toBe(false);
    expect(pulse.pendingTargets()).toEqual([]);

    pulse.objectiveActivated(o);
    expect(lb.classList.contains('locate-pulse')).toBe(false);
  });

  it('leaves a data-locate-manual element to its host, which clears it with opened()', () => {
    const lb = tray();
    const pulse = LocatePulse.getInstance();

    lb.setAttribute('data-locate-manual', '');
    pulse.objectiveActivated(objective('trace', [cond({ locate: 'kit:logbook' })]));
    lb.click();
    expect(lb.classList.contains('locate-pulse')).toBe(true);

    LocatePulse.opened('kit:logbook');
    expect(lb.classList.contains('locate-pulse')).toBe(false);
  });

  it('pulses again for a different objective that needs the same target', () => {
    const lb = tray();
    const pulse = LocatePulse.getInstance();

    pulse.objectiveActivated(objective('one', [cond({ locate: 'kit:logbook' })]));
    lb.click();
    pulse.objectiveActivated(objective('two', [cond({ locate: 'kit:logbook' })]));
    expect(lb.classList.contains('locate-pulse')).toBe(true);
  });

  it('picks up an element rendered after the pulse started', () => {
    const pulse = LocatePulse.getInstance();

    pulse.objectiveActivated(objective('one', [cond({ locate: 'kit:logbook' })]));
    const lb = tray();
    LocatePulse.syncIfActive();
    expect(lb.classList.contains('locate-pulse')).toBe(true);
  });

  it('the objectives manager starts the pulse for an initially active objective', () => {
    ObjectivesManager.initialize([objective('a', [cond({ locate: 'kit:logbook' })])]);
    expect(LocatePulse.getInstance().pendingTargets()).toEqual(['kit:logbook']);
    ObjectivesManager.destroy();
  });
});

describe('locate pulse completion', () => {
  afterEach(() => {
    LocatePulse.destroy();
  });

  it('stops pulsing an objective target when that objective completes', () => {
    const o = objective('a', [cond({ locate: 'kit:logbook' })]);
    const pulse = LocatePulse.getInstance();
    pulse.objectiveActivated(o);
    expect(pulse.pendingTargets()).toEqual(['kit:logbook']);
    pulse.objectiveCompleted(o);
    expect(pulse.pendingTargets()).toEqual([]);
  });
});
