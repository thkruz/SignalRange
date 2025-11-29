import { BaseElement } from "@app/components/base-element";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { Logger } from "@app/logging/logger";
import { Character } from "@app/modal/character-enum";
import { DialogManager } from "@app/modal/dialog-manager";
import { ObjectivesManager } from "@app/objectives/objectives-manager";
import { NavigationOptions } from "@app/router";
import { ScenarioManager } from "@app/scenario-manager";
import { ScenarioDialogManager } from "@app/scenarios/scenario-dialog-manager";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { AppState } from "@app/sync/storage";
import { Auth } from "@app/user-account/auth";
import { ProgressSaveManager } from "@app/user-account/progress-save-manager";
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
   * Initialize the progress save manager. Call this in subclass init_() methods.
   */
  protected initProgressSaveManager_(): void {
    this.progressSaveManager_ = new ProgressSaveManager();
    this.progressSaveManager_.initialize();
  }

  /**
   * Initialize objectives, dialogs, and emit DOM_READY event.
   * Call this in subclass initializeAsync_() methods after page-specific initialization.
   * Note: Caller should ensure SimulationManager is already initialized before calling this.
   */
  protected async initializeObjectivesAndDialogs_(): Promise<void> {
    // Initialize objectives manager if scenario has objectives
    const scenario = ScenarioManager.getInstance();
    if (scenario.data?.objectives && scenario.data.objectives.length > 0) {
      ObjectivesManager.initialize(scenario.data.objectives);
      SimulationManager.getInstance().objectivesManager = ObjectivesManager.getInstance();

      // Initialize scenario dialog manager for objective completion dialogs
      ScenarioDialogManager.getInstance().initialize();

      // If we're continuing from a checkpoint, restore objective states
      if (this.navigationOptions_.continueFromCheckpoint) {
        await this.restoreObjectiveStatesFromCheckpoint_();
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
        objectivesManager.restoreState(checkpoint.state.objectiveStates);
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
   * Clean up progress save manager. Call this in subclass destroy() methods.
   */
  protected disposeProgressSaveManager_(): void {
    if (this.progressSaveManager_) {
      this.progressSaveManager_.dispose();
      this.progressSaveManager_ = null;
    }
  }
}