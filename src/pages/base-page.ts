import { BaseElement } from "@app/components/base-element";
import { EventBus } from "@app/events/event-bus";
import { Events, ObjectiveFailedData, ScenarioTimeExpiredData } from "@app/events/events";
import { Logger } from "@app/logging/logger";
import { Character } from "@app/modal/character-enum";
import { DialogManager } from "@app/modal/dialog-manager";
import { LevelCompleteModal } from "@app/modal/level-complete-modal";
import { ObjectiveFailedModal } from "@app/modal/objective-failed-modal";
import { QuizModal } from "@app/modal/quiz-modal";
import { ObjectivesManager } from "@app/objectives/objectives-manager";
import { NavigationOptions, Router } from "@app/router";
import { ScenarioManager } from "@app/scenario-manager";
import { ScenarioDialogManager } from "@app/scenarios/scenario-dialog-manager";
import { ScenarioCompletionHandler } from "@app/scoring/scenario-completion-handler";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { AppState } from "@app/sync/storage";
import { Auth } from "@app/user-account/auth";
import { ProgressSaveManager } from "@app/user-account/progress-save-manager";
import { ScenarioProgressEntry } from "@app/user-account/types";
import { getUserDataService } from "@app/user-account/user-data-service";
import { getAssetUrl } from "@app/utils/asset-url";

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

      // Schedule login prompt dialog to show 5 seconds after intro dialog is closed
      this.scheduleLoginPrompt_();
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

      if (checkpoint?.state?.objectiveStates) {
        const objectivesManager = ObjectivesManager.getInstance();
        objectivesManager.restoreState(
          checkpoint.state.objectiveStates,
          checkpoint.state.scenarioTimeRemaining
        );
        Logger.info('Objective states restored from checkpoint');
      }
    } catch (error) {
      Logger.error('Failed to restore objective states from checkpoint:', error);
      // Continue without restoring objectives - they'll start fresh
    }
  }

  /**
   * Schedule login prompt dialog to show 5 seconds after the intro dialog is closed
   */
  protected scheduleLoginPrompt_(): void {
    // Check periodically if the intro dialog has been closed
    const checkDialogClosed = setInterval(() => {
      const dialogManager = DialogManager.getInstance();

      if (!dialogManager.isShowing()) {
        // Dialog is closed, clear the interval and schedule the login prompt
        clearInterval(checkDialogClosed);

        // Wait 5 seconds, then check if user is logged in
        setTimeout(async () => {
          const isLoggedIn = await Auth.isLoggedIn();

          if (!isLoggedIn) {
            // User is not logged in, show the login prompt dialog
            dialogManager.show(
              `
              <p>
              Hey, normally you make an account on the computer and log what you are doing.
              </p>
              <p>
              If you want to keep your notes on your desk, that's up to you, but just know none of us will have any idea what you did today if you ask us tomorrow!
              </p>

              <p>
              (You can make an account in the top right corner of the screen in order to save your progress automatically. It's free and only takes a minute!)
              </p>
              `,
              Character.CHARLIE_BROOKS,
              getAssetUrl('/assets/campaigns/login-first.mp3'),
              'Login Reminder'
            );
          }
        }, 5000);
      }
    }, 100); // Check every 100ms
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

    LevelCompleteModal.getInstance().showCompletion(
      {
        score: {
          basePoints: savedProgress.basePoints ?? 0,
          timeBonus: savedProgress.timeBonus ?? 0,
          quizPenalties: savedProgress.quizPenalties ?? 0,
          totalScore: savedProgress.score ?? 0,
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