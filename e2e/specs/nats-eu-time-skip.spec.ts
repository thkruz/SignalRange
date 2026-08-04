import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Operator time skip (settings.timeSkip) on nats-eu Scenario 7.
 *
 * Exercises the control end to end in the real app: the header button appears
 * only for a scenario that opted in, it stays disabled while there is nothing
 * to skip, and confirming the dialog fast-forwards BOTH clocks - the scenario
 * clock the sky is propagated against, and the mission clock every
 * "seconds since mission start" mechanic is keyed to. The two moving together
 * is the thing worth guarding: they were separate quantities before the skip
 * existed, and a scenario whose command window opens at its satellite's AOS
 * breaks silently if only one of them advances.
 *
 * Scenario 7 geometry (2027-03-15 14:00:00 UTC start):
 *   MERIDIAN-SAR-1  AOS T+3.2   LOS T+10.3
 *   MERIDIAN-SAR-2  AOS T+18.7  LOS T+26.9
 *   next SAR-1 pass ~T+95
 * So the spec advances to T+30 - past both first passes - which is exactly the
 * dead hour the control exists for.
 */

const SKIP_BUTTON = '#time-skip-control';
const SKIP_CONFIRM = '#time-skip-confirm-btn';
const SKIP_OVERLAY = '#time-skip-overlay';

/** Jump the scenario clock forward (sim minutes) via the dev hook. */
async function advanceSimClock(page: Page, minutes: number): Promise<void> {
  await page.waitForFunction(() => typeof (window as any).advanceSimClock === 'function');
  await page.evaluate((ms) => (window as any).advanceSimClock(ms), minutes * 60_000);
  await page.waitForTimeout(1500);
}

/** Scenario-clock time in ms, via the OpsLogManager dev hook. */
async function simClockMs(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).simClockMs());
}

/** Total time skipped this scenario, in ms, via the OpsLogManager dev hook. */
async function missionSkippedMs(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).missionSkippedMs());
}

test.describe('nats-eu time skip', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario7');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('mounts the control for a scenario that opted in', async () => {
    await expect(page.locator(SKIP_BUTTON)).toBeVisible({ timeout: 15000 });
  });

  test('stays disabled while the scenario clock is frozen for the brief', async () => {
    // The first objective freezes the clock. Skipping a paused scenario would
    // run the sky forward while the mission stands still.
    await expect(page.locator(SKIP_BUTTON)).toBeDisabled();
    await expect(page.locator(SKIP_BUTTON)).toHaveAttribute('title', /paused/i);
  });

  test('unfreezing the clock does not on its own offer a skip', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    // Answer by text, not by position - the options are presented in a
    // scenario-defined order that a wrong pick would leave the objective on.
    await waitForQuizToAppear(page);
    await page.locator('.quiz-option-btn', { hasText: 'Pass predictions and program-track pointing' }).click();
    await page.locator('#quiz-continue-btn').click();
    await dismissDialogIfPresent(page);

    // SAR-1 rises ~3 min in, which is inside the scenario's 5 min minSkipS
    // floor: short waits are part of the job.
    await expect(page.locator(SKIP_BUTTON)).toBeDisabled({ timeout: 15000 });
  });

  test('offers the skip once the sky is empty', async () => {
    await advanceSimClock(page, 30);

    await expect(page.locator(SKIP_BUTTON)).toBeEnabled({ timeout: 15000 });
    await expect(page.locator(SKIP_BUTTON)).toContainText(/Skip \d/);
  });

  test('fast-forwards both clocks to just before the next AOS', async () => {
    const beforeSimMs = await simClockMs(page);
    const beforeSkippedMs = await missionSkippedMs(page);

    await page.locator(SKIP_BUTTON).click();
    await expect(page.locator(SKIP_CONFIRM)).toBeVisible({ timeout: 10000 });
    await page.locator(SKIP_CONFIRM).click();

    // The overlay is the operator's evidence that time is being consumed, not
    // that the app has hung.
    await expect(page.locator(SKIP_OVERLAY)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(SKIP_OVERLAY)).toBeHidden({ timeout: 20000 });

    const afterSimMs = await simClockMs(page);
    const afterSkippedMs = await missionSkippedMs(page);
    const scenarioClockDeltaMs = afterSimMs - beforeSimMs;
    const missionClockDeltaMs = afterSkippedMs - beforeSkippedMs;

    // The next SAR-1 pass is ~65 min out from T+30.
    expect(scenarioClockDeltaMs).toBeGreaterThan(30 * 60_000);

    // Both clocks advanced together (a few seconds of real time also elapses
    // during the animation, so this is a tolerance, not an equality).
    expect(Math.abs(scenarioClockDeltaMs - missionClockDeltaMs)).toBeLessThan(15_000);
  });

  test('goes back to disabled once the skip has been taken', async () => {
    // The clock now sits inside the lead-in to the pass it skipped to, so
    // there is nothing left to skip.
    await expect(page.locator(SKIP_BUTTON)).toBeDisabled({ timeout: 15000 });
  });
});
