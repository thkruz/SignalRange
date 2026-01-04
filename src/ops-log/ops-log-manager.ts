/**
 * @file OpsLogManager - Manages operations log for scenario sessions
 * @description Singleton that tracks user actions with fictional timestamps,
 * loads previous shift entries from scenario data, and persists across checkpoints.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Milliseconds } from 'ootk';
import { OpsLogEntry, OpsLogState, PreviousShiftLogEntry } from './ops-log-types';

/**
 * Manages operations logging for scenario-based simulations
 */
export class OpsLogManager {
  private static instance_: OpsLogManager | null = null;

  private readonly entries_: OpsLogEntry[] = [];
  private readonly eventBus_: EventBus;
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;

  /** Current fictional time in seconds since midnight */
  private currentTimeSeconds_: number = 0;

  /** Scenario start time in seconds since midnight */
  private readonly startTimeSeconds_: number;

  private constructor(
    startWallTime: string = '12:00:00',
    previousShiftLogs: PreviousShiftLogEntry[] = []
  ) {
    this.eventBus_ = EventBus.getInstance();
    this.startTimeSeconds_ = this.parseWallTime_(startWallTime);
    this.currentTimeSeconds_ = this.startTimeSeconds_;

    // Load previous shift entries
    for (const log of previousShiftLogs) {
      this.entries_.push({
        timestamp: log.timestamp,
        message: log.entry,
        category: 'previous-shift',
        source: log.source,
      });
    }

    // Subscribe to update loop for clock advancement
    this.boundUpdateHandler_ = this.handleUpdate_.bind(this);
    this.eventBus_.on(Events.UPDATE, this.boundUpdateHandler_);
  }

  /**
   * Initialize the OpsLogManager with scenario data
   * @param startWallTime Fictional start time in "HH:MM:SS" format (default "12:00:00")
   * @param previousShiftLogs Array of previous shift log entries from scenario
   */
  static initialize(
    startWallTime?: string,
    previousShiftLogs?: PreviousShiftLogEntry[]
  ): OpsLogManager {
    if (OpsLogManager.instance_) {
      console.warn('OpsLogManager already initialized. Destroying previous instance.');
      OpsLogManager.destroy();
    }
    OpsLogManager.instance_ = new OpsLogManager(startWallTime, previousShiftLogs);
    return OpsLogManager.instance_;
  }

  /**
   * Get the singleton instance (must be initialized first)
   */
  static getInstance(): OpsLogManager {
    if (!OpsLogManager.instance_) {
      throw new Error('OpsLogManager not initialized. Call initialize() first.');
    }
    return OpsLogManager.instance_;
  }

  /**
   * Check if the OpsLogManager has been initialized
   */
  static isInitialized(): boolean {
    return OpsLogManager.instance_ !== null;
  }

  /**
   * Destroy the OpsLogManager and clean up
   */
  static destroy(): void {
    if (OpsLogManager.instance_) {
      OpsLogManager.instance_.eventBus_.off(
        Events.UPDATE,
        OpsLogManager.instance_.boundUpdateHandler_
      );
      OpsLogManager.instance_ = null;
    }
  }

  /**
   * Log a new entry with the current fictional timestamp
   * @param message The log message
   * @param category Optional category for filtering/styling
   * @param source Optional source identifier
   */
  log(message: string, category: OpsLogEntry['category'] = 'action', source?: string): void {
    const entry: OpsLogEntry = {
      timestamp: this.formatWallTime_(this.currentTimeSeconds_),
      message,
      category,
      source,
    };
    this.entries_.push(entry);

    // Emit event for UI updates
    this.eventBus_.emit(Events.OPS_LOG_ENTRY_ADDED, entry);
  }

  /**
   * Get all log entries (previous shift + current session)
   */
  getEntries(): readonly OpsLogEntry[] {
    return this.entries_;
  }

  /**
   * Get current fictional wall-clock time as formatted string
   */
  getCurrentTimeFormatted(): string {
    return this.formatWallTime_(this.currentTimeSeconds_);
  }

  /**
   * Get current fictional time in seconds since midnight
   */
  getCurrentTimeSeconds(): number {
    return this.currentTimeSeconds_;
  }

  /**
   * Get serializable state for checkpoint persistence
   */
  getState(): OpsLogState {
    return {
      entries: [...this.entries_],
      currentTimeSeconds: this.currentTimeSeconds_,
    };
  }

  /**
   * Restore state from checkpoint
   * @param state Previously saved OpsLogState
   */
  restoreState(state: OpsLogState): void {
    this.entries_.length = 0;
    this.entries_.push(...state.entries);
    this.currentTimeSeconds_ = state.currentTimeSeconds;
  }

  /**
   * Handle simulation update - advance fictional clock
   */
  private handleUpdate_(dt: Milliseconds): void {
    // Advance fictional clock by delta time (converted to seconds)
    this.currentTimeSeconds_ += dt / 1000;
  }

  /**
   * Parse a wall time string (HH:MM:SS) to seconds since midnight
   */
  private parseWallTime_(timeStr: string): number {
    const parts = timeStr.split(':').map(Number);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;
    return h * 3600 + m * 60 + s;
  }

  /**
   * Format seconds since midnight as HH:MM:SS string
   */
  private formatWallTime_(seconds: number): string {
    const totalSeconds = Math.floor(seconds) % 86400; // Wrap at 24 hours
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
