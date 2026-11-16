/**
 * M27 S16 completion: the independent shift. Brief, baseline, the staged partial-seat at ps:ac-out (S2 method, no new repair
 * verb), the separate SkyLink provider outage that only starts after the local repair is verified, the limited-service final
 * window and the final handover complete in order on the sim clock; wrong arrangements and shortcuts fail.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import { C5_REFERRAL_FALLBACK, resolveContinuity } from '@app/campaigns/frontline/continuity-fallbacks';
import { FORWARD_EUROSAT_SERVICE, FORWARD_FIRST_CARD } from '@app/campaigns/frontline/forward-field-config';
import { S11_TRANSFER_CARD } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario16Data, S16_FAULT, S16_FINAL_WINDOW_S, S16_OUTAGE_OFFSET_S, S16_PRIOR_INCIDENT_LINK } from '@app/campaigns/frontline/scenario16';
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
const data = frontlineScenario16Data;
const SKY = SKYLINK_SERVICE;
const EUS = FORWARD_EUROSAT_SERVICE;
const FIRST = FORWARD_FIRST_CARD.id;
const TRANSFER = S11_TRANSFER_CARD.id;
const SEAT = 'ps:ac-out';
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const actionIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('action') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};
type Layer = 'local' | 'registration' | 'provider' | 'application';
const cur = (svc: PhysicalPlantService, id: string, layer: Layer): { value: string } => ({ value: String(svc.services?.latest(id, layer)?.value) });
const energy = (svc: PhysicalPlantService): { value: number } => ({ value: Math.round(svc.plant.getPowerReadings().socWh['power-station']) });
const mode = (svc: PhysicalPlantService, part: string): { value: string } => ({ value: String(svc.plant.getPartMode(part)) });

function run(svc: PhysicalPlantService, card: string, service: string): string {
  const start = svc.workloads?.start(card, service);
  expect(start?.ok, JSON.stringify(start)).toBe(true);
  const fin = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
  expect(fin?.status, JSON.stringify(fin)).toBe('supported');
  return fin?.id ?? '';
}

function inspectSeat(svc: PhysicalPlantService): void {
  svc.plant.inspect(SEAT);
  svc.plant.wiggle(SEAT);
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's16-review-handover': () => {
      ok(
        svc.records?.submit('brief', {
          task: { value: FIRST },
          reserve: { value: 'reserve-200' },
          equipment: { value: 'both-terminals' },
          prior: { value: 'source-not-established' },
          unknowns: { value: 'service-and-power' },
        })
      );
    },
    's16-establish-configuration': () => {
      // Both terminals running misses the 200 Wh reserve; the player parks the modem
      svc.plant.setPartMode('vsat-modem', 'standby');
      tick(40);
      svc.plant.inspect('power-station');
      svc.services?.takeSample(SKY, 'local', 'local-probe');
      svc.services?.takeSample(SKY, 'application', 'endpoint-report');
      const runId = run(svc, FIRST, SKY);
      svc.services?.takeSample(SKY, 'local', 'local-probe');
      svc.services?.takeSample(SKY, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('baseline', {
          dish: mode(svc, 'skylink-dish'),
          modem: mode(svc, 'vsat-modem'),
          local: cur(svc, SKY, 'local'),
          application: cur(svc, SKY, 'application'),
          verified: { value: runId },
          energy: energy(svc),
        })
      );
    },
    's16-investigate-local-change': () => {
      tick(5);
      inspectSeat(svc);
      svc.plant.reseat(SEAT);
      // The terminal restarts after the supply returns
      tick(360);
      svc.plant.inspect('power-station');
      const runId = run(svc, FIRST, SKY);
      svc.services?.takeSample(SKY, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('local', {
          seating: { cites: obsIds(svc) },
          action: { cites: actionIds(svc) },
          verified: { value: runId },
          application: cur(svc, SKY, 'application'),
          energy: energy(svc),
        })
      );
    },
    's16-assess-external-change': () => {
      tick(S16_OUTAGE_OFFSET_S + 5);
      svc.services?.takeSample(SKY, 'local', 'local-probe');
      svc.services?.takeSample(SKY, 'provider', 'provider-portal');
      svc.services?.takeSample(SKY, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('external', {
          scope: { value: 'skylink-provider' },
          local: { value: 'separate' },
          provider: cur(svc, SKY, 'provider'),
          evidence: { cites: obsIds(svc) },
          fix: { value: 'does-not-clear' },
        })
      );
    },
    's16-verify-final-service': () => {
      // SkyLink cannot carry anything; park its dish and bring the EuroSat modem up inside the reserve
      svc.plant.setPartMode('skylink-dish', 'standby');
      svc.plant.setPartMode('vsat-modem', 'run');
      tick(40);
      incomplete(svc, 's16-verify-final-service');
      svc.plant.inspect('power-station');
      const runId = run(svc, TRANSFER, EUS);
      svc.services?.takeSample(EUS, 'application', 'endpoint-report');
      tick(S16_FINAL_WINDOW_S);
      ok(
        svc.records?.submit('outcome', {
          modem: mode(svc, 'vsat-modem'),
          dish: mode(svc, 'skylink-dish'),
          verified: { value: runId },
          unavailable: { value: FIRST },
          rate: { value: svc.records?.latestRunRateW(TRANSFER, EUS) },
          energy: energy(svc),
        })
      );
    },
    's16-submit-final-handover': () => {
      ok(
        svc.records?.submit('final', {
          localEvidence: { cites: obsIds(svc) },
          localAction: { cites: actionIds(svc) },
          externalEvidence: { cites: obsIds(svc) },
          incidents: { value: 'separate' },
          service: { value: 'limited' },
          unavailable: { value: FIRST },
          prior: { value: 'source-not-established' },
          energy: energy(svc),
        })
      );
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(16);
  states.clear();
  localStorage.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M27 S16 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order, ending in limited service with the reserve kept', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc), {});
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.plant.getFaults().some((f) => f.id === S16_FAULT)).toBe(false);
    expect(svc.services?.takeSample(SKY, 'provider', 'provider-portal').value).toBe('down');
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
  });

  it('never freezes the scenario clock', () => {
    expect(data.objectives.some((o) => o.freezesScenarioTimer)).toBe(false);
  });

  it('loads the prior incident from the S15 record or the fallback, never claiming a source', () => {
    const prior = resolveContinuity(S16_PRIOR_INCIDENT_LINK);
    expect(prior.source).toBe('fallback');
    expect(JSON.stringify(prior).toLowerCase()).not.toMatch(/located|coordinates|latitude/u);
    expect(C5_REFERRAL_FALLBACK.source).toBe('fallback');
  });

  it('keeps both terminals running from passing the baseline and rejects a wrong brief', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's16-review-handover' });
    states.set('s16-establish-configuration', { isActive: true, isCompleted: false });
    tick(40);
    svc.services?.takeSample(SKY, 'local', 'local-probe');
    svc.services?.takeSample(SKY, 'application', 'endpoint-report');
    expect(svc.plant.forecast({}).meetsReserve).toBe(false);
    expect(incomplete(svc, 's16-establish-configuration').join('|')).toContain('Forecast keeps the 200 Wh reserve');
    const bad = svc.records?.submit('brief', {
      task: { value: TRANSFER },
      reserve: { value: 'reserve-200' },
      equipment: { value: 'both-terminals' },
      prior: { value: 'source-not-established' },
      unknowns: { value: 'service-and-power' },
    });
    expect(bad?.ok).toBe(false);
  });

  it('does not inject the fault or the outage before their objectives, and holds the outage until the local repair is verified', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's16-establish-configuration' });
    tick(60);
    expect(svc.plant.getFaults()).toEqual([]);
    expect(svc.services?.takeSample(SKY, 'provider', 'provider-portal').value).toBe('up');
    states.set('s16-investigate-local-change', { isActive: true, isCompleted: false });
    tick(S16_OUTAGE_OFFSET_S + 60);
    expect(svc.plant.getFaults().some((f) => f.id === S16_FAULT)).toBe(true);
    expect(svc.services?.takeSample(SKY, 'provider', 'provider-portal').value).toBe('up');
  });

  it('states a reseat downtime that matches the real restart', () => {
    const gaps: string[] = [];
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      Service.destroy();
      EventBus.destroy();
      SimClock.reset();
      Rng.setSeed(seed);
      states.clear();
      const svc = bootScenario(data);
      driveObjectives(data, svc, states, acts(svc), { stopAfter: 's16-establish-configuration' });
      tick(5);
      inspectSeat(svc);
      const result = svc.plant.reseat(SEAT);
      const stated = (result.downtimeSeconds ?? 0) - (result.costSeconds ?? 0);
      let clearAt = -1;
      for (let t = 1; t <= 900 && clearAt < 0; t++) {
        tick(1);
        if (!svc.plant.isSearching('skylink-dish') && !svc.plant.getPartState('skylink-dish')?.rebooting) {
          clearAt = t;
        }
      }
      // The terminal must be back by the time the stated downtime has passed
      if (clearAt > stated + 2) {
        gaps.push(`seed ${seed}: stated ${Math.round(stated)} s, back after ${clearAt} s`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('finishes a run after a clock jump when the check catches the simulation up', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's16-establish-configuration' });
    tick(400);
    const start = svc.workloads?.start(FIRST, SKY);
    expect(start?.ok).toBe(true);
    const id = start?.ok ? start.run.id : '';
    SimClock.skip(600_000);
    expect(svc.workloads?.getRun(id)?.status).toBe('running');
    svc.records?.validate('baseline', {});
    expect(svc.workloads?.getRun(id)?.status).not.toBe('running');
  });

  it('rejects the local objective on a blind reseat or without a fresh post-repair run', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's16-establish-configuration' });
    states.set('s16-investigate-local-change', { isActive: true, isCompleted: false });
    tick(5);
    expect(incomplete(svc, 's16-investigate-local-change')).toContain('Repair supported by recorded evidence');
    svc.plant.reseat(SEAT);
    const missing = incomplete(svc, 's16-investigate-local-change').join('|');
    expect(missing).toContain('First task verified on SkyLink after the repair');
    expect(missing).toContain('First service change recorded');
  });

  it('does not let a local restart clear the provider outage, and the first task stays unavailable', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's16-investigate-local-change' });
    states.set('s16-assess-external-change', { isActive: true, isCompleted: false });
    tick(S16_OUTAGE_OFFSET_S + 5);
    svc.plant.setPartMode('skylink-dish', 'standby');
    tick(2);
    svc.plant.setPartMode('skylink-dish', 'run');
    tick(60);
    expect(svc.services?.takeSample(SKY, 'provider', 'provider-portal').value).toBe('down');
    const start = svc.workloads?.start(FIRST, SKY);
    const fin = start?.ok ? svc.workloads?.waitForRun(start.run.id) : undefined;
    expect(fin?.status).not.toBe('supported');
  });

  it('rejects the final window when both terminals run, or when the transfer run predates the outage', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's16-assess-external-change' });
    states.set('s16-verify-final-service', { isActive: true, isCompleted: false });
    svc.plant.setPartMode('vsat-modem', 'run');
    tick(40);
    expect(svc.plant.forecast({}).meetsReserve).toBe(false);
    const missing = incomplete(svc, 's16-verify-final-service').join('|');
    expect(missing).toContain('Forecast keeps the 200 Wh reserve with the final arrangement');
    expect(missing).toContain('Transfer task verified on EuroSat after the outage began');
  });

  it('restores a checkpoint taken after the fault was repaired and finishes without a second fault', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's16-investigate-local-change' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(2);
    expect(again.plant.getFaults().some((f) => f.id === S16_FAULT)).toBe(false);
    expect(again.records?.isHandoverValid('local')).toBe(true);
    const done = driveObjectives(data, again, states, acts(again), { startAt: 's16-assess-external-change' });
    expect(done).toEqual(['s16-assess-external-change', 's16-verify-final-service', 's16-submit-final-handover']);
    expect(again.plant.getFaults()).toEqual([]);
  });

  it('grades the repair in the debrief: an inspected reseat is supported and a blind reseat is not', () => {
    const source = (svc: PhysicalPlantService) => ({ field: { evidence: svc.evidence, plant: svc.plant }, config: () => svc.plant.getConfig() });
    const supported = bootScenario(data);
    driveObjectives(data, supported, states, acts(supported), { stopAfter: 's16-investigate-local-change' });
    const good = buildFieldDiagnosis(source(supported), 100);
    expect(good?.summary.supportedFixes).toBe(1);
    expect(good?.summary.unsupportedFixes).toBe(0);
    Service.destroy();
    EventBus.destroy();
    SimClock.reset();
    states.clear();

    const blind = bootScenario(data);
    driveObjectives(data, blind, states, acts(blind), { stopAfter: 's16-establish-configuration' });
    states.set('s16-investigate-local-change', { isActive: true, isCompleted: false });
    tick(5);
    blind.plant.reseat(SEAT);
    const bad = buildFieldDiagnosis(source(blind), 100);
    expect(bad?.summary.unsupportedFixes).toBe(1);
    expect(bad?.effect.penalty).toBeGreaterThan(0);
  });
});
