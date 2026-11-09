/**
 * M23 S7 completion: the replacement router is reconciled against its record, the one differing field is
 * preserved, the correction request is filed and answered by the authored event, and acceptance needs a
 * matching record plus a fresh service check that starts after the approval.
 */

import { frontlineScenario7Data } from '@app/campaigns/frontline/scenario7';
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
const data = frontlineScenario7Data;
const UNIT = 'kivilahti-router';
const REQUEST = 's7-config-approval';
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const observations = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};

function readings(svc: PhysicalPlantService): void {
  svc.services?.takeSample('skylink', 'power', 'device-indicator');
  svc.services?.takeSample('skylink', 'local', 'local-probe');
  svc.services?.takeSample('skylink', 'registration', 'terminal-app');
}

function freshCheck(svc: PhysicalPlantService): string {
  tick(100);
  const start = svc.workloads?.start('ola-check', 'skylink');
  expect(start?.ok).toBe(true);
  const run = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
  expect(run?.status).toBe('supported');

  return run?.id ?? '';
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's07-reconcile-delivery': () => {
      svc.plant.inspect('spacey-router');
      ok(
        svc.records?.submit('inventory', {
          serial: { value: 'matches' },
          account: { value: 'matches' },
          configuration: { value: 'unconfirmed' },
          depot: { value: 'earlier-test-only' },
        })
      );
    },
    's07-separate-readiness': () => {
      readings(svc);
      const sample = svc.services?.latest('skylink', 'registration');
      ok(
        svc.records?.submit('readiness', {
          hardware: { cites: observations(svc) },
          registration: { value: String(sample?.value) },
          authorization: { value: 'unresolved' },
          workload: { value: 'not-ready' },
        })
      );
    },
    's07-review-records': () => {
      ok(
        svc.records?.submit('config-review', {
          entry: { value: 'configVersion' },
          original: { value: 'handover-v2' },
          unexplained: { value: 'depot-v3' },
          reference: { value: 'none' },
        })
      );
    },
    's07-assess-discrepancy': () => undefined,
    's07-request-correction': () => {
      expect(svc.records?.equipment?.submitCorrection(REQUEST)?.ok).toBe(true);
    },
    's07-verify-acceptance': () => {
      const runId = freshCheck(svc);
      expect(svc.records?.equipment?.accept(UNIT).ok).toBe(true);
      ok(
        svc.records?.submit('acceptance', {
          mismatch: { value: 'config-version' },
          cause: { value: 'not-established' },
          observations: { cites: observations(svc) },
          verified: { value: runId },
        })
      );
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(7);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M23 S7 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      if (o.id === 's07-assess-discrepancy') {
        continue; // quiz only
      }
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order and ends with an accepted unit', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc));
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.records?.isAccepted(UNIT)).toBe(true);
    expect(svc.records?.equipment?.discrepancies(UNIT)).toEqual([]);
  });

  it('shows exactly one discrepancy and refuses acceptance before the correction', () => {
    const svc = bootScenario(data);
    const diffs = svc.records?.equipment?.discrepancies(UNIT) ?? [];
    expect(diffs.map((d) => d.field)).toEqual(['configVersion']);
    expect(svc.records?.equipment?.accept(UNIT).ok).toBe(false);
  });

  it('rejects a reconciliation that calls the configuration confirmed or the depot test enough', () => {
    const svc = bootScenario(data);
    const bad = svc.records?.submit('inventory', {
      serial: { value: 'matches' },
      account: { value: 'matches' },
      configuration: { value: 'matches' },
      depot: { value: 'authorizes-service' },
    });
    expect(bad?.ok).toBe(false);
    expect(incomplete(svc, 's07-reconcile-delivery')).toEqual(['Delivered equipment and assignment compared']);
  });

  it('does not credit readiness from the inspection alone', () => {
    const svc = bootScenario(data);
    svc.plant.inspect('spacey-router');
    expect(incomplete(svc, 's07-separate-readiness').length).toBeGreaterThan(0);
  });

  it('holds the answer until the request is filed, and a wrong requested version never accepts the unit', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's07-assess-discrepancy' });
    tick(2);
    expect(svc.events?.hasFired('s7-config-approved')).toBe(true);
    expect(incomplete(svc, 's07-request-correction')[0]).toContain('filed');
    const wrong = svc.records?.equipment?.submitCorrection(REQUEST, 'handover-v9');
    expect(wrong?.ok).toBe(true);
    // The record now carries a version that still differs from the unit
    expect(svc.records?.equipment?.accept(UNIT).ok).toBe(false);
    expect(incomplete(svc, 's07-verify-acceptance').length).toBeGreaterThan(0);
  });

  it('does not verify with a service check that started before the approval', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's07-assess-discrepancy' });
    tick(2);
    const earlier = freshCheck(svc);
    tick(5);
    acts(svc)['s07-request-correction']();
    expect(svc.records?.equipment?.accept(UNIT).ok).toBe(true);
    ok(
      svc.records?.submit('acceptance', {
        mismatch: { value: 'config-version' },
        cause: { value: 'not-established' },
        observations: { cites: observations(svc) },
        verified: { value: earlier },
      })
    );
    const missing = incomplete(svc, 's07-verify-acceptance');
    expect(missing).toEqual(['Service checked after the approved correction']);
    freshCheck(svc);
    expect(incomplete(svc, 's07-verify-acceptance')).toEqual([]);
  });

  it('restores a checkpoint taken after the request was filed', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's07-request-correction' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(incomplete(again, 's07-request-correction')).toEqual([]);
    expect(incomplete(again, 's07-review-records')).toEqual([]);
    expect(again.records?.equipment?.getRequest(REQUEST)?.status).toBe('approved');
  });
});
