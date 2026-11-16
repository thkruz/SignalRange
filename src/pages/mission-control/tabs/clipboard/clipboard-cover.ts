import { htmlToParagraphs } from '@app/ham/ui/panels/plain-text';
import { ObjectivesManager } from '@app/objectives';
import { ScenarioManager } from '@app/scenario-manager';
import { handleChecklistClick } from '../../checklist-actions';

/**
 * ClipboardCover - The first sheet on the clipboard: the shift package (what this shift is) over the
 * printed task sheet (the live objectives checklist, tick boxes read-only).
 */
export class ClipboardCover {
  readonly element: HTMLElement;
  private readonly checklist_: HTMLElement;
  private lastHtml_ = '';
  private timer_: number | null = null;
  private readonly written_: boolean;
  private readonly boundClick_: (e: Event) => void = (e) => this.onClick_(e);
  private readonly boundKey_: (e: KeyboardEvent) => void = (e) => this.onKey_(e);

  /**
   * @param options.registerOpened false when the cover is only a second place to read the task list (the C3 logbook
   * front page): looking at it must not count as opening the checklist window
   * @param options.registerBrief true when the cover shows the brief text: reading it counts as reading the mission
   * brief (the same opened-box state the brief window sets)
   * @param options.written true for the logbook front page: the row state suffix ("- Locked") is dropped, the ticks say it
   */
  constructor(options: { registerOpened?: boolean; registerBrief?: boolean; written?: boolean } = {}) {
    this.written_ = options.written === true;
    this.element = document.createElement('section');
    this.element.className = 'cbk-cover';
    this.element.setAttribute('aria-label', 'Cover sheet');
    const head = document.createElement('header');
    head.className = 'cbk-cover-head';
    const data = ScenarioManager.getInstance().data;
    const kicker = document.createElement('p');
    kicker.className = 'cbk-kicker';
    kicker.textContent = 'Shift package';
    const title = document.createElement('h2');
    title.textContent = data?.title ?? 'Shift package';
    head.append(kicker, title);
    if (data?.subtitle) {
      const sub = document.createElement('p');
      sub.className = 'cbk-subtitle';
      sub.textContent = data.subtitle;
      head.append(sub);
    }
    if (data?.description) {
      // Scenario descriptions carry <br/> and <p> markup: each block becomes its own paragraph, as text
      for (const part of htmlToParagraphs(data.description)) {
        const desc = document.createElement('p');
        desc.className = 'cbk-brief';
        desc.textContent = part;
        head.append(desc);
      }
    }
    const tasks = document.createElement('h3');
    tasks.className = 'cbk-tasks-title';
    tasks.textContent = 'Task sheet';
    this.checklist_ = document.createElement('section');
    this.checklist_.className = 'cbk-checklist';
    this.element.append(head, tasks, this.checklist_);
    this.checklist_.addEventListener('click', this.boundClick_);
    this.checklist_.addEventListener('keydown', this.boundKey_);
    // Scenarios may track the checklist being looked at
    if (options.registerOpened !== false) ObjectivesManager.registerOpenedBox('checklist');
    if (options.registerBrief) ObjectivesManager.registerOpenedBox('mission-brief');
    this.refresh_();
    this.timer_ = window.setInterval(() => this.refresh_(), 1000);
  }

  dispose(): void {
    if (this.timer_ !== null) window.clearInterval(this.timer_);
    this.timer_ = null;
    this.checklist_.removeEventListener('click', this.boundClick_);
    this.checklist_.removeEventListener('keydown', this.boundKey_);
    this.element.remove();
  }

  private onClick_(e: Event): void {
    handleChecklistClick(e, true);
    // The header's own onclick has already toggled the row; mirror it for assistive tech
    const header = (e.target as HTMLElement).closest<HTMLElement>('.objective-header');
    if (header) this.syncExpanded_(header);
  }

  /** Objective headers act as buttons: Enter and Space fold and unfold the row */
  private onKey_(e: KeyboardEvent): void {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const header = (e.target as HTMLElement).closest<HTMLElement>('.objective-header');
    if (!header || e.target !== header) return;
    e.preventDefault();
    header.click();
  }

  private syncExpanded_(header: HTMLElement): void {
    header.setAttribute('aria-expanded', String(!header.parentElement?.classList.contains('collapsed')));
  }

  private refresh_(): void {
    const objectives = ObjectivesManager.getInstance();
    objectives.syncCollapsedStatesFromDOM(this.checklist_);
    const html = objectives.generateHtmlChecklist();
    if (html === this.lastHtml_) return;
    this.lastHtml_ = html;
    // The refresh replaces the markup: keep the keyboard focus on the same objective header
    const active = document.activeElement;
    const focusedId =
      active instanceof HTMLElement && this.checklist_.contains(active) && active.classList.contains('objective-header') ? active.parentElement?.dataset.objectiveId : undefined;
    this.checklist_.innerHTML = html;
    for (const header of this.checklist_.querySelectorAll<HTMLElement>('.objective-header')) {
      header.setAttribute('role', 'button');
      header.tabIndex = 0;
      this.syncExpanded_(header);
      if (this.written_) {
        for (const node of [...header.childNodes]) if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').startsWith(' - ')) node.remove();
      }
      if (focusedId && header.parentElement?.dataset.objectiveId === focusedId) header.focus({ preventScroll: true });
    }
  }
}
