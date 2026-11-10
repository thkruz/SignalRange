/**
 * Package C: campaign continuity. S3 reads the S1 baseline, S11 the S10 evidence package, S16 the S15 incident.
 * For each consumer the player-record path and the authored-fallback path are driven through the real service
 * (no helper does the loading on the app's behalf), and a checkpoint round trip keeps the loaded record.
 */

import {
  buildC5Referral,
  C5_REFERRAL_FALLBACK,
  FRONTLINE_CAMPAIGN_ID,
  loadC5Referral,
  S1_BASELINE_LINK,
  S10_PACKAGE_LINK,
  S15_INCIDENT_LINK,
} from '@app/campaigns/frontline/continuity-fallbacks';
import { FORWARD_FIRST_CARD } from '@app/campaigns/frontline/forward-field-config';
import { frontlineScenario1Data } from '@app/campaigns/frontline/scenario1';
import { frontlineScenario3Data } from '@app/campaigns/frontline/scenario3';
import { frontlineScenario10Data } from '@app/campaigns/frontline/scenario10';
import { frontlineScenario11Data } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario15Data } from '@app/campaigns/frontline/scenario15';
import { frontlineScenario16Data } from '@app/campaigns/frontline/scenario16';
import { EventBus } from '@app/events/event-bus';
import type { HandoverRecord } from '@app/physical/field-records';
import { PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { CampaignDocumentStore } from '@app/scenarios/campaign-document-store';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario } from './frontline-completion-support';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ objectivesManager: { getObjectiveState: () => undefined } }), hasInstance: () => true, destroy: () => undefined },
}));

const rec = (formId: string, scenarioId: string, at: number, values: Record<string, string | number>): HandoverRecord => ({
  id: `${scenarioId}:${formId}:${at}`,
  formId,
  title: formId,
  section: formId,
  submittedAtS: at,
  values,
  citations: {},
  lines: Object.entries(values).map(([k, v]) => `${k}: ${v}`),
});

function seed(scenarioId: string, number: number, handovers: HandoverRecord[]): void {
  CampaignDocumentStore.upsertRecord(FRONTLINE_CAMPAIGN_ID, {
    scenarioId,
    number,
    title: scenarioId,
    documentTitle: 'Record',
    completedAt: '2026-11-01T10:00:00.000Z',
    entries: [],
    destroyedEvidence: [],
    handovers,
  });
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(7);
  localStorage.clear();
  CampaignDocumentStore.beginRun();
});
afterEach(() => {
  Service.destroy();
  EventBus.destroy();
  localStorage.clear();
});

const SENDERS = { 1: frontlineScenario1Data, 10: frontlineScenario10Data, 15: frontlineScenario15Data } as Record<number, never>;
const baselineValues = { service: 'both', energy: 1200, power: 'up', local: 'degraded', registration: 'up' };
const incoming = (svc: Service, id: string) => svc.records?.incoming().find((r) => r.id === id);

describe('continuity links name the real forms', () => {
  it('fallback keys equal the fields of the sending form, S10 reads the package form', () => {
    const forms = (data: { settings?: { physicalPlant?: { handovers?: Array<{ id: string; fields: Array<{ key: string; rule: object }> }> } } }) =>
      data.settings?.physicalPlant?.handovers ?? [];
    expect(S10_PACKAGE_LINK.formId).toBe('package');
    expect(S10_PACKAGE_LINK.formId).not.toBe('request');
    for (const [link, number] of [
      [S1_BASELINE_LINK, 1],
      [S10_PACKAGE_LINK, 10],
      [S15_INCIDENT_LINK, 15],
    ] as const) {
      expect(link.spec.select).toBe('latest');
      const scenario = SENDERS[number];
      const form = forms(scenario).find((f) => f.id === link.formId);
      expect(form, `${link.formId} exists in S${number}`).toBeDefined();
      const valueKeys = (form?.fields ?? []).filter((f) => !('evidence' in f.rule)).map((f) => f.key);
      for (const f of link.spec.fields) expect(valueKeys).toContain(f.key);
      for (const f of link.spec.fields) expect(link.fallback.values).toHaveProperty(f.key);
    }
  });
});

