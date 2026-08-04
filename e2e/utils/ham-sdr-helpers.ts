import { expect, Locator, Page } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForQuizToAppear } from './simulation-helpers';

/**
 * Shared helpers for the ham-sdr (Campaign 3) full-completion specs.
 *
 * The backyard stations expose only the SDR Console + Observations tabs, so
 * everything an operator does - tuning, rotator, polarization, AFC - happens
 * through the SkyWatcher console selectors here.
 *
 * Timing rule: objective maintain windows (maintainDuration) tick on REAL
 * update deltas, not sim time. advanceSimClock may be used to reach a pass,
 * but never inside a maintain window - a sim jump leaps the Doppler, drops
 * the lock, and resets the window.
 */

/** Answer a Riley status-check quiz and dismiss the feedback panel. */
export async function answerRileyQuiz(page: Page, answerText: string): Promise<void> {
  await waitForQuizToAppear(page);

  const option = page.locator('.quiz-option-btn', { hasText: answerText });
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();

  const feedbackContinue = page.locator('#quiz-continue-btn');
  await expect(feedbackContinue).toBeVisible({ timeout: 5000 });
  await feedbackContinue.click();
}

/** Jump the scenario clock forward (sim minutes) and let the sim settle. */
export async function advanceSimClock(page: Page, minutes: number): Promise<void> {
  await page.waitForFunction(() => typeof (window as any).advanceSimClock === 'function');
  await page.evaluate((ms) => (window as any).advanceSimClock(ms), minutes * 60_000);
  await page.waitForTimeout(3000);
}

/**
 * Jump BOTH the scenario clock and the mission clock forward (minutes) - the
 * operator-time-skip invariant. Required to cross mission-elapsed thresholds
 * (gnssThreat spoof windows, interference envelopes) without waiting wall
 * time. Objective maintainDuration windows still tick on REAL time.
 */
export async function advanceMissionClock(page: Page, minutes: number): Promise<void> {
  await page.waitForFunction(() => typeof (window as any).advanceMissionClock === 'function');
  await page.evaluate((ms) => (window as any).advanceMissionClock(ms), minutes * 60_000);
  await page.waitForTimeout(2500);
}

/**
 * Jump BOTH clocks forward to an absolute scenario UTC time (no-op if already
 * past it). Removes the guesswork of chaining relative jumps across tests
 * whose real-time duration varies (ride loops, quiz timing).
 */
export async function advanceMissionClockToUtc(page: Page, targetIsoUtc: string): Promise<void> {
  await page.waitForFunction(() =>
    typeof (window as any).advanceMissionClock === 'function' &&
    typeof (window as any).simClockMs === 'function');
  await page.evaluate((targetMs) => {
    const deltaMs = targetMs - (window as any).simClockMs();
    if (deltaMs > 0) (window as any).advanceMissionClock(deltaMs);
  }, Date.parse(targetIsoUtc));
  await page.waitForTimeout(2500);
}

/** The checklist `.objective-item` whose title matches, regardless of collapse. */
export function objectiveItem(missionControl: MissionControlPage, title: string): Locator {
  return missionControl.objectivesChecklist.locator('.objective-item', { hasText: title });
}

/** Poll the checklist until the named objective carries the `completed` class. */
export async function waitForObjectiveComplete(
  missionControl: MissionControlPage,
  title: string,
  timeout = 45000,
): Promise<void> {
  if (!(await missionControl.objectivesChecklist.isVisible().catch(() => false))) {
    await missionControl.openChecklist();
  }
  await expect(objectiveItem(missionControl, title)).toHaveClass(/completed/, { timeout });
}

/** Read the SDR console carrier-offset readout ("+4300 Hz"), NaN when idle. */
export async function readOffsetHz(page: Page): Promise<number> {
  const text = (await page.locator('#sdr-offset-readout').textContent()) ?? '';
  return parseInt(text.replace(/[^\d+-]/g, ''), 10);
}

/**
 * One operator correction: read the carrier offset and click the tune buttons
 * toward zero (coarse = 10 kHz, fine = 1 kHz). Positive offset = carrier
 * above the VFO = tune up (same sign convention the AFC loop uses).
 */
export async function correctVfo(page: Page): Promise<void> {
  const offsetHz = await readOffsetHz(page);
  if (!Number.isFinite(offsetHz)) return;

  const magnitude = Math.abs(offsetHz);
  const up = offsetHz > 0;
  const clicks: Array<{ id: string; n: number }> = [];
  if (magnitude >= 10_000) {
    clicks.push({ id: up ? '#sdr-tune-up-coarse' : '#sdr-tune-dn-coarse', n: Math.floor(magnitude / 10_000) });
  }
  const fineHz = magnitude % 10_000;
  if (fineHz >= 1_500) {
    clicks.push({ id: up ? '#sdr-tune-up-fine' : '#sdr-tune-dn-fine', n: Math.round(fineHz / 1_000) });
  }
  for (const { id, n } of clicks) {
    for (let i = 0; i < n; i++) {
      // DOM-dispatched click: the draggable checklist box (kept open so the
      // ride loop can poll it) can float over the console and intercept
      // pointer events; the tune buttons only need their click handler run.
      await domClick(page, id);
      await page.waitForTimeout(100);
    }
  }
}

/** Click via DOM dispatch, immune to overlapping draggable boxes. */
export async function domClick(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((el) => (el as HTMLElement).click());
}

/** Select a rotator target by NORAD id and engage TRACK on the SDR console. */
export async function engageTrack(page: Page, noradId: string): Promise<void> {
  const targetSelect = page.locator('#sdr-rot-target');
  await expect(targetSelect).toBeVisible({ timeout: 10000 });
  await targetSelect.selectOption({ value: noradId });
  await page.locator('#sdr-rot-track').check();
}

/**
 * Ride the pass in real time until the named maintain-window objective
 * completes: correct the VFO each cycle, track whether lock was ever seen,
 * and stop as soon as the checklist flips. Returns whether lock was observed.
 */
export async function rideUntilObjectiveComplete(
  page: Page,
  missionControl: MissionControlPage,
  objectiveTitle: string,
  opts: { maxMs?: number; correct?: boolean } = {},
): Promise<boolean> {
  const { maxMs = 220_000, correct = true } = opts;
  if (!(await missionControl.objectivesChecklist.isVisible().catch(() => false))) {
    await missionControl.openChecklist();
  }

  const lockIndicator = page.locator('#sdr-lock-indicator');
  const deadline = Date.now() + maxMs;
  let everLocked = false;
  while (Date.now() < deadline) {
    if (correct) await correctVfo(page);
    const lockText = (await lockIndicator.textContent().catch(() => '')) ?? '';
    everLocked ||= lockText.trim() === 'LOCKED';

    const done = await objectiveItem(missionControl, objectiveTitle)
      .evaluate((el) => el.classList.contains('completed'))
      .catch(() => false);
    if (done) return everLocked;
    await page.waitForTimeout(4000);
  }
  return everLocked;
}
