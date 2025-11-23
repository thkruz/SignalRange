import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Logger } from '@app/logging/logger';
import { SaveProgressToast } from '@app/modal/save-progress-toast';
import { ScenarioManager } from '@app/scenario-manager';
import { syncManager } from '@app/sync/storage';
import packageJson from '../../package.json';
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
    Logger.info('All objectives completed, saving final checkpoint...');
    try {
      // Update user progress to mark scenario as completed
      const scenarioManager = ScenarioManager.getInstance();

      const progress = await this.userDataService.getUserProgress();
      const completedScenarios = new Set(progress.completedScenarios || []);
      completedScenarios.add(scenarioManager.data.number);

      await this.userDataService.updateUserProgress({
        completedScenarios: Array.from(completedScenarios),
      });
    } catch (error) {
      Logger.error('Failed to save final progress checkpoint:', error);
    }
  }

  /**
   * Save current state as a checkpoint
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

      // Fetch existing progress
      const currentProgress = await this.userDataService.getUserProgress();

      // Get existing signalForge array or create new one
      const signalForge = currentProgress.signalForge || [];

      // Find existing checkpoint for this scenario
      const existingIndex = signalForge.findIndex(
        (checkpoint) => checkpoint.scenarioId === scenarioId
      );

      // Create new checkpoint
      const newCheckpoint = {
        scenarioId,
        version,
        state,
        savedAt: Date.now(),
      };

      // Replace or add checkpoint
      if (existingIndex >= 0) {
        signalForge[existingIndex] = newCheckpoint;
      } else {
        signalForge.push(newCheckpoint);
      }

      // Save updated progress
      await this.userDataService.updateUserProgress({ signalForge });

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
   */
  async loadCheckpoint(scenarioId: string): Promise<any | null> {
    try {
      const progress = await this.userDataService.getUserProgress();
      const signalForge = progress.signalForge || [];

      const checkpoint = signalForge.find((cp) => cp.scenarioId === scenarioId);

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
   */
  async clearCheckpoint(scenarioId: string): Promise<void> {
    try {
      const progress = await this.userDataService.getUserProgress();
      const signalForge = progress.signalForge || [];

      // Filter out the checkpoint for this scenario
      const updatedSignalForge = signalForge.filter((cp) => cp.scenarioId !== scenarioId);

      // Only update if something changed
      if (updatedSignalForge.length !== signalForge.length) {
        await this.userDataService.updateUserProgress({ signalForge: updatedSignalForge });
        Logger.info(`Checkpoint cleared for scenario: ${scenarioId}`);
      }
    } catch (error) {
      Logger.error('Failed to clear checkpoint:', error);
      throw error;
    }
  }

  /**
   * Check if a checkpoint exists for a scenario
   */
  async hasCheckpoint(scenarioId: string): Promise<boolean> {
    try {
      const checkpoint = await this.loadCheckpoint(scenarioId);
      return checkpoint !== null;
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
