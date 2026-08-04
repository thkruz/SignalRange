/**
 * @file mission-clock - Mission-elapsed time accessor
 * @description The clock every "seconds since mission start" mechanic measures
 * against. It is wall-clock time plus all time the operator has skipped.
 *
 * Two independent clocks already existed and they were never the same thing:
 *
 *   - the SCENARIO clock (OpsLogManager / getSimulatedNowMs) - an absolute UTC
 *     timestamp that orbital physics propagate against, and
 *   - MISSION ELAPSED - seconds since a manager was constructed, which seven
 *     managers each computed as `Date.now() - this.missionStartTime_`.
 *
 * That was harmless while the only way to move the scenario clock was to wait,
 * because both advanced at 1x together. The operator-facing time skip breaks the
 * tie: it jumps the scenario clock 40 minutes to reach the next pass, and unless
 * mission-elapsed jumps with it, every elapsed-keyed mechanic silently disagrees
 * with the sky. A commanding window authored to open at the satellite's AOS
 * (scenario 8: windowStartS 220) would still read "too early" with the bird
 * overhead, and a maneuver scheduled for T+60s would fire an hour late.
 *
 * So: managers that mean "mission elapsed" call missionNowMs() for BOTH the
 * start stamp and the measurement. With no skip the offset is 0 and the value is
 * exactly Date.now(), so behaviour is unchanged for every campaign that never
 * skips.
 *
 * This is deliberately NOT the scenario clock. Mission-elapsed is monotonic from
 * scenario load; the scenario clock is an absolute date that a scenario may
 * start at 00:28 UTC on 2027-03-16.
 */

/** Total time the operator has skipped this scenario, in ms. */
let skippedMs = 0;

/**
 * Current mission-clock time: wall clock advanced by all skipped time.
 * Drop-in replacement for Date.now() in mission-elapsed arithmetic.
 */
export function missionNowMs(): number {
  return Date.now() + skippedMs;
}

/**
 * Advance the mission clock. Called by TimeSkipController for each step of a
 * fast-forward, so elapsed-keyed mechanics cross their thresholds during the
 * skip rather than all at once at the end.
 */
export function addSkippedTime(deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return;
  }

  skippedMs += deltaMs;
}

/** Total skipped time this scenario, in ms. */
export function getSkippedMs(): number {
  return skippedMs;
}

/**
 * Reset the offset. Must be called on scenario teardown, or the next scenario
 * inherits the previous one's skips and starts with its mechanics pre-expired.
 */
export function resetMissionClock(): void {
  skippedMs = 0;
}
