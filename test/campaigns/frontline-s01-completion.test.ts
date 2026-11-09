/**
 * M20 S1 completion: the player's actions complete every objective in order on the sim clock,
 * a wrong handover is rejected and recovers, and a mid-scenario checkpoint restores the state.
 */

import { frontlineScenario1Data } from '@app/campaigns/frontline/scenario1';
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
const obj = (id: string) => frontlineScenario1Data.objectives.find((o) => o.id === id) as NonNullable<(typeof frontlineScenario1Data.objectives)[number]>;

function entryIds(svc: PhysicalPlantService, kind: 'observation' | 'action'): string[] {
  return (svc.evidence?.entries(kind) ?? []).map((e) => e.id);
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  const sm = () => svc.services as NonNullable<typeof svc.services>;
  const sample = (layer: 'power' | 'local' | 'registration', via: 'device-indicator' | 'local-probe' | 'terminal-app') => sm().takeSample('skylink', layer, via);

  return {
    's1-identify-equipment': () => {
      for (const id of ['power-station', 'skylink-router', 'skylink-dish', 'laptop']) {
        svc.plant.inspect(id);
      }
    },
    's1-check-condition': () => {
      for (const id of ['generator', 'power-station', 'power-strip', 'skylink-cable', 'skylink-cable:dish', 'skylink-cable:router']) {
        svc.plant.inspect(id);
      }
    },
    's1-establish-connection': () => {
      sample('local', 'local-probe');
      sample('registration', 'terminal-app');
    },
    's1-test-application': () => {
      const start = svc.workloads?.start('ola-check', 'skylink');
      expect(start?.ok).toBe(true);
      const run = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
      expect(run?.status).toBe('supported');
      // The remote end reports after the run, so the status sample comes last
      sm().takeSample('skylink', 'application', 'endpoint-report');
    },
    's1-record-baseline': () => submitBaseline(svc),
    's1-hand-over-post': () => submitHandover(svc),
  };
}

function runId(svc: PhysicalPlantService): string {
  return [...(svc.workloads?.getRuns() ?? [])].reverse().find((r) => r.status === 'supported' && !r.invalidatedBy)?.id ?? '';
}

function baselineInput(svc: PhysicalPlantService, soc: number) {
  const obs = entryIds(svc, 'observation');

  return {
    service: { value: 'skylink' },
    energy: { value: soc },
    power: { value: String(svc.services?.takeSample('skylink', 'power', 'device-indicator').value) },
    local: { value: String(svc.services?.takeSample('skylink', 'local', 'local-probe').value) },
    registration: { value: String(svc.services?.takeSample('skylink', 'registration', 'terminal-app').value) },
    application: { value: runId(svc) },
    evidence: { cites: obs.slice(0, 2) },
  };
}

function submitBaseline(svc: PhysicalPlantService): void {
  const soc = Math.round(svc.plant.getPowerReadings().socWh['power-station']);
  const res = svc.records?.submit('baseline', baselineInput(svc, soc));
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
}

function submitHandover(svc: PhysicalPlantService): void {
  const res = svc.records?.submit('handover', {
    verified: { value: 'skylink' },
    untested: { value: 'camp-vsat' },
    run: { value: runId(svc) },
    readiness: { value: 'skylink-only' },
  });
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
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

describe('M20 S1 completion', () => {
  it('has no placeholder gates left and every objective is incomplete before the player acts', () => {
    expect(frontlineScenario1Data.mechanicTodos).toEqual([]);
    const svc = bootScenario(frontlineScenario1Data);
    for (const o of frontlineScenario1Data.objectives) {
      const missing = unmet(o as never, svc);
      expect(missing.length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order', () => {
    const svc = bootScenario(frontlineScenario1Data);
    const done = driveObjectives(frontlineScenario1Data, svc, states, acts(svc));
    expect(done).toEqual(frontlineScenario1Data.objectives.map((o) => o.id));
  });

  it('rejects a handover naming the wrong untested service, then accepts the corrected one', () => {
    const svc = bootScenario(frontlineScenario1Data);
    driveObjectives(frontlineScenario1Data, svc, states, acts(svc), { stopAfter: 's1-record-baseline' });
    const bad = svc.records?.submit('handover', {
      verified: { value: 'camp-vsat' },
      untested: { value: 'skylink' },
      run: { value: runId(svc) },
      readiness: { value: 'skylink-only' },
    });
    expect(bad?.ok).toBe(false);
    expect(unmet(obj('s1-hand-over-post') as never, svc)).not.toEqual([]);
    submitHandover(svc);
    expect(unmet(obj('s1-hand-over-post') as never, svc)).toEqual([]);
  });

  it('refuses the baseline when the stored energy is claimed wrongly or a reading is out of date', () => {
    const svc = bootScenario(frontlineScenario1Data);
    driveObjectives(frontlineScenario1Data, svc, states, acts(svc), { stopAfter: 's1-test-application' });
    const wrong = svc.records?.submit('baseline', baselineInput(svc, 500));
    expect(wrong?.ok).toBe(false);
    // Readings go stale with time; the player has to take them again
    const input = baselineInput(svc, 900);
    tick(200);
    const stale = svc.records?.submit('baseline', input);
    expect(stale?.ok).toBe(false);
    submitBaseline(svc);
  });

  it('survives a checkpoint mid-scenario and finishes after the restore', () => {
    const svc = bootScenario(frontlineScenario1Data);
    driveObjectives(frontlineScenario1Data, svc, states, acts(svc), { stopAfter: 's1-test-application' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(frontlineScenario1Data);
    restoreManagerStates(saved);
    expect(again.plant.hasInspected('power-station')).toBe(true);
    expect(again.workloads?.getRuns().some((r) => r.status === 'supported')).toBe(true);
    expect(again.evidence?.entries('observation').length).toBeGreaterThan(0);
    // A reload invalidates the earlier run, so the player repeats the application check first
    expect(runId(again)).toBe('');
    const rerun = again.workloads?.start('ola-check', 'skylink');
    again.workloads?.waitForRun(rerun?.ok ? rerun.run.id : '');
    again.services?.takeSample('skylink', 'application', 'endpoint-report');
    expect(runId(again)).not.toBe('');
    submitBaseline(again);
    expect(unmet(obj('s1-record-baseline') as never, again)).toEqual([]);
    submitHandover(again);
    expect(unmet(obj('s1-hand-over-post') as never, again)).toEqual([]);
  });
});
