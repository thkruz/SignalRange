/**
 * @file CampaignDocumentStore - the Working Document across a campaign
 * @description Each scenario's Working Document (the `documentLine` entries a
 * player earns) lives for one scenario. This store keeps every completed
 * scenario's record per campaign so a later scenario can read it back - the
 * S22 attribution report is written from S17-S21's records, and trend
 * recognition (curriculum 10.5) needs the earlier passes' lines.
 *
 * It also remembers evidence a decision destroyed (`destroyEvidence`), so a
 * later scenario whose audit log carries that evidence forward
 * (`requiresCampaignEvidence`) finds it missing - the 13.6 lesson has a cost
 * one scenario later, not just a penalty in the moment.
 *
 * localStorage first (per campaign key). Nothing here reaches the backend; a
 * signed-in flush can be layered on later the way scores are flushed.
 */

import { Logger } from '@app/logging/logger';
import { stripDialogTokens } from '@app/modal/dialog-tokens';
import type { HandoverRecord } from '@app/physical/field-records';
import type { ScenarioData } from '@app/ScenarioData';
import type { CampaignRunSnapshot } from '@app/sync/manager-state-types';
import { EventTimeLedger } from './event-time-ledger';

export interface CampaignDocumentEntry {
  section: string;
  line: string;
}

export interface CampaignScenarioRecord {
  scenarioId: string;
  number: number;
  title: string;
  /** settings.workingDocument.title at the time of completion */
  documentTitle: string;
  completedAt: string;
  entries: CampaignDocumentEntry[];
  /** Audit-event ids a decision consequence destroyed during the run */
  destroyedEvidence: string[];
  /** Handover forms accepted during the run (Campaign 6) */
  handovers?: HandoverRecord[];
}

/** Where a continuity record came from: the player's own filing or the authored canonical fallback */
export type ContinuitySource = 'player' | 'fallback';

/** A versioned cross-campaign referral (C6 S15 to C5). Deliberately carries no source location. */
export interface CampaignReferral {
  id: string;
  version: number;
  fromCampaign: string;
  toCampaign: string;
  title: string;
  /** Plain statements the receiving campaign may show; never a source location */
  statements: string[];
  unresolved: string[];
  /** 'player' when filed by a completed scenario, 'fallback' when authored */
  source: ContinuitySource;
}

export interface CampaignDocument {
  campaignId: string;
  scenarios: CampaignScenarioRecord[];
}

const STORAGE_PREFIX = 'signalrange:campaign-document:';
const REFERRAL_PREFIX = 'signalrange:campaign-referral:';

/** The campaign a scenario belongs to, from its route (`nats-eu/scenarios/...`). */
export function campaignIdOf(scenario: Pick<ScenarioData, 'url'> | undefined): string {
  return scenario?.url?.split('/')[0] ?? 'nats';
}

/** Every documentLine a scenario can write, in objective order - "the record as filed". */
export function canonicalEntriesOf(scenario: ScenarioData): CampaignDocumentEntry[] {
  const entries: CampaignDocumentEntry[] = [];
  for (const objective of scenario.objectives ?? []) {
    for (const condition of objective.conditions ?? []) {
      const line = condition.params?.documentLine;
      if (line) entries.push({ section: condition.params?.documentSection ?? 'Notes', line: stripDialogTokens(line) });
    }
  }
  return entries;
}

export class CampaignDocumentStore {
  /** Evidence destroyed so far in the current run (reset per scenario load) */
  private static runDestroyed_ = new Set<string>();
  /** Whether the campaign record panel has been opened this run */
  private static reviewedThisRun_ = false;
  /** Handover records accepted in the current run */
  private static runHandovers_: HandoverRecord[] = [];

  static storageKey(campaignId: string): string {
    return `${STORAGE_PREFIX}${campaignId}`;
  }

  static load(campaignId: string): CampaignDocument {
    try {
      const raw = localStorage.getItem(this.storageKey(campaignId));
      if (raw) {
        const parsed = JSON.parse(raw) as CampaignDocument;
        if (parsed && Array.isArray(parsed.scenarios)) return parsed;
      }
    } catch (error) {
      Logger.warn('CampaignDocumentStore: could not read', error);
    }
    return { campaignId, scenarios: [] };
  }

  static save(doc: CampaignDocument): void {
    try {
      localStorage.setItem(this.storageKey(doc.campaignId), JSON.stringify(doc));
    } catch (error) {
      Logger.warn('CampaignDocumentStore: could not write', error);
    }
  }

  static getRecord(campaignId: string, scenarioId: string): CampaignScenarioRecord | undefined {
    return this.load(campaignId).scenarios.find((s) => s.scenarioId === scenarioId);
  }

