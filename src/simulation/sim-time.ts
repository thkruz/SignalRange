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
  if (isScenarioClockRunning()) {
    return SimClock.nowMs();
  }

  return Date.now();
}

/**
 * Whether a scenario has seeded the scenario clock (OpsLogManager set its
 * epoch), so getSimulatedNowMs() reads station time and not the wall clock.
 * The clock may still be paused (brief review); it is set either way.
 */
export function isScenarioClockRunning(): boolean {
  return OpsLogManager.isInitialized();
}

/**
 * Get the current simulated time as a Date.
 */
export function getSimulatedNow(): Date {
  return new Date(getSimulatedNowMs());
}
