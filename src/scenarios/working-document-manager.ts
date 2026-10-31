/**
 * @file WorkingDocumentManager - Accumulating in-scenario document panel
 * @description Builds a visible operator document (quick-reference card,
 * impact report, incident timeline) line-by-line as the player answers
 * status-check quizzes correctly. A status-check condition opts in by
 * setting `params.documentLine` (and optionally `params.documentSection`);
 * the line is appended to the document when QUIZ_PASSED fires for it.
 *
 * Scenarios enable the panel via `settings.workingDocument: { title, description? }`.
 *
 * A new line does not pop the panel open: it used to open centred on the
 * first entry, over whatever the player was working (S24's ACU Feed Heater
 * switch, nats-r2 s14-F2/s24-F5). The sidebar icon pulses instead until the
 * player opens the document.
 */

import { CommandingManager } from '@app/commanding/commanding-manager';
import { EventBus } from '@app/events/event-bus';
import { Events, QuizPassedData } from '@app/events/events';
import { HardwareFaultManager } from '@app/faults/hardware-fault-manager';
import { InterferenceManager } from '@app/interference/interference-manager';
import { fillDialogTokens } from '@app/modal/dialog-tokens';
import { DraggableHtmlBox } from '@app/modal/draggable-html-box';
import { ScenarioManager } from '@app/scenario-manager';
import { SecurityConsoleCore } from '@app/security-console/security-console-core';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { WeatherManager } from '@app/weather/weather-manager';
import { CampaignDocumentStore, campaignIdOf } from './campaign-document-store';
import { EventTimeLedger } from './event-time-ledger';
import './working-document.css';

interface DocumentEntry {
  section: string;
  line: string;
}

const DEFAULT_SECTION = 'Notes';
/** Sidebar icon class that pulses while the document has lines the player has not opened */
const NEW_ENTRY_CLASS = 'has-new-entry';

export class WorkingDocumentManager {
  private static instance_: WorkingDocumentManager | null = null;

  private entries_: DocumentEntry[] = [];
  /** section||authored line of every line written, so a re-fired quiz never duplicates its filled line */
  private readonly authoredKeys_ = new Set<string>();
  private box_: DraggableHtmlBox | null = null;
  private readonly boundQuizPassedHandler_: (data: QuizPassedData) => void;
  private readonly boundCompletedHandler_: () => void;

  private constructor() {
    this.boundQuizPassedHandler_ = this.handleQuizPassed_.bind(this);
    this.boundCompletedHandler_ = this.flushToCampaignStore_.bind(this);
  }

  static getInstance(): WorkingDocumentManager {
    this.instance_ ??= new WorkingDocumentManager();
    return this.instance_;
  }

  /** Whether the current scenario uses the working document panel */
  static isEnabled(): boolean {
    return !!ScenarioManager.getInstance().settings.workingDocument;
  }

