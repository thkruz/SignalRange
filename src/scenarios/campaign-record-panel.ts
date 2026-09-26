/**
 * @file CampaignRecordPanel - read-only view of the campaign's Working Documents
 * @description Lists every earlier scenario in the current campaign with the
 * record it left: the player's stored entries when the scenario was completed
 * in this browser, otherwise the scenario's canonical lines marked "as filed".
 * Opening it satisfies the campaign-document-reviewed condition.
 */

import { DraggableHtmlBox } from '@app/modal/draggable-html-box';
import type { ScenarioData } from '@app/ScenarioData';
import { SCENARIOS, ScenarioManager } from '@app/scenario-manager';
import { type CampaignDocumentEntry, CampaignDocumentStore, campaignIdOf, canonicalEntriesOf } from './campaign-document-store';

interface RecordView {
  scenario: ScenarioData;
  entries: CampaignDocumentEntry[];
  completedAt?: string;
  destroyedEvidence: string[];
}

export class CampaignRecordPanel {
  private static instance_: CampaignRecordPanel | null = null;
  private box_: DraggableHtmlBox | null = null;

  static getInstance(): CampaignRecordPanel {
    this.instance_ ??= new CampaignRecordPanel();
    return this.instance_;
  }

  static reset(): void {
    this.instance_ = null;
  }

  /** Earlier scenarios of this campaign that have (or can have) a record. */
  static getRecords(): RecordView[] {
    const current = ScenarioManager.getInstance().data;
    if (!current) return [];
    const campaignId = campaignIdOf(current);
    const doc = CampaignDocumentStore.load(campaignId);

    return SCENARIOS.filter((s) => campaignIdOf(s) === campaignId && s.number < current.number && s.number > 0)
      .sort((a, b) => a.number - b.number)
      .map((scenario) => {
        const stored = doc.scenarios.find((r) => r.scenarioId === scenario.id);
        return {
          scenario,
          entries: stored?.entries ?? canonicalEntriesOf(scenario),
          completedAt: stored?.completedAt,
          destroyedEvidence: stored?.destroyedEvidence ?? [],
        };
      })
      .filter((r) => r.entries.length > 0 || r.completedAt);
  }

  /** Whether there is anything to show for the current scenario. */
  static hasContent(): boolean {
    return this.getRecords().length > 0;
  }

  open(): void {
    this.box_ ??= new DraggableHtmlBox('Campaign Record', 'campaign-record', '', 'app-shell-page');
    this.box_.updateContent(this.render_());
    this.box_.open();
    CampaignDocumentStore.markReviewed();
  }

  private render_(): string {
    const records = CampaignRecordPanel.getRecords();
    if (records.length === 0) {
      return `<div style="width:520px;max-width:70vw;padding:0.75rem 1rem;"><p class="small font-monospace" style="opacity:0.6;">(No earlier records in this campaign.)</p></div>`;
    }

    const blocks = records
      .map((r) => {
        const sections = new Map<string, string[]>();
        for (const e of r.entries) {
          const lines = sections.get(e.section) ?? [];
          lines.push(e.line);
          sections.set(e.section, lines);
        }
        const status = r.completedAt ? `filed ${r.completedAt.slice(0, 10)}` : 'as filed (record on file, not this operator)';
        const destroyed = r.destroyedEvidence.length > 0 ? `<div class="small text-danger">Evidence destroyed during the shift: ${r.destroyedEvidence.join(', ')}</div>` : '';
        const sectionsHtml = [...sections.entries()]
          .map(
            ([section, lines]) => `
          <div class="mb-1">
            <div class="fw-bold text-uppercase small" style="opacity:0.7;letter-spacing:0.05em;">${section}</div>
            <ul class="list-unstyled mb-0 font-monospace small" style="line-height:1.5;">${lines.map((l) => `<li>&#x2713; ${l}</li>`).join('')}</ul>
          </div>`
          )
          .join('');
        return `
        <details class="campaign-record-scenario mb-2" data-scenario-id="${r.scenario.id}">
          <summary class="fw-bold small">S${r.scenario.number} ${r.scenario.title} <span class="fw-normal" style="opacity:0.6;">- ${status}</span></summary>
          <div class="ps-2 pt-1">${destroyed}${sectionsHtml}</div>
        </details>`;
      })
      .join('');

    return `<div style="width:520px;max-width:70vw;max-height:60vh;overflow-y:auto;padding:0.75rem 1rem;">${blocks}</div>`;
  }
}
