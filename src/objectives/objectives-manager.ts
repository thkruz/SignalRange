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
    this.startTime_ = performance.now();

    // Initialize objective states
    this.objectiveStates_ = objectives.map((objective) => {
      const hasNoPrerequisites = !objective.prerequisiteObjectiveIds || objective.prerequisiteObjectiveIds.length === 0;
      const isActive = hasNoPrerequisites;

      return {
        objective,
        isActive,
        activatedAt: isActive ? performance.now() : undefined,
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
    return (performance.now() - this.startTime_) / 1000; // Convert to seconds
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
            (conditionState.condition.mustMaintain &&
              !conditionState.isMaintenanceComplete &&
              conditionState.maintainedDuration >= requiredDuration) ||
            // Non-maintenance conditions complete immediately when satisfied
            (!conditionState.condition.mustMaintain && !conditionState.isMaintenanceComplete)
          ) {
            conditionState.isMaintenanceComplete = true;
          }
        }
      }

      // Check if objective is complete
      const isObjectiveComplete = this.checkObjectiveComplete_(objectiveState);
      if (isObjectiveComplete && !objectiveState.isCompleted) {
        objectiveState.isCompleted = true;
        objectiveState.completedAt = performance.now();

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
      // All conditions must be maintenance-complete
      return objectiveState.conditionStates.every((cs) => cs.isMaintenanceComplete);
    } else {
      // At least one condition must be maintenance-complete
      return objectiveState.conditionStates.some((cs) => cs.isMaintenanceComplete);
    }
  }

  /**
   * Activate objectives that were waiting for a specific prerequisite
   */
  private activateDependentObjectives_(completedObjectiveId: string): void {
    const now = performance.now();

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
          return azDiff <= 1.5 && elDiff <= 1.5;
        }

        return true;
      }

      case 'gpsdo-locked': {
        const rfFrontEnd = equipment.rfFrontEnds[0]; // Default to first RF front end
        if (!rfFrontEnd) return false;

        const gpsdoState = rfFrontEnd.gpsdoModule.state;
        return gpsdoState.isLocked;
      }

      case 'gpsdo-warmed-up': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const gpsdoState = rfFrontEnd.gpsdoModule.state;
        // GPSDO is warmed up when warmup time is 0 and temperature is in operating range
        return (
          gpsdoState.isPowered &&
          gpsdoState.warmupTimeRemaining === 0 &&
          gpsdoState.temperature >= 65 &&
          gpsdoState.temperature <= 75
        );
      }

      case 'gpsdo-gnss-locked': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const gpsdoState = rfFrontEnd.gpsdoModule.state;
        // GPS antenna has satellite lock with sufficient satellites
        return (
          gpsdoState.isPowered &&
          gpsdoState.gnssSignalPresent &&
          gpsdoState.satelliteCount >= 4
        );
      }

      case 'gpsdo-stability': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const gpsdoState = rfFrontEnd.gpsdoModule.state;
        const maxAccuracy = condition.params?.maxFrequencyAccuracy ?? 5; // Default: 5×10⁻¹¹
        // GPSDO achieves required frequency stability
        return (
          gpsdoState.isPowered &&
          gpsdoState.isLocked &&
          gpsdoState.frequencyAccuracy < maxAccuracy &&
          gpsdoState.allanDeviation < maxAccuracy &&
          gpsdoState.phaseNoise < -125 // dBc/Hz at 10 Hz offset
        );
      }

      case 'gpsdo-not-in-holdover': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const gpsdoState = rfFrontEnd.gpsdoModule.state;
        // GPSDO is not operating in holdover mode
        return gpsdoState.isPowered && !gpsdoState.isInHoldover;
      }

      case 'buc-locked': {
        const rfFrontEnd = equipment.rfFrontEnds[0]; // Default to first RF front end
        if (!rfFrontEnd) return false;

        const bucState = rfFrontEnd.bucModule.state;
        return bucState.isExtRefLocked;
      }

      case 'buc-reference-locked': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const bucState = rfFrontEnd.bucModule.state;
        // BUC is locked to external 10MHz reference
        return (
          bucState.isPowered &&
          bucState.isExtRefLocked &&
          bucState.frequencyError === 0
        );
      }

      case 'buc-muted': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const bucState = rfFrontEnd.bucModule.state;
        // BUC RF output is muted for safety
        return bucState.isPowered && bucState.isMuted;
      }

      case 'buc-current-normal': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const bucState = rfFrontEnd.bucModule.state;
        const maxCurrent = condition.params?.maxCurrentDraw ?? 4.5; // Default: 4.5A
        // BUC current draw is within normal operating range
        return (
          bucState.isPowered &&
          bucState.currentDraw <= maxCurrent
        );
      }

      case 'buc-not-saturated': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const bucState = rfFrontEnd.bucModule.state;
        // BUC output is not approaching saturation (at least 2 dB backoff from P1dB)
        return (
          bucState.isPowered &&
          bucState.outputPower <= (bucState.saturationPower - 2)
        );
      }

      case 'lnb-reference-locked': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const lnbState = rfFrontEnd.lnbModule.state;
        // LNB is locked to external 10MHz reference
        return (
          lnbState.isPowered &&
          lnbState.isExtRefLocked &&
          lnbState.frequencyError === 0
        );
      }

      case 'lnb-gain-set': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const lnbState = rfFrontEnd.lnbModule.state;
        if (!condition.params?.gain) return false;

        const targetGain = condition.params.gain;
        const tolerance = condition.params.gainTolerance ?? 1; // Default: ±1 dB
        // LNB gain is set to target value within tolerance
        return (
          lnbState.isPowered &&
          Math.abs(lnbState.gain - targetGain) <= tolerance
        );
      }

      case 'lnb-thermally-stable': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const lnbState = rfFrontEnd.lnbModule.state;
        // LNB thermal stabilization complete (temperature stable, no drift)
        // Check that thermal stabilization time has passed and noise temperature is stable
        return (
          lnbState.isPowered &&
          lnbState.noiseTemperature < 100 && // Within spec
          lnbState.temperature >= 25 &&
          lnbState.temperature <= 50 &&
          lnbState.frequencyError === 0 // No frequency drift
        );
      }

      case 'lnb-noise-performance': {
        const rfFrontEnd = equipment.rfFrontEnds[0];
        if (!rfFrontEnd) return false;

        const lnbState = rfFrontEnd.lnbModule.state;
        const maxNoiseTemp = condition.params?.maxNoiseTemperature ?? 100; // Default: 100K
        // LNB noise temperature within specification
        return (
          lnbState.isPowered &&
          lnbState.noiseTemperature <= maxNoiseTemp
        );
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
          case 'lnb': {
            const rfFrontEnd = equipment.rfFrontEnds[0];
            return rfFrontEnd ? rfFrontEnd.lnbModule.state.isPowered : false;
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

      case 'speca-span-set': {
        if (!condition.params?.span) return false;

        const specA = equipment.spectrumAnalyzers[0];
        if (!specA) return false;

        const state = specA.state;
        const tolerance = condition.params.frequencyTolerance || 1e6; // Default 1 MHz tolerance
        const diff = Math.abs(state.span - condition.params.span);

        return diff <= tolerance;
      }

      case 'speca-rbw-set': {
        if (!condition.params?.rbw) return false;

        const specA = equipment.spectrumAnalyzers[0];
        if (!specA) return false;

        const state = specA.state;
        // Check if RBW is set to the target value (if null, it's auto mode)
        if (state.rbw === null) return false;

        const tolerance = condition.params.frequencyTolerance || 1e3; // Default 1 kHz tolerance
        const diff = Math.abs(state.rbw - condition.params.rbw);

        return diff <= tolerance;
      }

      case 'speca-reference-level-set': {
        if (condition.params?.referenceLevel === undefined) return false;

        const specA = equipment.spectrumAnalyzers[0];
        if (!specA) return false;

        const state = specA.state;
        const tolerance = condition.params.referenceLevelTolerance ?? 1; // Default ±1 dB
        const diff = Math.abs(state.maxAmplitude - condition.params.referenceLevel);

        return diff <= tolerance;
      }

      case 'speca-noise-floor-visible': {
        const specA = equipment.spectrumAnalyzers[0];
        if (!specA) return false;

        const signals = specA.getInputSignals();
        const maxSignalStrength = condition.params?.maxSignalStrength ?? -60; // Default: -60 dBm

        // Check that no strong signals are overwhelming the display
        // Clean baseline means all signals are below the threshold
        return signals.every(signal => signal.power < maxSignalStrength);
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
