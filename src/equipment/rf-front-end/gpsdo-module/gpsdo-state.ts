/**
 * GLOSSARY:
 * GPSDO - GPS Disciplined Oscillator
 * OCXO - Oven-Controlled Crystal Oscillator
 * 1PPS - One Pulse Per Second
 * GNSS - Global Navigation Satellite System (ie. GPS, GLONASS, etc.)
 */
/**
 * GPS Disciplined Oscillator Module State
 * Models a 10 MHz reference distribution amplifier with GPS disciplining
 * Based on SRS FS752 specifications
 */

export interface GPSDOState {
  // ═══ Power & Operational State ═══
  /** Module power state */
  isPowered: boolean;
  /** Warm-up time remaining in seconds (OCXO needs ~10 minutes) */
  warmupTimeRemaining: number;
  /** Operating temperature in °C (oven-controlled ~70°C) */
  temperature: number;

  // ═══ GNSS Receiver State ═══
  /** GPS/GNSS signal present */
  gnssSignalPresent: boolean;
  /** GNSS switch state */
  isGnssSwitchUp: boolean;
  /** GNSS Attempting to Acquire Lock */
  isGnssAcquiringLock: boolean;
  /** Number of satellites being tracked */
  satelliteCount: number;
  /** UTC time accuracy in nanoseconds */
  utcAccuracy: number;
  /** Selected constellation: GPS, GLONASS, BEIDOU, GALILEO */
  constellation: 'GPS' | 'GLONASS' | 'BEIDOU' | 'GALILEO' | 'MULTI';

  // ═══ Lock & Stability ═══
  /** Reference is locked and stable */
  isLocked: boolean;
  /** Time elapsed since achieving lock (seconds) */
  lockDuration: number;
  /** Frequency accuracy in parts per trillion (×10⁻¹¹) */
  frequencyAccuracy: number;
  /** Short-term stability (Allan deviation at 1s) in ×10⁻¹¹ */
  allanDeviation: number;
  /** Phase noise at 10 Hz offset in dBc/Hz */
  phaseNoise: number;

  // ═══ Holdover Performance ═══
  /** Currently in holdover mode (GNSS lost) */
  isInHoldover: boolean;
  /** Time in holdover in seconds */
  holdoverDuration: number;
  /** Holdover accuracy degradation in microseconds */
  holdoverError: number;

  // ═══ Distribution Outputs ═══
  /** Number of 10 MHz outputs enabled */
  active10MHzOutputs: number;
  /** Total available 10 MHz outputs */
  max10MHzOutputs: number;
  /** 10 MHz output level in dBm */
  output10MHzLevel: number;
  /** 1PPS outputs enabled */
  ppsOutputsEnabled: boolean;

  // ═══ Health Monitoring ═══
  /** Hours of operation since last maintenance */
  operatingHours: number;
  /** Self-test status */
  selfTestPassed: boolean;
  /** Aging rate (free-running) in ppm/year */
  agingRate: number;
}

export const defaultGpsdoState: GPSDOState = {
  isPowered: true,
  isLocked: true,
  warmupTimeRemaining: 0, // seconds
  temperature: 70, // °C
  gnssSignalPresent: true,
  isGnssSwitchUp: true,
  isGnssAcquiringLock: false,
  satelliteCount: 9,
  utcAccuracy: 0,
  constellation: 'GPS',
  lockDuration: 0,
  frequencyAccuracy: 0,
  allanDeviation: 0,
  phaseNoise: 0,
  isInHoldover: false,
  holdoverDuration: 0,
  holdoverError: 0,
  active10MHzOutputs: 2,
  max10MHzOutputs: 5,
  output10MHzLevel: 0,
  ppsOutputsEnabled: false,
  operatingHours: 6,
  selfTestPassed: true,
  agingRate: 0,
};
