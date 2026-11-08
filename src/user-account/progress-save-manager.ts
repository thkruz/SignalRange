import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Logger } from '@app/logging/logger';
import { SaveProgressToast } from '@app/modal/save-progress-toast';
import { ScenarioManager } from '@app/scenario-manager';
import { SimClock } from '@app/simulation/sim-clock';
import { type AppState, syncManager } from '@app/sync/storage';
import packageJson from '../../package.json';
import { Auth } from './auth';
import { checkpointRecovery } from './checkpoint-recovery';
import { ReplaySession } from './replay-session';
import { selectionProgressCache } from './selection-progress-cache';
import type { Checkpoint } from './types';
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
  private static pendingSave_: Promise<void> = Promise.resolve();
  private static lastCaptureMs_ = 0;
  private accountId_: string | null = null;
  private interval_: ReturnType<typeof setInterval> | null = null;
  private completed_ = false;
  private readonly boundObjective_ = this.handleObjectiveCompleted.bind(this);
  private readonly boundComplete_ = this.handleAllObjectiveCompleted.bind(this);
  private readonly boundOnline_ = (): void => {
    void this.retrySave().catch(() => {});
  };
  private readonly boundPageHide_ = (): void => {
    this.captureRecovery_();
  };
  private readonly boundVisibility_ = (): void => {
    if (document.hidden) this.captureRecovery_();
  };

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
    this.eventBus.on(Events.OBJECTIVE_COMPLETED, this.boundObjective_);
    this.eventBus.on(Events.OBJECTIVES_ALL_COMPLETED, this.boundComplete_);
    void Auth.getSession().then((session) => {
      if (this.isInitialized) this.accountId_ = session?.user?.id ?? null;
    });
    window.addEventListener('online', this.boundOnline_);
    window.addEventListener('pagehide', this.boundPageHide_);
    document.addEventListener('visibilitychange', this.boundVisibility_);
    this.interval_ = setInterval(() => {
      if (!this.completed_ && !this.isSaving && !document.hidden && !SimClock.isPaused('menu')) void this.handleObjectiveCompleted();
    }, 30_000);

    this.isInitialized = true;
    Logger.info('ProgressSaveManager initialized');
  }

  /**
   * Handle objective completed event
   */
  private async handleObjectiveCompleted(): Promise<void> {
    if (SimClock.isPaused('loading')) return;
    // A replayed player save must never overwrite the developer's own checkpoint
    if (ReplaySession.isActive()) {
      Logger.info('Skipping checkpoint save - replay session');
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
    this.completed_ = true;
    // Signed out: ScenarioCompletionHandler holds the completion and offers
    // sign-up at the Mission Complete modal; it saves after a sign-in
    if (!(await Auth.getSession())) {
      Logger.info('Completion not saved - not signed in (sign-up offered at Mission Complete)');
      return;
    }

    if (ReplaySession.isActive()) {
      Logger.info('Completion not saved - replay session');
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
  saveCheckpoint(): Promise<void> {
    const initialAccount = selectionProgressCache.accountId;
    const scenarioId = ScenarioManager.getInstance().data.id;
    const state = JSON.parse(JSON.stringify(syncManager.getCurrentState() ?? {})) as AppState;
    const previous = checkpointRecovery.read(initialAccount, scenarioId)?.checkpoint.savedAt;
    const capturedAt = Math.max(Date.now(), ProgressSaveManager.lastCaptureMs_ + 1, previous ? Date.parse(previous) + 1 : 0);
    ProgressSaveManager.lastCaptureMs_ = capturedAt;
    // Capture immediately, including while an earlier upload is in flight.
    const prepared = Auth.getSession().then((session) => {
      if (!session || ReplaySession.isActive()) return null;
      const owner = session.user?.id;
      if (!owner) throw new Error('Sign in again to save this mission.');
      if (initialAccount && initialAccount !== owner) throw new Error('Account changed while saving.');
      this.accountId_ = owner;
      const checkpoint = this.makeCheckpoint_(owner, scenarioId, state, capturedAt);
      return { checkpoint, locallySaved: checkpointRecovery.write(checkpoint) };
    });
    // Register the full operation synchronously so navigation also waits for authentication.
    const save = Promise.all([ProgressSaveManager.pendingSave_, prepared]).then(async ([, entry]) => {
      if (entry) await this.persistCheckpoint_(entry.checkpoint, entry.locallySaved);
    });
    ProgressSaveManager.pendingSave_ = save.catch(() => undefined);
    return save;
  }

  async waitForPendingSave(): Promise<void> {
    await ProgressSaveManager.pendingSave_;
  }

  private makeCheckpoint_(owner: string, mission: string, state: AppState, capturedAt?: number): Checkpoint {
    const previous = checkpointRecovery.read(owner, mission)?.checkpoint.savedAt;
    const savedAt = new Date(capturedAt ?? Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
    return { id: mission, userId: owner, appId: 'signalrange', scenarioId: mission, version: packageJson.version, state, savedAt, createdAt: savedAt, updatedAt: savedAt };
  }

  private captureRecovery_(): void {
    if (!this.isInitialized || SimClock.isPaused('loading') || !this.accountId_ || this.accountId_ !== selectionProgressCache.accountId || ReplaySession.isActive()) return;
    try {
      const checkpoint = this.makeCheckpoint_(this.accountId_, ScenarioManager.getInstance().data.id, syncManager.getCurrentState());
      if (checkpoint.state.equipment) checkpointRecovery.write(checkpoint);
    } catch (error) {
      Logger.warn('Could not keep recovery copy:', error);
    }
  }

  retrySave(): Promise<void> {
    const mission = ScenarioManager.getInstance().data.id;
    const save = Promise.all([ProgressSaveManager.pendingSave_, Auth.getSession()]).then(async ([, session]) => {
      const owner = session?.user?.id;
      if (!owner || ReplaySession.isActive()) return;
      const entry = checkpointRecovery.read(owner, mission);
      if (entry?.pending) await this.persistCheckpoint_(entry.checkpoint, true);
    });
    ProgressSaveManager.pendingSave_ = save.catch(() => undefined);
    return save;
  }

  private async persistCheckpoint_(checkpoint: Checkpoint, locallySaved: boolean): Promise<void> {
    const { scenarioId, state } = checkpoint;
    const toast = SaveProgressToast.getInstance();
    const timestamp = Date.now();

    try {
      const session = await Auth.getSession();
      if (session?.user?.id !== checkpoint.userId) throw new Error('Sign in to the original account to retry this save.');
      // Show saving toast and emit start event
      toast.showSaving();
      this.eventBus.emit(Events.PROGRESS_SAVE_START, { timestamp });

      // Get current scenario info
      const version = packageJson.version;

      // Direct upsert - no need to read first
      await this.userDataService.saveCheckpoint(scenarioId, {
        version,
        state,
      });
      checkpointRecovery.acknowledge(checkpoint);

      Logger.info(`Progress checkpoint saved for scenario: ${scenarioId}`);

      // Show success toast and emit success event
      toast.showSuccess('Saved to your account');
      this.eventBus.emit(Events.PROGRESS_SAVE_SUCCESS, {
        timestamp: Date.now(),
        checkpointId: scenarioId,
      });
    } catch (error) {
      Logger.error('Failed to save checkpoint:', error);

      // Show error toast and emit error event
      toast.showError(locallySaved ? 'Saved on this device. Cloud save pending; retry when connected.' : 'Save failed. Keep this mission open and retry.', 0);
      toast.offerRetry(() => (locallySaved ? this.retrySave() : this.saveCheckpoint()));
      this.eventBus.emit(Events.PROGRESS_SAVE_ERROR, {
        timestamp: Date.now(),
        error: error as Error,
      });

      throw error;
    }
  }

  /**
   * Load checkpoint for a specific scenario
   * Uses direct API - no need to load all checkpoints
   */
  async loadCheckpoint(scenarioId: string): Promise<any | null> {
    const replay = ReplaySession.checkpointFor(scenarioId);
    if (replay) {
      Logger.info(`Replay checkpoint served for scenario: ${scenarioId} (${replay.label})`);
      return { state: replay.state };
    }

    try {
      const checkpoint = await selectionProgressCache.getSavedCheckpoint(scenarioId);

      if (checkpoint) {
        const local = checkpointRecovery.read(selectionProgressCache.accountId, scenarioId);
        if (local?.pending && local.checkpoint.savedAt === checkpoint.savedAt) {
          const toast = SaveProgressToast.getInstance();
          toast.showError('Recovered from this device. Cloud save pending; retry when connected.', 0);
          toast.offerRetry(() => this.retrySave());
        }
        Logger.info(`Checkpoint found for scenario: ${scenarioId}`, checkpoint);
        return checkpoint;
      }

      Logger.info(`No checkpoint found for scenario: ${scenarioId}`);
      return null;
    } catch (error) {
      Logger.error('Failed to load checkpoint:', error);
      throw error;
    }
  }

  /**
   * Clear checkpoint for a specific scenario
   * Uses direct delete API
   */
  async clearCheckpoint(scenarioId: string): Promise<void> {
    // Checkpoints only exist server-side; signed out there is nothing to clear
    if (!(await Auth.getSession())) {
      return;
    }
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
    if (!(await Auth.getSession())) {
      return false;
    }
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

    this.eventBus.off(Events.OBJECTIVE_COMPLETED, this.boundObjective_);
    this.eventBus.off(Events.OBJECTIVES_ALL_COMPLETED, this.boundComplete_);
    window.removeEventListener('online', this.boundOnline_);
    window.removeEventListener('pagehide', this.boundPageHide_);
    document.removeEventListener('visibilitychange', this.boundVisibility_);
    if (this.interval_) clearInterval(this.interval_);
    this.isInitialized = false;
    Logger.info('ProgressSaveManager disposed');
  }
}
