/**
 * @file sim-clock - The one scenario clock (Phase 19.0)
 * @description Every time-dependent mechanic reads this clock, never
 * Date.now(), so a run replays identically at any frame rate.
 *
 * The render loop feeds it real frame time; it releases that time as fixed
 * steps of FIXED_STEP_MS (after clamping a frame to MAX_FRAME_MS and applying
 * the speed multiplier). Each step advances two readings of the same clock:
 *
 *   - run time       - advances on every step. Equipment dynamics (servo,
 *                      AGC, lock delays, warm-up) live here, so the operator
 *                      can still work the rack while a brief or quiz is up.
 *   - scenario time  - run time minus every interval the scenario was paused
 *                      (brief freeze, quiz, failure), plus operator skips.
 *                      Orbits, the UTC display, scheduled events and countdowns
 *                      live here. `missionNowMs()` is scenario-elapsed time.
 *
 * A hidden tab stops the steps entirely, so both readings stop together.
 */

/** Simulation steps per second of run time. */
export const STEPS_PER_SECOND = 60;
/**
 * Simulation step, ms. The loop always emits UPDATE with exactly this dt.
 * 60 Hz because every per-update constant in the equipment (AGC, AFC, LNB
 * smoothing, beacon EMA) was tuned at 60 fps; a fixed 60 Hz step keeps them
 * meaning what they meant, at any display rate.
 */
export const FIXED_STEP_MS = 1000 / STEPS_PER_SECOND;
/** Longest real frame the loop will catch up on, ms (before speed). */
export const MAX_FRAME_MS = 250;
/** Allowed speed multipliers (plan Q8). */
export const SIM_SPEEDS = [1, 2, 5] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

/** Why the scenario reading is stopped. `hidden` also stops the run reading. */
export type PauseReason = 'scenario' | 'hidden' | 'loading' | 'menu';

/** Default scenario epoch before a scenario sets one (menus, unit tests). */
const DEFAULT_EPOCH_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

let epochMs_ = DEFAULT_EPOCH_MS;
// Whole steps, so readings are exact multiples of the step and never drift
let runSteps_ = 0;
let scenarioSteps_ = 0;
/** Scenario time not made of steps: skips and checkpoint restores, ms */
let scenarioOffsetMs_ = 0;
/** Run time not made of steps: objective waits fast-forwarded with advanceRun(), ms */
let runOffsetMs_ = 0;
let skippedMs_ = 0;
let accumulatorMs_ = 0;

/** ms for a whole number of steps; exact for every whole second */
const stepsToMs = (steps: number): number => (steps * 1000) / STEPS_PER_SECOND;
const currentRunMs_ = (): number => stepsToMs(runSteps_) + runOffsetMs_;
let speed_: SimSpeed = 1;
const pauseReasons_ = new Set<PauseReason>();

/** What changed: scenario time jumped (skip, checkpoint restore), a pause reason toggled, or the speed changed. */
export type SimClockChange = 'jump' | 'pause' | 'speed';
const changeListeners_ = new Set<(change: SimClockChange) => void>();
const notifyChange_ = (change: SimClockChange): void => {
  for (const listener of [...changeListeners_]) {
    listener(change);
  }
};

interface SimTimer {
  dueRunMs: number;
  periodMs: number | null;
  callback: () => void;
}

let nextTimerId_ = 1;
const timers_ = new Map<number, SimTimer>();

/** Fire every timer due at the current run time, earliest (then oldest) first. */
function fireDueTimers_(): void {
  for (;;) {
    let dueId = 0;
    let due: SimTimer | null = null;
    for (const [id, timer] of timers_) {
      if (timer.dueRunMs <= currentRunMs_() + 1e-6 && (!due || timer.dueRunMs < due.dueRunMs)) {
        dueId = id;
        due = timer;
      }
    }
    if (!due) {
      return;
    }

    if (due.periodMs === null) {
      timers_.delete(dueId);
    } else {
      due.dueRunMs += due.periodMs;
    }
    due.callback();
  }
}

