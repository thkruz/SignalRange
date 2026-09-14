import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, fillAndChange, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 1 "First Light Over Galway" - full completion (phase 16).
 *
 * The whole shift, not just the pass: a station sweep and receiver set-up in
 * the fifteen minutes before AOS, the SAR-1 pass, the retune between contacts,
 * the SAR-2 pass, and the shift log. Sim clock starts 2027-03-15 13:48:00Z:
 *   MERIDIAN-SAR-1  AOS 14:03:10Z (5 deg mask)  max el 28.0 at 14:06:45Z  LOS 14:10:18Z
 *   MERIDIAN-SAR-2  AOS 14:18:42Z               max el 25.0 at 14:22:10Z  LOS 14:25:40Z
 *
 * Pre-pass objectives carry 1.5-4 min timers that run on real time, so each
 * pre-pass step below completes well inside its window. The specs jump with
 * advanceMissionClockToUtc (sim + mission clock together) to each pass
 * segment; the dev hook does not decrement objective timers.
 *
 * Objective flow (15):
 *  1. review-mission-brief    2. dashboard-sweep      3. reference-check
 *  4. downconversion-plan     5. tune-receiver        6. analyzer-on-beacon
 *  7. review-pass-schedule    8. preposition-for-aos  9. acquire-sar1
 * 10. lock-the-downlink      11. read-the-culmination 12. retune-for-sar2
 * 13. acquire-sar2           14. decode-sar2          15. log-first-light
 */

/** Stage repeated fine-adjust clicks on one axis, then apply. */
async function jogAxis(page: Page, axisPrefix: 'az-fine' | 'el-fine', delta: number, clicks: number): Promise<void> {
  const selector = `[id^="${axisPrefix}"] .btn-fine[data-delta="${delta}"]`;
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 10000 });
  for (let i = 0; i < clicks; i++) {
    await domClick(page, selector);
  }
}

test.describe('nats-eu Scenario 1 Full Completion', () => {
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

    // Direct navigation (bypasses the nats-level-8-night-shift prerequisite card lock)
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario1');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] opens the shift brief and starts the sweep', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerSystemQuiz(page, 'Starting the pre-pass sweep');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Shift Brief');
  });

  test('[dashboard-sweep] confirms a clean board', async () => {
    // Station tabs render only after GW-01 is selected in the asset tree
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'No active alarms');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[reference-check] observes the GPSDO locked and out of holdover', async () => {
    await missionControl.selectTab('gps-timing');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference Check');
  });

  test('[downconversion-plan] reads the LNB LO and does the IF arithmetic', async () => {
    await missionControl.selectTab('rx-analysis');
    await answerSystemQuiz(page, '1414 MHz (LO minus RF');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Confirm the Ku Downconversion Plan');
  });

  test('[tune-receiver] retunes modem 1 from the test carrier to the imagery downlink', async () => {
    await missionControl.selectTab('rx-analysis');
    const freq = page.locator('#frequency-input');
    await expect(freq).toBeVisible({ timeout: 10000 });
    await freq.fill('1414');
    await page.locator('#bandwidth-input').fill('36');
    await page.locator('#modulation-select').selectOption('QPSK');
    await page.locator('#fec-select').selectOption('3/4');
    await domClick(page, '#apply-btn');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Tune the Receiver for SAR-1');
  });

  test('[analyzer-on-beacon] centres the analyzer on the beacon with a Doppler-wide span', async () => {
    await missionControl.selectTab('rx-analysis');
    await fillAndChange(page, '#sa-center-freq', '1389');
    await fillAndChange(page, '#sa-span', '2');
    await answerSystemQuiz(page, 'Doppler walks the beacon');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Analyzer on the SAR-1 Beacon');
  });

  test('[review-pass-schedule] reads AOS off the schedule', async () => {
    await missionControl.selectTab('pass-schedule');
    await answerSystemQuiz(page, '14:03, azimuth 000');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Contact Schedule');
  });

  test('[preposition-for-aos] slews the stowed tracker to the rise azimuth', async () => {
    await missionControl.selectTab('acu-control');
    // Stowed at az 180 / el 3; the rise is az 000 / el 5 (tolerance 3 deg).
    await jogAxis(page, 'az-fine', -10, 18);
    await jogAxis(page, 'el-fine', 1, 2);
    await domClick(page, '[id$="apply-changes-btn"]');
    await dismissDialogIfPresent(page);
    // 180 deg at 20 deg/s is nine seconds of slew
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar1] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:03:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[lock-the-downlink] holds RX lock with C/N above 8 dB', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:05:40Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Lock the Imagery Downlink', 60000);
  });

  test('[read-the-culmination] reads C/N at the top of the pass and the Doppler crossing', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:06:40Z');
    await answerSystemQuiz(page, 'Approach raises the RF');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Pass at Culmination', 60000);
  });

  test('[retune-for-sar2] retunes the receiver and analyzer after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:11:00Z');
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1397');
    await answerSystemQuiz(page, 'Imagery 1370 MHz, beacon 1397 MHz; AOS 14:18');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Retune for SAR-2');
  });

  test('[acquire-sar2] retargets the tracker and acquires SAR-2', async () => {
    await programTrack(page, missionControl, '61702');
    await advanceMissionClockToUtc(page, '2027-03-15T14:19:20Z');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-2', 60000);
  });

  test('[decode-sar2] decodes the second contact above 8 dB', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:21:40Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Second Contact', 60000);
  });

  test('[log-first-light] writes the shift log and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'peak ~11 dB at 28 degrees');
    // Last objective: its completion pops the Mission Complete modal, which
    // freezes the checklist, so wait on the modal rather than the row.
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
