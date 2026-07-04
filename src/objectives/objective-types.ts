/**
 * @file Objective system type definitions
 * @description Defines objectives for scenario-based learning and assessment
 */

import type { Character } from '@app/modal/character-enum';
import { MHz } from '@app/types';

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
  | 'buc-loopback-enabled' // BUC loopback mode is enabled
  | 'buc-loopback-disabled' // BUC loopback mode is disabled
  | 'buc-temperature-normal' // BUC temperature within normal range (below max threshold)
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
  | 'signal-detected' // Signal detected on spectrum analyzer (optional signalId and minPower params)
  | 'signal-level-correct' // Specific signal at or above minimum power level
  | 'frequency-set' // Equipment tuned to specific frequency
  | 'speca-span-set' // Spectrum analyzer span set to specific value
  | 'speca-rbw-set' // Spectrum analyzer RBW set to specific value
  | 'speca-reference-level-set' // Spectrum analyzer reference level set
  | 'speca-center-frequency' // Spectrum analyzer center frequency set to specific value
  | 'speca-noise-floor-visible' // Spectrum analyzer shows clean baseline
  | 'speca-min-amplitude' // Spectrum analyzer min amplitude set
  | 'speca-max-amplitude' // Spectrum analyzer max amplitude set
  | 'filter-bandwidth-set' // IF filter bandwidth configured
  | 'notch-filter-configured' // Notch filter set to specific center freq, width, depth
  | 'antenna-beacon-frequency-set' // Antenna beacon frequency configured
  | 'antenna-tracking-mode-set' // Antenna tracking mode set (step-track, etc.)
  | 'antenna-beacon-locked' // Antenna beacon signal locked
  | 'antenna-position' // Antenna at specific azimuth/elevation position
  | 'feed-heater-enabled' // Antenna feed heater is enabled
  | 'buc-unmuted' // BUC RF output enabled (inverse of muted)
  | 'buc-gain-set' // BUC gain set to specific value
  | 'hpa-enabled' // HPA output enabled (dual-action switch)
  | 'hpa-back-off-set' // HPA back-off level configured
  | 'hpa-not-overdriven' // HPA not in overdrive (IMD check)
  | 'hpa-output-power-set' // HPA output power above threshold
  | 'receiver-signal-locked' // Receiver modem has demodulation lock
  | 'receiver-snr-threshold' // Receiver modem C/N ratio meets threshold
  | 'rx-modem-frequency-set' // Receiver modem center frequency set
  | 'rx-modem-bandwidth-set' // Receiver modem bandwidth set
  | 'rx-modem-modulation-set' // Receiver modem modulation type set
  | 'rx-modem-fec-set' // Receiver modem FEC rate set
  | 'tx-modem-frequency-set' // Transmitter modem center frequency set
  | 'tx-modem-power-set' // Transmitter modem power set
  | 'tx-modem-bandwidth-set' // Transmitter modem bandwidth set
  | 'tx-modem-modulation-set' // Transmitter modem modulation type set
  | 'tx-modem-fec-set' // Transmitter modem FEC rate set
  | 'tx-modem-transmitting' // Transmitter modem actively transmitting
  | 'tx-modem-not-transmitting' // Transmitter modem NOT transmitting (transmission stopped)
  | 'tx-active-modem' // Transmitter active modem selection
  | 'tx-modem-loopback-enabled' // TX modem loopback enabled
  | 'tx-modem-loopback-disabled' // TX modem loopback disabled
  | 'status-check' // Interactive quiz to verify player found the correct information
  | 'custom' // Custom condition with evaluator function
  // Handover and traffic control conditions
  | 'handover-complete' // Traffic handover to target station completed
  | 'traffic-owner' // Ground station owns traffic to satellite
  | 'traffic-transferred' // Traffic transferred from source to target station
  | 'service-continuity' // No packet loss during handover (placeholder - always passes)
  | 'ground-station-selected' // Ground station selected in UI
  | 'satellite-selected' // Satellite selected in UI asset tree
  // UI interaction conditions
  | 'mission-brief-opened' // Mission brief document has been opened
  | 'tab-active' // Specific tab is currently active in TabbedCanvas
  // FEC/Payload conditions
  | 'rx-frame-sync-locked' // RX frame synchronization locked/unlocked
  | 'rx-ber-threshold' // RX BER below/above threshold
  | 'rx-rs-uncorrectable' // RS decoder has uncorrectable blocks
  | 'rx-channel-status' // RX channel status matches value
  // Crypto conditions
  | 'rx-crypto-status' // RX decryption mode matches value
  | 'rx-key-status' // RX decryption key status matches value
  | 'tx-crypto-status' // TX encryption mode matches value
  | 'tx-key-status' // TX encryption key status matches value
  // Fault injection conditions
  | 'fault-active' // Check if specific fault is currently injected
  | 'fault-cleared' // Check if specific fault has been cleared
  // Geolocation conditions (Campaign 5)
  | 'geolocation-measurements-collected' // >= N TDOA/FDOA captures collected
  | 'geolocation-fix-accuracy' // Computed fix within N km of the emitter truth
  // Electronic-attack / SATCOM denial conditions (Campaign 4)
  | 'jamming-uplink-active' // Jam waveform radiating in the target uplink band
  | 'jamming-effective'; // J/S at the target transponder meets the denial threshold

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
  /** For antenna-locked: which satellite (NORAD ID) */
  noradId?: number;
  /** For antenna-locked: legacy alias for noradId (kept for backwards compatibility) */
  satelliteId?: number;
  /** For equipment-powered: which equipment */
  equipment?: EquipmentRef;
  /** For frequency-set: target frequency in Hz */
  frequency?: number;
  /** For frequency-set: tolerance in Hz */
  frequencyTolerance?: number;
  /** For lnb-lo-set: target local oscillator frequency in Hz */
  loFrequency?: MHz;
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
  /** For buc-temperature-normal: maximum temperature in °C (default: 70) */
  maxTemperature?: number;
  /** For speca-span-set: target span in Hz */
  span?: number;
  /** For speca-rbw-set: target RBW in Hz */
  rbw?: number;
  /** For speca-reference-level-set: target reference level in dBm */
  referenceLevel?: number;
  /** For speca-reference-level-set: reference level tolerance in dB */
  referenceLevelTolerance?: number;
  /** For speca-center-frequency: target center frequency in Hz */
  centerFrequency?: number;
  /** For speca-center-frequency: center frequency tolerance in Hz (default: 1e6) */
  centerFrequencyTolerance?: number;
  /** For speca-noise-floor-visible: maximum signal strength to consider "clean baseline" in dBm */
  maxSignalStrength?: number;
  /** For speca-min-amplitude: target min amplitude in dBm */
  minAmplitude?: number;
  /** For speca-min-amplitude: min amplitude tolerance in dB (default: 5) */
  minAmplitudeTolerance?: number;
  /** For speca-max-amplitude: target max amplitude in dBm */
  maxAmplitude?: number;
  /** For speca-max-amplitude: max amplitude tolerance in dB (default: 5) */
  maxAmplitudeTolerance?: number;
  /** For custom conditions: custom evaluator function */
  evaluator?: () => boolean;
  /** Target specific equipment by index (0-based). If omitted, any equipment satisfies. */
  equipmentIndex?: number;
  /** For filter-bandwidth-set: target bandwidth index (0-12) */
  bandwidthIndex?: number;
  /** For notch-filter-configured: target notch center frequency in MHz */
  notchCenterFrequency?: number;
  /** For notch-filter-configured: notch center frequency tolerance in MHz (default: 1) */
  notchCenterFrequencyTolerance?: number;
  /** For notch-filter-configured: target notch bandwidth in MHz */
  notchBandwidth?: number;
  /** For notch-filter-configured: notch bandwidth tolerance in MHz (default: 0.5) */
  notchBandwidthTolerance?: number;
  /** For notch-filter-configured: target notch depth in dB */
  notchDepth?: number;
  /** For notch-filter-configured: notch depth tolerance in dB (default: 2) */
  notchDepthTolerance?: number;
  /** For notch-filter-configured: specific notch slot index (0-2), or any if omitted */
  notchIndex?: number;
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
  /** For hpa-output-power-set: minimum output power in watts */
  minOutputPower?: number;
  /** For receiver-signal-locked/receiver-snr-threshold: which modem (1-4), defaults to active modem */
  modemNumber?: number;
  /** For receiver-snr-threshold: minimum C/N ratio in dB */
  minCNRatio?: number;
  /**
   * For receiver-snr-threshold: maximum C/N ratio in dB. When set, the
   * condition passes while the modem's C/N is at or BELOW this value - used to
   * assert a link has been degraded/denied (e.g. a jammed victim downlink
   * observed on a monitor receiver). May be combined with minCNRatio to require
   * a band. Optional; existing scenarios use only minCNRatio.
   */
  maxCNRatio?: number;
  /** For rx-modem-bandwidth-set: target bandwidth in Hz */
  bandwidth?: number;
  /** For rx-modem-bandwidth-set: bandwidth tolerance in Hz */
  bandwidthTolerance?: number;
  /** For rx-modem-modulation-set: target modulation type */
  modulation?: string;
  /** For rx-modem-fec-set: target FEC rate */
  fec?: string;
  /** For tx-modem-power-set: target power in dBm */
  power?: number;
  /** For tx-modem-power-set: power tolerance in dB */
  powerTolerance?: number;
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
  /** For status-check: which character asks the question (default: CHARLIE_BROOKS) */
  character?: Character;
  /** For status-check: if true, options will not be randomized (use for "All of the above" questions) */
  preserveOptionOrder?: boolean;
  /** For status-check: line appended to the Working Document panel when this quiz is passed */
  documentLine?: string;
  /** For status-check: Working Document section the documentLine belongs to (default: "Notes") */
  documentSection?: string;
  /** For signal-detected/signal-level-correct: signal identifier to match */
  signalId?: string;
  /** For signal-detected/signal-level-correct: minimum power level in dBm */
  minPower?: number;
  /** For handover-complete/traffic-owner: target ground station ID */
  targetGroundStationId?: string;
  /** For traffic-transferred: source ground station ID */
  sourceStation?: string;
  /** For traffic-transferred: target ground station ID */
  targetStation?: string;
  /** For service-continuity: maximum allowed packet loss ratio (0.0-1.0) - placeholder */
  maxPacketLoss?: number;
  /** For ground-station-selected: ground station ID that must be selected */
  groundStationId?: string;
  /** For satellite-selected: asset tree satellite ID (e.g., 'sat-61525') */
  assetSatelliteId?: string;
  /** For mission-brief-opened: specific box ID that must be opened (defaults to any 'mission-brief*' box) */
  boxId?: string;
  /** For tab-active: tab ID prefix to match (e.g., 'acu-control' matches 'acu-control-0') */
  tab?: string;

  // FEC/Payload condition parameters
  /** For rx-frame-sync-locked: expected lock state (default: true) */
  locked?: boolean;
  /** For rx-ber-threshold: BER threshold value */
  berThreshold?: number;
  /** For rx-ber-threshold: comparison operator ('below' or 'above', default: 'below') */
  berComparison?: 'below' | 'above';
  /** For rx-channel-status: expected channel status */
  channelStatus?: 'Good' | 'Degraded' | 'Critical' | 'No Lock';

  // Crypto condition parameters
  /** For rx-crypto-status/tx-crypto-status: expected crypto mode */
  cryptoMode?: 'ACTIVE' | 'DISABLED' | 'BYPASSED';
  /** For rx-key-status/tx-key-status: expected key status */
  keyStatus?: 'Valid' | 'Expired' | 'Pending Rotation' | 'Mismatch' | 'Zeroized';

  // Fault injection condition parameters
  /** For fault-active/fault-cleared: fault ID to check */
  faultId?: string;

  // Geolocation condition parameters (Campaign 5)
  /** For geolocation-measurements-collected: minimum capture count */
  minCount?: number;
  /** For geolocation-fix-accuracy: maximum fix error vs truth, km */
  maxErrorKm?: number;
  /** For geolocation conditions: restrict to captures against this interference event */
  interferenceEventId?: string;

  // Observation-gating parameters
  /**
   * If true, this (typically passive) condition does not count as satisfied
   * from ambient simulation state alone. It latches satisfied only after the
   * underlying value is true WHILE the operator is viewing the observation
   * context (params.observationTab). Once observed it stays satisfied even if
   * the operator navigates away. Use for checks that would otherwise show
   * pre-ticked before the player ever looked (signal-detected, receiver lock,
   * beacon lock, gpsdo lock, etc.).
   */
  requiresObservation?: boolean;
  /**
   * For requiresObservation: the tab that must be active to "observe" the
   * value (e.g. 'rx-analysis', 'tx-chain', 'acu-control', 'gps-timing',
   * 'dashboard'). Matched by exact id or prefix, like the tab-active condition.
   */
  observationTab?: string;

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
  /** Hint or tip to help achieve the condition (optional) */
  hint?: string;
  /**
   * If true, this condition is still enforced for objective completion but is
   * NOT rendered as a row in the checklist. Used to require the operator be on
   * the correct tab without spelling out which tab (qualified-operator scenarios
   * expect the player to know where to look).
   */
  hidden?: boolean;
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
  /** NICE Framework codes this objective aligns with (e.g., ['K0645', 'T0153']) */
  nice?: string[];
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
  /** If true, scenario timer will not start until this objective is completed */
  freezesScenarioTimer?: boolean;
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
  /** Points deducted from requesting hints (50% of objective points if any hint requested) */
  hintPenaltyPoints?: number;
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
  /** Whether a hint was requested for this condition */
  hintRequested?: boolean;
  /**
   * For requiresObservation conditions: latches true once the value has been
   * observed on the correct tab. After that the condition counts as satisfied
   * regardless of tab or live value.
   */
  observed?: boolean;
}
