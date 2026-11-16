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
 * The dish is off its operating point on purpose (phase 27, r2-s03-F2):
 * stowed, or moving to a new position (a stow, a manual move, a program track
 * still pulling in). A program track that holds its lock is not repositioning
 * even though it moves (a LEO pass). `AntennaCore.isRepositioning` reads this.
 */
export function isAntennaRepositioning(state: Partial<Pick<AntennaState, 'trackingMode' | 'isSlewing' | 'isLocked'>>): boolean {
  if (state.trackingMode === 'stow') {
    return true;
  }

  return state.isSlewing === true && !(state.trackingMode === 'program-track' && state.isLocked === true);
}

/**
 * The antenna lock as the ACU and Dashboard print it. Under an ACU automation
 * fault the lock logic is the dead processor's, so the lock is UNKNOWN rather
 * than whatever it read at the crash (nats-s23-F5). A dish that is
 * repositioning (stowed, or slewing off its target) is UNLOCKED whatever the
 * beacon receiver last saw: a STOW that starts on the bird does not read
 * LOCKED (nats-r6-s03-F1, r6-s11-F1).
 */
export function antennaLockLabel(
  state: Pick<AntennaState, 'isLocked' | 'isBeaconLocked'> & Partial<Pick<AntennaState, 'trackingMode' | 'isSlewing'>> & { isAcuAutomationFaulted?: boolean }
): 'LOCKED' | 'UNLOCKED' | 'UNKNOWN' {
  if (state.isAcuAutomationFaulted) {
    return 'UNKNOWN';
  }
  if (isAntennaRepositioning(state)) {
    return 'UNLOCKED';
  }
  return state.isLocked || state.isBeaconLocked ? 'LOCKED' : 'UNLOCKED';
}
