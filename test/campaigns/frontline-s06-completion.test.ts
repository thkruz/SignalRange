/**
 * M22 S6 completion: the same prompt-response task is run on the low-delay and GEO-like profiles, then
 * on the fiber and radio variants of the SkyLink path, and the queued-report task on both variants.
 * The radio prompt-response case is correctly unsuitable. The suitability report must match the four
 * recorded runs; a report claiming everything works fails. A checkpoint invalidates old runs.
 */

import { frontlineScenario6Data } from '@app/campaigns/frontline/scenario6';
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
const data = frontlineScenario6Data;
const obj = (id: string) => data.objectives.find((o) => o.id === id) as NonNullable<(typeof data.objectives)[number]>;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(obj(id) as never, svc);

const PROMPT = 'prompt-response';
const QUEUED = 'queued-report';

const observations = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);

/** Starts a run, waits out its window and returns it */
function run(svc: PhysicalPlantService, card: string, service: string) {
  const start = svc.workloads?.start(card, service);
  expect(start?.ok, `${card} on ${service}`).toBe(true);

  return svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
}

function submitOk(svc: PhysicalPlantService, form: string, values: Record<string, { value?: string; cites?: string[] }>): void {
  const res = svc.records?.submit(form, values);
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
}

const MET = { depends: { value: 'satellite-and-local' }, finding: { value: 'requirement-met' } };
const RADIO = { depends: { value: 'radio-and-satellite' } };

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  const ids: Record<string, string> = {};
  const record = (key: string, card: string, service: string, expected: string) => {
    const fin = run(svc, card, service);
    expect(fin?.status, key).toBe(expected);
    ids[key] = fin?.id ?? '';
  };

  return {
    's06-read-requirements': () => undefined,
    's06-compare-profiles': () => {
      tick(120);
      record('low', PROMPT, 'skylink', 'supported');
      record('geo', PROMPT, 'camp-vsat', 'unsupported');
      submitOk(svc, 'profile-comparison', {
        'low-delay': { value: ids.low },
        'geo-like': { value: ids.geo },
        changed: { value: 'delay' },
        evidence: { cites: observations(svc) },
      });
    },
    's06-assess-fiber': () => {
      record('pf', PROMPT, 'skylink-fiber', 'supported');
      submitOk(svc, 'case-prompt-fiber', { run: { value: ids.pf }, ...MET, evidence: { cites: observations(svc) } });
    },
    's06-assess-radio': () => {
      record('pr', PROMPT, 'skylink-radio', 'unsupported');
      submitOk(svc, 'case-prompt-radio', { run: { value: ids.pr }, ...RADIO, finding: { value: 'radio-adds-delay' }, evidence: { cites: observations(svc) } });
    },
    's06-assess-tolerant': () => {
      record('qf', QUEUED, 'skylink-fiber', 'supported');
      record('qr', QUEUED, 'skylink-radio', 'supported');
      submitOk(svc, 'case-queued-fiber', { run: { value: ids.qf }, ...MET, evidence: { cites: observations(svc) } });
      submitOk(svc, 'case-queued-radio', { run: { value: ids.qr }, ...RADIO, finding: { value: 'requirement-met' }, evidence: { cites: observations(svc) } });
    },
    's06-report-suitability': () => {
      submitOk(svc, 'suitability', {
        'prompt-fiber': { value: ids.pf },
        'prompt-radio': { value: ids.pr },
        'queued-fiber': { value: ids.qf },
        'queued-radio': { value: ids.qr },
        supported: { value: 'prompt-fiber-and-queued' },
        unmet: { value: 'prompt-radio-delay' },
        unresolved: { value: 'radio-segment-not-isolated' },
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

describe('M22 S6 completion', () => {
  it('has no placeholder gates and no objective passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    tick(2);
    for (const o of data.objectives) {
      if (o.id === 's06-read-requirements') {
        continue; // quiz only
      }
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc));
    expect(done).toEqual(data.objectives.map((o) => o.id));
  });

  it('models the four cases as independent dimensions of one terminal', () => {
    const svc = bootScenario(data);
    tick(120);
    const w = svc.workloads;
    expect(w?.assess(PROMPT, 'skylink-fiber')?.status).toBe('supported');
    const radio = w?.assess(PROMPT, 'skylink-radio');
    expect(radio?.status).toBe('unsupported');
    expect(radio?.unmet).toEqual(['rttMs']);
    expect(w?.assess(QUEUED, 'skylink-fiber')?.status).toBe('supported');
    expect(w?.assess(QUEUED, 'skylink-radio')?.status).toBe('supported');
    expect(w?.assess(PROMPT, 'camp-vsat')?.status).toBe('unsupported');
  });

  it('needs a run on each service, not one run or a quiz', () => {
    const svc = bootScenario(data);
    tick(120);
    run(svc, PROMPT, 'skylink');
    expect(incomplete(svc, 's06-compare-profiles')[0]).toContain('same task run on both');
    run(svc, PROMPT, 'camp-vsat');
    expect(incomplete(svc, 's06-compare-profiles')).toEqual(['Both profiles compared with the displayed requirement']);
  });

  it('rejects a case record that points at a run on the wrong connection', () => {
    const svc = bootScenario(data);
    tick(120);
    const fiber = run(svc, PROMPT, 'skylink-fiber');
    const radio = run(svc, PROMPT, 'skylink-radio');
    const wrong = svc.records?.submit('case-prompt-radio', { run: { value: fiber?.id }, ...RADIO, finding: { value: 'radio-adds-delay' }, evidence: { cites: observations(svc) } });
    expect(wrong?.ok).toBe(false);
    const right = svc.records?.submit('case-prompt-radio', { run: { value: radio?.id }, ...RADIO, finding: { value: 'radio-adds-delay' }, evidence: { cites: observations(svc) } });
    expect(right?.ok).toBe(true);
  });

  it('fails a suitability report that claims the radio prompt-response case is suitable', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's06-assess-tolerant' });
    const runs = svc.workloads?.getRuns() ?? [];
    const pick = (card: string, service: string) => runs.find((r) => r.cardId === card && r.serviceId === service)?.id ?? '';
    const bad = svc.records?.submit('suitability', {
      'prompt-fiber': { value: pick(PROMPT, 'skylink-fiber') },
      'prompt-radio': { value: pick(PROMPT, 'skylink-fiber') },
      'queued-fiber': { value: pick(QUEUED, 'skylink-fiber') },
      'queued-radio': { value: pick(QUEUED, 'skylink-radio') },
      supported: { value: 'all' },
      unmet: { value: 'none' },
      unresolved: { value: 'none' },
    });
    expect(bad?.ok).toBe(false);
    expect(incomplete(svc, 's06-report-suitability')).toEqual(['Suitability report matches the four recorded results']);
  });

  it('retakes the runs after a checkpoint restore, because earlier runs no longer count', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's06-assess-fiber' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(again.workloads?.getRuns().every((r) => r.invalidatedBy === 'reload')).toBe(true);
    expect(incomplete(again, 's06-assess-fiber')[0]).toContain('Prompt-response task run over the fiber');
    // Redo the objectives from the profile comparison on; the later ones still complete in order
    const redo = driveObjectives(data, again, states, acts(again), { startAt: 's06-compare-profiles' });
    expect(redo).toEqual(['s06-compare-profiles', 's06-assess-fiber', 's06-assess-radio', 's06-assess-tolerant', 's06-report-suitability']);
  });
});
