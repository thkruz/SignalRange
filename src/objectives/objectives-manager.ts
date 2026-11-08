/**
 * @file ObjectivesManager - Monitors and validates scenario objectives
 * @description Tracks student progress through scenario objectives by evaluating
 * conditions during the simulation update loop
 */

import { GroundStation } from '@app/assets/ground-station/ground-station';
import bulbPng from '@app/assets/icons/bulb.png';
import { CommandingManager } from '@app/commanding/commanding-manager';
import { ContactScheduleManager } from '@app/contact-schedule/contact-schedule-manager';
import { ElectronicAttackManager } from '@app/electronic-attack/electronic-attack-manager';
import { CryptoModule } from '@app/equipment/crypto';
import { GeolocationConsoleCore } from '@app/equipment/geolocation-console/geolocation-console-core';
import { FECSimulator, fecInputFromSignal } from '@app/equipment/receiver/fec-simulator';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { DecisionGradedData, DecisionResolvedData, Events, ObjectiveFailedData, QuizCompletedData, QuizPassedData } from '@app/events/events';
import { FaultInjector } from '@app/faults';
import { HardwareFaultManager } from '@app/faults/hardware-fault-manager';
import { GnssThreatManager } from '@app/gnss-threat/gnss-threat-manager';
import { InterferenceManager } from '@app/interference/interference-manager';
import { LinkBudgetManager } from '@app/link-budget/link-budget-manager';
import { DecisionManager } from '@app/modal/decision-manager';
import { fillDialogTokens } from '@app/modal/dialog-tokens';
import { HintManager } from '@app/modal/hint-manager';
import { QuizManager } from '@app/modal/quiz-manager';
import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { TabbedCanvas } from '@app/pages/mission-control/tabbed-canvas';
import { CampaignDocumentStore } from '@app/scenarios/campaign-document-store';
import { EventTimeLedger } from '@app/scenarios/event-time-ledger';
import { SecurityConsoleCore } from '@app/security-console/security-console-core';
import { missionNowMs } from '@app/simulation/mission-clock';
import { SimClock, STEPS_PER_SECOND } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { SpaceEventManager } from '@app/space-events/space-event-manager';
import { TelemetryManager } from '@app/telemetry/telemetry-manager';
import { TrafficControlManager } from '@app/traffic/traffic-control-manager';
import { TransecManager } from '@app/transec/transec-manager';
import { WeatherManager } from '@app/weather/weather-manager';
import { Milliseconds } from 'ootk';
import { conditionLabel, tabGateLabel, tabHintLabel } from './condition-label';
import { holdsAtCompletion, isQuizCondition, isTabGate, observationDwellSeconds, resolveRequiresChange, TIME_GATED_CONDITION_TYPES, valueSnapshot } from './condition-semantics';
import { CountdownHold } from './countdown-hold';
import { EvidenceFactRegistry } from './evidence-facts';
import {
  Condition,
  ConditionParams,
  ConditionState,
  DEFAULT_OBSERVATION_DWELL_SECONDS,
  OBSERVATION_DWELL_GRACE_SECONDS,
  Objective,
  ObjectiveState,
  OFF_TAB_NUDGE_SECONDS,
  TAB_HINT_DELAY_SECONDS,
  TimeSkipOffer,
} from './objective-types';
import './objectives-manager.css';

/** Conditions only a live command link can satisfy (failOnClosedCommandWindow_) */
const COMMAND_LINK_CONDITIONS: ReadonlySet<string> = new Set(['command-acknowledged', 'ranging-measurements']);

/**
 * Manages objective tracking for scenario-based learning
 */
export class ObjectivesManager {
  private static instance_: ObjectivesManager | null = null;
  private static openedBoxIds_: Set<string> = new Set();
  private static selectedGroundStationId_: string | null = null;
  private static selectedSatelliteId_: string | null = null;
  private readonly objectiveStates_: ObjectiveState[] = [];
  private readonly eventBus_: EventBus;
  private readonly collapsedObjectiveIds_: Set<string> = new Set();
  /** Effective requiresChange per condition (Phase 27 B1, condition-semantics.ts) */
  private readonly requiresChange_: Map<Condition, boolean>;

  // Timer-related properties
  private scenarioTimeLimit_: number | null = null;
  private scenarioTimerRunning_: boolean = false;
  private scenarioTimeRemaining_: number = 0;
  /** Unpaused steps since the last countdown tick */
  private countdownSteps_ = 0;
  private readonly boundUpdateHandler_ = this.update_.bind(this);
  private scenarioStartTime_: number = 0;

  // Quiz pass state - when true, timers are paused and "PASS" should display
  private isQuizPassed_: boolean = false;
  private passedObjectiveId_: string | null = null;

  private readonly boundQuizPassedHandler_: (data: QuizPassedData) => void;
  private readonly boundQuizCompletedHandler_: (data: QuizCompletedData) => void;
  private readonly boundDecisionGradedHandler_: (data: DecisionGradedData) => void;
  private readonly boundDecisionResolvedHandler_: (data: DecisionResolvedData) => void;
  /** Open quiz/decision modals hold the countdowns (countdown-hold.ts) */
  private readonly boundQuizHoldOn_ = (): void => CountdownHold.set('quiz', true);
  private readonly boundQuizHoldOff_ = (): void => CountdownHold.set('quiz', false);
  private readonly boundDecisionHoldOn_ = (): void => CountdownHold.set('decision', true);
  private readonly boundDecisionHoldOff_ = (): void => CountdownHold.set('decision', false);
  private readonly boundAssetSelectedHandler_: (data: { type: string; id: string }) => void;

  /**
   * Held evidence facts, one registry per ground station (facts such as
   * equipment-fault-active are station-specific). Ticked lazily by active
   * decision conditions, so scenarios without one pay nothing.
   */
  private readonly evidenceFacts_ = new Map<string, EvidenceFactRegistry>();

