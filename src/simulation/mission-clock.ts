/**
 * @file mission-clock - Mission-elapsed time accessor
 * @description "Seconds since mission start" for the managers that schedule
 * against it (commanding windows, weather, interference, GNSS threat, space
 * events, telemetry, security, COMSEC key age, scoring elapsed time).
 *
 * Since Phase 19.0 this is a view of the one scenario clock (sim-clock.ts):
 * scenario-elapsed time, which pauses with the sky (brief freeze, quizzes,
 * failure, hidden tab) and includes every operator time skip. Before that it
 * was wall clock plus skips, so scheduled events drifted against the sky by
 * however long each learner spent reading the brief and answering quizzes.
 *
 * Managers call missionNowMs() for both the start stamp and the measurement;
 * only differences are meaningful.
 */

import { SimClock } from './sim-clock';

/** Current mission-clock reading, ms. */
export function missionNowMs(): number {
  return SimClock.scenarioElapsedMs();
}

/** Total skipped this scenario, in ms. */
export function getSkippedMs(): number {
  return SimClock.skippedMs();
}

/**
 * Reset the clock. Must be called on scenario teardown, or the next scenario
 * inherits the previous one's elapsed time and skips.
 */
export function resetMissionClock(): void {
  SimClock.reset();
}
