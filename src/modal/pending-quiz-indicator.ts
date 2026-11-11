/**
 * @file Pending Quiz Indicator - Floating notification when a quiz needs to be completed
 * @description Shows when a quiz has been dismissed but not completed, allowing user to reopen it
 */

import { EventBus } from '@app/events/event-bus';
import {
  DecisionDismissedData,
  DecisionGradedData,
  DecisionPendingData,
  DecisionResolvedData,
  DecisionShowData,
  Events,
  QuizCompletedData,
  QuizDismissedData,
  QuizPassedData,
  QuizPendingData,
  QuizShowData,
} from '@app/events/events';
import { ImmersiveView } from '@app/presentation/immersive-view';
import { DecisionManager } from './decision-manager';
import './pending-quiz-indicator.css';
import { QuizManager } from './quiz-manager';

/**
 * Floating indicator that shows when there's a pending quiz
 * Singleton pattern for global access
 */
export class PendingQuizIndicator {
  private static instance_: PendingQuizIndicator | null = null;

  private static readonly INITIAL_DELAY_MS = 5000;

  private indicatorElement_: HTMLDivElement | null = null;
  private iconElement_: HTMLDivElement | null = null;
  private messageElement_: HTMLDivElement | null = null;
  private openButton_: HTMLButtonElement | null = null;
  private pendingShowTimeout_: number | null = null;
  private suppressed_: boolean = false;
  /** Stops following held objects (ImmersiveView.onChange) */
  private readonly unfollowHeld_: () => void;

  private readonly boundQuizShowHandler_: (data: QuizShowData) => void;
  private readonly boundQuizDismissedHandler_: (data: QuizDismissedData) => void;
  private readonly boundQuizCompletedHandler_: (data: QuizCompletedData) => void;
  private readonly boundQuizPendingHandler_: (data: QuizPendingData) => void;
  private readonly boundQuizPassedHandler_: (data: QuizPassedData) => void;
  private readonly boundDecisionShowHandler_: (data: DecisionShowData) => void;
  private readonly boundDecisionDismissedHandler_: (data: DecisionDismissedData) => void;
  private readonly boundDecisionPendingHandler_: (data: DecisionPendingData) => void;
  private readonly boundDecisionGradedHandler_: (data: DecisionGradedData) => void;
  private readonly boundDecisionResolvedHandler_: (data: DecisionResolvedData) => void;

  private constructor() {
    this.boundQuizShowHandler_ = this.handleQuizShow_.bind(this);
    this.boundQuizDismissedHandler_ = this.handleQuizDismissed_.bind(this);
    this.boundQuizCompletedHandler_ = this.handleQuizCompleted_.bind(this);
    this.boundQuizPendingHandler_ = this.handleQuizPending_.bind(this);
    this.boundQuizPassedHandler_ = this.handleQuizPassed_.bind(this);
    this.boundDecisionShowHandler_ = this.handleDecisionShow_.bind(this);
    this.boundDecisionDismissedHandler_ = this.handleDecisionDismissed_.bind(this);
    this.boundDecisionPendingHandler_ = this.handleDecisionPending_.bind(this);
    this.boundDecisionGradedHandler_ = this.handleDecisionGraded_.bind(this);
    this.boundDecisionResolvedHandler_ = this.handleDecisionResolved_.bind(this);

    this.createIndicatorElement_();
    this.setupEventListeners_();
    this.unfollowHeld_ = ImmersiveView.onChange((dialog, change) => this.followHeld_(dialog, change));
  }

  static getInstance(): PendingQuizIndicator {
    PendingQuizIndicator.instance_ ??= new PendingQuizIndicator();
    return PendingQuizIndicator.instance_;
  }

  private createIndicatorElement_(): void {
    // Create main container
    this.indicatorElement_ = document.createElement('div');
    this.indicatorElement_.className = 'pending-quiz-indicator';

    // Create icon
    this.iconElement_ = document.createElement('div');
    this.iconElement_.className = 'pending-quiz-indicator__icon';
    this.iconElement_.innerHTML = '?';
    this.indicatorElement_.appendChild(this.iconElement_);

    // Create message container
    this.messageElement_ = document.createElement('div');
    this.messageElement_.className = 'pending-quiz-indicator__message';
    this.messageElement_.textContent = 'Quiz pending';
    this.indicatorElement_.appendChild(this.messageElement_);

    // Create open button
    this.openButton_ = document.createElement('button');
    this.openButton_.className = 'pending-quiz-indicator__open-btn';
    this.openButton_.textContent = 'Open Quiz';
    this.openButton_.addEventListener('click', () => this.handleOpenClick_());
    this.indicatorElement_.appendChild(this.openButton_);

    // Append to body
    document.body.appendChild(this.indicatorElement_);
  }

