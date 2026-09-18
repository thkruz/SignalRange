import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
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
  sendCommandAndExpectNak,
  setRxModemFrequency,
  setSwitch,
  setTxModemFrequency,
  setTxModemOnAir,
} from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 19 "Frequency Agility" - full completion (Gray Zone 3/8).
 *
 * The SAR-2 commanding pass: chain up, HK-DUMP ACKs on the fixed carrier,
 * then a jammer on the 14035 MHz uplink at the bird from 13:22:30 and
 * PLD-STATUS NAKs "uplink denied" with the key Valid, Doppler on, window open.
 * Call it (the decision is graded on the uplink-jammed fact), key the hop set,
 * go to hopping, SYNC LOCKED, resend and ACK through the jamming, chain down,
 * log it, decode SAR-1 untouched, debrief. Clock starts 2027-04-16 13:00:00Z:
 *   MERIDIAN-SAR-2  AOS 13:20:01Z  max el 27.9 deg at 13:24:43Z  LOS 13:29:29Z
 *   command window  13:20:21Z .. 13:29:09Z; jammer 13:22:30Z .. 13:29:10Z
 *   MERIDIAN-SAR-1  AOS 13:42:01Z  max el 25.2 deg at 13:46:46Z  LOS 13:51:29Z
 *
 * Objective flow (17):
 *  1. review-mission-brief  2. dashboard-sweep      3. reference-check
 *  4. tune-the-uplink       5. key-check            6. rx-chain-ready
 *  7. preposition-for-aos   8. acquire-sar2         9. chain-up
 * 10. first-command        11. call-the-nak        12. go-to-hopping
 * 13. ride-through         14. safe-the-uplink     15. log-the-denial
 * 16. decode-sar1          17. close-and-debrief
 */
test.describe('nats-eu Scenario 19 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario19');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the brief and why the waveform is still fixed', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'Hopping is a response, not a default');
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

  test('[reference-check] observes the GPSDO and the BUC reference', async () => {
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(3000);
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(3000);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference Check');
  });

  test('[tune-the-uplink] retunes the TX modem to 1435 MHz and engages Doppler comp', async () => {
    await setTxModemFrequency(page, missionControl, 1435);
    await enableDopplerComp(page, missionControl);
    await answerSystemQuiz(page, '1435 MHz (RF minus LO');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Tune the Uplink');
  });

  test('[key-check] reads the command key on the TX chain', async () => {
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(3000);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Key Check');
  });

  test('[rx-chain-ready] retunes the receiver and frames a 40 MHz span on 1370', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1370');
    await fillAndChange(page, '#sa-span', '40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-2');
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 138 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 138, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar2] program-tracks SAR-2 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-16T13:20:40Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-2', 60000);
  });

  test('[chain-up] brings the chain up in order inside the window', async () => {
    await setTxModemOnAir(page, missionControl);
    await setSwitch(page, '#buc-mute', false);
    await enableHpa(page, missionControl);
    await page.waitForTimeout(3000); // TX Chain on screen so the HPA read latches
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Chain Up in Order');
  });

  test('[first-command] sends HK-DUMP on the fixed carrier and gets the ACK', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'HK-DUMP');
    await answerSystemQuiz(page, 'That the bird heard this command');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Housekeeping Dump');
  });

  test('[call-the-nak] sends PLD-STATUS into the jammer, reads the key and the console, and calls uplink denial', async () => {
    // The jammer opens at 13:22:30; the NAK reason is the console's own word for it.
    await advanceMissionClockToUtc(page, '2027-04-16T13:22:45Z');
    await sendCommandAndExpectNak(page, missionControl, 'PLD-STATUS', 'Uplink denied - carrier jammed');

    // Evidence: the command key on TX Chain, the TT&C console itself.
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(3000);
    await missionControl.selectTab('commanding');
    await page.waitForTimeout(3000);

    // Graded on the uplink-jammed fact with the crypto intact.
    await answerDecision(page, 'Uplink denial - key the hop set at both ends', ['Command key read on TX Chain', 'TT&C console read']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call the NAK');
  });

  test('[go-to-hopping] loads the hop-set key, switches the waveform, and gets sync', async () => {
    await missionControl.selectTab('security-console');
    await domClick(page, '#sec-transec-load-key');
    await expect(page.locator('#sec-transec-key-badge')).toHaveText('LOADED', { timeout: 10000 });
    await page.locator('#sec-transec-mode').selectOption({ value: 'hopping' });
    await expect(page.locator('#sec-transec-sync-badge')).toHaveText('SYNC LOCKED', { timeout: 10000 });
    await answerSystemQuiz(page, 'The hop set is the shared secret');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Go to Hopping');
  });

  test('[ride-through] resends PLD-STATUS under TRANSEC and gets the ACK through the jamming', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'PLD-STATUS');
    await answerSystemQuiz(page, 'It moved your carrier out from under the jammer');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Ride It Through');
  });

  test('[safe-the-uplink] chains down in mirror order after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-04-16T13:29:40Z');
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Safe the Uplink');
  });

  test('[log-the-denial] records the window', async () => {
    await answerSystemQuiz(page, '13:21 HK-DUMP ACK fixed');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Log the Denial');
  });

  test('[decode-sar1] retunes, retargets and decodes SAR-1 untouched', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await programTrack(page, missionControl, '61701');
    await advanceMissionClockToUtc(page, '2027-04-16T13:42:40Z');
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-16T13:45:00Z');
    await page.waitForTimeout(4000);
    await answerSystemQuiz(page, 'A jammer reaches what it can reach');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode SAR-1 Untouched', 60000);
  });

  test('[close-and-debrief] writes the debrief line and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'A hop set used on the air is a hop set observed');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
