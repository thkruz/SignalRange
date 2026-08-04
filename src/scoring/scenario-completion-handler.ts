import { EventBus } from '@app/events/event-bus';
import { Events, ObjectivesAllCompletedData } from '@app/events/events';
import { Logger } from '@app/logging/logger';
import { HintManager } from '@app/modal/hint-manager';
import { LevelCompleteModal } from '@app/modal/level-complete-modal';
import { QuizManager } from '@app/modal/quiz-manager';
import { ObjectivesManager } from '@app/objectives';
import { Router } from '@app/router';
import { ScenarioManager } from '@app/scenario-manager';
import { Auth } from '@app/user-account/auth';
import { getUserDataService } from '@app/user-account/user-data-service';
import { ScoreBreakdown, ScoreCalculator } from './score-calculator';

interface PendingCompletion {
  scenarioId: string;
  score: ScoreBreakdown;
  scenarioNumber: number;
}

/**
 * Orchestrates the scenario completion flow:
 * 1. Listens for all objectives completed
 * 2. Calculates final score
 * 3. Shows completion modal
 * 4. Saves score and navigates on continue
 *
 * Progress persists only to the signed-in account (no local fallback by
 * design - completion is the sign-up funnel). When the player finishes while
 * signed out, the completion is held statically for the rest of the session
 * and flushed the moment a sign-in happens - whether at the Mission Complete
 * modal's sign-up prompt or later from the header.
 */
export class ScenarioCompletionHandler {
  private static instance_: ScenarioCompletionHandler | null = null;

  /** Completion awaiting a sign-in; static so it survives page navigation */
  private static pendingCompletion_: PendingCompletion | null = null;
  /** The auth flush listener lives for the whole session - register it once */
  private static isAuthFlushRegistered_ = false;

  private readonly eventBus_: EventBus;
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

    ScenarioCompletionHandler.registerAuthFlush_();

    this.isInitialized_ = true;
    Logger.info('ScenarioCompletionHandler initialized');
  }

  /**
   * Register the session-long listener that saves a held completion as soon
   * as the player signs in. Deliberately never unsubscribed: the pending
   * completion must survive leaving the scenario page (this class is
   * destroyed on navigation), and a sign-in from anywhere should flush it.
   */
  private static registerAuthFlush_(): void {
    if (ScenarioCompletionHandler.isAuthFlushRegistered_) {
      return;
    }
    ScenarioCompletionHandler.isAuthFlushRegistered_ = true;

    Auth.onAuthStateChange((_event, _user, _profile, accessToken) => {
      if (!accessToken || !ScenarioCompletionHandler.pendingCompletion_) {
        return;
      }
      const pending = ScenarioCompletionHandler.pendingCompletion_;
      ScenarioCompletionHandler.pendingCompletion_ = null;
      // Defer one tick: App.create()'s auth listener registered first and
      // caches the access token UserDataService reads, but don't depend on
      // subscriber ordering.
      setTimeout(() => {
        ScenarioCompletionHandler.saveScore_(pending.scenarioId, pending.score, pending.scenarioNumber);
      }, 0);
    });
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
  private async handleAllObjectivesCompleted_(data: ObjectivesAllCompletedData): Promise<void> {
    Logger.info('All objectives completed, calculating score...');

    const objectivesManager = ObjectivesManager.getInstance();
    const scenarioManager = ScenarioManager.getInstance();

    // Get objective states
    const objectives = [...objectivesManager.getObjectiveStates()];

    // Get time remaining
    const timeRemaining = objectivesManager.getScenarioTimeRemaining();

    // Aggregate quiz penalties
    const quizPenalties = this.aggregateQuizPenalties_(objectives);

    // Aggregate time penalties
    const timePenalties = this.aggregateTimePenalties_(objectives);

    // Aggregate hint penalties
    const hintPenalties = this.aggregateHintPenalties_(objectives);

    // Calculate score
    const score = ScoreCalculator.calculate(objectives, timeRemaining, quizPenalties, timePenalties, hintPenalties);

    Logger.info('Score calculated:', score);

    // Extract campaign ID from current route
    const campaignId = this.extractCampaignId_();
    const scenarioId = scenarioManager.data?.id ?? '';
    const scenarioNumber = scenarioManager.data?.number ?? 0;

    const isAuthenticated = Boolean(await Auth.getSession());
    if (!isAuthenticated) {
      // Hold the completion so a sign-in (now via the modal's prompt, or any
      // time later this session) persists it to the new account.
      ScenarioCompletionHandler.pendingCompletion_ = { scenarioId, score, scenarioNumber };
    }

    // Show the completion modal
    LevelCompleteModal.getInstance().showCompletion(
      {
        score,
        elapsedTimeSeconds: data.totalTime,
        campaignId,
        scenarioId,
        isAuthenticated,
      },
      () => this.saveOnContinue_(scenarioId, score, scenarioNumber)
    );
  }

  /**
   * Continue-button save: persists immediately when signed in (including a
   * sign-in that happened at the modal), otherwise leaves the completion
   * pending for a later sign-in.
   */
  private async saveOnContinue_(scenarioId: string, score: ScoreBreakdown, scenarioNumber: number): Promise<void> {
    const session = await Auth.getSession();

    if (!session) {
      Logger.info(`Not signed in - completion of ${scenarioId} held until sign-in`);
      return;
    }

    ScenarioCompletionHandler.pendingCompletion_ = null;
    await ScenarioCompletionHandler.saveScore_(scenarioId, score, scenarioNumber);
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
   * Aggregate time penalties across all objectives
   */
  private aggregateTimePenalties_(objectives: readonly ReturnType<ObjectivesManager['getObjectiveStates']>[number][]): number {
    return objectives.reduce((total, objState) => {
      return total + (objState.timePenaltyPoints ?? 0);
    }, 0);
  }

  /**
   * Aggregate hint penalties across all objectives
   * Returns 50% of objective points for each objective that had hints requested
   */
  private aggregateHintPenalties_(objectives: readonly ReturnType<ObjectivesManager['getObjectiveStates']>[number][]): number {
    const hintManager = HintManager.getInstance();
    return objectives.reduce((total, objState) => {
      return total + hintManager.getHintPenalty(objState.objective.id);
    }, 0);
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
   * Save the final score to user progress.
   * Static (and reading the service lazily) because the auth-flush path can
   * run after the page that created this handler has been destroyed.
   */
  private static async saveScore_(scenarioId: string, score: ScoreBreakdown, scenarioNumber: number): Promise<void> {
    try {
      // Direct update to specific scenario - backend handles totalScore aggregation
      await getUserDataService().updateScenarioProgress(scenarioId, {
        score: score.totalScore,
        basePoints: score.basePoints,
        timeBonus: score.timeBonus,
        quizPenalties: score.quizPenalties,
        timePenalties: score.timePenalties,
        hintPenalties: score.hintPenalties,
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
   * Reset for testing or scenario restart.
   * Deliberately leaves the pending completion and the auth-flush listener
   * alone: destroy() runs on page navigation, which is exactly when a held
   * completion must survive.
   */
  static destroy(): void {
    if (ScenarioCompletionHandler.instance_) {
      ScenarioCompletionHandler.instance_.dispose();
      ScenarioCompletionHandler.instance_ = null;
    }
  }

  /** Test-only: clear the session-static sign-up-funnel state */
  static __resetFunnelStateForTests__(): void {
    ScenarioCompletionHandler.pendingCompletion_ = null;
    ScenarioCompletionHandler.isAuthFlushRegistered_ = false;
  }
}
