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
  | 'gpsdo-warmed-up' // GPSDO is at operating temperature and warmup complete
  | 'gpsdo-gnss-locked' // GPS antenna has satellite lock (≥4 satellites)
  | 'gpsdo-stability' // GPSDO frequency accuracy <5×10⁻¹¹
  | 'gpsdo-not-in-holdover' // GPSDO not operating in holdover mode
  | 'buc-locked' // BUC is locked to external reference
  | 'buc-reference-locked' // BUC locked to 10MHz reference
  | 'buc-muted' // BUC RF output is muted (safety check)
  | 'buc-current-normal' // BUC current draw within normal range
  | 'buc-not-saturated' // BUC output not in compression
  | 'lnb-reference-locked' // LNB locked to 10MHz reference
  | 'lnb-lo-set' // LNB local oscillator frequency set to specific value
  | 'lnb-gain-set' // LNB gain set to specific value
  | 'lnb-thermally-stable' // LNB thermal stabilization complete
  | 'lnb-noise-performance' // LNB noise temperature within spec
  | 'equipment-powered' // Specific equipment is powered on
  | 'equipment-not-powered' // Specific equipment is powered off
  | 'hpa-disabled' // HPA output disabled (but may still be powered)
  | 'signal-detected' // Signal detected on spectrum analyzer
  | 'frequency-set' // Equipment tuned to specific frequency
  | 'speca-span-set' // Spectrum analyzer span set to specific value
  | 'speca-rbw-set' // Spectrum analyzer RBW set to specific value
  | 'speca-reference-level-set' // Spectrum analyzer reference level set
  | 'speca-noise-floor-visible' // Spectrum analyzer shows clean baseline
  | 'filter-bandwidth-set' // IF filter bandwidth configured
  | 'antenna-beacon-frequency-set' // Antenna beacon frequency configured
  | 'antenna-tracking-mode-set' // Antenna tracking mode set (step-track, etc.)
  | 'antenna-beacon-locked' // Antenna beacon signal locked
  | 'antenna-position' // Antenna at specific azimuth/elevation position
  | 'buc-unmuted' // BUC RF output enabled (inverse of muted)
  | 'hpa-enabled' // HPA output enabled (dual-action switch)
  | 'hpa-back-off-set' // HPA back-off level configured
  | 'hpa-not-overdriven' // HPA not in overdrive (IMD check)
  | 'hpa-output-power-set' // HPA output power above threshold
  | 'receiver-signal-locked' // Receiver modem has demodulation lock
  | 'receiver-snr-threshold' // Receiver modem C/N ratio meets threshold
  | 'status-check' // Interactive quiz to verify player found the correct information
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
  /** For lnb-lo-set: target local oscillator frequency in Hz */
  loFrequency?: number;
  /** For lnb-lo-set: local oscillator frequency tolerance in Hz */
  loFrequencyTolerance?: number;
  /** For lnb-gain-set: target gain in dB */
  gain?: number;
  /** For lnb-gain-set: gain tolerance in dB */
  gainTolerance?: number;
  /** For gpsdo-stability: maximum frequency accuracy (×10⁻¹¹) */
  maxFrequencyAccuracy?: number;
  /** For lnb-noise-performance: maximum noise temperature in K */
  maxNoiseTemperature?: number;
  /** For buc-current-normal: maximum current draw in Amperes */
  maxCurrentDraw?: number;
  /** For speca-span-set: target span in Hz */
  span?: number;
  /** For speca-rbw-set: target RBW in Hz */
  rbw?: number;
  /** For speca-reference-level-set: target reference level in dBm */
  referenceLevel?: number;
  /** For speca-reference-level-set: reference level tolerance in dB */
  referenceLevelTolerance?: number;
  /** For speca-noise-floor-visible: maximum signal strength to consider "clean baseline" in dBm */
  maxSignalStrength?: number;
  /** For custom conditions: custom evaluator function */
  evaluator?: () => boolean;
  /** Target specific equipment by index (0-based). If omitted, any equipment satisfies. */
  equipmentIndex?: number;
  /** For filter-bandwidth-set: target bandwidth index (0-12) */
  bandwidthIndex?: number;
  /** For antenna-beacon-frequency-set: beacon frequency in Hz */
  beaconFrequency?: number;
  /** For antenna-tracking-mode-set: tracking mode */
  trackingMode?: 'stow' | 'maintenance' | 'manual' | 'step-track' | 'program-track';
  /** For antenna-position: target azimuth in degrees */
  azimuth?: number;
  /** For antenna-position: target elevation in degrees */
  elevation?: number;
  /** For antenna-position: position tolerance in degrees (default: 1.0) */
  tolerance?: number;
  /** For hpa-back-off-set: target back-off in dB */
  backOff?: number;
  /** For hpa-back-off-set: tolerance in dB */
  backOffTolerance?: number;
  /** For hpa-not-overdriven: maximum IMD level in dBc (optional, defaults to checking isOverdriven) */
  maxImdLevel?: number;
  /** For hpa-output-power-set: minimum output power in dBm */
  minOutputPower?: number;
  /** For receiver-signal-locked/receiver-snr-threshold: which modem (1-4), defaults to active modem */
  modemNumber?: number;
  /** For receiver-snr-threshold: minimum C/N ratio in dB */
  minCNRatio?: number;
  /** For status-check: the question to display */
  question?: string;
  /** For status-check: the answer options (1-4) */
  options?: string[];
  /** For status-check: index of the correct answer (0 to options.length-1) */
  correctIndex?: number;
  /** For status-check: explanation shown after correct answer */
  explanation?: string;
  /** For status-check: points deducted per wrong answer (default: 5) */
  pointPenalty?: number;
  /** Additional context-specific parameters */
  [key: string]: unknown;
}

