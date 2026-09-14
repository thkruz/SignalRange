import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, assignContact, closeWorkingDocumentIfOpen, fillAndChange, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 9 "Morning Constellation" - full completion (phase 16).
 *
 * Both sites swept from the Galway console (four checks each), the
 * six-contact day plan, MERIDIAN-SAR-1 flown from Galway for the standing
 * collect, Galway armed on program-track for its SAR-2 window, the Shetland
 * console taken remotely and SAR-2 flown FROM SH-02 (per-station
 * propagation), then Galway's unattended pass checked and the customer told.
 * Sim clock starts 2027-03-17 06:00:00Z:
 *   GW-01 MERIDIAN-SAR-1  AOS 06:18:00Z  max el 30.5 at 06:22:47Z  LOS 06:27:33Z
 *   SH-02 MERIDIAN-SAR-2  AOS 06:30:00Z  max el 23.0 at 06:34:38Z  LOS 06:39:17Z
 *   GW-01 MERIDIAN-SAR-2  AOS 06:32:00Z  max el 25.2 at 06:36:43Z  LOS 06:41:22Z
 *
 * The specs jump with advanceMissionClockToUtc (sim + mission clock together)
 * to each pass segment and observe on RX Analysis, where the lock and C/N
 * conditions latch. Pre-pass objectives carry 1.5-4 min timers that run on
 * real time; each step below completes well inside its window.
 *
 * Objective flow (18):
 *  1. review-mission-brief        2. galway-dashboard-sweep    3. galway-reference-check
 *  4. galway-receive-chain        5. galway-transmit-chain     6. build-the-day-plan
 *  7. shetland-dashboard-sweep    8. shetland-reference-check  9. shetland-receive-chain
 * 10. shetland-transmit-chain    11. acquire-sar1             12. decode-the-standing-collect
 * 13. arm-galway-for-sar2        14. take-the-shetland-console 15. acquire-sar2-from-shetland
 * 16. decode-sar2-from-shetland  17. check-the-unattended-pass 18. customer-status
 */
test.describe('nats-eu Scenario 9 Full Completion', () => {
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

    // Direct navigation bypasses the nats-eu-scenario8 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario9');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] takes the shift and confirms the plan rule', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'No site is double-booked');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Take the Shift');
  });

  test('[galway-dashboard-sweep] confirms a clean Galway board', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'No active alarms');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[galway-reference-check] observes the Galway GPSDO', async () => {
    await missionControl.selectTab('gps-timing');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Reference Check');
  });

  test('[galway-receive-chain] reads the LNB and retunes the modem and analyzer for SAR-1', async () => {
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500); // LNB LO / thermal state latch on RX analysis
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1389');
    await fillAndChange(page, '#sa-span', '2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Receive Chain');
  });

  test('[galway-transmit-chain] confirms the chain is cold the right way', async () => {
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'Modem off air, HPA output disabled, BUC muted');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Transmit Chain');
  });

  test('[build-the-day-plan] splits the conflict pairs across the two sites', async () => {
    await missionControl.selectTab('contact-schedule');
    await expect(page.locator('#cs-plan-badge')).toHaveText('UNALLOCATED');

    // The two P1/P2 conflict pairs go one to each site; the P3 second-orbit
    // contacts stay unallocated (requiredPriorityAtOrAbove 2)
    await assignContact(page, 'M-SAR1-GW', 'GW-01');
    await assignContact(page, 'M-SAR1-SH', 'SH-02');
    await assignContact(page, 'M-SAR2-GW', 'GW-01');
    await assignContact(page, 'M-SAR2-SH', 'SH-02');

    await expect(page.locator('#cs-conflict-count')).toHaveText('0');
    await expect(page.locator('#cs-unassigned-count')).toHaveText('0');
    await expect(page.locator('#cs-plan-badge')).toHaveText('DECONFLICTED');

    await answerSystemQuiz(page, 'Galway is armed on program-track');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Build the Day Plan');
  });

  test('[shetland-dashboard-sweep] reads the remote board', async () => {
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'Nothing in the alarm set is tripped');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'SH-02 Dashboard Sweep');
  });

  test('[shetland-reference-check] observes the Shetland GPSDO', async () => {
    await missionControl.selectTab('gps-timing');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'SH-02 Reference Check');
  });

  test('[shetland-receive-chain] reads the Shetland LNB and predicts the 73 degree peak', async () => {
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'About 16 dB');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'SH-02 Receive Chain');
  });

  test('[shetland-transmit-chain] confirms the Shetland chain is cold', async () => {
    await missionControl.selectTab('tx-chain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'SH-02 Transmit Chain');
  });

  test('[acquire-sar1] returns to Galway and program-tracks SAR-1', async () => {
    await advanceMissionClockToUtc(page, '2027-03-17T06:18:30Z');
    await missionControl.selectGroundStation('GW-01');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[decode-the-standing-collect] decodes the 1414 MHz downlink for Erik', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-17T06:21:30Z');
    await answerSystemQuiz(page, 'Decoded with about 5 dB');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Standing Collect', 60000);
  });

  test('[arm-galway-for-sar2] retunes Galway and targets SAR-2 for the unattended pass', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await programTrack(page, missionControl, '61702');
    await answerSystemQuiz(page, 'Receiver on the right carrier');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Arm Galway for SAR-2');
  });

  test('[take-the-shetland-console] takes SH-02 after Fiona sets and retunes it for SAR-2', async () => {
    await advanceMissionClockToUtc(page, '2027-03-17T06:29:20Z');
    await missionControl.selectGroundStation('SH-02');
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1397');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Take the Shetland Console');
  });

  test('[acquire-sar2-from-shetland] program-tracks SAR-2 on the SH-02 pedestal', async () => {
    await programTrack(page, missionControl, '61702');
    await advanceMissionClockToUtc(page, '2027-03-17T06:31:10Z');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-2 from Shetland', 60000);
  });

  test('[decode-sar2-from-shetland] holds lock above 7 dB from Shetland', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-17T06:33:40Z');
    await answerSystemQuiz(page, 'The pedestal still program-track locked');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode SAR-2 from Shetland', 60000);
  });

  test('[check-the-unattended-pass] finds Galway still tracking and locked on SAR-2', async () => {
    await advanceMissionClockToUtc(page, '2027-03-17T06:38:00Z');
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Check the Unattended Pass', 60000);
  });

  test('[customer-status] reports the morning to Erik and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'The collect decoded with margin; both SAR-2 windows');
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
