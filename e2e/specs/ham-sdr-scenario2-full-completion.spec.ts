import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceSimClock,
  answerRileyQuiz,
  engageTrack,
  rideUntilObjectiveComplete,
  waitForObjectiveComplete,
} from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ham-sdr Scenario 2 "The Slippery Bird" - full completion.
 *
 * This is also the campaign's live yagi verification (phase-1 retro debt): the
 * CUBEHOP-1 leg - program-track on the crossed yagi, 435.25 MHz FM downlink,
 * manual Doppler chase - had only ever been unit-tested before this spec.
 *
 * Pass geometry (start 2027-06-19 16:14 UTC): AOS T+4.0 min, max el 48.2 deg
 * at T+10.2, LOS T+16.5 (locked by test/campaigns/ham-sdr.test.ts).
 *
 * The chase objective holds the lock 120 REAL seconds with AFC off, flown by
 * polling the offset readout and clicking the tune buttons like an operator.
 */
test.describe('ham-sdr Scenario 2 Full Completion (live yagi leg)', () => {
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

    await missionControl.gotoScenario('ham-sdr', 'ham-sdr-scenario2');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(300000);
  });

  test('[review-mission-brief] reads the note and answers the Doppler quiz', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerRileyQuiz(page, 'Starts ~10 kHz HIGH');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, "Read Riley's Note");
  });

  test('[track-cubehop] tracks CUBEHOP-1 from the SDR console rotator panel', async () => {
    await missionControl.selectGroundStation('BKYD-YAGI');
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    // Jump close to AOS (T+4.0) - real time has already burned ~1 min
    await advanceSimClock(page, 2.5);
    await engageTrack(page, '63002');

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Put the Yagi on the Bird', 120000);
  });

  test('[chase-by-hand] holds the lock 120 s by hand through the drift', async () => {
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    const everLocked = await rideUntilObjectiveComplete(page, missionControl, 'Ride the VFO');

    expect(everLocked).toBe(true);
    await waitForObjectiveComplete(missionControl, 'Ride the VFO', 30000);
  });

  test('[slippery-log] answers the closest-approach quiz and completes the mission', async () => {
    await answerRileyQuiz(page, 'the range rate passes through zero');
    await missionControl.dismissDialogIfPresent();

    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    const modalTitle = page.locator('#level-complete-modal .complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');
  });
});
