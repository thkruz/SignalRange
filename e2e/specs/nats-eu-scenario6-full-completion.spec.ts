import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, fillAndChange, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 6 "Watch the Watchers" - full completion (phase 16).
 *
 * The monthly security baseline done around a routine shift: sweep and
 * receiver set-up, the audit trail read and two benign warnings dispositioned
 * before the SAR-1 pass, the pass decoded, then the finding flagged, the
 * contractor account disabled, the lapsed relief account expired, SAR-2
 * retuned and decoded, and the return filed. Sim clock starts
 * 2027-03-15 13:45:00Z:
 *   MERIDIAN-SAR-1  AOS 14:03:10Z  max el 28.0 at 14:06:45Z  LOS 14:10:18Z
 *   MERIDIAN-SAR-2  AOS 14:18:42Z  max el 25.0 at 14:22:10Z  LOS 14:25:40Z
 *
 * Objective flow (15):
 *  1. review-mission-brief        2. dashboard-sweep              3. reference-check
 *  4. rx-chain-ready              5. read-the-audit-log           6. disposition-new-address
 *  7. disposition-poll-change     8. acquire-sar1                 9. decode-sar1
 * 10. flag-the-off-hours-failures 11. close-the-contractor-account 12. expire-the-relief-account
 * 13. retune-for-sar2            14. decode-sar2                 15. close-the-baseline
 */

/** Set an account's status on the Security console access-control panel. */
async function setAccountStatus(page: Page, accountId: string, status: 'active' | 'disabled' | 'expired'): Promise<void> {
  const select = page.locator(`select.sec-account-select[data-account-id="${accountId}"]`);
  await expect(select).toBeVisible({ timeout: 10000 });
  await select.selectOption({ value: status });
}

test.describe('nats-eu Scenario 6 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario6');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the baseline task', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'The whole audit trail read');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Baseline Task');
  });

  test('[dashboard-sweep] confirms a clean board', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'No active alarms');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[reference-check] observes the GPSDO', async () => {
    await missionControl.selectTab('gps-timing');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference Check');
  });

  test('[rx-chain-ready] retunes the modem and analyzer for SAR-1', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1389');
    await fillAndChange(page, '#sa-span', '2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-1');
  });

  test('[read-the-audit-log] signs off the trail', async () => {
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-mark-reviewed')).toBeVisible({ timeout: 10000 });
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await answerSystemQuiz(page, 'You do not know yet');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Station Audit Log');
  });

  test('[disposition-new-address] flags the Shetland login as benign', async () => {
    await domClick(page, 'button[data-event-id="evt-login-fiona"]');
    await answerSystemQuiz(page, 'Benign: SH-02 went operational');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Disposition the New-Address Login');
  });

  test('[disposition-poll-change] flags the poll-interval change as benign', async () => {
    await domClick(page, 'button[data-event-id="evt-svc-interval"]');
    await answerSystemQuiz(page, 'Benign: a service account');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Disposition the Poll-Interval Change');
  });

  test('[acquire-sar1] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:03:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[decode-sar1] holds RX lock above 8 dB', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:05:40Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Routine Downlink', 60000);
  });

  test('[flag-the-off-hours-failures] flags the finding after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-03-15T14:10:30Z');
    await missionControl.selectTab('security-console');
    await domClick(page, 'button[data-event-id="evt-authfail"]');
    await answerSystemQuiz(page, 'Finding: an account that should no longer exist');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Flag the Off-Hours Failures');
  });

  test('[close-the-contractor-account] disables the contractor account', async () => {
    await setAccountStatus(page, 'op-guest', 'disabled');
    await answerSystemQuiz(page, 'An account that exists can be attacked');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Close the Contractor Account');
  });

  test('[expire-the-relief-account] expires the lapsed relief account', async () => {
    await setAccountStatus(page, 'op-relief', 'expired');
    await answerSystemQuiz(page, 'Expired records that the authorisation lapsed');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Expire the Relief Account');
  });

  test('[retune-for-sar2] retunes the modem and analyzer for SAR-2', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1397');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Retune for SAR-2');
  });

  test('[decode-sar2] retargets to SAR-2 and decodes it', async () => {
    await programTrack(page, missionControl, '61702');
    await advanceMissionClockToUtc(page, '2027-03-15T14:19:20Z');
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-15T14:21:40Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Second Downlink', 60000);
  });

  test('[close-the-baseline] files the return and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'A dormant account with maintenance privileges');
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
