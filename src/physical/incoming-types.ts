/**
 * @file incoming-types - Records a scenario receives from an earlier one (Campaign 6, package C)
 * @description Data-only shapes. A scenario lists the records it reads (`PlantConfig.incoming`); the
 * service resolves each at scenario LOAD (player filing, or the authored fallback with the same schema)
 * and the resulting snapshot is checkpointed. An incoming record is a reference: it never proves
 * present-day service, and nothing here reads or writes the campaign store.
 */

import type { HandoverRecord } from './field-records';

/** Which accepted filing of a form is read: the last one the player left, or the original (see B's selection contract) */
export type IncomingSelection = 'latest' | 'first';

/** One value-bearing field of the sending form, with how to show it */
export interface IncomingFieldSpec {
  /** The sending form's field key (fallback records use the same keys) */
  key: string;
  label: string;
  /** Plain wording per stored answer id (an unlisted answer shows as stored) */
  labels?: Record<string, string>;
}

export interface IncomingRecordSpec {
  id: string;
  title: string;
  campaignId: string;
  scenarioId: string;
  formId: string;
  select: IncomingSelection;
  /** Which earlier exercise filed it, e.g. 'Exercise 1' */
  fromLabel: string;
  fields: IncomingFieldSpec[];
  /** The authored record used when the player has none; same schema (keys) as a real filing */
  fallback: HandoverRecord;
  /** One short line on what the record is for (never "this proves the service is up") */
  note: string;
}

export interface IncomingRow {
  key: string;
  label: string;
  text: string;
}

/** The loaded snapshot a scenario shows and checkpoints */
export interface IncomingRecord {
  id: string;
  title: string;
  source: 'player' | 'fallback';
  /** 'Your filing from Exercise 1' / 'Authored reference record (no earlier filing found)' */
  provenance: string;
  note: string;
  rows: IncomingRow[];
  /** Raw stored answers by field key, for claims that must agree with the incoming record */
  values: Record<string, string | number>;
}

/** A plant-config rule that files a cross-campaign referral when a form is accepted */
export interface ReferralRule {
  formId: string;
  referralId: string;
}
