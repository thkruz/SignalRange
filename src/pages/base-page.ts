import { BaseElement } from "@app/components/base-element";
import { EventBus } from "@app/events/event-bus";
import { DualTransmissionViolationData, Events, ObjectiveFailedData, ScenarioTimeExpiredData } from "@app/events/events";
import { Logger } from "@app/logging/logger";
import { DialogHistoryManager } from "@app/modal/dialog-history-manager";
import { DialogManager } from "@app/modal/dialog-manager";
import { LevelCompleteModal } from "@app/modal/level-complete-modal";
import { ObjectiveFailedModal } from "@app/modal/objective-failed-modal";
import { QuizModal } from "@app/modal/quiz-modal";
import { TimePenaltyToast } from "@app/modal/time-penalty-toast";
import { ObjectivesManager } from "@app/objectives/objectives-manager";
import { EventAutoLogger } from "@app/ops-log/event-auto-logger";
import { OpsLogManager } from "@app/ops-log/ops-log-manager";
import { NavigationOptions, Router } from "@app/router";
import { ScenarioManager } from "@app/scenario-manager";
import { ScenarioDialogManager } from "@app/scenarios/scenario-dialog-manager";
import { ScenarioCompletionHandler } from "@app/scoring/scenario-completion-handler";
import { ScoreCalculator } from "@app/scoring/score-calculator";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { AppState } from "@app/sync/storage";
import { ProgressSaveManager } from "@app/user-account/progress-save-manager";
import { ScenarioProgressEntry } from "@app/user-account/types";
import { getUserDataService } from "@app/user-account/user-data-service";

export abstract class BasePage extends BaseElement {
  abstract id: string;
  protected progressSaveManager_: ProgressSaveManager | null = null;
  protected navigationOptions_: NavigationOptions = {};

  show(): void {
    if (!this.dom_) return;
    this.dom_.style.display = 'flex';
  }

  hide(): void {
    if (!this.dom_) return;
    this.dom_.style.display = 'none';
  }

  /**
   * Initialize the progress save manager and completion handler.
   * Call this in subclass init_() methods.
   */
  protected initProgressSaveManager_(): void {
    this.progressSaveManager_ = new ProgressSaveManager();
    this.progressSaveManager_.initialize();

    // Initialize scenario completion handler for scoring popup
    ScenarioCompletionHandler.getInstance().initialize();

    // Initialize time penalty toast to show notifications when penalties are applied
    TimePenaltyToast.getInstance();
  }

