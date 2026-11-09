/**
 * M22 S5 completion: a standing background transfer starves Ola's application while the terminal
 * stays registered; the player compares the readings, grades the scope, attributes the demand, defers
 * the transfer through the priority control and verifies with a fresh run. Wrong paths fail, and a
 * checkpoint mid-scenario keeps the transfer running.
 */

import { frontlineScenario5Data } from '@app/campaigns/frontline/scenario5';
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
const data = frontlineScenario5Data;
const obj = (id: string) => data.objectives.find((o) => o.id === id) as NonNullable<(typeof data.objectives)[number]>;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(obj(id) as never, svc);

const APP = 'ola-app';
const TRANSFER = 'sync-transfer';

const observations = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);

function appRun(svc: PhysicalPlantService) {
  const start = svc.workloads?.start(APP, 'skylink');
  expect(start?.ok).toBe(true);

  return svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
}

const lastRunId = (svc: PhysicalPlantService, status?: string): string =>
  [...(svc.workloads?.getRuns() ?? [])].reverse().find((r) => r.cardId === APP && (status === undefined || r.status === status))?.id ?? '';

function fileHypothesis(svc: PhysicalPlantService, cause: string, cited: string[]): void {
  svc.evidence?.addHypothesis({
    subject: 'local-service',
    source: {},
    facts: [],
    text: `Suspect ${cause}`,
    claim: { scope: 'segment', targetId: 'local-service', cause },
    confidence: 'medium',
    citedEntryIds: cited,
  });
}

