import { CampaignManager } from '@app/campaigns/campaign-manager';
import { EventBus } from '@app/events/event-bus';
import { Events, ObjectivesAllCompletedData } from '@app/events/events';
import { Logger } from '@app/logging/logger';
import { DecisionManager } from '@app/modal/decision-manager';
import { DialogManager } from '@app/modal/dialog-manager';
import { HintManager } from '@app/modal/hint-manager';
import { LevelCompleteModal } from '@app/modal/level-complete-modal';
import { QuizManager } from '@app/modal/quiz-manager';
import { QuizModal } from '@app/modal/quiz-modal';
import { ObjectivesManager } from '@app/objectives';
import { campaignEpilogue } from '@app/presentation/campaign-epilogue';
import { Router } from '@app/router';
import { ScenarioManager } from '@app/scenario-manager';
import { ScenarioDialogManager } from '@app/scenarios/scenario-dialog-manager';
import { notifySavedAchievements } from '@app/user-account/achievement-notifications';
import { Auth } from '@app/user-account/auth';
import { selectionProgressCache } from '@app/user-account/selection-progress-cache';
import type { ScenarioProgress } from '@app/user-account/types';
import { getUserDataService } from '@app/user-account/user-data-service';
import { buildMissionDebrief, type MissionDebrief } from './mission-debrief';
import { readMissionRecord, rememberMissionResult } from './mission-records';
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
  /** How often the completion flow re-checks for open dialogs and quizzes, ms */
  static readonly QUIET_POLL_MS = 200;

  private readonly eventBus_: EventBus;
  private boundHandler_: ((data: ObjectivesAllCompletedData) => void) | null = null;
  private isInitialized_ = false;
  private baseline_: { account: string; results: ScenarioProgress[] } | null = null;

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
    void (async () => {
      const session = await Auth.getSession();
      if (!session?.user?.id) return;
      const progress = await selectionProgressCache.getProgress();
      if (progress) this.baseline_ = { account: session.user.id, results: progress.scenarios.map((result) => ({ ...result })) };
    })().catch(() => {});
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
        void ScenarioCompletionHandler.saveScore_(pending.scenarioId, pending.score, pending.scenarioNumber).catch(() => {
          ScenarioCompletionHandler.pendingCompletion_ = pending;
        });
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
    const decisionPenalties = this.aggregateDecisionPenalties_(objectives);
    const score = ScoreCalculator.calculate(objectives, timeRemaining, quizPenalties, timePenalties, hintPenalties, decisionPenalties);

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

    // The score and "Completed in" were fixed above, at the moment of
    // completion; holding the modal until the closing lines are read only
    // changes when it opens (nats-r3-s03-F3)
    const isStillOnPage = await this.waitForQuietScreen_();
    if (!isStillOnPage) {
      return;
    }

    let debrief: MissionDebrief | undefined;
    // The score screen must still open if the optional history request is offline or slow.
    const baseline = this.baseline_;
    const session = await Auth.getSession();
    const current = {
      scenarioId,
      score: score.totalScore,
      completedAt: new Date().toISOString(),
      quizPenalties: score.quizPenalties + score.decisionPenalties,
      timePenalties: score.timePenalties,
    } as ScenarioProgress;
    if (baseline && baseline.account === session?.user?.id) {
      debrief = buildMissionDebrief(CampaignManager.getInstance().getAllCampaigns(), campaignId, baseline.results, current, readMissionRecord(baseline.account, scenarioId));
    } else {
      // Guest/dev play and unavailable account history must not suppress the ending.
      const campaign = CampaignManager.getInstance().getCampaign(campaignId);
      const epilogue = campaign && campaignEpilogue(campaign, [current]);
      if (epilogue) {
        if (epilogue.record) epilogue.record.note = `Only this mission's result is available here. ${epilogue.record.note}`;
        debrief = { bestScore: score.totalScore, personalBest: false, achievements: [], newlyUnlocked: false, epilogue };
      }
    }
    // Show the completion modal on top of an empty screen
    LevelCompleteModal.getInstance().showCompletion(
      {
        score,
        elapsedTimeSeconds: data.totalTime,
        campaignId,
        scenarioId,
        isAuthenticated,
        debrief,
        niceTaskCodes: [
          ...new Set(
            objectives
              .filter((state) => state.isCompleted)
              .flatMap((state) => state.objective.nice ?? [])
              .filter((code) => /^T\d{4}$/u.test(code))
          ),
        ].sort(),
        decisions: DecisionManager.hasInstance() ? DecisionManager.getInstance().getRecords() : undefined,
      },
      () => this.saveOnContinue_(scenarioId, score, scenarioNumber)
    );
  }

  /**
   * Resolve once no character dialog is on screen, queued or about to be
   * scheduled, and no quiz is open, so Mission Complete opens on top instead
   * of underneath the closing dialog. Resolves false if the page was left
   * while waiting.
   */
  private waitForQuietScreen_(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (!this.isInitialized_) {
          resolve(false);
          return;
        }
        if (ScenarioCompletionHandler.isScreenQuiet_()) {
          resolve(true);
          return;
        }
        setTimeout(check, ScenarioCompletionHandler.QUIET_POLL_MS);
      };
      check();
    });
  }

  private static isScreenQuiet_(): boolean {
    return !ScenarioDialogManager.hasPendingClips() && !DialogManager.getInstance().isBusy() && !QuizModal.isShowingQuiz();
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

    await ScenarioCompletionHandler.saveScore_(scenarioId, score, scenarioNumber);
    ScenarioCompletionHandler.pendingCompletion_ = null;
  }

  /**
   * Aggregate quiz penalties across all objectives
   */
  /** Sum the penalty tally of every decision condition (zero when no decision was registered) */
  private aggregateDecisionPenalties_(objectives: readonly ReturnType<ObjectivesManager['getObjectiveStates']>[number][]): number {
    if (!DecisionManager.hasInstance()) return 0;
    const decisions = DecisionManager.getInstance();
    let total = 0;

    for (const objState of objectives) {
      const conditions = objState.objective.conditions;
      for (let i = 0; i < conditions.length; i++) {
        if (conditions[i].type === 'decision') {
          total += decisions.getPointsDeducted(objState.objective.id, i);
        }
      }
    }

    return total;
  }

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
    return objectives.reduce((total, objState) => total + (objState.timePenaltyPoints ?? 0), 0);
  }

  /**
   * Aggregate hint penalties across all objectives
   * Returns 50% of objective points for each objective that had hints requested
   */
  private aggregateHintPenalties_(objectives: readonly ReturnType<ObjectivesManager['getObjectiveStates']>[number][]): number {
    const hintManager = HintManager.getInstance();
    return objectives.reduce((total, objState) => total + hintManager.getHintPenalty(objState.objective.id), 0);
  }

  /**
   * Extract campaign ID from current route
   * Route format: /campaigns/{campaignId}/scenarios/{scenarioId}
   */
  private extractCampaignId_(): string {
    const path = Router.getInstance().getCurrentPath();
    const match = path.match(/^\/campaigns\/([^/]+)/u);
    return match?.[1] ?? 'nats'; // Default to 'nats' if not found
  }

  /**
   * Save the final score to user progress.
   * Static (and reading the service lazily) because the auth-flush path can
   * run after the page that created this handler has been destroyed.
   */
  private static async saveScore_(scenarioId: string, score: ScoreBreakdown, scenarioNumber: number): Promise<void> {
    try {
      const completedAt = new Date().toISOString();
      const account = selectionProgressCache.accountId;
      // Direct update to specific scenario - backend handles totalScore aggregation
      await getUserDataService().updateScenarioProgress(scenarioId, {
        score: score.totalScore,
        basePoints: score.basePoints,
        timeBonus: score.timeBonus,
        // The progress record has no decision column; fold decisions into the
        // quiz figure so the persisted parts still sum to the total.
        quizPenalties: score.quizPenalties + score.decisionPenalties,
        timePenalties: score.timePenalties,
        hintPenalties: score.hintPenalties,
        completedAt,
        lastPlayed: new Date().toISOString(),
        scenarioNumber,
      });
      rememberMissionResult(account, { scenarioId, score: score.totalScore, completedAt });

      Logger.info(`Score saved for scenario ${scenarioId}: ${score.totalScore}`);
      void notifySavedAchievements();
    } catch (error) {
      Logger.error('Failed to save score:', error);
      throw error;
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