/**
 * Configuration for time-based point deduction on objective completion
 */
export interface TimePenalty {
  /** Elapsed scenario time (in seconds) after which penalty applies */
  elapsedTimeThreshold: number;
  /** Fixed number of points to deduct */
  pointsDeducted: number;
  /** Optional message explaining the deduction */
  message?: string;
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
  /**
   * If true, condition must remain satisfied until ALL conditions in the objective are complete.
   * If the condition becomes unsatisfied before objective completion, it will need to be re-satisfied.
   * Takes precedence over maintainDuration for maintenance behavior.
   */
  maintainUntilObjectiveComplete?: boolean;
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
  /** Optional: Ground station ID this objective is associated with */
  groundStation?: string;
  /** Array of conditions that must all be satisfied */
  conditions: Condition[];
  /** Whether all conditions must be met simultaneously (AND) or any one (OR) */
  conditionLogic?: 'AND' | 'OR';
  /** Optional: Points awarded for completing this objective */
  points?: number;
  /** Optional: Whether this objective is optional */
  isOptional?: boolean;
  /** Prerequisites - objective IDs that must be completed before this becomes active */
  prerequisiteObjectiveIds?: string[];
  /** Optional time limit in seconds for this objective */
  timeLimitSeconds?: number;
  /** When the timer starts: 'on-activate' (default) or 'on-scenario-load' */
  timerStartTrigger?: 'on-activate' | 'on-scenario-load';
  /** Optional time penalty: deducts points if completed after elapsed time threshold */
  timePenalty?: TimePenalty;
}

/**
 * Runtime state for tracking objective progress
 */
export interface ObjectiveState {
  /** Reference to the objective definition */
  objective: Objective;
  /** Whether this objective is currently active (prerequisites met) */
  isActive: boolean;
  /** Timestamp when objective became active */
  activatedAt?: number;
  /** Whether this objective has been completed */
  isCompleted: boolean;
  /** Timestamp when objective was first achieved */
  completedAt?: number;
  /** Current state of each condition */
  conditionStates: ConditionState[];
  /** Whether this objective has failed (e.g., timer expired) */
  isFailed: boolean;
  /** Timestamp when objective failed */
  failedAt?: number;
  /** Remaining time in seconds (countdown timer) */
  timeRemainingSeconds?: number;
  /** Whether timer is currently running */
  isTimerRunning: boolean;
  /** Whether a time penalty was applied on completion */
  timePenaltyApplied?: boolean;
  /** Points deducted due to time penalty */
  timePenaltyPoints?: number;
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