describe('S3 reads the S1 baseline', () => {
  it('shows the authored record, labelled, when the player has none', () => {
    const svc = bootScenario(frontlineScenario3Data);
    const r = incoming(svc, 's1-baseline');
    expect(r?.source).toBe('fallback');
    expect(r?.provenance).toMatch(/Authored reference record/u);
    expect(r?.rows.map((x) => x.key)).toEqual(['service', 'energy', 'power', 'local', 'registration']);
  });

  it("shows the player's latest accepted filing, not the first", () => {
    seed('frontline-scenario1', 1, [rec('baseline', 'frontline-scenario1', 100, { ...baselineValues, energy: 800 }), rec('baseline', 'frontline-scenario1', 900, baselineValues)]);
    const svc = bootScenario(frontlineScenario3Data);
    const r = incoming(svc, 's1-baseline');
    expect(r?.source).toBe('player');
    expect(r?.provenance).toMatch(/Your filing from Exercise 1/u);
    expect(r?.values.energy).toBe(1200);
    expect(r?.rows.find((x) => x.key === 'local')?.text).toBe('Degraded');
  });

  it('does not change what S3 grades: the comparison answer is authored, not the incoming record', () => {
    seed('frontline-scenario1', 1, [rec('baseline', 'frontline-scenario1', 100, { ...baselineValues, registration: 'down' })]);
    const svc = bootScenario(frontlineScenario3Data);
    const res = svc.records?.submit('comparison', { changed: { value: 'power-and-local' }, unchanged: { value: 'registration' }, evidence: { cites: [] } });
    expect(res?.ok).toBe(false);
  });

  it('survives a malformed or partial stored record by using the authored one', () => {
    localStorage.setItem(`signalrange.campaign.${FRONTLINE_CAMPAIGN_ID}`, '{"campaignId":"frontline","scenarios":[{"scenarioId":"frontline-scenario1","handovers":"oops"}]}');
    seed('frontline-scenario1', 1, [rec('baseline', 'frontline-scenario1', 100, { service: 'skylink' })]);
    const svc = bootScenario(frontlineScenario3Data);
    expect(incoming(svc, 's1-baseline')?.source).toBe('fallback');
  });
});

describe('S11 reads the S10 package', () => {
  it('uses the authored package when S10 was skipped', () => {
    const svc = bootScenario(frontlineScenario11Data);
    const r = incoming(svc, 's10-package');
    expect(r?.source).toBe('fallback');
    expect(r?.values).toEqual({ notice: 's10-capacity-notice', supported: 'fwd-report', gap: 'fwd-feed' });
  });

  it('uses the package form, not the separate alternative-equipment request', () => {
    seed('frontline-scenario10', 10, [
      rec('s10-alternative-equipment', 'frontline-scenario10', 50, { notice: 'no-notice', supported: 'fwd-feed', gap: 'fwd-report' }),
      rec('package', 'frontline-scenario10', 80, { notice: 'no-notice', supported: 'fwd-feed', gap: 'fwd-report' }),
    ]);
    const svc = bootScenario(frontlineScenario11Data);
    const r = incoming(svc, 's10-package');
    expect(r?.source).toBe('player');
    expect(r?.rows.find((x) => x.key === 'notice')?.text).toBe('No provider notice was received');
  });
});

