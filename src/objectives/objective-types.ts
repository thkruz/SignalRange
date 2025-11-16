/**
 * @file Objective system type definitions
 * @description Defines objectives for scenario-based learning and assessment
 */

/**
 * Condition types that can be checked during simulation
 */
export type ConditionType =
  | 'antenna-locked' // Antenna is locked on a specific satellite
  | 'gpsdo-locked' // GPSDO has achieved stable lock
  | 'buc-locked' // BUC is locked to external reference
  | 'equipment-powered' // Specific equipment is powered on
  | 'signal-detected' // Signal detected on spectrum analyzer
  | 'frequency-set' // Equipment tuned to specific frequency
  | 'custom'; // Custom condition with evaluator function

/**
 * Equipment references for condition checking
 */
export type EquipmentRef =
  | 'antenna'
  | 'gpsdo'
  | 'buc'
  | 'lnb'
  | 'hpa'
  | 'filter'
  | 'coupler'
  | 'omt'
  | 'spectrum-analyzer'
  | 'transmitter'
  | 'receiver';

/**
 * Parameters for different condition types
 */
export interface ConditionParams {
  /** For antenna-locked: which satellite (noradId) */
  satelliteId?: number;
  /** For equipment-powered: which equipment */
  equipment?: EquipmentRef;
  /** For frequency-set: target frequency in Hz */
  frequency?: number;
  /** For frequency-set: tolerance in Hz */
  frequencyTolerance?: number;
  /** For custom conditions: custom evaluator function */
  evaluator?: () => boolean;
  /** Additional context-specific parameters */
  [key: string]: unknown;
}

/**
 * Single condition that must be satisfied
 */
export interface Condition {
  /** Type of condition to check */
  type: ConditionType;
  /** Human-readable description */
  description: string;
  /** Parameters specific to this condition type */
  params?: ConditionParams;
  /** Whether this condition must be maintained (true) or just achieved once (false) */
  mustMaintain: boolean;
  /** Minimum time (in seconds) the condition must be maintained before considered complete */
  maintainDuration?: number;
}

/**
 * Objective containing one or more conditions
 */
export interface Objective {
  /** Unique identifier for this objective */
  id: string;
  /** Display name shown to user */
  title: string;
  /** Detailed description of what the student must do */
  description: string;
  /** Array of conditions that must all be satisfied */
  conditions: Condition[];
  /** Whether all conditions must be met simultaneously (AND) or any one (OR) */
  conditionLogic?: 'AND' | 'OR';
  /** Optional: Points awarded for completing this objective */
  points?: number;
  /** Optional: Whether this objective is optional */
  isOptional?: boolean;
}

/**
 * Runtime state for tracking objective progress
 */
export interface ObjectiveState {
  /** Reference to the objective definition */
  objective: Objective;
  /** Whether this objective has been completed */
  isCompleted: boolean;
  /** Timestamp when objective was first achieved */
  completedAt?: number;
  /** Current state of each condition */
  conditionStates: ConditionState[];
}

/**
 * Runtime state for tracking individual condition progress
 */
export interface ConditionState {
  /** Reference to the condition definition */
  condition: Condition;
  /** Whether this condition is currently satisfied */
  isSatisfied: boolean;
  /** Timestamp when condition was first satisfied */
  satisfiedAt?: number;
  /** How long (in seconds) the condition has been continuously satisfied */
  maintainedDuration: number;
  /** Whether this condition's maintenance requirement has been met */
  isMaintenanceComplete: boolean;
  /** History of when condition was lost (for debugging/analysis) */
  lostTimestamps?: number[];
}
