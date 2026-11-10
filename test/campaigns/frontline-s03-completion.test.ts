/**
 * M21 S3 completion: the moisture flap is read as a pattern, compared with the healthy record,
 * turned into a graded hypothesis, inspected, sealed and verified with a fresh run after the
 * repair; a wrong cause fails; a checkpoint mid-scenario restores the evidence.
 */

import { frontlineScenario3Data } from '@app/campaigns/frontline/scenario3';
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
const data = frontlineScenario3Data;
const obj = (id: string) => data.objectives.find((o) => o.id === id) as NonNullable<(typeof data.objectives)[number]>;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(obj(id) as never, svc);

const FAULT = 'c6-s3-terminal-moisture';
const CONNECTOR = 'skylink-cable:dish';

/** Reads registration in a down phase and an up phase and the local network, across two flaps */
function readPattern(svc: PhysicalPlantService): void {
  const model = svc.services;
  // The flap is down while time % 90 < 30; step to the down phase, read, then the up phase, read
  for (let cycle = 0; cycle < 3; cycle++) {
    tick(15);
    model?.takeSample('skylink', 'registration', 'pilot-report');
    tick(30);
    model?.takeSample('skylink', 'registration', 'local-probe');
    model?.takeSample('skylink', 'local', 'local-probe');
    tick(45);
  }
}

function compareReadings(svc: PhysicalPlantService): void {
  svc.services?.takeSample('skylink', 'power', 'device-indicator');
  svc.services?.takeSample('skylink', 'local', 'device-indicator');
  svc.services?.takeSample('skylink', 'registration', 'device-indicator');
}

