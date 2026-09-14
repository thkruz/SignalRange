import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerSystemQuiz,
  assignContact,
  closeWorkingDocumentIfOpen,
  disableHpa,
  enableDopplerComp,
  enableHpa,
  fillAndChange,
  parkAntenna,
  programTrack,
  sendCommandAndExpectAck,
  setRxModemFrequency,
  setSwitch,
  setTxModemFrequency,
  setTxModemOnAir,
} from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 15 "Rotation Day" - full completion (phase 16).
 *
 * The fleet key rotation between passes: the order acknowledged in the audit
 * log, the day plan built, SAR-1 received on the retiring key with no
 * commands, the command key rotated on the TT&C console, the fleet traffic
 * key roll (E3, 07:27) found as a Mismatch and followed with the payload
 * re-key, then SAR-2 decoded cold under the new traffic key, the chain up in
 * order, KEY-VERIFY acknowledged under the new command key, and the chain
 * secured. Sim clock starts 2027-04-06 07:00:00Z:
 *   GW-01 MERIDIAN-SAR-1  AOS 07:15:59Z  max el 27.0 at 07:20:47Z  LOS 07:25:31Z
 *   traffic key rolls 07:27:00Z (mission clock)
 *   GW-01 MERIDIAN-SAR-2  AOS 07:33:58Z  max el 24.9 at 07:38:40Z  LOS 07:43:25Z
 *   command window 07:34:18Z - 07:43:05Z
 *
 * Objective flow (18):
 *  1. review-mission-brief         2. acknowledge-the-order        3. build-the-day-plan
 *  4. galway-reference-and-keys    5. tune-for-sar1                6. acquire-sar1
 *  7. receive-on-the-retiring-key  8. log-the-receive-pass         9. rotate-the-command-key
 * 10. read-the-traffic-key        11. re-key-the-payload-crypto   12. tune-for-sar2-and-the-uplink
 * 13. acquire-sar2                14. decode-on-the-new-traffic-key 15. chain-up-for-the-proof
 * 16. prove-the-new-key-on-orbit  17. safe-the-uplink             18. close-the-comsec-record
 */
test.describe('nats-eu Scenario 15 Full Completion', () => {
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

    // Direct navigation bypasses the nats-eu-scenario14 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario15');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the rotation order', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'Any command: a key in rotation');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Rotation Order');
  });

  test('[acknowledge-the-order] signs off the audit trail and flags the order', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-mark-reviewed')).toBeVisible({ timeout: 10000 });
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await domClick(page, 'button[data-event-id="evt-rotation-order"]');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acknowledge the Order');
  });

  test('[build-the-day-plan] allocates four contacts with both Galway halves on GW-01', async () => {
    await missionControl.selectTab('contact-schedule');
    await assignContact(page, 'R-SAR1-SH', 'SH-02');
    await assignContact(page, 'R-SAR1-GW', 'GW-01');
    await assignContact(page, 'R-SAR2-GW', 'GW-01');
    await assignContact(page, 'R-SAR2-SH', 'SH-02');
    await expect(page.locator('#cs-plan-badge')).toHaveText('DECONFLICTED');
    await answerSystemQuiz(page, 'The command originates from the TT&C console');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Build the Day Plan');
  });

  test('[galway-reference-and-keys] reads the reference and both keys before anything moves', async () => {
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(2500);
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(2500);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'The command key authenticates what goes up');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Reference and Keys');
  });

  test('[tune-for-sar1] retunes the receiver and parks on the AOS azimuth', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1389');
    await fillAndChange(page, '#sa-span', '2');
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 22, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Tune for SAR-1');
  });

  test('[acquire-sar1] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-06T07:16:30Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[receive-on-the-retiring-key] decodes on the old key and sends nothing', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-06T07:19:30Z');
    await answerSystemQuiz(page, 'The order retires KEY-2027-Q1');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Receive on the Retiring Key', 60000);
  });

  test('[log-the-receive-pass] writes the retire line', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Last contact on KEY-2027-Q1');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Log the Receive Pass');
  });

  test('[rotate-the-command-key] begins and completes the command key rotation', async () => {
    await missionControl.selectTab('commanding');
    await expect(page.locator('#cmd-begin-rotation')).toBeVisible({ timeout: 10000 });
    await domClick(page, '#cmd-begin-rotation');
    await page.waitForTimeout(300);
    await domClick(page, '#cmd-complete-rotation');
    await expect(page.locator('#cmd-key-badge')).toHaveText(/Valid/i, { timeout: 5000 });
    await answerSystemQuiz(page, 'Been rejected as key-invalid');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Rotate the Command Key');
  });

  test('[read-the-traffic-key] finds the fleet traffic key roll as a Mismatch', async () => {
    // The fleet traffic key rolls at 07:27 on the mission clock
    await advanceMissionClockToUtc(page, '2027-04-06T07:27:30Z');
    await missionControl.selectTab('rx-analysis');
    await expect(page.locator('#rx-payload-dec-key-status').first()).toHaveText(/Mismatch/i, { timeout: 15000 });
    await answerSystemQuiz(page, 'Rotterdam rolled the fleet traffic key');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Traffic Key', 60000);
  });

  test('[re-key-the-payload-crypto] loads the new traffic key', async () => {
    await missionControl.selectTab('tx-chain');
    await domClick(page, '#tx-payload-rekey-btn');
    await expect(page.locator('#tx-payload-enc-key-status').first()).toHaveText(/Valid/i, { timeout: 5000 });
    await page.waitForTimeout(1500);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Re-key the Payload Crypto', 60000);
  });

  test('[tune-for-sar2-and-the-uplink] retunes the receiver, the analyzer and the transmit modem', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1370');
    await setTxModemFrequency(page, missionControl, 1435);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Tune for SAR-2 and the Uplink');
  });

  test('[acquire-sar2] program-tracks SAR-2 and observes its beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-06T07:34:30Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-2', 60000);
  });

  test('[decode-on-the-new-traffic-key] proves the traffic key with the chain cold', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-06T07:37:00Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode on the New Traffic Key', 60000);
  });

  test('[chain-up-for-the-proof] engages Doppler comp and brings the chain up in order', async () => {
    await enableDopplerComp(page, missionControl);
    await setTxModemOnAir(page, missionControl);
    await setSwitch(page, '#buc-mute', false);
    await enableHpa(page, missionControl);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Chain Up for the Proof');
  });

  test('[prove-the-new-key-on-orbit] sends KEY-VERIFY under the new key', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'KEY-VERIFY');
    await answerSystemQuiz(page, 'That the spacecraft authenticated a command under Q2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Prove the New Key on Orbit');
  });

  test('[safe-the-uplink] chains down in mirror order', async () => {
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Safe the Uplink');
  });

  test('[close-the-comsec-record] writes the evidence chain and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'The order acknowledged in the audit log');
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
