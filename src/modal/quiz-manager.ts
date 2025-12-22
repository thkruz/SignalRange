/**
 * @file Quiz Manager - Manages quiz state for status-check objective conditions
 * @description Tracks which quizzes have been presented, answered, completed, and pending
 */

import { EventBus } from '@app/events/event-bus';
import { Events, QuizAnsweredData, QuizCompletedData, QuizDismissedData, QuizPassedData, QuizPendingData, QuizShowData } from '@app/events/events';

interface QuizState {
  objectiveId: string;
  conditionIndex: number;
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation?: string;
  pointPenalty: number;
  attempts: number;
  totalPointsDeducted: number;
  isComplete: boolean;
}

/**
 * Singleton class that manages quiz state for status-check conditions
 */
export class QuizManager {
  private static instance_: QuizManager | null = null;

  /** Map of "objectiveId:conditionIndex" -> QuizState */
  private quizStates_: Map<string, QuizState> = new Map();

  /** Key of the currently pending quiz (shown but not completed) */
  private pendingQuizKey_: string | null = null;

  private readonly boundQuizAnsweredHandler_: (data: QuizAnsweredData) => void;
  private readonly boundQuizDismissedHandler_: (data: QuizDismissedData) => void;
  private readonly boundQuizPassedHandler_: (data: QuizPassedData) => void;
  private readonly boundQuizCompletedHandler_: (data: QuizCompletedData) => void;

