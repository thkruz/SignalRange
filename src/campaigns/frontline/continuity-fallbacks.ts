/**
 * @file Campaign 6 continuity links and canonical fallback records
 * @description A later frontline scenario that reads an earlier scenario's filed record (S3 reads the S1
 * baseline, S11 the S10 evidence package, S16 the S15 incident) must work without a previous save. Each link
 * names the sending form, which filing is read (explicitly `latest`, package B's selection contract), the
 * value-bearing fields and how to word them, and an authored fallback with the SAME keys as the real form.
 * The receiving scenario lists the spec in `plant.incoming`; the service resolves it at scenario load and the
 * handover panel shows it with its provenance (player filing or authored fallback).
 *
 * The S15 incident also feeds Campaign 5 as an optional referral: it needs no C6 completion, carries the
 * classification the player actually filed (suspected interference OR unexplained outage) and never a source.
 *
 * Fallback and form keys are checked against the real forms in test/scenarios/campaign-continuity.test.ts.
 */

import type { HandoverRecord } from '@app/physical/field-records';
import type { IncomingRecordSpec } from '@app/physical/incoming-types';
import { CampaignDocumentStore, type CampaignReferral } from '@app/scenarios/campaign-document-store';

export const FRONTLINE_CAMPAIGN_ID = 'frontline';

export interface ContinuityLink {
  /** Scenario that files the record */
  scenarioId: string;
  /** Handover form id inside that scenario */
  formId: string;
  fallback: HandoverRecord;
  /** What the receiving scenario loads and shows */
  spec: IncomingRecordSpec;
}

const fallbackRecord = (
  scenarioId: string,
  formId: string,
  title: string,
  section: string,
  values: Record<string, string | number>,
  lineLabels: Record<string, string>
): HandoverRecord => ({
  id: `fallback:${scenarioId}:${formId}`,
  formId,
  title,
  section,
  submittedAtS: 0,
  values,
  citations: {},
  lines: Object.entries(values).map(([key, value]) => `${lineLabels[key] ?? key}: ${value}`),
});

const LAYER = { up: 'Up', degraded: 'Degraded', down: 'Down', unknown: 'Unknown' };

const link = (spec: Omit<IncomingRecordSpec, 'campaignId' | 'select' | 'fallback'>, fallbackValues: Record<string, string | number>, section: string): ContinuityLink => {
  const labels = Object.fromEntries(spec.fields.map((f) => [f.key, f.label]));
  const fallback = fallbackRecord(spec.scenarioId, spec.formId, spec.title, section, fallbackValues, labels);

  return {
    scenarioId: spec.scenarioId,
    formId: spec.formId,
    fallback,
    // 'latest' = the last accepted filing the player left (CampaignDocumentStore.getHandover), stated so each consumer's choice is visible
    spec: { ...spec, campaignId: FRONTLINE_CAMPAIGN_ID, select: 'latest', fallback },
  };
};

/** S1 healthy baseline, read by S3 (C6-S3-BASELINE-COMPARE) */
export const S1_BASELINE_LINK: ContinuityLink = link(
  {
    id: 's1-baseline',
    title: 'Healthy baseline from the earlier exercise',
    scenarioId: 'frontline-scenario1',
    formId: 'baseline',
    fromLabel: 'Exercise 1',
    note: 'What the healthy kit read at the time. It says nothing about the kit today; take current readings to compare.',
    fields: [
      { key: 'service', label: 'Service checked', labels: { skylink: 'SkyLink', 'camp-vsat': 'Camp reference VSAT', both: 'Both connections' } },
      { key: 'energy', label: 'Stored energy (Wh)' },
      { key: 'power', label: 'Terminal power', labels: LAYER },
      { key: 'local', label: 'Local network', labels: LAYER },
      { key: 'registration', label: 'Registration', labels: LAYER },
    ],
  },
  { service: 'skylink', energy: 900, power: 'up', local: 'up', registration: 'up' },
  'Baseline'
);

/** S10 evidence package and capability request, read by S11. Form id is `package`; `s10-alternative-equipment` is the separate correction request. */
export const S10_PACKAGE_LINK: ContinuityLink = link(
  {
    id: 's10-package',
    title: 'Evidence package behind the equipment request',
    scenarioId: 'frontline-scenario10',
    formId: 'package',
    fromLabel: 'Exercise 10',
    note: 'What the post sent when it asked for more capability. The delivery and the new terminal still have to be checked here.',
    fields: [
      { key: 'notice', label: 'Provider notice', labels: { 's10-capacity-notice': 'Ground-capacity notice', 'no-notice': 'No provider notice was received' } },
      { key: 'supported', label: 'Work still supported', labels: { 'fwd-feed': 'Camera feed task', 'fwd-report': 'Status report task' } },
      { key: 'gap', label: 'Unmet capability', labels: { 'fwd-feed': 'Camera feed task', 'fwd-report': 'Status report task' } },
    ],
  },
  { notice: 's10-capacity-notice', supported: 'fwd-report', gap: 'fwd-feed' },
  'Equipment request'
);
/** Earlier name, kept for callers; the form is `package`, not `request` */
export const S10_REQUEST_LINK = S10_PACKAGE_LINK;