function observations(svc: PhysicalPlantService): string[] {
  return (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
}

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

function checkPlan(svc: PhysicalPlantService, check = 'inspect-connector', expected = 'sign-of-moisture') {
  return svc.records?.submit('check-plan', { check: { value: check }, expected: { value: expected }, basis: { cites: observations(svc).slice(0, 1) } });
}

function verifyAfterRepair(svc: PhysicalPlantService): void {
  // A run during the terminal boot or a flap would be unsupported; none is active once sealed
  tick(120);
  const start = svc.workloads?.start('ola-check', 'skylink');
  expect(start?.ok).toBe(true);
  const fin = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
  expect(fin?.status, JSON.stringify(fin)).toBe('supported');
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's3-establish-pattern': () => {
      readPattern(svc);
    },
    's3-compare-baseline': () => {
      compareReadings(svc);
      svc.plant.inspect('skylink-dish');
      svc.plant.inspect('power-strip');
      const res = svc.records?.submit('comparison', {
        changed: { value: 'registration' },
        unchanged: { value: 'power-and-local' },
        evidence: { cites: observations(svc) },
      });
      expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
    },
    's3-select-check': () => {
      fileHypothesis(svc, 'connector-moisture', observations(svc).slice(0, 1));
      const res = checkPlan(svc);
      expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
    },
    's3-collect-local-evidence': () => {
      svc.plant.goOutside();
      svc.plant.measure('cable-tester', 'skylink-cable');
      svc.plant.inspect(CONNECTOR);
    },
    's3-assess-local-cause': () => undefined,
    's3-repair-local-fault': () => {
      svc.plant.seal(CONNECTOR);
      svc.plant.returnInside();
    },
    's3-verify-and-record': () => {
      verifyAfterRepair(svc);
      svc.services?.takeSample('skylink', 'application', 'endpoint-report');
      const log = svc.evidence?.entries() ?? [];
      const res = svc.records?.submit('diagnosis', {
        cause: { value: 'connector-moisture' },
        observations: { cites: log.filter((e) => e.kind === 'observation').map((e) => e.id) },
        repair: { cites: log.filter((e) => e.kind === 'action').map((e) => e.id) },
        verified: { value: [...(svc.workloads?.getRuns() ?? [])].reverse().find((r) => r.status === 'supported' && !r.invalidatedBy)?.id ?? '' },
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

describe('M21 S3 completion', () => {
  it('has no placeholder gates and no objective passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      if (o.id === 's3-assess-local-cause') {
        continue; // quiz only
      }
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc));
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.plant.getFaults().some((f) => f.id === FAULT)).toBe(false);
  });

  it('needs the interruptions to have happened and both sides read', () => {
    const svc = bootScenario(data);
    expect(incomplete(svc, 's3-establish-pattern')[0]).toContain('Terminal link read once while Down');
    // One down reading alone is not a pattern
    tick(15);
    svc.services?.takeSample('skylink', 'registration', 'pilot-report');
    expect(incomplete(svc, 's3-establish-pattern')[0]).toContain('Terminal link read once while Down');
    readPattern(svc);
    expect(incomplete(svc, 's3-establish-pattern')).toEqual([]);
  });

  it('keeps the check objective open until the cause is graded as an authored option', () => {
    const svc = bootScenario(data);
    svc.plant.inspect('skylink-dish');
    // Free-text "other" never matches, and a plan alone is not a hypothesis
    fileHypothesis(svc, 'other', observations(svc));
    checkPlan(svc);
    expect(incomplete(svc, 's3-select-check')).toEqual(['Suspected cause chosen and tied to an observation']);
    fileHypothesis(svc, 'router', []);
    expect(incomplete(svc, 's3-select-check')).toEqual(['Suspected cause chosen and tied to an observation']);
    fileHypothesis(svc, 'cable-damage', observations(svc));
    expect(incomplete(svc, 's3-select-check')).toEqual([]);
  });

  it('rejects a check plan that cites nothing or names an unlisted check', () => {
    const svc = bootScenario(data);
    expect(checkPlan(svc)?.ok).toBe(false);
    svc.plant.inspect('skylink-dish');
    expect(checkPlan(svc, 'replace-everything')?.ok).toBe(false);
    expect(checkPlan(svc, 'test-cable')?.ok).toBe(true);
  });

  it('requires an expected outcome and rejects one the baseline already contradicts', () => {
    const svc = bootScenario(data);
    svc.plant.inspect('skylink-dish');
    const base = { check: { value: 'inspect-connector' }, basis: { cites: observations(svc).slice(0, 1) } };
    expect(svc.records?.submit('check-plan', base)?.ok).toBe(false);
    expect(checkPlan(svc, 'inspect-connector', 'no-supply')?.ok).toBe(false);
    expect(checkPlan(svc, 'inspect-connector', 'leak-or-open')?.ok).toBe(true);
  });

  it('rejects a comparison that names the wrong changed reading', () => {
    const svc = bootScenario(data);
    svc.plant.inspect('skylink-dish');
    const bad = svc.records?.submit('comparison', { changed: { value: 'power-and-local' }, unchanged: { value: 'registration' }, evidence: { cites: observations(svc) } });
    expect(bad?.ok).toBe(false);
  });

  it('does not accept a pre-repair run as verification', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's3-assess-local-cause' });
    // A run before the repair (in a good phase) cannot count even when it is supported
    tick(100);
    svc.workloads?.start('ola-check', 'skylink');
    svc.workloads?.waitForRun(svc.workloads.getRuns().at(-1)?.id ?? '');
    acts(svc)['s3-repair-local-fault']();
    expect(incomplete(svc, 's3-verify-and-record').length).toBeGreaterThan(0);
    expect(incomplete(svc, 's3-verify-and-record')[0]).toContain('Fresh application check');
  });

  it('removing the moisture removes the flap', () => {
    const svc = bootScenario(data);
    tick(200);
    const before = svc.services?.history('skylink').filter((e) => e.layer === 'registration' && e.to === 'down').length ?? 0;
    expect(before).toBeGreaterThanOrEqual(2);
    acts(svc)['s3-repair-local-fault']();
    tick(100);
    const mid = svc.services?.history('skylink').filter((e) => e.layer === 'registration' && e.to === 'down').length ?? 0;
    tick(400);
    const after = svc.services?.history('skylink').filter((e) => e.layer === 'registration' && e.to === 'down').length ?? 0;
    expect(after).toBe(mid);
  });

  it('restores a checkpoint taken after the evidence was gathered', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's3-select-check' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(incomplete(again, 's3-select-check')).toEqual([]);
    expect(incomplete(again, 's3-establish-pattern')).toEqual([]);
    expect(again.plant.getFaults().filter((f) => f.id === FAULT)).toHaveLength(1);
  });

  it('grades the debrief: an inspected seal is a supported fix, a blind one is not', () => {
    const source = (svc: PhysicalPlantService) => ({ field: { evidence: svc.evidence, plant: svc.plant }, config: () => svc.plant.getConfig() });
    const supported = bootScenario(data);
    driveObjectives(data, supported, states, acts(supported), { stopAfter: 's3-repair-local-fault' });
    const good = buildFieldDiagnosis(source(supported), 100);
    expect(good?.summary.supportedFixes).toBe(1);
    expect(good?.summary.unsupportedFixes).toBe(0);
    Service.destroy();
    EventBus.destroy();
    SimClock.reset();
    states.clear();

    const blind = bootScenario(data);
    blind.plant.goOutside();
    blind.plant.seal(CONNECTOR);
    blind.plant.returnInside();
    const bad = buildFieldDiagnosis(source(blind), 100);
    expect(bad?.summary.unsupportedFixes).toBe(1);
  });

  it('keeps a recovery route: a blind seal still satisfies the observed-evidence condition', () => {
    const svc = bootScenario(data);
    svc.plant.goOutside();
    svc.plant.seal(CONNECTOR);
    svc.plant.returnInside();
    expect(incomplete(svc, 's3-collect-local-evidence')).not.toContain('Physical fault evidence observed');
  });
});
