import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerSystemQuiz,
  closeWorkingDocumentIfOpen,
  disableHpa,
  enableDopplerComp,
  enableHpa,
  programTrack,
  sendCommandAndExpectAck,
  setSwitch,
  setTxModemOnAir,
} from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 3 "Two-Way Street" - full completion (phase 16).
 *
 * First uplink: reference and BUC lock, transmit modem retuned to the 1405 MHz
 * command IF, window confirmed, Doppler compensation engaged, transmit chain up
 * in three ordered steps, acquisition, the command window, the ACK, then the
 * chain down in the mirror order and the log. Sim clock starts
 * 2027-03-15 13:45:00Z; MERIDIAN-SAR-1 AOS 14:03:10Z, window 14:03:40Z to
 * 14:10:00Z, LOS 14:10:18Z.
 *
 * The chain is brought up BEFORE the pass (drive present at every step), so
 * the HPA_NOISE_AMPLIFICATION invariant is never at risk.
 *
 * Objective flow (16):
 *  1. review-mission-brief   2. reference-check       3. tune-tx-modem
 *  4. review-pass-schedule   5. enable-doppler-comp   6. carrier-into-muted-buc
 *  7. unmute-buc             8. enable-hpa            9. track-for-commanding
 * 10. confirm-window-open   11. send-the-command     12. confirm-execution
 * 13. disable-hpa           14. mute-buc             15. carrier-down
 * 16. log-the-window
 */
test.describe('nats-eu Scenario 3 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario3');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reviews the commanding brief', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'Shifts it by hundreds of kilohertz');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Commanding Brief');
  });

  test('[reference-check] observes the GPSDO and the BUC reference lock', async () => {
    await missionControl.selectGroundStation('GW-01');
    for (const tab of ['gps-timing', 'tx-chain']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference and BUC Lock');
  });

  test('[tune-tx-modem] retunes transmit modem 1 to 1405 MHz', async () => {
    await missionControl.selectTab('tx-chain');
    const freq = page.locator('#tx-frequency-input');
    await expect(freq).toBeVisible({ timeout: 10000 });
    await freq.fill('1405');
    await freq.press('Tab');
    await domClick(page, '#tx-apply-btn');
    await answerSystemQuiz(page, '1405 MHz - RF minus LO');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Tune the Transmit Modem to the Command IF');
  });

  test('[review-pass-schedule] confirms the command window', async () => {
    await missionControl.selectTab('pass-schedule');
    await answerSystemQuiz(page, '14:03:40 to 14:10:00');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Confirm the Command Window');
  });

  test('[enable-doppler-comp] engages uplink Doppler compensation', async () => {
    await enableDopplerComp(page, missionControl);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Enable Uplink Doppler Compensation');
  });

  test('[carrier-into-muted-buc] puts the carrier up into the muted BUC', async () => {
    await setTxModemOnAir(page, missionControl);
    await answerSystemQuiz(page, 'So the amplifier always has drive behind it');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Carrier Up, BUC Muted');
  });

  test('[unmute-buc] unmutes the BUC with the carrier behind it', async () => {
    await missionControl.selectTab('tx-chain');
    await setSwitch(page, '#buc-mute', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Unmute the BUC');
  });

  test('[enable-hpa] enables the HPA last', async () => {
    await enableHpa(page, missionControl);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Enable the HPA');
  });

  test('[track-for-commanding] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:03:20Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[confirm-window-open] waits for the window on the TT&C console', async () => {
    await missionControl.selectTab('commanding');
    await answerSystemQuiz(page, 'Out of window - wait for 14:03:40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Wait for the Window');
  });

  test('[send-the-command] sends REC-PLAYBACK and gets the ACK', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:04:30Z');
    await sendCommandAndExpectAck(page, missionControl, 'REC-PLAYBACK');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Send the Playback Command');
  });

  test('[confirm-execution] reads the ACK while still on the bird', async () => {
    await missionControl.selectTab('rx-analysis');
    await answerSystemQuiz(page, 'The spacecraft received and executed it');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Confirm Execution', 60000);
  });

  test('[disable-hpa] brings the HPA down first', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:10:30Z');
    await disableHpa(page, missionControl);
    await answerSystemQuiz(page, 'The HPA. Kill the amplifier');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'HPA Down First');
  });

  test('[mute-buc] mutes the BUC', async () => {
    await missionControl.selectTab('tx-chain');
    await setSwitch(page, '#buc-mute', true);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Silence the BUC');
  });

  test('[carrier-down] takes the modem off air', async () => {
    await missionControl.selectTab('tx-chain');
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Carrier Down');
  });

  test('[log-the-window] logs the window and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'ACK received; chain secured HPA-BUC-carrier');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });
    await expect(levelCompleteModal.locator('.complete-modal__title')).toContainText('Mission Complete');
  });
});
