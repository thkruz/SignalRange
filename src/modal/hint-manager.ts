/**
 * @file Hint Manager - Manages hint state for objective conditions
 * @description Tracks which hints have been requested and calculates 50% point penalties
 */

import { EventBus } from '@app/events/event-bus';
import { Events, HintRequestedData, HintShownData } from '@app/events/events';
import type { Objective } from '@app/objectives/objective-types';

interface HintState {
  objectiveId: string;
  conditionIndex: number;
  hint: string;
  isRequested: boolean;
  penaltyPoints: number;
}

/**
 * Singleton class that manages hint state for objective conditions.
 * Requesting a hint incurs a 50% point penalty on the objective.
 */
export class HintManager {
  private static instance_: HintManager | null = null;

  /** Map of "objectiveId:conditionIndex" -> HintState */
  private hintStates_: Map<string, HintState> = new Map();

  /** Cache of objective points for penalty calculation */
  private objectivePoints_: Map<string, number> = new Map();

  /** Track which objectives have had any hint requested (for penalty calculation) */
  private objectivesWithHints_: Set<string> = new Set();

  private constructor() {
    // No event listeners needed - hints are stateless until requested
  }

  static getInstance(): HintManager {
    HintManager.instance_ ??= new HintManager();
    return HintManager.instance_;
  }

  /**
   * Register an objective's points for penalty calculation
   */
  registerObjective(objective: Objective): void {
    this.objectivePoints_.set(objective.id, objective.points ?? 0);
  }

  /**
   * Register a hint for a specific condition
   */
  registerHint(objectiveId: string, conditionIndex: number, hint: string): void {
    const key = this.getKey_(objectiveId, conditionIndex);

    if (!this.hintStates_.has(key)) {
      const objectivePoints = this.objectivePoints_.get(objectiveId) ?? 0;
      const penaltyPoints = Math.floor(objectivePoints * 0.5);

      this.hintStates_.set(key, {
        objectiveId,
        conditionIndex,
        hint,
        isRequested: false,
        penaltyPoints,
      });
    }
  }

  /**
   * Check if a hint exists for this condition
   */
  hasHint(objectiveId: string, conditionIndex: number): boolean {
    return this.hintStates_.has(this.getKey_(objectiveId, conditionIndex));
  }

  /**
   * Check if a hint has been requested for this condition
   */
  isHintRequested(objectiveId: string, conditionIndex: number): boolean {
    const state = this.hintStates_.get(this.getKey_(objectiveId, conditionIndex));
    return state?.isRequested ?? false;
  }

  /**
   * Get the hint text for a condition (only if registered)
   */
  getHint(objectiveId: string, conditionIndex: number): string | null {
    const state = this.hintStates_.get(this.getKey_(objectiveId, conditionIndex));
    return state?.hint ?? null;
  }

  /**
   * Get the penalty points for requesting a hint on this objective
   * Returns 50% of objective points (calculated once per objective, not per condition)
   */
  getPenaltyPoints(objectiveId: string): number {
    const objectivePoints = this.objectivePoints_.get(objectiveId) ?? 0;
    return Math.floor(objectivePoints * 0.5);
  }

  /**
   * Request a hint for a condition (marks it as requested and calculates penalty)
   * Emits HINT_REQUESTED event
   */
  requestHint(objectiveId: string, conditionIndex: number): void {
    const key = this.getKey_(objectiveId, conditionIndex);
    const state = this.hintStates_.get(key);

    if (!state) {
      console.error(`No hint registered for ${key}`);
      return;
    }

    if (state.isRequested) {
      // Already requested, just show it again
      this.showHint(objectiveId, conditionIndex);
      return;
    }

    // Mark as requested
    state.isRequested = true;

    // Track that this objective has had a hint requested
    this.objectivesWithHints_.add(objectiveId);

    // Emit hint requested event
    const data: HintRequestedData = {
      objectiveId,
      conditionIndex,
      hint: state.hint,
      penaltyPoints: state.penaltyPoints,
    };
    EventBus.getInstance().emit(Events.HINT_REQUESTED, data);

    // Show the hint
    this.showHint(objectiveId, conditionIndex);
  }

  /**
   * Show a hint (emits HINT_SHOWN event)
   */
  showHint(objectiveId: string, conditionIndex: number): void {
    const key = this.getKey_(objectiveId, conditionIndex);
    const state = this.hintStates_.get(key);

    if (!state) {
      console.error(`No hint registered for ${key}`);
      return;
    }

    const data: HintShownData = {
      objectiveId,
      conditionIndex,
      hint: state.hint,
    };
    EventBus.getInstance().emit(Events.HINT_SHOWN, data);
  }

  /**
   * Get the total hint penalty for an objective
   * Returns 50% of objective points if ANY hint was requested for that objective
   */
  getHintPenalty(objectiveId: string): number {
    if (!this.objectivesWithHints_.has(objectiveId)) {
      return 0;
    }
    return this.getPenaltyPoints(objectiveId);
  }

  /**
   * Check if any hints have been requested for an objective
   */
  hasRequestedHints(objectiveId: string): boolean {
    return this.objectivesWithHints_.has(objectiveId);
  }

  /**
   * Reset all hint states (called when scenario restarts)
   */
  reset(): void {
    this.hintStates_.clear();
    this.objectivePoints_.clear();
    this.objectivesWithHints_.clear();
  }

  /**
   * Destroy the singleton instance
   */
  static destroy(): void {
    if (HintManager.instance_) {
      HintManager.instance_.reset();
      HintManager.instance_ = null;
    }
  }

  private getKey_(objectiveId: string, conditionIndex: number): string {
    return `${objectiveId}:${conditionIndex}`;
  }
}
