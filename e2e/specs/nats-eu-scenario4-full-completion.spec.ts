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
 * nats-eu Scenario 4 "Keys to the Bird" - full completion (phase 16).
 *
 * COMSEC on top of the scenario 3 uplink shift: both keys read, the command key
 * rotated in two steps before the pass, chain up in order, the authenticated
 * command, chain down, then the staged traffic-key mismatch at 14:11 (E3
 * `crypto-key-mismatch`) diagnosed and cleared with the payload re-key control,
 * and the COMSEC log. Sim clock starts 2027-03-15 13:45:00Z; MERIDIAN-SAR-1
 * AOS 14:03:10Z, window 14:03:40Z to 14:10:00Z, LOS 14:10:18Z.
 *
 * The optional SAR-2 proof pass (prove-the-traffic-key) is NOT driven; the log
 * completes without it, which is the optional-objective gate check.
 *
 * Objective flow (16, one optional):
 *  1. review-mission-brief    2. crypto-status-check    3. complete-key-rotation
 *  4. reference-check         5. review-pass-schedule   6. enable-doppler-comp
 *  7. carrier-into-muted-buc  8. unmute-buc             9. enable-hpa
 * 10. track-and-acquire      11. send-authenticated-command
 * 12. secure-the-chain       13. traffic-key-mismatch  14. re-key-traffic
 * 15. prove-the-traffic-key (optional)                 16. log-the-rotation
 */
test.describe('nats-eu Scenario 4 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario4');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reviews the COMSEC brief', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'cannot authenticate it and rejects it');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the COMSEC Brief');
  });

  test('[crypto-status-check] reads the traffic key on both payload panels', async () => {
    await missionControl.selectGroundStation('GW-01');
    for (const tab of ['tx-chain', 'rx-analysis']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await answerSystemQuiz(page, 'The command-link authentication key');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read Both Keys');
  });

  test('[complete-key-rotation] rotates the command key in two steps', async () => {
    await missionControl.selectTab('commanding');
    await expect(page.locator('#cmd-begin-rotation')).toBeVisible({ timeout: 10000 });
    await domClick(page, '#cmd-begin-rotation');
    await page.waitForTimeout(300);
    await domClick(page, '#cmd-complete-rotation');
    await expect(page.locator('#cmd-key-badge')).toHaveText(/Valid/i, { timeout: 5000 });
    await answerSystemQuiz(page, 'The far end must acknowledge');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Complete the Scheduled Key Rotation');
  });

  test('[reference-check] observes the GPSDO and the BUC reference lock', async () => {
    for (const tab of ['gps-timing', 'tx-chain']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference and BUC Lock');
  });

  test('[review-pass-schedule] confirms the command window', async () => {
    await missionControl.selectTab('pass-schedule');
    await answerSystemQuiz(page, '14:03:40 to 14:10:00, with the command key');
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
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Carrier Up, BUC Muted');
  });

  test('[unmute-buc] unmutes the BUC', async () => {
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

  test('[track-and-acquire] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:03:20Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[send-authenticated-command] sends PLD-SAFE under the new key', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:04:30Z');
    await sendCommandAndExpectAck(page, missionControl, 'PLD-SAFE');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Send the Authenticated Command');
  });

  test('[secure-the-chain] brings the chain down in order', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:10:30Z');
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await answerSystemQuiz(page, 'HPA output off, while the BUC');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Secure the Chain');
  });

  test('[traffic-key-mismatch] reads the staged mismatch on the RX payload panel', async () => {
    // The fault fires at 14:11:00 on the mission clock
    await advanceMissionClockToUtc(page, '2027-03-15T14:11:30Z');
    await missionControl.selectTab('rx-analysis');
    await expect(page.locator('#rx-payload-dec-key-status')).toHaveText(/Mismatch/i, { timeout: 15000 });
    await answerSystemQuiz(page, 'Rotterdam rotated the traffic key');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Traffic Key Alarm', 60000);
  });

  test('[re-key-traffic] loads the new traffic key and confirms both directions', async () => {
    await missionControl.selectTab('tx-chain');
    await domClick(page, '#tx-payload-rekey-btn');
    await expect(page.locator('#tx-payload-enc-key-status')).toHaveText(/Valid/i, { timeout: 5000 });
    await page.waitForTimeout(1500);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'The traffic key is symmetric');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Re-key the Payload Crypto', 60000);
  });

  test('[log-the-rotation] closes the COMSEC log without the optional proof pass', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'A key in use accumulates exposure');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete and the optional proof pass stayed open', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });
    await expect(levelCompleteModal.locator('.complete-modal__title')).toContainText('Mission Complete');

    const proof = page.locator('.objective-item', { hasText: 'Prove the Traffic Key on SAR-2' });
    await expect(proof).toHaveCount(1);
    await expect(proof).not.toHaveClass(/completed/);
  });
});