  /** Call once per scenario load (after ScenarioManager is ready). */
  initialize(): void {
    this.entries_ = [];
    this.authoredKeys_.clear();
    this.box_ = null;
    WorkingDocumentManager.setNewEntryFlag_(false);
    EventTimeLedger.setSources({
      commanding: () => (CommandingManager.isInitialized() ? CommandingManager.getInstance() : undefined),
      interference: () => (InterferenceManager.isInitialized() ? InterferenceManager.getInstance() : undefined),
      weather: () => (WeatherManager.hasInstance() ? WeatherManager.getInstance() : undefined),
      hardwareFault: () => (HardwareFaultManager.isInitialized() ? HardwareFaultManager.getInstance() : undefined),
      security: () => (SecurityConsoleCore.isInitialized() ? SecurityConsoleCore.getInstance() : undefined),
      objectiveState: (id) => SimulationManager.getInstance().objectivesManager?.getObjectiveState(id),
    });
    CampaignDocumentStore.beginRun();
    const bus = EventBus.getInstance();
    bus.off(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
    bus.off(Events.OBJECTIVES_ALL_COMPLETED, this.boundCompletedHandler_);
    if (WorkingDocumentManager.isEnabled()) {
      bus.on(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
      bus.on(Events.OBJECTIVES_ALL_COMPLETED, this.boundCompletedHandler_);
    }
  }

  /**
   * Scenario complete: file this shift's document in the campaign record so
   * later scenarios can read it, with any evidence a decision destroyed.
   */
  private flushToCampaignStore_(): void {
    const scenario = ScenarioManager.getInstance().data;
    if (!scenario) return;
    CampaignDocumentStore.upsertRecord(campaignIdOf(scenario), {
      scenarioId: scenario.id,
      number: scenario.number ?? 0,
      title: scenario.title ?? scenario.id,
      documentTitle: ScenarioManager.getInstance().settings.workingDocument?.title ?? 'Working Document',
      completedAt: new Date().toISOString(),
      entries: this.entries_.map((e) => ({ ...e })),
      destroyedEvidence: [...CampaignDocumentStore.destroyedThisRun],
    });
  }

  /** Open (or create) the document panel. */
  open(): void {
    if (!WorkingDocumentManager.isEnabled()) return;
    this.ensureBox_();
    this.render_();
    this.box_?.open();
    WorkingDocumentManager.setNewEntryFlag_(false);
  }

  /** Pulse (or stop pulsing) the sidebar icon */
  private static setNewEntryFlag_(isOn: boolean): void {
    for (const icon of document.querySelectorAll<HTMLElement>('.working-doc-icon')) {
      icon.classList.toggle(NEW_ENTRY_CLASS, isOn);
      if (isOn) {
        icon.setAttribute('data-tooltip', 'Working Document - new entry');
      } else {
        icon.setAttribute('data-tooltip', 'Working Document');
      }
    }
  }

  /** Close the document panel if it is open (end-of-scenario modals) */
  close(): void {
    this.box_?.close();
  }

  /** Number of lines accumulated so far (used by completeness checks). */
  getEntryCount(): number {
    return this.entries_.length;
  }

  private handleQuizPassed_(data: QuizPassedData): void {
    const scenario = ScenarioManager.getInstance().data;
    const objective = scenario.objectives?.find((o) => o.id === data.objectiveId);
    const condition = objective?.conditions?.[data.conditionIndex];
    const line = condition?.params?.documentLine;
    if (!line) return;

    const section = condition?.params?.documentSection ?? DEFAULT_SECTION;

    // Idempotence: a re-fired event for the same line must not duplicate it
    const dedupeKey = `${section}||${line}`;
    if (this.authoredKeys_.has(dedupeKey)) return;
    this.authoredKeys_.add(dedupeKey);

    // The filled line is stored: it carries the times this run actually had
    this.entries_.push({ section, line: fillDialogTokens(line) });

    // Update an open document in place; otherwise flag the sidebar icon
    // rather than opening the panel over the console. The box is not built
    // here: constructing it shows it.
    if (this.box_?.isOpen) {
      this.render_();
    } else {
      WorkingDocumentManager.setNewEntryFlag_(true);
    }
  }

  private ensureBox_(): void {
    if (this.box_) return;
    const config = ScenarioManager.getInstance().settings.workingDocument;
    this.box_ = new DraggableHtmlBox(config?.title ?? 'Working Document', 'working-document', '', 'app-shell-page');
  }

  private render_(): void {
    if (!this.box_) return;
    const config = ScenarioManager.getInstance().settings.workingDocument;

    // Group entries by section, preserving first-appearance order
    const sections = new Map<string, string[]>();
    for (const entry of this.entries_) {
      const lines = sections.get(entry.section) ?? [];
      lines.push(entry.line);
      sections.set(entry.section, lines);
    }

    const sectionsHtml = [...sections.entries()]
      .map(
        ([section, lines]) => `
      <div class="working-doc-section mb-2">
        <div class="fw-bold text-uppercase small" style="opacity:0.7;letter-spacing:0.05em;">${section}</div>
        <ul class="list-unstyled mb-0 font-monospace small" style="line-height:1.6;">
          ${lines.map((l) => `<li>&#x2713; ${l}</li>`).join('')}
        </ul>
      </div>
    `
      )
      .join('');

    const emptyHtml = `
      <p class="small font-monospace" style="opacity:0.6;">
        (Document is empty - entries are added as you make the calls during the shift.)
      </p>
    `;

    this.box_.updateContent(`
      <div style="width:480px;max-width:70vw;max-height:60vh;overflow-y:auto;padding:0.75rem 1rem;">
        ${config?.description ? `<p class="small mb-2" style="opacity:0.8;">${config.description}</p>` : ''}
        ${this.entries_.length > 0 ? sectionsHtml : emptyHtml}
        <div class="small mt-2" style="opacity:0.5;">${this.entries_.length} entr${this.entries_.length === 1 ? 'y' : 'ies'}</div>
      </div>
    `);
  }

  static reset(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.QUIZ_PASSED, this.instance_.boundQuizPassedHandler_);
      EventBus.getInstance().off(Events.OBJECTIVES_ALL_COMPLETED, this.instance_.boundCompletedHandler_);
      this.instance_ = null;
    }
  }
}
