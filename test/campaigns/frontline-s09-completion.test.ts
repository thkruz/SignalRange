/**
 * M24 S9 completion: the forward post is commissioned on batteries (generator off), the dependency map is a
 * player selection on the path diagram, the interruption invalidates earlier readings so each must be
 * classified by age, and readiness plus the service window both need current evidence.
 */

import { FORWARD_SKYLINK_UNIT } from '@app/campaigns/frontline/forward-field-config';
import { frontlineScenario9Data, S9_EVENT_INTERRUPTION } from '@app/campaigns/frontline/scenario9';
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
const data = frontlineScenario9Data;
const CARD = 'fwd-first';
const LOCAL_NODES = ['skylink-dish', 'skylink-cable', 'skylink-router', 'laptop', 'power-strip', 'power-station'];
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};
const soc = (svc: PhysicalPlantService): number => Object.values(svc.plant.getPowerReadings().socWh).reduce((a, b) => a + b, 0);
const value = (svc: PhysicalPlantService, layer: 'local' | 'registration' | 'account' | 'application'): { value: string } => ({
  value: String(svc.services?.latest('skylink', layer)?.value),
});

function takeAll(svc: PhysicalPlantService): void {
  svc.services?.takeSample('skylink', 'power', 'device-indicator');
  svc.services?.takeSample('skylink', 'local', 'local-probe');
  svc.services?.takeSample('skylink', 'registration', 'terminal-app');
  svc.services?.takeSample('skylink', 'account', 'provider-portal');
  svc.services?.takeSample('skylink', 'application', 'endpoint-report');
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  let runId = '';
  return {
    's09-reconcile-post': () => {
      ok(svc.records?.submit('delivery', { serial: { value: 'matches' }, account: { value: 'matches' }, stock: { value: 'matches-list' }, camp: { value: 'not-certified' } }));
      expect(svc.records?.equipment?.accept(FORWARD_SKYLINK_UNIT).ok).toBe(true);
    },
    's09-map-service': () => {
      svc.evidence?.recordSelection(LOCAL_NODES, 'Local power and network chain');
    },
    's09-establish-baseline': () => {
      svc.plant.inspect('skylink-router');
      svc.plant.inspect('power-station');
      takeAll(svc);
      ok(
        svc.records?.submit('baseline', {
          local: value(svc, 'local'),
          registration: value(svc, 'registration'),
          account: value(svc, 'account'),
          application: value(svc, 'application'),
          energy: { value: soc(svc) },
        })
      );
    },
    's09-check-freshness': () => {
      // The interruption invalidated every reading taken so far: all three are last-known until retaken
      ok(svc.records?.submit('freshness', { local: { value: 'last-known' }, registration: { value: 'last-known' }, remote: { value: 'last-known' } }));
      svc.services?.takeSample('skylink', 'application', 'endpoint-report');
    },
    's09-confirm-readiness': () => {
      takeAll(svc);
      ok(
        svc.records?.submit('readiness', {
          task: { value: CARD },
          registration: value(svc, 'registration'),
          account: value(svc, 'account'),
          application: value(svc, 'application'),
          basis: { cites: obsIds(svc) },
          status: { value: 'ready' },
        })
      );
    },
    's09-run-first-window': () => {
      const start = svc.workloads?.start(CARD, 'skylink');
      expect(start?.ok).toBe(true);
      const run = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
      expect(run?.status, JSON.stringify(run)).toBe('supported');
      runId = run?.id ?? '';
      incomplete(svc, 's09-run-first-window');
      tick(61);
      ok(
        svc.records?.submit('shift', {
          verified: { value: runId },
          rate: { value: svc.records?.latestRunRateW(CARD, 'skylink') },
          energy: { value: soc(svc) },
          limitation: { value: 'single-window' },
        })
      );
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(9);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M24 S9 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('starts on batteries with the generator off and the shared-dependency highlight disabled', () => {
    const svc = bootScenario(data);
    const cfg = svc.plant.getConfig();
    expect(cfg.parts.find((p) => p.id === 'generator')?.running).toBe(false);
    expect(cfg.diagram?.highlightShared).toBe(false);
    expect(cfg.power?.basis).toBe('battery-only');
  });

  it('completes every objective in order', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc), {});
    expect(done).toEqual(data.objectives.map((o) => o.id));
  });

  it('rejects a dependency selection that adds a remote node or omits a local one', () => {
    const svc = bootScenario(data);
    states.set('s09-map-service', { isActive: true, isCompleted: false });
    svc.evidence?.recordSelection([...LOCAL_NODES, 'account:forward-skylink'], 'Too wide');
    svc.evidence?.recordSelection(LOCAL_NODES.slice(1), 'Too narrow');
    expect(incomplete(svc, 's09-map-service').length).toBe(1);
    svc.evidence?.recordSelection(LOCAL_NODES, 'Right');
    expect(incomplete(svc, 's09-map-service')).toEqual([]);
  });

  it('invalidates earlier readings at the interruption and rejects a form that calls them current', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's09-establish-baseline' });
    states.set('s09-check-freshness', { isActive: true, isCompleted: false });
    tick(2);
    expect(incomplete(svc, 's09-check-freshness')).not.toContain('Interruption has occurred');
    const bad = svc.records?.submit('freshness', { local: { value: 'current' }, registration: { value: 'current' }, remote: { value: 'current' } });
    expect(bad?.ok).toBe(false);
    expect(S9_EVENT_INTERRUPTION).toBe('s09-link-interruption');
    // A reading retaken after the interruption is current, so the stale answer fails for it
    svc.services?.takeSample('skylink', 'application', 'endpoint-report');
    expect(svc.records?.submit('freshness', { local: { value: 'last-known' }, registration: { value: 'last-known' }, remote: { value: 'last-known' } })?.ok).toBe(false);
  });

  it('refuses readiness filed on stale evidence and a window run before readiness is filed', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's09-check-freshness' });
    tick(200);
    const stale = svc.records?.submit('readiness', {
      task: { value: CARD },
      registration: { value: 'up' },
      account: { value: 'up' },
      application: { value: 'up' },
      basis: { cites: obsIds(svc) },
      status: { value: 'ready' },
    });
    expect(stale?.ok).toBe(false);
    const start = svc.workloads?.start(CARD, 'skylink');
    svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
    acts(svc)['s09-confirm-readiness']();
    expect(incomplete(svc, 's09-run-first-window')).toContain('Task window run after the readiness record with the battery reserve held through the same window');
    acts(svc)['s09-run-first-window']();
    expect(incomplete(svc, 's09-run-first-window')).toEqual([]);
  });

  it('restores a checkpoint taken after the interruption', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's09-check-freshness' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    // A restore starts a new session: the saved readings read stale until retaken, everything else survives
    expect(incomplete(again, 's09-check-freshness')).toEqual(['Fresh remote check taken after the interruption']);
    again.services?.takeSample('skylink', 'application', 'endpoint-report');
    expect(incomplete(again, 's09-check-freshness')).toEqual([]);
    expect(incomplete(again, 's09-map-service')).toEqual([]);
  });
});
