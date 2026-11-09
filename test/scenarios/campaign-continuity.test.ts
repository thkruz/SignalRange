/**
 * M19: canonical fallbacks for Campaign 6 continuity, and proof that the shared
 * CampaignDocumentStore behaves as before for campaigns 1-5.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  C5_REFERRAL_FALLBACK,
  FRONTLINE_CAMPAIGN_ID,
  fileC5Referral,
  loadC5Referral,
  resolveContinuity,
  S1_BASELINE_LINK,
  S10_REQUEST_LINK,
  S15_INCIDENT_LINK,
} from '../../src/campaigns/frontline/continuity-fallbacks';
import type { HandoverRecord } from '../../src/physical/field-records';
import { CampaignDocumentStore } from '../../src/scenarios/campaign-document-store';

const base = (scenarioId: string, number: number, extra = {}) => ({
  scenarioId,
  number,
  title: `S${number}`,
  documentTitle: 'Record',
  completedAt: '2026-09-18T10:00:00.000Z',
  entries: [{ section: 'Window', line: 'x' }],
  destroyedEvidence: [],
  ...extra,
});

const filed: HandoverRecord = { id: 'h1', formId: 'baseline', title: 'T', section: 'S', submittedAtS: 99, values: { a: 1 }, citations: {}, lines: ['a: 1'] };

beforeEach(() => {
  localStorage.clear();
  CampaignDocumentStore.beginRun();
});
afterEach(() => localStorage.clear());

describe('frontline continuity fallbacks', () => {
  it('uses the canonical fallback when nothing was filed (no previous save)', () => {
    for (const link of [S1_BASELINE_LINK, S10_REQUEST_LINK, S15_INCIDENT_LINK]) {
      const r = resolveContinuity(link);
      expect(r.source).toBe('fallback');
      expect(r.record).toBe(link.fallback);
      expect(r.record.lines.length).toBeGreaterThan(0);
    }
  });

  it('prefers the player record once filed, and resolving never writes', () => {
    expect(localStorage.length).toBe(0);
    resolveContinuity(S1_BASELINE_LINK);
    expect(localStorage.length).toBe(0);
    CampaignDocumentStore.upsertRecord(FRONTLINE_CAMPAIGN_ID, base(S1_BASELINE_LINK.scenarioId, 1, { handovers: [filed] }));
    const r = resolveContinuity(S1_BASELINE_LINK);
    expect(r.source).toBe('player');
    expect(r.record.id).toBe('h1');
  });

  it('falls back when the scenario was filed without that form', () => {
    CampaignDocumentStore.upsertRecord(FRONTLINE_CAMPAIGN_ID, base(S1_BASELINE_LINK.scenarioId, 1, { handovers: [{ ...filed, formId: 'other' }] }));
    expect(resolveContinuity(S1_BASELINE_LINK).source).toBe('fallback');
  });

  it('C5 referral: fallback without C6 completion, versioned, names no source location', () => {
    const r = loadC5Referral();
    expect(r).toBe(C5_REFERRAL_FALLBACK);
    expect(r.version).toBe(1);
    expect(r.source).toBe('fallback');
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/location|coordinates|latitude|longitude|bearing/u);
  });

  it('C5 referral: a filed referral round-trips and a corrupt entry falls back', () => {
    const filedRef = fileC5Referral(filed);
    expect(filedRef.source).toBe('player');
    expect(loadC5Referral()).toEqual(filedRef);
    localStorage.setItem('signalrange:campaign-referral:frontline-s15-incident', '{bad');
    expect(loadC5Referral()).toBe(C5_REFERRAL_FALLBACK);
  });
});

describe('campaigns 1-5 store behaviour is unchanged', () => {
  it('stores the record exactly as before and adds no keys for other campaigns', () => {
    for (const campaign of ['nats', 'nats-eu', 'home-sdr', 'ccs', 'signal-hunter']) {
      CampaignDocumentStore.upsertRecord(campaign, base(`${campaign}-scenario2`, 2));
      CampaignDocumentStore.upsertRecord(campaign, base(`${campaign}-scenario1`, 1));
      expect(CampaignDocumentStore.load(campaign).scenarios.map((s) => s.number)).toEqual([1, 2]);
      expect(JSON.parse(localStorage.getItem(CampaignDocumentStore.storageKey(campaign)) as string)).toEqual({
        campaignId: campaign,
        scenarios: [base(`${campaign}-scenario1`, 1), base(`${campaign}-scenario2`, 2)],
      });
      expect(CampaignDocumentStore.getHandover(campaign, `${campaign}-scenario1`, 'baseline')).toBeUndefined();
    }
    expect(Object.keys(localStorage).some((k) => k.includes('campaign-referral'))).toBe(false);
  });

  it('destroyed-evidence run state still round-trips', () => {
    CampaignDocumentStore.noteDestroyedEvidence('e1');
    const snap = CampaignDocumentStore.getRunState();
    CampaignDocumentStore.beginRun();
    expect(CampaignDocumentStore.destroyedThisRun).toEqual([]);
    CampaignDocumentStore.restoreRunState(snap);
    expect(CampaignDocumentStore.destroyedThisRun).toEqual(['e1']);
    expect(CampaignDocumentStore.handoversThisRun).toEqual([]);
  });
});
