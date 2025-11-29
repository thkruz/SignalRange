/**
 * @file ObjectivesManager - Monitors and validates scenario objectives
 * @description Tracks student progress through scenario objectives by evaluating
 * conditions during the simulation update loop
 */

import { GroundStation } from '@app/assets/ground-station/ground-station';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SimulationManager } from '@app/simulation/simulation-manager';
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
  private readonly startTime_: number;
  private readonly collapsedObjectiveIds_: Set<string> = new Set();

  private constructor(objectives: Objective[]) {
    this.eventBus_ = EventBus.getInstance();
    this.startTime_ = Date.now();

    // Initialize objective states
    this.objectiveStates_ = objectives.map((objective) => {
      const hasNoPrerequisites = !objective.prerequisiteObjectiveIds || objective.prerequisiteObjectiveIds.length === 0;
      const isActive = hasNoPrerequisites;

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
      };
    });

    // Subscribe to update loop
    this.eventBus_.on(Events.UPDATE, this.update_.bind(this));
  }

  /**
   * Initialize the objectives manager with a set of objectives
   */
  static initialize(objectives: Objective[]): ObjectivesManager {
    if (ObjectivesManager.instance_) {
      console.warn('ObjectivesManager already initialized. Destroying previous instance.');
      ObjectivesManager.destroy();
    }

    ObjectivesManager.instance_ = new ObjectivesManager(objectives);
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
   * Get total elapsed time since objectives manager started
   */
  getElapsedTime(): number {
    return (Date.now() - this.startTime_) / 1000; // Convert to seconds
  }

  /**
   * Restore objective states from saved checkpoint data
   * Merges saved state with current objective definitions, preserving progress
   */
  restoreState(savedStates: ObjectiveState[]): void {
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
      const isActive = objectiveState.isActive;

      // Determine objective state class and label
      let stateClass = 'locked';
      let stateLabel = 'Locked';
      if (isCompleted) {
        stateClass = 'completed';
        stateLabel = 'Completed';
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
      html += `</div>`;
      html += `<div class="objective-content">`;
      html += `<p>${objective.description}</p>`;
      html += '<ul class="conditions-list">';

      for (let i = 0; i < objective.conditions.length; i++) {
        const condition = objective.conditions[i];
        const conditionState = objectiveState.conditionStates[i];
        const conditionCompleted = conditionState.isMaintenanceComplete;

        html += `<li class="condition-item ${conditionCompleted ? 'completed' : 'incomplete'}">`;
        html += `${condition.description}`;
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

      // Skip inactive objectives (prerequisites not met)
      if (!objectiveState.isActive) {
        continue;
      }

      // Evaluate each condition
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
            // Indefinite maintenance & non-maintenance conditions complete immediately
            // Timer-based maintenance conditions need to maintain for duration (handled in else block)
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
              // Indefinite maintenance: mark complete while satisfied, but can be reset if lost
              conditionState.isMaintenanceComplete = true;
            } else if (conditionState.condition.mustMaintain) {
              // Timer-based maintenance: check duration
              const requiredDuration = conditionState.condition.maintainDuration || 0;
              if (conditionState.maintainedDuration >= requiredDuration) {
                conditionState.isMaintenanceComplete = true;
              }
            } else {
              // Non-maintenance conditions complete immediately when satisfied
              conditionState.isMaintenanceComplete = true;
            }
          }
        }
      }

      // Check if objective is complete
      const isObjectiveComplete = this.checkObjectiveComplete_(objectiveState);
      if (isObjectiveComplete && !objectiveState.isCompleted) {
        objectiveState.isCompleted = true;
        objectiveState.completedAt = Date.now();

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

        // Remove from collapsed set so it expands when it becomes active
        this.collapsedObjectiveIds_.delete(objectiveState.objective.id);

        this.eventBus_.emit(Events.OBJECTIVE_ACTIVATED, {
          objectiveId: objectiveState.objective.id,
          objective: objectiveState.objective,
          activatedAt: now,
        });
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
          default:
            return false;
        }
      }

      case 'signal-detected': {
        return this.evaluateEquipment_(gs.spectrumAnalyzers, condition.params, (specA) => {
          return specA.getInputSignals().length > 0;
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

      case 'custom': {
        if (condition.params?.evaluator && typeof condition.params.evaluator === 'function') {
          return condition.params.evaluator();
        }
        return false;
      }

      default:
        console.warn(`Unknown condition type: ${condition.type}`);
        return false;
    }
  }
}
