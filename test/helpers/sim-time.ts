import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';
import { vi } from 'vitest';

/**
 * Advance simulated time by `ms` the way SimulationManager does: whole fixed
 * steps on SimClock (firing SimClock timers). With `emitUpdate`, each step
 * also emits Events.UPDATE, so per-step logic (objective countdowns, dwell,
 * AGC) runs too. Fake timers, if installed, advance by the same amount so
 * wall-clock UI code keeps pace.
 */
export function advanceSimTime(ms: number, { emitUpdate = false }: { emitUpdate?: boolean } = {}): void {
  const steps = Math.round(ms / FIXED_STEP_MS);
  for (let i = 0; i < steps; i++) {
    SimClock.step();
    if (emitUpdate) {
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
    }
  }

  if (vi.isFakeTimers()) {
    vi.advanceTimersByTime(ms);
  }
}

/**
 * Move scenario (mission-elapsed) time to `elapsedMs` since scenario start,
 * as a skip. For tests of managers that schedule on missionNowMs().
 */
export function setScenarioElapsed(elapsedMs: number): void {
  SimClock.skip(elapsedMs - SimClock.scenarioElapsedMs());
}
