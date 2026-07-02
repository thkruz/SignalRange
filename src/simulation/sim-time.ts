/**
 * @file sim-time - Simulated clock accessors
 * @description Provides the current simulated time for physics that must follow
 * the scenario clock (e.g., SGP4 orbit propagation). Falls back to wall-clock
 * time when no scenario clock is running (unit tests, menus).
 */

import { OpsLogManager } from '@app/ops-log/ops-log-manager';

/**
 * Get the current simulated time as a Unix timestamp in milliseconds.
 * Uses the scenario clock (OpsLogManager) when initialized, otherwise Date.now().
 */
export function getSimulatedNowMs(): number {
  if (OpsLogManager.isInitialized()) {
    return OpsLogManager.getInstance().getCurrentTimestampMs();
  }

  return Date.now();
}

/**
 * Get the current simulated time as a Date.
 */
export function getSimulatedNow(): Date {
  return new Date(getSimulatedNowMs());
}
