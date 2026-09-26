import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, assignContact, closeWorkingDocumentIfOpen, expectDashboardAlarm, fillAndChange, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 5 "Shetland Comes Online" - full completion (phase 16).
 *
 * Galway sweep, the four-contact plan split across the two sites, then the
 * Shetland console taken remotely: sweep, geometry, receiver, park, and the
 * SAR-1 pass flown FROM SH-02 (per-station propagation). Hand back, retune
 * Galway and work SAR-2 from home, then the network log. Sim clock starts
 * 2027-03-15 13:40:00Z:
 *   SH-02 MERIDIAN-SAR-1  AOS 14:01:14Z  max el 23.8 at 14:04:42Z  LOS 14:08:09Z
 *   GW-01 MERIDIAN-SAR-2  AOS 14:18:42Z  max el 25.0 at 14:22:10Z  LOS 14:25:40Z
 *
 * Objective flow (17):
 *  1. review-mission-brief       2. galway-dashboard-sweep   3. galway-reference-check
 *  4. allocate-galway            5. hand-shetland-the-overlaps 6. validate-the-plan
 *  7. shetland-sweep             8. shetland-geometry        9. shetland-rx-ready
 * 10. shetland-preposition      11. acquire-from-shetland   12. decode-from-shetland
 * 13. read-shetland-peak        14. hand-back-to-galway     15. acquire-sar2-galway
 * 16. decode-sar2-galway        17. log-the-network
 */

/** Stage repeated fine-adjust clicks on one axis of the selected station's ACU. */
async function jogAxis(page: Page, axisPrefix: 'az-fine' | 'el-fine', delta: number, clicks: number): Promise<void> {
  const selector = `[id^="${axisPrefix}"] .btn-fine[data-delta="${delta}"]`;
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 10000 });
  for (let i = 0; i < clicks; i++) {
    await domClick(page, selector);
  }
}

test.describe('nats-eu Scenario 5 Full Completion', () => {
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
    // Direct navigation bypasses the nats-eu-scenario4 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario5');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the network brief', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'One antenna points at one satellite');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Network Brief');
  });

  test('[galway-dashboard-sweep] reads the board: AGC rail, no faults', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await expectDashboardAlarm(page, 'AGC at max gain');
    await answerSystemQuiz(page, 'RX AGC at max gain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[galway-reference-check] observes the Galway GPSDO', async () => {
    await missionControl.selectTab('gps-timing');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Reference Check');
  });

  test('[allocate-galway] gives Galway its two contacts', async () => {
    await missionControl.selectTab('contact-schedule');
    await expect(page.locator('#cs-plan-badge')).toHaveText('UNALLOCATED');
    await assignContact(page, 'SAR1-GW', 'GW-01');
    await assignContact(page, 'SAR2-GW', 'GW-01');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Allocate the Galway Contacts');
  });

  test('[hand-shetland-the-overlaps] gives Shetland the overlapping pair', async () => {
    await assignContact(page, 'SAR1-SH', 'SH-02');
    await assignContact(page, 'SAR2-SH', 'SH-02');
    await answerSystemQuiz(page, 'It must be allocated - priority 2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Hand Shetland the Overlaps');
  });

  test('[validate-the-plan] reads DECONFLICTED and publishes', async () => {
    await expect(page.locator('#cs-conflict-count')).toHaveText('0');
    await expect(page.locator('#cs-plan-badge')).toHaveText('DECONFLICTED');
    await answerSystemQuiz(page, 'Every contact gets worked');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Validate the Contact Plan');
  });

  test('[shetland-sweep] sweeps SH-02 from the Galway console', async () => {
    await missionControl.selectGroundStation('SH-02');
    for (const tab of ['gps-timing', 'tx-chain', 'rx-analysis']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Shetland Health Check');
  });

  test('[shetland-geometry] reads the pass as Shetland sees it', async () => {
    await missionControl.selectTab('pass-schedule');
    await answerSystemQuiz(page, 'Southbound track west of Ireland');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, "Read Shetland's Sky");
  });

  test('[shetland-rx-ready] retunes the Shetland modem and analyzer', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1389');
    await fillAndChange(page, '#sa-span', '2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Shetland Receiver');
  });

  test('[shetland-preposition] slews the stowed Shetland tracker to the rise azimuth', async () => {
    await missionControl.selectTab('acu-control');
    // Stowed at az 180 / el 3; the rise is az 003 / el 5 (tolerance 3 deg).
    await jogAxis(page, 'az-fine', -10, 18);
    await jogAxis(page, 'az-fine', 1, 3);
    await jogAxis(page, 'el-fine', 1, 2);
    await domClick(page, '[id$="apply-changes-btn"]');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position the Shetland Tracker', 60000);
  });

  test('[acquire-from-shetland] program-tracks SAR-1 on the SH-02 pedestal', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:01:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1 from Shetland', 60000);
  });

  test('[decode-from-shetland] holds lock above 8 dB from Shetland', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:03:50Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode from Shetland', 60000);
  });

  test('[read-shetland-peak] reads the Shetland culmination', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:04:30Z');
    await answerSystemQuiz(page, 'Slant range: 860 km');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Shetland Peak', 60000);
  });

  test('[hand-back-to-galway] returns to GW-01 and retunes it for SAR-2', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:09:00Z');
    await missionControl.selectGroundStation('GW-01');
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1397');
    await missionControl.selectTab('acu-control');
    // Parked at az 5 / el 3; the SAR-2 rise is az 130 / el 5.
    await jogAxis(page, 'az-fine', 10, 12);
    await jogAxis(page, 'az-fine', 1, 5);
    await jogAxis(page, 'el-fine', 1, 2);
    await domClick(page, '[id$="apply-changes-btn"]');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Hand Back and Retune Galway', 60000);
  });

  test('[acquire-sar2-galway] program-tracks SAR-2 from Galway', async () => {
    await programTrack(page, missionControl, '61702');
    await advanceMissionClockToUtc(page, '2027-03-15T14:19:20Z');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-2', 60000);
  });

  test('[decode-sar2-galway] decodes SAR-2 and compares the overhead', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:21:40Z');
    await answerSystemQuiz(page, "Shetland's, by about 6.5 dB");
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Galway Contact', 60000);
  });

  test('[log-the-network] writes the network log and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Site and peak per contact');
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