  /**
   * Initialize objectives, dialogs, and emit DOM_READY event.
   * Call this in subclass initializeAsync_() methods after page-specific initialization.
   * Note: Caller should ensure SimulationManager is already initialized before calling this.
   */
  protected async initializeObjectivesAndDialogs_(): Promise<void> {
    const scenario = ScenarioManager.getInstance();

    // Check if scenario is already complete (skip if continuing from checkpoint or replaying)
    if (!this.navigationOptions_.continueFromCheckpoint && !this.navigationOptions_.forceReplay) {
      const savedProgress = await this.checkScenarioAlreadyComplete_();
      if (savedProgress) {
        this.showAlreadyCompleteModal_(savedProgress);
        EventBus.getInstance().emit(Events.DOM_READY);
        return; // Skip normal initialization - no timers started
      }
    }

    // Initialize ops log manager (always, for all scenarios)
    OpsLogManager.initialize(
      scenario.settings.scenarioStartWallTime,
      scenario.settings.scenarioStartDate,
      scenario.settings.previousShiftLogs
    );

    // Initialize event auto-logger (logs equipment events for beginner/intermediate)
    EventAutoLogger.getInstance().initialize();

    // Initialize objectives manager if scenario has objectives
    if (scenario.data?.objectives && scenario.data.objectives.length > 0) {
      // Pass scenario time limit if defined
      ObjectivesManager.initialize(scenario.data.objectives, scenario.data.timeLimitSeconds);
      SimulationManager.getInstance().objectivesManager = ObjectivesManager.getInstance();

      // Subscribe to failure events
      this.subscribeToFailureEvents_();

      // Initialize scenario dialog manager for objective completion dialogs
      ScenarioDialogManager.getInstance().initialize();

      // Initialize quiz modal for status-check objective conditions
      QuizModal.getInstance();

      // If we're continuing from a checkpoint, restore objective states
      if (this.navigationOptions_.continueFromCheckpoint) {
        await this.restoreObjectiveStatesFromCheckpoint_();
      }

      // Check if all objectives are already complete (e.g., from restored checkpoint)
      // This handles the case where user refreshes after completing but before clicking Continue
      // Skip this check if replaying - we want a fresh start
      if (!this.navigationOptions_.forceReplay) {
        const objectivesManager = ObjectivesManager.getInstance();
        if (objectivesManager.areAllObjectivesCompleted()) {
          Logger.info('All objectives already complete on load, triggering completion flow');
          // Stop all timers since scenario is complete
          objectivesManager.stopAllTimers();
          EventBus.getInstance().emit(Events.OBJECTIVES_ALL_COMPLETED, {
            completedObjectives: [...objectivesManager.getObjectiveStates()],
            totalTime: objectivesManager.getElapsedTime(),
          });
        }
      }
    } else if (OpsLogManager.isInitialized()) {
      // No objectives - resume simulated time immediately
      // (OpsLogManager starts paused by default, waiting for scenario to unlock)
      OpsLogManager.getInstance().resume();
    }

    EventBus.getInstance().emit(Events.DOM_READY);

    // Show intro dialog if available and not continuing from checkpoint
    const introClip = scenario.data?.dialogClips?.intro;
    if (introClip && !this.navigationOptions_.continueFromCheckpoint) {
      DialogManager.getInstance().show(
        introClip.text,
        introClip.character,
        introClip.audioUrl,
        'Introduction',
        introClip.emotion
      );
    }
  }

  /**
   * Subscribe to objective/scenario failure events to show the failure modal
   */
  protected subscribeToFailureEvents_(): void {
    const eventBus = EventBus.getInstance();

    eventBus.on(Events.OBJECTIVE_FAILED, (data: ObjectiveFailedData) => {
      ObjectiveFailedModal.getInstance().showFailure({
        title: 'Objective Failed',
        message: `Time expired for: ${data.objective.title}`,
        objectiveId: data.objectiveId,
        isScenarioTimeout: false,
      });
    });

    eventBus.on(Events.SCENARIO_TIME_EXPIRED, (data: ScenarioTimeExpiredData) => {
      const minutes = Math.floor(data.timeLimit / 60);
      const minuteWord = minutes === 1 ? 'minute' : 'minutes';
      ObjectiveFailedModal.getInstance().showFailure({
        title: 'Mission Failed',
        message: `Scenario time limit of ${minutes} ${minuteWord} has expired.`,
        isScenarioTimeout: true,
      });
    });

    eventBus.on(Events.DUAL_TRANSMISSION_VIOLATION, (data: DualTransmissionViolationData) => {
      ObjectiveFailedModal.getInstance().showFailure({
        title: 'Mission Failed',
        message: `CRITICAL ERROR: Dual transmission detected! Ground stations ${data.groundStation1Id} and ${data.groundStation2Id} are both transmitting to satellite ${data.satelliteNoradId}. This causes satellite interference and mission failure.`,
        isScenarioTimeout: false,
      });
    });
  }