  private constructor() {
    this.boundQuizAnsweredHandler_ = this.handleQuizAnswered_.bind(this);
    this.boundQuizDismissedHandler_ = this.handleQuizDismissed_.bind(this);
    this.boundQuizPassedHandler_ = this.handleQuizPassed_.bind(this);
    this.boundQuizCompletedHandler_ = this.handleQuizCompleted_.bind(this);

    EventBus.getInstance().on(Events.QUIZ_ANSWERED, this.boundQuizAnsweredHandler_);
    EventBus.getInstance().on(Events.QUIZ_DISMISSED, this.boundQuizDismissedHandler_);
    EventBus.getInstance().on(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
    EventBus.getInstance().on(Events.QUIZ_COMPLETED, this.boundQuizCompletedHandler_);
  }

  static getInstance(): QuizManager {
    QuizManager.instance_ ??= new QuizManager();
    return QuizManager.instance_;
  }

  /**
   * Register a quiz for a specific objective condition
   */
  registerQuiz(
    objectiveId: string,
    conditionIndex: number,
    question: string,
    options: [string, string, string, string],
    correctIndex: 0 | 1 | 2 | 3,
    explanation?: string,
    pointPenalty: number = 5
  ): void {
    const key = this.getKey_(objectiveId, conditionIndex);

    if (!this.quizStates_.has(key)) {
      this.quizStates_.set(key, {
        objectiveId,
        conditionIndex,
        question,
        options,
        correctIndex,
        explanation,
        pointPenalty,
        attempts: 0,
        totalPointsDeducted: 0,
        isComplete: false,
      });

      // Track as pending and emit event so indicator shows
      this.pendingQuizKey_ = key;

      const pendingData: QuizPendingData = {
        objectiveId,
        conditionIndex,
      };
      EventBus.getInstance().emit(Events.QUIZ_PENDING, pendingData);
    }
  }

  /**
   * Check if a quiz exists for this condition
   */
  hasQuiz(objectiveId: string, conditionIndex: number): boolean {
    return this.quizStates_.has(this.getKey_(objectiveId, conditionIndex));
  }

  /**
   * Check if a quiz has been completed (answered correctly)
   */
  isQuizComplete(objectiveId: string, conditionIndex: number): boolean {
    const state = this.quizStates_.get(this.getKey_(objectiveId, conditionIndex));
    return state?.isComplete ?? false;
  }

  /**
   * Check if there is a pending quiz (shown but not completed or still needs to be answered)
   */
  hasPendingQuiz(): boolean {
    return this.pendingQuizKey_ !== null;
  }

  /**
   * Get the key of the pending quiz, or null if none
   */
  getPendingQuizKey(): string | null {
    return this.pendingQuizKey_;
  }

  /**
   * Reopen the pending quiz
   */
  reopenPendingQuiz(): void {
    if (!this.pendingQuizKey_) return;

    const [objectiveId, conditionIndexStr] = this.pendingQuizKey_.split(':');
    const conditionIndex = parseInt(conditionIndexStr, 10);

    this.showQuiz(objectiveId, conditionIndex);
  }

  /**
   * Show a quiz modal for a specific condition
   * Emits QUIZ_SHOW event which the QuizModal listens to
   */
  showQuiz(objectiveId: string, conditionIndex: number): void {
    const key = this.getKey_(objectiveId, conditionIndex);
    const state = this.quizStates_.get(key);

    if (!state) {
      console.error(`No quiz registered for ${key}`);
      return;
    }

    if (state.isComplete) {
      // Quiz already completed, no need to show again
      return;
    }

    // Track this as the pending quiz
    this.pendingQuizKey_ = key;

    const showData: QuizShowData = {
      objectiveId: state.objectiveId,
      conditionIndex: state.conditionIndex,
      question: state.question,
      options: state.options,
      correctIndex: state.correctIndex,
      explanation: state.explanation,
      pointPenalty: state.pointPenalty,
    };

    EventBus.getInstance().emit(Events.QUIZ_SHOW, showData);
  }

  /**
   * Get the current number of attempts for a quiz
   */
  getAttempts(objectiveId: string, conditionIndex: number): number {
    const state = this.quizStates_.get(this.getKey_(objectiveId, conditionIndex));
    return state?.attempts ?? 0;
  }

  /**
   * Get total points deducted for a quiz
   */
  getPointsDeducted(objectiveId: string, conditionIndex: number): number {
    const state = this.quizStates_.get(this.getKey_(objectiveId, conditionIndex));
    return state?.totalPointsDeducted ?? 0;
  }

  /**
   * Reset all quiz states (called when scenario restarts)
   */
  reset(): void {
    this.quizStates_.clear();
    this.pendingQuizKey_ = null;
  }

  /**
   * Destroy the singleton instance and clean up event listeners
   */
  static destroy(): void {
    if (QuizManager.instance_) {
      const instance = QuizManager.instance_;
      EventBus.getInstance().off(Events.QUIZ_ANSWERED, instance.boundQuizAnsweredHandler_);
      EventBus.getInstance().off(Events.QUIZ_DISMISSED, instance.boundQuizDismissedHandler_);
      EventBus.getInstance().off(Events.QUIZ_PASSED, instance.boundQuizPassedHandler_);
      EventBus.getInstance().off(Events.QUIZ_COMPLETED, instance.boundQuizCompletedHandler_);
      instance.reset();
      QuizManager.instance_ = null;
    }
  }

  /**
   * Handle incorrect quiz answer from the modal
   * Correct answers are now handled by QUIZ_PASSED event
   */
  private handleQuizAnswered_(data: QuizAnsweredData): void {
    // Only process incorrect answers - correct answers use QUIZ_PASSED
    if (data.isCorrect) return;

    const key = this.getKey_(data.objectiveId, data.conditionIndex);
    const state = this.quizStates_.get(key);

    if (!state) {
      console.error(`Quiz state not found for ${key}`);
      return;
    }

    state.attempts++;
    state.totalPointsDeducted = data.pointsDeducted;
  }

  /**
   * Handle quiz completed (Continue button pressed after correct answer)
   * This marks the quiz as complete so the objective can advance
   */
  private handleQuizCompleted_(data: QuizCompletedData): void {
    const key = this.getKey_(data.objectiveId, data.conditionIndex);
    const state = this.quizStates_.get(key);

    if (!state) {
      console.error(`Quiz state not found for ${key}`);
      return;
    }

    // Now mark the quiz as complete
    state.isComplete = true;
    state.attempts = data.totalAttempts;
    state.totalPointsDeducted = data.totalPointsDeducted;
  }

  /**
   * Handle quiz dismissed (closed without completing)
   * The quiz remains pending so user can reopen it
   */
  private handleQuizDismissed_(data: QuizDismissedData): void {
    const key = this.getKey_(data.objectiveId, data.conditionIndex);

    // Keep pendingQuizKey_ set - the quiz is still pending
    // This allows the floating indicator to show and user to reopen
    if (this.pendingQuizKey_ === key) {
      // Quiz is still pending, no state change needed
      // The pending indicator will use hasPendingQuiz() to show
    }
  }

  /**
   * Handle quiz passed (correct answer selected, waiting for Continue)
   * Clears pending status but does NOT mark complete yet - that happens on QUIZ_COMPLETED
   */
  private handleQuizPassed_(data: QuizPassedData): void {
    const key = this.getKey_(data.objectiveId, data.conditionIndex);
    const state = this.quizStates_.get(key);

    if (!state) {
      console.error(`Quiz state not found for ${key}`);
      return;
    }

    // Update attempts and points
    state.attempts = data.attempts;
    state.totalPointsDeducted = data.pointsDeducted;

    // Clear pending status - user has answered correctly
    this.pendingQuizKey_ = null;

    // Note: isComplete is NOT set here - it will be set when QUIZ_COMPLETED fires
    // This allows the objective to wait for the Continue button
  }

  private getKey_(objectiveId: string, conditionIndex: number): string {
    return `${objectiveId}:${conditionIndex}`;
  }
}
