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
  loadEphemeris,
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
 * nats-eu Scenario 23 "Dark Passes" - full completion (Gray Zone 7/8).
 *
 * One command that must go up (PLD-SAFE on the 21:22 SAR-2 pass) and, at
 * 21:14, everything at once: the GNSS spoof returns, SAR-2 burns and the
 * element set goes stale, and the jammer is expected in the window. Triage
 * (decision graded on the clock: ephemeris first while the carrier is still
 * clear), load the post-burn set, holdover, acquire, chain up, HK-DUMP ACKs,
 * PLD-SAFE NAKs at 21:24:30, call the denial with the reference in holdover,
 * hop, PLD-SAFE ACKs, safe down, debrief. Clock starts 2027-04-24 21:00:00Z:
 *   MERIDIAN-SAR-2  AOS 21:22:01Z  max el 32.8 deg at 21:26:50Z  LOS 21:31:35Z
 *   surge 21:14:00Z (spoof + burn); jammer 21:24:30Z .. 21:31:30Z
 *
 * Objective flow (17):
 *  1. review-mission-brief  2. dashboard-sweep      3. arm-the-uplink
 *  4. rx-chain-ready        5. stage-the-hop-set    6. read-the-surge
 *  7. triage                8. load-the-ephemeris   9. go-to-holdover
 * 10. preposition-for-aos  11. acquire-sar2        12. chain-up
 * 13. first-command        14. call-the-denial     15. go-to-hopping
 * 16. ride-through         17. safe-and-debrief
 */
test.describe('nats-eu Scenario 23 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const readOffsetUs = async (): Promise<number> => {
    const text = (await page.locator('#gpsdo-time-offset').textContent()) ?? '';
    return parseFloat(text.replace(/[^\d.+-]/g, ''));
  };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario23');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the brief and the one tasking', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'PLD-SAFE up on SAR-2 inside');
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

  test('[stage-the-hop-set] reads the TRANSEC card and leaves the key in the store', async () => {
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-transec-key-badge')).toHaveText('NOT LOADED', { timeout: 10000 });
    await answerSystemQuiz(page, 'A hop set is spent the moment it is used on the air');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Stage the Hop Set');
  });

  test('[read-the-surge] the delta-T walks and the element set goes stale at 21:14', async () => {
    await advanceMissionClockToUtc(page, '2027-04-24T21:14:30Z');
    await missionControl.selectTab('gps-timing');
    await expect.poll(readOffsetUs, { timeout: 30000 }).toBeGreaterThan(20);
    await page.waitForTimeout(3000);
    await missionControl.selectTab('pass-schedule');
    await expect(page.locator('#ephemeris-panel')).toContainText('EPHEMERIS STALE', { timeout: 15000 });
    await answerSystemQuiz(page, 'A GNSS spoof (delta-T walking, constellation healthy) and a stale element set');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Surge');
  });

  test('[triage] reads both panels and puts the ephemeris first', async () => {
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(3000);
    await missionControl.selectTab('pass-schedule');
    await page.waitForTimeout(3000);
    await answerDecision(page, 'Ephemeris first - without it there is no pass to point at', ['Delta-T read on GPS Timing', 'Pass Schedule read (SAR-2 EPHEMERIS STALE)']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Triage');
  });

  test('[load-the-ephemeris] loads the post-burn elements', async () => {
    await loadEphemeris(page, missionControl, 'SAR2-DAM');
    await answerSystemQuiz(page, 'A tracker pointing where the bird would have been');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Load the Post-Burn Elements');
  });

  test('[go-to-holdover] takes the GNSS switch down', async () => {
    await missionControl.selectTab('gps-timing');
    await setSwitch(page, '#gpsdo-gnss-switch', false);
    await expect(page.locator('#gpsdo-holdover-badge').first()).toHaveText('ACTIVE', { timeout: 10000 });
    await answerSystemQuiz(page, 'Because the walk costs timestamps, not the pass');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Stop Trusting GNSS', 60000);
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 22 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 22, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar2] program-tracks SAR-2 on the post-burn set and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-24T21:22:40Z');
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

  test('[first-command] sends HK-DUMP on the fixed carrier in holdover and gets the ACK', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'HK-DUMP');
    await answerSystemQuiz(page, 'That a free-running OCXO is a perfectly good 10 MHz');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Housekeeping Dump');
  });

  test('[call-the-denial] PLD-SAFE NAKs into the jammer; reads the console and the reference; calls the denial', async () => {
    await advanceMissionClockToUtc(page, '2027-04-24T21:24:45Z');
    await sendCommandAndExpectNak(page, missionControl, 'PLD-SAFE', 'Uplink denied - carrier jammed');
    await page.waitForTimeout(3000); // TT&C console on screen so the read latches
    await missionControl.selectTab('gps-timing');
    await expect(page.locator('#gpsdo-holdover-badge').first()).toHaveText('ACTIVE');
    await page.waitForTimeout(3000);
    await answerDecision(page, 'Uplink denial on the fixed carrier - the jammer is back', ['TT&C console read', 'Reference read on GPS Timing (holdover)']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call the Denial');
  });

  test('[go-to-hopping] loads HOP-SAR2-05, switches the waveform, and gets sync', async () => {
    await missionControl.selectTab('security-console');
    await domClick(page, '#sec-transec-load-key');
    await expect(page.locator('#sec-transec-key-badge')).toHaveText('LOADED', { timeout: 10000 });
    await page.locator('#sec-transec-mode').selectOption({ value: 'hopping' });
    await expect(page.locator('#sec-transec-sync-badge')).toHaveText('SYNC LOCKED', { timeout: 10000 });
    await answerSystemQuiz(page, 'That the fixed carrier on 14035 is known and will be denied again');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Go to Hopping');
  });

  test('[ride-through] resends PLD-SAFE under TRANSEC and gets the ACK', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'PLD-SAFE');
    await answerSystemQuiz(page, 'None of them as they were');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Keep the Tasking Alive');
  });

  test('[safe-and-debrief] chains down after LOS, writes the debrief line and completes', async () => {
    await advanceMissionClockToUtc(page, '2027-04-24T21:31:50Z');
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await answerSystemQuiz(page, 'Three inputs lost at once and one command up');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