  /**
   * Restore objective states from checkpoint after ObjectivesManager has been initialized
   */
  protected async restoreObjectiveStatesFromCheckpoint_(): Promise<void> {
    if (!this.progressSaveManager_) {
      return;
    }

    try {
      const scenario = ScenarioManager.getInstance();
      const checkpoint = await this.progressSaveManager_.loadCheckpoint(scenario.data.id) as {
        state: AppState;
      };

      // Restore OpsLogManager state if available
      if (checkpoint?.state?.opsLogState) {
        if (OpsLogManager.isInitialized()) {
          OpsLogManager.getInstance().restoreState(checkpoint.state.opsLogState);
          Logger.info('OpsLogManager state restored from checkpoint');
        }
      }

      if (checkpoint?.state?.objectiveStates) {
        const objectivesManager = ObjectivesManager.getInstance();
        objectivesManager.restoreState(
          checkpoint.state.objectiveStates,
          checkpoint.state.scenarioTimeRemaining
        );
        Logger.info('Objective states restored from checkpoint');

        // Reconstruct dialog history from completed objectives
        DialogHistoryManager.getInstance().reconstructFromCompletedObjectives(
          scenario.data.dialogClips,
          checkpoint.state.objectiveStates,
          scenario.data.objectives ?? []
        );
      }
    } catch (error) {
      Logger.error('Failed to restore objective states from checkpoint:', error);
      // Continue without restoring objectives - they'll start fresh
    }
  }

  /**
   * Clean up progress save manager and completion handler.
   * Call this in subclass destroy() methods.
   */
  protected disposeProgressSaveManager_(): void {
    if (this.progressSaveManager_) {
      this.progressSaveManager_.dispose();
      this.progressSaveManager_ = null;
    }

    // Clean up scenario completion handler
    ScenarioCompletionHandler.destroy();
  }

  /**
   * Check if the current scenario is already marked as complete.
   * Returns the saved progress entry if complete, null otherwise.
   * Uses direct per-scenario API for efficient lookup.
   */
  private async checkScenarioAlreadyComplete_(): Promise<ScenarioProgressEntry | null> {
    const scenario = ScenarioManager.getInstance();
    const scenarioId = scenario.data?.id;
    if (!scenarioId) return null;

    try {
      const progress = await getUserDataService().getScenarioProgress(scenarioId);

      // Return null if no progress or not completed
      if (!progress?.completedAt) return null;

      // Convert to legacy ScenarioProgressEntry format for compatibility
      return {
        completedObjectives: progress.completedObjectives,
        score: progress.score,
        basePoints: progress.basePoints,
        timeBonus: progress.timeBonus,
        quizPenalties: progress.quizPenalties,
        completedAt: progress.completedAt,
        lastPlayed: progress.lastPlayed,
      };
    } catch (error) {
      Logger.error('Failed to check scenario completion status:', error);
      return null;
    }
  }

  /**
   * Show the completion modal for an already-complete scenario.
   */
  private showAlreadyCompleteModal_(savedProgress: ScenarioProgressEntry): void {
    const scenario = ScenarioManager.getInstance();
    const campaignId = this.extractCampaignId_();

    const timeBonus = savedProgress.timeBonus ?? 0;
    LevelCompleteModal.getInstance().showCompletion(
      {
        score: {
          basePoints: savedProgress.basePoints ?? 0,
          timeBonus,
          quizPenalties: savedProgress.quizPenalties ?? 0,
          timePenalties: savedProgress.timePenalties ?? 0,
          hintPenalties: savedProgress.hintPenalties ?? 0,
          totalScore: savedProgress.score ?? 0,
          objectiveBreakdown: [], // Not saved, show empty for replays
          timeRemainingSeconds: timeBonus * ScoreCalculator.TIME_BONUS_DIVISOR,
        },
        elapsedTimeSeconds: 0,
        campaignId,
        scenarioId: scenario.data?.id ?? '',
      },
      undefined,
      true
    );
  }

  /**
   * Extract campaign ID from current route.
   * Route format: /campaigns/{campaignId}/scenarios/{scenarioId}
   */
  private extractCampaignId_(): string {
    const path = Router.getInstance().getCurrentPath();
    const match = path.match(/^\/campaigns\/([^/]+)/);
    return match?.[1] ?? 'nats';
  }
}