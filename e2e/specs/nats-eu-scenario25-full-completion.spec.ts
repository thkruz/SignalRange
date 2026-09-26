import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerPendingQuizFrom, answerSystemQuiz, closeWorkingDocumentIfOpen } from '../utils/nats-eu-helpers';
import { domClick } from '../utils/signal-hunter-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 25 "Site Orientation" (Drill 1/4, phase 18 G) - full
 * completion. Ten status-check stops, two of them anchored to a console tab.
 */
test.describe('nats-eu Scenario 25 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const stop = async (answer: string, title: string): Promise<void> => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario25');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] opens the orientation sheet', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Orientation Sheet');
  });

  test('[stops 1-6] the threat model', async () => {
    await stop('Ground segment: GW-01 and Rotterdam constellation ops', 'Stop 1 - The Segments');
    await stop('Launch and early orbit', 'Stop 2 - Across the Lifetime');
    await stop('Rotation: the operator proposes', 'Stop 3 - Who Decides');
    await stop('The ground is reachable', 'Stop 4 - The Soft Target');
    await stop('Carrier: degrade. Spoofed time: deceive', 'Stop 5 - The Effects');
    await stop('One SAR-2 collect over the North Atlantic not delivered', 'Stop 6 - What Is Lost');
  });

  test('[stop 7] the M&C path, with the Security console open', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-audit-body')).toBeVisible({ timeout: 10000 });
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await stop('Workstation (M&C client) -> M&C network segment', 'Stop 7 - The Monitor-and-Control Path');
  });

  test('[stop 8] not ordinary IT, two questions in either order', async () => {
    const answers = [
      { questionHint: 'Stop 8a', answerText: 'Availability first' },
      { questionHint: 'Stop 8b', answerText: 'Between M&C and the corporate network' },
    ];
    const first = await answerPendingQuizFrom(page, answers);
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    const second = await answerPendingQuizFrom(page, answers);
    expect(new Set([first, second]).size).toBe(2);
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Stop 8 - Not Ordinary IT');
  });

  test('[stop 9] the antenna pattern, with RX Analysis open', async () => {
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(500);
    await stop('Through a sidelobe', 'Stop 9 - The Pattern');
  });

  test('[stop 10] outside the fence, and the drill completes', async () => {
    await answerSystemQuiz(page, 'The contact schedule (when the dish will be pointed where)');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#level-complete-modal')).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
