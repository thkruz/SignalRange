import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Logger } from '@app/logging/logger';
import { SaveProgressToast } from '@app/modal/save-progress-toast';
import { ScenarioManager } from '@app/scenario-manager';
import { syncManager } from '@app/sync/storage';
import packageJson from '../../package.json';
import { Auth } from './auth';
import { getUserDataService } from './user-data-service';

/**
 * ProgressSaveManager
 *
 * Handles saving scenario progress checkpoints to the backend when objectives are completed.
 * Checkpoints include the full AppState for seamless scenario continuation.
 */
export class ProgressSaveManager {
  private readonly eventBus: EventBus;
  private readonly userDataService = getUserDataService();
  private isInitialized = false;
  private isSaving = false;

  constructor() {
    this.eventBus = EventBus.getInstance();
  }

  /**
   * Initialize the progress save manager
   * Starts listening for objective completion events
   */
  initialize(): void {
    if (this.isInitialized) {
      Logger.warn('ProgressSaveManager already initialized');
      return;
    }

    // Listen for objective completions
    this.eventBus.on(Events.OBJECTIVE_COMPLETED, this.handleObjectiveCompleted.bind(this));
    this.eventBus.on(Events.OBJECTIVES_ALL_COMPLETED, this.handleAllObjectiveCompleted.bind(this));

    this.isInitialized = true;
    Logger.info('ProgressSaveManager initialized');
  }

  /**
   * Handle objective completed event
   */
  private async handleObjectiveCompleted(): Promise<void> {
    // Prevent concurrent saves
    if (this.isSaving) {
      Logger.warn('Already saving progress, skipping...');
      return;
    }

    // Checkpoints only exist server-side; a signed-out session has nowhere to
    // put one (and would otherwise toast a save error on every objective)
    if (!(await Auth.getSession())) {
      Logger.info('Skipping checkpoint save - not signed in');
      return;
    }

    try {
      this.isSaving = true;
      await this.saveCheckpoint();
    } catch (error) {
      Logger.error('Failed to save progress checkpoint:', error);
    } finally {
      this.isSaving = false;
    }
  }

  private async handleAllObjectiveCompleted(): Promise<void> {
    // Signed out: ScenarioCompletionHandler holds the completion and offers
    // sign-up at the Mission Complete modal; it saves after a sign-in
    if (!(await Auth.getSession())) {
      Logger.info('Completion not saved - not signed in (sign-up offered at Mission Complete)');
      return;
    }

    Logger.info('All objectives completed, marking scenario as completed...');
    try {
      // Update scenario progress to mark as completed
      const scenarioManager = ScenarioManager.getInstance();
      const scenarioId = scenarioManager.data.id;

      // Mark scenario as completed with timestamp
      // Note: Score is saved separately by ScenarioCompletionHandler
      await this.userDataService.updateScenarioProgress(scenarioId, {
        completedAt: new Date().toISOString(),
        lastPlayed: new Date().toISOString(),
        scenarioNumber: scenarioManager.data.number,
      });

      Logger.info(`Scenario ${scenarioId} marked as completed`);
    } catch (error) {
      Logger.error('Failed to mark scenario as completed:', error);
    }
  }

  /**
   * Save current state as a checkpoint
   * Uses direct upsert API - no read-modify-write needed
   */
  async saveCheckpoint(): Promise<void> {
    const toast = SaveProgressToast.getInstance();
    const timestamp = Date.now();

    try {
      // Show saving toast and emit start event
      toast.showSaving();
      this.eventBus.emit(Events.PROGRESS_SAVE_START, { timestamp });

      // Get current scenario info
      const scenarioManager = ScenarioManager.getInstance();
      const scenarioId = scenarioManager.data.id;
      const version = packageJson.version;

      // Get current equipment state
      const state = syncManager.getCurrentState();

      // Direct upsert - no need to read first
      await this.userDataService.saveCheckpoint(scenarioId, {
        version,
        state,
      });

      Logger.info(`Progress checkpoint saved for scenario: ${scenarioId}`);

      // Show success toast and emit success event
      toast.showSuccess();
      this.eventBus.emit(Events.PROGRESS_SAVE_SUCCESS, {
        timestamp: Date.now(),
        checkpointId: scenarioId
      });
    } catch (error) {
      Logger.error('Failed to save checkpoint:', error);

      // Show error toast and emit error event
      toast.showError();
      this.eventBus.emit(Events.PROGRESS_SAVE_ERROR, {
        timestamp: Date.now(),
        error: error as Error
      });

      throw error;
    }
  }

  /**
   * Load checkpoint for a specific scenario
   * Uses direct API - no need to load all checkpoints
   */
  async loadCheckpoint(scenarioId: string): Promise<any | null> {
    try {
      const checkpoint = await this.userDataService.getCheckpoint(scenarioId);

      if (checkpoint) {
        Logger.info(`Checkpoint found for scenario: ${scenarioId}`, checkpoint);
        return checkpoint;
      }

      Logger.info(`No checkpoint found for scenario: ${scenarioId}`);
      return null;
    } catch (error) {
      Logger.error('Failed to load checkpoint:', error);
      return null;
    }
  }

  /**
   * Clear checkpoint for a specific scenario
   * Uses direct delete API
   */
  async clearCheckpoint(scenarioId: string): Promise<void> {
    try {
      await this.userDataService.deleteCheckpoint(scenarioId);
      Logger.info(`Checkpoint cleared for scenario: ${scenarioId}`);
    } catch (error) {
      Logger.error('Failed to clear checkpoint:', error);
      throw error;
    }
  }

  /**
   * Check if a checkpoint exists for a scenario
   * Uses lightweight HEAD request
   */
  async hasCheckpoint(scenarioId: string): Promise<boolean> {
    try {
      return await this.userDataService.checkpointExists(scenarioId);
    } catch (error) {
      Logger.error('Failed to check for checkpoint:', error);
      return false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (!this.isInitialized) {
      return;
    }

    this.eventBus.off(Events.OBJECTIVE_COMPLETED, this.handleObjectiveCompleted.bind(this));
    this.isInitialized = false;
    Logger.info('ProgressSaveManager disposed');
  }
}
