/**
 * @file ObjectivesManager - Monitors and validates scenario objectives
 * @description Tracks student progress through scenario objectives by evaluating
 * conditions during the simulation update loop
 */

import { GroundStation } from '@app/assets/ground-station/ground-station';
import { TapPoint } from "@app/equipment/rf-front-end/coupler-module/tap-points";
import { EventBus } from '@app/events/event-bus';
import { Events, QuizCompletedData, QuizPassedData } from '@app/events/events';
import { QuizManager } from '@app/modal/quiz-manager';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { TrafficControlManager } from '@app/traffic/traffic-control-manager';
import { Milliseconds } from 'ootk';
import {
  Condition,
  ConditionParams,
  Objective,
  ObjectiveState
} from './objective-types';
import './objectives-manager.css';

/**
 * Manages objective tracking for scenario-based learning
 */
export class ObjectivesManager {
  private static instance_: ObjectivesManager | null = null;
  private readonly objectiveStates_: ObjectiveState[] = [];
  private readonly eventBus_: EventBus;
  private readonly collapsedObjectiveIds_: Set<string> = new Set();

  // Timer-related properties
  private scenarioTimeLimit_: number | null = null;
  private scenarioTimerRunning_: boolean = false;
  private scenarioTimeRemaining_: number = 0;
  private timerInterval_: number | null = null;
  private scenarioStartTime_: number = 0;

  // Quiz pass state - when true, timers are paused and "PASS" should display
  private isQuizPassed_: boolean = false;
  private passedObjectiveId_: string | null = null;

  private readonly boundQuizPassedHandler_: (data: QuizPassedData) => void;
  private readonly boundQuizCompletedHandler_: (data: QuizCompletedData) => void;

