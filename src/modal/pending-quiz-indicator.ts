/**
 * @file Pending Quiz Indicator - Floating notification when a quiz needs to be completed
 * @description Shows when a quiz has been dismissed but not completed, allowing user to reopen it
 */

import { EventBus } from '@app/events/event-bus';
import { Events, QuizCompletedData, QuizDismissedData, QuizPassedData, QuizPendingData, QuizShowData } from '@app/events/events';
import { QuizManager } from './quiz-manager';
import './pending-quiz-indicator.css';

/**
 * Floating indicator that shows when there's a pending quiz
 * Singleton pattern for global access
 */
export class PendingQuizIndicator {
  private static instance_: PendingQuizIndicator | null = null;

  private static readonly INITIAL_DELAY_MS = 15000;

  private indicatorElement_: HTMLDivElement | null = null;
  private iconElement_: HTMLDivElement | null = null;
  private messageElement_: HTMLDivElement | null = null;
  private openButton_: HTMLButtonElement | null = null;
  private pendingShowTimeout_: number | null = null;

  private readonly boundQuizShowHandler_: (data: QuizShowData) => void;
  private readonly boundQuizDismissedHandler_: (data: QuizDismissedData) => void;
  private readonly boundQuizCompletedHandler_: (data: QuizCompletedData) => void;
  private readonly boundQuizPendingHandler_: (data: QuizPendingData) => void;
  private readonly boundQuizPassedHandler_: (data: QuizPassedData) => void;

  private constructor() {
    this.boundQuizShowHandler_ = this.handleQuizShow_.bind(this);
    this.boundQuizDismissedHandler_ = this.handleQuizDismissed_.bind(this);
    this.boundQuizCompletedHandler_ = this.handleQuizCompleted_.bind(this);
    this.boundQuizPendingHandler_ = this.handleQuizPending_.bind(this);
    this.boundQuizPassedHandler_ = this.handleQuizPassed_.bind(this);

    this.createIndicatorElement_();
    this.setupEventListeners_();
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

  private handleOpenClick_(): void {
    QuizManager.getInstance().reopenPendingQuiz();
  }

  private updateMessage_(message: string): void {
    if (this.messageElement_) {
      this.messageElement_.textContent = message;
    }
  }

  private show_(): void {
    if (!this.indicatorElement_) return;

    requestAnimationFrame(() => {
      if (this.indicatorElement_) {
        this.indicatorElement_.classList.add('show');
      }
    });
  }

  private hide_(): void {
    if (!this.indicatorElement_) return;
    this.indicatorElement_.classList.remove('show');
  }

  /**
   * Publicly hide the indicator and cancel any pending timeout.
   * Called when failure modal is shown.
   */
  hideAndCancel(): void {
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
