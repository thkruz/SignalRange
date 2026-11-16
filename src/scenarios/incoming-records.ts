/**
 * @file incoming-records - Resolve the records a scenario receives from an earlier one (Campaign 6, package C)
 * @description Called when the scenario LOADS (not at module import), so a replay or a changed save is seen.
 * Uses the record-selection contract of package B explicitly: `select: 'latest'` reads the last accepted filing
 * the player left, `select: 'first'` the original. A record the player never filed, or one whose stored values
 * do not carry every field of the schema (malformed storage, an old shape), is replaced by the authored fallback
 * and labelled as such. Never writes.
 */

import type { HandoverRecord } from '@app/physical/field-records';
import type { IncomingRecord, IncomingRecordSpec, IncomingRow } from '@app/physical/incoming-types';
import { CampaignDocumentStore } from './campaign-document-store';

const isAnswer = (v: unknown): v is string | number => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/** True when the record carries a plain answer for every field of the schema */
export function fitsSchema(spec: IncomingRecordSpec, record: HandoverRecord | undefined): record is HandoverRecord {
  const values = record?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false;

  return spec.fields.every((f) => isAnswer((values as Record<string, unknown>)[f.key]));
}

function rowsOf(spec: IncomingRecordSpec, values: Record<string, string | number>): IncomingRow[] {
  return spec.fields.map((f) => {
    const raw = values[f.key];
    const stored = String(raw);

    return { key: f.key, label: f.label, text: f.labels?.[stored] ?? stored };
  });
}

function snapshot(spec: IncomingRecordSpec, record: HandoverRecord, source: 'player' | 'fallback'): IncomingRecord {
  const values: Record<string, string | number> = {};
  for (const f of spec.fields) values[f.key] = record.values[f.key];

  return {
    id: spec.id,
    title: spec.title,
    source,
    provenance: source === 'player' ? `Your filing from ${spec.fromLabel}` : `Authored reference record (no usable filing from ${spec.fromLabel} was found)`,
    note: spec.note,
    rows: rowsOf(spec, values),
    values,
  };
}

export function resolveIncoming(spec: IncomingRecordSpec): IncomingRecord {
  let filed: HandoverRecord | undefined;
  try {
    filed = CampaignDocumentStore.getSelectedHandover(spec.campaignId, spec.scenarioId, spec.formId, spec.select);
  } catch {
    filed = undefined; // malformed storage: use the authored record
  }

  return fitsSchema(spec, filed) ? snapshot(spec, filed, 'player') : snapshot(spec, spec.fallback, 'fallback');
}