  /** Replace (or add) a scenario's record; a replay overwrites the earlier run. */
  static upsertRecord(campaignId: string, record: CampaignScenarioRecord): void {
    const doc = this.load(campaignId);
    const others = doc.scenarios.filter((s) => s.scenarioId !== record.scenarioId);
    others.push(record);
    others.sort((a, b) => a.number - b.number);
    this.save({ campaignId, scenarios: others });
  }

  /** Whether evidence with this id was destroyed in that scenario's recorded run. */
  static wasEvidenceDestroyed(campaignId: string, scenarioId: string, auditEventId: string): boolean {
    return this.getRecord(campaignId, scenarioId)?.destroyedEvidence.includes(auditEventId) ?? false;
  }

  static clear(campaignId: string): void {
    try {
      localStorage.removeItem(this.storageKey(campaignId));
    } catch {
      /* storage unavailable */
    }
  }

  // ── Per-run state ────────────────────────────────────────────────────────

  /** Call once per scenario load. */
  static beginRun(): void {
    EventTimeLedger.begin();
    this.runDestroyed_ = new Set<string>();
    this.reviewedThisRun_ = false;
    this.runHandovers_ = [];
  }

  /** An accepted handover submission (replaces an earlier record with the same id) */
  static recordHandover(record: HandoverRecord): void {
    this.runHandovers_ = [...this.runHandovers_.filter((h) => h.id !== record.id), record];
  }

  static get handoversThisRun(): readonly HandoverRecord[] {
    return [...this.runHandovers_];
  }

  /** A completed scenario's handover record for a form, if it was filed */
  static getHandover(campaignId: string, scenarioId: string, formId: string): HandoverRecord | undefined {
    return this.getRecord(campaignId, scenarioId)?.handovers?.find((h) => h.formId === formId);
  }

  /**
   * The player's filed handover if there is one, otherwise the authored canonical
   * fallback. Never writes; a missing record is not an error (no previous save needed).
   */
  static getHandoverOrFallback(campaignId: string, scenarioId: string, formId: string, fallback: HandoverRecord): { record: HandoverRecord; source: ContinuitySource } {
    const filed = this.getHandover(campaignId, scenarioId, formId);
    return filed ? { record: filed, source: 'player' } : { record: fallback, source: 'fallback' };
  }

  /** File a cross-campaign referral. Needs no completion of the sending campaign. */
  static saveReferral(referral: CampaignReferral): void {
    try {
      localStorage.setItem(`${REFERRAL_PREFIX}${referral.id}`, JSON.stringify(referral));
    } catch (error) {
      Logger.warn('CampaignDocumentStore: could not write referral', error);
    }
  }

  /** A filed referral, or the fallback when none exists (or the stored one is unreadable). */
  static getReferralOrFallback(id: string, fallback: CampaignReferral): CampaignReferral {
    try {
      const raw = localStorage.getItem(`${REFERRAL_PREFIX}${id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CampaignReferral;
        if (parsed && parsed.id === id && typeof parsed.version === 'number' && Array.isArray(parsed.statements)) return parsed;
      }
    } catch (error) {
      Logger.warn('CampaignDocumentStore: could not read referral', error);
    }
    return fallback;
  }

  static clearReferral(id: string): void {
    try {
      localStorage.removeItem(`${REFERRAL_PREFIX}${id}`);
    } catch {
      /* storage unavailable */
    }
  }

  /** A decision consequence destroyed this evidence (recorded at completion). */
  static noteDestroyedEvidence(auditEventId: string): void {
    this.runDestroyed_.add(auditEventId);
  }
  /** Per-run state for a checkpoint (Phase 35 rt-s24-F4). */
  static getRunState(): CampaignRunSnapshot {
    return { destroyed: [...this.runDestroyed_], reviewed: this.reviewedThisRun_ };
  }

  /** Restore per-run state after beginRun(). */
  static restoreRunState(snapshot: CampaignRunSnapshot | undefined): void {
    if (!snapshot) {
      return;
    }
    this.runDestroyed_ = new Set((snapshot.destroyed ?? []).filter((id) => typeof id === 'string'));
    this.reviewedThisRun_ = snapshot.reviewed === true;
  }

  static get destroyedThisRun(): readonly string[] {
    return [...this.runDestroyed_];
  }

  static markReviewed(): void {
    this.reviewedThisRun_ = true;
  }

  /** Whether the operator opened the campaign record this run (campaign-document-reviewed). */
  static get isReviewed(): boolean {
    return this.reviewedThisRun_;
  }
}
