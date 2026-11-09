/**
 * M21 S4 completion: a staged normal terminal recovery, then one obstruction injected only after
 * the recovery was observed, an inspected removal and a fresh verification; restarting resets the
 * recovery interval; a checkpoint mid-scenario restores the stage without a second obstruction.
 */

import { frontlineScenario4Data } from '@app/campaigns/frontline/scenario4';
import { EventBus } from '@app/events/event-bus';
import type { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { buildFieldDiagnosis } from '@app/scoring/field-diagnosis';
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
const data = frontlineScenario4Data;
const obj = (id: string) => data.objectives.find((o) => o.id === id) as NonNullable<(typeof data.objectives)[number]>;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(obj(id) as never, svc);

const FAULT = 'c6-s4-terminal-obstruction';
const startObjective = (id: string) => states.set(id, { isActive: true, isCompleted: false });

function waitForRecovery(svc: PhysicalPlantService): void {
  tick(20);
  svc.services?.takeSample('skylink', 'registration', 'local-probe');
  tick(100);
  svc.services?.takeSample('skylink', 'registration', 'local-probe');
}

function lastRunId(svc: PhysicalPlantService): string {
  return [...(svc.workloads?.getRuns() ?? [])].reverse().find((r) => r.status === 'supported' && !r.invalidatedBy)?.id ?? '';
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's4-identify-recovery': () => {
      svc.plant.inspect('skylink-dish');
    },
    's4-observe-recovery': () => {
      waitForRecovery(svc);
    },
    's4-recognize-persistence': () => {
      tick(5);
      svc.services?.takeSample('skylink', 'registration', 'local-probe');
      svc.services?.takeSample('skylink', 'application', 'endpoint-report');
    },
    's4-inspect-environment': () => {
      svc.plant.goOutside();
      svc.plant.inspect('skylink-dish');
    },
    's4-correct-environment': () => {
      svc.plant.removeNet('skylink-dish');
      svc.plant.returnInside();
    },
    's4-verify-environment-result': () => {
      tick(120);
      const start = svc.workloads?.start('ola-check', 'skylink');
      expect(start?.ok).toBe(true);
      const fin = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
      expect(fin?.status, JSON.stringify(fin)).toBe('supported');
      const log = svc.evidence?.entries() ?? [];
      const res = svc.records?.submit('environment-report', {
        recovery: { cites: log.filter((e) => e.kind === 'observation').map((e) => e.id) },
        condition: { value: 'obstruction' },
        correction: { cites: log.filter((e) => e.kind === 'action').map((e) => e.id) },
        verified: { value: lastRunId(svc) },
      });
      expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
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

describe('M21 S4 completion', () => {
  it('has no placeholder gates and no objective passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    startObjective('s4-identify-recovery');
    tick();
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc));
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.events?.hasFired('s4-recovery-start')).toBe(true);
    expect(svc.events?.hasFired('s4-obstruction')).toBe(true);
    expect(svc.plant.getFaults().some((f) => f.id === FAULT)).toBe(false);
  });

  it('stages a boot at the start with no fault, and injects the net only once persistence is live', () => {
    const svc = bootScenario(data);
    expect(svc.plant.getFaults().some((f) => f.id === FAULT)).toBe(false);
    startObjective('s4-identify-recovery');
    tick(2);
    expect(svc.events?.hasFired('s4-recovery-start')).toBe(true);
    expect(svc.services?.layers('skylink').find((l) => l.layer === 'registration')?.status).toBe('down');
    tick(200);
    expect(svc.services?.layers('skylink').find((l) => l.layer === 'registration')?.status).toBe('up');
    expect(svc.plant.getFaults().some((f) => f.id === FAULT)).toBe(false);
    expect(svc.events?.hasFired('s4-obstruction')).toBe(false);
    startObjective('s4-recognize-persistence');
    tick(2);
    expect(svc.plant.getFaults().filter((f) => f.id === FAULT)).toHaveLength(1);
    tick(300);
    expect(svc.plant.getFaults().filter((f) => f.id === FAULT)).toHaveLength(1);
  });

  it('does not complete the observation while the terminal is still starting, and a restart resets it', () => {
    const svc = bootScenario(data);
    startObjective('s4-identify-recovery');
    tick(20);
    svc.services?.takeSample('skylink', 'registration', 'local-probe');
    expect(incomplete(svc, 's4-observe-recovery')).toEqual(['Registration came back without another restart']);
    // A restart at t=60 starts a fresh 90 s boot; the first boot's finish at 90 s does not count
    tick(40);
    svc.plant.powerCycle('skylink-dish');
    tick(60);
    svc.services?.takeSample('skylink', 'registration', 'local-probe');
    expect(incomplete(svc, 's4-observe-recovery')).toEqual(['Registration came back without another restart']);
    // Boot plus satellite search takes up to 300 s in all
    tick(240);
    svc.services?.takeSample('skylink', 'registration', 'local-probe');
    expect(incomplete(svc, 's4-observe-recovery')).toEqual([]);
  });

  it('needs the persistent symptoms read after the obstruction', () => {
    const svc = bootScenario(data);
    startObjective('s4-identify-recovery');
    waitForRecovery(svc);
    startObjective('s4-recognize-persistence');
    tick(2);
    expect(incomplete(svc, 's4-recognize-persistence')).toEqual([
      'Registration read down after the recovery had finished',
      'Application read down after the recovery had finished',
    ]);
    acts(svc)['s4-recognize-persistence']();
    expect(incomplete(svc, 's4-recognize-persistence')).toEqual([]);
  });

  it('keeps the correction open until the net was inspected and removed', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's4-inspect-environment' });
    expect(incomplete(svc, 's4-correct-environment').length).toBeGreaterThan(0);
    acts(svc)['s4-correct-environment']();
    expect(incomplete(svc, 's4-correct-environment')).toEqual([]);
  });

  it('does not accept the check made before the correction as verification', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's4-inspect-environment' });
    svc.workloads?.start('ola-check', 'skylink');
    acts(svc)['s4-correct-environment']();
    expect(incomplete(svc, 's4-verify-environment-result')[0]).toContain('Fresh application check');
  });

  it('restores a checkpoint taken after the obstruction without a second one', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's4-recognize-persistence' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(again.plant.getFaults().filter((f) => f.id === FAULT)).toHaveLength(1);
    expect(again.events?.hasFired('s4-recovery-start')).toBe(true);
    expect(again.events?.hasFired('s4-obstruction')).toBe(true);
    expect(incomplete(again, 's4-recognize-persistence')).toEqual([]);
    acts(again)['s4-inspect-environment']();
    acts(again)['s4-correct-environment']();
    expect(incomplete(again, 's4-correct-environment')).toEqual([]);
  });

  it('grades the debrief: an inspected removal is a supported fix, a blind one is not', () => {
    const source = (svc: PhysicalPlantService) => ({ field: { evidence: svc.evidence, plant: svc.plant }, config: () => svc.plant.getConfig() });
    const supported = bootScenario(data);
    driveObjectives(data, supported, states, acts(supported), { stopAfter: 's4-correct-environment' });
    const good = buildFieldDiagnosis(source(supported), 100);
    expect(good?.summary.supportedFixes).toBe(1);
    expect(good?.summary.unsupportedFixes).toBe(0);
    Service.destroy();
    EventBus.destroy();
    SimClock.reset();
    states.clear();

    const blind = bootScenario(data);
    startObjective('s4-recognize-persistence');
    tick(2);
    blind.plant.goOutside();
    blind.plant.removeNet('skylink-dish');
    blind.plant.returnInside();
    const bad = buildFieldDiagnosis(source(blind), 100);
    expect(bad?.summary.unsupportedFixes).toBe(1);
  });
});
