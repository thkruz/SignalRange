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

/**
 * Let `ms` of page time pass: fast-forward on the test clock, a real wait without it. Use for waits that
 * exist only to let simulated time pass (a maintain window, a scripted outage, a radio hold). Leave short
 * UI settle waits as waitForTimeout.
 */
export async function simAdvance(page: Page, ms: number, chunkMs = DEFAULT_CHUNK_MS): Promise<void> {
  if (!hasTestClock(page)) {
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
    await simAdvance(page, stepMs, stepMs);
    spentMs += stepMs;
  }
}