export const SimClock = {
  /** Clear everything (scenario teardown, tests). */
  reset(epochMs: number = DEFAULT_EPOCH_MS): void {
    epochMs_ = epochMs;
    runSteps_ = 0;
    scenarioSteps_ = 0;
    scenarioOffsetMs_ = 0;
    runOffsetMs_ = 0;
    skippedMs_ = 0;
    accumulatorMs_ = 0;
    speed_ = 1;
    pauseReasons_.clear();
    timers_.clear();
  },

  /**
   * Start scenario time at `epochMs`, paused until the scenario unlocks. Run
   * time and pending timers are kept: equipment is built (and may already be
   * warming up) before the scenario clock is set.
   */
  startScenario(epochMs: number): void {
    epochMs_ = epochMs;
    scenarioSteps_ = 0;
    scenarioOffsetMs_ = 0;
    skippedMs_ = 0;
    pauseReasons_.add('scenario');
  },

  /**
   * Feed one rendered frame's real duration. Returns how many fixed steps to
   * run now; the caller runs them and calls step() before each.
   */
  consumeFrame(realDtMs: number): number {
    if (pauseReasons_.has('hidden') || pauseReasons_.has('loading') || pauseReasons_.has('menu') || !Number.isFinite(realDtMs) || realDtMs <= 0) {
      return 0;
    }

    accumulatorMs_ += Math.min(realDtMs, MAX_FRAME_MS) * speed_;
    // Tolerance so 60 fps frames of exactly FIXED_STEP_MS never lose a step to rounding
    const steps = Math.floor(accumulatorMs_ / FIXED_STEP_MS + 1e-9);
    accumulatorMs_ = Math.max(0, accumulatorMs_ - steps * FIXED_STEP_MS);

    return steps;
  },

  /**
   * Give back steps `consumeFrame` handed out but the caller did not run (a
   * hold for late propagation data). They are owed again next frame, capped at
   * one frame's worth so a long hold does not turn into a burst.
   */
  deferSteps(steps: number): void {
    if (steps > 0) {
      accumulatorMs_ = Math.min(accumulatorMs_ + steps * FIXED_STEP_MS, MAX_FRAME_MS * speed_);
    }
  },

  /** Advance both readings by one fixed step. */
  step(): void {
    runSteps_++;
    if (!pauseReasons_.has('scenario')) {
      scenarioSteps_++;
    }
    fireDueTimers_();
  },

  /**
   * Run `callback` once after `delayMs` of run time. Use instead of
   * window.setTimeout for anything the simulation depends on (lock delays,
   * warm-up, power sequencing): it stops with a hidden tab, follows the speed
   * multiplier, and fires at the same step on every machine. Cleared on reset.
   */
  setTimeout(callback: () => void, delayMs: number): number {
    const id = nextTimerId_++;
    timers_.set(id, { dueRunMs: SimClock.runMs() + Math.max(0, delayMs), periodMs: null, callback });

    return id;
  },

  /** Run `callback` every `periodMs` of run time. See setTimeout(). */
  setInterval(callback: () => void, periodMs: number): number {
    const id = nextTimerId_++;
    const period = Math.max(FIXED_STEP_MS, periodMs);
    timers_.set(id, { dueRunMs: SimClock.runMs() + period, periodMs: period, callback });

    return id;
  },

  clearTimer(id: number | null | undefined): void {
    if (id !== null && id !== undefined) {
      timers_.delete(id);
    }
  },

  /**
   * Jump scenario time forward (operator time skip, dev/e2e hook). Run time
   * does not move: equipment is not "older" after a skip.
   */
  skip(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }

    scenarioOffsetMs_ += deltaMs;
    skippedMs_ += deltaMs;
    notifyChange_('jump');
  },

  /**
   * Move run time forward by `deltaMs` without stepping (Phase 27 Q4: an
   * objective wait the operator skips - the crew window, the rain cell - is
   * time the equipment really sat through). Sim timers due inside the
   * interval fire in order, each seeing run time at its own due moment, so
   * lock delays, warm-ups and stabilisation finish as they would have.
   * Per-step integrators (AGC, smoothing) are not replayed; they settle on the
   * next steps. Scenario time is moved separately with skip().
   */
  advanceRun(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }

    const targetMs = currentRunMs_() + deltaMs;
    for (;;) {
      let nextDueMs = Number.POSITIVE_INFINITY;
      for (const timer of timers_.values()) {
        nextDueMs = Math.min(nextDueMs, timer.dueRunMs);
      }
      if (nextDueMs > targetMs) {
        break;
      }
      runOffsetMs_ = Math.max(runOffsetMs_, nextDueMs - stepsToMs(runSteps_));
      fireDueTimers_();
    }
    runOffsetMs_ = targetMs - stepsToMs(runSteps_);
  },

  /** Set scenario time directly (checkpoint restore). */
  setScenarioNowMs(nowMs: number): void {
    scenarioOffsetMs_ = nowMs - epochMs_ - stepsToMs(scenarioSteps_);
    notifyChange_('jump');
  },

  /**
   * Observe discontinuities and pause/speed changes (the KeepTrack map follows
   * the clock through these). Returns the unsubscribe function. Not cleared by
   * reset(): the subscriber owns its lifetime.
   */
  onChange(listener: (change: SimClockChange) => void): () => void {
    changeListeners_.add(listener);

    return () => {
      changeListeners_.delete(listener);
    };
  },

  pause(reason: PauseReason): void {
    if (!pauseReasons_.has(reason)) {
      pauseReasons_.add(reason);
      notifyChange_('pause');
    }
  },

  resume(reason: PauseReason): void {
    if (pauseReasons_.delete(reason)) {
      notifyChange_('pause');
    }
    if (reason === 'hidden' || reason === 'loading' || reason === 'menu') {
      // Do not replay the time the tab was away
      accumulatorMs_ = 0;
    }
  },

  isPaused(reason: PauseReason): boolean {
    return pauseReasons_.has(reason);
  },

  /** Scenario time as absolute UTC ms. What orbits and the UTC display read. */
  nowMs(): number {
    return epochMs_ + SimClock.scenarioElapsedMs();
  },

  /** Scenario time since the scenario started, ms. */
  scenarioElapsedMs(): number {
    return stepsToMs(scenarioSteps_) + scenarioOffsetMs_;
  },

  /** Run time since the scenario started, ms. What equipment dynamics read. */
  runMs(): number {
    return currentRunMs_();
  },

  /** Steps run since reset. Use for anything counted per step. */
  runSteps(): number {
    return runSteps_;
  },

  /** Total scenario time skipped this run, ms. */
  skippedMs(): number {
    return skippedMs_;
  },

  get speed(): SimSpeed {
    return speed_;
  },

  setSpeed(speed: SimSpeed): void {
    if (SIM_SPEEDS.includes(speed)) {
      const changed = speed_ !== speed;

      speed_ = speed;
      if (changed) {
        notifyChange_('speed');
      }
    }
  },
};
