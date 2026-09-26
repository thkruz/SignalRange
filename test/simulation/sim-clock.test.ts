import { FIXED_STEP_MS, MAX_FRAME_MS, SimClock, STEPS_PER_SECOND } from '../../src/simulation/sim-clock';

/** Feed frames of `frameMs` until `totalMs` of real time has passed; returns steps run. */
function runFrames(frameMs: number, totalMs: number): number {
  let steps = 0;
  const frames = Math.round(totalMs / frameMs);
  for (let i = 0; i < frames; i++) {
    const owed = SimClock.consumeFrame(frameMs);
    for (let j = 0; j < owed; j++) {
      SimClock.step();
    }
    steps += owed;
  }

  return steps;
}

describe('SimClock', () => {
  it('releases the same number of steps at any frame rate', () => {
    const at30 = runFrames(1000 / 30, 10_000);
    SimClock.reset();
    const at144 = runFrames(1000 / 144, 10_000);
    SimClock.reset();
    const at60 = runFrames(1000 / 60, 10_000);

    expect(at60).toBe(10 * STEPS_PER_SECOND);
    expect(Math.abs(at30 - at60)).toBeLessThanOrEqual(1);
    expect(Math.abs(at144 - at60)).toBeLessThanOrEqual(1);
  });

  it('keeps readings exact multiples of the step', () => {
    for (let i = 0; i < 6000; i++) {
      SimClock.step();
    }

    expect(SimClock.runMs()).toBe(100_000);
    expect(SimClock.scenarioElapsedMs()).toBe(100_000);
  });

  it('clamps a long frame instead of replaying it', () => {
    const steps = SimClock.consumeFrame(60_000);

    expect(steps).toBe(Math.round(MAX_FRAME_MS / FIXED_STEP_MS));
  });

  it('stops scenario time but not run time while the scenario is paused', () => {
    SimClock.startScenario(Date.UTC(2027, 2, 16));
    const start = SimClock.nowMs();
    for (let i = 0; i < 60; i++) {
      SimClock.step();
    }

    expect(SimClock.nowMs()).toBe(start);
    expect(SimClock.runMs()).toBe(1000);

    SimClock.resume('scenario');
    for (let i = 0; i < 60; i++) {
      SimClock.step();
    }

    expect(SimClock.nowMs()).toBe(start + 1000);
  });

  it('owes no steps while hidden, and does not replay the absence', () => {
    SimClock.pause('hidden');

    expect(SimClock.consumeFrame(100)).toBe(0);

    SimClock.resume('hidden');

    expect(SimClock.consumeFrame(FIXED_STEP_MS)).toBe(1);
  });

  it('applies the speed multiplier to real time', () => {
    SimClock.setSpeed(5);

    expect(SimClock.consumeFrame(FIXED_STEP_MS)).toBe(5);
  });

  it('moves scenario time and not run time on a skip', () => {
    SimClock.skip(60_000);

    expect(SimClock.scenarioElapsedMs()).toBe(60_000);
    expect(SimClock.skippedMs()).toBe(60_000);
    expect(SimClock.runMs()).toBe(0);
  });

  it('ignores non-positive and non-finite skips', () => {
    SimClock.skip(0);
    SimClock.skip(-5);
    SimClock.skip(Number.NaN);

    expect(SimClock.skippedMs()).toBe(0);
  });

  it('fires timers on run time in due order, including while the scenario is paused', () => {
    const fired: string[] = [];
    SimClock.pause('scenario');
    SimClock.setTimeout(() => fired.push('b'), 500);
    SimClock.setTimeout(() => fired.push('a'), 200);
    const interval = SimClock.setInterval(() => fired.push('tick'), 300);

    for (let i = 0; i < 40; i++) {
      SimClock.step();
    }
    SimClock.clearTimer(interval);
    for (let i = 0; i < 40; i++) {
      SimClock.step();
    }

    expect(fired).toEqual(['a', 'tick', 'b', 'tick']);
  });

  it('keeps pending timers across startScenario and drops them on reset', () => {
    let fired = 0;
    SimClock.setTimeout(() => fired++, 100);
    SimClock.startScenario(Date.UTC(2027, 0, 1));
    for (let i = 0; i < 10; i++) {
      SimClock.step();
    }

    expect(fired).toBe(1);

    SimClock.setTimeout(() => fired++, 100);
    SimClock.reset();
    for (let i = 0; i < 10; i++) {
      SimClock.step();
    }

    expect(fired).toBe(1);
  });

  it('restores scenario time from a checkpoint', () => {
    SimClock.startScenario(Date.UTC(2027, 0, 1));
    SimClock.resume('scenario');
    SimClock.step();
    SimClock.setScenarioNowMs(Date.UTC(2027, 0, 1, 0, 30));

    expect(SimClock.nowMs()).toBe(Date.UTC(2027, 0, 1, 0, 30));
  });
});
