import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, expectDashboardAlarm, fillAndChange, parkAntenna, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 18 "Dirty Spectrum" - full completion (Gray Zone 2/8).
 *
 * Decode SAR-2 clean, read the cadence of the carrier that comes back after
 * culmination (60 s on / 30 s off, no Doppler, Galway only), call it - the
 * decision is graded on the interference *envelope* fact, so an off phase
 * does not flip the answer - notch it and keep the pass, log event 1, retune
 * for SAR-1, notch the carrier again when it follows the plan into SAR-1's
 * band, record the implication, file the regulator package, debrief.
 * Clock starts 2027-04-14 10:00:00Z:
 *   MERIDIAN-SAR-2  AOS 10:18:00Z  max el 31.8 deg at 10:22:49Z  LOS 10:27:34Z
 *   carrier 1       10:23:30Z .. 10:31:30Z on 1374 MHz IF, on 60 / off 30
 *   MERIDIAN-SAR-1  AOS 10:40:00Z  max el 24.0 deg at 10:44:45Z  LOS 10:49:29Z
 *   carrier 2       10:41:30Z .. 10:48:30Z on 1410 MHz IF, same cadence
 *
 * Objective flow (17):
 *  1. review-mission-brief    2. dashboard-sweep         3. reference-check
 *  4. rx-chain-ready-sar2     5. preposition-for-aos     6. acquire-sar2
 *  7. decode-sar2             8. read-the-cycle          9. call-the-cycle
 * 10. notch-the-carrier      11. log-the-first-event    12. rx-chain-ready-sar1
 * 13. acquire-sar1           14. decode-sar1-under-it   15. it-followed-the-plan
 * 16. file-the-regulator-report                         17. close-and-debrief
 */

/** Configure one IF notch on the RX Analysis tab (the C1 S21 helper, verbatim). */
async function configureNotchFilter(page: Page, config: { centerFrequency: number; bandwidth: number; depth: number; notchIndex: number }): Promise<void> {
  const prefix = `notch-${config.notchIndex}`;

  const powerSwitch = page.locator('#notch-power');
  await expect(powerSwitch).toBeVisible({ timeout: 5000 });
  if (!(await powerSwitch.isChecked())) {
    await powerSwitch.click();
    await expect(powerSwitch).toBeChecked();
    await page.waitForTimeout(300);
  }

  const enableSwitch = page.locator(`#${prefix}-enabled`);
  await expect(enableSwitch).toBeVisible();
  if (!(await enableSwitch.isChecked())) {
    await enableSwitch.click();
    await expect(enableSwitch).toBeChecked();
    await page.waitForTimeout(200);
  }

  for (const [suffix, value] of [
    ['freq', config.centerFrequency],
    ['bw', config.bandwidth],
    ['depth', config.depth],
  ] as const) {
    const input = page.locator(`#${prefix}-${suffix}`);
    await expect(input).toBeVisible();
    await input.fill(value.toString());
    await input.press('Tab');
    await page.waitForTimeout(100);
  }

  const applyBtn = page.locator('#notch-apply-btn');
  if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await applyBtn.click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
}

test.describe('nats-eu Scenario 18 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario18');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the day brief and the posture', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'The record: a second appearance is evidence of persistence');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Day Brief');
  });

  test('[dashboard-sweep] reads the board: AGC rail, no faults', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await expectDashboardAlarm(page, 'AGC at max gain');
    await answerSystemQuiz(page, 'RX AGC at max gain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[reference-check] observes the GPSDO', async () => {
    await missionControl.selectTab('gps-timing');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference Check');
  });

  test('[rx-chain-ready-sar2] retunes the modem to 1370 MHz and frames a 40 MHz span', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1370');
    await fillAndChange(page, '#sa-span', '40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-2');
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 23 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 23, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar2] program-tracks SAR-2 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-14T10:18:40Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-2', 60000);
  });

  test('[decode-sar2] holds RX lock above 8 dB before the carrier arrives', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-14T10:20:40Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode SAR-2 Clean', 60000);
  });

  test('[read-the-cycle] frames the 1374 MHz carrier in its first on-window and reads the cadence', async () => {
    // First on-window 10:23:30 .. 10:24:30.
    await advanceMissionClockToUtc(page, '2027-04-14T10:23:40Z');
    await missionControl.selectTab('rx-analysis');
    await fillAndChange(page, '#sa-center-freq', '1374');
    await fillAndChange(page, '#sa-span', '2');
    await page.waitForTimeout(3000); // RX Analysis stays on screen so the carrier read latches
    await answerSystemQuiz(page, 'Intent: accidents are continuous or erratic');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Cycle', 60000);
  });

  test('[call-the-cycle] reads the carrier and the key in an on-window, then calls it', async () => {
    // Second on-window 10:25:00 .. 10:26:00: the carrier-seen latch needs the
    // carrier present; the decision itself is graded on the envelope.
    await advanceMissionClockToUtc(page, '2027-04-14T10:25:05Z');
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(3000);
    await answerDecision(page, 'Deliberate interference - notch it, keep the pass', ['Carrier read on RX Analysis', 'RX key status read on RX Analysis']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call It');
  });

  test('[notch-the-carrier] notches 1374 MHz and reads why', async () => {
    await missionControl.selectTab('rx-analysis');
    await configureNotchFilter(page, { centerFrequency: 1374, bandwidth: 2, depth: 30, notchIndex: 0 });
    await answerSystemQuiz(page, 'The video is where it is');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Notch the Carrier', 60000);
  });

  test('[log-the-first-event] records event 1 after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-04-14T10:28:00Z');
    await answerSystemQuiz(page, '10:23:30 carrier 11726 MHz RF');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Log Event 1');
  });

  test('[rx-chain-ready-sar1] retunes the modem and analyzer for SAR-1', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1414');
    await fillAndChange(page, '#sa-span', '40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-1');
  });

  test('[acquire-sar1] retargets program-track to SAR-1', async () => {
    await programTrack(page, missionControl, '61701');
    await advanceMissionClockToUtc(page, '2027-04-14T10:40:40Z');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[decode-sar1-under-it] notches 1410 MHz and holds C/N above 7 dB', async () => {
    // Carrier 2 is on from 10:41:30; notch it, then ride the high-elevation segment.
    await advanceMissionClockToUtc(page, '2027-04-14T10:41:40Z');
    await missionControl.selectTab('rx-analysis');
    await configureNotchFilter(page, { centerFrequency: 1410, bandwidth: 2, depth: 30, notchIndex: 1 });
    await advanceMissionClockToUtc(page, '2027-04-14T10:43:20Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode SAR-1 Under It', 60000);
  });

  test('[it-followed-the-plan] records the implication', async () => {
    await answerSystemQuiz(page, 'Whoever runs it knows the frequency plan');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'It Followed the Plan');
  });

  test('[file-the-regulator-report] assembles the package after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-04-14T10:50:00Z');
    await answerSystemQuiz(page, 'Victim and interferer parameters');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'File the Regulator Package');
  });

  test('[close-and-debrief] writes the debrief line and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'The export is live');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
