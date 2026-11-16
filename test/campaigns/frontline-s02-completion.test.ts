/**
 * M20 S2 completion: the power budget, the anchored supply loss, the 120 s window and the
 * resource handover complete in order on the sim clock; wrong configurations fail; a checkpoint
 * taken after the outage began restores it without a second outage; the debrief grades the fix.
 */

import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
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
const data = frontlineScenario2Data;
const obj = (id: string) => data.objectives.find((o) => o.id === id) as NonNullable<(typeof data.objectives)[number]>;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(obj(id) as never, svc);

const FAULT = 's2-generator-seat';

function skylinkOnly(svc: PhysicalPlantService): void {
  svc.plant.setPartMode('vsat-modem', 'standby');
}

function inspectSeat(svc: PhysicalPlantService): void {
  svc.plant.goOutside();
  svc.plant.inspect('generator:out');
  svc.plant.wiggle('generator:out');
}

function reseat(svc: PhysicalPlantService): void {
  svc.plant.reseat('generator:out');
  svc.plant.returnInside();
}

function lastRunId(svc: PhysicalPlantService): string {
  return [...(svc.workloads?.getRuns() ?? [])].reverse().find((r) => r.status === 'supported' && !r.invalidatedBy)?.id ?? '';
}

function resourcesInput(svc: PhysicalPlantService, over: Record<string, { value?: string | number; cites?: string[] }> = {}) {
  const readings = svc.plant.getPowerReadings();
  const log = svc.evidence?.entries() ?? [];

  return {
    energy: { value: Math.round(readings.socWh['power-station']) },
    fuel: { value: Math.round(readings.fuelL.generator * 10) / 10 },
    skylink: { value: svc.plant.getPartMode('skylink-dish') },
    vsat: { value: svc.plant.getPartMode('vsat-modem') },
    verified: { value: lastRunId(svc) },
    seating: { cites: log.filter((e) => e.kind === 'observation' && e.subject.startsWith('generator')).map((e) => e.id) },
    reseat: { cites: log.filter((e) => e.kind === 'action').map((e) => e.id) },
    limitation: { value: 'skylink-only' },
    rate: { value: svc.records?.latestRunRateW('ola-voice', 'skylink') },
    ...over,
  };
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's2-read-resources': () => {
      svc.plant.inspect('power-station');
    },
    's2-trace-dependencies': () => {
      svc.plant.inspect('power-strip');
    },
    's2-select-configuration': () => skylinkOnly(svc),
    's2-respond-to-outage': () => {
      inspectSeat(svc);
      reseat(svc);
    },
    's2-verify-service-reserve': () => {
      incomplete(svc, 's2-verify-service-reserve');
      // The terminal reboots after the supply drops, then searches for a satellite (up to 300 s in all); a run started before that is unsupported
      tick(300);
      const start = svc.workloads?.start('ola-voice', 'skylink');
      expect(start?.ok).toBe(true);
      const fin = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
      expect(fin?.status, JSON.stringify(fin) + JSON.stringify(svc.services?.layers('skylink'))).toBe('supported');
      svc.services?.takeSample('skylink', 'application', 'endpoint-report');
      incomplete(svc, 's2-verify-service-reserve');
    },
    's2-record-resources': () => {
      const res = svc.records?.submit('resources', resourcesInput(svc));
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

describe('M20 S2 completion', () => {
  it('has no placeholder gates and no objective passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      if (o.id === 's2-read-resources' || o.id === 's2-trace-dependencies') {
        continue; // gated by inspection and a quiz
      }
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc));
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.events?.hasFired('s2-supply-loss')).toBe(true);
  });

  it('pins the planning numbers: both terminals fail the reserve, SkyLink only passes', () => {
    const svc = bootScenario(data);
    const both = svc.plant.forecast();
    expect(both.meetsReserve).toBe(false);
    expect(both.projectedSocWh).toBeCloseTo(187.5, 1);
    const sky = svc.plant.forecast({ 'vsat-modem': 'standby' });
    expect(sky.meetsReserve).toBe(true);
    expect(sky.projectedSocWh).toBeCloseTo(270, 1);
  });

  it('refuses the VSAT-only and both-on configurations, then accepts SkyLink only', () => {
    const svc = bootScenario(data);
    states.set('s2-trace-dependencies', { isActive: false, isCompleted: true });
    // Both terminals running: the low-delay card is met but the reserve is not
    expect(incomplete(svc, 's2-select-configuration')).toEqual(['Forecast keeps the 200 Wh reserve over the planning horizon']);
    // VSAT only: the reserve holds but the 620 ms path misses the 150 ms card
    svc.plant.setPartMode('skylink-dish', 'standby');
    expect(svc.plant.forecast().meetsReserve).toBe(true);
    expect(incomplete(svc, 's2-select-configuration')).toEqual(['A running terminal meets the low-delay requirement']);
    // Both off fails the card too
    svc.plant.setPartMode('vsat-modem', 'standby');
    expect(incomplete(svc, 's2-select-configuration')).toEqual(['A running terminal meets the low-delay requirement']);
    // Recover: SkyLink only
    svc.plant.setPartMode('skylink-dish', 'run');
    expect(incomplete(svc, 's2-select-configuration')).toEqual([]);
  });

  it('fires the supply loss only once the outage objective is live, and not for a slow reader', () => {
    const svc = bootScenario(data);
    tick(600);
    expect(svc.events?.hasFired('s2-supply-loss')).toBe(false);
    expect(svc.plant.getFaults().some((f) => f.id === FAULT)).toBe(false);
    states.set('s2-respond-to-outage', { isActive: true, isCompleted: false });
    tick();
    expect(svc.events?.hasFired('s2-supply-loss')).toBe(true);
    expect(svc.plant.getFaults().some((f) => f.id === FAULT)).toBe(true);
  });

  it('keeps the outage objective open until the seating evidence and the reseat exist', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's2-select-configuration' });
    states.set('s2-respond-to-outage', { isActive: true, isCompleted: false });
    tick();
    expect(incomplete(svc, 's2-respond-to-outage')).toEqual(['Connector seating evidence recorded', 'Seating fault cleared by the reseat action']);
    inspectSeat(svc);
    expect(incomplete(svc, 's2-respond-to-outage')).toEqual(['Seating fault cleared by the reseat action']);
    reseat(svc);
    expect(incomplete(svc, 's2-respond-to-outage')).toEqual([]);
  });

  it('keeps a recovery route: a blind reseat still completes the outage objective (the debrief charges it)', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's2-select-configuration' });
    states.set('s2-respond-to-outage', { isActive: true, isCompleted: false });
    tick();
    reseat(svc);
    expect(incomplete(svc, 's2-respond-to-outage')).toEqual([]);
  });

  it('rejects a resource handover that claims the wrong mode or an old window, then accepts the right one', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's2-verify-service-reserve' });
    const bad = svc.records?.submit('resources', resourcesInput(svc, { vsat: { value: 'run' } }));
    expect(bad?.ok).toBe(false);
    const noCause = svc.records?.submit('resources', resourcesInput(svc, { limitation: { value: 'other' } }));
    expect(noCause?.ok).toBe(false);
    expect(incomplete(svc, 's2-record-resources')).not.toEqual([]);
    acts(svc)['s2-record-resources']();
    expect(incomplete(svc, 's2-record-resources')).toEqual([]);
  });

  it('restores a checkpoint taken after the outage began without a second outage', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's2-select-configuration' });
    states.set('s2-respond-to-outage', { isActive: true, isCompleted: false });
    tick();
    inspectSeat(svc);
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(again.plant.getFaults().filter((f) => f.id === FAULT)).toHaveLength(1);
    expect(again.events?.hasFired('s2-supply-loss')).toBe(true);
    expect(again.plant.getPartMode('vsat-modem')).toBe('standby');
    expect(incomplete(again, 's2-respond-to-outage')).toEqual(['Seating fault cleared by the reseat action']);
    reseat(again);
    expect(incomplete(again, 's2-respond-to-outage')).toEqual([]);
  });

  it('grades the debrief: an inspected reseat is a supported fix, a blind one is not', () => {
    const supported = bootScenario(data);
    driveObjectives(data, supported, states, acts(supported), { stopAfter: 's2-respond-to-outage' });
    const source = (svc: PhysicalPlantService) => ({ field: { evidence: svc.evidence, plant: svc.plant }, config: () => svc.plant.getConfig() });
    const good = buildFieldDiagnosis(source(supported), 100);
    expect(good?.summary.supportedFixes).toBe(1);
    expect(good?.summary.unsupportedFixes).toBe(0);
    Service.destroy();
    EventBus.destroy();
    SimClock.reset();
    states.clear();

    const blind = bootScenario(data);
    driveObjectives(data, blind, states, acts(blind), { stopAfter: 's2-select-configuration' });
    states.set('s2-respond-to-outage', { isActive: true, isCompleted: false });
    tick();
    blind.plant.goOutside();
    blind.plant.reseat('generator:out');
    blind.plant.returnInside();
    const bad = buildFieldDiagnosis(source(blind), 100);
    expect(bad?.summary.unsupportedFixes).toBe(1);
    expect(bad?.effect.penalty).toBeGreaterThan(0);
  });
});

describe('S2 visual inspection of the partial seat', () => {
  it('shows a gap at the generator output plug and leaves the voltage to the multimeter', () => {
    const svc = bootScenario(data);
    svc.plant.goOutside();
    svc.plant.injectFault({ id: 'seat-test', target: 'generator:out', kind: 'partial-seat' });
    const seen = svc.plant.inspect('generator:out').observation;
    expect(seen).toMatch(/gap/iu);
    expect(seen).not.toMatch(/no gap|fully home/iu);
  });
});
