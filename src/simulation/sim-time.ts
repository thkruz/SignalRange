/**
 * @file sim-time - Simulated clock accessors
 * @description Provides the current simulated time for physics that must follow
 * the scenario clock (e.g., SGP4 orbit propagation). Falls back to wall-clock
 * time when no scenario clock is running (unit tests, menus).
 */

import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { SimClock } from './sim-clock';

/**
 * Get the current simulated time as a Unix timestamp in milliseconds.
 * Uses the scenario clock (SimClock, epoch set by OpsLogManager) when a
 * scenario is running, otherwise Date.now() (sandboxes without objectives
 * follow the real sky).
 */
export function getSimulatedNowMs(): number {
  if (OpsLogManager.isInitialized()) {
    return SimClock.nowMs();
  }

  return Date.now();
}

/**
 * Get the current simulated time as a Date.
 */
export function getSimulatedNow(): Date {
  return new Date(getSimulatedNowMs());
}
