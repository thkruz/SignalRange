/**
 * @file hint-panel - Riley's sticky note: "Ask Riley" per active objective
 * @description Lists the active, unfinished objectives; each button sends `hint` and shows
 * `config.hints[objectiveId]` (or the manager's generic reply) inline.
 * Test ids: ham-hint-<objectiveId>-ask, ham-hint-<objectiveId>-text.
 */

import { ObjectivesManager } from '@app/objectives/objectives-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, h, Rebuilder, tid } from '../ui-kit';
import { pencil } from './paper';
import { QuizPrompt } from './quiz-prompt';

export class HintPanel implements StationPanel {
  readonly id = 'hints';
  readonly title = 'Ask Riley';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private body_!: HTMLElement;
  private readonly rebuild_ = new Rebuilder();
  private readonly stages_ = new Map<string, boolean>();
  private readonly shown_ = new Map<string, string[]>();
  private quizPrompt_: QuizPrompt | null = null;

  private static active_(): { id: string; title: string }[] {
    if (!ObjectivesManager.hasInstance()) return [];

    return ObjectivesManager.getInstance()
      .getObjectiveStates()
      .filter((s) => s.isActive && !s.isCompleted && !s.isFailed)
      .map((s) => ({ id: s.objective.id, title: s.objective.title }));
  }

  isRelevant(): boolean {
    return HintPanel.active_().length > 0 || QuizPrompt.isPending();
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    // Riley's note is paper in the room, not a card: the sticky note itself is the strip this slot sits in
    this.root_ = h('section', { class: 'hl-riley', 'data-testid': 'ham-hint-card', id: 'ham-hint-card', 'aria-label': this.title });
    this.body_ = h('div', { class: 'hl-riley-asks' });
    this.quizPrompt_ = new QuizPrompt();
    this.root_.append(h('div', { class: 'hl-riley-sign', 'aria-hidden': 'true', text: 'Riley' }), this.quizPrompt_.el, this.body_);
    host.append(this.root_);
    this.update();
  }

  update(): void {
    this.quizPrompt_?.update();
    const active = HintPanel.active_();
    // A rebuild replaces the buttons: remember which Ask button had focus and give it back
    const focused = document.activeElement instanceof HTMLElement && this.body_.contains(document.activeElement) ? document.activeElement.id : '';
    const rebuilt = this.rebuild_.run(this.body_, JSON.stringify([active, [...this.shown_], [...this.stages_]]), () => {
      for (const o of active) {
        const texts = this.shown_.get(o.id);
        const last = this.stageOf_(o.id);
        this.body_.append(
          h(
            'div',
            { class: 'hl-riley-ask' },
            h('div', { class: 'hl-riley-for', text: o.title }),
            button(
              tid('ham-hint', o.id, 'ask'),
              texts ? (last.more ? 'Ask Riley for more' : 'Ask Riley again') : 'Ask Riley',
              () => this.ask_(o.id),
              'hl-riley-btn',
              `Ask Riley for a hint on ${o.title}`
            ),
            texts ? this.answer_(o.id, texts) : null
          )
        );
      }
    });
    if (rebuilt && focused) this.body_.querySelector<HTMLElement>(`#${CSS.escape(focused)}`)?.focus();
  }

  dispose(): void {
    this.quizPrompt_?.dispose();
    this.quizPrompt_ = null;
    this.root_?.remove();
    this.root_ = null;
    this.shown_.clear();
  }

  /** The pencil answer under an objective: one line per stage given so far */
  private answer_(objectiveId: string, texts: string[]): HTMLElement {
    const note = pencil(tid('ham-hint', objectiveId, 'text'));
    note.append(...texts.map((t, i) => h('div', { 'data-testid': tid('ham-hint', objectiveId, 'stage', String(i + 1)), text: t })));

    return note;
  }

  private ask_(objectiveId: string): void {
    const r = this.ctx_.act({ type: 'hint', objectiveId });
    const texts = (r.data?.texts as string[] | undefined) ?? [];
    this.shown_.set(objectiveId, texts.length > 0 ? texts : [r.message]);
    this.stages_.set(objectiveId, Boolean(r.data) && Number(r.data?.stage) < Number(r.data?.of));
    this.update();
  }

  private stageOf_(objectiveId: string): { more: boolean } {
    return { more: this.stages_.get(objectiveId) ?? false };
  }
}
