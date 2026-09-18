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
import type { ScenarioData } from '@app/ScenarioData';

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
}

export interface CampaignDocument {
  campaignId: string;
  scenarios: CampaignScenarioRecord[];
}

const STORAGE_PREFIX = 'signalrange:campaign-document:';

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
      if (line) entries.push({ section: condition.params?.documentSection ?? 'Notes', line });
    }
  }
  return entries;
}

export class CampaignDocumentStore {
  /** Evidence destroyed so far in the current run (reset per scenario load) */
  private static runDestroyed_ = new Set<string>();
  /** Whether the campaign record panel has been opened this run */
  private static reviewedThisRun_ = false;

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
    this.runDestroyed_ = new Set<string>();
    this.reviewedThisRun_ = false;
  }

  /** A decision consequence destroyed this evidence (recorded at completion). */
  static noteDestroyedEvidence(auditEventId: string): void {
    this.runDestroyed_.add(auditEventId);
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
