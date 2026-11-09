/**
 * M24 S10 completion: a provider capacity restriction degrades the application while local equipment is
 * unchanged. The player records the change, marks the changed segment on the diagram (no local hardware),
 * scopes the delivered notice, assesses each task against the reduced service, runs only the supported task
 * after reporting the limit, and files an equipment request. The restriction stays in force at the end.
 */

import { FORWARD_SKYLINK_ACCOUNT } from '@app/campaigns/frontline/forward-field-config';
import { frontlineScenario10Data, S10_EVENT_RESTRICTION, S10_FEED_CARD, S10_NOTICE, S10_REPORT_CARD, S10_REQUEST } from '@app/campaigns/frontline/scenario10';
import { EventBus } from '@app/events/event-bus';
import type { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, driveObjectives, type ObjectiveStates, tick, unmet } from './frontline-completion-support';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const states = objectives.states as ObjectiveStates;
const data = frontlineScenario10Data;
const ACCOUNT_NODE = `account:${FORWARD_SKYLINK_ACCOUNT}`;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const resultIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('result') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};
const value = (svc: PhysicalPlantService, layer: 'local' | 'registration' | 'account' | 'application'): { value: string } => ({
  value: String(svc.services?.latest('skylink', layer)?.value),
});

function takeAll(svc: PhysicalPlantService): void {
  svc.services?.takeSample('skylink', 'local', 'local-probe');
  svc.services?.takeSample('skylink', 'registration', 'terminal-app');
  svc.services?.takeSample('skylink', 'account', 'provider-portal');
  svc.services?.takeSample('skylink', 'application', 'endpoint-report');
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's10-record-change': () => {
      tick(25);
      takeAll(svc);
      ok(svc.records?.submit('symptoms', { application: value(svc, 'application'), onset: { cites: resultIds(svc) }, evidence: { cites: obsIds(svc) } }));
    },
    's10-compare-health': () => {
      svc.plant.inspect('skylink-router');
      takeAll(svc);
      svc.evidence?.recordSelection([ACCOUNT_NODE], 'The changed segment');
      ok(
        svc.records?.submit('health', {
          local: value(svc, 'local'),
          registration: value(svc, 'registration'),
          application: value(svc, 'application'),
          policy: { value: 'not-established' },
        })
      );
    },
    's10-read-notice': () => {
      tick(2);
      ok(
        svc.records?.submit('notice-scope', {
          account: { value: FORWARD_SKYLINK_ACCOUNT },
          effect: { value: 'ground-capacity' },
          registration: { value: 'unchanged' },
          local: { value: 'not-implicated' },
          effective: { cites: resultIds(svc) },
        })
      );
    },
    's10-assess-tasks': () => {
      ok(svc.records?.submit('assessment', { feed: { value: 'unsupported' }, report: { value: 'supported' }, basis: { cites: obsIds(svc) } }));
    },
    's10-run-reduced-service': () => {
      ok(svc.records?.submit('limitation-report', { limit: { value: 'ground-capacity' }, task: { value: S10_REPORT_CARD.id }, unavailable: { value: S10_FEED_CARD.id } }));
      const start = svc.workloads?.start(S10_REPORT_CARD.id, 'skylink');
      expect(start?.ok).toBe(true);
      const run = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
      expect(run?.status, JSON.stringify(run)).toBe('supported');
      takeAll(svc);
      ok(svc.records?.submit('reduced-outcome', { verified: { value: run?.id ?? '' }, account: value(svc, 'account'), restriction: { value: 'remains-active' } }));
    },
    's10-file-request': () => {
      ok(
        svc.records?.submit('package', {
          onset: { cites: resultIds(svc) },
          local: { cites: obsIds(svc) },
          notice: { value: S10_NOTICE },
          supported: { value: S10_REPORT_CARD.id },
          gap: { value: S10_FEED_CARD.id },
        })
      );
      expect(svc.records?.equipment?.submitCorrection(S10_REQUEST)?.ok).toBe(true);
      tick(2);
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(10);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M24 S10 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order and the restriction is still in force', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc), {});
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.services?.getState().accounts.find((a) => a.id === FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    expect(svc.plant.getConfig().diagram?.highlightShared).toBe(true);
  });

  it('degrades the application after the onset while the local layers stay up', () => {
    const svc = bootScenario(data);
    states.set('s10-record-change', { isActive: true, isCompleted: false });
    tick(5);
    takeAll(svc);
    expect(svc.services?.latest('skylink', 'application')?.value).toBe('up');
    tick(25);
    takeAll(svc);
    expect(svc.services?.latest('skylink', 'application')?.value).toBe('degraded');
    expect(svc.services?.latest('skylink', 'local')?.value).toBe('up');
    expect(svc.services?.latest('skylink', 'registration')?.value).toBe('up');
    expect(S10_EVENT_RESTRICTION).toBe('s10-capacity-restriction');
  });

  it('does not accept a local-hardware selection, or one made before the onset, as the changed segment', () => {
    const svc = bootScenario(data);
    states.set('s10-record-change', { isActive: true, isCompleted: false });
    svc.evidence?.recordSelection([ACCOUNT_NODE], 'Early guess');
    tick(25);
    svc.evidence?.recordSelection([ACCOUNT_NODE, 'skylink-router'], 'Blames the router');
    expect(incomplete(svc, 's10-compare-health')).toContain('Changed segment marked without local equipment');
    svc.evidence?.recordSelection([ACCOUNT_NODE], 'Account only');
    expect(incomplete(svc, 's10-compare-health')).not.toContain('Changed segment marked without local equipment');
  });

  it('rejects a task assessment that calls the camera feed supported', () => {
    const svc = bootScenario(data);
    states.set('s10-record-change', { isActive: true, isCompleted: false });
    tick(25);
    takeAll(svc);
    const bad = svc.records?.submit('assessment', { feed: { value: 'supported' }, report: { value: 'supported' }, basis: { cites: obsIds(svc) } });
    expect(bad?.ok).toBe(false);
    expect(incomplete(svc, 's10-assess-tasks').length).toBe(1);
  });

  it('does not count the unsupported camera feed run, or a run before the limitation report', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's10-assess-tasks' });
    const early = svc.workloads?.start(S10_REPORT_CARD.id, 'skylink');
    svc.workloads?.waitForRun(early?.ok ? early.run.id : '');
    const feed = svc.workloads?.start(S10_FEED_CARD.id, 'skylink');
    const feedRun = svc.workloads?.waitForRun(feed?.ok ? feed.run.id : '');
    expect(feedRun?.status).not.toBe('supported');
    expect(incomplete(svc, 's10-run-reduced-service')).toContain('Supported task window run after the report');
  });

  it('holds the contact answer until the request is filed', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's10-run-reduced-service' });
    states.set('s10-file-request', { isActive: true, isCompleted: false });
    tick(5);
    expect(incomplete(svc, 's10-file-request')).toContain('Alternative-equipment request filed');
    expect(incomplete(svc, 's10-file-request')).toContain('Request acknowledged');
  });

  it('restores a checkpoint taken after the restriction with the account still restricted', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's10-read-notice' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(again.services?.getState().accounts.find((a) => a.id === FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    expect(incomplete(again, 's10-read-notice')).toEqual([]);
  });
});