function submitOk(svc: PhysicalPlantService, form: string, values: Record<string, { value?: string; cites?: string[] }>): void {
  const res = svc.records?.submit(form, values);
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's5-compare-endpoints': () => {
      tick(10);
      svc.services?.takeSample('skylink', 'registration', 'device-indicator');
      const fin = appRun(svc);
      expect(fin?.status).toBe('unsupported');
    },
    's5-read-service-quality': () => {
      svc.services?.takeSample('skylink', 'registration', 'device-indicator');
      submitOk(svc, 'service-comparison', {
        run: { value: lastRunId(svc) },
        short: { value: 'capacity' },
        met: { value: 'delay-and-registration' },
        evidence: { cites: observations(svc) },
      });
    },
    's5-assess-service-scope': () => {
      fileHypothesis(svc, 'shared-capacity', observations(svc));
      submitOk(svc, 'scope', { scope: { value: 'local-shared-service' }, 'ruled-out': { value: 'terminal-and-power' }, evidence: { cites: observations(svc) } });
    },
    's5-identify-shared-use': () => {
      submitOk(svc, 'attribution', { workload: { value: TRANSFER }, keep: { value: APP }, basis: { cites: observations(svc) } });
    },
    's5-apply-priority': () => {
      svc.workloads?.setPriority(TRANSFER, 1);
    },
    's5-verify-service-change': () => {
      tick(5);
      const fin = appRun(svc);
      expect(fin?.status, JSON.stringify(fin)).toBe('supported');
      submitOk(svc, 'service-record', {
        before: { value: lastRunId(svc, 'unsupported') },
        after: { value: lastRunId(svc, 'supported') },
        cause: { value: 'shared-capacity' },
        deferred: { value: TRANSFER },
        terminal: { value: 'unchanged' },
      });
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(5);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M22 S5 completion', () => {
  it('has no placeholder gates and no objective passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    tick(2);
    for (const o of data.objectives) {
      const missing = unmet(o as never, svc);
      expect(missing.length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc));
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.workloads?.getPriority(TRANSFER)).toBe(1);
    expect(svc.plant.getFaults()).toEqual([]);
  });

  it('runs the transfer before the first observation and shares capacity with the app', () => {
    const svc = bootScenario(data);
    const running = svc.workloads?.running('skylink') ?? [];
    expect(running.map((r) => r.cardId)).toEqual([TRANSFER]);
    const start = svc.workloads?.start(APP, 'skylink');
    const run = start?.ok ? start.run : undefined;
    // Weights: transfer 4, app 2 -> the app gets a third of 120 Mbps (40), below the 70 Mbps it needs
    expect(svc.workloads?.shareOf(run as never)).toBeCloseTo(1 / 3, 5);
    // The terminal is registered all along
    expect(svc.services?.takeSample('skylink', 'registration', 'device-indicator').value).toBe('up');
  });

  it('cannot stop or hold the transfer, and a power cycle does not end it', () => {
    const svc = bootScenario(data);
    const id = svc.workloads?.running('skylink')[0]?.id ?? '';
    expect(svc.workloads?.abort(id)).toBe(false);
    svc.workloads?.waitForRun(id);
    svc.plant.powerCycle('spacey-router');
    tick(3);
    expect(svc.workloads?.running('skylink').map((r) => r.cardId)).toContain(TRANSFER);
  });

  it('does not accept the scope from a cause other than shared capacity', () => {
    const svc = bootScenario(data);
    tick(10);
    svc.services?.takeSample('skylink', 'registration', 'device-indicator');
    appRun(svc);
    fileHypothesis(svc, 'terminal-fault', observations(svc));
    fileHypothesis(svc, 'other', observations(svc));
    expect(incomplete(svc, 's5-assess-service-scope')[0]).toContain('Suspected cause');
    fileHypothesis(svc, 'shared-capacity', observations(svc).slice(0, 1));
    expect(incomplete(svc, 's5-assess-service-scope')[0]).toContain('Suspected cause');
    fileHypothesis(svc, 'shared-capacity', observations(svc));
    expect(incomplete(svc, 's5-assess-service-scope')).toEqual(['Affected part of the service recorded with its evidence']);
  });

  it('rejects an attribution that blames the app or cites nothing', () => {
    const svc = bootScenario(data);
    tick(10);
    appRun(svc);
    expect(svc.records?.submit('attribution', { workload: { value: APP }, keep: { value: APP }, basis: { cites: observations(svc) } })?.ok).toBe(false);
    expect(svc.records?.submit('attribution', { workload: { value: TRANSFER }, keep: { value: APP }, basis: { cites: [] } })?.ok).toBe(false);
  });

  it('is not satisfied by a terminal replacement or by lowering the app instead', () => {
    const svc = bootScenario(data);
    tick(10);
    svc.plant.powerCycle('spacey-dish');
    expect(incomplete(svc, 's5-apply-priority')).toEqual(['Approved allocation change applied']);
    svc.workloads?.setPriority(APP, 1);
    expect(incomplete(svc, 's5-apply-priority')).toEqual(['Approved allocation change applied']);
    svc.workloads?.setPriority(APP, 2);
    svc.workloads?.setPriority(TRANSFER, 1);
    expect(incomplete(svc, 's5-apply-priority')).toEqual([]);
  });

  it('does not accept a check taken before the change as verification', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's5-identify-shared-use' });
    appRun(svc);
    expect(incomplete(svc, 's5-verify-service-change')[0]).toContain('Fresh application check');
    svc.workloads?.setPriority(TRANSFER, 1);
    tick(5);
    expect(appRun(svc)?.status).toBe('supported');
    expect(incomplete(svc, 's5-verify-service-change')).toEqual(['Before and after results recorded with the deferred work']);
  });

  it('restores a checkpoint with the transfer still running and the weight kept', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's5-apply-priority' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(again.workloads?.running('skylink').map((r) => r.cardId)).toEqual([TRANSFER]);
    expect(again.workloads?.getPriority(TRANSFER)).toBe(1);
    // Runs from before the reload no longer count, so the 'before' result must be retaken: restore the old weight, run, defer again
    again.workloads?.setPriority(TRANSFER, 4);
    expect(appRun(again)?.status).toBe('unsupported');
    again.workloads?.setPriority(TRANSFER, 1);
    const done = driveObjectives(data, again, states, acts(again), { startAt: 's5-verify-service-change' });
    expect(done).toEqual(['s5-verify-service-change']);
  });
});
