import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, commitLinkWithMargin, computeLinkBudget, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 2 "Proving the Link" - full completion (phase 16).
 *
 * Acceptance shift: uplink confirmed cold, reference and LNB checked, survey
 * inputs read off the rack, worksheet computed, path loss checked at the mask,
 * then the SAR-1 pass measured on the rising leg, at culmination (Commit Link)
 * and on the setting leg, the card filled in, and the SAR-2 regression set up.
 * Sim clock starts 2027-03-15 13:45:00Z:
 *   MERIDIAN-SAR-1  AOS 14:03:10Z  max el 28.0 at 14:06:45Z  LOS 14:10:18Z
 *   Settled C/N: el 15 deg ~7.2 dB, culmination 10.9 dB (harness numbers).
 *
 * The optional regression pass (regression-sar2) is deliberately NOT driven:
 * the card completes without it, which is the optional-objective gate check.
 *
 * Objective flow (16, one optional):
 *  1. review-mission-brief  2. tx-cold-check        3. reference-and-lnb
 *  4. read-the-rack         5. open-link-analysis   6. compute-link-budget
 *  7. path-loss-check       8. review-pass-schedule 9. track-for-acceptance
 * 10. rising-leg           11. commit-the-link     12. setting-leg
 * 13. record-measurements  14. set-up-regression   15. regression-sar2 (optional)
 * 16. sign-the-test-card
 */
test.describe('nats-eu Scenario 2 Full Completion', () => {
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
    // Direct navigation bypasses the nats-eu-scenario1 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario2');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reviews the test card', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'The prediction');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Test Card');
  });

  test('[tx-cold-check] confirms the HPA disabled and BUC muted', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('tx-chain');
    await answerSystemQuiz(page, 'breaks flight rules');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Confirm the Uplink is Cold');
  });

  test('[reference-and-lnb] observes the GPSDO and LNB', async () => {
    for (const tab of ['gps-timing', 'rx-analysis']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference and LNB Check');
  });

  test('[read-the-rack] reads the LNB gain and accounts for Tsys', async () => {
    await missionControl.selectTab('rx-analysis');
    await answerSystemQuiz(page, 'Sky and atmosphere at 28 degrees');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Survey Inputs Off the Rack');
  });

  test('[open-link-analysis] opens the worksheet', async () => {
    await missionControl.selectTab('link-budget');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Open the Link Analysis Console');
  });

  test('[compute-link-budget] predicts the downlink C/N', async () => {
    await computeLinkBudget(page, missionControl, { eirpDbm: 28, fsplDb: 171.4, rxGainDbi: 51.8, noiseTempK: 88, bandwidthMHz: 36, miscLossDb: 1 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Predict the Downlink C/N');
  });

  test('[path-loss-check] works the path loss at the mask', async () => {
    await answerSystemQuiz(page, '180.9 dB');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Check the Path Loss at the Mask');
  });

  test('[review-pass-schedule] confirms culmination as the measurement point', async () => {
    await missionControl.selectTab('pass-schedule');
    await answerSystemQuiz(page, '14:06:45, 28 degrees');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Confirm the Measurement Point');
  });

  test('[track-for-acceptance] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:03:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Track MERIDIAN-SAR-1', 60000);
  });

  test('[rising-leg] reads C/N on the way up', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:04:50Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Measure on the Rising Leg', 60000);
  });

  test('[commit-the-link] commits the link at culmination with margin', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:06:20Z');
    await page.waitForTimeout(2500); // receiver-signal-locked latches on RX analysis
    await commitLinkWithMargin(page, missionControl, 9.5);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Measure and Commit the Link', 60000);
  });

  test('[setting-leg] reads C/N on the way down', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:08:40Z');
    await answerSystemQuiz(page, 'Same elevation, same slant range');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Measure on the Setting Leg', 60000);
  });

  test('[record-measurements] fills in the measurement section', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:10:30Z');
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Predicted 11.0 dB; measured 10.9 dB');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Record the Measurements');
  });

  test('[set-up-regression] retunes for SAR-2', async () => {
    await closeWorkingDocumentIfOpen(page);
    await setRxModemFrequency(page, missionControl, 1370);
    await answerSystemQuiz(page, 'A second bird on a second geometry');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Regression Run');
  });

  test('[sign-the-test-card] signs the card and completes without the optional regression', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'proves the station is performing as designed');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete and the optional regression stayed open', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });
    await expect(levelCompleteModal.locator('.complete-modal__title')).toContainText('Mission Complete');

    const regression = page.locator('.objective-item', { hasText: 'Regression: MERIDIAN-SAR-2' });
    await expect(regression).toHaveCount(1);
    await expect(regression).not.toHaveClass(/completed/);
    await expect(regression).toContainText('Optional');
  });
});
