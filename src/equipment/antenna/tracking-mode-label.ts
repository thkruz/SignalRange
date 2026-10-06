import type { AntennaState } from './antenna-core';

/**
 * The tracking mode as the ACU and Dashboard print it. Step-track is an
 * overlay on program-track (`isStepTrackEnabled`), not a `trackingMode`
 * value, so printing `trackingMode` alone hid it (s01-F3, s10-F5).
 */
export function trackingModeLabel(state: Pick<AntennaState, 'trackingMode' | 'isStepTrackEnabled'>): string {
  const base = state.trackingMode.toUpperCase().replace('-', ' ');
  return state.trackingMode === 'program-track' && state.isStepTrackEnabled ? `${base} + STEP` : base;
}