  private setupEventListeners_(): void {
    const eventBus = EventBus.getInstance();
    eventBus.on(Events.QUIZ_SHOW, this.boundQuizShowHandler_);
    eventBus.on(Events.QUIZ_DISMISSED, this.boundQuizDismissedHandler_);
    eventBus.on(Events.QUIZ_COMPLETED, this.boundQuizCompletedHandler_);
    eventBus.on(Events.QUIZ_PENDING, this.boundQuizPendingHandler_);
    eventBus.on(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
    eventBus.on(Events.DECISION_SHOW, this.boundDecisionShowHandler_);
    eventBus.on(Events.DECISION_DISMISSED, this.boundDecisionDismissedHandler_);
    eventBus.on(Events.DECISION_PENDING, this.boundDecisionPendingHandler_);
    eventBus.on(Events.DECISION_GRADED, this.boundDecisionGradedHandler_);
    eventBus.on(Events.DECISION_RESOLVED, this.boundDecisionResolvedHandler_);
  }

  /**
   * When quiz is shown, hide the indicator and cancel pending timeout (quiz is open)
   */
  private handleQuizShow_(_data: QuizShowData): void {
    this.cancelPendingTimeout_();
    this.hide_();
  }

  /**
   * When quiz is dismissed without completing, show the indicator
   */
  private handleQuizDismissed_(_data: QuizDismissedData): void {
    this.updateMessage_('Complete the quiz to continue');
    this.show_();
  }

  /**
   * When quiz is completed, hide the indicator and cancel any pending timeout
   */
  private handleQuizCompleted_(_data: QuizCompletedData): void {
    this.cancelPendingTimeout_();
    this.hide_();
  }

  /**
   * When quiz is passed (correct answer selected), hide the indicator immediately
   * This happens before Continue is pressed
   */
  private handleQuizPassed_(_data: QuizPassedData): void {
    this.cancelPendingTimeout_();
    this.hide_();
  }

  private cancelPendingTimeout_(): void {
    if (this.pendingShowTimeout_ !== null) {
      clearTimeout(this.pendingShowTimeout_);
      this.pendingShowTimeout_ = null;
    }
  }

  /**
   * When a quiz is registered (pending), show the indicator after a delay
   * This happens instead of showing the quiz immediately
   */
  private handleQuizPending_(_data: QuizPendingData): void {
    this.cancelPendingTimeout_();

    // Show indicator after delay to give user time to work
    this.pendingShowTimeout_ = window.setTimeout(() => {
      this.updateMessage_('Complete the quiz to continue');
      this.show_();
      this.pendingShowTimeout_ = null;
    }, PendingQuizIndicator.INITIAL_DELAY_MS);
  }

  /**
   * The player asked for the quiz (or decision). A held object (logbook, laptop) is a modal dialog above the quiz
   * window, so it is put down first, the way the player would; then focus moves to the first answer, since the
   * object's opener would otherwise take it back.
   */
  private handleOpenClick_(): void {
    ImmersiveView.closeAll();
    let answers = '#quiz-options';
    if (DecisionManager.hasInstance() && DecisionManager.getInstance().hasPending()) {
      DecisionManager.getInstance().reopenPending();
      answers = '#decision-options';
    } else {
      QuizManager.getInstance().reopenPendingQuiz();
    }
    // The window renders synchronously on the show event; its first answer takes focus
    document.querySelector<HTMLButtonElement>(`${answers} .quiz-option-btn:not(:disabled)`)?.focus({ preventScroll: true });
  }

  // ── Decision conditions share the indicator ─────────────────────────────

  private handleDecisionShow_(_data: DecisionShowData): void {
    this.cancelPendingTimeout_();
    this.hide_();
  }

  private handleDecisionDismissed_(_data: DecisionDismissedData): void {
    this.updateMessage_('Make the call to continue');
    this.show_();
  }

  private handleDecisionPending_(_data: DecisionPendingData): void {
    this.cancelPendingTimeout_();
    this.pendingShowTimeout_ = window.setTimeout(() => {
      this.updateMessage_('Make the call to continue');
      this.show_();
      this.pendingShowTimeout_ = null;
    }, PendingQuizIndicator.INITIAL_DELAY_MS);
  }

  /** A correct answer hides the indicator before Continue is pressed */
  private handleDecisionGraded_(data: DecisionGradedData): void {
    if (!data.correct) return;
    this.cancelPendingTimeout_();
    this.hide_();
  }

  private handleDecisionResolved_(_data: DecisionResolvedData): void {
    this.cancelPendingTimeout_();
    this.hide_();
  }

  private updateMessage_(message: string): void {
    if (this.messageElement_) {
      this.messageElement_.textContent = message;
    }
  }

  private show_(): void {
    if (!this.indicatorElement_ || this.suppressed_) return;

    requestAnimationFrame(() => {
      if (this.indicatorElement_) {
        this.rehome_();
        this.placeBelowHeader_();
        this.indicatorElement_.classList.add('show');
        // Second cue on the Checklist sidebar entry, so the gate is visible from every tab (c6-s03-F1)
        document.body.dataset.quizPending = 'true';
      }
    });
  }

  /**
   * Sit under whatever header stack is on screen (the mission control command bar and the alarm bar inside it),
   * measured rather than assumed: a fixed offset kept landing under the alarm bar (c6-s08-F1).
   */
  private placeBelowHeader_(): void {
    if (!this.indicatorElement_) return;
    let bottom = 0;
    for (const selector of ['#global-command-bar-container', '#alarm-bar']) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.offsetParent !== null) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
    }
    if (bottom > 0) this.indicatorElement_.style.top = `${Math.ceil(bottom) + 8}px`;
  }

  /**
   * A held object (ImmersiveView) is a modal dialog in the top layer; the indicator on the body would sit behind it
   * and could not be pressed. It rides inside the most recently held object and returns to the body when nothing is
   * held. Other modal dialogs (pause menu, scene cards, feedback) never take it: a quiz opened from there would open
   * behind them.
   */
  private rehome_(): void {
    const el = this.indicatorElement_;
    if (!el) return;
    const host = ImmersiveView.topDialog() ?? document.body;
    if (el.parentElement !== host) host.appendChild(el);
  }

  /** Move in when an object is picked up; move out before the held dialog is removed, so the indicator survives */
  private followHeld_(dialog: HTMLDialogElement, change: 'open' | 'closing'): void {
    const el = this.indicatorElement_;
    if (!el) return;
    if (change === 'open') {
      dialog.appendChild(el);
    } else if (el.parentElement === dialog) {
      // ImmersiveView has already dropped the closing view, so this finds the object still held under it, if any
      (ImmersiveView.topDialog() ?? document.body).appendChild(el);
    }
  }

  private hide_(): void {
    if (!this.indicatorElement_) return;
    this.indicatorElement_.classList.remove('show');
    delete document.body.dataset.quizPending;
  }

  /**
   * Permanently suppress the indicator until page refresh.
   * Called when failure modal is shown.
   */
  suppress(): void {
    this.suppressed_ = true;
    this.cancelPendingTimeout_();
    this.hide_();
  }

  isVisible(): boolean {
    return this.indicatorElement_?.classList.contains('show') ?? false;
  }

  dispose(): void {
    this.cancelPendingTimeout_();

    const eventBus = EventBus.getInstance();
    eventBus.off(Events.QUIZ_SHOW, this.boundQuizShowHandler_);
    eventBus.off(Events.QUIZ_DISMISSED, this.boundQuizDismissedHandler_);
    eventBus.off(Events.QUIZ_COMPLETED, this.boundQuizCompletedHandler_);
    eventBus.off(Events.QUIZ_PENDING, this.boundQuizPendingHandler_);
    eventBus.off(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
    eventBus.off(Events.DECISION_SHOW, this.boundDecisionShowHandler_);
    eventBus.off(Events.DECISION_DISMISSED, this.boundDecisionDismissedHandler_);
    eventBus.off(Events.DECISION_PENDING, this.boundDecisionPendingHandler_);
    eventBus.off(Events.DECISION_GRADED, this.boundDecisionGradedHandler_);
    eventBus.off(Events.DECISION_RESOLVED, this.boundDecisionResolvedHandler_);
    this.unfollowHeld_();

    if (this.indicatorElement_) {
      this.indicatorElement_.remove();
      this.indicatorElement_ = null;
    }

    this.iconElement_ = null;
    this.messageElement_ = null;
    this.openButton_ = null;
    PendingQuizIndicator.instance_ = null;
  }

  static destroy(): void {
    PendingQuizIndicator.instance_?.dispose();
  }
}
