import { GPSDOState } from "./GPSDOState";


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
