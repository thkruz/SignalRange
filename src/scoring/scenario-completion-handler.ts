import { EventBus } from '@app/events/event-bus';
import { Events, ObjectivesAllCompletedData } from '@app/events/events';
import { Logger } from '@app/logging/logger';
import { LevelCompleteModal } from '@app/modal/level-complete-modal';
import { QuizManager } from '@app/modal/quiz-manager';
import { ObjectivesManager } from '@app/objectives';
import { Router } from '@app/router';
import { ScenarioManager } from '@app/scenario-manager';
import { getUserDataService } from '@app/user-account/user-data-service';
import { ScoreBreakdown, ScoreCalculator } from './score-calculator';

/**
 * Orchestrates the scenario completion flow:
 * 1. Listens for all objectives completed
 * 2. Calculates final score
 * 3. Shows completion modal
 * 4. Saves score and navigates on continue
 */
export class ScenarioCompletionHandler {
  private static instance_: ScenarioCompletionHandler | null = null;

  private readonly eventBus_: EventBus;
  private readonly userDataService_ = getUserDataService();
  private boundHandler_: ((data: ObjectivesAllCompletedData) => void) | null = null;
  private isInitialized_ = false;

  private constructor() {
    this.eventBus_ = EventBus.getInstance();
  }

  static getInstance(): ScenarioCompletionHandler {
    ScenarioCompletionHandler.instance_ ??= new ScenarioCompletionHandler();
    return ScenarioCompletionHandler.instance_;
  }

  /**
   * Initialize the handler - starts listening for completion events
   */
  initialize(): void {
    if (this.isInitialized_) {
      Logger.warn('ScenarioCompletionHandler already initialized');
      return;
    }

    this.boundHandler_ = this.handleAllObjectivesCompleted_.bind(this);
    this.eventBus_.on(Events.OBJECTIVES_ALL_COMPLETED, this.boundHandler_);

    this.isInitialized_ = true;
    Logger.info('ScenarioCompletionHandler initialized');
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (!this.isInitialized_ || !this.boundHandler_) {
      return;
    }

    this.eventBus_.off(Events.OBJECTIVES_ALL_COMPLETED, this.boundHandler_);
    this.boundHandler_ = null;
    this.isInitialized_ = false;
    Logger.info('ScenarioCompletionHandler disposed');
  }

  /**
   * Handle the all objectives completed event
   */
  private handleAllObjectivesCompleted_(data: ObjectivesAllCompletedData): void {
    Logger.info('All objectives completed, calculating score...');

    const objectivesManager = ObjectivesManager.getInstance();
    const scenarioManager = ScenarioManager.getInstance();

    // Get objective states
    const objectives = [...objectivesManager.getObjectiveStates()];

    // Get time remaining
    const timeRemaining = objectivesManager.getScenarioTimeRemaining();

    // Aggregate quiz penalties
    const quizPenalties = this.aggregateQuizPenalties_(objectives);

    // Calculate score
    const score = ScoreCalculator.calculate(objectives, timeRemaining, quizPenalties);

    Logger.info('Score calculated:', score);

    // Extract campaign ID from current route
    const campaignId = this.extractCampaignId_();
    const scenarioId = scenarioManager.data?.id ?? '';

    // Show the completion modal
    LevelCompleteModal.getInstance().showCompletion(
      {
        score,
        elapsedTimeSeconds: data.totalTime,
        campaignId,
        scenarioId,
      },
      () => this.saveScore_(scenarioId, score, data.totalTime)
    );
  }

  /**
   * Aggregate quiz penalties across all objectives
   */
  private aggregateQuizPenalties_(objectives: readonly ReturnType<ObjectivesManager['getObjectiveStates']>[number][]): number {
    const quizManager = QuizManager.getInstance();
    let totalPenalties = 0;

    for (const objState of objectives) {
      const conditions = objState.objective.conditions;
      for (let i = 0; i < conditions.length; i++) {
        if (conditions[i].type === 'status-check') {
          totalPenalties += quizManager.getPointsDeducted(objState.objective.id, i);
        }
      }
    }

    return totalPenalties;
  }

  /**
   * Extract campaign ID from current route
   * Route format: /campaigns/{campaignId}/scenarios/{scenarioId}
   */
  private extractCampaignId_(): string {
    const path = Router.getInstance().getCurrentPath();
    const match = path.match(/^\/campaigns\/([^/]+)/);
    return match?.[1] ?? 'nats'; // Default to 'nats' if not found
  }

  /**
   * Save the final score to user progress
   * Uses direct per-scenario API - no read-modify-write needed
   */
  private async saveScore_(scenarioId: string, score: ScoreBreakdown, _elapsedTime: number): Promise<void> {
    try {
      const scenarioManager = ScenarioManager.getInstance();
      const scenarioNumber = scenarioManager.data?.number ?? 0;

      // Direct update to specific scenario - backend handles totalScore aggregation
      await this.userDataService_.updateScenarioProgress(scenarioId, {
        score: score.totalScore,
        basePoints: score.basePoints,
        timeBonus: score.timeBonus,
        quizPenalties: score.quizPenalties,
        completedAt: new Date().toISOString(),
        lastPlayed: new Date().toISOString(),
        scenarioNumber,
      });

      Logger.info(`Score saved for scenario ${scenarioId}: ${score.totalScore}`);
    } catch (error) {
      Logger.error('Failed to save score:', error);
    }
  }

  /**
   * Reset for testing or scenario restart
   */
  static destroy(): void {
    if (ScenarioCompletionHandler.instance_) {
      ScenarioCompletionHandler.instance_.dispose();
      ScenarioCompletionHandler.instance_ = null;
    }
  }
}
