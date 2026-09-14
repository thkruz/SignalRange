import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
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
 * nats-eu Scenario 16 "Cascade" - full completion (phase 16, Phase 2 capstone).
 *
 * Three problems, one operator: the slipped SAR-2 pass resolved on the board,
 * Galway readied to command, the Shetland BUC cooled the right way (carrier
 * off, muted, powered; E3 cooling fault at 12:01:30), Shetland armed to take
 * SAR-2 on its own, the SAR-1 command contact flown through a GNSS outage
 * (E3, 12:18:40 - 12:27:00) with both commands acknowledged on holdover,
 * Shetland's unattended pass checked before LOS, Galway secured, the
 * reference confirmed re-locked, the alarm closed and the report written.
 * Sim clock starts 2027-04-09 12:00:00Z:
 *   GW-01 MERIDIAN-SAR-1  AOS 12:17:59Z  max el 29.8 at 12:22:49Z  LOS 12:27:35Z
 *   command window 12:18:20Z - 12:27:20Z
 *   SH-02 MERIDIAN-SAR-2  AOS 12:21:16Z  max el 28.0 at 12:26:05Z  LOS 12:30:51Z
 *
 * Objective flow (20):
 *  1. review-mission-brief          2. resolve-the-slipped-pass     3. galway-reference-check
 *  4. galway-crypto-check           5. galway-uplink-setup          6. preposition-galway-for-sar1
 *  7. shetland-alarm-sweep          8. remove-the-drive             9. confirm-shetland-buc-cooling
 * 10. arm-shetland-for-sar2        11. acquire-sar1-at-galway      12. chain-up-for-the-command
 * 13. command-the-playback         14. command-on-holdover         15. check-the-shetland-pass
 * 16. secure-galway                17. confirm-galway-reference-recovered
 * 18. close-the-shetland-alarm     19. customer-impact             20. actions-and-open-items
 */
test.describe('nats-eu Scenario 16 Full Completion', () => {
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

    // Direct navigation bypasses the nats-eu-scenario15 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario16');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] takes the shift and orders the work', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'The plan first');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Take the Shift');
  });

  test('[resolve-the-slipped-pass] keeps the command contact on Galway and covers SAR-2 from Shetland', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('contact-schedule');
    await assignContact(page, 'C-SAR1-GW', 'GW-01');
    await assignContact(page, 'C-SAR2-SH', 'SH-02');
    await expect(page.locator('#cs-conflict-count')).toHaveText('0');
    await expect(page.locator('#cs-plan-badge')).toHaveText('DECONFLICTED');
    await answerSystemQuiz(page, 'It overlaps the command contact');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Resolve the Slipped Pass');
  });

  test('[galway-reference-check] reads the Galway reference before the window', async () => {
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(2500);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Reference Check');
  });

  test('[galway-crypto-check] reads both keys', async () => {
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(2500);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Crypto Check');
  });

  test('[galway-uplink-setup] retunes the transmit modem, engages Doppler comp and sets the analyzer', async () => {
    await setTxModemFrequency(page, missionControl, 1405);
    await enableDopplerComp(page, missionControl);
    await missionControl.selectTab('rx-analysis');
    await fillAndChange(page, '#sa-center-freq', '1389');
    await fillAndChange(page, '#sa-span', '2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Uplink Setup');
  });

  test('[preposition-galway-for-sar1] parks the Galway tracker on the AOS azimuth', async () => {
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 21, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position Galway for SAR-1');
  });

  test('[shetland-alarm-sweep] reads the Shetland BUC alarm', async () => {
    // The SH-02 BUC cooling fault trips at 12:01:30 on the mission clock
    await advanceMissionClockToUtc(page, '2027-04-09T12:04:00Z');
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'The drive. A BUC dissipates heat');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'SH-02 Alarm Sweep');
  });

  test('[remove-the-drive] takes the carrier off and mutes the Shetland BUC', async () => {
    await missionControl.selectTab('tx-chain');
    await setSwitch(page, '#tx-transmit-switch', false);
    await setSwitch(page, '#buc-mute', true);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Remove the Drive from the Shetland BUC');
  });

  test('[confirm-shetland-buc-cooling] watches the BUC come down under 70 degC', async () => {
    test.setTimeout(240000);
    await missionControl.selectTab('tx-chain');
    await answerSystemQuiz(page, 'Twice wrong');
    await dismissDialogIfPresent(page);
    // Thermal time constant ~5.5 min: from ~74 degC toward a 55 degC muted target.
    await waitForObjectiveComplete(missionControl, 'Confirm the Shetland BUC Cooling', 200000);
  });

  test('[arm-shetland-for-sar2] retunes Shetland and arms program-track on SAR-2', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await programTrack(page, missionControl, '61702');
    await answerSystemQuiz(page, 'The contact is receive-only');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Arm Shetland for SAR-2');
  });

  test('[acquire-sar1-at-galway] returns to Galway and program-tracks SAR-1', async () => {
    await advanceMissionClockToUtc(page, '2027-04-09T12:18:30Z');
    await missionControl.selectGroundStation('GW-01');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-1 at Galway', 60000);
  });

  test('[chain-up-for-the-command] brings the Galway chain up in order', async () => {
    await setTxModemOnAir(page, missionControl);
    await setSwitch(page, '#buc-mute', false);
    await enableHpa(page, missionControl);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Chain Up for the Command');
  });

  test('[command-the-playback] sends REC-PLAYBACK', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'REC-PLAYBACK');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Command the Playback');
  });

  test('[command-on-holdover] reads the holdover and sends the watchdog reset on it', async () => {
    // The GW-01 GNSS outage trips at 12:18:40 on the mission clock
    await advanceMissionClockToUtc(page, '2027-04-09T12:20:30Z');
    await missionControl.selectTab('gps-timing');
    // Both stations' GPS Timing panels stay mounted; only GW-01 is in holdover.
    await expect(page.locator('#gpsdo-holdover-badge').filter({ hasText: /^ACTIVE$/u })).toHaveCount(1, { timeout: 15000 });
    await answerSystemQuiz(page, 'Yes. A GNSS outage with the switch up');
    await sendCommandAndExpectAck(page, missionControl, 'OBC-WDT-RESET');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Command on Holdover', 60000);
  });

  test('[check-the-shetland-pass] finds Shetland tracking and decoding SAR-2 on its own', async () => {
    await advanceMissionClockToUtc(page, '2027-04-09T12:24:40Z');
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Check the Shetland Pass', 60000);
  });

  test('[secure-galway] chains Galway down in mirror order', async () => {
    await missionControl.selectGroundStation('GW-01');
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Secure Galway');
  });

  test('[confirm-galway-reference-recovered] sees the GNSS return and logs the contacts', async () => {
    // The outage clears at 12:27:00 on the mission clock
    await advanceMissionClockToUtc(page, '2027-04-09T12:27:40Z');
    await missionControl.selectTab('gps-timing');
    await expect(page.locator('#gpsdo-holdover-badge').filter({ hasText: /^ACTIVE$/u })).toHaveCount(0, { timeout: 15000 });
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'SAR-1: both commands acknowledged inside the window');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Confirm the Galway Reference Recovered', 60000);
  });

  test('[close-the-shetland-alarm] confirms the Shetland BUC normal and closes the alarm', async () => {
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'The contact was receive-only and the BUC is the transmit chain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Close the Shetland Alarm', 60000);
  });

  test('[customer-impact] writes the impact line', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'None he can see');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Customer Impact');
  });

  test('[actions-and-open-items] writes the actions line and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Maintenance: GW-01 GNSS antenna fault ticket');
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
