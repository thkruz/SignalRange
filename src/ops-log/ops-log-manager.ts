/**
 * @file OpsLogManager - Manages operations log for scenario sessions
 * @description Singleton that tracks user actions with fictional timestamps,
 * loads previous shift entries from scenario data, and persists across checkpoints.
 */

import { EventBus } from '@app/events/event-bus';
import { Events, SimulatedTimeTickData } from '@app/events/events';
import { addSkippedTime, getSkippedMs } from '@app/simulation/mission-clock';
import { Milliseconds } from 'ootk';
import { OpsLogEntry, OpsLogState, PreviousShiftLogEntry } from './ops-log-types';

/** Month abbreviations for military datetime format */
const MONTH_ABBREVS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Developer/E2E clock hooks installed on window while a scenario is loaded. */
interface SimClockDevHooks {
  advanceSimClock?: (deltaMs: number) => void;
  advanceMissionClock?: (deltaMs: number) => void;
  simClockMs?: () => number;
  missionSkippedMs?: () => number;
}

/**
 * Manages operations logging for scenario-based simulations
 */
export class OpsLogManager {
  private static instance_: OpsLogManager | null = null;

  private readonly entries_: OpsLogEntry[] = [];
  private readonly eventBus_: EventBus;
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;

  /** Current simulated time as Unix timestamp in milliseconds */
  private currentTimestampMs_: number;

  /** Whether simulated time is currently paused (starts paused until scenario unlocks) */
  private isPaused_: boolean = true;

  /** Last whole second value for detecting second boundary crossings */
  private lastWholeSecond_: number = 0;

  private constructor(
    startWallTime: string = '12:00:00',
    startDate: string = '2026-01-01',
    previousShiftLogs: PreviousShiftLogEntry[] = []
  ) {
    this.eventBus_ = EventBus.getInstance();

    // Parse date and time into a timestamp
    this.currentTimestampMs_ = this.parseDateTime_(startDate, startWallTime);
    this.lastWholeSecond_ = Math.floor(this.currentTimestampMs_ / 1000);

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

    // Developer/E2E hooks for LEO pass scenarios (see advanceClock JSDoc);
    // same pattern as window.debugSignalPath in RFFrontEndCore. The two readers
    // let a spec assert that an operator time skip moved the scenario clock and
    // the mission clock by the same amount - the invariant the whole feature
    // rests on, and one that is invisible from the DOM.
    const devHooks = window as unknown as SimClockDevHooks;

    devHooks.advanceSimClock = this.advanceClock.bind(this);
    // Advance BOTH clocks together - the operator-time-skip invariant. For
    // specs that must cross mission-elapsed thresholds (gnssThreat windows,
    // interference envelopes, commanding windows) without waiting wall time.
    devHooks.advanceMissionClock = (deltaMs: number) => {
      if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
        return;
      }
      addSkippedTime(deltaMs);
      this.advanceClock(deltaMs);
    };
    devHooks.simClockMs = () => this.currentTimestampMs_;
    devHooks.missionSkippedMs = () => getSkippedMs();

