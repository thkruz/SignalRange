import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen } from '../utils/nats-eu-helpers';
import { domClick } from '../utils/signal-hunter-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 28 "Vendor Session" (Drill 4/4, phase 18 G) - full
 * completion. Flow baseline stated, log reviewed, the session entry flagged
 * as evidence, the call graded on audit-anomaly-present (two anomalies still
 * unflagged), the vendor account disabled, the flow and burst flagged, the
 * boundary and the reach stated, the event logged.
 */
test.describe('nats-eu Scenario 28 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const quiz = async (answer: string, title: string): Promise<void> => {
    await answerSystemQuiz(page, answer);
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, title);
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario28');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] opens the flow baseline', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Flow Baseline');
  });

  test('[read-the-baseline] states what normal looks like', async () => {
    await quiz('Workstation and monitoring service to the ACU', 'What Normal Looks Like');
  });

  test('[review-the-log] reads the log against the baseline', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-audit-body')).toContainText('185.199.74.20', { timeout: 10000 });
    await expect(page.locator('#sec-audit-body')).toContainText('ACU parameter read burst');
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Log Against the Baseline');
  });

  test('[call-the-session] flags the session entry, then cuts it', async () => {
    await missionControl.selectTab('security-console');
    await domClick(page, 'button[data-event-id="evt-vpn"]');
    await page.waitForTimeout(3500);
    await answerDecision(page, 'Cutting it. Disable the vendor account now', ['Remote session flagged']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call the Session');
  });

  test('[cut-the-session] disables the vendor account', async () => {
    const select = page.locator('select.sec-account-select[data-account-id="svc-vendor"]');
    await expect(select).toBeVisible({ timeout: 10000 });
    await select.selectOption('disabled');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Disable the Vendor Account');
  });

  test('[flag-the-flows] flags the flow and the burst', async () => {
    await domClick(page, 'button[data-event-id="evt-flow"]');
    await domClick(page, 'button[data-event-id="evt-acu-burst"]');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Flag the Flow and the Burst');
  });

  test('[the-boundary, what-it-could-reach] states the boundary and the reach', async () => {
    await quiz('At the site edge', 'The Boundary It Crossed');
    await quiz('Everything on the monitor-and-control path', 'What It Could Reach');
  });

  test('[log-the-event] logs, notifies, and completes', async () => {
    await answerSystemQuiz(page, '21:12 vendor remote session (svc-vendor');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#level-complete-modal')).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
