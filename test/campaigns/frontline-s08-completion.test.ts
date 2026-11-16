/**
 * M23 S8 completion: the assessment brief is recorded, the player picks the diagnostic route, the diagnosis is
 * graded on an authored cause backed by this run's observations, the repair needs evidence and the verification
 * is a fresh workload window plus a held reserve. A wrong cause or a blind repair does not pass.
 */

import { frontlineScenario8Data } from '@app/campaigns/frontline/scenario8';
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
const data = frontlineScenario8Data;
const FAULT = 's08-local-fault';
const CONNECTOR = 'skylink-cable:router';
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const actIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('action') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};

function fileHypothesis(svc: PhysicalPlantService, cause: string, cited: string[]): void {
  svc.evidence?.addHypothesis({
    subject: CONNECTOR,
    source: {},
    facts: [],
    text: `Suspect ${cause}`,
    claim: { scope: 'part', targetId: CONNECTOR, cause },
    confidence: 'medium',
    citedEntryIds: cited,
  });
}

function soc(svc: PhysicalPlantService): number {
  return Object.values(svc.plant.getPowerReadings().socWh).reduce((a, b) => a + b, 0);
}

function repair(svc: PhysicalPlantService): void {
  // The router-side connector is indoors, so the seal verb does not apply; the connector is swapped from the kit
  expect(svc.plant.swap(CONNECTOR).cleared?.length ?? 0).toBeGreaterThan(0);
}

