import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceSimClock,
  answerRileyQuiz,
  domClick,
  engageTrack,
  rideUntilObjectiveComplete,
  waitForObjectiveComplete,
} from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ham-sdr Scenario 4 "Set and Forget" - full completion.
 *
 * The AFC A/B in one pass: fly the first half by hand (90 s manual maintain
 * with receiver-afc-enabled { afcEnabled: false }), flip #sdr-afc-toggle, then
 * hands OFF while the loop flies the outbound drift (120 s maintain with lock,
 * C/N >= 10 and AFC on - the ride helper runs with correct: false to prove no
 * human tuning is involved).
 *
 * Pass geometry (start 2027-06-21 16:34 UTC): AOS T+4.8 min, max el 83.1 deg
 * at T+11.2, LOS T+17.5 (locked by test/campaigns/ham-sdr.test.ts).
 */
test.describe('ham-sdr Scenario 4 Full Completion (AFC discovery)', () => {
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

    await missionControl.gotoScenario('ham-sdr', 'ham-sdr-scenario4');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(300000);
  });

  test('[review-mission-brief] reads the note and answers the AFC quiz', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerRileyQuiz(page, "offset from the center of the channel");
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, "Read Riley's Note");
  });

  test('[track-cubehop] tracks the overhead pass', async () => {
    await missionControl.selectGroundStation('BKYD-YAGI');
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    await advanceSimClock(page, 3.5);
    await engageTrack(page, '63002');

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Track the Overhead Pass', 120000);
  });

  test('[manual-first-half] flies 90 s by hand with AFC off', async () => {
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    // AFC must be off (fresh modem: unchecked). The maintain window is real
    // time, so ride the inbound drift with the tune buttons.
    await expect(page.locator('#sdr-afc-toggle')).not.toBeChecked();

    const everLocked = await rideUntilObjectiveComplete(page, missionControl, 'Fly the First Half by Hand');

    expect(everLocked).toBe(true);
    await waitForObjectiveComplete(missionControl, 'Fly the First Half by Hand', 30000);
  });

  test('[engage-afc] takes the tape off the checkbox', async () => {
    await domClick(page, '#sdr-afc-toggle');
    await expect(page.locator('#sdr-afc-toggle')).toBeChecked();
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Take the Tape Off', 30000);
  });

  test('[hands-off] the loop holds lock and C/N for 120 s untouched', async () => {
    // correct: false - the whole point is that no human tuning happens
    const everLocked = await rideUntilObjectiveComplete(page, missionControl, 'Hands Off the Dial', {
      maxMs: 220_000,
      correct: false,
    });

    expect(everLocked).toBe(true);
    await waitForObjectiveComplete(missionControl, 'Hands Off the Dial', 30000);
  });

  test('[graduation-log] answers the AFC-limits quiz and completes the mission', async () => {
    await answerRileyQuiz(page, 'carrier disappears from the passband');
    await missionControl.dismissDialogIfPresent();

    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    const modalTitle = page.locator('#level-complete-modal .complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');
  });
});
