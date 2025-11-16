/**
 * @file ObjectivesManager - Monitors and validates scenario objectives
 * @description Tracks student progress through scenario objectives by evaluating
 * conditions during the simulation update loop
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { Milliseconds } from 'ootk';
import {
  Condition,
  Objective,
  ObjectiveState
} from './objective-types';

/**
 * Manages objective tracking for scenario-based learning
 */
export class ObjectivesManager {
  private static instance_: ObjectivesManager | null = null;
  private objectiveStates_: ObjectiveState[] = [];
  private eventBus_: EventBus;
  private startTime_: number;

  private constructor(objectives: Objective[]) {
    this.eventBus_ = EventBus.getInstance();
    this.startTime_ = performance.now();

    // Initialize objective states
    this.objectiveStates_ = objectives.map((objective) => ({
      objective,
      isCompleted: false,
      conditionStates: objective.conditions.map((condition) => ({
        condition,
        isSatisfied: false,
        maintainedDuration: 0,
        isMaintenanceComplete: false,
        lostTimestamps: [],
      })),
    }));

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
    return (performance.now() - this.startTime_) / 1000; // Convert to seconds
  }

  /**
   * Main update loop - evaluates all objectives each frame
   */
  private update_(dt: Milliseconds): void {
    const dtSeconds = dt / 1000;

    for (let objIndex = 0; objIndex < this.objectiveStates_.length; objIndex++) {
      const objectiveState = this.objectiveStates_[objIndex];

      // Skip already completed objectives
      if (objectiveState.isCompleted) {
        continue;
      }

      // Evaluate each condition
      for (let condIndex = 0; condIndex < objectiveState.conditionStates.length; condIndex++) {
        const conditionState = objectiveState.conditionStates[condIndex];

        // Skip already completed maintenance
        if (conditionState.isMaintenanceComplete) {
          continue;
        }

        const wasSatisfied = conditionState.isSatisfied;
        const isNowSatisfied = this.evaluateCondition_(conditionState.condition);

        // Update satisfied state
        conditionState.isSatisfied = isNowSatisfied;

        // Handle condition state changes
        if (isNowSatisfied && !wasSatisfied) {
          // Condition just became satisfied
          conditionState.satisfiedAt = performance.now();
          conditionState.maintainedDuration = 0;

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
          conditionState.lostTimestamps.push(performance.now());

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
          const requiredDuration = conditionState.condition.maintainDuration || 0;
          if (
            conditionState.condition.mustMaintain &&
            !conditionState.isMaintenanceComplete &&
            conditionState.maintainedDuration >= requiredDuration
          ) {
            conditionState.isMaintenanceComplete = true;
          } else if (!conditionState.condition.mustMaintain && !conditionState.isMaintenanceComplete) {
            // Non-maintenance conditions complete immediately when satisfied
            conditionState.isMaintenanceComplete = true;
          }
        }
      }

      // Check if objective is complete
      const isObjectiveComplete = this.checkObjectiveComplete_(objectiveState);
      if (isObjectiveComplete && !objectiveState.isCompleted) {
        objectiveState.isCompleted = true;
        objectiveState.completedAt = performance.now();

        this.eventBus_.emit(Events.OBJECTIVE_COMPLETED, {
          objectiveId: objectiveState.objective.id,
          objective: objectiveState.objective,
          completedAt: objectiveState.completedAt,
        });

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
      // All conditions must be maintenance-complete
      return objectiveState.conditionStates.every((cs) => cs.isMaintenanceComplete);
    } else {
      // At least one condition must be maintenance-complete
      return objectiveState.conditionStates.some((cs) => cs.isMaintenanceComplete);
    }
  }

  /**
   * Evaluate a single condition and return whether it's currently satisfied
   */
  private evaluateCondition_(condition: Condition): boolean {
    const sim = SimulationManager.getInstance();
    const equipment = sim.equipment;

    if (!equipment) {
      return false;
    }

    switch (condition.type) {
      case 'antenna-locked': {
        const antenna = equipment.antennas[0]; // Default to first antenna
        if (!antenna) return false;

        const state = antenna.state;

        // Check if antenna is locked
        if (!state.isLocked) return false;

        // If a specific satellite is required, check it
        if (condition.params?.satelliteId !== undefined) {
          const targetSat = sim.getSatByNoradId(condition.params.satelliteId);
          if (!targetSat) return false;

          // Check if antenna is pointed at this satellite (within tolerance)
          const azDiff = Math.abs(state.azimuth - targetSat.az);
          const elDiff = Math.abs(state.elevation - targetSat.el);
          return azDiff <= 2 && elDiff <= 2;
        }

        return true;
      }

      case 'gpsdo-locked': {
        const rfFrontEnd = equipment.rfFrontEnds[0]; // Default to first RF front end
        if (!rfFrontEnd) return false;

        const gpsdoState = rfFrontEnd.gpsdoModule.state;
        return gpsdoState.isLocked;
      }

      case 'buc-locked': {
        const rfFrontEnd = equipment.rfFrontEnds[0]; // Default to first RF front end
        if (!rfFrontEnd) return false;

        const bucState = rfFrontEnd.bucModule.state;
        return bucState.isExtRefLocked;
      }

      case 'equipment-powered': {
        if (!condition.params?.equipment) return false;

        switch (condition.params.equipment) {
          case 'antenna': {
            const antenna = equipment.antennas[0];
            return antenna ? antenna.state.isPowered : false;
          }
          case 'gpsdo': {
            const rfFrontEnd = equipment.rfFrontEnds[0];
            return rfFrontEnd ? rfFrontEnd.gpsdoModule.state.isPowered : false;
          }
          case 'buc': {
            const rfFrontEnd = equipment.rfFrontEnds[0];
            return rfFrontEnd ? rfFrontEnd.bucModule.state.isPowered : false;
          }
          case 'spectrum-analyzer': {
            return true; // Spectrum analyzer always powered on for this simulation
            // const specA = equipment.spectrumAnalyzers[0];
            // return specA ? specA.state.isPowered : false;
          }
          // Add more equipment types as needed
          default:
            return false;
        }
      }

      case 'signal-detected': {
        const specA = equipment.spectrumAnalyzers[0];
        if (!specA) return false;

        // Check if any signals are detected above noise floor
        return specA.getInputSignals().length > 0;
      }

      case 'frequency-set': {
        if (!condition.params?.frequency) return false;

        const specA = equipment.spectrumAnalyzers[0];
        if (!specA) return false;

        const state = specA.state;
        const tolerance = condition.params.frequencyTolerance || 1e6; // Default 1 MHz tolerance
        const diff = Math.abs(state.centerFrequency - condition.params.frequency);

        return diff <= tolerance;
      }

      case 'custom': {
        // Use custom evaluator function if provided
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
