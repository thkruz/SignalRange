/**
 * @file WorkingDocumentManager - Accumulating in-scenario document panel
 * @description Builds a visible operator document (quick-reference card,
 * impact report, incident timeline) line-by-line as the player answers
 * status-check quizzes correctly. A status-check condition opts in by
 * setting `params.documentLine` (and optionally `params.documentSection`);
 * the line is appended to the document when QUIZ_PASSED fires for it.
 *
 * Scenarios enable the panel via `settings.workingDocument: { title, description? }`.
 */

import { EventBus } from '@app/events/event-bus';
import { Events, QuizPassedData } from '@app/events/events';
import { DraggableHtmlBox } from '@app/modal/draggable-html-box';
import { ScenarioManager } from '@app/scenario-manager';

interface DocumentEntry {
  section: string;
  line: string;
}

const DEFAULT_SECTION = 'Notes';

export class WorkingDocumentManager {
  private static instance_: WorkingDocumentManager | null = null;

  private entries_: DocumentEntry[] = [];
  private box_: DraggableHtmlBox | null = null;
  private readonly boundQuizPassedHandler_: (data: QuizPassedData) => void;

  private constructor() {
    this.boundQuizPassedHandler_ = this.handleQuizPassed_.bind(this);
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
    this.box_ = null;
    EventBus.getInstance().off(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
    if (WorkingDocumentManager.isEnabled()) {
      EventBus.getInstance().on(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
    }
  }

  /** Open (or create) the document panel. */
  open(): void {
    if (!WorkingDocumentManager.isEnabled()) return;
    this.ensureBox_();
    this.render_();
    this.box_?.open();
  }

  /** Number of lines accumulated so far (used by completeness checks). */
  getEntryCount(): number {
    return this.entries_.length;
  }

  private handleQuizPassed_(data: QuizPassedData): void {
    const scenario = ScenarioManager.getInstance().data;
    const objective = scenario.objectives?.find(o => o.id === data.objectiveId);
    const condition = objective?.conditions?.[data.conditionIndex];
    const line = condition?.params?.documentLine;
    if (!line) return;

    const section = condition?.params?.documentSection ?? DEFAULT_SECTION;

    // Idempotence: a re-fired event for the same line must not duplicate it
    if (this.entries_.some(e => e.line === line && e.section === section)) return;

    const isFirstEntry = this.entries_.length === 0;
    this.entries_.push({ section, line });

    this.ensureBox_();
    this.render_();

    // Auto-show on the first entry so the player sees the document begin to
    // build; afterwards only update content and let them manage the window.
    if (isFirstEntry) {
      this.box_?.open();
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

    const sectionsHtml = [...sections.entries()].map(([section, lines]) => `
      <div class="working-doc-section mb-2">
        <div class="fw-bold text-uppercase small" style="opacity:0.7;letter-spacing:0.05em;">${section}</div>
        <ul class="list-unstyled mb-0 font-monospace small" style="line-height:1.6;">
          ${lines.map(l => `<li>&#x2713; ${l}</li>`).join('')}
        </ul>
      </div>
    `).join('');

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
      this.instance_ = null;
    }
  }
}
