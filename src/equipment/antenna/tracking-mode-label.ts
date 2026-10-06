import type { AntennaState } from './antenna-core';

/**
 * The tracking mode as the ACU and Dashboard print it. Step-track is an
 * overlay on program-track (`isStepTrackEnabled`), not a `trackingMode`
 * value, so printing `trackingMode` alone hid it (s01-F3, s10-F5).
 */
export function trackingModeLabel(state: Pick<AntennaState, 'trackingMode' | 'isStepTrackEnabled'> & { isAcuAutomationFaulted?: boolean }): string {
  const base = state.trackingMode.toUpperCase().replace('-', ' ');
  // Under an ACU automation fault program-track is not running whatever the
  // mode switch says (nats-s23-F5)
  if (state.isAcuAutomationFaulted && state.trackingMode === 'program-track') {
    return `${base} (OFFLINE)`;
  }
  return state.trackingMode === 'program-track' && state.isStepTrackEnabled ? `${base} + STEP` : base;
}

/**
 * The antenna lock as the ACU and Dashboard print it. Under an ACU automation
 * fault the lock logic is the dead processor's, so the lock is UNKNOWN rather
 * than whatever it read at the crash (nats-s23-F5).
 */
export function antennaLockLabel(state: Pick<AntennaState, 'isLocked' | 'isBeaconLocked'> & { isAcuAutomationFaulted?: boolean }): 'LOCKED' | 'UNLOCKED' | 'UNKNOWN' {
  if (state.isAcuAutomationFaulted) {
    return 'UNKNOWN';
  }
  return state.isLocked || state.isBeaconLocked ? 'LOCKED' : 'UNLOCKED';
}
