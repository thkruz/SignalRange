/**
 * M27 S15 completion: a staged run of EuroSat registration drops on a running clock (local network, power and SkyLink
 * stay up), the evidence comparison, a bounded "suspected interference" assessment that never names a source, the
 * incident package, a SkyLink workload on reduced resources, and the investigation referral with its C5 continuity.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import { C5_REFERRAL_FALLBACK, fileC5Referral, loadC5Referral } from '@app/campaigns/frontline/continuity-fallbacks';
import { FORWARD_EUROSAT_SERVICE, FORWARD_FIRST_CARD } from '@app/campaigns/frontline/forward-field-config';
import { S11_TRANSFER_CARD } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario15Data, S15_EVENT_ONSET, S15_REFERRAL } from '@app/campaigns/frontline/scenario15';
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
const data = frontlineScenario15Data;
const EUS = FORWARD_EUROSAT_SERVICE;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const resultIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('result') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};
type Layer = 'local' | 'registration' | 'provider' | 'application';
const value = (svc: PhysicalPlantService, id: string, layer: Layer): { value: string } => ({ value: String(svc.services?.latest(id, layer)?.value) });
const energy = (svc: PhysicalPlantService): { value: number } => ({ value: Math.round(svc.plant.getPowerReadings().socWh['power-station']) });

function fileHypothesis(svc: PhysicalPlantService, cause: string, cited: string[]): void {
  svc.evidence?.addHypothesis({
    subject: EUS,
    source: {},
    facts: [],
    text: `Assessment: ${cause}`,
    claim: { scope: 'segment', targetId: EUS, cause },
    confidence: 'medium',
    citedEntryIds: cited,
  });
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's15-record-anomaly': () => {
      // The first drop starts 15 s after activation and lasts about 45 s
      tick(20);
      svc.services?.takeSample(EUS, 'registration', 'terminal-app');
      svc.services?.takeSample(EUS, 'application', 'endpoint-report');
      svc.services?.takeSample(EUS, 'local', 'local-probe');
      svc.services?.takeSample(SKYLINK_SERVICE, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('anomaly', {
          service: { value: 'eurosat' },
          onset: { cites: resultIds(svc) },
          local: value(svc, EUS, 'local'),
          skylink: value(svc, SKYLINK_SERVICE, 'application'),
          symptoms: { cites: obsIds(svc) },
        })
      );
    },
    's15-review-evidence': () => {
      // The next drop starts 50 s after activation (the first one has recovered by then)
      tick(55);
      svc.services?.takeSample(EUS, 'registration', 'terminal-app');
      svc.services?.takeSample(EUS, 'local', 'local-probe');
      svc.plant.goOutside();
      svc.plant.inspect('vsat-feed');
      svc.plant.inspect('vsat-ifl:lnb');
      svc.plant.inspect('vsat-ifl:modem');
      svc.plant.returnInside();
      svc.plant.inspect('power-station');
      tick(50);
      svc.services?.takeSample(EUS, 'registration', 'terminal-app');
      svc.services?.takeSample(EUS, 'provider', 'provider-portal');
      ok(
        svc.records?.submit('evidence', {
          pattern: { cites: obsIds(svc) },
          provider: value(svc, EUS, 'provider'),
          local: { value: 'ruled-out' },
          limits: { value: 'not-proof' },
        })
      );
    },
    's15-assess-confidence': () => {
      fileHypothesis(svc, 'suspected-interference', obsIds(svc));
      ok(
        svc.records?.submit('assessment', {
          classification: { value: 'suspected-interference' },
          confidence: { value: 'moderate' },
          source: { value: 'not-established' },
          basis: { cites: obsIds(svc) },
        })
      );
    },
    's15-preserve-package': () => {
      ok(
        svc.records?.submit('package', {
          observations: { cites: obsIds(svc) },
          events: { cites: resultIds(svc) },
          terminal: { value: svc.plant.getPartMode('vsat-modem') },
          gap: { value: 'no-source-measurement' },
        })
      );
    },
    's15-maintain-supported-work': () => {
      svc.plant.setPartMode('vsat-modem', 'standby');
      tick(2);
      svc.plant.inspect('power-station');
      const start = svc.workloads?.start(FORWARD_FIRST_CARD.id, SKYLINK_SERVICE);
      expect(start?.ok).toBe(true);
      const run = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
      expect(run?.status, JSON.stringify(run)).toBe('supported');
      svc.services?.takeSample(SKYLINK_SERVICE, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('alternative', {
          verified: { value: run?.id ?? '' },
          modem: { value: svc.plant.getPartMode('vsat-modem') },
          energy: energy(svc),
          unavailable: { value: S11_TRANSFER_CARD.id },
        })
      );
    },
    's15-submit-referral': () => {
      svc.services?.takeSample(SKYLINK_SERVICE, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('incident', {
          classification: { value: 'suspected-interference' },
          source: { value: 'not-established' },
          available: value(svc, SKYLINK_SERVICE, 'application'),
          unavailable: { value: S11_TRANSFER_CARD.id },
          open: { value: 'source-and-cause' },
          evidence: { cites: obsIds(svc) },
        })
      );
      expect(svc.records?.equipment?.submitCorrection(S15_REFERRAL)?.ok).toBe(true);
      tick(2);
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(15);
  states.clear();
  localStorage.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M27 S15 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order and leaves the unit record and the SkyLink service intact', () => {
    const svc = bootScenario(data);
    const before = svc.records?.equipment?.getRecord('rautala-eurosat');
    const done = driveObjectives(data, svc, states, acts(svc), {});
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.records?.equipment?.getRecord('rautala-eurosat')).toEqual(before);
    expect(svc.records?.equipment?.getRequest(S15_REFERRAL)?.status).toBe('approved');
    expect(svc.plant.getPartMode('vsat-modem')).toBe('standby');
  });

  it('never freezes the scenario clock', () => {
    expect(data.objectives.some((o) => o.freezesScenarioTimer)).toBe(false);
  });

  it('starts the anomaly only when the first objective is live, and only EuroSat drops', () => {
    const svc = bootScenario(data);
    tick(60);
    expect(svc.services?.latest(EUS, 'registration')?.value ?? 'up').toBe('up');
    expect(svc.services?.history(EUS).length).toBe(0);
    states.set('s15-record-anomaly', { isActive: true, isCompleted: false });
    tick(20);
    expect(svc.services?.takeSample(EUS, 'registration', 'terminal-app').value).toBe('down');
    expect(svc.services?.takeSample(EUS, 'local', 'local-probe').value).toBe('up');
    expect(svc.services?.takeSample(SKYLINK_SERVICE, 'application', 'endpoint-report').value).toBe('up');
    expect(svc.services?.history(SKYLINK_SERVICE).filter((e) => e.to === 'down')).toEqual([]);
    expect(S15_EVENT_ONSET).toBe('s15-eurosat-onset');
  });

  it('does not accept one interruption as the pattern, or a quiet provider as proof', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-record-anomaly' });
    states.set('s15-review-evidence', { isActive: true, isCompleted: false });
    svc.services?.takeSample(EUS, 'provider', 'provider-portal');
    const missing = incomplete(svc, 's15-review-evidence').join('|');
    expect(missing).toContain('Repeated EuroSat interruptions');
    expect(missing).toContain('Antenna feed, cables and power checked');
    const res = svc.records?.submit('evidence', {
      pattern: { cites: obsIds(svc) },
      provider: value(svc, EUS, 'provider'),
      local: { value: 'ruled-out' },
      limits: { value: 'interference-proven' },
    });
    expect(res?.ok).toBe(false);
  });

  it('rejects a named source, an unexplained-outage label and an under-cited assessment', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-review-evidence' });
    states.set('s15-assess-confidence', { isActive: true, isCompleted: false });
    fileHypothesis(svc, 'named-source', obsIds(svc));
    fileHypothesis(svc, 'unexplained-outage', obsIds(svc));
    fileHypothesis(svc, 'suspected-interference', obsIds(svc).slice(0, 2));
    expect(incomplete(svc, 's15-assess-confidence').join('|')).toContain('Suspected interference filed');
    const named = svc.records?.submit('assessment', {
      classification: { value: 'suspected-interference' },
      confidence: { value: 'moderate' },
      source: { value: 'nearby-transmitter' },
      basis: { cites: obsIds(svc) },
    });
    expect(named?.ok).toBe(false);
    const outage = svc.records?.submit('assessment', {
      classification: { value: 'unexplained-outage' },
      confidence: { value: 'moderate' },
      source: { value: 'not-established' },
      basis: { cites: obsIds(svc) },
    });
    expect(outage?.ok).toBe(false);
    fileHypothesis(svc, 'suspected-interference', obsIds(svc));
    expect(incomplete(svc, 's15-assess-confidence').join('|')).not.toContain('Suspected interference filed');
  });

  it('keeps both terminals running from passing the reserve check, and a standby modem passes it', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-preserve-package' });
    states.set('s15-maintain-supported-work', { isActive: true, isCompleted: false });
    tick(2);
    expect(svc.plant.forecast({}).meetsReserve).toBe(false);
    expect(incomplete(svc, 's15-maintain-supported-work').join('|')).toContain('Forecast keeps the 150 Wh reserve');
    svc.plant.setPartMode('vsat-modem', 'standby');
    tick(2);
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
  });

  it('does not let the EuroSat transfer task stand in for the alternative workload', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-preserve-package' });
    states.set('s15-maintain-supported-work', { isActive: true, isCompleted: false });
    svc.plant.setPartMode('vsat-modem', 'standby');
    tick(2);
    const start = svc.workloads?.start(S11_TRANSFER_CARD.id, EUS);
    const run = start?.ok ? svc.workloads?.waitForRun(start.run.id) : undefined;
    expect(run?.status).not.toBe('supported');
    expect(incomplete(svc, 's15-maintain-supported-work').join('|')).toContain('First task verified on SkyLink');
  });

  it('restores a checkpoint taken after the assessment and finishes from it', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-assess-confidence' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(2);
    expect(again.records?.isHandoverValid('assessment')).toBe(true);
    expect(again.services?.history(EUS).filter((e) => e.layer === 'registration' && e.to === 'down').length).toBeGreaterThanOrEqual(2);
    const done = driveObjectives(data, again, states, acts(again), { startAt: 's15-preserve-package' });
    expect(done).toEqual(['s15-preserve-package', 's15-maintain-supported-work', 's15-submit-referral']);
  });

  it('files an optional C5 referral that names no source, and falls back without a C6 record', () => {
    // No C6 record and no completion: C5 gets the canonical fallback
    expect(loadC5Referral()).toEqual(C5_REFERRAL_FALLBACK);
    expect(loadC5Referral().source).toBe('fallback');
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), {});
    const record = svc.records?.recordsFor('incident')[0];
    expect(record).toBeDefined();
    const referral = fileC5Referral(record as NonNullable<typeof record>);
    expect(referral.source).toBe('player');
    expect(loadC5Referral().statements).toEqual(referral.statements);
    const text = JSON.stringify([referral.statements, referral.unresolved, record?.lines]).toLowerCase();
    for (const word of ['coordinates', 'latitude', 'longitude', 'located', 'jammer at', 'caused by']) {
      expect(text).not.toContain(word);
    }
    expect(text).toMatch(/not[- ]established/u);
    // C5 continuity is optional: the scenario's own conditions never read the campaign store
    expect(JSON.stringify(data.objectives)).not.toContain('CampaignDocumentStore');
  });
});
