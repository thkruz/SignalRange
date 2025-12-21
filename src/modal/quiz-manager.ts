/**
 * @file Quiz Manager - Manages quiz state for status-check objective conditions
 * @description Tracks which quizzes have been presented, answered, and completed
 */

import { EventBus } from '@app/events/event-bus';
import { Events, QuizAnsweredData, QuizCompletedData, QuizShowData } from '@app/events/events';

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

  private constructor() {
    // Listen for quiz answered events from the modal
    EventBus.getInstance().on(Events.QUIZ_ANSWERED, this.handleQuizAnswered_.bind(this));
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
  }

  /**
   * Handle quiz answer from the modal
   */
  private handleQuizAnswered_(data: QuizAnsweredData): void {
    const key = this.getKey_(data.objectiveId, data.conditionIndex);
    const state = this.quizStates_.get(key);

    if (!state) {
      console.error(`Quiz state not found for ${key}`);
      return;
    }

    state.attempts++;
    state.totalPointsDeducted = data.pointsDeducted;

    if (data.isCorrect) {
      state.isComplete = true;

      // Emit quiz completed event
      const completedData: QuizCompletedData = {
        objectiveId: data.objectiveId,
        conditionIndex: data.conditionIndex,
        totalAttempts: state.attempts,
        totalPointsDeducted: state.totalPointsDeducted,
      };

      EventBus.getInstance().emit(Events.QUIZ_COMPLETED, completedData);
    }
  }

  private getKey_(objectiveId: string, conditionIndex: number): string {
    return `${objectiveId}:${conditionIndex}`;
  }
}