  private constructor(objectives: Objective[], scenarioTimeLimit?: number) {
    this.eventBus_ = EventBus.getInstance();
    this.requiresChange_ = resolveRequiresChange(objectives);

    // Initialize bound handlers
    this.boundQuizPassedHandler_ = this.handleQuizPassed_.bind(this);
    this.boundQuizCompletedHandler_ = this.handleQuizCompleted_.bind(this);
    this.boundDecisionGradedHandler_ = this.handleDecisionGraded_.bind(this);
    this.boundDecisionResolvedHandler_ = this.handleDecisionResolved_.bind(this);
    this.boundAssetSelectedHandler_ = this.handleAssetSelected_.bind(this);

    // Track scenario start time for elapsed time calculation. Measured on the
    // mission clock, so time the operator skips counts as time on shift.
    this.scenarioStartTime_ = missionNowMs();

    // Initialize scenario timer if provided
    if (scenarioTimeLimit !== undefined && scenarioTimeLimit > 0) {
      this.scenarioTimeLimit_ = scenarioTimeLimit;
      this.scenarioTimeRemaining_ = scenarioTimeLimit;
      // Don't start timer if any objective freezes it
      const hasFreezingObjective = objectives.some((obj) => obj.freezesScenarioTimer);
      this.scenarioTimerRunning_ = !hasFreezingObjective;
    }

    // Initialize objective states
    this.objectiveStates_ = objectives.map((objective) => {
      const hasNoPrerequisites = !objective.prerequisiteObjectiveIds || objective.prerequisiteObjectiveIds.length === 0;
      const isActive = hasNoPrerequisites;

      // Determine if timer should start now (on-scenario-load) or later (on-activate)
      const startsOnLoad = objective.timeLimitSeconds !== undefined && objective.timerStartTrigger === 'on-scenario-load';
      const startsOnActivate = objective.timeLimitSeconds !== undefined && objective.timerStartTrigger !== 'on-scenario-load' && objective.timerStartTrigger !== 'on-pass-phase';

      return {
        objective,
        isActive,
        activatedAt: isActive ? SimClock.nowMs() : undefined,
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
    this.eventBus_.on(Events.UPDATE, this.boundUpdateHandler_);

    // Developer/E2E hook (same pattern as window.advanceSimClock): dump the
    // live per-condition evaluation of one objective. The checklist shows only
    // the latched result, so a spec that fails on "objective not complete"
    // cannot tell an unmet condition from an unobserved one from a stale
    // render - call window.debugObjective('<id>') to see all three.
    (window as unknown as { debugObjective: (id: string) => unknown }).debugObjective = (objectiveId: string) => {
      const state = this.objectiveStates_.find((s) => s.objective.id === objectiveId);
      if (!state) return { error: `no objective '${objectiveId}'` };
      return {
        isActive: state.isActive,
        isCompleted: state.isCompleted,
        countdownHeld: this.isCountdownHeld_(state),
        conditions: state.conditionStates.map((cs) => ({
          type: cs.condition.type,
          isSatisfied: cs.isSatisfied,
          observed: cs.observed ?? null,
          maintenanceComplete: cs.isMaintenanceComplete,
          evaluatesNow: this.evaluateCondition_(cs.condition, state),
          observationActive: this.isObservationContextActive_(cs.condition, state.objective),
          requiresChange: this.requiresChange_.get(cs.condition) ?? false,
          changeArmed: cs.changeArmed ?? null,
        })),
      };
    };

    // Developer/E2E hook window.advanceClock, replacing OpsLogManager's plain
    // clock skip: a jump must cost what waiting costs a player, so running
    // countdowns burn with it (and may fail). Without this a spec could jump
    // past a timed objective's deadline to an event no player could reach.
    // Run time moves too (nats-r3 S8): a player who waits that long also
    // waits out warm-ups, lock delays and stabilisation, so sim timers due
    // inside the jump fire (SimClock.advanceRun).
    (window as unknown as { advanceClock: (deltaMs: number) => void }).advanceClock = (deltaMs: number) => {
      if (OpsLogManager.isInitialized()) {
        OpsLogManager.getInstance().advanceClock(deltaMs);
      } else {
        SimClock.skip(deltaMs);
      }
      SimClock.advanceRun(deltaMs);
      this.applyTimeSkip(deltaMs);
    };

    // Subscribe to quiz events for timer control
    this.eventBus_.on(Events.QUIZ_PASSED, this.boundQuizPassedHandler_);
    this.eventBus_.on(Events.QUIZ_COMPLETED, this.boundQuizCompletedHandler_);
    // Decisions pause and resume the timers the same way a quiz does
    this.eventBus_.on(Events.DECISION_GRADED, this.boundDecisionGradedHandler_);
    this.eventBus_.on(Events.DECISION_RESOLVED, this.boundDecisionResolvedHandler_);

    // An open quiz or decision holds every countdown until it is answered or
    // closed. No reset here: an intro dialog may already hold before this exists.
    this.eventBus_.on(Events.QUIZ_SHOW, this.boundQuizHoldOn_);
    this.eventBus_.on(Events.QUIZ_DISMISSED, this.boundQuizHoldOff_);
    this.eventBus_.on(Events.QUIZ_COMPLETED, this.boundQuizHoldOff_);
    this.eventBus_.on(Events.DECISION_SHOW, this.boundDecisionHoldOn_);
    this.eventBus_.on(Events.DECISION_DISMISSED, this.boundDecisionHoldOff_);
    this.eventBus_.on(Events.DECISION_RESOLVED, this.boundDecisionHoldOff_);

    // Subscribe to asset selection events for ground-station-selected condition
    this.eventBus_.on(Events.ASSET_SELECTED, this.boundAssetSelectedHandler_);
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

    // Register objectives and hints with HintManager
    const hintManager = HintManager.getInstance();
    for (const objective of objectives) {
      hintManager.registerObjective(objective);
      for (let i = 0; i < objective.conditions.length; i++) {
        const condition = objective.conditions[i];
        if (condition.hint && condition.hint.trim() !== '') {
          hintManager.registerHint(objective.id, i, condition.hint);
        }
      }
    }

    // If there's no freezing objective, resume simulated time immediately
    // (OpsLogManager starts paused by default, waiting for scenario to unlock)
    const hasFreezingObjective = objectives.some((obj) => obj.freezesScenarioTimer);
    if (!hasFreezingObjective && OpsLogManager.isInitialized()) {
      OpsLogManager.getInstance().resume();
    }

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
   * Whether objectives are being tracked. Unlike getInstance() this does not
   * throw, so callers outside the scenario lifecycle (the time-skip pre-flight
   * check, which also runs in the sandbox) can ask safely.
   */
  static hasInstance(): boolean {
    return ObjectivesManager.instance_ !== null;
  }

  /**
   * Destroy the objectives manager and clean up
   */
  static destroy(): void {
    if (ObjectivesManager.instance_) {
      ObjectivesManager.instance_.eventBus_.off(Events.UPDATE, ObjectivesManager.instance_.boundUpdateHandler_);
      ObjectivesManager.instance_.eventBus_.off(Events.QUIZ_PASSED, ObjectivesManager.instance_.boundQuizPassedHandler_);
      ObjectivesManager.instance_.eventBus_.off(Events.QUIZ_COMPLETED, ObjectivesManager.instance_.boundQuizCompletedHandler_);
      ObjectivesManager.instance_.eventBus_.off(Events.DECISION_GRADED, ObjectivesManager.instance_.boundDecisionGradedHandler_);
      ObjectivesManager.instance_.eventBus_.off(Events.DECISION_RESOLVED, ObjectivesManager.instance_.boundDecisionResolvedHandler_);
      const inst = ObjectivesManager.instance_;
      inst.eventBus_.off(Events.QUIZ_SHOW, inst.boundQuizHoldOn_);
      inst.eventBus_.off(Events.QUIZ_DISMISSED, inst.boundQuizHoldOff_);
      inst.eventBus_.off(Events.QUIZ_COMPLETED, inst.boundQuizHoldOff_);
      inst.eventBus_.off(Events.DECISION_SHOW, inst.boundDecisionHoldOn_);
      inst.eventBus_.off(Events.DECISION_DISMISSED, inst.boundDecisionHoldOff_);
      inst.eventBus_.off(Events.DECISION_RESOLVED, inst.boundDecisionHoldOff_);
      CountdownHold.reset();
      ObjectivesManager.instance_.eventBus_.off(Events.ASSET_SELECTED, ObjectivesManager.instance_.boundAssetSelectedHandler_);

      delete (window as unknown as { debugObjective?: unknown }).debugObjective;
      const hooks = window as unknown as { advanceClock?: (deltaMs: number) => void };
      if (OpsLogManager.isInitialized()) {
        const opsLog = OpsLogManager.getInstance();
        hooks.advanceClock = opsLog.advanceClock.bind(opsLog);
      } else {
        delete hooks.advanceClock;
      }

      ObjectivesManager.instance_ = null;
    }

    // Clear opened box tracking
    ObjectivesManager.openedBoxIds_.clear();

    // Clear selected ground station
    ObjectivesManager.selectedGroundStationId_ = null;
  }

  /**
   * Register that a box (e.g., mission brief) has been opened
   * @param boxId The unique identifier of the opened box
   */
  static registerOpenedBox(boxId: string): void {
    ObjectivesManager.openedBoxIds_.add(boxId);
  }

  /**
   * Check if a specific box has been opened
   * @param boxId Optional box ID to check; if omitted, checks if any box was opened
   */
  static isBoxOpened(boxId?: string): boolean {
    if (boxId) {
      return ObjectivesManager.openedBoxIds_.has(boxId);
    }
    return ObjectivesManager.openedBoxIds_.size > 0;
  }

  /**
   * Check if the scenario is currently locked (has an incomplete freezing objective)
   */
  static isScenarioLocked(): boolean {
    if (!ObjectivesManager.instance_) {
      return false;
    }
    return ObjectivesManager.instance_.objectiveStates_.some((state) => state.objective.freezesScenarioTimer && !state.isCompleted);
  }

  /**
   * Check if objectives have been loaded into the manager
   * Used to distinguish "no freezing objectives" from "objectives not loaded yet"
   */
  static hasLoadedObjectives(): boolean {
    if (!ObjectivesManager.instance_) {
      return false;
    }
    return ObjectivesManager.instance_.objectiveStates_.length > 0;
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
   * Check whether every required objective is completed.
   *
   * Objectives flagged `isOptional` do not gate scenario completion: Mission
   * Complete fires once the required set is done, whether or not the player
   * also finished the optional ones. A scenario with no required objectives
   * at all falls back to requiring every objective, so a purely optional list
   * cannot complete itself on the first tick.
   */
  areAllObjectivesCompleted(): boolean {
    const required = this.objectiveStates_.filter((state) => !state.objective.isOptional);
    const gating = required.length > 0 ? required : this.objectiveStates_;

    return gating.every((state) => state.isCompleted);
  }

  /** Mission Complete has fired: there are objectives and the required ones are done */
  private isMissionComplete_(): boolean {
    return this.objectiveStates_.length > 0 && this.areAllObjectivesCompleted();
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
    return Math.floor((missionNowMs() - this.scenarioStartTime_) / 1000);
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
   * Force complete the current active objective and advance to next.
   * Used by developer menu for testing/debugging.
   * @returns true if an objective was completed, false if none available
   */
  forceCompleteCurrentObjective(): boolean {
    // Find first active, non-completed, non-failed objective
    const activeObjective = this.objectiveStates_.find((state) => state.isActive && !state.isCompleted && !state.isFailed);

    if (!activeObjective) {
      return false;
    }

    // Mark all conditions as satisfied and maintenance complete
    for (const condState of activeObjective.conditionStates) {
      condState.isSatisfied = true;
      condState.isMaintenanceComplete = true;
      condState.satisfiedAt = SimClock.nowMs();
      condState.observed = true; // a force-completed objective counts as observed
      condState.changeArmed = true;
    }

    // Mark objective as complete
    activeObjective.isCompleted = true;
    activeObjective.completedAt = SimClock.nowMs();
    activeObjective.isTimerRunning = false;

    // Collapse the objective
    this.collapsedObjectiveIds_.add(activeObjective.objective.id);

    // Emit completion event
    this.eventBus_.emit(Events.OBJECTIVE_COMPLETED, {
      objectiveId: activeObjective.objective.id,
      objective: activeObjective.objective,
      completedAt: activeObjective.completedAt,
    });

    // Activate dependent objectives
    this.activateDependentObjectives_(activeObjective.objective.id);

    // Handle freezing objectives - start scenario timer and resume simulated time
    if (activeObjective.objective.freezesScenarioTimer) {
      this.scenarioTimerRunning_ = true;
      this.scenarioStartTime_ = missionNowMs();
      if (OpsLogManager.isInitialized()) {
        OpsLogManager.getInstance().resume();
      }
      this.eventBus_.emit(Events.SCENARIO_UNLOCKED);
    }

    // Check if all objectives are complete
    if (this.areAllObjectivesCompleted()) {
      this.stopAllTimers();
      if (OpsLogManager.isInitialized()) {
        OpsLogManager.getInstance().pause();
      }
      this.eventBus_.emit(Events.OBJECTIVES_ALL_COMPLETED, {
        completedObjectives: this.objectiveStates_,
        totalTime: this.getElapsedTime(),
      });
    }

    return true;
  }

  /**
   * Uncomplete the most recently completed objective.
   * Used by developer menu for testing/debugging.
   * @returns true if an objective was uncompleted, false if none available
   */
  uncompleteLastObjective(): boolean {
    // Find the most recently completed objective
    const completedObjectives = this.objectiveStates_.filter((state) => state.isCompleted && state.completedAt);
    if (completedObjectives.length === 0) {
      return false;
    }

    const lastCompleted = completedObjectives.reduce((latest, current) => ((current.completedAt ?? 0) > (latest.completedAt ?? 0) ? current : latest), completedObjectives[0]);

    // Reset objective state
    lastCompleted.isCompleted = false;
    lastCompleted.completedAt = undefined;

    // Reset condition states
    for (const condState of lastCompleted.conditionStates) {
      condState.isSatisfied = false;
      condState.satisfiedAt = undefined;
      condState.maintainedDuration = 0;
      condState.isMaintenanceComplete = false;
      condState.observed = false; // re-doing the objective requires re-observing
      ObjectivesManager.resetLiveReadState_(condState);
      condState.changeArmed = undefined; // and a fresh change
      condState.changeBaseline = undefined;
    }

    // Remove from collapsed set
    this.collapsedObjectiveIds_.delete(lastCompleted.objective.id);

    // Deactivate dependent objectives
    this.deactivateDependentObjectives_(lastCompleted.objective.id);

    // Handle freezing objectives - stop scenario timer
    if (lastCompleted.objective.freezesScenarioTimer) {
      this.scenarioTimerRunning_ = false;
    }

    return true;
  }

  /**
   * Set the scenario time remaining to a specific value.
   * Used by developer menu for testing/debugging.
   * @param seconds The new time remaining in seconds
   */
  setScenarioTimeRemaining(seconds: number): void {
    // Initialize scenario timer if it wasn't set
    this.scenarioTimeLimit_ ??= seconds;
    this.scenarioTimeRemaining_ = Math.max(0, seconds);
    this.scenarioTimerRunning_ = seconds > 0 && !this.areAllObjectivesCompleted();
  }

  /**
   * Set the current active objective's timer to a specific value.
   * Used by developer menu for testing/debugging.
   * @param seconds The new time remaining in seconds
   * @returns true if an objective timer was set, false if no active objective with timer
   */
  setCurrentObjectiveTimeRemaining(seconds: number): boolean {
    // Find first active, non-completed, non-failed objective with a timer
    const activeObjective = this.objectiveStates_.find((state) => state.isActive && !state.isCompleted && !state.isFailed && state.timeRemainingSeconds !== undefined);

    if (!activeObjective) {
      return false;
    }

    activeObjective.timeRemainingSeconds = Math.max(0, seconds);
    activeObjective.isTimerRunning = seconds > 0;

    return true;
  }

  /**
   * Accumulate one simulation step of scenario time and tick the countdowns
   * once per whole second of it. Countdowns follow the scenario clock, so
   * they stop with it (brief freeze, quiz, failure, hidden tab). Skips do not
   * pass through here; see applyTimeSkip().
   */
  private advanceCountdowns_(): void {
    // A dialog, the brief or an open quiz/decision holds the countdowns
    // (countdown-hold.ts); the scenario clock itself keeps running
    if (SimClock.isPaused('scenario') || CountdownHold.isHeld()) {
      return;
    }

    this.countdownSteps_++;
    if (this.countdownSteps_ >= STEPS_PER_SECOND) {
      this.countdownSteps_ = 0;
      this.tickTimers_();
    }
  }

  /**
   * Called every second of scenario time to update timers
   */
  private tickTimers_(): void {
    // Don't tick if OpsLogManager is paused - keep timers in sync with simulated time
    if (OpsLogManager.isInitialized() && OpsLogManager.getInstance().isPaused()) {
      return;
    }

    // A finished mission keeps the time it finished with: Mission Complete
    // quotes it, so the HUD must not keep counting (nats-r3-s19-F2)
    if (this.isMissionComplete_()) {
      return;
    }

    // Update scenario timer (held through an objective's wait, Phase 28 D1)
    if (this.scenarioTimerRunning_ && this.scenarioTimeRemaining_ > 0 && this.getMissionClockHold() === null) {
      this.scenarioTimeRemaining_--;
      if (this.scenarioTimeRemaining_ <= 0) {
        this.handleScenarioTimeout_();
      }
    }

    // Update per-objective timers
    for (const state of this.objectiveStates_) {
      if (state.isTimerRunning && !state.isCompleted && !state.isFailed && !this.isCountdownHeld_(state)) {
        if (state.timeRemainingSeconds !== undefined && state.timeRemainingSeconds > 0) {
          state.timeRemainingSeconds--;
          if (state.timeRemainingSeconds <= 0) {
            this.expireObjectiveTimer_(state);
          }
        }
      }
    }
  }

  /**
   * Advance every countdown timer by a skipped interval.
   *
   * Elapsed time needs no adjustment here - it is measured on the mission clock
   * (missionNowMs), which TimeSkipController has already advanced. Countdown
   * timers are decremented state, not derived, so they must be told.
   *
   * TimeSkipController refuses to skip while an objective timer is running, so
   * in practice this only ever moves the scenario-wide timer. It handles the
   * objective case anyway rather than depending on a guardrail elsewhere.
   *
   * @param deltaMs Skipped interval in milliseconds
   * @param exemptObjectiveId The objective whose wait an objective skip covers
   */
  applyTimeSkip(deltaMs: number, exemptObjectiveId?: string): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || this.isMissionComplete_()) {
      return;
    }

    const deltaS = deltaMs / 1000;

    // The wait an objective skip covers is time its holds were held: a
    // condition that reads true across the skip earns the skipped seconds,
    // or "hold until the cell passes" would have to be re-held from zero
    if (exemptObjectiveId !== undefined) {
      const skipped = this.getObjectiveState(exemptObjectiveId);
      if (skipped?.isActive && !skipped.isCompleted) {
        for (const cs of skipped.conditionStates) {
          if (cs.isSatisfied && cs.condition.mustMaintain && cs.condition.maintainDuration && !cs.isMaintenanceComplete && this.maintainSiblingsHold_(skipped, cs)) {
            cs.maintainedDuration += deltaS;
          }
        }
      }
    }

    // The scenario limit budgets the operator's working time. An objective
    // wait is one the story compresses (a crew window, a pass window, a rain
    // cell): the mission countdown is held through it whether the operator
    // waits or skips (Phase 28 D1), so neither charges the limit
    if (exemptObjectiveId === undefined && this.scenarioTimerRunning_ && this.scenarioTimeRemaining_ > 0 && this.getMissionClockHold() === null) {
      this.scenarioTimeRemaining_ = Math.max(0, this.scenarioTimeRemaining_ - deltaS);
      if (this.scenarioTimeRemaining_ <= 0) {
        this.handleScenarioTimeout_();
      }
    }

    // An objective skip charges no countdown at all. Another timed objective
    // blocks it from starting, so any timer running now was opened by the
    // skip itself (the wait ended mid-skip) and has not been seen yet
    if (exemptObjectiveId !== undefined) {
      return;
    }

    for (const state of this.objectiveStates_) {
      if (!state.isTimerRunning || state.isCompleted || state.isFailed || this.isCountdownHeld_(state)) {
        continue;
      }
      if (state.timeRemainingSeconds === undefined || state.timeRemainingSeconds <= 0) {
        continue;
      }

      state.timeRemainingSeconds = Math.max(0, state.timeRemainingSeconds - deltaS);
      if (state.timeRemainingSeconds <= 0) {
        this.expireObjectiveTimer_(state);
      }
    }
  }

  /**
   * Whether any objective countdown timer is currently running. A time skip is
   * blocked while one is, because skipping would burn the operator's clock on
   * an objective they are actively being timed on.
   */
  hasRunningObjectiveTimer(exceptObjectiveId?: string): boolean {
    return this.objectiveStates_.some(
      (state) =>
        state.objective.id !== exceptObjectiveId &&
        state.isTimerRunning &&
        !state.isCompleted &&
        !state.isFailed &&
        state.timeRemainingSeconds !== undefined &&
        state.timeRemainingSeconds > 0 &&
        !this.isCountdownHeld_(state)
    );
  }

  /** Whether a condition counts as met for gating: live for hold-at-completion rows, latched otherwise */
  private static isConditionMet_(cs: ConditionState, objective: Objective): boolean {
    return holdsAtCompletion(cs.condition, objective) ? cs.isSatisfied : cs.isMaintenanceComplete;
  }

  /**
   * Phase 27 Q1: an objective's countdown times the doing, not the reading.
   * It stops once every non-quiz condition is met (a hold-at-completion row
   * that drops again restarts it), so an objective that is only quizzes is
   * untimed. A quiz only becomes answerable after the doing it follows (B7),
   * so this is also the hold while a quiz sits pending behind its 5 s banner.
   * Phase 28 D1: an objective that is waiting out its hold (timeSkip) is
   * held as well; the wait is the clock's, not the operator's.
   */
  private isCountdownHeld_(state: ObjectiveState): boolean {
    if (this.isWaitPhase_(state)) {
      return true;
    }
    const doing = state.conditionStates.filter((cs) => !isQuizCondition(cs.condition.type));
    if (doing.length === 0) {
      return true;
    }
    if ((state.objective.conditionLogic ?? 'AND') === 'OR') {
      return doing.some((cs) => ObjectivesManager.isConditionMet_(cs, state.objective));
    }

    return doing.every((cs) => ObjectivesManager.isConditionMet_(cs, state.objective));
  }

  /** Public view of the Q1 hold, for the command-bar timer */
  isObjectiveCountdownHeld(objectiveId: string): boolean {
    const state = this.getObjectiveState(objectiveId);

    return state !== undefined && this.isCountdownHeld_(state);
  }

  /**
   * Phase 27 Q4: the objective time skip on offer right now, or null: the
   * first active, incomplete objective with an unused timeSkip whose
   * availability rule is met.
   *
   * Phase 28 D1: the skip covers exactly the rest of the hold (holdEnd_()),
   * so it stops when the step's wait is over rather than a fixed N minutes
   * past or short of it. `landsAtMs` is the station-clock moment it stops at
   * when the hold ends on the clock (a time reached, a weather event over),
   * so the button can say "Skip to 10:00"; null for a plain duration.
   */
  getAvailableTimeSkip(): TimeSkipOffer | null {
    for (const state of this.objectiveStates_) {
      const skip = state.objective.timeSkip;
      if (!skip || !state.isActive || state.isCompleted || state.isFailed || state.timeSkipUsed) {
        continue;
      }
      if (!ObjectivesManager.isSkipReady_(state)) {
        continue;
      }

      const holdEnd = this.holdEnd_(state);
      const fallbackMs = (skip.minutes ?? 0) * 60_000;
      const deltaMs = holdEnd ? holdEnd.remainingMs : fallbackMs;
      // Nothing left to skip: the wait is over and the objective completes on the next frame
      if (!(deltaMs >= ObjectivesManager.MIN_OBJECTIVE_SKIP_MS)) {
        continue;
      }
      const minutes = Math.ceil(deltaMs / 60_000);

      return {
        objectiveId: state.objective.id,
        deltaMs,
        landsAtMs: holdEnd?.isClockAnchored ? SimClock.nowMs() + deltaMs : null,
        label: skip.label ?? `${minutes} min wait`,
      };
    }

    return null;
  }

  /** Shortest wait worth a skip control, ms */
  private static readonly MIN_OBJECTIVE_SKIP_MS = 1000;

  /**
   * The timeSkip availability rule: with `availableAfterConditions`, every
   * row the operator sets up is met; quizzes, clock-gated rows and the timed
   * holds themselves are the wait and do not count.
   */
  private static isSkipReady_(state: ObjectiveState): boolean {
    if (!state.objective.timeSkip?.availableAfterConditions) {
      return true;
    }

    return state.conditionStates.every(
      (cs) =>
        isQuizCondition(cs.condition.type) ||
        TIME_GATED_CONDITION_TYPES.has(cs.condition.type) ||
        (cs.condition.maintainDuration ?? 0) > 0 ||
        ObjectivesManager.isConditionMet_(cs, state.objective)
    );
  }

  /**
   * How much of an objective's hold is left, read from its own rows: the
   * latest of a scenario-time-reached clock time, a weather-event-ended
   * event end and the time left on its maintainDuration holds. Null when no
   * row says (or a weather event has not been scheduled yet).
   */
  private holdEnd_(state: ObjectiveState): { remainingMs: number; isClockAnchored: boolean } | null {
    let remainingMs = 0;
    let isClockAnchored = false;
    let isKnown = false;
    const consider = (ms: number, isClock: boolean): void => {
      isKnown = true;
      if (ms > remainingMs || (ms === remainingMs && isClock)) {
        remainingMs = ms;
        isClockAnchored = isClock;
      }
    };

    for (const cs of state.conditionStates) {
      const condition = cs.condition;
      if (condition.type === 'scenario-time-reached') {
        const targetMs = ObjectivesManager.scenarioTimeTargetMs(condition.params?.scenarioTime);
        if (targetMs === null) {
          return null;
        }
        consider(Math.max(0, targetMs - SimClock.nowMs()), true);
      } else if (condition.type === 'weather-event-ended') {
        const eventId = condition.params?.weatherEventId;
        const untilEndS = eventId !== undefined && WeatherManager.hasInstance() ? WeatherManager.getInstance().getSecondsUntilEventEnds(eventId) : null;
        if (untilEndS === null) {
          return null;
        }
        consider(untilEndS * 1000, true);
      } else if (condition.type === 'weather-event-peaked') {
        const eventId = condition.params?.weatherEventId;
        const untilPeakS =
          eventId !== undefined && WeatherManager.hasInstance() ? WeatherManager.getInstance().getSecondsUntilEventPeaks(eventId, condition.params?.pastPeakSeconds ?? 0) : null;
        if (untilPeakS === null) {
          return null;
        }
        consider(untilPeakS * 1000, true);
      } else if ((condition.maintainDuration ?? 0) > 0 && !cs.isMaintenanceComplete) {
        consider(Math.max(0, ((condition.maintainDuration ?? 0) - cs.maintainedDuration) * 1000), false);
      }
    }

    return isKnown ? { remainingMs, isClockAnchored } : null;
  }

  /**
   * Phase 28 D1: the objective is waiting out its hold. It offers a timeSkip,
   * its setup is done (the skip availability rule) and a clock-gated or
   * timed-hold row is still running. The mission countdown and its own
   * countdown are held meanwhile, so waiting and skipping score the same.
   */
  private isWaitPhase_(state: ObjectiveState): boolean {
    if (!state.objective.timeSkip || !state.isActive || state.isCompleted || state.isFailed) {
      return false;
    }
    const isWaiting = state.conditionStates.some(
      (cs) => (TIME_GATED_CONDITION_TYPES.has(cs.condition.type) || (cs.condition.maintainDuration ?? 0) > 0) && !ObjectivesManager.isConditionMet_(cs, state.objective)
    );

    return isWaiting && ObjectivesManager.isSkipReady_(state);
  }

  /**
   * The objective whose wait is holding the mission countdown, or null. The
   * HUD shows HOLD beside the MISSION timer while this is set.
   */
  getMissionClockHold(): { objectiveId: string; title: string; label: string } | null {
    const state = this.objectiveStates_.find((s) => this.isWaitPhase_(s));
    if (!state) {
      return null;
    }

    return { objectiveId: state.objective.id, title: state.objective.title, label: state.objective.timeSkip?.label ?? 'wait' };
  }

  /**
   * Absolute station-clock ms for a scenario-time-reached `HH:MM[:SS]` (UTC):
   * the first such moment at or after the scenario start. Null when the
   * string does not parse.
   */
  static scenarioTimeTargetMs(scenarioTime: string | undefined): number | null {
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(scenarioTime?.trim() ?? '');
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? 0);
    if (hours > 23 || minutes > 59 || seconds > 59) {
      return null;
    }

    const epochMs = SimClock.nowMs() - SimClock.scenarioElapsedMs();
    const epoch = new Date(epochMs);
    let targetMs = Date.UTC(epoch.getUTCFullYear(), epoch.getUTCMonth(), epoch.getUTCDate(), hours, minutes, seconds);
    if (targetMs < epochMs) {
      targetMs += 86_400_000;
    }

    return targetMs;
  }

  /** Phase 27 Q4: mark an objective's one-shot skip used (TimeSkipController) */
  markTimeSkipUsed(objectiveId: string): void {
    const state = this.getObjectiveState(objectiveId);
    if (state) {
      state.timeSkipUsed = true;
    }
  }

  /**
   * An objective's countdown reached zero. Fatal objectives (`timeoutFails`)
   * fail the scenario as before; the rest stop the clock, deduct the timeout
   * penalty once and stay open in overtime, so a slow operator still finishes
   * the shift (Phase 26 D2).
   */
  private expireObjectiveTimer_(state: ObjectiveState): void {
    const objective = state.objective;
    if (objective.timeoutFails) {
      this.failObjective_(state, 'timeout');
      return;
    }

    state.isTimerRunning = false;
    state.timeRemainingSeconds = 0;
    if (state.timedOut) {
      return;
    }
    state.timedOut = true;

    const pointsDeducted = objective.timeoutPenaltyPoints ?? Math.ceil((objective.points ?? 0) / 2);
    state.timePenaltyApplied = true;
    state.timePenaltyPoints = (state.timePenaltyPoints ?? 0) + pointsDeducted;

    this.eventBus_.emit(Events.TIME_PENALTY_APPLIED, {
      objectiveId: objective.id,
      objectiveTitle: objective.title,
      pointsDeducted,
      message: `Time ran out on "${objective.title}". Finish it to carry on.`,
      elapsedTime: this.getElapsedTime(),
      threshold: objective.timeLimitSeconds ?? 0,
    });
  }

  /**
   * Mark an objective as failed
   */
  private failObjective_(state: ObjectiveState, reason: ObjectiveFailedData['reason']): void {
    state.isFailed = true;
    state.failedAt = SimClock.nowMs();

    // Stop ALL timers when any objective fails
    this.stopAllTimers();

    // Pause simulated time
    if (OpsLogManager.isInitialized()) {
      OpsLogManager.getInstance().pause();
    }

    this.eventBus_.emit(Events.OBJECTIVE_FAILED, {
      objectiveId: state.objective.id,
      objective: state.objective,
      failedAt: state.failedAt,
      reason,
    });
  }

  /**
   * Fail every live objective that still needs the command link once its
   * window has closed. A LEO command window is the pass, and it never reopens:
   * without this the objective sits unfinishable with nothing on screen to
   * say so. Only unmet command conditions count - an ACK already in hand
   * survives the window.
   */
  private failOnClosedCommandWindow_(): void {
    if (!CommandingManager.isInitialized() || !CommandingManager.getInstance().hasWindowClosed()) {
      return;
    }

    for (const state of this.objectiveStates_) {
      if (!state.isActive || state.isCompleted || state.isFailed) {
        continue;
      }
      const needsLink = state.objective.conditions.some((condition) => COMMAND_LINK_CONDITIONS.has(condition.type) && !this.evaluateCondition_(condition, state));
      if (needsLink) {
        this.failObjective_(state, 'window-closed');
        return;
      }
    }
  }

  /**
   * Handle scenario-level timeout
   */
  private handleScenarioTimeout_(): void {
    this.stopAllTimers();

    // Pause simulated time
    if (OpsLogManager.isInitialized()) {
      OpsLogManager.getInstance().pause();
    }

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
  /** A correct decision pauses timers exactly as a passed quiz does */
  private handleDecisionGraded_(data: DecisionGradedData): void {
    if (!data.correct) return;
    this.handleQuizPassed_({ objectiveId: data.objectiveId, conditionIndex: data.conditionIndex, attempts: data.attempts, pointsDeducted: data.pointsDeducted });
  }

  /** Continue after a decision resumes timers exactly as a completed quiz does */
  private handleDecisionResolved_(data: DecisionResolvedData): void {
    this.handleQuizCompleted_({
      objectiveId: data.objectiveId,
      conditionIndex: data.conditionIndex,
      totalAttempts: data.totalAttempts,
      totalPointsDeducted: data.totalPointsDeducted,
    });
  }

  private handleQuizPassed_(data: QuizPassedData): void {
    this.isQuizPassed_ = true;
    this.passedObjectiveId_ = data.objectiveId;

    // Pause scenario timer
    this.scenarioTimerRunning_ = false;

    // The objective timer is not stopped here: the open quiz holds every
    // countdown (countdown-hold.ts) and the timer resumes on Continue if the
    // objective is still open. Stopping it left a half-done objective untimed
    // with the HUD showing infinity (nats-s07-F6, s09-F3).

    // Pause simulated time
    if (OpsLogManager.isInitialized()) {
      OpsLogManager.getInstance().pause();
    }
  }

  /**
   * Handle quiz completed - resume scenario timer
   * Called when user clicks Continue button after correct answer
   */
  private handleQuizCompleted_(_data: QuizCompletedData): void {
    this.isQuizPassed_ = false;
    this.passedObjectiveId_ = null;

    // Resume scenario timer only if:
    // 1. Scenario has a time limit
    // 2. Time remains
    // 3. Not all objectives complete
    // 4. No incomplete freezing objectives (scenario is unlocked)
    if (this.scenarioTimeLimit_ !== null && this.scenarioTimeRemaining_ > 0 && !this.areAllObjectivesCompleted() && !ObjectivesManager.isScenarioLocked()) {
      this.scenarioTimerRunning_ = true;
    }

    // Resume simulated time
    if (OpsLogManager.isInitialized()) {
      OpsLogManager.getInstance().resume();
    }
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
   * Handle asset selection events from the UI
   * Updates the selected ground station for condition evaluation
   */
  private handleAssetSelected_(data: { type: string; id: string }): void {
    if (data.type === 'ground-station') {
      ObjectivesManager.selectedGroundStationId_ = data.id;
      ObjectivesManager.selectedSatelliteId_ = null;
    } else if (data.type === 'satellite') {
      ObjectivesManager.selectedSatelliteId_ = data.id;
      ObjectivesManager.selectedGroundStationId_ = null;
    } else {
      // Non-asset selected (mission-overview, etc.)
      ObjectivesManager.selectedGroundStationId_ = null;
      ObjectivesManager.selectedSatelliteId_ = null;
    }
  }

  /**
   * Get the currently selected ground station ID
   */
  static getSelectedGroundStationId(): string | null {
    return ObjectivesManager.selectedGroundStationId_;
  }

  /**
   * Get the currently selected satellite ID
   */
  static getSelectedSatelliteId(): string | null {
    return ObjectivesManager.selectedSatelliteId_;
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

      // Condition states restore by index, so a save taken before an objective's
      // conditions were re-authored would tick the wrong rows. Treat such an
      // objective as fresh rather than half-restoring it.
      if (savedState.conditionStates.length !== currentState.conditionStates.length) {
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
      currentState.timedOut = savedState.timedOut;
      currentState.isFailed = savedState.isFailed;
      currentState.failedAt = savedState.failedAt;

      // Restore time penalty state
      currentState.timePenaltyApplied = savedState.timePenaltyApplied;
      currentState.timePenaltyPoints = savedState.timePenaltyPoints;
      currentState.timeSkipUsed = savedState.timeSkipUsed;

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
          currentCondState.observed = savedCondState.observed;
          currentCondState.lostTimestamps = savedCondState.lostTimestamps || [];
          // A save from before requiresChange (or one taken mid-objective)
          // carries no activation baseline; do not make a reloading player
          // undo work to tick it
          currentCondState.changeArmed = savedCondState.changeArmed ?? true;
          currentCondState.changeBaseline = savedCondState.changeBaseline;
          currentCondState.lockLostSeen = savedCondState.lockLostSeen;
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

    // Resume OpsLogManager if no freezing objective is incomplete
    // (scenario should be unlocked if freezing objective was already completed)
    const hasIncompleteFreezingObjective = this.objectiveStates_.some((state) => state.objective.freezesScenarioTimer && !state.isCompleted);
    if (!hasIncompleteFreezingObjective && OpsLogManager.isInitialized()) {
      OpsLogManager.getInstance().resume();
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

  /** Player-facing name of a mission-control tab id, for checklist hints */
  private static tabLabel_(tabId: string): string {
    const labels: Record<string, string> = {
      dashboard: 'Dashboard',
      'mission-overview': 'Overview',
      'rx-analysis': 'RX Analysis',
      'tx-chain': 'TX Chain',
      'gps-timing': 'GPS Timing',
      'acu-control': 'ACU Control',
      'pass-schedule': 'Pass Schedule',
      'link-budget': 'Link Analysis',
      commanding: 'TT&C',
      telemetry: 'Telemetry',
      'security-console': 'Security',
      geolocation: 'Geolocation',
    };
    const key = Object.keys(labels).find((id) => tabId === id || tabId.startsWith(`${id}-`));
    return key ? labels[key] : tabId;
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

      html += `<li class="objective-item ${stateClass} ${collapsedClass}" data-objective-id="${objective.id}">`;
      html += `<div class="objective-header" onclick="this.parentElement.classList.toggle('collapsed');">`;
      html += `<span class="accordion-icon"></span>`;
      html += `<strong>${fillDialogTokens(objective.title)}</strong> - ${stateLabel}`;

      // Optional objectives do not gate Mission Complete (see
      // areAllObjectivesCompleted); say so on the row, or the player cannot
      // tell which rows they may leave.
      if (objective.isOptional) {
        html += `<span class="objective-optional" title="Does not gate mission completion">Optional</span>`;
      }

      // Add timer display if objective has a running timer (a Q1-held one
      // shows no countdown: the timed work is done)
      if (objectiveState.isTimerRunning && objectiveState.timeRemainingSeconds !== undefined && !this.isCountdownHeld_(objectiveState)) {
        const timeStr = this.formatTimeRemaining(objectiveState.timeRemainingSeconds);
        const urgencyClass = objectiveState.timeRemainingSeconds < 30 ? 'timer-urgent' : '';
        html += `<span class="objective-timer ${urgencyClass}">${timeStr}</span>`;
      }

      html += `</div>`;
      html += `<div class="objective-content">`;
      html += `<p>${fillDialogTokens(objective.description)}</p>`;
      html += '<ul class="conditions-list">';

      const quizManager = QuizManager.getInstance();
      const hintManager = HintManager.getInstance();

      for (let i = 0; i < objective.conditions.length; i++) {
        const condition = objective.conditions[i];

        // Hidden conditions are still enforced for completion but not shown
        // (e.g. the tab-active requirement on qualified-operator scenarios,
        // where we don't spell out which tab to open).
        // Phase 29 D5: a tab gate on a quiz step is always shown, from the
        // step's start, or the quiz looks answerable with nothing left to do
        const isGate = isTabGate(condition, objective);
        if (condition.hidden && !isGate) {
          continue;
        }

        const conditionState = objectiveState.conditionStates[i];
        const conditionCompleted = conditionState.isMaintenanceComplete;

        // Check if this condition has a pending quiz
        const hasQuiz = quizManager.hasQuiz(objective.id, i);
        const isQuizComplete = hasQuiz && quizManager.isQuizComplete(objective.id, i);
        const isQuizPending = hasQuiz && !isQuizComplete;

        // Check if this condition has a hint
        const hasHint = hintManager.hasHint(objective.id, i);
        const isHintRequested = hasHint && hintManager.isHintRequested(objective.id, i);

        html += `<li class="condition-item ${conditionCompleted ? 'completed' : 'incomplete'}">`;
        const rowLabel = isGate && condition.hidden && condition.params?.tab ? tabGateLabel(condition.params.tab) : fillDialogTokens(conditionLabel(condition));
        html += `<span class="condition-text">${rowLabel}</span>`;

        // An observation-gated check only progresses while its tab is open;
        // say which, or it looks stuck (nats-s18-F5)
        if (!conditionCompleted && condition.params?.requiresObservation && condition.params?.observationTab && !conditionState.observed) {
          const tabName = ObjectivesManager.tabLabel_(condition.params.observationTab);
          if (conditionState.offTabNudged) {
            // Phase 35 D3: it reads true right now and nobody is looking
            html += `<span class="condition-observe-alert" role="alert">Reads true now. Open ${tabName} to log it.</span>`;
          } else {
            html += `<span class="condition-observe-hint">(check it on the ${tabName} tab)</span>`;
          }
        }

        // Add quiz button for pending quizzes
        if (isQuizPending) {
          html += `<button class="condition-quiz-btn" data-objective-id="${objective.id}" data-condition-index="${i}" title="Take Quiz">?</button>`;
        }

        // Add hint button if hint is available and condition not yet completed
        if (hasHint && !conditionCompleted) {
          if (isHintRequested) {
            // Hint already used - clickable to reopen (no penalty)
            html += `<button class="condition-hint-btn condition-hint-used" data-objective-id="${objective.id}" data-condition-index="${i}" data-hint-used="true" title="View Hint (no additional penalty)">&#128161;</button>`;
          } else {
            // Hint available - show request button
            html += `<button class="condition-hint-btn" data-objective-id="${objective.id}" data-condition-index="${i}" title="Request Hint (-50% points)"><img src="${bulbPng}" alt="Hint Icon" /></button>`;
          }
        }

        html += '</li>';
      }

      // B5: a hidden tab row that has been the only blocker for a while gets
      // named, or the objective looks stuck (nats-s16-F5, r2-s24-F1)
      if (isActive && !isCompleted) {
        for (const cs of objectiveState.conditionStates) {
          if (
            cs.condition.hidden &&
            cs.condition.type === 'tab-active' &&
            !isTabGate(cs.condition, objective) &&
            (cs.tabHintSeconds ?? 0) >= TAB_HINT_DELAY_SECONDS &&
            cs.condition.params?.tab
          ) {
            html += `<li class="condition-item incomplete condition-tab-hint"><span class="condition-text condition-observe-hint">${tabHintLabel(cs.condition.params.tab)}</span></li>`;
          }
        }
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

    this.advanceCountdowns_();
    this.failOnClosedCommandWindow_();
    this.watchLockLoss_();

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
        objectiveState.completedAt = SimClock.nowMs();
        objectiveState.isTimerRunning = false; // Stop timer on completion

        // Check for time penalty
        if (objectiveState.objective.timePenalty) {
          const elapsedTime = this.getElapsedTime();
          const penalty = objectiveState.objective.timePenalty;

          if (elapsedTime > penalty.elapsedTimeThreshold) {
            objectiveState.timePenaltyApplied = true;
            objectiveState.timePenaltyPoints = (objectiveState.timePenaltyPoints ?? 0) + penalty.pointsDeducted;

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

        // If this was a freezing objective, start the scenario timer and resume simulated time
        if (objectiveState.objective.freezesScenarioTimer) {
          this.scenarioTimerRunning_ = true;
          this.scenarioStartTime_ = missionNowMs(); // Reset start time so elapsed time is from now

          // Resume simulated time (OpsLogManager starts paused until scenario unlocks)
          if (OpsLogManager.isInitialized()) {
            OpsLogManager.getInstance().resume();
          }

          this.eventBus_.emit(Events.SCENARIO_UNLOCKED);
        }

        // Check if all objectives are complete
        if (this.areAllObjectivesCompleted()) {
          // Freeze all timers when scenario is completed
          this.stopAllTimers();

          // Pause simulated time
          if (OpsLogManager.isInitialized()) {
            OpsLogManager.getInstance().pause();
          }

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
      // Hold-at-completion rows (maintainUntilObjectiveComplete, or B8:
      // mustMaintain with no duration) must be satisfied now; the rest must
      // have completed their maintenance
      return objectiveState.conditionStates.every((cs) => ObjectivesManager.isConditionMet_(cs, objectiveState.objective));
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
    const now = SimClock.nowMs();

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
        this.activateObjectiveState_(objectiveState, now);
      }
    }
  }

  /** Make an objective active: timer, checklist expansion, first evaluation, event */
  private activateObjectiveState_(objectiveState: ObjectiveState, now: number): void {
    objectiveState.isActive = true;
    objectiveState.activatedAt = now;

    // Start timer for objectives with 'on-activate' trigger (default behavior)
    const objective = objectiveState.objective;
    if (objective.timeLimitSeconds !== undefined && objective.timerStartTrigger !== 'on-scenario-load' && objective.timerStartTrigger !== 'on-pass-phase') {
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

  /**
   * Activate an objective now, bypassing its prerequisites. Used by decision
   * consequences (a wrong call opens the objective that deals with it).
   * Returns false if the objective is unknown, already active, or complete.
   */
  activateObjective(objectiveId: string): boolean {
    const state = this.objectiveStates_.find((s) => s.objective.id === objectiveId);
    if (!state || state.isActive || state.isCompleted) return false;
    this.activateObjectiveState_(state, SimClock.nowMs());
    return true;
  }

  /**
   * Deactivate an active, incomplete objective and reset its conditions, then
   * cascade to its dependents. Returns false if it was not active.
   */
  deactivateObjective(objectiveId: string): boolean {
    const state = this.objectiveStates_.find((s) => s.objective.id === objectiveId);
    if (!state || !state.isActive || state.isCompleted) return false;
    this.deactivateObjectiveState_(state);
    this.deactivateDependentObjectives_(objectiveId);
    return true;
  }

  /** Reset an objective to inactive with untouched conditions */
  private deactivateObjectiveState_(objectiveState: ObjectiveState): void {
    objectiveState.isActive = false;
    objectiveState.activatedAt = undefined;
    objectiveState.isTimerRunning = false;

    for (const condState of objectiveState.conditionStates) {
      condState.isSatisfied = false;
      condState.satisfiedAt = undefined;
      condState.maintainedDuration = 0;
      condState.isMaintenanceComplete = false;
      condState.observed = false; // re-observe after a prerequisite reset
      ObjectivesManager.resetLiveReadState_(condState);
      condState.changeArmed = undefined;
      condState.changeBaseline = undefined;
      condState.tabHintSeconds = 0;
      condState.lockLostSeen = undefined;
    }
  }

  /**
   * Deactivate objectives that depend on a given objective.
   * Used when uncompleting an objective to revert dependent objectives.
   */
  private deactivateDependentObjectives_(objectiveId: string): void {
    for (const objectiveState of this.objectiveStates_) {
      // Skip objectives that aren't active or are already completed
      if (!objectiveState.isActive || objectiveState.isCompleted) {
        continue;
      }

      // Check if this objective has the given objective as a prerequisite
      const prerequisites = objectiveState.objective.prerequisiteObjectiveIds || [];
      if (prerequisites.includes(objectiveId)) {
        this.deactivateObjectiveState_(objectiveState);

        // Recursively deactivate objectives that depend on this one
        this.deactivateDependentObjectives_(objectiveState.objective.id);
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

      const holds = holdsAtCompletion(conditionState.condition, objectiveState.objective);

      // Skip already completed maintenance (unless it must hold at completion)
      if (conditionState.isMaintenanceComplete && !holds) {
        continue;
      }

      const wasSatisfied = conditionState.isSatisfied;
      this.lastObserved_ = undefined;
      let isNowSatisfied = this.evaluateCondition_(conditionState.condition, objectiveState, dtSeconds);

      // B1 requiresChange: already true on the activation frame counts only
      // after the watched value changes or the row goes false once
      if (this.requiresChange_.get(conditionState.condition)) {
        isNowSatisfied = ObjectivesManager.applyRequiresChange_(conditionState, isNowSatisfied, valueSnapshot(this.lastObserved_));
      }

      // Observation gate: a flagged passive condition does not count from
      // ambient simulation state alone. It must be seen on the correct tab
      // for the dwell (continuously true while the tab is active), after
      // which it latches satisfied (stays checked even if the operator
      // navigates away or the live value changes). The dwell is what gives
      // the operator time to read the panel before the checklist ticks.
      const condParams = conditionState.condition.params;
      if (condParams?.requiresObservation && condParams?.observationTab) {
        if (conditionState.observed) {
          // Latched as read, but a row that must still hold when the objective
          // completes ("hold C/N above 8 dB through culmination") keeps its live value
          isNowSatisfied = holds ? isNowSatisfied : true;
          conditionState.liveOffTabSeconds = 0;
        } else if (!this.isObservationContextActive_(conditionState.condition, objectiveState.objective)) {
          conditionState.observedSeconds = 0; // off-tab: the read starts over
          conditionState.observedGapSeconds = 0;
          this.trackOffTabRead_(objectiveState, condIndex, conditionState, isNowSatisfied, dtSeconds);
          isNowSatisfied = false; // value not yet observed on the right tab
        } else if (isNowSatisfied) {
          conditionState.liveOffTabSeconds = 0;
          conditionState.offTabNudged = false;
          const dwellSeconds = observationDwellSeconds(conditionState.condition, DEFAULT_OBSERVATION_DWELL_SECONDS);
          conditionState.observedSeconds = (conditionState.observedSeconds ?? 0) + dtSeconds;
          conditionState.observedGapSeconds = 0;
          if (conditionState.observedSeconds >= dwellSeconds) {
            conditionState.observed = true; // read for long enough - latch
          } else {
            isNowSatisfied = false; // on the right tab, still reading
          }
        } else {
          // On the right tab but reading false. A LEO pass drops one low frame
          // every second (position throttle), so a gap inside the grace keeps
          // the dwell; a longer one means the value really went away.
          conditionState.observedGapSeconds = (conditionState.observedGapSeconds ?? 0) + dtSeconds;
          if (conditionState.observedGapSeconds > OBSERVATION_DWELL_GRACE_SECONDS) {
            conditionState.observedSeconds = 0;
          }
          isNowSatisfied = false;
        }
      }

      // Update satisfied state
      conditionState.isSatisfied = isNowSatisfied;

      // Feed the text-token ledger (`{{val:OBJ.N}}`) directly: the telemetry event below is
      // off in play, so the ledger's listener alone never saw a value outside the harness
      if (isNowSatisfied && typeof this.lastObserved_ === 'number' && Number.isFinite(this.lastObserved_)) {
        EventTimeLedger.recordValue(`${objectiveState.objective.id}.${condIndex}`, this.lastObserved_);
      }

      if (this.isConditionTelemetryEnabled_) {
        this.eventBus_.emit(Events.OBJECTIVE_CONDITION_EVALUATED, {
          objectiveId: objectiveState.objective.id,
          conditionIndex: condIndex,
          type: conditionState.condition.type,
          isSatisfied: isNowSatisfied,
          observed: this.lastObserved_,
        });
      }

      // Handle condition state changes
      if (isNowSatisfied && !wasSatisfied) {
        // Condition just became satisfied
        conditionState.satisfiedAt = SimClock.nowMs();
        conditionState.maintainedDuration = 0;

        // Mark as complete based on condition type (a mustMaintain row with
        // no duration that does not hold is a D5 tab gate: it latches now)
        if (holds || !conditionState.condition.mustMaintain || !conditionState.condition.maintainDuration) {
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
        conditionState.lostTimestamps.push(SimClock.nowMs());

        // A hold-at-completion row that drops is no longer met
        if (holds) {
          conditionState.isMaintenanceComplete = false;
        }

        this.eventBus_.emit(Events.OBJECTIVE_CONDITION_CHANGED, {
          objectiveId: objectiveState.objective.id,
          conditionIndex: condIndex,
          isSatisfied: false,
          conditionState,
        });
      } else if (isNowSatisfied) {
        // Condition continues to be satisfied - update maintenance duration.
        // B3: a timed hold accrues only while the objective's tab-active
        // siblings are on and its observation siblings have been read
        if (this.maintainSiblingsHold_(objectiveState, conditionState)) {
          conditionState.maintainedDuration += dtSeconds;
        }

        // Check if maintenance requirement is met
        if (!conditionState.isMaintenanceComplete) {
          if (holds) {
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

    this.trackTabHints_(objectiveState, dtSeconds);
  }

  /** Clear the off-tab nudge and pass-phase latch so a re-done objective starts clean */
  private static resetLiveReadState_(cs: ConditionState): void {
    cs.liveOffTabSeconds = 0;
    cs.offTabNudged = false;
    cs.passPrevElevation = undefined;
    cs.passSeenAbove = undefined;
    cs.passPastCulmination = undefined;
    cs.passPhaseLatched = undefined;
  }

  /**
   * B1: gate a raw evaluation on a change since activation. The first
   * evaluation after activation takes the baseline: a row false then is free
   * to count; a row true then waits until it goes false once or its watched
   * value (the observed reading) moves off the baseline.
   */
  private static applyRequiresChange_(cs: ConditionState, raw: boolean, snapshot: string | undefined): boolean {
    if (cs.changeArmed === true) {
      return raw;
    }
    if (cs.changeArmed === undefined) {
      cs.changeArmed = !raw;
      cs.changeBaseline = snapshot;

      return false;
    }
    if (!raw || (snapshot !== undefined && cs.changeBaseline !== undefined && snapshot !== cs.changeBaseline)) {
      cs.changeArmed = true;
    }

    return cs.changeArmed ? raw : false;
  }

  /**
   * B3: whether a timed hold may accrue this frame. Every tab-active sibling
   * must be on now (read live: a latched tab row stays ticked after the player
   * leaves) and every requiresObservation sibling must have been observed.
   */
  private maintainSiblingsHold_(objectiveState: ObjectiveState, conditionState: ConditionState): boolean {
    if (!conditionState.condition.maintainDuration) {
      return true;
    }
    for (const sibling of objectiveState.conditionStates) {
      if (sibling === conditionState) {
        continue;
      }
      if (sibling.condition.type === 'tab-active' && !this.isTabActive_(sibling.condition.params?.tab)) {
        return false;
      }
      if (sibling.condition.params?.requiresObservation && sibling.condition.params?.observationTab && !sibling.observed) {
        return false;
      }
    }

    return true;
  }

  /** Whether the active TabbedCanvas tab is `tab` (exact id or prefix) */
  private isTabActive_(tab: string | undefined): boolean {
    if (!tab) {
      return false;
    }
    const activeTab = TabbedCanvas.getActiveTab();

    return !!activeTab && (activeTab === tab || activeTab.startsWith(`${tab}-`));
  }

  /**
   * B5: count how long each hidden tab-active row has been the only thing
   * (besides quizzes, which wait on it under B7) holding the objective up.
   */
  private trackTabHints_(objectiveState: ObjectiveState, dtSeconds: number): void {
    for (const cs of objectiveState.conditionStates) {
      if (!cs.condition.hidden || cs.condition.type !== 'tab-active' || isTabGate(cs.condition, objectiveState.objective)) {
        continue;
      }
      const isBlocking =
        !ObjectivesManager.isConditionMet_(cs, objectiveState.objective) &&
        objectiveState.conditionStates.every(
          (other) => other === cs || isQuizCondition(other.condition.type) || ObjectivesManager.isConditionMet_(other, objectiveState.objective)
        );
      cs.tabHintSeconds = isBlocking ? (cs.tabHintSeconds ?? 0) + dtSeconds : 0;
    }
  }

  /** Whether the receiver modem a condition names (default: the active one) has lock */
  private isReceiverLocked_(gs: GroundStation, params: ConditionParams | undefined): boolean {
    return this.evaluateEquipment_(gs.receivers, params, (receiver) => {
      const modemNum = params?.modemNumber ?? receiver.state.activeModem;
      const modem = receiver.state.modems.find((m) => m.modemNumber === modemNum);
      if (!modem?.isPowered) return false;

      const signals = receiver.getSignalsInBandwidth(modem);
      // Phase 35 D10: a lock on some other carrier in the band is not this lock
      if (params?.signalId !== undefined && signals.targetSignalId !== params.signalId) return false;

      return signals.hasLock;
    });
  }

  /**
   * Phase 35 D9: pass-phase rows judge true geometry at the objective's
   * station and latch once reached while the objective is active.
   * past-culmination: elevation is falling above the receivable elevation.
   * setting-below: past culmination and elevation under params.elevation.
   * set: below the receivable elevation after having been above it.
   * 'update' is false for a read-only probe, which must not move the latch.
   */
  private evaluatePassPhase_(condition: Condition, objectiveState: ObjectiveState, gs: GroundStation, update: boolean): boolean {
    const cs = objectiveState.conditionStates.find((c) => c.condition === condition);
    if (!cs) return false;
    if (cs.passPhaseLatched) return true;
    const noradId = condition.params?.noradId;
    const phase = condition.params?.phase;
    if (noradId === undefined || !phase) return false;
    const sat = SimulationManager.getInstance().getSatByNoradId(noradId);
    if (!(sat instanceof OrbitalSatellite)) return false;

    const el = sat.geometryFor(observerFromLocation(gs.state.location)).el as number;
    const receivable = sat.minElevation as number;
    const prev = cs.passPrevElevation;
    let culminated = cs.passPastCulmination === true;
    let seenAbove = cs.passSeenAbove === true;
    if (el > receivable) seenAbove = true;
    if (!culminated && prev !== undefined && el < prev - 1e-6 && el > receivable) culminated = true;

    let reached = false;
    if (phase === 'past-culmination') reached = culminated;
    else if (phase === 'setting-below') reached = culminated && el < (condition.params?.elevation ?? receivable);
    else reached = seenAbove && el <= receivable;

    if (update) {
      cs.passPrevElevation = el;
      cs.passSeenAbove = seenAbove;
      cs.passPastCulmination = culminated;
      if (reached) {
        cs.passPhaseLatched = true;
        this.startPassPhaseTimer_(objectiveState);
      }
    }

    return reached;
  }

  /** timerStartTrigger 'on-pass-phase': the countdown starts when the pass-phase row latches */
  private startPassPhaseTimer_(objectiveState: ObjectiveState): void {
    const objective = objectiveState.objective;
    if (objective.timerStartTrigger !== 'on-pass-phase' || objective.timeLimitSeconds === undefined) return;
    if (objectiveState.isTimerRunning || objectiveState.isCompleted || objectiveState.isFailed) return;
    objectiveState.timeRemainingSeconds = objective.timeLimitSeconds;
    objectiveState.isTimerRunning = true;
  }

  /**
   * Phase 29 D10: receiver-relocked rows watch for a lock loss from the
   * activation of `lockLostAfterObjectiveId` (default their own objective),
   * even while their own objective still waits on prerequisites, so a drop
   * during an earlier step still counts. The loss latches on the row.
   */
  private watchLockLoss_(): void {
    for (const objectiveState of this.objectiveStates_) {
      if (objectiveState.isCompleted || objectiveState.isFailed) {
        continue;
      }
      for (const cs of objectiveState.conditionStates) {
        if (cs.condition.type !== 'receiver-relocked' || cs.lockLostSeen) {
          continue;
        }
        const anchorId = cs.condition.params?.lockLostAfterObjectiveId;
        const anchor = anchorId ? this.objectiveStates_.find((o) => o.objective.id === anchorId) : objectiveState;
        if (!anchor || !(anchor.isActive || anchor.isCompleted)) {
          continue;
        }
        const gs = this.getGroundStation_(objectiveState);
        if (gs && !this.isReceiverLocked_(gs, cs.condition.params)) {
          cs.lockLostSeen = true;
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
  // ── Condition telemetry (authoring / dev harness) ──────────────────────
  // Off by default. When enabled, every evaluation of every active condition
  // emits OBJECTIVE_CONDITION_EVALUATED carrying the value the check compared
  // (frequency, mode, power...) so an author can see why a row is not green.
  private isConditionTelemetryEnabled_ = false;
  private lastObserved_: unknown = undefined;

  /** Enable or disable per-evaluation condition telemetry events. */
  enableConditionTelemetry(enabled: boolean): void {
    this.isConditionTelemetryEnabled_ = enabled;
  }

  /**
   * Record the value a condition check compared against its target. Always
   * kept: requiresChange (B1) compares it with the activation baseline; the
   * telemetry event only goes out when telemetry is on.
   */
  private observe_(value: unknown): void {
    this.lastObserved_ = value;
  }

  /**
   * Developer / authoring aid: mark every transitive prerequisite of
   * `objectiveId` complete (conditions satisfied, maintenance done) so the
   * scenario resumes at that objective. Equipment state is NOT synthesised;
   * the author sets it by hand. Refuses unless DEVELOPER_MODE is on.
   * @returns the objective ids marked complete, or null when refused / unknown id
   */
  devCompleteThrough(objectiveId: string): string[] | null {
    if (!window.DEVELOPER_MODE) {
      console.warn('[ObjectivesManager] devCompleteThrough requires DEVELOPER_MODE');
      return null;
    }
    const byId = new Map(this.objectiveStates_.map((state) => [state.objective.id, state]));
    if (!byId.has(objectiveId)) {
      return null;
    }
    const toComplete = new Set<string>();
    const visit = (id: string): void => {
      for (const prereq of byId.get(id)?.objective.prerequisiteObjectiveIds ?? []) {
        if (!toComplete.has(prereq)) {
          toComplete.add(prereq);
          visit(prereq);
        }
      }
    };
    visit(objectiveId);

    const now = SimClock.nowMs();
    const saved: ObjectiveState[] = [...toComplete].map((id) => {
      const state = byId.get(id)!;
      return {
        ...state,
        isActive: false,
        isCompleted: true,
        activatedAt: state.activatedAt ?? now,
        completedAt: now,
        isFailed: false,
        isTimerRunning: false,
        conditionStates: state.conditionStates.map((cs) => ({
          ...cs,
          isSatisfied: true,
          satisfiedAt: now,
          isMaintenanceComplete: true,
          observed: true,
        })),
      };
    });
    this.restoreState(saved);
    return [...toComplete];
  }

  /** B7: whether a status-check quiz may be registered (see quizAfterConditions) */
  private isQuizGateOpen_(objectiveState: ObjectiveState, conditionIndex: number): boolean {
    const gate = objectiveState.conditionStates[conditionIndex]?.condition.params?.quizAfterConditions;
    if (gate === false || (objectiveState.objective.conditionLogic ?? 'AND') === 'OR') {
      return true;
    }

    return objectiveState.conditionStates.every(
      (cs, index) => isQuizCondition(cs.condition.type) || (gate !== true && index > conditionIndex) || ObjectivesManager.isConditionMet_(cs, objectiveState.objective)
    );
  }

  private evaluateEquipment_<T>(equipmentArray: readonly T[], params: ConditionParams | undefined, checker: (item: T) => boolean): boolean {
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
   * Whether the operator is currently viewing the observation context (tab)
   * required to "observe" a requiresObservation condition. Mirrors the
   * tab-active matching (exact id or prefix).
   */
  private isObservationContextActive_(condition: Condition, objective?: Pick<Objective, 'groundStation'>): boolean {
    const targetTab = condition.params?.observationTab;
    if (!targetTab) return false;
    const activeTab = TabbedCanvas.getActiveTab();
    if (!activeTab) return false;
    // Phase 35 D11: the tab must be the objective's station's, not another station's
    const selected = TabbedCanvas.getSelectedAssetId();
    if (objective?.groundStation && selected !== null && selected !== objective.groundStation) return false;
    return activeTab === targetTab || activeTab.startsWith(`${targetTab}-`);
  }

  /**
   * Phase 35 D3: count the seconds an observation row reads true while its tab
   * is closed. At OFF_TAB_NUDGE_SECONDS the checklist row turns into an alert
   * and OBJECTIVE_OBSERVATION_PENDING fires once, so TabbedCanvas can pulse the tab.
   */
  private trackOffTabRead_(objectiveState: ObjectiveState, condIndex: number, cs: ConditionState, liveTrue: boolean, dtSeconds: number): void {
    if (!liveTrue) {
      cs.liveOffTabSeconds = 0;
      cs.offTabNudged = false;
      return;
    }
    cs.liveOffTabSeconds = (cs.liveOffTabSeconds ?? 0) + dtSeconds;
    const tab = cs.condition.params?.observationTab;
    if (cs.liveOffTabSeconds >= OFF_TAB_NUDGE_SECONDS && !cs.offTabNudged && tab) {
      cs.offTabNudged = true;
      this.eventBus_.emit(Events.OBJECTIVE_OBSERVATION_PENDING, { objectiveId: objectiveState.objective.id, conditionIndex: condIndex, tab });
    }
  }

  /**
   * Evaluate a single condition and return whether it's currently satisfied.
   * dtSeconds advances any hold the condition carries (cnHoldSeconds); omit it
   * for a read-only probe that must not touch the hold state.
   */
  private evaluateCondition_(condition: Condition, objectiveState: ObjectiveState, dtSeconds?: number): boolean {
    const sim = SimulationManager.getInstance();
    const gs = this.getGroundStation_(objectiveState);

    if (!gs) {
      return false;
    }

    switch (condition.type) {
      case 'antenna-locked': {
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          const state = antenna.state;
          this.observe_({ isLocked: state.isLocked, azimuth: state.azimuth, elevation: state.elevation });
          if (!state.isLocked) return false;

          // If a specific satellite is required, check it
          const requiredNoradId = (condition.params?.noradId as number | undefined) ?? (condition.params?.satelliteId as number | undefined);

          if (requiredNoradId !== undefined) {
            const targetSat = sim.getSatByNoradId(requiredNoradId);
            if (!targetSat) return false;

            // If the antenna has an explicit target satellite selected, it must match.
            // This prevents passing when the antenna is locked on the wrong satellite.
            const targetedNoradId = (state as { targetSatelliteId?: number | null }).targetSatelliteId;
            if (targetedNoradId !== undefined && targetedNoradId !== null && targetedNoradId !== requiredNoradId) {
              return false;
            }

            // A LEO, or a GEO with per-station geometry, sits at a different
            // az/el from each site: judge the lock from this antenna's station.
            const view =
              typeof antenna.viewOf === 'function'
                ? antenna.viewOf(targetSat)
                : targetSat instanceof OrbitalSatellite
                  ? targetSat.geometryFor(observerFromLocation(gs.state.location))
                  : targetSat;

            // Handle 360° wraparound for azimuth
            let azDiff = Math.abs(state.azimuth - view.az);
            if (azDiff > 180) azDiff = 360 - azDiff;
            const elDiff = Math.abs(state.elevation - view.el);
            return azDiff <= 1.5 && elDiff <= 1.5;
          }
          return true;
        });
      }

      case 'gpsdo-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => rfFrontEnd.gpsdoModule.state.isLocked);
      }

      case 'gpsdo-warmed-up': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const gpsdoState = rfFrontEnd.gpsdoModule.state;
          return gpsdoState.isPowered && gpsdoState.warmupTimeRemaining === 0 && gpsdoState.temperature >= 65 && gpsdoState.temperature <= 75;
        });
      }

      case 'gpsdo-gnss-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const gpsdoState = rfFrontEnd.gpsdoModule.state;
          return gpsdoState.isPowered && gpsdoState.gnssSignalPresent && gpsdoState.satelliteCount >= 4;
        });
      }

      case 'gpsdo-stability': {
        const maxAccuracy = condition.params?.maxFrequencyAccuracy ?? 5;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const gpsdoState = rfFrontEnd.gpsdoModule.state;
          this.observe_({ frequencyAccuracy: gpsdoState.frequencyAccuracy, allanDeviation: gpsdoState.allanDeviation, phaseNoise: gpsdoState.phaseNoise });
          return (
            gpsdoState.isPowered && gpsdoState.isLocked && gpsdoState.frequencyAccuracy < maxAccuracy && gpsdoState.allanDeviation < maxAccuracy && gpsdoState.phaseNoise < -125
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
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => rfFrontEnd.bucModule.state.isExtRefLocked);
      }

      case 'buc-reference-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          // 19.6: a locked LO carries the reference's own few parts in 10^12,
          // never exactly 0 Hz; locked to a warmed-up reference is the test
          return bucState.isPowered && bucState.isExtRefLocked && rfFrontEnd.gpsdoModule.get10MhzOutput().isWarmedUp;
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
          this.observe_(bucState.currentDraw);
          return bucState.isPowered && bucState.currentDraw <= maxCurrent;
        });
      }

      case 'buc-not-saturated': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          this.observe_({ outputPower: bucState.outputPower, saturationPower: bucState.saturationPower });
          return bucState.isPowered && bucState.outputPower <= bucState.saturationPower - 2;
        });
      }

      case 'buc-loopback-enabled': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          return bucState.isPowered && bucState.isLoopback;
        });
      }

      case 'buc-loopback-disabled': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          return bucState.isPowered && !bucState.isLoopback;
        });
      }

      case 'buc-temperature-normal': {
        const maxTemp = condition.params?.maxTemperature ?? 70;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          this.observe_(bucState.temperature);
          return bucState.isPowered && bucState.temperature <= maxTemp;
        });
      }

      case 'lnb-reference-locked': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          // 19.6: the locked LO's error is the reference's (millihertz), not 0
          return lnbState.isPowered && lnbState.isExtRefLocked && rfFrontEnd.gpsdoModule.get10MhzOutput().isWarmedUp;
        });
      }

      case 'lnb-lo-set': {
        if (!condition.params?.loFrequency) return false;
        const targetLoFrequency = condition.params.loFrequency;
        const tolerance = condition.params.loFrequencyTolerance ?? 0;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          this.observe_(lnbState.loFrequency);
          return lnbState.isPowered && Math.abs(lnbState.loFrequency - targetLoFrequency) <= tolerance;
        });
      }

      case 'lnb-gain-set': {
        if (!condition.params?.gain) return false;
        const targetGain = condition.params.gain;
        const tolerance = condition.params.gainTolerance ?? 0;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          this.observe_(lnbState.gain);
          return lnbState.isPowered && Math.abs(lnbState.gain - targetGain) <= tolerance;
        });
      }

      case 'lnb-thermally-stable': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          // Phase 19.6: powered for its stabilization time and locked to the
          // reference (the old window passed at power-on: 25 degC was inside it)
          const lnb = rfFrontEnd.lnbModule;
          this.observe_({ secondsSincePowerOn: lnb.secondsSincePowerOn, isExtRefLocked: lnb.state.isExtRefLocked });
          return lnb.isThermallyStable() && lnb.state.isExtRefLocked && lnb.state.noiseTemperature < 100;
        });
      }

      case 'lnb-noise-performance': {
        const maxNoiseTemp = condition.params?.maxNoiseTemperature ?? 100;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const lnbState = rfFrontEnd.lnbModule.state;
          this.observe_(lnbState.noiseTemperature);
          return lnbState.isPowered && lnbState.noiseTemperature <= maxNoiseTemp;
        });
      }

      case 'equipment-powered': {
        if (!condition.params?.equipment) return false;

        switch (condition.params.equipment) {
          case 'antenna':
            return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => antenna.state.isPowered);
          case 'gpsdo':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => rfFrontEnd.gpsdoModule.state.isPowered);
          case 'buc':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => rfFrontEnd.bucModule.state.isPowered);
          case 'lnb':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => rfFrontEnd.lnbModule.state.isPowered);
          case 'spectrum-analyzer':
            return true; // Spectrum analyzer always powered on for this simulation
          case 'transmitter':
            return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
              const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
              const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
              return modem?.isPowered ?? false;
            });
          case 'hpa':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => rfFrontEnd.hpaModule.state.isPowered);
          case 'filter':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => rfFrontEnd.filterModule.state.isPowered);
          default:
            return false;
        }
      }

      case 'equipment-not-powered': {
        if (!condition.params?.equipment) return false;

        switch (condition.params.equipment) {
          case 'antenna':
            return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => !antenna.state.isPowered);
          case 'gpsdo':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => !rfFrontEnd.gpsdoModule.state.isPowered);
          case 'buc':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => !rfFrontEnd.bucModule.state.isPowered);
          case 'lnb':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => !rfFrontEnd.lnbModule.state.isPowered);
          case 'hpa':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => !rfFrontEnd.hpaModule.state.isPowered);
          case 'filter':
            return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => !rfFrontEnd.filterModule.state.isPowered);
          case 'transmitter':
            return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
              const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
              const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
              return !(modem?.isPowered ?? true);
            });
          default:
            return false;
        }
      }

      case 'signal-detected': {
        const anyTuning = condition.params?.anyTuning === true;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          // B2: "detected" means on the screen: inside the displayed centre
          // +/- span/2, in the domain the analyzer is tapping (an RX IF tap
          // shows IF frequencies). A carrier wider than the window counts if
          // any of it is in view.
          const { centerFrequency, span } = specA.state;
          const signals = specA.getInputSignals().filter((s) => anyTuning || Math.abs(s.frequency - centerFrequency) <= span / 2 + (s.bandwidth ?? 0) / 2);
          this.observe_({ centerFrequency, span, inView: signals.map((s) => s.signalId) });
          if (signals.length === 0) return false;

          // If no specific signal required, any signal counts
          if (!condition.params?.signalId) {
            return true;
          }

          // Find the specific signal by ID
          const targetSignal = signals.find((s) => s.signalId === condition.params?.signalId);
          if (!targetSignal) return false;

          // If minPower specified, check signal meets threshold (include path gain)
          if (condition.params?.minPower !== undefined) {
            const totalGain = specA.rfFrontEnd_.couplerModule.signalPathManager.getTotalGainTo(TapPoint.RX_IF);
            const effectivePower = targetSignal.power + totalGain;
            this.observe_(effectivePower);
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
          const targetSignal = signals.find((s) => s.signalId === targetSignalId);
          if (!targetSignal) return false;

          // Include path gain to get effective power at spectrum analyzer
          const totalGain = specA.rfFrontEnd_.couplerModule.signalPathManager.getTotalGainTo(TapPoint.RX_IF);
          const effectivePower = targetSignal.power + totalGain;
          this.observe_(effectivePower);
          return effectivePower >= minPower;
        });
      }

      case 'frequency-set': {
        if (!condition.params?.frequency) return false;
        const targetFrequency = condition.params.frequency;
        const tolerance = condition.params.frequencyTolerance ?? 1e6;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          this.observe_(specA.state.centerFrequency);
          const diff = Math.abs(specA.state.centerFrequency - targetFrequency);
          return diff <= tolerance;
        });
      }

      case 'speca-span-set': {
        if (!condition.params?.span) return false;
        const targetSpan = condition.params.span;
        // spanTolerance is what authors write; it was ignored, so every span check
        // silently accepted ±1 MHz (nats-s08-F5)
        const tolerance = condition.params.spanTolerance ?? condition.params.frequencyTolerance ?? 1e6;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          this.observe_(specA.state.span);
          const diff = Math.abs(specA.state.span - targetSpan);
          return diff <= tolerance;
        });
      }

      case 'speca-rbw-set': {
        if (condition.params?.rbw === undefined) return false;
        const targetRbw = condition.params.rbw; // null means "Automatic"
        const tolerance = condition.params.frequencyTolerance ?? 1e3;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          this.observe_(specA.state.rbw);
          // Handle "Automatic" mode (null)
          if (targetRbw === null) {
            return specA.state.rbw === null;
          }
          // Handle specific RBW value
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
          this.observe_(specA.state.referenceLevel);
          const diff = Math.abs(specA.state.referenceLevel - targetRefLevel);
          return diff <= tolerance;
        });
      }

      case 'speca-center-frequency': {
        if (condition.params?.centerFrequency === undefined) return false;
        const targetCenterFreq = condition.params.centerFrequency;
        const tolerance = condition.params.centerFrequencyTolerance ?? 1e6; // Default 1 MHz
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          this.observe_(specA.state.centerFrequency);
          const diff = Math.abs(specA.state.centerFrequency - targetCenterFreq);
          return diff <= tolerance;
        });
      }

      case 'speca-noise-floor-visible': {
        const maxSignalStrength = condition.params?.maxSignalStrength ?? -60;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          const signals = specA.getInputSignals();
          this.observe_(Math.max(...signals.map((signal) => signal.power)));
          return signals.every((signal) => signal.power < maxSignalStrength);
        });
      }

      case 'speca-min-amplitude': {
        if (condition.params?.minAmplitude === undefined) return false;
        const targetMinAmplitude = condition.params.minAmplitude;
        const tolerance = condition.params.minAmplitudeTolerance ?? condition.params.amplitudeTolerance ?? 5;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          this.observe_(specA.state.minAmplitude);
          const diff = Math.abs(specA.state.minAmplitude - targetMinAmplitude);
          return diff <= tolerance;
        });
      }

      case 'speca-max-amplitude': {
        if (condition.params?.maxAmplitude === undefined) return false;
        const targetMaxAmplitude = condition.params.maxAmplitude;
        const tolerance = condition.params.maxAmplitudeTolerance ?? condition.params.amplitudeTolerance ?? 5;
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          this.observe_(specA.state.maxAmplitude);
          const diff = Math.abs(specA.state.maxAmplitude - targetMaxAmplitude);
          return diff <= tolerance;
        });
      }

      case 'filter-bandwidth-set': {
        if (condition.params?.bandwidthIndex === undefined) return false;
        const targetIndex = condition.params.bandwidthIndex;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          this.observe_(rfFrontEnd.filterModule.state.bandwidthIndex);
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
          const notchesToCheck = specificNotchIndex !== undefined ? [notchState.notches[specificNotchIndex]].filter(Boolean) : notchState.notches;
          // debugObjective showed `observed: null` here, which hid why S21 never completed (nats-s21-F3)
          this.observe_(notchesToCheck.map((n) => ({ enabled: n.enabled, centerFrequency: n.centerFrequency, bandwidth: n.bandwidth, depth: n.depth })));

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
          this.observe_(antenna.state.beaconFrequencyHz);
          const diff = Math.abs(antenna.state.beaconFrequencyHz - targetFrequency);
          return diff <= tolerance;
        });
      }

      case 'antenna-tracking-mode-set': {
        if (!condition.params?.trackingMode) return false;
        const targetMode = condition.params.trackingMode;
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          this.observe_({ trackingMode: antenna.state.trackingMode, isStepTrackEnabled: antenna.state.isStepTrackEnabled });
          // Step-track is an optimization layer on top of program-track, not a separate mode
          if (targetMode === 'step-track') {
            return antenna.state.trackingMode === 'program-track' && antenna.state.isStepTrackEnabled === true;
          }
          return antenna.state.trackingMode === targetMode;
        });
      }

      case 'antenna-polarization-set': {
        if (!condition.params?.circularHandedness) return false;
        const targetHandedness = condition.params.circularHandedness;
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          this.observe_(antenna.state.circularHandedness);
          return antenna.state.circularHandedness === targetHandedness;
        });
      }

      case 'antenna-beacon-locked': {
        const minBeaconCn = condition.params?.minBeaconCn;
        const beaconNoradId = condition.params?.noradId;
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => {
          // The beacon the tracker is locked to is the selected target's: a
          // lock held on the previous satellite is not this satellite's beacon
          if (beaconNoradId !== undefined && antenna.state.targetSatelliteId !== beaconNoradId) {
            return false;
          }
          if (minBeaconCn === undefined) {
            return antenna.state.isBeaconLocked === true;
          }
          const cn = antenna.state.beaconCN;
          this.observe_(cn);
          return antenna.state.isBeaconLocked === true && cn !== null && cn >= minBeaconCn;
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
          this.observe_({ azimuth: state.azimuth, elevation: state.elevation });

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
        return this.evaluateEquipment_(gs.antennas, condition.params, (antenna) => antenna.state.isHeaterEnabled === true);
      }

      case 'buc-unmuted': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          return bucState.isPowered && !bucState.isMuted;
        });
      }

      case 'buc-gain-set': {
        if (!condition.params?.gain) return false;
        const targetGain = condition.params.gain;
        const tolerance = condition.params.gainTolerance ?? 0;
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const bucState = rfFrontEnd.bucModule.state;
          this.observe_(bucState.gain);
          return bucState.isPowered && Math.abs(bucState.gain - targetGain) <= tolerance;
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
          this.observe_(hpaState.backOff);
          return hpaState.isPowered && Math.abs(hpaState.backOff - targetBackOff) <= tolerance;
        });
      }

      case 'hpa-not-overdriven': {
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const hpaState = rfFrontEnd.hpaModule.state;
          // Phase 35 s04-F5: a disabled HPA is not within limits, it is off
          return hpaState.isPowered && (hpaState.isHpaEnabled || condition.params?.allowHpaDisabled === true) && !hpaState.isOverdriven;
        });
      }

      case 'hpa-output-power-set': {
        if (condition.params?.minOutputPower === undefined) return false;
        // minOutputPower is specified in watts for intuitive scenario authoring
        // Convert watts to dBm for comparison: P(dBm) = 10 * log10(P(W) * 1000)
        const minPowerWatts = condition.params.minOutputPower;
        const minPowerDbm = 10 * Math.log10(minPowerWatts * 1000);
        return this.evaluateEquipment_(gs.rfFrontEnds, condition.params, (rfFrontEnd) => {
          const hpaState = rfFrontEnd.hpaModule.state;
          this.observe_(hpaState.outputPower);
          return hpaState.isPowered && hpaState.isHpaEnabled && hpaState.outputPower >= minPowerDbm;
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

      case 'satellite-pass-phase': {
        return this.evaluatePassPhase_(condition, objectiveState, gs, dtSeconds !== undefined);
      }

      case 'receiver-signal-locked': {
        return this.isReceiverLocked_(gs, condition.params);
      }

      case 'receiver-relocked': {
        // Phase 29 D10: lock lost during the watch (watchLockLoss_), then
        // regained. A lock that has not dropped yet does not count
        // (nats-r4-s17-F1: "Receiver Re-Locked" was ticked before the drop)
        const cs = objectiveState.conditionStates.find((c) => c.condition === condition);
        return !!cs?.lockLostSeen && this.isReceiverLocked_(gs, condition.params);
      }

      case 'receiver-snr-threshold': {
        // minCNRatio: C/N must be at or above (default). maxCNRatio (optional):
        // C/N must be at or below - used to assert a link has been denied. When
        // only maxCNRatio is given, the lower bound defaults to -Infinity.
        const hasMax = condition.params?.maxCNRatio !== undefined;
        const minCNRatio = condition.params?.minCNRatio ?? (hasMax ? -Infinity : 10);
        const maxCNRatio = condition.params?.maxCNRatio ?? Infinity;
        const inBand = this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find((m) => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          // Phase 35 D10: the C/N of some other carrier in the band is not this one's
          if (condition.params?.signalId !== undefined && receiver.getSignalsInBandwidth(modem).targetSignalId !== condition.params.signalId) return false;

          const snr = receiver.getSnrForModem(modem);
          this.observe_(snr);
          return snr !== null && snr >= minCNRatio && snr <= maxCNRatio;
        });

        // cnHoldSeconds: the reading must stay in band for a continuous run
        // before the condition reads true. Without it a maxCNRatio ceiling
        // latches on the one transient low frame the 1 s LEO position
        // throttle puts in every second of a pass. The run lives on the
        // condition state; a read-only probe (no dtSeconds) leaves it alone.
        const holdSeconds = condition.params?.cnHoldSeconds ?? 0;
        if (holdSeconds <= 0) return inBand;
        const held = objectiveState.conditionStates.find((cs) => cs.condition === condition);
        if (!held) return inBand;
        if (dtSeconds !== undefined) {
          held.heldSeconds = inBand ? (held.heldSeconds ?? 0) + dtSeconds : 0;
        }
        return inBand && (held.heldSeconds ?? 0) >= holdSeconds;
      }

      case 'receiver-afc-enabled': {
        // Default target is true (AFC on); afcEnabled: false asserts the
        // operator is tuning by hand (AFC absent on legacy modems counts as off)
        const targetAfc = condition.params?.afcEnabled ?? true;
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find((m) => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          return (modem.isAfcEnabled === true) === targetAfc;
        });
      }

      case 'rx-modem-frequency-set': {
        if (condition.params?.frequency === undefined) return false;
        const targetFrequency = condition.params.frequency;
        const tolerance = condition.params.frequencyTolerance ?? 1e6; // Default 1 MHz
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find((m) => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          // Modem frequency is in MHz, target is in Hz
          const modemFreqHz = modem.frequency * 1e6;
          this.observe_(modemFreqHz);
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
          const modem = receiver.state.modems.find((m) => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          // Modem bandwidth is in MHz, target is in Hz
          const modemBwHz = modem.bandwidth * 1e6;
          this.observe_(modemBwHz);
          const diff = Math.abs(modemBwHz - targetBandwidth);
          return diff <= tolerance;
        });
      }

      case 'rx-modem-modulation-set': {
        if (!condition.params?.modulation) return false;
        const targetModulation = condition.params.modulation;
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find((m) => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          this.observe_(modem.modulation);
          return modem.modulation === targetModulation;
        });
      }

      case 'rx-modem-fec-set': {
        if (!condition.params?.fec) return false;
        const targetFec = condition.params.fec;
        return this.evaluateEquipment_(gs.receivers, condition.params, (receiver) => {
          const modemNum = condition.params?.modemNumber ?? receiver.state.activeModem;
          const modem = receiver.state.modems.find((m) => m.modemNumber === modemNum);
          if (!modem?.isPowered) return false;

          this.observe_(modem.fec);
          return modem.fec === targetFec;
        });
      }

      case 'tx-modem-frequency-set': {
        if (condition.params?.frequency === undefined) return false;
        const targetFrequency = condition.params.frequency;
        const tolerance = condition.params.frequencyTolerance ?? 1e6; // Default 1 MHz
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          // Transmitter frequency is in Hz (stored in ifSignal)
          this.observe_(modem.ifSignal.frequency);
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
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          this.observe_(modem.ifSignal.power);
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
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          this.observe_(modem.ifSignal.bandwidth);
          const diff = Math.abs(modem.ifSignal.bandwidth - targetBandwidth);
          return diff <= tolerance;
        });
      }

      case 'tx-modem-modulation-set': {
        if (!condition.params?.modulation) return false;
        const targetModulation = condition.params.modulation;
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          if (!modem?.isPowered) return false;
          this.observe_(modem.ifSignal.modulation);
          return modem.ifSignal.modulation === targetModulation;
        });
      }

      case 'tx-modem-fec-set': {
        if (!condition.params?.fec) return false;
        const targetFec = condition.params.fec;
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          if (!modem?.isPowered) {
            return false;
          }
          const actualFec = modem.ifSignal.fec;
          this.observe_(actualFec);
          return actualFec === targetFec;
        });
      }

      case 'tx-modem-transmitting': {
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          return modem?.isPowered === true && modem?.isTransmitting === true;
        });
      }

      case 'tx-modem-not-transmitting': {
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          // Modem must be powered but NOT transmitting
          return modem?.isPowered === true && modem?.isTransmitting === false;
        });
      }

      case 'tx-active-modem': {
        if (condition.params?.modemNumber === undefined) return false;
        const targetModem = condition.params.modemNumber;
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          this.observe_(transmitter.state.activeModem);
          return transmitter.state.activeModem === targetModem;
        });
      }

      case 'tx-modem-loopback-enabled': {
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          return modem?.isPowered === true && modem?.isLoopback === true;
        });
      }

      case 'tx-modem-loopback-disabled': {
        return this.evaluateEquipment_(gs.transmitters, condition.params, (transmitter) => {
          const modemNum = condition.params?.modemNumber ?? transmitter.state.activeModem;
          const modem = transmitter.state.modems.find((m) => m.modem_number === modemNum);
          return modem?.isPowered === true && modem?.isLoopback === false;
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
        const conditionIndex = objectiveState.conditionStates.findIndex((cs) => cs.condition === condition);

        // "Ready to begin?" waits for the brief: registering it on load put
        // "Complete the quiz to continue" on screen before the player had
        // anything to answer (nats-s01-F16)
        const briefUnread = objectiveState.conditionStates.some((cs) => cs.condition.type === 'mission-brief-opened' && !cs.isSatisfied);
        if (briefUnread && !quizManager.hasQuiz(objectiveState.objective.id, conditionIndex)) {
          return false;
        }

        // B7: the knowledge check follows the doing. By default the quiz waits
        // for the non-quiz rows authored before it (a quiz written first is
        // still asked first); quizAfterConditions true waits for all of them,
        // false asks at activation. OR objectives ask at once.
        if (!quizManager.hasQuiz(objectiveState.objective.id, conditionIndex) && !this.isQuizGateOpen_(objectiveState, conditionIndex)) {
          return false;
        }

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
            params.pointPenalty ?? 5,
            params.character,
            params.preserveOptionOrder
          );
        }

        // Check if quiz has been completed
        return quizManager.isQuizComplete(objectiveState.objective.id, conditionIndex);
      }

      case 'decision': {
        // A judgement graded against held evidence facts at answer time.
        // Registration hands DecisionManager live readers; this case only
        // ticks the facts and reports whether the decision has been resolved.
        const params = condition.params;
        if (!params?.prompt || !params.decisionOptions?.length) {
          console.warn('decision condition missing required params (prompt, decisionOptions)');
          return false;
        }

        const gsKey = gs?.state.id ?? '';
        let registry = this.evidenceFacts_.get(gsKey);
        if (!registry) {
          registry = new EvidenceFactRegistry();
          this.evidenceFacts_.set(gsKey, registry);
        }
        registry.tick(dtSeconds ?? 0, { gs });

        const decisions = DecisionManager.getInstance();
        const conditionIndex = objectiveState.conditionStates.findIndex((cs) => cs.condition === condition);
        if (!decisions.has(objectiveState.objective.id, conditionIndex)) {
          // A decision written after a pass-phase gate waits for it, like a quiz
          // waits for the doing before it (rt-s20-F3a: the probe decision opened
          // while SAR-1 was still overhead, five minutes before the step)
          const passGatePending = objectiveState.conditionStates.some(
            (cs, index) => index < conditionIndex && cs.condition.type === 'satellite-pass-phase' && !ObjectivesManager.isConditionMet_(cs, objectiveState.objective)
          );
          if (passGatePending) return false;
          const factReader = registry;
          const evidenceIds = params.evidence ?? [];
          decisions.register(objectiveState.objective.id, conditionIndex, {
            prompt: params.prompt,
            options: params.decisionOptions,
            explanation: params.explanation,
            pointPenalty: params.pointPenalty,
            partialCreditUnevidenced: params.partialCreditUnevidenced,
            character: params.character,
            preserveOptionOrder: params.preserveDecisionOrder,
            groundStationId: objectiveState.objective.groundStation,
            readFact: (id) => factReader.read(id),
            evidenceStatus: () =>
              evidenceIds.map((id) => {
                const sibling = objectiveState.conditionStates.find((cs) => cs.condition.id === id);
                if (!sibling) {
                  console.warn(`decision evidence "${id}" names no condition in objective ${objectiveState.objective.id}`);
                  return { id, label: id, ready: false };
                }
                return { id, label: sibling.condition.description, ready: sibling.observed === true || sibling.isMaintenanceComplete };
              }),
          });
        }

        return decisions.isResolved(objectiveState.objective.id, conditionIndex);
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
        // Check if specific ground station is selected in the asset tree sidebar
        const targetGsId = condition.params?.groundStationId;
        if (!targetGsId) return false;

        return ObjectivesManager.selectedGroundStationId_ === targetGsId;
      }

      case 'satellite-selected': {
        // Check if specific satellite is selected in the asset tree sidebar
        const targetSatId = condition.params?.assetSatelliteId;
        if (!targetSatId) return false;

        return ObjectivesManager.selectedSatelliteId_ === targetSatId;
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
        // PLACEHOLDER - always passes; a row of this type ticks on activation
        // and teaches nothing. Phase 27 B6 removed it from nats S3/S11/S12;
        // do not author it until Phase 23.2 models packet loss during
        // handover (maxPacketLoss is reserved for that).
        return true;
      }

      case 'ops-log-entry': {
        // Something the operator typed into the Ops Log, not an auto entry:
        // "log it" steps used to complete from the final quiz alone (nats-s22-F7, s23-F6)
        if (!OpsLogManager.isInitialized()) return false;
        const minLength = condition.params?.logMinLength ?? 10;
        const keywords = (condition.params?.logKeywords ?? []).map((k) => k.toLowerCase().split('|'));
        const typed = OpsLogManager.getInstance()
          .getEntries()
          .filter((e) => e.source === 'operator');
        this.observe_(typed.map((e) => e.message));
        const matches = (text: string) => text.length >= minLength && keywords.every((alternatives) => alternatives.some((word) => text.includes(word)));
        if (typed.some((e) => matches(e.message.toLowerCase()))) return true;
        // nats S11 player report: operators split one handover across several
        // lines ("ME-02 has TM-1 now", "VT-01 parked for maintenance"). Lines
        // typed since this objective activated count together.
        const since = objectiveState.activatedAt;
        if (since === undefined) return false;
        const recent = typed.filter((e) => e.timeMs !== undefined && e.timeMs >= since);
        return recent.length > 1 && matches(recent.map((e) => e.message.toLowerCase()).join(' '));
      }

      case 'mission-brief-opened': {
        const targetBoxId = condition.params?.boxId as string | undefined;
        if (targetBoxId) {
          return ObjectivesManager.isBoxOpened(targetBoxId);
        }
        // If no specific boxId, check if any mission-brief box was opened
        for (const boxId of ObjectivesManager.openedBoxIds_) {
          if (boxId.startsWith('mission-brief')) {
            return true;
          }
        }
        return false;
      }

      case 'tab-active': {
        const targetTab = condition.params?.tab;
        if (!targetTab) return false;

        const activeTab = TabbedCanvas.getActiveTab();
        this.observe_(activeTab);
        if (!activeTab) return false;

        // Match exact tab ID or prefix (e.g., 'acu-control' matches 'acu-control-0')
        return activeTab === targetTab || activeTab.startsWith(`${targetTab}-`);
      }

      // (observation-context helper isObservationContextActive_ lives below)

      // ═══════════════════════════════════════════════════════════════
      // FEC Conditions
      // ═══════════════════════════════════════════════════════════════

      case 'rx-frame-sync-locked': {
        // Check if frame sync is locked (from RxPayloadAdapter state)
        // This evaluates the current FEC state from the ground station's receiver
        const expectedLocked = condition.params?.locked ?? true;
        if (!gs) return false;

        // Get first receiver and check frame sync via FECSimulator
        const receiver = gs.receivers[0];
        if (!receiver) return false;

        // Get signal info from receiver
        const signalInfo = receiver.getSignalsInBandwidth();
        const modem = receiver.activeModem;

        // FECSimulator calculates frame sync from signal conditions
        const fecSim = new FECSimulator();
        const metrics = fecSim.calculate(fecInputFromSignal(signalInfo, modem));

        this.observe_(metrics.frameSyncLocked);
        return metrics.frameSyncLocked === expectedLocked;
      }

      case 'rx-ber-threshold': {
        // Check if BER is above or below a threshold
        const threshold = condition.params?.berThreshold;
        const comparison = condition.params?.berComparison ?? 'below';
        if (threshold === undefined) return false;
        if (!gs) return false;

        const receiver = gs.receivers[0];
        if (!receiver) return false;

        const signalInfo = receiver.getSignalsInBandwidth();
        const modem = receiver.activeModem;

        const fecSim = new FECSimulator();
        const metrics = fecSim.calculate(fecInputFromSignal(signalInfo, modem));

        this.observe_(metrics.ber);
        if (comparison === 'below') {
          return metrics.ber < threshold;
        } else {
          return metrics.ber >= threshold;
        }
      }

      case 'rx-rs-uncorrectable': {
        // Check if there are uncorrectable Reed-Solomon blocks
        if (!gs) return false;

        const receiver = gs.receivers[0];
        if (!receiver) return false;

        const signalInfo = receiver.getSignalsInBandwidth();
        const modem = receiver.activeModem;

        const fecSim = new FECSimulator();
        const metrics = fecSim.calculate(fecInputFromSignal(signalInfo, modem));

        this.observe_(metrics.rsUncorrectableBlocks);
        return metrics.rsUncorrectableBlocks > 0;
      }

      case 'rx-channel-status': {
        // Check if channel status matches expected value
        const expectedStatus = condition.params?.channelStatus;
        if (!expectedStatus) return false;
        if (!gs) return false;

        const receiver = gs.receivers[0];
        if (!receiver) return false;

        const signalInfo = receiver.getSignalsInBandwidth();
        const modem = receiver.activeModem;

        const fecSim = new FECSimulator();
        const metrics = fecSim.calculate(fecInputFromSignal(signalInfo, modem));

        this.observe_(metrics.channelStatus);
        return metrics.channelStatus === expectedStatus;
      }

      // ═══════════════════════════════════════════════════════════════
      // Crypto Conditions
      // ═══════════════════════════════════════════════════════════════

      case 'rx-crypto-status': {
        // Check RX decryption mode
        const expectedMode = condition.params?.cryptoMode;
        if (!expectedMode) return false;

        const crypto = CryptoModule.getInstance();
        const rxState = crypto.getRxState();
        this.observe_(rxState.decryptionMode);
        return rxState.decryptionMode === expectedMode;
      }

      case 'rx-key-status': {
        // Check RX key status
        const expectedStatus = condition.params?.keyStatus;
        if (!expectedStatus) return false;

        const crypto = CryptoModule.getInstance();
        const rxState = crypto.getRxState();
        this.observe_(rxState.decryptionKeyStatus);
        return rxState.decryptionKeyStatus === expectedStatus;
      }

      case 'tx-crypto-status': {
        // Check TX encryption mode
        const expectedMode = condition.params?.cryptoMode;
        if (!expectedMode) return false;

        const crypto = CryptoModule.getInstance();
        const txState = crypto.getTxState();
        this.observe_(txState.encryptionMode);
        return txState.encryptionMode === expectedMode;
      }

      case 'tx-key-status': {
        // Check TX key status
        const expectedStatus = condition.params?.keyStatus;
        if (!expectedStatus) return false;

        const crypto = CryptoModule.getInstance();
        const txState = crypto.getTxState();
        this.observe_(txState.encryptionKeyStatus);
        return txState.encryptionKeyStatus === expectedStatus;
      }

      // ═══════════════════════════════════════════════════════════════
      // Fault Injection Conditions
      // ═══════════════════════════════════════════════════════════════

      case 'fault-active': {
        // Check if a specific fault is currently active
        const faultId = condition.params?.faultId;
        if (!faultId) return false;

        const faultInjector = FaultInjector.getInstance();
        return faultInjector.isActive(faultId);
      }

      case 'fault-cleared': {
        // Check if a specific fault has been cleared (not active)
        const faultId = condition.params?.faultId;
        if (!faultId) return false;

        const faultInjector = FaultInjector.getInstance();
        return !faultInjector.isActive(faultId);
      }

      case 'geolocation-measurements-collected': {
        // >= minCount TDOA/FDOA captures collected on the geolocation console
        if (!GeolocationConsoleCore.isInitialized()) return false;
        const minCount = condition.params?.minCount ?? 1;
        const eventId = condition.params?.interferenceEventId;
        const measurements = GeolocationConsoleCore.getInstance().state.measurements;
        const count = eventId ? measurements.filter((m) => m.interferenceEventId === eventId).length : measurements.length;
        return count >= minCount;
      }

      case 'geolocation-fix-accuracy': {
        // Computed fix within maxErrorKm of the emitter ground truth
        if (!GeolocationConsoleCore.isInitialized()) return false;
        const maxErrorKm = condition.params?.maxErrorKm ?? 25;
        const state = GeolocationConsoleCore.getInstance().state;
        return state.fix !== null && state.fixErrorKm !== null && state.fixErrorKm <= maxErrorKm;
      }

      case 'hardware-fault-tripped': {
        // The named scheduled hardware fault has tripped
        const eventId = condition.params?.eventId;
        return eventId !== undefined && HardwareFaultManager.isInitialized() && HardwareFaultManager.getInstance().isTripped(eventId);
      }

      case 'interference-event-ended': {
        // The named interference event ran its envelope and stopped
        if (!InterferenceManager.isInitialized()) return false;
        const eventId = condition.params?.interferenceEventId;
        return eventId !== undefined && InterferenceManager.getInstance().hasEventEnded(eventId);
      }

      case 'weather-event-ended': {
        // The named weather event (rain cell, storm, transit) has run its
        // course: a hold can last until the weather passes (Phase 27 Q4)
        if (!WeatherManager.hasInstance()) return false;
        const eventId = condition.params?.weatherEventId;
        return eventId !== undefined && WeatherManager.getInstance().hasEventEnded(eventId);
      }

      case 'weather-event-peaked': {
        // Phase 29 D10: the named event's degradation has passed its maximum
        // (a sun transit's midpoint), not merely crossed a threshold on the
        // way up (nats-r4-s17-F1)
        if (!WeatherManager.hasInstance()) return false;
        const eventId = condition.params?.weatherEventId;
        if (eventId === undefined) return false;
        const weather = WeatherManager.getInstance();
        // Feed `{{val:OBJ.N}}` the event's peak fade (dB) so text can quote the number it peaked at
        const peakDb = weather.getAllWeatherEvents().find((e) => e.id === eventId)?.linkMarginDegradation;
        if (typeof peakDb === 'number') this.observe_(peakDb);

        return weather.hasEventPeaked(eventId, condition.params?.pastPeakSeconds ?? 0);
      }

      case 'scenario-time-reached': {
        // The station clock has reached a time of day (a pass window opening
        // at 10:00, a crew due at 06:30): a hold that waits on the clock
        const targetMs = ObjectivesManager.scenarioTimeTargetMs(condition.params?.scenarioTime);
        return targetMs !== null && SimClock.nowMs() >= targetMs;
      }

      case 'geolocation-ellipse-within': {
        // Converged fix whose 95% error ellipse is no wider than maxSemiMajorKm.
        // Graded on the ellipse the console reports, not on the hidden truth:
        // it is the operator's own confidence statement that has to be small.
        if (!GeolocationConsoleCore.isInitialized()) return false;
        const maxSemiMajorKm = condition.params?.maxSemiMajorKm ?? 15;
        const fix = GeolocationConsoleCore.getInstance().state.fix;
        return fix !== null && fix.isConverged && fix.errorEllipse !== null && fix.errorEllipse.semiMajorKm <= maxSemiMajorKm;
      }

      case 'jamming-uplink-active': {
        // A jam waveform is radiating in the target transponder's uplink band
        if (!ElectronicAttackManager.isInitialized()) return false;
        const assessment = ElectronicAttackManager.getInstance().getAssessment();
        return assessment?.isRadiatingInBand === true;
      }

      case 'jamming-effective': {
        // Denial achieved: radiating on target with J/S at/above the threshold
        if (!ElectronicAttackManager.isInitialized()) return false;
        const assessment = ElectronicAttackManager.getInstance().getAssessment();
        return assessment?.isEffective === true;
      }

      // ═══════════════════════════════════════════════════════════════
      // nats-eu (Campaign 2 European Operations) Conditions
      // ═══════════════════════════════════════════════════════════════

      case 'link-budget-computed': {
        // Operator's computed C/N worksheet matches the acceptance truth
        if (!LinkBudgetManager.isInitialized()) return false;
        return LinkBudgetManager.getInstance().isBudgetComputedCorrectly();
      }

      case 'link-margin-met': {
        // Committed link achieves the required margin over the demod threshold
        if (!LinkBudgetManager.isInitialized()) return false;
        return LinkBudgetManager.getInstance().isMarginMet(condition.params?.minMarginDb);
      }

      case 'uplink-doppler-comp-enabled': {
        // Uplink Doppler compensation engaged on the command link
        if (!CommandingManager.isInitialized()) return false;
        return CommandingManager.getInstance().state.dopplerCompEnabled;
      }

      case 'command-acknowledged': {
        // A TT&C command (or a specific one) was sent in-window and ACKed
        if (!CommandingManager.isInitialized()) return false;
        return CommandingManager.getInstance().isCommandAcknowledged(condition.params?.commandId);
      }

      case 'key-rotation-completed': {
        // A scheduled command-link key rotation has completed
        if (!CommandingManager.isInitialized()) return false;
        return CommandingManager.getInstance().state.keyRotationCompleted;
      }

      case 'zeroize-executed': {
        // The command-link key has been zeroized (emergency destruction)
        if (!CommandingManager.isInitialized()) return false;
        return CommandingManager.getInstance().state.zeroized;
      }

      case 'contact-assigned': {
        // A pass/contact has been allocated (to a specific station if given)
        if (!ContactScheduleManager.isInitialized()) return false;
        const contactId = condition.params?.contactId;
        if (!contactId) return false;
        return ContactScheduleManager.getInstance().isContactAssigned(contactId, condition.params?.groundStationId);
      }

      case 'contact-plan-valid': {
        // The contact plan has no conflicts and covers all required passes
        if (!ContactScheduleManager.isInitialized()) return false;
        return ContactScheduleManager.getInstance().isPlanValid();
      }

      case 'ephemeris-updated': {
        // Fresh ephemeris loaded after a maneuver (specific event if given)
        if (!SpaceEventManager.isInitialized()) return false;
        return SpaceEventManager.getInstance().isEphemerisUpdated(condition.params?.eventId);
      }

      case 'audit-log-reviewed': {
        // The station audit log has been opened and reviewed
        if (!SecurityConsoleCore.isInitialized()) return false;
        return SecurityConsoleCore.getInstance().isReviewed;
      }

      case 'security-event-acknowledged': {
        // A specific audit-log event has been acknowledged/flagged
        if (!SecurityConsoleCore.isInitialized()) return false;
        const eventId = condition.params?.eventId;
        if (!eventId) return false;
        return SecurityConsoleCore.getInstance().isEventAcknowledged(eventId);
      }

      case 'access-control-set': {
        // A station account is at the target access state (default 'disabled')
        if (!SecurityConsoleCore.isInitialized()) return false;
        const accountId = condition.params?.accountId;
        if (!accountId) return false;
        const target = condition.params?.accountStatus ?? 'disabled';
        return SecurityConsoleCore.getInstance().getAccountStatus(accountId) === target;
      }

      case 'transec-mode-set': {
        // The modem TRANSEC waveform mode matches the target
        if (!TransecManager.isInitialized()) return false;
        const mode = condition.params?.transecMode ?? 'hopping';
        return TransecManager.getInstance().isModeSet(mode);
      }

      case 'transec-sync-locked': {
        // The TRANSEC hop set is keyed and hop-sync is locked
        if (!TransecManager.isInitialized()) return false;
        return TransecManager.getInstance().isSyncLocked();
      }

      case 'gpsdo-reference-mode-set': {
        // The GPSDO reference/discipline mode matches the target (default 'holdover')
        if (!GnssThreatManager.isInitialized()) return false;
        const mode = condition.params?.referenceMode ?? 'holdover';
        return GnssThreatManager.getInstance().isReferenceModeSet(mode);
      }

      case 'gpsdo-time-offset-exceeds': {
        // The tell: this station's GNSS-vs-reference offset has walked past the
        // threshold. Pair with requiresObservation on gps-timing so the read counts.
        if (!GnssThreatManager.isInitialized()) return false;
        const minUs = condition.params?.minOffsetUs ?? 20;
        const offsetUs = GnssThreatManager.getInstance().timeOffsetUsFor(gs.state.id);
        this.observe_({ timeOffsetUs: Number(offsetUs.toFixed(1)) });
        return Math.abs(offsetUs) >= minUs;
      }

      case 'campaign-document-reviewed': {
        // The campaign record (earlier scenarios' Working Documents) has been opened this run
        return CampaignDocumentStore.isReviewed;
      }

      case 'telemetry-frames-received': {
        if (!TelemetryManager.isInitialized()) return false;
        const count = TelemetryManager.getInstance().frameCount;
        this.observe_({ frames: count });
        return count >= (condition.params?.minFrames ?? 1);
      }

      case 'telemetry-channel-in-band': {
        // A channel reads in the target band. Pair with requiresObservation on
        // the telemetry tab so the read counts. Stale streams never match.
        if (!TelemetryManager.isInitialized()) return false;
        const channelId = condition.params?.channelId;
        if (!channelId) return false;
        const mgr = TelemetryManager.getInstance();
        const reading = mgr.getReading(channelId);
        if (!reading || mgr.isStale) return false;
        this.observe_({ channelId, value: Number(reading.value.toFixed(reading.decimals)), band: reading.band });
        return reading.band === (condition.params?.telemetryBand ?? 'green');
      }

      case 'telemetry-soh-nominal': {
        if (!TelemetryManager.isInitialized()) return false;
        return TelemetryManager.getInstance().isSohNominal();
      }

      case 'ranging-measurements': {
        if (!CommandingManager.isInitialized()) return false;
        const mgr = CommandingManager.getInstance();
        const count = mgr.state.rangingMeasurements.length;
        this.observe_({ measurements: count });
        return count >= (condition.params?.minCount ?? mgr.getConfig().ranging?.requiredMeasurements ?? 1);
      }

      case 'gpsdo-time-offset-stable': {
        // The offset has held still for the hold period: in holdover that is
        // always true, so gate it on gpsdo-reference-mode-set 'gnss' to prove
        // the spoofer is off the air rather than the reference disconnected.
        if (!GnssThreatManager.isInitialized()) return false;
        const holdS = condition.params?.holdSeconds ?? 30;
        return GnssThreatManager.getInstance().secondsSinceOffsetChange >= holdS;
      }

      default:
        console.warn(`Unknown condition type: ${condition.type}`);
        return false;
    }
  }
}