  private constructor(objectives: Objective[], scenarioTimeLimit?: number) {
    this.eventBus_ = EventBus.getInstance();

    // Initialize bound handlers
    this.boundQuizPassedHandler_ = this.handleQuizPassed_.bind(this);
    this.boundQuizCompletedHandler_ = this.handleQuizCompleted_.bind(this);

    // Track scenario start time for elapsed time calculation
    this.scenarioStartTime_ = Date.now();

    // Initialize scenario timer if provided
    if (scenarioTimeLimit !== undefined && scenarioTimeLimit > 0) {
      this.scenarioTimeLimit_ = scenarioTimeLimit;
      this.scenarioTimeRemaining_ = scenarioTimeLimit;
      this.scenarioTimerRunning_ = true;
    }

    // Initialize objective states
    this.objectiveStates_ = objectives.map((objective) => {
      const hasNoPrerequisites = !objective.prerequisiteObjectiveIds || objective.prerequisiteObjectiveIds.length === 0;
      const isActive = hasNoPrerequisites;

      // Determine if timer should start now (on-scenario-load) or later (on-activate)
      const startsOnLoad = objective.timeLimitSeconds !== undefined &&
        objective.timerStartTrigger === 'on-scenario-load';
      const startsOnActivate = objective.timeLimitSeconds !== undefined &&
        objective.timerStartTrigger !== 'on-scenario-load';

      return {
        objective,
        isActive,
        activatedAt: isActive ? Date.now() : undefined,
        isCompleted: false,
        conditionStates: objective.conditions.map((condition) => ({
          condition,
          isSatisfied: false,
          maintainedDuration: 0,
          isMaintenanceComplete: false,
          lostTimestamps: [],
        })),
        // Timer state initialization
        isFailed: false,
        isTimerRunning: startsOnLoad || (startsOnActivate && isActive),
        timeRemainingSeconds: objective.timeLimitSeconds,
        // Time penalty state initialization
        timePenaltyApplied: false,
        timePenaltyPoints: 0,
      };
    });

    // Subscribe to update loop
    this.eventBus_.on(Events.UPDATE, this.update_.bind(this));

    // Subscribe to quiz events for timer control
    this.eventBus_.on(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
    this.eventBus_.on(Events.QUIZ_COMPLETED, this.boundQuizCompletedHandler_);

    // Start the 1-second timer interval for countdown updates
    this.startTimerInterval_();
  }

  /**
   * Initialize the objectives manager with a set of objectives
   * @param objectives Array of objectives to track
   * @param scenarioTimeLimit Optional scenario-wide time limit in seconds
   */
  static initialize(objectives: Objective[], scenarioTimeLimit?: number): ObjectivesManager {
    if (ObjectivesManager.instance_) {
      console.warn('ObjectivesManager already initialized. Destroying previous instance.');
      ObjectivesManager.destroy();
    }

    ObjectivesManager.instance_ = new ObjectivesManager(objectives, scenarioTimeLimit);
    return ObjectivesManager.instance_;
  }

  /**
   * Get the singleton instance (must be initialized first)
   */
  static getInstance(): ObjectivesManager {
    if (!ObjectivesManager.instance_) {
      throw new Error('ObjectivesManager not initialized. Call initialize() first.');
    }
    return ObjectivesManager.instance_;
  }

  /**
   * Destroy the objectives manager and clean up
   */
  static destroy(): void {
    if (ObjectivesManager.instance_) {
      ObjectivesManager.instance_.eventBus_.off(Events.UPDATE, ObjectivesManager.instance_.update_.bind(ObjectivesManager.instance_));
      ObjectivesManager.instance_.eventBus_.off(Events.QUIZ_PASSED, ObjectivesManager.instance_.boundQuizPassedHandler_);
      ObjectivesManager.instance_.eventBus_.off(Events.QUIZ_COMPLETED, ObjectivesManager.instance_.boundQuizCompletedHandler_);

      // Clear timer interval
      if (ObjectivesManager.instance_.timerInterval_) {
        clearInterval(ObjectivesManager.instance_.timerInterval_);
        ObjectivesManager.instance_.timerInterval_ = null;
      }

      ObjectivesManager.instance_ = null;
    }
  }

  /**
   * Get current state of all objectives
   */
  getObjectiveStates(): readonly ObjectiveState[] {
    return this.objectiveStates_;
  }

  /**
   * Get state of a specific objective by ID
   */
  getObjectiveState(objectiveId: string): ObjectiveState | undefined {
    return this.objectiveStates_.find((state) => state.objective.id === objectiveId);
  }

  /**
   * Check if all objectives are completed
   */
  areAllObjectivesCompleted(): boolean {
    return this.objectiveStates_.every((state) => state.isCompleted);
  }

  /**
   * Get total elapsed time in seconds since scenario started
   * Uses countdown timer if available, otherwise calculates from start time
   */
  getElapsedTime(): number {
    if (this.scenarioTimeLimit_ !== null) {
      return this.scenarioTimeLimit_ - this.scenarioTimeRemaining_;
    }
    // No countdown timer - calculate from start time
    return Math.floor((Date.now() - this.scenarioStartTime_) / 1000);
  }

  /**
   * Get remaining scenario time in seconds
   */
  getScenarioTimeRemaining(): number {
    return this.scenarioTimeRemaining_;
  }

  /**
   * Check if scenario has a time limit
   */
  hasScenarioTimer(): boolean {
    return this.scenarioTimeLimit_ !== null;
  }

  /**
   * Get remaining time for a specific objective
   */
  getObjectiveTimeRemaining(objectiveId: string): number | null {
    const state = this.getObjectiveState(objectiveId);
    if (state?.timeRemainingSeconds === undefined) return null;
    return state.timeRemainingSeconds;
  }

  /**
   * Format seconds as M:SS string
   */
  formatTimeRemaining(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Start the 1-second timer interval for countdown updates
   */
  private startTimerInterval_(): void {
    if (this.timerInterval_) return;

    this.timerInterval_ = window.setInterval(() => {
      this.tickTimers_();
    }, 1000);
  }

  /**
   * Called every second to update timers
   */
  private tickTimers_(): void {
    // Update scenario timer
    if (this.scenarioTimerRunning_ && this.scenarioTimeRemaining_ > 0) {
      this.scenarioTimeRemaining_--;
      if (this.scenarioTimeRemaining_ <= 0) {
        this.handleScenarioTimeout_();
      }
    }

    // Update per-objective timers
    for (const state of this.objectiveStates_) {
      if (state.isTimerRunning && !state.isCompleted && !state.isFailed) {
        if (state.timeRemainingSeconds !== undefined && state.timeRemainingSeconds > 0) {
          state.timeRemainingSeconds--;
          if (state.timeRemainingSeconds <= 0) {
            this.failObjective_(state, 'timeout');
          }
        }
      }
    }
  }

  /**
   * Mark an objective as failed
   */
  private failObjective_(state: ObjectiveState, reason: 'timeout'): void {
    state.isFailed = true;
    state.failedAt = Date.now();

    // Stop ALL timers when any objective fails
    this.stopAllTimers();

    this.eventBus_.emit(Events.OBJECTIVE_FAILED, {
      objectiveId: state.objective.id,
      objective: state.objective,
      failedAt: state.failedAt,
      reason,
    });
  }

  /**
   * Handle scenario-level timeout
   */
  private handleScenarioTimeout_(): void {
    this.stopAllTimers();

    this.eventBus_.emit(Events.SCENARIO_TIME_EXPIRED, {
      elapsedTime: this.getElapsedTime(),
      timeLimit: this.scenarioTimeLimit_ ?? 0,
    });
  }

  /**
   * Stop all timers (scenario and per-objective)
   */
  stopAllTimers(): void {
    this.scenarioTimerRunning_ = false;
    for (const state of this.objectiveStates_) {
      state.isTimerRunning = false;
    }
  }

  /**
   * Handle quiz passed - pause all timers and set passed state
   * Called when user selects correct answer (before clicking Continue)
   */
  private handleQuizPassed_(data: QuizPassedData): void {
    this.isQuizPassed_ = true;
    this.passedObjectiveId_ = data.objectiveId;

    // Pause scenario timer
    this.scenarioTimerRunning_ = false;

    // Pause the objective timer for the passed objective
    const state = this.objectiveStates_.find(s => s.objective.id === data.objectiveId);
    if (state) {
      state.isTimerRunning = false;
    }
  }

  /**
   * Handle quiz completed - resume scenario timer
   * Called when user clicks Continue button after correct answer
   */
  private handleQuizCompleted_(_data: QuizCompletedData): void {
    this.isQuizPassed_ = false;
    this.passedObjectiveId_ = null;

    // Resume scenario timer
    if (this.scenarioTimeLimit_ !== null && this.scenarioTimeRemaining_ > 0) {
      this.scenarioTimerRunning_ = true;
    }
    // Note: objective timer doesn't resume - it will be replaced by next objective's timer
  }

  /**
   * Check if a quiz has been passed (correct answer selected, waiting for Continue)
   */
  isQuizPassed(): boolean {
    return this.isQuizPassed_;
  }

  /**
   * Get the objective ID that was passed (if any)
   */
  getPassedObjectiveId(): string | null {
    return this.passedObjectiveId_;
  }

  /**
   * Restore objective states from saved checkpoint data
   * Merges saved state with current objective definitions, preserving progress
   * @param savedStates Array of saved objective states
   * @param scenarioTimeRemaining Saved scenario timer value (seconds remaining)
   */
  restoreState(savedStates: ObjectiveState[], scenarioTimeRemaining?: number): void {
    // Restore scenario timer if provided
    if (scenarioTimeRemaining !== undefined && this.scenarioTimeLimit_ !== null) {
      this.scenarioTimeRemaining_ = scenarioTimeRemaining;
      // Keep timer running if time remains, stop if expired
      this.scenarioTimerRunning_ = scenarioTimeRemaining > 0;
    }

    if (!savedStates || savedStates.length === 0) {
      return;
    }

    // Create a map of saved states by objective ID for quick lookup
    const savedStateMap = new Map<string, ObjectiveState>();
    savedStates.forEach((state) => {
      savedStateMap.set(state.objective.id, state);
    });

    // Restore state for each current objective
    for (const currentState of this.objectiveStates_) {
      const savedState = savedStateMap.get(currentState.objective.id);

      // If no saved state for this objective, keep it as-is (fresh state)
      if (!savedState) {
        continue;
      }

      // Restore activation state and timing
      currentState.isActive = savedState.isActive;
      currentState.activatedAt = savedState.activatedAt;
      currentState.isCompleted = savedState.isCompleted;
      currentState.completedAt = savedState.completedAt;

      // Restore timer state
      currentState.timeRemainingSeconds = savedState.timeRemainingSeconds;
      currentState.isTimerRunning = savedState.isTimerRunning;
      currentState.isFailed = savedState.isFailed;
      currentState.failedAt = savedState.failedAt;

      // Restore time penalty state
      currentState.timePenaltyApplied = savedState.timePenaltyApplied;
      currentState.timePenaltyPoints = savedState.timePenaltyPoints;

      // Restore collapse state if objective was completed
      if (savedState.isCompleted) {
        this.collapsedObjectiveIds_.add(currentState.objective.id);
      }

      // Restore condition states by index to ensure proper matching
      currentState.conditionStates.forEach((currentCondState, condIndex) => {
        const savedCondState = savedState.conditionStates[condIndex];

        // Only restore if condition exists in saved state
        if (savedCondState) {
          currentCondState.isSatisfied = savedCondState.isSatisfied;
          currentCondState.satisfiedAt = savedCondState.satisfiedAt;
          currentCondState.maintainedDuration = savedCondState.maintainedDuration;
          currentCondState.isMaintenanceComplete = savedCondState.isMaintenanceComplete;
          currentCondState.lostTimestamps = savedCondState.lostTimestamps || [];
        }
      });
    }

    // After restoring all states, activate dependent objectives for any
    // objectives that were restored as completed
    for (const currentState of this.objectiveStates_) {
      if (currentState.isCompleted) {
        this.activateDependentObjectives_(currentState.objective.id);
      }
    }
  }

  /**
   * Capture current collapse states from the DOM before regenerating HTML
   * Should be called before generateHtmlChecklist() to preserve user preferences
   */
  syncCollapsedStatesFromDOM(): void {
    const checklistElement = document.querySelector('.objectives-checklist');
    if (!checklistElement) {
      return;
    }

    const objectiveItems = checklistElement.querySelectorAll('.objective-item');
    objectiveItems.forEach((item, index) => {
      if (index < this.objectiveStates_.length) {
        const objectiveId = this.objectiveStates_[index].objective.id;
        if (item.classList.contains('collapsed')) {
          this.collapsedObjectiveIds_.add(objectiveId);
        } else {
          this.collapsedObjectiveIds_.delete(objectiveId);
        }
      }
    });
  }

  generateHtmlChecklist(): string {
    let html = '<div class="objectives-checklist"><h2>Objectives Checklist</h2><ul>';

    for (const objectiveState of this.objectiveStates_) {
      const objective = objectiveState.objective;
      const isCompleted = objectiveState.isCompleted;
      const isFailed = objectiveState.isFailed;
      const isActive = objectiveState.isActive;

      // Determine objective state class and label
      let stateClass = 'locked';
      let stateLabel = 'Locked';
      if (isCompleted) {
        stateClass = 'completed';
        stateLabel = 'Completed';
      } else if (isFailed) {
        stateClass = 'failed';
        stateLabel = 'Failed';
      } else if (isActive) {
        stateClass = 'active';
        stateLabel = 'In Progress';
      }

      // Use tracked collapse state if available, otherwise default based on active state
      let collapsedClass = '';
      if (this.collapsedObjectiveIds_.has(objective.id)) {
        collapsedClass = 'collapsed';
      } else if (this.collapsedObjectiveIds_.size === 0) {
        // No collapse states tracked yet (first render), use default behavior
        collapsedClass = isActive ? '' : 'collapsed';
      }

      html += `<li class="objective-item ${stateClass} ${collapsedClass}">`;
      html += `<div class="objective-header" onclick="this.parentElement.classList.toggle('collapsed');">`;
      html += `<span class="accordion-icon"></span>`;
      html += `<strong>${objective.title}</strong> - ${stateLabel}`;

      // Add timer display if objective has a running timer
      if (objectiveState.isTimerRunning && objectiveState.timeRemainingSeconds !== undefined) {
        const timeStr = this.formatTimeRemaining(objectiveState.timeRemainingSeconds);
        const urgencyClass = objectiveState.timeRemainingSeconds < 30 ? 'timer-urgent' : '';
        html += `<span class="objective-timer ${urgencyClass}">${timeStr}</span>`;
      }

      html += `</div>`;
      html += `<div class="objective-content">`;
      html += `<p>${objective.description}</p>`;
      html += '<ul class="conditions-list">';

      const quizManager = QuizManager.getInstance();

      for (let i = 0; i < objective.conditions.length; i++) {
        const condition = objective.conditions[i];
        const conditionState = objectiveState.conditionStates[i];
        const conditionCompleted = conditionState.isMaintenanceComplete;

        // Check if this condition has a pending quiz
        const hasQuiz = quizManager.hasQuiz(objective.id, i);
        const isQuizComplete = hasQuiz && quizManager.isQuizComplete(objective.id, i);
        const isQuizPending = hasQuiz && !isQuizComplete;

        html += `<li class="condition-item ${conditionCompleted ? 'completed' : 'incomplete'}">`;
        html += `<span class="condition-text">${condition.description}</span>`;

        // Add quiz button for pending quizzes
        if (isQuizPending) {
          html += `<button class="condition-quiz-btn" data-objective-id="${objective.id}" data-condition-index="${i}" title="Take Quiz">?</button>`;
        }

        html += '</li>';
      }

      html += '</ul></div></li>';
    }

    html += '</ul></div>';

    return html;
  }

  /**
   * Main update loop - evaluates all objectives each frame
   */
  private update_(dt: Milliseconds): void {
    const dtSeconds = dt / 1000;

    for (const objectiveState of this.objectiveStates_) {
      // Skip already completed objectives
      if (objectiveState.isCompleted) {
        continue;
      }

      // Skip failed objectives
      if (objectiveState.isFailed) {
        continue;
      }

      // Skip inactive objectives (prerequisites not met)
      if (!objectiveState.isActive) {
        continue;
      }

      // Evaluate all conditions for this objective
      this.evaluateObjectiveConditions_(objectiveState, dtSeconds);

      // Check if objective is complete
      const isObjectiveComplete = this.checkObjectiveComplete_(objectiveState);
      if (isObjectiveComplete && !objectiveState.isCompleted) {
        objectiveState.isCompleted = true;
        objectiveState.completedAt = Date.now();
        objectiveState.isTimerRunning = false; // Stop timer on completion

        // Check for time penalty
        if (objectiveState.objective.timePenalty) {
          const elapsedTime = this.getElapsedTime();
          const penalty = objectiveState.objective.timePenalty;

          if (elapsedTime > penalty.elapsedTimeThreshold) {
            objectiveState.timePenaltyApplied = true;
            objectiveState.timePenaltyPoints = penalty.pointsDeducted;

            this.eventBus_.emit(Events.TIME_PENALTY_APPLIED, {
              objectiveId: objectiveState.objective.id,
              objectiveTitle: objectiveState.objective.title,
              pointsDeducted: penalty.pointsDeducted,
              message: penalty.message,
              elapsedTime,
              threshold: penalty.elapsedTimeThreshold,
            });
          }
        }

        this.collapsedObjectiveIds_.add(objectiveState.objective.id);

        this.eventBus_.emit(Events.OBJECTIVE_COMPLETED, {
          objectiveId: objectiveState.objective.id,
          objective: objectiveState.objective,
          completedAt: objectiveState.completedAt,
        });

        // Activate any objectives that were waiting for this prerequisite
        this.activateDependentObjectives_(objectiveState.objective.id);

        // Check if all objectives are complete
        if (this.areAllObjectivesCompleted()) {
          this.eventBus_.emit(Events.OBJECTIVES_ALL_COMPLETED, {
            completedObjectives: this.objectiveStates_,
            totalTime: this.getElapsedTime(),
          });
        }
      }
    }
  }

  /**
   * Check if an objective is complete based on its condition logic
   */
  private checkObjectiveComplete_(objectiveState: ObjectiveState): boolean {
    // Failed objectives cannot be completed
    if (objectiveState.isFailed) {
      return false;
    }

    const logic = objectiveState.objective.conditionLogic || 'AND';

    if (logic === 'AND') {
      // All conditions must be satisfied or maintenance-complete
      return objectiveState.conditionStates.every((cs) => {
        if (cs.condition.maintainUntilObjectiveComplete) {
          // Indefinite conditions must be satisfied (not necessarily maintenance complete)
          return cs.isSatisfied;
        } else {
          // Regular conditions must be maintenance complete
          return cs.isMaintenanceComplete;
        }
      });
    } else {
      // At least one condition must be maintenance-complete
      // OR logic with indefinite conditions is handled the same way
      return objectiveState.conditionStates.some((cs) => cs.isMaintenanceComplete);
    }
  }

  /**
   * Activate objectives that were waiting for a specific prerequisite
   */
  private activateDependentObjectives_(completedObjectiveId: string): void {
    const now = Date.now();

    for (const objectiveState of this.objectiveStates_) {
      // Skip already active or completed objectives
      if (objectiveState.isActive || objectiveState.isCompleted) {
        continue;
      }

      // Check if this objective has the completed objective as a prerequisite
      const prerequisites = objectiveState.objective.prerequisiteObjectiveIds || [];
      if (!prerequisites.includes(completedObjectiveId)) {
        continue;
      }

      // Check if all prerequisites are now met
      const allPrerequisitesMet = prerequisites.every((prereqId) => {
        const prereqState = this.objectiveStates_.find((state) => state.objective.id === prereqId);
        return prereqState?.isCompleted || false;
      });

      // Activate if all prerequisites are met
      if (allPrerequisitesMet) {
        objectiveState.isActive = true;
        objectiveState.activatedAt = now;

        // Start timer for objectives with 'on-activate' trigger (default behavior)
        const objective = objectiveState.objective;
        if (objective.timeLimitSeconds !== undefined &&
          objective.timerStartTrigger !== 'on-scenario-load') {
          objectiveState.timeRemainingSeconds = objective.timeLimitSeconds;
          objectiveState.isTimerRunning = true;
        }

        // Remove from collapsed set so it expands when it becomes active
        this.collapsedObjectiveIds_.delete(objectiveState.objective.id);

        // Immediately evaluate conditions for the newly activated objective
        this.evaluateObjectiveConditions_(objectiveState, 0);

        this.eventBus_.emit(Events.OBJECTIVE_ACTIVATED, {
          objectiveId: objectiveState.objective.id,
          objective: objectiveState.objective,
          activatedAt: now,
        });
      }
    }
  }

  /**
   * Evaluate all conditions for a specific objective
   * Used for immediate evaluation when objective becomes active
   */
  private evaluateObjectiveConditions_(objectiveState: ObjectiveState, dtSeconds: number): void {
    for (let condIndex = 0; condIndex < objectiveState.conditionStates.length; condIndex++) {
      const conditionState = objectiveState.conditionStates[condIndex];

      // Skip already completed maintenance (unless it's indefinite maintenance)
      if (conditionState.isMaintenanceComplete &&
        !conditionState.condition.maintainUntilObjectiveComplete) {
        continue;
      }

      const wasSatisfied = conditionState.isSatisfied;
      const isNowSatisfied = this.evaluateCondition_(conditionState.condition, objectiveState);

      // Update satisfied state
      conditionState.isSatisfied = isNowSatisfied;

      // Handle condition state changes
      if (isNowSatisfied && !wasSatisfied) {
        // Condition just became satisfied
        conditionState.satisfiedAt = Date.now();
        conditionState.maintainedDuration = 0;

        // Mark as complete based on condition type
        if (conditionState.condition.maintainUntilObjectiveComplete ||
          !conditionState.condition.mustMaintain) {
          conditionState.isMaintenanceComplete = true;
        }

        this.eventBus_.emit(Events.OBJECTIVE_CONDITION_CHANGED, {
          objectiveId: objectiveState.objective.id,
          conditionIndex: condIndex,
          isSatisfied: true,
          conditionState,
        });
      } else if (!isNowSatisfied && wasSatisfied) {
        // Condition just became unsatisfied
        conditionState.satisfiedAt = undefined;
        conditionState.maintainedDuration = 0;
        conditionState.lostTimestamps = conditionState.lostTimestamps || [];
        conditionState.lostTimestamps.push(Date.now());

        // Reset maintenance complete for indefinite-maintenance conditions
        if (conditionState.condition.maintainUntilObjectiveComplete) {
          conditionState.isMaintenanceComplete = false;
        }

        this.eventBus_.emit(Events.OBJECTIVE_CONDITION_CHANGED, {
          objectiveId: objectiveState.objective.id,
          conditionIndex: condIndex,
          isSatisfied: false,
          conditionState,
        });
      } else if (isNowSatisfied) {
        // Condition continues to be satisfied - update maintenance duration
        conditionState.maintainedDuration += dtSeconds;

        // Check if maintenance requirement is met
        if (!conditionState.isMaintenanceComplete) {
          if (conditionState.condition.maintainUntilObjectiveComplete) {
            conditionState.isMaintenanceComplete = true;
          } else if (conditionState.condition.mustMaintain) {
            const requiredDuration = conditionState.condition.maintainDuration || 0;
            if (conditionState.maintainedDuration >= requiredDuration) {
              conditionState.isMaintenanceComplete = true;
            }
          } else {
            conditionState.isMaintenanceComplete = true;
          }
        }
      }
    }
  }

  /**
   * Get the ground station for an objective by its groundStation ID
   */
  private getGroundStation_(objectiveState: ObjectiveState): GroundStation | null {
    const groundStationId = objectiveState.objective.groundStation;
    if (!groundStationId) {
      console.warn(`Objective '${objectiveState.objective.id}' missing groundStation`);
      return null;
    }

    const sim = SimulationManager.getInstance();
    const gs = sim.groundStations.find((g) => g.state.id === groundStationId);
    if (!gs) {
      console.warn(`Ground station '${groundStationId}' not found for objective '${objectiveState.objective.id}'`);
      return null;
    }
    return gs;
  }

  /**
   * Evaluate equipment using a checker function
   * If equipmentIndex is specified, checks only that equipment
   * If equipmentIndex is omitted, checks if ANY equipment satisfies
   */
  private evaluateEquipment_<T>(
    equipmentArray: readonly T[],
    params: ConditionParams | undefined,
    checker: (item: T) => boolean
  ): boolean {
    if (!equipmentArray || equipmentArray.length === 0) return false;

    if (params?.equipmentIndex !== undefined) {
      const index = params.equipmentIndex;
      if (index < 0 || index >= equipmentArray.length) {
        console.warn(`Equipment index ${index} out of bounds (0-${equipmentArray.length - 1})`);
        return false;
      }
      return checker(equipmentArray[index]);
    }

    // No index specified - check if ANY equipment satisfies
    return equipmentArray.some(checker);
  }

  /**
   * Evaluate a single condition and return whether it's currently satisfied
   */
  private evaluateCondition_(condition: Condition, objectiveState: ObjectiveState): boolean {
    const sim = SimulationManager.getInstance();
    const gs = this.getGroundStation_(objectiveState);

    if (!gs) {
      return false;
    }

    switch (condition.type) {
      case 'antenna-locked': {
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          const state = antenna.state;
          if (!state.isLocked) return false;

          // If a specific satellite is required, check it
          if (condition.params?.satelliteId !== undefined) {
            const targetSat = sim.getSatByNoradId(condition.params.satelliteId);
            if (!targetSat) return false;

            const azDiff = Math.abs(state.azimuth - targetSat.az);
            const elDiff = Math.abs(state.elevation - targetSat.el);
            return azDiff <= 1.5 && elDiff <= 1.5;
          }
          return true;
        });
      }

      case 'gpsdo-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          return rfFrontEnd.gpsdoModule.state.isLocked;
        });
      }

      case 'gpsdo-warmed-up': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const gpsdoState = rfFrontEnd.gpsdoModule.state;
          return (
            gpsdoState.isPowered &&
            gpsdoState.warmupTimeRemaining === 0 &&
            gpsdoState.temperature >= 65 &&
            gpsdoState.temperature <= 75
          );
        });
      }

      case 'gpsdo-gnss-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const gpsdoState = rfFrontEnd.gpsdoModule.state;
          return (
            gpsdoState.isPowered &&
            gpsdoState.gnssSignalPresent &&
            gpsdoState.satelliteCount >= 4
          );
        });
      }

      case 'gpsdo-stability': {
        const maxAccuracy = condition.params?.maxFrequencyAccuracy ?? 5;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const gpsdoState = rfFrontEnd.gpsdoModule.state;
          return (
            gpsdoState.isPowered &&
            gpsdoState.isLocked &&
            gpsdoState.frequencyAccuracy < maxAccuracy &&
            gpsdoState.allanDeviation < maxAccuracy &&
            gpsdoState.phaseNoise < -125
          );
        });
      }

      case 'gpsdo-not-in-holdover': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const gpsdoState = rfFrontEnd.gpsdoModule.state;
          return gpsdoState.isPowered && !gpsdoState.isInHoldover;
        });
      }

      case 'buc-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          return rfFrontEnd.bucModule.state.isExtRefLocked;
        });
      }

      case 'buc-reference-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          return (
            bucState.isPowered &&
            bucState.isExtRefLocked &&
            bucState.frequencyError === 0
          );
        });
      }

      case 'buc-muted': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          return bucState.isPowered && bucState.isMuted;
        });
      }

      case 'buc-current-normal': {
        const maxCurrent = condition.params?.maxCurrentDraw ?? 4.5;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          return bucState.isPowered && bucState.currentDraw <= maxCurrent;
        });
      }

      case 'buc-not-saturated': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          return (
            bucState.isPowered &&
            bucState.outputPower <= (bucState.saturationPower - 2)
          );
        });
      }

      case 'lnb-reference-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          return (
            lnbState.isPowered &&
            lnbState.isExtRefLocked &&
            lnbState.frequencyError === 0
          );
        });
      }

      case 'lnb-lo-set': {
        if (!condition.params?.loFrequency) return false;
        const targetLoFrequency = condition.params.loFrequency;
        const tolerance = condition.params.loFrequencyTolerance ?? 0;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          return (
            lnbState.isPowered &&
            Math.abs(lnbState.loFrequency - targetLoFrequency) <= tolerance
          );
        });
      }

      case 'lnb-gain-set': {
        if (!condition.params?.gain) return false;
        const targetGain = condition.params.gain;
        const tolerance = condition.params.gainTolerance ?? 0;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          return (
            lnbState.isPowered &&
            Math.abs(lnbState.gain - targetGain) <= tolerance
          );
        });
      }

      case 'lnb-thermally-stable': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          return (
            lnbState.isPowered &&
            lnbState.noiseTemperature < 100 &&
            lnbState.temperature >= 25 &&
            lnbState.temperature <= 50 &&
            lnbState.frequencyError === 0
          );
        });
      }

      case 'lnb-noise-performance': {
        const maxNoiseTemp = condition.params?.maxNoiseTemperature ?? 100;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          return lnbState.isPowered && lnbState.noiseTemperature <= maxNoiseTemp;
        });
      }

      case 'equipment-powered': {
        if (!condition.params?.equipment) return false;

        switch (condition.params.equipment) {
          case 'antenna':
            return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
              return antenna.state.isPowered;
            });
          case 'gpsdo':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return rfFrontEnd.gpsdoModule.state.isPowered;
            });
          case 'buc':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return rfFrontEnd.bucModule.state.isPowered;
            });
          case 'lnb':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return rfFrontEnd.lnbModule.state.isPowered;
            });
          case 'spectrum-analyzer':
            return true; // Spectrum analyzer always powered on for this simulation
          case 'transmitter':
            return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
              const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
              const modem = transmitter.state.modems.find(m => m.modem_number === modemNum);
              return modem?.isPowered ?? false;
            });
          case 'hpa':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return rfFrontEnd.hpaModule.state.isPowered;
            });
          case 'filter':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return rfFrontEnd.filterModule.state.isPowered;
            });
          default:
            return false;
        }
      }

      case 'equipment-not-powered': {
        if (!condition.params?.equipment) return false;

        switch (condition.params.equipment) {
          case 'antenna':
            return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
              return !antenna.state.isPowered;
            });
          case 'gpsdo':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return !rfFrontEnd.gpsdoModule.state.isPowered;
            });
          case 'buc':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return !rfFrontEnd.bucModule.state.isPowered;
            });
          case 'lnb':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return !rfFrontEnd.lnbModule.state.isPowered;
            });
          case 'hpa':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return !rfFrontEnd.hpaModule.state.isPowered;
            });
          case 'filter':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
              return !rfFrontEnd.filterModule.state.isPowered;
            });
          case 'transmitter':
            return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
              const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
              const modem = transmitter.state.modems.find(m => m.modem_number === modemNum);
              return !(modem?.isPowered ?? true);
            });
          default:
            return false;
        }
      }

      case 'signal-detected': {
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          const signals = specA.getInputSignals();
          if (signals.length === 0) return false;

          // If no specific signal required, any signal counts
          if (!condition.params?.signalId) {
            return true;
          }

          // Find the specific signal by ID
          const targetSignal = signals.find(s => s.signalId === condition.params?.signalId);
          if (!targetSignal) return false;

          // If minPower specified, check signal meets threshold (include path gain)
          if (condition.params?.minPower !== undefined) {
            const totalGain = specA.rfFrontEnd_.couplerModule.signalPathManager.getTotalGainTo(TapPoint.RX_IF);
            const effectivePower = targetSignal.power + totalGain;
            return effectivePower >= condition.params.minPower;
          }

          return true;
        });
      }

      case 'signal-level-correct': {
        // Requires a specific signal to be at or above a minimum power level
        if (!condition.params?.signalId || condition.params?.minPower === undefined) {
          console.warn('signal-level-correct condition requires signalId and minPower params');
          return false;
        }

        const targetSignalId = condition.params.signalId;
        const minPower = condition.params.minPower;

        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          const signals = specA.getInputSignals();
          const targetSignal = signals.find(s => s.signalId === targetSignalId);
          if (!targetSignal) return false;

          // Include path gain to get effective power at spectrum analyzer
          const totalGain = specA.rfFrontEnd_.couplerModule.signalPathManager.getTotalGainTo(TapPoint.RX_IF);
          const effectivePower = targetSignal.power + totalGain;
          return effectivePower >= minPower;
        });
      }

      case 'frequency-set': {
        if (!condition.params?.frequency) return false;
        const targetFrequency = condition.params.frequency;
        const tolerance = condition.params.frequencyTolerance || 1e6;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          const diff = Math.abs(specA.state.centerFrequency - targetFrequency);
          return diff <= tolerance;
        });
      }

      case 'speca-span-set': {
        if (!condition.params?.span) return false;
        const targetSpan = condition.params.span;
        const tolerance = condition.params.frequencyTolerance || 1e6;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          const diff = Math.abs(specA.state.span - targetSpan);
          return diff <= tolerance;
        });
      }

      case 'speca-rbw-set': {
        if (!condition.params?.rbw) return false;
        const targetRbw = condition.params.rbw;
        const tolerance = condition.params.frequencyTolerance || 1e3;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          if (specA.state.rbw === null) return false;
          const diff = Math.abs(specA.state.rbw - targetRbw);
          return diff <= tolerance;
        });
      }

      case 'speca-reference-level-set': {
        if (condition.params?.referenceLevel === undefined) return false;
        const targetRefLevel = condition.params.referenceLevel;
        const tolerance = condition.params.referenceLevelTolerance ?? 1;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          const diff = Math.abs(specA.state.referenceLevel - targetRefLevel);
          return diff <= tolerance;
        });
      }

      case 'speca-noise-floor-visible': {
        const maxSignalStrength = condition.params?.maxSignalStrength ?? -60;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          const signals = specA.getInputSignals();
          return signals.every((signal) => signal.power < maxSignalStrength);
        });
      }

      case 'filter-bandwidth-set': {
        if (condition.params?.bandwidthIndex === undefined) return false;
        const targetIndex = condition.params.bandwidthIndex;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          return rfFrontEnd.filterModule.state.bandwidthIndex === targetIndex;
        });
      }

      case 'notch-filter-configured': {
        // Check if a notch filter is configured with specific center freq, bandwidth, and depth
        const targetCenterFreq = condition.params?.notchCenterFrequency;
        const targetBandwidth = condition.params?.notchBandwidth;
        const targetDepth = condition.params?.notchDepth;

        // At least center frequency must be specified
        if (targetCenterFreq === undefined) {
          console.warn('notch-filter-configured condition requires notchCenterFrequency param');
          return false;
        }

        const centerFreqTolerance = condition.params?.notchCenterFrequencyTolerance ?? 1; // MHz
        const bandwidthTolerance = condition.params?.notchBandwidthTolerance ?? 0.5; // MHz
        const depthTolerance = condition.params?.notchDepthTolerance ?? 2; // dB
        const specificNotchIndex = condition.params?.notchIndex;

        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const notchState = rfFrontEnd.notchFilterModule.state;
          if (!notchState.isPowered) return false;

          // Check specific notch or any notch
          const notchesToCheck = specificNotchIndex !== undefined
            ? [notchState.notches[specificNotchIndex]].filter(Boolean)
            : notchState.notches;

          return notchesToCheck.some((notch) => {
            if (!notch.enabled) return false;

            // Check center frequency
            const centerFreqDiff = Math.abs(notch.centerFrequency - targetCenterFreq);
            if (centerFreqDiff > centerFreqTolerance) return false;

            // Check bandwidth if specified
            if (targetBandwidth !== undefined) {
              const bandwidthDiff = Math.abs(notch.bandwidth - targetBandwidth);
              if (bandwidthDiff > bandwidthTolerance) return false;
            }

            // Check depth if specified
            if (targetDepth !== undefined) {
              const depthDiff = Math.abs(notch.depth - targetDepth);
              if (depthDiff > depthTolerance) return false;
            }

            return true;
          });
        });
      }

      case 'antenna-beacon-frequency-set': {
        if (condition.params?.beaconFrequency === undefined) return false;
        const targetFrequency = condition.params.beaconFrequency;
        const tolerance = condition.params.frequencyTolerance ?? 1e6; // 1 MHz default
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          const diff = Math.abs(antenna.state.beaconFrequencyHz - targetFrequency);
          return diff <= tolerance;
        });
      }

      case 'antenna-tracking-mode-set': {
        if (!condition.params?.trackingMode) return false;
        const targetMode = condition.params.trackingMode;
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          return antenna.state.trackingMode === targetMode;
        });
      }

      case 'antenna-beacon-locked': {
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          return antenna.state.isBeaconLocked === true;
        });
      }

      case 'antenna-position': {
        const targetAz = condition.params?.azimuth;
        const targetEl = condition.params?.elevation;
        const tolerance = condition.params?.tolerance ?? 1.0;

        // Must specify at least one of azimuth or elevation
        if (targetAz === undefined && targetEl === undefined) {
          console.warn('antenna-position condition requires azimuth and/or elevation params');
          return false;
        }

        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          const state = antenna.state;

          // Check azimuth if specified (handle 360° wraparound)
          if (targetAz !== undefined) {
            let azDiff = Math.abs(state.azimuth - targetAz);
            if (azDiff > 180) azDiff = 360 - azDiff;
            if (azDiff > tolerance) return false;
          }

          // Check elevation if specified
          if (targetEl !== undefined) {
            const elDiff = Math.abs(state.elevation - targetEl);
            if (elDiff > tolerance) return false;
          }

          return true;
        });
      }

      case 'feed-heater-enabled': {
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          return antenna.state.isHeaterEnabled === true;
        });
      }

      case 'buc-unmuted': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          return bucState.isPowered && !bucState.isMuted;
        });
      }

      case 'hpa-enabled': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const hpaState = rfFrontEnd.hpaModule.state;
          return hpaState.isPowered && hpaState.isHpaEnabled;
        });
      }

      case 'hpa-back-off-set': {
        if (condition.params?.backOff === undefined) return false;
        const targetBackOff = condition.params.backOff;
        const tolerance = condition.params.backOffTolerance ?? 0.5;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const hpaState = rfFrontEnd.hpaModule.state;
          return (
            hpaState.isPowered &&
            Math.abs(hpaState.backOff - targetBackOff) <= tolerance
          );
        });
      }

      case 'hpa-not-overdriven': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const hpaState = rfFrontEnd.hpaModule.state;
          return hpaState.isPowered && !hpaState.isOverdriven;
        });
      }

      case 'hpa-output-power-set': {
        if (condition.params?.minOutputPower === undefined) return false;
        const minPower = condition.params.minOutputPower;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const hpaState = rfFrontEnd.hpaModule.state;
          return hpaState.isPowered && hpaState.isHpaEnabled && hpaState.outputPower >= minPower;
        });
      }

      case 'hpa-disabled': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const hpaState = rfFrontEnd.hpaModule.state;
          return hpaState.isPowered && !hpaState.isHpaEnabled;
        });
      }

      case 'custom': {
        if (condition.params?.evaluator && typeof condition.params.evaluator === 'function') {
          return condition.params.evaluator();
        }
        return false;
      }

      case 'receiver-signal-locked': {
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find(m => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          const signalInfo = receiver.getSignalsInBandwidth(modem);
          return signalInfo.hasLock;
        });
      }

      case 'receiver-snr-threshold': {
        const minCNRatio = condition.params?.minCNRatio ?? 10;
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find(m => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          const snr = receiver.getSnrForModem(modem);
          return snr !== null && snr >= minCNRatio;
        });
      }

      case 'rx-modem-frequency-set': {
        if (condition.params?.frequency === undefined) return false;
        const targetFrequency = condition.params.frequency;
        const tolerance = condition.params.frequencyTolerance ?? 1e6; // Default 1 MHz
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find(m => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          // Modem frequency is in MHz, target is in Hz
          const modemFreqHz = modem.frequency * 1e6;
          const diff = Math.abs(modemFreqHz - targetFrequency);
          return diff <= tolerance;
        });
      }

      case 'rx-modem-bandwidth-set': {
        if (condition.params?.bandwidth === undefined) return false;
        const targetBandwidth = condition.params.bandwidth;
        const tolerance = condition.params.bandwidthTolerance ?? 1e6; // Default 1 MHz
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find(m => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          // Modem bandwidth is in MHz, target is in Hz
          const modemBwHz = modem.bandwidth * 1e6;
          const diff = Math.abs(modemBwHz - targetBandwidth);
          return diff <= tolerance;
        });
      }

      case 'rx-modem-modulation-set': {
        if (!condition.params?.modulation) return false;
        const targetModulation = condition.params.modulation;
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find(m => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          return modem.modulation === targetModulation;
        });
      }

      case 'rx-modem-fec-set': {
        if (!condition.params?.fec) return false;
        const targetFec = condition.params.fec;
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find(m => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          return modem.fec === targetFec;
        });
      }

      case 'tx-modem-frequency-set': {
        if (condition.params?.frequency === undefined) return false;
        const targetFrequency = condition.params.frequency;
        const tolerance = condition.params.frequencyTolerance ?? 1e6; // Default 1 MHz
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find(m => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          // Transmitter frequency is in Hz (stored in ifSignal)
          const diff = Math.abs(modem.ifSignal.frequency - targetFrequency);
          return diff <= tolerance;
        });
      }

      case 'tx-modem-power-set': {
        if (condition.params?.power === undefined) return false;
        const targetPower = condition.params.power;
        const tolerance = condition.params.powerTolerance ?? 1; // Default 1 dB
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find(m => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          const diff = Math.abs(modem.ifSignal.power - targetPower);
          return diff <= tolerance;
        });
      }

      case 'tx-modem-bandwidth-set': {
        if (condition.params?.bandwidth === undefined) return false;
        const targetBandwidth = condition.params.bandwidth;
        const tolerance = condition.params.bandwidthTolerance ?? 1e6; // Default 1 MHz
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find(m => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          const diff = Math.abs(modem.ifSignal.bandwidth - targetBandwidth);
          return diff <= tolerance;
        });
      }

      case 'tx-modem-modulation-set': {
        if (!condition.params?.modulation) return false;
        const targetModulation = condition.params.modulation;
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find(m => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          return modem.ifSignal.modulation === targetModulation;
        });
      }

      case 'tx-modem-fec-set': {
        if (!condition.params?.fec) return false;
        const targetFec = condition.params.fec;
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find(m => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          return modem.ifSignal.fec === targetFec;
        });
      }

      case 'tx-modem-transmitting': {
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find(m => m.modem_number === modemNum);
          return modem?.isPowered === true && modem?.isTransmitting === true;
        });
      }

      case 'status-check': {
        // Quiz-based condition - requires player to answer correctly
        const params = condition.params;
        if (!params?.question || !params?.options || params?.correctIndex === undefined) {
          console.warn('status-check condition missing required params (question, options, correctIndex)');
          return false;
        }

        const quizManager = QuizManager.getInstance();
        const conditionIndex = objectiveState.conditionStates.findIndex(
          cs => cs.condition === condition
        );

        // Register the quiz if not already registered
        // Note: Quiz is NOT shown immediately - pending indicator appears instead
        // User must click the indicator or "?" button to open the quiz
        if (!quizManager.hasQuiz(objectiveState.objective.id, conditionIndex)) {
          quizManager.registerQuiz(
            objectiveState.objective.id,
            conditionIndex,
            params.question,
            params.options,
            params.correctIndex,
            params.explanation,
            params.pointPenalty ?? 5
          );
        }

        // Check if quiz has been completed
        return quizManager.isQuizComplete(objectiveState.objective.id, conditionIndex);
      }

      case 'handover-complete': {
        // Check if handover to target station completed
        const targetGsId = condition.params?.targetGroundStationId;
        const satId = condition.params?.satelliteId;
        if (!targetGsId || satId === undefined) return false;

        const tcm = TrafficControlManager.getInstance();
        return tcm.getOwner(satId) === targetGsId;
      }

      case 'traffic-owner': {
        // Check if this ground station owns traffic to satellite
        const gsId = objectiveState.objective.groundStation;
        const satId = condition.params?.satelliteId;
        if (!gsId || satId === undefined) return false;

        const tcm = TrafficControlManager.getInstance();
        return tcm.getOwner(satId) === gsId;
      }

      case 'ground-station-selected': {
        // Check if specific ground station is selected in UI
        // This would require tracking selected ground station in SimulationManager
        // For now, return true if the objective's groundStation matches
        const targetGsId = condition.params?.groundStationId;
        if (!targetGsId) return false;

        // Check if the SimulationManager has a selected ground station concept
        // For now, we'll consider it selected if there's a ground station with that ID
        const gs = SimulationManager.getInstance().groundStations.find(g => g.state.id === targetGsId);
        return gs !== undefined;
      }

      case 'traffic-transferred': {
        // Check if traffic was transferred from source station to target station
        const sourceStation = condition.params?.sourceStation;
        const targetStation = condition.params?.targetStation;
        const satId = condition.params?.satelliteId;

        if (!sourceStation || !targetStation || satId === undefined) {
          console.warn('traffic-transferred condition requires sourceStation, targetStation, and satelliteId params');
          return false;
        }

        // Check if target station now owns the traffic (meaning transfer occurred)
        const tcm = TrafficControlManager.getInstance();
        return tcm.getOwner(satId) === targetStation;
      }

      case 'service-continuity': {
        // Placeholder condition for service continuity during handover
        // In a real implementation, this would track packet loss during handover
        // For now, this always passes since we don't model packet-level traffic
        return true;
      }

      default:
        console.warn(`Unknown condition type: ${condition.type}`);
        return false;
    }
  }
}