    // Emit initial time tick
    this.emitTimeTick_();
  }

  /**
   * Initialize the OpsLogManager with scenario data
   * @param startWallTime Fictional start time in "HH:MM:SS" format (default "12:00:00")
   * @param startDate Fictional start date in "YYYY-MM-DD" format (default "2025-01-01")
   * @param previousShiftLogs Array of previous shift log entries from scenario
   */
  static initialize(
    startWallTime?: string,
    startDate?: string,
    previousShiftLogs?: PreviousShiftLogEntry[]
  ): OpsLogManager {
    if (OpsLogManager.instance_) {
      console.warn('OpsLogManager already initialized. Destroying previous instance.');
      OpsLogManager.destroy();
    }
    OpsLogManager.instance_ = new OpsLogManager(startWallTime, startDate, previousShiftLogs);
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
      const devHooks = window as unknown as SimClockDevHooks;

      delete devHooks.advanceSimClock;
      delete devHooks.advanceMissionClock;
      delete devHooks.simClockMs;
      delete devHooks.missionSkippedMs;
      OpsLogManager.instance_ = null;
    }
  }

  /**
   * Pause simulated time advancement
   * Called when quiz is passed, scenario fails, or completes
   */
  pause(): void {
    this.isPaused_ = true;
  }

  /**
   * Resume simulated time advancement
   * Called when quiz is completed
   */
  resume(): void {
    this.isPaused_ = false;
  }

  /**
   * Check if simulated time is currently paused
   */
  isPaused(): boolean {
    return this.isPaused_;
  }

  /**
   * Log a new entry with the current fictional timestamp
   * @param message The log message
   * @param category Optional category for filtering/styling
   * @param source Optional source identifier
   */
  log(message: string, category: OpsLogEntry['category'] = 'action', source?: string): void {
    const entry: OpsLogEntry = {
      timestamp: this.formatTimeOnly_(this.currentTimestampMs_),
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
   * Get current fictional time in military datetime format
   * e.g., "15 MAR 2025 22:05:15"
   */
  getCurrentTimeFormatted(): string {
    return this.formatMilitaryDateTime_(this.currentTimestampMs_);
  }

  /**
   * Get current simulated timestamp in milliseconds
   */
  getCurrentTimestampMs(): number {
    return this.currentTimestampMs_;
  }

  /**
   * Get serializable state for checkpoint persistence
   */
  getState(): OpsLogState {
    return {
      entries: [...this.entries_],
      currentTimestampMs: this.currentTimestampMs_,
    };
  }

  /**
   * Restore state from checkpoint
   * @param state Previously saved OpsLogState
   */
  restoreState(state: OpsLogState): void {
    this.entries_.length = 0;
    this.entries_.push(...state.entries);
    this.currentTimestampMs_ = state.currentTimestampMs;
    this.lastWholeSecond_ = Math.floor(this.currentTimestampMs_ / 1000);
    // Reset pause state on restore - ObjectivesManager controls pause state
    this.isPaused_ = false;

    // Emit time tick after restore
    this.emitTimeTick_();
  }

  /**
   * Advance the scenario clock by deltaMs in a single step.
   *
   * Developer/E2E hook (exposed as window.advanceSimClock): LEO pass scenarios
   * put objectives many sim-minutes apart, so tests jump the clock instead of
   * waiting wall-clock time. All orbital physics read absolute sim time via
   * getSimulatedNowMs() and follow on the next update tick; mission/objective
   * timers tick on real update deltas and are NOT affected by the jump.
   */
  advanceClock(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }

    this.currentTimestampMs_ += deltaMs;

    const currentWholeSecond = Math.floor(this.currentTimestampMs_ / 1000);
    if (currentWholeSecond > this.lastWholeSecond_) {
      this.lastWholeSecond_ = currentWholeSecond;
    }
    this.emitTimeTick_();
  }

  /**
   * Handle simulation update - advance fictional clock
   */
  private handleUpdate_(dt: Milliseconds): void {
    // Don't advance time if paused
    if (this.isPaused_) {
      return;
    }

    // Advance timestamp by delta time in milliseconds
    this.currentTimestampMs_ += dt;

    // Check if we've crossed a second boundary
    const currentWholeSecond = Math.floor(this.currentTimestampMs_ / 1000);
    if (currentWholeSecond > this.lastWholeSecond_) {
      this.lastWholeSecond_ = currentWholeSecond;
      this.emitTimeTick_();
    }
  }

  /**
   * Emit a SIMULATED_TIME_TICK event with current time
   */
  private emitTimeTick_(): void {
    const tickData: SimulatedTimeTickData = {
      timeFormatted: this.formatMilitaryDateTime_(this.currentTimestampMs_),
      timestampMs: this.currentTimestampMs_,
    };
    this.eventBus_.emit(Events.SIMULATED_TIME_TICK, tickData);
  }

  /**
   * Parse date (YYYY-MM-DD) and time (HH:MM:SS) into a Unix timestamp in milliseconds
   */
  private parseDateTime_(dateStr: string, timeStr: string): number {
    const dateParts = dateStr.split('-').map(Number);
    const timeParts = timeStr.split(':').map(Number);

    const year = dateParts[0] || 2025;
    const month = (dateParts[1] || 1) - 1; // JS months are 0-indexed
    const day = dateParts[2] || 1;
    const hours = timeParts[0] || 0;
    const minutes = timeParts[1] || 0;
    const seconds = timeParts[2] || 0;

    // Create date in UTC to avoid timezone issues
    return Date.UTC(year, month, day, hours, minutes, seconds);
  }

  /**
   * Format timestamp as military datetime string
   * e.g., "15 MAR 2025 22:05:15"
   */
  private formatMilitaryDateTime_(timestampMs: number): string {
    const date = new Date(timestampMs);
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = MONTH_ABBREVS[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const h = date.getUTCHours().toString().padStart(2, '0');
    const m = date.getUTCMinutes().toString().padStart(2, '0');
    const s = date.getUTCSeconds().toString().padStart(2, '0');
    return `${day} ${month} ${year} ${h}:${m}:${s}`;
  }

  /**
   * Format timestamp as time-only string (HH:MM:SS) for log entries
   */
  private formatTimeOnly_(timestampMs: number): string {
    const date = new Date(timestampMs);
    const h = date.getUTCHours().toString().padStart(2, '0');
    const m = date.getUTCMinutes().toString().padStart(2, '0');
    const s = date.getUTCSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
}
