import type { Page } from '@playwright/test';

/**
 * Test clock for browser specs (Phase 45 package B).
 *
 * With the clock on, the fixture installs Playwright's `page.clock` before the first navigation, so
 * Date, performance.now, setTimeout/setInterval and requestAnimationFrame in the page run on a fake
 * clock. Time still flows at the real rate between helper calls (clicks, animations and expect()
 * polling behave as before); `simAdvance` and `advanceUntil` fast-forward it. rAF frames arrive every
 * FRAME_MS of fake time; SimClock still runs its fixed 60 Hz steps inside each frame, and every UI timer
 * (dialog reveal, radio TX, laptop loading, 1 s polls) fires on the way.
 *
 * E2E_CLOCK_TRACE=1 logs how much page time each advanceUntil needed (for finding slow waits).
 *
 * With the clock off (default, or E2E_TEST_CLOCK=0) both helpers fall back to real waiting, so a spec
 * converted to them still runs unchanged without the clock.
 *
 * Without the clock, waits of a second or more run on the burst hook (window.__srTest.advance: fixed sim steps
 * in a tight loop, no draw, about 25 to 40x real time) followed by a short real settle, because adapters throttle
 * DOM sync on wall time and page timers are not advanced by the burst. SR_E2E_BURST=0 forces real waiting again
 * (baselines, bisecting a failure); a build without the hook falls back by itself.
 *
 * Not reached by the fake clock: Web Workers (the propagation worker). The sim requests grid points by
 * sim time and holds a step until they arrive, so a fast-forward can only run slower, never wrong.
 */

const clockPages_ = new WeakSet<Page>();

/** Fake-time chunk per runFor call, ms. Small enough that worker replies interleave with frames. */
const DEFAULT_CHUNK_MS = 1000;

/** Fake-time frame interval on the test clock, ms (see installTestClock). */
const FRAME_MS = 200;

/** Install the fake clock on a page that has not navigated yet. Called by the fixture. */
export async function installTestClock(page: Page): Promise<void> {
  await page.clock.install();
  // Frames every FRAME_MS of fake time instead of 16 ms: each fake timer costs a real macrotask yield, so
  // fewer, longer frames fast-forward much faster. SimClock still runs fixed 60 Hz steps (several per frame,
  // under MAX_FRAME_MS = 250 so nothing is clamped away). Runs after the clock's own init script, so
  // setTimeout here is the fake one.
  await page.addInitScript((frameMs: number) => {
    const handles = new Map<number, number>();
    let next = 0;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const handle = ++next;
      handles.set(
        handle,
        window.setTimeout(() => {
          handles.delete(handle);
          callback(performance.now());
        }, frameMs)
      );
      return handle;
    };
    window.cancelAnimationFrame = (handle: number): void => {
      window.clearTimeout(handles.get(handle));
      handles.delete(handle);
    };
  }, FRAME_MS);
  clockPages_.add(page);
}

/**
 * Whether a spec that opts in should get the clock: E2E_TEST_CLOCK=0 forces it off (real-time baseline
 * runs), E2E_TEST_CLOCK=1 forces it on even for specs that did not opt in.
 */
export function testClockWanted(optIn: boolean): boolean {
  const env = process.env.E2E_TEST_CLOCK;
  return env === '1' || (optIn && env !== '0');
}

/** Opt-in for specs that build their own page (`browser.newContext().newPage()` in beforeAll). Call before goto. */
export async function useTestClock(page: Page): Promise<void> {
  if (testClockWanted(true) && !hasTestClock(page)) {
    await installTestClock(page);
  }
}

/** Whether this page runs on the test clock. */
export function hasTestClock(page: Page): boolean {
  return clockPages_.has(page);
}

/** Shortest wait that is worth a burst, ms. */
const BURST_MIN_MS = 1000;

/** Longest real time advanceUntil waits for a paused sim (loading, menu, hidden tab) to resume, ms. */
const PAUSED_SIM_LIMIT_MS = 30000;

/** Real time after a burst for wall-clock-throttled adapters and page timers to catch up, ms. */
const BURST_SETTLE_MS = 250;

/** Whether the burst path is allowed (SR_E2E_BURST=0 turns it off). */
export function burstWanted(): boolean {
  return process.env.SR_E2E_BURST !== '0';
}

