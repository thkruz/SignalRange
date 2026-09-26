import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen } from '../utils/nats-eu-helpers';
import { domClick } from '../utils/signal-hunter-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 27 "Removable Media" (Drill 3/4, phase 18 G) - full
 * completion. Log reviewed, off-plan entries named, the media entry flagged
 * as evidence, the call graded on config-drifted (the firmware stage still
 * unflagged), verification path stated, firmware entry flagged, technician
 * account suspended, transfer rule and OT reasoning stated, event logged.
 */
test.describe('nats-eu Scenario 27 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario27');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] opens the service plan', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Service Plan');
  });

  test('[review-the-log] reviews the log and names the two off-plan entries', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-audit-body')).toContainText('USB mass-storage device mounted', { timeout: 10000 });
    await expect(page.locator('#sec-audit-body')).toContainText('acu-4.2.1-vendor.bin');
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await quiz('07:41 USB mass storage mounted', 'Find What Is Off the Plan');
  });

  test('[call-the-media] flags the media entry, then holds the image', async () => {
    await missionControl.selectTab('security-console');
    await domClick(page, 'button[data-event-id="evt-usb"]');
    await page.waitForTimeout(3500);
    await answerDecision(page, 'No. Hold the staged image', ['USB mount flagged']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call It');
  });

  test('[verify-the-image] states the verification path', async () => {
    await quiz('A release the vendor publishes with a signature and a hash', 'How the Image Earns Trust');
  });

  test('[flag-the-firmware] flags the firmware stage', async () => {
    await missionControl.selectTab('security-console');
    await domClick(page, 'button[data-event-id="evt-fw-stage"]');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Flag the Firmware Stage');
  });

  test('[hold-the-technician] suspends the technician account', async () => {
    const select = page.locator('select.sec-account-select[data-account-id="vend-tech"]');
    await expect(select).toBeVisible({ timeout: 10000 });
    await select.selectOption('disabled');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Suspend the Technician');
  });

  test('[the-transfer-rule, why-not-a-laptop] states the rule and the OT reasoning', async () => {
    await quiz('Through the transfer station', 'The Right Way In');
    await quiz('Because the workstation is on the segment that controls the antenna', 'Why Not Just Scan It');
  });

  test('[log-the-event] logs the event and completes', async () => {
    await answerSystemQuiz(page, '07:41 USB mounted on GW-MC-01 by vend-tech');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#level-complete-modal')).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
