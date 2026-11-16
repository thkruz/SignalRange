/**
 * M26 S13 completion: the player identifies both ends of a SkyLink task, takes a baseline of each, records an
 * interruption at the remote end, correlates the provider notice, shows that local options leave the remote policy in
 * force, and reports a justified hold using "Hold for result". The ground capacity restriction is a separate state that
 * stays in force throughout. S13 has no fault, so there is no debrief diagnosis to assert.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import {
  FORWARD_EUROSAT_PROVIDER,
  FORWARD_EUROSAT_SERVICE,
  FORWARD_PROVIDER,
  FORWARD_REMOTE_ENDPOINT,
  FORWARD_REMOTE_SERVICE,
  FORWARD_SKYLINK_ACCOUNT,
} from '@app/campaigns/frontline/forward-field-config';
import { frontlineScenario13Data, S13_EVENT_NOTICE, S13_EVENT_POLICY, S13_TASK_CARD } from '@app/campaigns/frontline/scenario13';
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
const data = frontlineScenario13Data;
const REMOTE = FORWARD_REMOTE_SERVICE;
const PATH = ['skylink-dish', `account:${FORWARD_SKYLINK_ACCOUNT}`, `provider:${FORWARD_PROVIDER}`, `endpoint:${FORWARD_REMOTE_ENDPOINT}`];
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const resultIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('result') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};
type Layer = 'registration' | 'account' | 'application';
const value = (svc: PhysicalPlantService, id: string, layer: Layer): { value: string } => ({ value: String(svc.services?.latest(id, layer)?.value) });
const remote = (svc: PhysicalPlantService) => svc.services?.getState().endpoints.find((e) => e.id === FORWARD_REMOTE_ENDPOINT);

function takeBaseline(svc: PhysicalPlantService): void {
  svc.services?.takeSample(SKYLINK_SERVICE, 'registration', 'terminal-app');
  svc.services?.takeSample(SKYLINK_SERVICE, 'account', 'terminal-app');
  svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
}

function heldRun(svc: PhysicalPlantService, service = REMOTE) {
  const start = svc.workloads?.start(S13_TASK_CARD.id, service);
  expect(start?.ok).toBe(true);

  return svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's13-map-endpoints': () => {
      svc.evidence?.recordSelection(PATH, 'SkyLink ground terminal to the remote terminal');
      ok(
        svc.records?.submit('endpoints', {
          ground: { value: FORWARD_SKYLINK_ACCOUNT },
          remote: { value: FORWARD_REMOTE_ENDPOINT },
          link: { value: 'provider-network' },
        })
      );
    },
    's13-capture-baseline': () => {
      takeBaseline(svc);
      ok(
        svc.records?.submit('baseline', {
          ground: value(svc, SKYLINK_SERVICE, 'account'),
          remote: value(svc, REMOTE, 'application'),
          phase: { value: 'before-policy-event' },
          basis: { cites: obsIds(svc) },
        })
      );
    },
    's13-record-interruption': () => {
      tick(16);
      ok(svc.records?.submit('interruption', { remote: { value: 'last-known' }, onset: { cites: resultIds(svc) } }));
      svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
    },
    's13-review-provider-evidence': () => {
      tick(2);
      ok(
        svc.records?.submit('notice-correlation', {
          endpoint: { value: FORWARD_REMOTE_ENDPOINT },
          scope: { value: 'remote-mobility-policy' },
          ground: { value: 'separate-unchanged' },
          local: { value: 'not-implicated' },
          timing: { cites: resultIds(svc) },
        })
      );
    },
    's13-assess-local-options': () => {
      svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('local-limits', {
          remote: value(svc, REMOTE, 'application'),
          restart: { value: 'does-not-clear' },
          route: { value: 'does-not-clear' },
          action: { value: 'report-and-hold' },
        })
      );
    },
    's13-record-hold': () => {
      const run = heldRun(svc);
      expect(run?.status).not.toBe('supported');
      svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('hold-report', {
          run: { value: run?.id ?? '' },
          remote: value(svc, REMOTE, 'application'),
          limit: { value: 'remote-mobility-policy' },
          ground: { value: 'separate-still-in-force' },
          outcome: { value: 'hold-no-success' },
          reassess: { value: 'provider-lifts-policy' },
        })
      );
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(13);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M26 S13 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order and ends in a held, unsuccessful task', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc), {});
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.workloads?.runs().some((r) => r.cardId === S13_TASK_CARD.id && r.status === 'supported' && !r.invalidatedBy && r.serviceId === REMOTE)).toBe(false);
    expect(remote(svc)?.policy).toBe('mobility-restricted');
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
  });

  it('keeps the first objective off the frozen clock', () => {
    expect(data.objectives.some((o) => o.freezesScenarioTimer)).toBe(false);
  });

  it('models the ground restriction and the remote policy as separate states', () => {
    const svc = bootScenario(data);
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    expect(remote(svc)?.policy).toBeUndefined();
    expect(remote(svc)?.reachable).toBe(true);
    states.set('s13-record-interruption', { isActive: true, isCompleted: false });
    tick(3);
    expect(remote(svc)?.reachable).toBe(true);
    tick(14);
    expect(remote(svc)?.policy).toBe('mobility-restricted');
    expect(remote(svc)?.reachable).toBe(false);
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    expect(S13_EVENT_POLICY).toBe('s13-remote-policy');
  });

  it('leaves the remote policy in force through a local restart and a ground-route change', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's13-review-provider-evidence' });
    svc.plant.powerCycle('skylink-dish');
    svc.plant.powerCycle('skylink-router');
    tick(330);
    svc.services?.setAccount({ id: FORWARD_SKYLINK_ACCOUNT, restriction: undefined, capacityFactor: 1 });
    svc.services?.setProvider({ id: FORWARD_EUROSAT_PROVIDER, status: 'normal' });
    // A ground-route change: the same task on the EuroSat route has a different remote leg, the remote one is untouched
    svc.services?.takeSample(FORWARD_EUROSAT_SERVICE, 'application', 'endpoint-report');
    svc.services?.takeSample(REMOTE, 'registration', 'terminal-app');
    svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
    expect(remote(svc)?.policy).toBe('mobility-restricted');
    expect(svc.services?.latest(REMOTE, 'registration')?.value).toBe('up');
    expect(svc.services?.latest(REMOTE, 'application')?.value).toBe('down');
  });

  it('rejects a baseline built from a local-only sample', () => {
    const svc = bootScenario(data);
    svc.services?.takeSample(SKYLINK_SERVICE, 'registration', 'terminal-app');
    svc.services?.takeSample(SKYLINK_SERVICE, 'account', 'terminal-app');
    expect(incomplete(svc, 's13-capture-baseline')).toContain('Remote endpoint reading taken, not a local-only sample');
  });

  it('does not accept a path that includes the EuroSat parts or leaves out the remote endpoint', () => {
    const svc = bootScenario(data);
    svc.evidence?.recordSelection([...PATH, 'vsat-modem', `provider:${FORWARD_EUROSAT_PROVIDER}`], 'Everything');
    expect(incomplete(svc, 's13-map-endpoints')).toContain('Ground terminal, provider network and remote endpoint marked');
    svc.evidence?.recordSelection(PATH.slice(0, 3), 'No remote');
    expect(incomplete(svc, 's13-map-endpoints')).toContain('Ground terminal, provider network and remote endpoint marked');
    svc.evidence?.recordSelection(PATH, 'Path');
    expect(incomplete(svc, 's13-map-endpoints')).not.toContain('Ground terminal, provider network and remote endpoint marked');
  });

  it('rejects a hold report that claims the policy is gone or records a success', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's13-assess-local-options' });
    states.set('s13-record-hold', { isActive: true, isCompleted: false });
    expect(incomplete(svc, 's13-record-hold')).toContain('Task window held for its result, with no success');
    const run = heldRun(svc);
    svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
    const base = {
      run: { value: run?.id ?? '' },
      remote: value(svc, REMOTE, 'application'),
      limit: { value: 'remote-mobility-policy' },
      ground: { value: 'separate-still-in-force' },
      outcome: { value: 'hold-no-success' },
      reassess: { value: 'provider-lifts-policy' },
    };
    expect(svc.records?.submit('hold-report', { ...base, outcome: { value: 'task-complete' } })?.ok).toBe(false);
    expect(svc.records?.submit('hold-report', { ...base, limit: { value: 'ground-capacity' } })?.ok).toBe(false);
    expect(svc.records?.submit('hold-report', { ...base, ground: { value: 'cleared' } })?.ok).toBe(false);
    ok(svc.records?.submit('hold-report', base));
  });

  it('does not take a notice read before the interruption as the correlation', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's13-record-interruption' });
    expect(incomplete(svc, 's13-review-provider-evidence')).toContain('Provider notice delivered');
    expect(S13_EVENT_NOTICE).toBe('s13-policy-notice');
  });

  it('restores a checkpoint taken after the interruption with the remote policy still in force', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's13-review-provider-evidence' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(remote(again)?.policy).toBe('mobility-restricted');
    expect(remote(again)?.reachable).toBe(false);
    expect(again.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    again.services?.takeSample(REMOTE, 'application', 'endpoint-report');
    expect(again.services?.latest(REMOTE, 'application')?.value).toBe('down');
  });
});
