import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { domClick } from '../utils/signal-hunter-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 26 "Baseline Check" (Drill 2/4, phase 18 G) - full
 * completion. RX modem 1 is staged at 1410 against a 1414 baseline; the log
 * carries the vendor change. The drift is read on RX Analysis, the log
 * reviewed, the call graded on config-drifted BEFORE anything is flagged,
 * the baseline restored, the entries flagged, the account held, the access
 * request confirmed, the sweep logged.
 */
test.describe('nats-eu Scenario 26 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario26');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] opens the sweep sheet', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Sweep Sheet');
  });

  test('[the-baseline] says what the baseline is for', async () => {
    await answerSystemQuiz(page, 'It is the known-good state');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'What the Baseline Is For');
  });

  test('[check-against-baseline] reads 1410 on the modem, reviews the log, names the drift', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('rx-analysis');
    await expect(page.locator('#frequency-input')).toHaveValue('1410', { timeout: 10000 });
    await page.waitForTimeout(3000);
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-audit-body')).toContainText('1414 -> 1410 MHz', { timeout: 10000 });
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await answerSystemQuiz(page, 'RX modem 1 is at 1410 MHz; the baseline says 1414');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Check the Receiver');
  });

  test('[call-the-drift] calls unauthorised drift with the modem read as evidence', async () => {
    await missionControl.selectTab('rx-analysis');
    await expect(page.locator('#frequency-input')).toHaveValue('1410');
    await page.waitForTimeout(3500);
    await answerDecision(page, 'Drift, unauthorised', ['RX modem 1 reading 1410 MHz on the console']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call the Drift');
  });

  test('[restore-the-baseline] sets RX modem 1 back to 1414', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await expect(page.locator('#frequency-input')).toHaveValue('1414');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Restore the Baseline');
  });

  test('[flag-the-change] flags the vendor login and the change', async () => {
    await missionControl.selectTab('security-console');
    await domClick(page, 'button[data-event-id="evt-vendor-login"]');
    await domClick(page, 'button[data-event-id="evt-cfg-freq"]');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Flag the Entries');
  });

  test('[hold-the-account] disables the vendor account', async () => {
    const select = page.locator('select.sec-account-select[data-account-id="svc-vendor"]');
    await expect(select).toBeVisible({ timeout: 10000 });
    await select.selectOption('disabled');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Hold the Vendor Account');
  });

  test('[confirm-access] confirms the access request', async () => {
    await answerSystemQuiz(page, 'That the request (SAR-2027-0429-011)');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Confirm the Access Request');
  });

  test('[log-the-sweep] logs the sweep and completes', async () => {
    await answerSystemQuiz(page, '05:30 sweep: RX modem 1 found at 1410');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#level-complete-modal')).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
