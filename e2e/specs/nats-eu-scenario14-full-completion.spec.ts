import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, assignContact, closeWorkingDocumentIfOpen, fillAndChange, parkAntenna, programTrack, setRxModemFrequency, setSwitch } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 14 "Atlantic Low" - full completion (phase 16).
 *
 * Real Ku rain fade on Galway for the priority collect: the fade read on the
 * board, the collect reallocated to Shetland and flown FROM SH-02, Galway
 * armed to watch its own pass drown (C/N at or below 5 dB in 30 mm/h), the
 * feed heater on before the front turns to sleet, the P2 window kept at
 * Galway on measured margin and ridden out on a clean feed.
 * Sim clock starts 2027-04-02 11:00:00Z:
 *   rain at GW-01 11:01 - 11:26 (30 mm/h), sleet 11:26 - 12:11
 *   SH-02 MERIDIAN-SAR-2  AOS 11:10:42Z  max el 34.1 at 11:15:35Z  LOS 11:20:25Z
 *   GW-01 MERIDIAN-SAR-2  AOS 11:12:53Z  max el 19.1 at 11:17:30Z  LOS 11:22:03Z
 *   GW-01 MERIDIAN-SAR-1  AOS 11:44:59Z  max el 29.6 at 11:49:43Z  LOS 11:54:31Z
 *
 * The rain rate runs on the mission clock (advanceMissionClockToUtc), so the
 * fade is present after the jump; ice accumulates on real frames and the
 * heater is on before the sleet, so the ride-out sees a clean feed.
 *
 * Objective flow (17):
 *  1. review-mission-brief          2. read-the-fade-on-the-board    3. galway-cold-chain
 *  4. reallocate-the-collect        5. arm-galway-to-watch-the-fade  6. shetland-weather-sweep
 *  7. preposition-shetland-for-sar2 8. acquire-sar2-from-shetland    9. decode-the-collect-from-shetland
 * 10. observe-the-galway-fade      11. log-the-collect              12. protect-the-feed
 * 13. decide-the-ride-out          14. retune-galway-for-sar1       15. ride-it-out
 * 16. log-the-ride-out             17. close-the-weather-log
 */
test.describe('nats-eu Scenario 14 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  /** Enable the feed heater on the selected station's ACU tab (per-instance id suffix). */
  async function enableFeedHeater(): Promise<void> {
    await missionControl.selectTab('acu-control');
    const heater = page.locator('input[id$="heater-switch"]:visible').first();
    await expect(heater).toBeVisible({ timeout: 10000 });
    if (!(await heater.isChecked())) {
      await heater.evaluate((el) => (el as HTMLElement).click());
    }
    await expect(heater).toBeChecked();
  }

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);

    // Direct navigation bypasses the nats-eu-scenario13 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario14');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the weather brief and the fade magnitude', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'Several dB - about 7');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Weather Brief');
  });

  test('[read-the-fade-on-the-board] reads the rain fade and rules out the heater for rain', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'No. Rain attenuation is in the air');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Fade on the Board');
  });

  test('[galway-cold-chain] confirms the reference and puts the transmit chain cold', async () => {
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(2500);
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(1500);
    await setSwitch(page, '#buc-mute', true);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Cold Chain');
  });

  test('[reallocate-the-collect] gives the collect to Shetland and validates the plan', async () => {
    await missionControl.selectTab('contact-schedule');
    await assignContact(page, 'W-SAR2-SH', 'SH-02');
    await assignContact(page, 'W-SAR2-GW', 'GW-01');
    await assignContact(page, 'W-SAR1-GW', 'GW-01');
    await assignContact(page, 'W-SAR1-SH', 'SH-02');
    await expect(page.locator('#cs-plan-badge')).toHaveText('DECONFLICTED');
    await answerSystemQuiz(page, 'A P1 collect gets the site that can close it');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reallocate the Collect');
  });

  test('[arm-galway-to-watch-the-fade] retunes Galway and arms program-track on SAR-2', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await programTrack(page, missionControl, '61702');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Arm Galway to Watch the Fade');
  });

  test('[shetland-weather-sweep] sweeps SH-02 and tunes it for SAR-2', async () => {
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(2500);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1370');
    await fillAndChange(page, '#sa-span', '2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'SH-02 Weather Sweep');
  });

  test('[preposition-shetland-for-sar2] parks the Shetland tracker on the AOS azimuth', async () => {
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 23, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position Shetland for SAR-2');
  });

  test('[acquire-sar2-from-shetland] program-tracks SAR-2 on the SH-02 pedestal', async () => {
    await advanceMissionClockToUtc(page, '2027-04-02T11:12:00Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-2 from Shetland', 60000);
  });

  test('[decode-the-collect-from-shetland] decodes the collect in dry sky', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-02T11:14:00Z');
    await answerSystemQuiz(page, 'That the collect is captured');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Collect from Shetland', 60000);
  });

  test('[observe-the-galway-fade] reads the rain-faded C/N on the armed Galway pass', async () => {
    await advanceMissionClockToUtc(page, '2027-04-02T11:17:00Z');
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('rx-analysis');
    await answerSystemQuiz(page, 'Rain: about 7 dB of attenuation');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Observe the Galway Fade', 60000);
  });

  test('[log-the-collect] logs the collect and the measurement', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'faded to about 2 dB');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Log the Collect');
  });

  test('[protect-the-feed] turns the Galway feed heater on before the sleet', async () => {
    await advanceMissionClockToUtc(page, '2027-04-02T11:23:00Z');
    await enableFeedHeater();
    await answerSystemQuiz(page, 'On before the sleet');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Protect the Feed');
  });

  test('[decide-the-ride-out] keeps the P2 window at Galway', async () => {
    await answerSystemQuiz(page, 'Keep it at Galway');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decide the Ride-Out');
  });

  test('[retune-galway-for-sar1] retunes Galway for the ride-out', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1389');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Retune Galway for SAR-1');
  });

  test('[ride-it-out] decodes SAR-1 through the sleet on a clean feed', async () => {
    await advanceMissionClockToUtc(page, '2027-04-02T11:45:30Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-02T11:48:00Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Ride It Out', 60000);
  });

  test('[log-the-ride-out] logs the ride-out with the feed loss it avoided', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Decoded at ~11 dB on zero feed loss');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Log the Ride-Out');
  });

  test('[close-the-weather-log] writes the standing rule and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Heater on at the first precipitation warning');
    await dismissDialogIfPresent(page);

    // The FINAL objective is asserted through the Mission Complete modal, not
    // the checklist: the checklist stops repainting when the completion flow
    // takes over, so its last row never shows the completed class.
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });

    const modalTitle = levelCompleteModal.locator('.complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');

    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();
    const score = parseInt((await totalScore.textContent()) || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});