describe('S16 reads the S15 incident', () => {
  const brief = (prior: string) => ({
    task: { value: FORWARD_FIRST_CARD.id },
    reserve: { value: 'reserve-200' },
    equipment: { value: 'both-terminals' },
    prior: { value: prior },
    unknowns: { value: 'service-and-power' },
  });
  const incident = (classification: string) =>
    rec('incident', 'frontline-scenario15', 70, { classification, source: 'not-established', available: 'up', unavailable: 'fwd-transfer', open: 'which-terminal' });

  it('falls back to suspected interference and accepts that prior-incident answer', () => {
    const svc = bootScenario(frontlineScenario16Data);
    expect(incoming(svc, 's15-incident')?.source).toBe('fallback');
    expect(svc.records?.submit('brief', brief('outage-cause-not-established'))?.ok).toBe(false);
    expect(svc.records?.submit('brief', brief('source-not-established'))?.ok, 'fallback classification').toBe(true);
  });

  it('follows an unexplained-outage classification the player filed', () => {
    seed('frontline-scenario15', 15, [incident('unexplained-outage')]);
    const svc = bootScenario(frontlineScenario16Data);
    expect(incoming(svc, 's15-incident')?.rows.find((x) => x.key === 'classification')?.text).toBe('Unexplained outage');
    expect(svc.records?.submit('brief', brief('source-not-established'))?.ok).toBe(false);
    expect(svc.records?.submit('brief', brief('outage-cause-not-established'))?.ok).toBe(true);
  });

  it('follows a suspected-interference classification the player filed', () => {
    seed('frontline-scenario15', 15, [incident('suspected-interference')]);
    const svc = bootScenario(frontlineScenario16Data);
    expect(incoming(svc, 's15-incident')?.source).toBe('player');
    expect(svc.records?.submit('brief', brief('source-not-established'))?.ok).toBe(true);
  });

  it('keeps the loaded record across a checkpoint, even if the store changed since', () => {
    seed('frontline-scenario15', 15, [incident('unexplained-outage')]);
    const svc = bootScenario(frontlineScenario16Data);
    expect(incoming(svc, 's15-incident')?.values.classification).toBe('unexplained-outage');
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    localStorage.clear();
    const again = bootScenario(frontlineScenario16Data);
    expect(incoming(again, 's15-incident')?.source).toBe('fallback');
    restoreManagerStates(saved);
    expect(incoming(again, 's15-incident')?.source).toBe('player');
    expect(again.records?.submit('brief', brief('outage-cause-not-established'))?.ok).toBe(true);
  });
});

describe('S15 and S16 feed Campaign 5', () => {
  it('builds a referral from either classification and never names a source', () => {
    for (const cls of ['suspected-interference', 'unexplained-outage']) {
      const r = buildC5Referral(
        rec('incident', 'frontline-scenario15', 1, { classification: cls, source: 'not-established', available: 'up', unavailable: 'fwd-first', open: 'source-and-cause' })
      );
      expect(r.classification).toBe(cls);
      expect(r.source).toBe('player');
      const text = JSON.stringify([r.statements, r.unresolved]).toLowerCase();
      expect(text).toMatch(/not[- ]established|no explanation/u);
      for (const word of ['coordinates', 'latitude', 'longitude', 'located', 'jammer at']) expect(text).not.toContain(word);
    }
    expect(buildC5Referral(rec('incident', 'x', 1, { classification: 'unexplained-outage' })).statements.join(' ')).not.toMatch(/interference/u);
  });

  it('an unusable record gives the authored statements; with nothing filed C5 reads the fallback', () => {
    expect(buildC5Referral(rec('incident', 'x', 1, { classification: 'bogus' })).statements).toEqual(C5_REFERRAL_FALLBACK.statements);
    expect(loadC5Referral()).toEqual(C5_REFERRAL_FALLBACK);
  });

  it('declares the referral on the S15 incident form only', () => {
    expect(frontlineScenario15Data.settings?.physicalPlant?.referrals).toEqual([{ formId: 'incident', referralId: 'frontline-s15-incident' }]);
    expect(frontlineScenario16Data.settings?.physicalPlant?.referrals).toBeUndefined();
  });
});
