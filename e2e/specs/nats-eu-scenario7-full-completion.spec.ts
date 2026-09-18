import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, expectDashboardAlarm, fillAndChange, loadEphemeris, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 7 "Moving Target" - full completion (phase 16).
 *
 * A baseline SAR-1 pass on current elements, then the SAR-2 avoidance burn at
 * 14:12 on the mission clock: the spacecraft moves, the station's element set
 * does not. Program-track on the stale set reads LOCKED while C/N sinks as the
 * bird rises; the operator loads the post-burn set, reacquires, verifies the
 * decode and reports. Sim clock starts 2027-03-15 13:45:00Z:
 *   MERIDIAN-SAR-1  AOS 14:03:10Z  max el 28.0 at 14:06:45Z  LOS 14:10:18Z
 *   MERIDIAN-SAR-2  AOS 14:18:42Z  max el 25.0 at 14:22:10Z  LOS 14:25:40Z
 *
 * Objective flow (16):
 *  1. review-mission-brief     2. dashboard-sweep        3. reference-check
 *  4. ephemeris-epoch-check    5. rx-chain-ready         6. preposition-for-aos
 *  7. acquire-sar1             8. baseline-decode        9. log-the-baseline
 * 10. retune-for-sar2        11. preposition-for-sar2  12. stale-acquisition-attempt
 * 13. load-the-ephemeris     14. reacquire-sar2        15. verify-the-reacquisition
 * 16. report-to-rotterdam
 */

/** Stage repeated fine-adjust clicks on one axis, then apply. */
async function jogAxis(page: Page, axisPrefix: 'az-fine' | 'el-fine', delta: number, clicks: number): Promise<void> {
  if (clicks <= 0) {
    return;
  }
  const selector = `[id^="${axisPrefix}"] .btn-fine[data-delta="${delta}"]`;
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 10000 });
  for (let i = 0; i < clicks; i++) {
    await domClick(page, selector);
  }
}

/** Read the ACU fine-control's current value for one axis (degrees). */
async function readAxis(page: Page, axisPrefix: 'az-fine' | 'el-fine'): Promise<number> {
  const text = (await page.locator(`[id^="${axisPrefix}"][id$="-value"]`).first().textContent()) ?? '0';
  return parseFloat(text.replace(/[^\d.+-]/gu, ''));
}

/** Jog one axis from wherever it is to a target, in 10 and 1 degree steps. */
async function jogAxisTo(page: Page, axisPrefix: 'az-fine' | 'el-fine', target: number): Promise<void> {
  const current = await readAxis(page, axisPrefix);
  const delta = Math.round(target - current);
  const sign = delta < 0 ? -1 : 1;
  await jogAxis(page, axisPrefix, sign * 10, Math.floor(Math.abs(delta) / 10));
  await jogAxis(page, axisPrefix, sign * 1, Math.abs(delta) % 10);
}

test.describe('nats-eu Scenario 7 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario7');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the conjunction notice', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'Pass predictions and program-track pointing');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Conjunction Notice');
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

  test('[ephemeris-epoch-check] reads both element sets as current', async () => {
    await missionControl.selectTab('pass-schedule');
    await answerSystemQuiz(page, 'A manoeuvre at once, or age');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Check the Element Sets');
  });

  test('[rx-chain-ready] retunes the modem and analyzer for SAR-1', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1389');
    await fillAndChange(page, '#sa-span', '2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-1');
  });

  test('[preposition-for-aos] slews the stowed tracker to the rise azimuth', async () => {
    await missionControl.selectTab('acu-control');
    // Stowed at az 180 / el 3; the rise is az 000 / el 5 (tolerance 3 deg).
    await jogAxis(page, 'az-fine', -10, 18);
    await jogAxis(page, 'el-fine', 1, 2);
    await domClick(page, '[id$="apply-changes-btn"]');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar1] program-tracks SAR-1 on current elements', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:03:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[baseline-decode] decodes the baseline and reads the curve', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:05:40Z');
    await page.waitForTimeout(2500);
    await advanceMissionClockToUtc(page, '2027-03-15T14:06:40Z');
    await answerSystemQuiz(page, 'Climbed steadily with elevation');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Baseline Pass', 60000);
  });

  test('[log-the-baseline] logs the SAR-1 result after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:10:30Z');
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'program-track locked, decoded, peak C/N about 11 dB');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Log the Baseline');
  });

  test('[retune-for-sar2] retunes for SAR-2 after the burn', async () => {
    // The burn fires at 14:12:00 on the mission clock
    await advanceMissionClockToUtc(page, '2027-03-15T14:12:30Z');
    await closeWorkingDocumentIfOpen(page);
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1397');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Retune for SAR-2');
  });

  test('[preposition-for-sar2] parks the tracker on the SAR-2 rise azimuth', async () => {
    await missionControl.selectTab('acu-control');
    await domClick(page, '.btn-tracking[data-mode="manual"]');
    await page.waitForTimeout(500);
    await jogAxisTo(page, 'az-fine', 130);
    await jogAxisTo(page, 'el-fine', 5);
    await domClick(page, '[id$="apply-changes-btn"]');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for SAR-2', 60000);
  });

  test('[stale-acquisition-attempt] locks on the old prediction and watches C/N sink', async () => {
    await programTrack(page, missionControl, '61702');
    await advanceMissionClockToUtc(page, '2027-03-15T14:19:00Z');
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:20:30Z');
    await answerSystemQuiz(page, 'The pedestal is locked to a prediction');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Attempt SAR-2 on the Old Elements', 60000);
  });

  test('[load-the-ephemeris] loads the post-burn elements', async () => {
    // Let the panel re-render as STALE on this tab before pressing Load; a
    // click that arrives during the tab switch is lost.
    await missionControl.selectTab('pass-schedule');
    await expect(page.locator('#ephemeris-panel .ephemeris-badge-stale')).toBeVisible({ timeout: 15000 });
    await loadEphemeris(page, missionControl, 'SAR2-CAM');
    await answerSystemQuiz(page, 'The epoch: the post-burn set');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Load the Post-Burn Elements');
  });

  test('[reacquire-sar2] sees the carrier come up on the new set', async () => {
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reacquire MERIDIAN-SAR-2', 60000);
  });

  test('[verify-the-reacquisition] holds lock above 8 dB', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:21:30Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Verify the Reacquisition', 60000);
  });

  test('[report-to-rotterdam] files the report and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'That the post-burn set was loaded');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });
    await expect(levelCompleteModal.locator('.complete-modal__title')).toContainText('Mission Complete');

    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();
    const score = parseInt((await totalScore.textContent()) || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});