const INCIDENT_WORK = { 'fwd-transfer': 'Transfer task over EuroSat', 'fwd-first': 'First task over SkyLink' };

/** S15 incident, read by S16 (C6-S16-SHIFT-BRIEF). The classification may be suspected interference OR an unexplained outage. */
export const S15_INCIDENT_LINK: ContinuityLink = link(
  {
    id: 's15-incident',
    title: 'Incident handed over from the earlier shift',
    scenarioId: 'frontline-scenario15',
    formId: 'incident',
    fromLabel: 'Exercise 15',
    note: 'What the earlier shift filed about the EuroSat interruptions. It is history: confirm service and power this shift before relying on any of it.',
    fields: [
      {
        key: 'classification',
        label: 'Classification',
        labels: { 'suspected-interference': 'Suspected interference', 'unexplained-outage': 'Unexplained outage' },
      },
      { key: 'source', label: 'Source', labels: { 'not-established': 'Not established' } },
      { key: 'available', label: 'SkyLink application when filed', labels: LAYER },
      { key: 'unavailable', label: 'Work still unavailable', labels: INCIDENT_WORK },
      { key: 'open', label: 'Open questions', labels: { 'source-and-cause': 'Where it comes from and what causes it', 'which-terminal': 'Which terminal was affected' } },
    ],
  },
  { classification: 'suspected-interference', source: 'not-established', available: 'up', unavailable: 'fwd-transfer', open: 'source-and-cause' },
  'Incident'
);

export const C5_REFERRAL_ID = 'frontline-s15-incident';

/** Fallback C5 starting evidence. Establishes no source location. */
export const C5_REFERRAL_FALLBACK: CampaignReferral = {
  id: C5_REFERRAL_ID,
  version: 1,
  fromCampaign: FRONTLINE_CAMPAIGN_ID,
  toCampaign: 'signal-hunter',
  title: 'Forward post service incident',
  classification: 'suspected-interference',
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

const CLASS_STATEMENT: Record<string, string> = {
  'suspected-interference': 'The registration losses fit interference. Nothing in the record establishes it.',
  'unexplained-outage': 'The registration losses were filed as an outage. The post could not establish a cause.',
};
const OPEN_QUESTIONS: Record<string, string[]> = {
  'source-and-cause': ['What caused the degradation.', 'Whether it will recur.'],
  'which-terminal': ['Which terminal was affected.', 'Whether it will recur.'],
};

/**
 * Build the C5 referral from the player's incident record: a bounded mapping of the typed answers (never the
 * free-form lines). A record without a known classification gives the authored statements.
 */
export function buildC5Referral(incident: HandoverRecord): CampaignReferral {
  const v = (incident?.values ?? {}) as Record<string, string | number>;
  const cls = typeof v.classification === 'string' ? v.classification : undefined;
  if (!cls || !CLASS_STATEMENT[cls]) {
    return { ...C5_REFERRAL_FALLBACK, source: 'player' };
  }
  const work = typeof v.unavailable === 'string' ? INCIDENT_WORK[v.unavailable as keyof typeof INCIDENT_WORK] : undefined;
  const statements = [
    CLASS_STATEMENT[cls],
    'Source: not established.',
    ...(v.available === 'up' ? ['One service stayed up on the same equipment.'] : []),
    ...(work ? [`Work that stayed unavailable: ${work}.`] : []),
    'The evidence package was saved before any configuration change.',
  ];

  return {
    ...C5_REFERRAL_FALLBACK,
    classification: cls,
    statements,
    unresolved: OPEN_QUESTIONS[String(v.open)] ?? C5_REFERRAL_FALLBACK.unresolved,
    source: 'player',
  };
}

CampaignDocumentStore.registerReferralBuilder(C5_REFERRAL_ID, buildC5Referral);

/** File the S15 referral for C5 from the player's incident record. (The service files it itself when the incident form is accepted.) */
export function fileC5Referral(incident: HandoverRecord): CampaignReferral {
  const referral = buildC5Referral(incident);
  CampaignDocumentStore.saveReferral(referral);

  return referral;
}

export const loadC5Referral = (): CampaignReferral => CampaignDocumentStore.getReferralOrFallback(C5_REFERRAL_ID, C5_REFERRAL_FALLBACK);
