/**
 * @file Campaign 6 canonical fallback records
 * @description A later frontline scenario that reads an earlier scenario's
 * filed record (S3 reads the S1 baseline, S11 the S10 request, S16 the S15
 * incident) must work without a previous save. These are the equivalent
 * starting records. The S15 referral for Campaign 5 is optional continuity:
 * it neither requires C6 completion nor names a source location.
 */

import type { HandoverRecord } from '@app/physical/field-records';
import { CampaignDocumentStore, type CampaignReferral } from '@app/scenarios/campaign-document-store';

export const FRONTLINE_CAMPAIGN_ID = 'frontline';

export interface ContinuityLink {
  /** Scenario that files the record */
  scenarioId: string;
  /** Handover form id inside that scenario */
  formId: string;
  fallback: HandoverRecord;
}

const fallbackRecord = (scenarioId: string, formId: string, title: string, section: string, values: Record<string, string | number>): HandoverRecord => ({
  id: `fallback:${scenarioId}:${formId}`,
  formId,
  title,
  section,
  submittedAtS: 0,
  values,
  citations: {},
  lines: Object.entries(values).map(([key, value]) => `${key}: ${value}`),
});

/** S1 healthy baseline, read by S3 (C6-S3-BASELINE-COMPARE) */
export const S1_BASELINE_LINK: ContinuityLink = {
  scenarioId: 'frontline-scenario1',
  formId: 'baseline',
  fallback: fallbackRecord('frontline-scenario1', 'baseline', 'Healthy baseline', 'Baseline', {
    'Terminal power': 'steady, within normal draw',
    Registration: 'registered on the account',
    Application: 'reachable, normal response',
  }),
};

/** S10 request, read by S11 (C6-S08-ASSESSMENT-BRIEF family) */
export const S10_REQUEST_LINK: ContinuityLink = {
  scenarioId: 'frontline-scenario10',
  formId: 'request',
  fallback: fallbackRecord('frontline-scenario10', 'request', 'Capability request', 'Request', {
    Request: 'Add a second terminal link for the forward post',
    'Needed by': 'next shift',
  }),
};

/** S15 incident, read by S16 (C6-S16-SHIFT-BRIEF) */
export const S15_INCIDENT_LINK: ContinuityLink = {
  scenarioId: 'frontline-scenario15',
  formId: 'incident',
  fallback: fallbackRecord('frontline-scenario15', 'incident', 'Preserved incident package', 'Incident', {
    'Service still available': 'the unaffected link',
    'Work unavailable': 'the affected link',
    Classification: 'bounded: interference suspected, source not established',
  }),
};

export const C5_REFERRAL_ID = 'frontline-s15-incident';

/** Fallback C5 starting evidence. Establishes no source location. */
export const C5_REFERRAL_FALLBACK: CampaignReferral = {
  id: C5_REFERRAL_ID,
  version: 1,
  fromCampaign: FRONTLINE_CAMPAIGN_ID,
  toCampaign: 'signal-hunter',
  title: 'Forward post service incident',
  statements: [
    'One service degraded while a second stayed up on the same equipment.',
    'The evidence package was saved before any configuration change.',
    'An alternative workload was verified on the service that stayed up.',
  ],
  unresolved: ['What caused the degradation.', 'Whether it will recur.'],
  source: 'fallback',
};

export function resolveContinuity(link: ContinuityLink) {
  return CampaignDocumentStore.getHandoverOrFallback(FRONTLINE_CAMPAIGN_ID, link.scenarioId, link.formId, link.fallback);
}

/** File the S15 referral for C5 from the player's incident record. */
export function fileC5Referral(incident: HandoverRecord): CampaignReferral {
  const referral: CampaignReferral = {
    ...C5_REFERRAL_FALLBACK,
    statements: incident.lines.length ? incident.lines : C5_REFERRAL_FALLBACK.statements,
    source: 'player',
  };
  CampaignDocumentStore.saveReferral(referral);
  return referral;
}

export const loadC5Referral = (): CampaignReferral => CampaignDocumentStore.getReferralOrFallback(C5_REFERRAL_ID, C5_REFERRAL_FALLBACK);
