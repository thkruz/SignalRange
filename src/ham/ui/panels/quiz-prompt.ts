/**
 * @file quiz-prompt - "Take the quiz" line for the Station tab hint strip
 * @description Shows Riley's one-line nudge and a button while a knowledge-check quiz is pending.
 * It reads `QuizManager.hasPendingQuiz()` and the button calls `reopenPendingQuiz()`, the same
 * call the floating pending-quiz banner makes, so it never registers or grades a quiz itself.
 * Test ids: ham-hint-quiz-prompt, ham-hint-take-quiz.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { QuizManager } from '@app/modal/quiz-manager';
import { button, h } from '../ui-kit';

export const QUIZ_PROMPT_TEXT = "Riley: Quick check before we go on. Take the quiz when you're ready.";

const QUIZ_EVENTS = [Events.QUIZ_PENDING, Events.QUIZ_SHOW, Events.QUIZ_PASSED, Events.QUIZ_COMPLETED, Events.QUIZ_DISMISSED] as const;

export class QuizPrompt {
  readonly el: HTMLElement;
  private readonly bound_: () => void;

  constructor() {
    this.el = h(
      'div',
      { class: 'alert alert-warning py-1 small mb-2 d-flex align-items-center justify-content-between gap-2', role: 'status', 'data-testid': 'ham-hint-quiz-prompt', hidden: true },
      h('span', { text: QUIZ_PROMPT_TEXT }),
      button('ham-hint-take-quiz', 'Take the quiz', () => QuizManager.getInstance().reopenPendingQuiz(), 'btn btn-sm btn-warning')
    );
    // Defer so QuizManager's own handlers (which clear the pending key) run first
    this.bound_ = () => queueMicrotask(() => this.update());
    const bus = EventBus.getInstance();
    for (const e of QUIZ_EVENTS) bus.on(e, this.bound_);
    this.update();
  }

  /** True while a quiz is waiting to be taken */
  static isPending(): boolean {
    return QuizManager.getInstance().hasPendingQuiz();
  }

  update(): void {
    this.el.hidden = !QuizPrompt.isPending();
  }

  dispose(): void {
    const bus = EventBus.getInstance();
    for (const e of QUIZ_EVENTS) bus.off(e, this.bound_);
    this.el.remove();
  }
}