/**
 * Run `ms` of sim time through window.__srTest.advance. Returns the sim ms advanced, or null when the page has
 * no hook (production-style build, page not loaded yet) or the page navigated away mid-call, so the caller can
 * fall back to a real wait. An exception thrown inside the sim step is NOT swallowed: it fails the test, the same
 * way it would freeze the game for a player.
 */
async function burstSim(page: Page, ms: number): Promise<number | null> {
  try {
    return await page.evaluate(async (simMs: number) => {
      const hook = (window as unknown as { __srTest?: { advance?: (n: number) => Promise<number> } }).__srTest;
      return typeof hook?.advance === 'function' ? await hook.advance(simMs) : null;
    }, ms);
  } catch (error) {
    if (error instanceof Error && /Execution context was destroyed|Target (page, context or browser|closed)/u.test(error.message)) {
      return null;
    }
    throw error;
  }
}

/** Whether a no-clock wait of `ms` may use the burst: false on the test clock (which has its own fast-forward) or with SR_E2E_BURST=0. */
export function canBurst(page: Page): boolean {
  return burstWanted() && !hasTestClock(page);
}

/**
 * Let `ms` of page time pass: fast-forward on the test clock, a real wait without it. Use for waits that
 * exist only to let simulated time pass (a maintain window, a scripted outage, a radio hold). Leave short
 * UI settle waits as waitForTimeout.
 */
export async function simAdvance(page: Page, ms: number, chunkMs = DEFAULT_CHUNK_MS): Promise<void> {
  if (!hasTestClock(page)) {
    if (ms >= BURST_MIN_MS && canBurst(page)) {
      const advanced = await burstSim(page, ms);
      if (advanced !== null) {
        await page.waitForTimeout(BURST_SETTLE_MS);
        // A sim that could not step (menu, hidden, wall cap) owes the rest in real time, however small
        const owed = ms - advanced;
        if (owed > 0) await page.waitForTimeout(owed);
        return;
      }
    }
    await page.waitForTimeout(ms);
    return;
  }
  let left = ms;
  while (left > 0) {
    const chunk = Math.min(chunkMs, left);
    await page.clock.runFor(chunk);
    left -= chunk;
  }
}

export interface AdvanceUntilOptions {
  /** Most page time to spend, ms (fake time on the clock, real time without it). */
  maxMs?: number;
  /** Page time between checks, ms. */
  stepMs?: number;
  /** Text for the timeout error. */
  message?: string;
}

/**
 * Advance page time until `check` resolves true; throws after `maxMs` of page time. `check` runs in Node,
 * so it can use locators (`() => row.evaluate(...)`) or page.evaluate. Replaces expect.poll /
 * waitForTimeout loops that wait for sim state.
 */
export async function advanceUntil(page: Page, check: () => Promise<boolean>, options: AdvanceUntilOptions = {}): Promise<void> {
  const maxMs = options.maxMs ?? 60000;
  const stepMs = options.stepMs ?? 500;
  let spentMs = 0;
  let pausedRealMs = 0;
  for (;;) {
    if (await check()) {
      if (process.env.E2E_CLOCK_TRACE) {
        console.log('advanceUntil', options.message ?? '', spentMs);
      }
      return;
    }
    if (spentMs >= maxMs) {
      throw new Error(`advanceUntil: ${options.message ?? 'condition'} not met after ${maxMs} ms of page time`);
    }
    if (canBurst(page)) {
      // Burst in slices of at least 1 s of sim, then let wall-throttled DOM sync catch up before the check.
      // Budget counts the sim time the hook reports, so maxMs means the same as on the clock path.
      const slice = Math.max(stepMs, BURST_MIN_MS);
      const advanced = await burstSim(page, slice);
      if (advanced !== null) {
        await page.waitForTimeout(BURST_SETTLE_MS);
        if (advanced > 0) {
          spentMs += advanced;
          pausedRealMs = 0;
        } else {
          // The sim did not step (loading, menu, hidden tab): no sim time passed, so no budget is spent. Wait in real time.
          await page.waitForTimeout(stepMs);
          pausedRealMs += stepMs + BURST_SETTLE_MS;
          if (pausedRealMs > PAUSED_SIM_LIMIT_MS) {
            throw new Error(
              `advanceUntil: ${options.message ?? 'condition'} not met: the sim is paused (loading, menu or hidden tab) and did not resume within ${PAUSED_SIM_LIMIT_MS} ms of real time`
            );
          }
        }
        continue;
      }
    }
    await simAdvance(page, stepMs, stepMs);
    spentMs += stepMs;
  }
}
