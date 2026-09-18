import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerSystemQuiz,
  assignContact,
  closeWorkingDocumentIfOpen,
  computeLinkBudget,
  fillAndChange,
  parkAntenna,
  programTrack,
  setRxModemFrequency,
} from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 13 "The Numbers Don't Lie" - full completion (phase 16).
 *
 * The 89 deg zenith pass flown and ridden through the keyhole (lock lost at
 * the top, held 100 s on the descending leg), the survey budget computed and
 * SAR-1 measured 4 dB short at the survey geometry on a degraded LNB, the
 * ephemeris and pointing ruled out, the LNB read, Shetland proven clean, the
 * customer's SAR-3 collect reallocated there and flown FROM SH-02, and the
 * trend report filed. Sim clock starts 2027-03-29 13:00:00Z:
 *   GW-01 MERIDIAN-SAR-2  AOS 13:12:00Z  max el 89.5 at 13:16:56Z  LOS 13:21:56Z
 *   GW-01 MERIDIAN-SAR-1  AOS 13:30:01Z  max el 28.0 at 13:34:46Z  LOS 13:39:30Z
 *   SH-02 MERIDIAN-SAR-3  AOS 13:52:00Z  max el 31.9 at 13:56:46Z  LOS 14:01:35Z
 *
 * The keyhole hold counts real seconds of continuous receiver lock, so that
 * step waits ~2 min of wall time after the jump past culmination.
 *
 * Objective flow (17):
 *  1. review-mission-brief         2. galway-pre-pass-sweep      3. tune-for-the-zenith-pass
 *  4. preposition-for-sar2         5. fly-the-zenith-pass        6. ride-through-the-keyhole
 *  7. record-anomaly-1             8. retune-for-the-survey-pass 9. compute-the-survey-budget
 * 10. measure-sar1-at-galway      11. rule-out-the-ephemeris   12. read-the-galway-lnb
 * 13. prove-shetland-is-clean     14. reallocate-the-collect   15. arm-shetland-for-sar3
 * 16. fly-the-collect-from-shetland 17. file-the-trend-report
 */
test.describe('nats-eu Scenario 13 Full Completion', () => {
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

    // Direct navigation bypasses the nats-eu-scenario12 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario13');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test("[review-mission-brief] reads the week's log", async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'You do not know yet');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, "Read the Week's Log");
  });

  test('[galway-pre-pass-sweep] sweeps the Galway board, reference and LNB LO', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(2500);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Pre-Pass Sweep');
  });

  test('[tune-for-the-zenith-pass] tunes for SAR-2 and predicts the keyhole', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1370');
    await fillAndChange(page, '#sa-span', '2');
    await answerSystemQuiz(page, 'Swing almost 180 degrees');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Tune for the Zenith Pass');
  });

  test('[preposition-for-sar2] parks the tracker on the AOS azimuth', async () => {
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 163, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for SAR-2');
  });

  test('[fly-the-zenith-pass] program-tracks SAR-2 and locks on the ascending leg', async () => {
    await advanceMissionClockToUtc(page, '2027-03-29T13:12:30Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-29T13:15:50Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Fly the Zenith Pass', 60000);
  });

  test('[ride-through-the-keyhole] loses the bird at the top and holds lock 100 s on the way down', async () => {
    test.setTimeout(240000);
    await missionControl.selectTab('rx-analysis');
    await answerSystemQuiz(page, 'The azimuth keyhole');
    await dismissDialogIfPresent(page);
    // Past culmination: the pedestal swings ~180 deg of azimuth, drops lock,
    // re-locks on the descending leg, and the 100 s hold runs on real time.
    await advanceMissionClockToUtc(page, '2027-03-29T13:17:15Z');
    await missionControl.selectTab('rx-analysis');
    await waitForObjectiveComplete(missionControl, 'Ride Through the Keyhole', 200000);
  });

  test('[record-anomaly-1] writes the keyhole into the report as an operations note', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'An operations note to the planners');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Record the First Anomaly');
  });

  test('[retune-for-the-survey-pass] retunes the receiver and analyzer for SAR-1', async () => {
    await advanceMissionClockToUtc(page, '2027-03-29T13:22:30Z');
    await closeWorkingDocumentIfOpen(page);
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1389');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Retune for the Survey Pass');
  });

  test('[compute-the-survey-budget] enters the survey worksheet', async () => {
    await computeLinkBudget(page, missionControl, { eirpDbm: 28, fsplDb: 171.4, rxGainDbi: 51.8, noiseTempK: 88, bandwidthMHz: 36, miscLossDb: 1 });
    await answerSystemQuiz(page, 'The survey number');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Compute the Survey Budget');
  });

  test('[measure-sar1-at-galway] measures SAR-1 four dB short at the survey geometry', async () => {
    await advanceMissionClockToUtc(page, '2027-03-29T13:30:30Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-29T13:34:00Z');
    await answerSystemQuiz(page, '1 dB over the 6 dB threshold');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Measure SAR-1 at Galway', 60000);
  });

  test('[rule-out-the-ephemeris] reads the ephemeris panel and names the remaining candidate', async () => {
    await missionControl.selectTab('pass-schedule');
    await answerSystemQuiz(page, 'The receive chain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Rule Out the Ephemeris');
  });

  test('[read-the-galway-lnb] reads the LNB and records the second anomaly', async () => {
    await missionControl.selectTab('rx-analysis');
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'The LNA is the first stage');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Galway LNB');
  });

  test('[prove-shetland-is-clean] reads the Shetland LNB and reference', async () => {
    await closeWorkingDocumentIfOpen(page);
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(2500);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Prove Shetland Is Clean');
  });

  test('[reallocate-the-collect] moves the SAR-3 collect to Shetland', async () => {
    await missionControl.selectTab('contact-schedule');
    await assignContact(page, 'T-SAR3-SH', 'SH-02');
    await expect(page.locator('#cs-plan-badge')).toHaveText('DECONFLICTED');
    await answerSystemQuiz(page, 'Derate GW-01 by 4 dB');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reallocate the Collect');
  });

  test('[arm-shetland-for-sar3] tunes Shetland to the SAR-3 plan and parks it', async () => {
    await setRxModemFrequency(page, missionControl, 1340);
    await fillAndChange(page, '#sa-center-freq', '1315');
    await fillAndChange(page, '#sa-span', '2');
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 139, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Arm Shetland for SAR-3');
  });

  test('[fly-the-collect-from-shetland] decodes SAR-3 from the SH-02 console', async () => {
    await advanceMissionClockToUtc(page, '2027-03-29T13:52:30Z');
    await programTrack(page, missionControl, '61703');
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-29T13:55:30Z');
    await answerSystemQuiz(page, 'No: 20 log(762 / 694)');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Fly the Collect from Shetland', 60000);
  });

  test('[file-the-trend-report] files the recommendation and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Rotterdam: the keyhole is an operations note');
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
