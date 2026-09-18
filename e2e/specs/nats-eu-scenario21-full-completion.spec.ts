import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerPendingQuizFrom,
  answerSystemQuiz,
  closeWorkingDocumentIfOpen,
  disableHpa,
  enableDopplerComp,
  enableHpa,
  expectDashboardAlarm,
  fillAndChange,
  parkAntenna,
  programTrack,
  sendCommandAndExpectAck,
  setRxModemFrequency,
  setSwitch,
  setTxModemFrequency,
  setTxModemOnAir,
} from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 21 "Knocking on the Door" - full completion (Gray Zone 5/8).
 *
 * The SAR-2 commanding pass. HK-DUMP ACKs at 09:25; at 09:27 the log shows
 * the bird rejecting three replayed copies of it (Rotterdam's monitoring
 * entry, then the KG-01 unit log). Every key badge stays Valid. Call it a
 * replay against an intact key (decision graded on crypto-intact), rotate to
 * Q2b out of cycle, PLD-STATUS ACKs under
 * the new key, chain down, retain the retired key and the unit log (the second
 * decision; the zeroize branch destroys the log S22 needs), file the report.
 * Clock starts 2027-04-21 09:00:00Z:
 *   MERIDIAN-SAR-2  AOS 09:23:58Z  max el 30.6 deg at 09:28:44Z  LOS 09:33:27Z
 *   command window  09:24:18Z .. 09:33:07Z; knock in the log at 09:27:00Z
 *
 * Objective flow (17):
 *  1. review-mission-brief  2. dashboard-sweep      3. key-baseline
 *  4. audit-baseline        5. arm-the-uplink       6. rx-chain-ready
 *  7. preposition-for-aos   8. acquire-sar2         9. chain-up
 * 10. first-command        11. spot-the-knock      12. call-the-knock
 * 13. rotate-on-order      14. second-command      15. safe-the-uplink
 * 16. retain-the-evidence  17. close-and-debrief
 */
test.describe('nats-eu Scenario 21 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario21');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the brief and what the counter does to a replay', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'The bird rejects it: every authenticated frame carries a counter');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Brief');
  });

  test('[dashboard-sweep] reads the board: AGC rail, no faults', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await expectDashboardAlarm(page, 'AGC at max gain');
    await answerSystemQuiz(page, 'RX AGC at max gain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[key-baseline] reads both keys Valid', async () => {
    await missionControl.selectTab('tx-chain');
    await expect(page.locator('#tx-payload-enc-key-status').first()).toHaveText(/Valid/i, { timeout: 10000 });
    await page.waitForTimeout(3000);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(3000);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Key Baseline');
  });

  test('[audit-baseline] signs off the 09:00 log', async () => {
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-mark-reviewed')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#sec-audit-body')).not.toContainText('KG-01 unit log');
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await answerSystemQuiz(page, 'KEY-2027-Q2b staged as an inactive spare');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Log Before the Pass');
  });

  test('[arm-the-uplink] retunes the TX modem to 1435 MHz and engages Doppler comp', async () => {
    await setTxModemFrequency(page, missionControl, 1435);
    await enableDopplerComp(page, missionControl);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Arm the Uplink');
  });

  test('[rx-chain-ready] retunes the receiver and frames a 40 MHz span on 1370', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1370');
    await fillAndChange(page, '#sa-span', '40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-2');
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 8 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 8, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar2] program-tracks SAR-2 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-21T09:24:40Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-2', 60000);
  });

  test('[chain-up] brings the chain up in order inside the window', async () => {
    await setTxModemOnAir(page, missionControl);
    await setSwitch(page, '#buc-mute', false);
    await enableHpa(page, missionControl);
    await page.waitForTimeout(3000);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Chain Up in Order');
  });

  test('[first-command] sends HK-DUMP and gets the ACK', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'HK-DUMP');
    await answerSystemQuiz(page, 'Anyone with a receiver under the uplink footprint');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Housekeeping Dump');
  });

  test('[spot-the-knock] the counter-reject entry appears at 09:27 and is flagged', async () => {
    await advanceMissionClockToUtc(page, '2027-04-21T09:27:20Z');
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-audit-body')).toContainText('authentication counter stale', { timeout: 15000 });
    await domClick(page, 'button[data-event-id="evt-rotterdam-counter"]');
    await answerSystemQuiz(page, 'Someone sent the bird command frames that authenticated under the live key');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Spot the Knock');
  });

  test('[call-the-knock] reads the key, flags the unit log, and calls a replay against an intact key', async () => {
    await missionControl.selectTab('tx-chain');
    await expect(page.locator('#tx-payload-enc-key-status').first()).toHaveText(/Valid/i);
    await page.waitForTimeout(3000);
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-audit-body')).toContainText('KG-01 unit log', { timeout: 15000 });
    await domClick(page, 'button[data-event-id="evt-kg-replay-log"]');
    await page.waitForTimeout(3000);
    await answerDecision(page, 'A replay against an intact key', ['Command key read on TX Chain', 'KG-01 unit log flagged on the Security console']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call the Knock');
  });

  test('[rotate-on-order] rotates the command key to Q2b on the TT&C console', async () => {
    await missionControl.selectTab('commanding');
    await expect(page.locator('#cmd-begin-rotation')).toBeVisible({ timeout: 10000 });
    await domClick(page, '#cmd-begin-rotation');
    await expect(page.locator('#cmd-key-badge')).toHaveText(/Pending/i, { timeout: 5000 });
    await domClick(page, '#cmd-complete-rotation');
    await expect(page.locator('#cmd-key-badge')).toHaveText(/Valid/i, { timeout: 5000 });
    await answerSystemQuiz(page, 'Because they hold recorded traffic under it');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Rotate Out of Cycle');
  });

  test('[second-command] sends PLD-STATUS under the new key and gets the ACK', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'PLD-STATUS');
    await answerSystemQuiz(page, 'They fail twice over');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Payload Status Under the New Key');
  });

  test('[safe-the-uplink] chains down in mirror order after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-04-21T09:33:40Z');
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Safe the Uplink');
  });

  test('[retain-the-evidence] re-reads the unit log and keeps the key and the log under seal', async () => {
    await missionControl.selectTab('security-console');
    // Still in the log: the earlier call did not destroy it.
    await expect(page.locator('#sec-audit-body')).toContainText('KG-01 unit log');
    await page.waitForTimeout(3000);
    await answerDecision(page, 'Retain both under seal for CSIRT', ['KG-01 unit log re-read on the Security console']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Retain or Zeroize');
  });

  test('[close-and-debrief] files the incident, writes the debrief line and completes', async () => {
    // Two status-checks in one objective: the quiz manager picks the order.
    const answers = [
      { questionHint: 'COMSEC incident report', answerText: '09:25 HK-DUMP ACK under Q2' },
      { questionHint: 'debrief line', answerText: 'Every command frame on the air is a frame they can keep' },
    ];
    await answerPendingQuizFrom(page, answers);
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await answerPendingQuizFrom(page, answers);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