function verifyRun(svc: PhysicalPlantService): string {
  // The reserve window starts when the gate is first evaluated; the engine evaluates every tick
  incomplete(svc, 's08-verify-outcome');
  // The repair restarts the terminal: boot plus satellite search takes up to 300 s
  tick(330);
  incomplete(svc, 's08-verify-outcome');
  const start = svc.workloads?.start('ola-assess', 'skylink');
  expect(start?.ok).toBe(true);
  const run = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
  expect(run?.status, JSON.stringify(run)).toBe('supported');
  incomplete(svc, 's08-verify-outcome');

  return run?.id ?? '';
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  let runId = '';
  return {
    's08-interpret-assignment': () => {
      ok(svc.records?.submit('assignment', { requirement: { value: '5-2-150' }, limits: { value: 'one-kit-one-cable' }, reserve: { value: '150wh' }, trips: { value: 'three' } }));
    },
    's08-establish-state': () => {
      svc.services?.takeSample('skylink', 'registration', 'terminal-app');
      const app = svc.services?.takeSample('skylink', 'application', 'endpoint-report');
      svc.plant.inspect('skylink-dish');
      ok(svc.records?.submit('plan', { symptom: { value: String(app?.value) }, check: { value: 'inspect-connectors' }, basis: { cites: obsIds(svc) } }));
    },
    's08-diagnose-fault': () => {
      svc.plant.measure('cable-tester', 'skylink-cable');
      svc.plant.inspect(CONNECTOR);
      fileHypothesis(svc, 'connector-moisture', obsIds(svc));
      ok(svc.records?.submit('diagnosis', { cause: { value: 'connector-moisture' }, observations: { cites: obsIds(svc) } }));
    },
    's08-repair-service': () => {
      repair(svc);
      ok(svc.records?.submit('intervention', { basis: { cites: obsIds(svc) }, action: { cites: actIds(svc) }, spare: { value: 'connector-kit' } }));
    },
    's08-verify-outcome': () => {
      runId = verifyRun(svc);
      ok(svc.records?.submit('outcome', { verified: { value: runId }, reserve: { value: soc(svc) }, rate: { value: svc.records?.latestRunRateW('ola-assess', 'skylink') } }));
    },
    's08-submit-handover': () => {
      ok(
        svc.records?.submit('qualification', {
          observations: { cites: obsIds(svc) },
          diagnosis: { value: 'connector-moisture' },
          action: { cites: actIds(svc) },
          verification: { value: runId },
          limitation: { value: 'single-window' },
        })
      );
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(8);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M23 S8 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc));
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.plant.getFaults().some((f) => f.id === FAULT)).toBe(false);
  });

  it('records the brief without naming the target or a test order', () => {
    const text = [...data.objectives.flatMap((o) => [o.title, o.description, ...o.conditions.map((c) => c.description)]), JSON.stringify(data.dialogClips)].join(' ');
    expect(text).not.toContain('moisture');
    expect(text).not.toContain('skylink-cable');
  });

  it('rejects a brief with the wrong requirement or trip allowance', () => {
    const svc = bootScenario(data);
    const bad = svc.records?.submit('assignment', {
      requirement: { value: 'other' },
      limits: { value: 'one-kit-one-cable' },
      reserve: { value: '150wh' },
      trips: { value: 'three' },
    });
    expect(bad?.ok).toBe(false);
    expect(incomplete(svc, 's08-interpret-assignment').length).toBe(1);
  });

  it('accepts any listed discriminating check but rejects a plan with no observation', () => {
    const svc = bootScenario(data);
    const app = svc.services?.takeSample('skylink', 'application', 'endpoint-report');
    const input = (check: string, cites: string[]) => ({ symptom: { value: String(app?.value) }, check: { value: check }, basis: { cites } });
    expect(svc.records?.submit('plan', input('inspect-connectors', []))?.ok).toBe(false);
    svc.plant.inspect('skylink-dish');
    expect(svc.records?.submit('plan', input('restart-everything', obsIds(svc)))?.ok).toBe(false);
    expect(svc.records?.submit('plan', input('compare-reference-service', obsIds(svc)))?.ok).toBe(true);
  });

  it('does not accept inspection alone, a wrong cause or an uncited cause as a diagnosis', () => {
    const svc = bootScenario(data);
    svc.plant.inspect(CONNECTOR);
    expect(incomplete(svc, 's08-diagnose-fault').length).toBeGreaterThan(0);
    fileHypothesis(svc, 'other', obsIds(svc));
    fileHypothesis(svc, 'router', obsIds(svc));
    fileHypothesis(svc, 'connector-moisture', obsIds(svc).slice(0, 1));
    expect(incomplete(svc, 's08-diagnose-fault')).toContain('Cause filed with its observations');
    expect(svc.records?.submit('diagnosis', { cause: { value: 'router' }, observations: { cites: obsIds(svc) } })?.ok).toBe(false);
  });

  it('does not credit a repair made before evidence as a justified intervention, and a pre-repair run never verifies', () => {
    const svc = bootScenario(data);
    // A run before the repair is supported only after a fix; here it is a run on the faulty service
    tick(100);
    svc.workloads?.start('ola-assess', 'skylink');
    svc.workloads?.waitForRun(svc.workloads.getRuns().at(-1)?.id ?? '');
    repair(svc);
    const bad = svc.records?.submit('intervention', { basis: { cites: [] }, action: { cites: actIds(svc) }, spare: { value: 'connector-kit' } });
    expect(bad?.ok).toBe(false);
    expect(incomplete(svc, 's08-repair-service')).toContain('Intervention justified and resource use recorded');
    expect(incomplete(svc, 's08-verify-outcome')).toContain('Fresh workload check after the repair passed with the battery reserve held through the same window');
  });

  it('credits the reserve only from the run own window, not from time spent waiting before it', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's08-repair-service' });
    incomplete(svc, 's08-verify-outcome');
    tick(450);
    // Plenty of reserve-only time has passed, but no run has covered it
    expect(incomplete(svc, 's08-verify-outcome')).toContain('Fresh workload check after the repair passed with the battery reserve held through the same window');
    const start = svc.workloads?.start('ola-assess', 'skylink');
    svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
    expect(incomplete(svc, 's08-verify-outcome')).not.toContain('Fresh workload check after the repair passed with the battery reserve held through the same window');
  });

  it('restores a checkpoint taken mid-assessment', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's08-diagnose-fault' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(incomplete(again, 's08-diagnose-fault')).toEqual([]);
    expect(again.plant.getFaults().filter((f) => f.id === FAULT)).toHaveLength(1);
  });

  it('grades the debrief: an inspected repair is supported, a blind one is not', () => {
    const source = (svc: PhysicalPlantService) => ({ field: { evidence: svc.evidence, plant: svc.plant }, config: () => svc.plant.getConfig() });
    const supported = bootScenario(data);
    driveObjectives(data, supported, states, acts(supported), { stopAfter: 's08-repair-service' });
    const good = buildFieldDiagnosis(source(supported), 100);
    expect(good?.summary.supportedFixes).toBe(1);
    expect(good?.summary.unsupportedFixes).toBe(0);
    Service.destroy();
    EventBus.destroy();
    SimClock.reset();
    states.clear();

    const blind = bootScenario(data);
    repair(blind);
    expect(buildFieldDiagnosis(source(blind), 100)?.summary.unsupportedFixes).toBe(1);
  });
});
