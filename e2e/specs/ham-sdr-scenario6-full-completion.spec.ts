import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceMissionClock,
  answerRileyQuiz,
  domClick,
  engageTrack,
  rideUntilObjectiveComplete,
  waitForObjectiveComplete,
} from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ham-sdr Scenario 6 "The Network Wants Vermont" - full completion.
 *
 * Tampered-TLE arc: catch the WXSAT-19 pass (network request #1), discover
 * the CUBEHOP-1 element file is bad (the network's 16:59 window is missing
 * from Observations, and the E3 panel flags TLE SUSPECT), fetch fresh
 * elements, and catch the recovered 16:59 pass (request #2). The scenario's
 * CUBEHOP is tampered at load via spaceEvents[].initialTle (RAAN +60 deg -
 * empty sky all afternoon) and restored by the panel's fetch button.
 *
 * Both jumps use advanceMissionClock (sim + mission clocks together): the
 * WXSAT pass starts at T+10 min and the CUBEHOP pass at T+2:19.
 */
test.describe('ham-sdr Scenario 6 Full Completion', () => {
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

    await missionControl.gotoScenario('ham-sdr', 'ham-sdr-scenario6');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(300000);
  });

  test('[review-mission-brief] reads the request sheet and answers the supply-chain quiz', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerRileyQuiz(page, 'volunteer mirror site');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Read the Observation Requests');
  });

  test('[catch-wxsat] locks the 14:50 weather pass on the QFH', async () => {
    // Jump to just inside the WXSAT pass (AOS T+10 min)
    await advanceMissionClock(page, 12);

    await missionControl.selectGroundStation('BKYD-QFH');
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Network Request #1: WXSAT-19', 90000);
  });

  test('[spot-the-discrepancy] Observations disagree with the request sheet (E3 reskin)', async () => {
    await missionControl.selectGroundStation('BKYD-YAGI');
    await missionControl.selectTab('pass-schedule');
    await missionControl.dismissDialogIfPresent();

    // E3 amateur-voice reskin assertions
    await expect(page.locator('.pass-schedule-title')).toContainText('Observations');
    await expect(page.locator('.ephemeris-badge-stale')).toContainText('TLE SUSPECT', { timeout: 15000 });
    await expect(page.locator('.btn-ephemeris')).toContainText('Fetch Fresh Elements');

    await answerRileyQuiz(page, 'stale or tampered');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Two Sources, One Sky');
  });

  test('[fetch-elements] fetches fresh elements from the panel', async () => {
    await domClick(page, '[data-ephemeris-event="CUBEHOP-TLE"]');

    // The corrected prediction appears in the pass table
    await expect(page.locator('.ephemeris-badge-updated')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#pass-schedule-rows')).toContainText('CUBEHOP-1', { timeout: 15000 });

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Fetch Fresh Elements');
  });

  test('[catch-cubehop] tracks and locks the recovered 16:59 pass', async () => {
    // From ~T+13 min to just before the 16:59 AOS (T+139 min)
    await advanceMissionClock(page, 125);

    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    await engageTrack(page, '63002');
    // AFC is earned by now - let the loop chase the UHF Doppler
    await domClick(page, '#sdr-afc-toggle');

    const everLocked = await rideUntilObjectiveComplete(
      page,
      missionControl,
      'Network Request #2: CUBEHOP-1',
      { maxMs: 300_000, correct: true },
    );
    expect(everLocked).toBe(true);
  });

  test('[supply-chain-log] logs the cross-check habit and completes the mission', async () => {
    await answerRileyQuiz(page, 'refusing to explain the disagreement away');
    await missionControl.dismissDialogIfPresent();

    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    const modalTitle = page.locator('#level-complete-modal .complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');
  });
});
