import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerSystemQuiz,
  closeWorkingDocumentIfOpen,
  commitLinkWithMargin,
  computeLinkBudget,
  disableHpa,
  enableDopplerComp,
  enableHpa,
  parkAntenna,
  programTrack,
  sendCommandAndExpectAck,
  setBucGain,
  setHpaBackOff,
  setSwitch,
  setTxModemFrequency,
  setTxModemOnAir,
} from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 10 "Priority Tasking" - full completion (phase 16).
 *
 * One 18 deg MERIDIAN-SAR-1 pass, worked as a whole tasking: the sweep, the
 * reference, the link-budget worksheet, the EIRP plan as steps (BUC gain
 * restored from 18 to 23 dB, HPA back-off 10 -> 4 dB, half a watt proven once
 * the amplifier is up), the uplink modem retuned from SAR-2's 1435 to 1405
 * MHz with Doppler comp engaged, the tracker parked on the rise azimuth,
 * program-track at AOS, the tasking command inside the window, the imagery
 * pulled down with about 2 dB of margin, then the chain safed, the back-off
 * restored, the log and the customer. Clock starts 2027-03-18 15:18:00Z:
 *   MERIDIAN-SAR-1  AOS 15:34:59Z  max el 17.8 deg at 15:39:31Z  LOS 15:44:03Z
 *   command window  mission T+1039 s .. T+1543 s
 *   measured (phase-c harness): peak C/N 8.11 dB at culmination, ~150 s at or
 *   above 7 dB, ~40 s at or above 8 dB
 *
 * Objective flow (15):
 *  1. review-mission-brief   2. dashboard-sweep        3. reference-check
 *  4. budget-the-low-pass    5. restore-the-buc-gain   6. raise-the-eirp
 *  7. tune-the-uplink        8. preposition-for-aos    9. acquire-low
 * 10. task-the-collect      11. pull-the-imagery      12. safe-the-uplink
 * 13. restore-the-back-off  14. log-the-tasking       15. report-to-customer
 */
test.describe('nats-eu Scenario 10 Full Completion', () => {
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

    // Direct navigation bypasses the nats-eu-scenario9 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario10');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the tasking and the low-pass geometry', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'Slant range at max elevation is about 1040 km');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Tasking');
  });

  test('[dashboard-sweep] confirms a clean board', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'No active alarms');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[reference-check] observes the GPSDO and the BUC reference', async () => {
    for (const tab of ['gps-timing', 'tx-chain']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference Check');
  });

  test('[budget-the-low-pass] computes the worksheet and reads the atmospheric loss', async () => {
    await computeLinkBudget(page, missionControl, {
      eirpDbm: 28,
      fsplDb: 174.1,
      rxGainDbi: 51.8,
      noiseTempK: 88,
      bandwidthMHz: 36,
      miscLossDb: 1.2,
    });
    await answerSystemQuiz(page, 'The atmospheric path at 18 degrees');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Budget the Low Pass');
  });

  test('[restore-the-buc-gain] puts the BUC back to 23 dB and reads the chain arithmetic', async () => {
    await setBucGain(page, missionControl, 23);
    await page.waitForTimeout(2500); // buc-not-saturated latches on TX chain
    await answerSystemQuiz(page, 'The EIRP of a 9 dB back-off');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Restore the BUC Gain');
  });

  test('[raise-the-eirp] takes the HPA back-off to 4 dB and stays linear', async () => {
    await setHpaBackOff(page, missionControl, 4);
    await expect(page.locator('#hpa-overdrive-status')).toHaveText('Normal');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'Intermodulation products land');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Raise Uplink EIRP Without Overdriving');
  });

  test('[tune-the-uplink] retunes the TX modem to 1405 MHz and engages Doppler comp', async () => {
    await setTxModemFrequency(page, missionControl, 1405);
    await enableDopplerComp(page, missionControl);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Tune the Uplink');
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 027 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 27, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-low] program-tracks SAR-1 and sees the beacon at the horizon', async () => {
    await advanceMissionClockToUtc(page, '2027-03-18T15:34:30Z');
    await programTrack(page, missionControl, '61701');
    await page.waitForTimeout(2000);

    // Early in the pass the beacon clears -130 dBm at RX IF; observe it on
    // RX Analysis so signal-detected latches
    await advanceMissionClockToUtc(page, '2027-03-18T15:36:30Z');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire at the Horizon', 60000);
  });

  test('[task-the-collect] keys the uplink in order, proves the power and gets the tasking ACK', async () => {
    // Modem FIRST, then the HPA: enabling the HPA with no drive trips the
    // noise-amplification invariant and fails the mission
    await setTxModemOnAir(page, missionControl);
    await enableHpa(page, missionControl);
    await page.waitForTimeout(2500); // hpa-output-power-set is observed on TX chain

    await sendCommandAndExpectAck(page, missionControl, 'SAR-TASK-URGENT');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Task the Collect');
  });

  test('[pull-the-imagery] holds the downlink 30 s and commits with margin at max elevation', async () => {
    test.setTimeout(180000);

    // Observe on RX Analysis BEFORE the jump so lock and the 6 dB floor latch
    // on the first tick above threshold (C/N >= 7 dB from about 15:38:15)
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-18T15:38:45Z');
    await dismissDialogIfPresent(page);

    // The 30 s maintain window ticks on real time
    await page.waitForTimeout(32000);

    // Max elevation is 15:39:31Z. Commit with the live C/N at least 7 dB
    // (6 dB threshold + 1 dB required margin).
    await commitLinkWithMargin(page, missionControl, 7);
    await answerSystemQuiz(page, 'On a low pass the bird never gets close');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pull the Imagery With the Margin You Have', 60000);
  });

  test('[safe-the-uplink] brings the chain down in order after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-03-18T15:44:30Z');
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Safe the Uplink');
  });

  test('[restore-the-back-off] returns the HPA to the 10 dB station standard', async () => {
    await setHpaBackOff(page, missionControl, 10);
    await answerSystemQuiz(page, '4 dB was the EIRP for one 18 degree geometry');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Restore the Back-Off');
  });

  test('[log-the-tasking] writes the tasking log', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'The command and its ACK time');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Log the Tasking');
  });

  test('[report-to-customer] tells Erik what he got and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Captured and usable');
    await dismissDialogIfPresent(page);

    // FINAL objective: assert through the Mission Complete modal, since the
    // checklist stops repainting once the completion flow takes over
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
