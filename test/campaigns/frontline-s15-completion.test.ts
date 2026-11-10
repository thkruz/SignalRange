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
import { entryMatches } from '@app/physical/evidence-predicates';
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

/** Tick on the 1 s UI cadence until the EuroSat registration truth reads the wanted state (a player watching the app) */
function waitReg(svc: PhysicalPlantService, want: 'up' | 'down', maxS = 240): void {
  for (let i = 0; i < maxS && svc.services?.layers(EUS).find((l) => l.layer === 'registration')?.status !== want; i++) tick(1);
}

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
      // The first loss window starts 15 s after activation and lasts 35 to 40 s
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
      // The path recovers, then the next loss window opens: one reading of each, in separate windows
      waitReg(svc, 'up');
      svc.services?.takeSample(EUS, 'registration', 'terminal-app');
      waitReg(svc, 'down');
      svc.services?.takeSample(EUS, 'registration', 'terminal-app');
      svc.services?.takeSample(EUS, 'local', 'local-probe');
      svc.services?.takeSample(EUS, 'local', 'local-probe');
      svc.plant.goOutside();
      svc.plant.inspect('vsat-feed');
      svc.plant.inspect('vsat-ifl:lnb');
      svc.plant.inspect('vsat-ifl:modem');
      svc.plant.returnInside();
      svc.plant.inspect('power-station');
      waitReg(svc, 'up');
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
          classification: { value: 'suspected-interference', cites: obsIds(svc) },
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
          classification: { value: 'suspected-interference', cites: obsIds(svc) },
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
  it('stamps the onset event for a check made right after a clock jump, before the next UPDATE tick', () => {
    const svc = bootScenario(data);
    states.set('s15-record-anomaly', { isActive: true, isCompleted: false });
    tick(1);
    SimClock.skip(30_000);
    expect(svc.events?.firedAtS(S15_EVENT_ONSET)).toBeNull();
    // No UPDATE was emitted: the handover check itself must bring the simulation up to the clock
    const res = svc.records?.validate('anomaly', {});
    const onset = (svc.evidence?.entries('result') ?? []).some((e) => e.source && 'eventId' in e.source && e.source.eventId === S15_EVENT_ONSET);
    expect(onset, JSON.stringify(res?.fields.find((f) => f.key === 'onset'))).toBe(true);
  });

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

  it('rejects a named source, a wrong target and an under-cited assessment, and accepts an evidence-backed unexplained outage', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-review-evidence' });
    states.set('s15-assess-confidence', { isActive: true, isCompleted: false });
    fileHypothesis(svc, 'named-source', obsIds(svc));
    fileHypothesis(svc, 'suspected-interference', obsIds(svc).slice(0, 1));
    svc.evidence?.addHypothesis({
      subject: 'vsat-modem',
      source: {},
      facts: [],
      text: 'wrong target',
      claim: { scope: 'part', targetId: 'vsat-modem', cause: 'unexplained-outage' },
      confidence: 'medium',
      citedEntryIds: obsIds(svc),
    });
    expect(incomplete(svc, 's15-assess-confidence').join('|')).toContain('Assessment filed on EuroSat');
    const named = svc.records?.submit('assessment', {
      classification: { value: 'suspected-interference', cites: obsIds(svc) },
      confidence: { value: 'moderate' },
      source: { value: 'nearest-transmitter' },
      basis: { cites: obsIds(svc) },
    });
    expect(named?.ok).toBe(false);
    const provider = svc.records?.submit('assessment', {
      classification: { value: 'provider-fault', cites: obsIds(svc) },
      confidence: { value: 'moderate' },
      source: { value: 'not-established' },
      basis: { cites: obsIds(svc) },
    });
    expect(provider?.ok).toBe(false);
    const outage = svc.records?.submit('assessment', {
      classification: { value: 'unexplained-outage', cites: obsIds(svc) },
      confidence: { value: 'low' },
      source: { value: 'not-established' },
      basis: { cites: obsIds(svc) },
    });
    ok(outage);
    fileHypothesis(svc, 'unexplained-outage', obsIds(svc));
    expect(incomplete(svc, 's15-assess-confidence').join('|')).not.toContain('Assessment filed on EuroSat');
  });

  it('records the cause of a registration reading, so only a link-lost reading is the EuroSat drop', () => {
    const svc = bootScenario(data);
    states.set('s15-record-anomaly', { isActive: true, isCompleted: false });
    tick(20);
    const drop = svc.services?.takeSample(EUS, 'registration', 'terminal-app');
    expect(drop?.value).toBe('down');
    expect(drop?.cause).toBe('link-lost');
    const entry = svc.evidence?.entries('observation').find((e) => e.source.sampleId === drop?.id);
    const predicate = { kind: 'observation' as const, serviceId: EUS, layer: 'registration', valueIn: ['down'], causeIn: ['link-lost'] };
    const ctx = { eventFiredAtS: () => 0 };
    expect(entry && entryMatches(entry, predicate, ctx, [])).toBe(true);
    // A modem-reboot reading is down for another cause and does not count; an older entry with no cause still loads and counts
    const reboot = entry && { ...entry, sample: { ...(entry.sample as NonNullable<typeof entry.sample>), cause: 'terminal-booting' } };
    expect(reboot && entryMatches(reboot, predicate, ctx, [])).toBe(false);
    const old = entry && { ...entry, sample: { ...(entry.sample as NonNullable<typeof entry.sample>), cause: undefined } };
    expect(old && entryMatches(old, predicate, ctx, [])).toBe(true);
  });

  it('does not take three SkyLink readings, or a pre-incident reading, as the EuroSat interruption pattern', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-record-anomaly' });
    states.set('s15-review-evidence', { isActive: true, isCompleted: false });
    const before = obsIds(svc).length;
    svc.services?.takeSample(SKYLINK_SERVICE, 'application', 'endpoint-report');
    svc.services?.takeSample(SKYLINK_SERVICE, 'local', 'local-probe');
    svc.services?.takeSample(SKYLINK_SERVICE, 'registration', 'terminal-app');
    const skylinkOnly = obsIds(svc).slice(before);
    const res = svc.records?.validate('evidence', {
      pattern: { cites: skylinkOnly },
      provider: value(svc, EUS, 'provider'),
      local: { value: 'ruled-out' },
      limits: { value: 'not-proof' },
    });
    expect(res?.fields.find((f) => f.key === 'pattern')?.ok).toBe(false);
    const repeated = skylinkOnly.length ? [skylinkOnly[0], skylinkOnly[0], skylinkOnly[0]] : [];
    expect(svc.records?.validate('evidence', { pattern: { cites: repeated } })?.fields.find((f) => f.key === 'pattern')?.ok).toBe(false);
  });

  it('counts one credit per checked subject and ignores checks of unrelated parts', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-record-anomaly' });
    states.set('s15-review-evidence', { isActive: true, isCompleted: false });
    svc.plant.goOutside();
    svc.plant.inspect('vsat-feed');
    svc.plant.inspect('vsat-feed');
    svc.plant.inspect('vsat-feed');
    svc.plant.returnInside();
    expect(incomplete(svc, 's15-review-evidence').join('|')).toContain('Checks that found nothing');
    svc.plant.inspect('power-station');
    expect(incomplete(svc, 's15-review-evidence').join('|')).not.toContain('Checks that found nothing');
  });

  it('accepts suspected interference once repeated drops are read, and rejects it on a single drop', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's15-review-evidence' });
    const cites = obsIds(svc);
    const base = { confidence: { value: 'moderate' }, source: { value: 'not-established' }, basis: { cites } };
    ok(svc.records?.submit('assessment', { ...base, classification: { value: 'suspected-interference', cites } }));
    const down = (svc.evidence?.entries('observation') ?? []).filter((e) => e.sample?.layer === 'registration' && e.sample.value === 'down').map((e) => e.id);
    expect(down.length).toBeGreaterThanOrEqual(2);
    const single = svc.records?.validate('assessment', {
      ...base,
      classification: { value: 'suspected-interference', cites: [...obsIds(svc).filter((id) => !down.includes(id)), down[0]] },
    });
    expect(single?.fields.find((f) => f.key === 'classification')?.ok).toBe(false);
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
    // Accepting the incident filed the referral by itself, from the typed answers
    expect(loadC5Referral().source).toBe('player');
    expect(loadC5Referral().classification).toBe(record?.values.classification);
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
