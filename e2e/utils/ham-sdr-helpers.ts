import { expect, Locator, Page } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForQuizToAppear } from './simulation-helpers';
import { advanceUntil, hasTestClock, simAdvance } from './test-clock';

/**
 * Shared helpers for the ham-sdr (Campaign 3) full-completion specs.
 *
 * The backyard stations expose only the SDR Console + Observations tabs, so
 * everything an operator does - tuning, rotator, polarization, AFC - happens
 * through the SkyWatcher console selectors here.
 *
 * Timing rule: objective maintain windows (maintainDuration) tick on
 * simulation steps, not skipped time. advanceClock may be used to reach a
 * pass, but never inside a maintain window - a jump leaps the Doppler, drops
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

/**
 * Skip the scenario clock forward (minutes) and let the sim settle. One clock
 * since Phase 19.0: the sky and every mission-elapsed schedule (gnssThreat
 * spoof windows, interference envelopes) move together. Objective
 * maintainDuration windows run on simulation steps and are not skipped.
 */
export async function advanceClock(page: Page, minutes: number): Promise<void> {
  await page.waitForFunction(() => typeof (window as any).advanceClock === 'function');
  await page.evaluate((ms) => (window as any).advanceClock(ms), minutes * 60_000);
  await simAdvance(page, 3000);
}

/**
 * Skip the scenario clock forward to an absolute scenario UTC time (no-op if
 * already past it). Removes the guesswork of chaining relative jumps across tests
 * whose real-time duration varies (ride loops, quiz timing).
 */
export async function advanceMissionClockToUtc(page: Page, targetIsoUtc: string): Promise<void> {
  await page.waitForFunction(() => typeof (window as any).advanceClock === 'function' && typeof (window as any).simClockMs === 'function');
  await page.evaluate((targetMs) => {
    const deltaMs = targetMs - (window as any).simClockMs();
    if (deltaMs > 0) (window as any).advanceClock(deltaMs);
  }, Date.parse(targetIsoUtc));
  await simAdvance(page, 2500);
}

/** True when the bench HUD replaces the station computer's chrome (no tab bar, no sidebar, no command bar) */
export async function isMinimalHud(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('mc-minimal-hud'));
}

/** Put down whatever is held fullscreen (the logbook, the laptop, a close-up) */
export async function putDownHeld(page: Page): Promise<void> {
  const held = page.locator('.immersive-view[open] .immersive-leave');
  for (let i = 0; i < 3 && (await held.last().isVisible()); i++) await held.last().click();
}

/**
 * Campaign 3 bench HUD (phase 44): the mission papers are pages of the logbook beside the bench. Pick the
 * logbook up from the kit tray and turn to the paper (it opens in its own window and the logbook is put down).
 */
export async function openLogbookMission(page: Page, mission: 'brief' | 'checklist' | 'dialog-history' | 'ops-log' | 'working-doc' | 'campaign-record'): Promise<void> {
  await putDownHeld(page);
  await page.locator('[data-field-kit="logbook"]').click();
  const leaf = page.locator(`.field-kit-sheets [data-field-mission="${mission}"]`);
  if (await leaf.isVisible().catch(() => false)) await leaf.click();
}

/** Open the objectives checklist: the sidebar button, or the logbook's checklist page under the bench HUD */
async function ensureChecklist(missionControl: MissionControlPage): Promise<void> {
  if (await missionControl.objectivesChecklist.isVisible().catch(() => false)) return;
  const page = missionControl.objectivesChecklist.page();
  if (await isMinimalHud(page)) {
    await openLogbookMission(page, 'checklist');
    await expect(missionControl.objectivesChecklist).toBeVisible();

    return;
  }
  await missionControl.openChecklist();
}

/** The checklist `.objective-item` whose title matches, regardless of collapse. */
export function objectiveItem(missionControl: MissionControlPage, title: string): Locator {
  return missionControl.objectivesChecklist.locator('.objective-item', { hasText: title });
}

/** Poll the checklist until the named objective carries the `completed` class. */
export async function waitForObjectiveComplete(missionControl: MissionControlPage, title: string, timeout = 45000): Promise<void> {
  await ensureChecklist(missionControl);
  try {
    const page = missionControl.objectivesChecklist.page();
    if (hasTestClock(page)) {
      // Fast-forward page time until the row completes; the expect below then passes at once.
      // evaluateAll, not getAttribute: a title can match more than one row (strict mode would throw)
      const row = objectiveItem(missionControl, title);
      await advanceUntil(page, () => row.evaluateAll((els) => els.some((el) => el.classList.contains('completed'))).catch(() => false), {
        maxMs: timeout,
        message: `'${title}' completed`,
      }).catch(() => undefined);
    }
    await expect(objectiveItem(missionControl, title)).toHaveClass(/completed/, { timeout });
  } catch (error) {
    // Name the rows still open: "not completed" alone cannot tell a stuck
    // action from a requiresChange row or an off-screen signal
    const open = await objectiveItem(missionControl, title)
      .locator('.condition-item.incomplete .condition-text')
      .allInnerTexts()
      .catch(() => [] as string[]);
    throw new Error(`'${title}' not completed; open rows: ${open.join(' | ') || '(none shown)'}
${String(error)}`);
  }
}

/** Read the SDR console carrier-offset readout ("+4300 Hz"), NaN when idle. */
export async function readOffsetHz(page: Page): Promise<number> {
  const text = (await page.locator('#sdr-offset-readout').textContent()) ?? '';
  return parseInt(text.replace(/[^\d+-]/gu, ''), 10);
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
  opts: { maxMs?: number; correct?: boolean } = {}
): Promise<boolean> {
  const { maxMs = 220_000, correct = true } = opts;
  await ensureChecklist(missionControl);

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
    await simAdvance(page, 4000);
  }
  return everLocked;
}
