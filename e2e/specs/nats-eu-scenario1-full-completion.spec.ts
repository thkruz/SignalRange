import { expect, Locator, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 1 "First Light Over Galway" - full completion.
 *
 * Unlike the GEO scenarios, objectives here are separated by LEO pass
 * geometry: MERIDIAN-SAR-1 rises at T+2 min and the >= 8 dB decode window is
 * roughly T+6..T+10; MERIDIAN-SAR-2's window is T+22..T+26 (envelope locked
 * by test/campaigns/nats-eu-rf-validation.test.ts). Waiting wall-clock for
 * that is not viable in CI, so the spec drives the scenario clock with the
 * window.advanceSimClock developer hook (OpsLogManager) - all orbital physics
 * read absolute sim time and follow on the next tick.
 *
 * Completion is verified by reading the actual checklist `.objective-item`
 * state class (the shared waitForObjectiveCompleted helper keys off a quiz
 * button that is absent for these mostly quiz-free objectives). The final
 * objective waits on the Mission Complete modal instead, since it freezes the
 * checklist the moment it appears.
 *
 * Objective flow:
 * 1. review-mission-brief  - open brief + SYSTEM readiness quiz
 * 2. review-pass-schedule  - Pass Schedule tab
 * 3. track-meridian-1      - program-track SAR-1 + beacon observed on RX analysis
 * 4. decode-sar-video      - RX lock + C/N >= 8 dB observed during the window
 * 5. second-contact        - retune 1370 MHz, retarget, lock SAR-2
 *
 * second-contact is isOptional, but the completion gate
 * (areAllObjectivesCompleted) still requires every objective, so it is driven
 * here too to reach the Mission Complete modal.
 */

/**
 * Answer a SYSTEM status-check quiz and dismiss the "Correct!" feedback.
 *
 * A correct answer renders a #quiz-continue-btn inside #quiz-feedback that
 * emits QUIZ_COMPLETED (the shared answerQuizByText helper's broad Continue
 * selector can miss it), so click the option then that specific button.
 * Objective completion is asserted by the caller via the checklist state.
 */
async function answerReadinessQuiz(page: Page, answerText: string): Promise<void> {
  await waitForQuizToAppear(page);

  const option = page.locator('.quiz-option-btn', { hasText: answerText });
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();

  const feedbackContinue = page.locator('#quiz-continue-btn');
  await expect(feedbackContinue).toBeVisible({ timeout: 5000 });
  await feedbackContinue.click();
}

/** Jump the scenario clock forward (sim minutes) and let the sim settle. */
async function advanceSimClock(page: Page, minutes: number): Promise<void> {
  await page.waitForFunction(() => typeof (window as any).advanceSimClock === 'function');
  await page.evaluate((ms) => (window as any).advanceSimClock(ms), minutes * 60_000);
  await page.waitForTimeout(3000); // pedestal slews onto the post-jump geometry
}

/** The checklist `.objective-item` whose title matches, regardless of collapse. */
function objectiveItem(missionControl: MissionControlPage, title: string): Locator {
  return missionControl.objectivesChecklist.locator('.objective-item', { hasText: title });
}

/** Poll the checklist until the named objective carries the `completed` class. */
async function waitForObjectiveComplete(
  missionControl: MissionControlPage,
  title: string,
  timeout = 45000,
): Promise<void> {
  if (!(await missionControl.objectivesChecklist.isVisible().catch(() => false))) {
    await missionControl.openChecklist();
  }
  await expect(objectiveItem(missionControl, title)).toHaveClass(/completed/, { timeout });
}

/** Enable program-track on the ACU tab, then select the target satellite. */
async function programTrack(page: Page, missionControl: MissionControlPage, noradId: string): Promise<void> {
  await missionControl.selectTab('acu-control');

  // The target selector only becomes visible once program-track mode is chosen
  const modeButton = page.locator('.btn-tracking[data-mode="program-track"]');
  await expect(modeButton).toBeVisible({ timeout: 10000 });
  await modeButton.click();
  await page.waitForTimeout(300);

  const satelliteSelect = page.locator('select[id$="satellite-select"]');
  await expect(satelliteSelect).toBeVisible({ timeout: 10000 });
  await satelliteSelect.selectOption({ value: noradId });

  const moveBtn = page.locator('button[id$="move-to-target-btn"]');
  if (await moveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    if (await moveBtn.isEnabled().catch(() => false)) {
      await moveBtn.click();
    }
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

  test('[review-mission-brief] opens the shift brief and confirms readiness', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerReadinessQuiz(page, 'Yes, brief reviewed. Ready for AOS.');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Shift Brief');
  });

  test('[review-pass-schedule] reviews the contact schedule', async () => {
    // Station tabs render only after GW-01 is selected in the asset tree
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('pass-schedule');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Contact Schedule');
  });

  test('[track-meridian-1] program-tracks SAR-1 and observes the beacon', async () => {
    // Jump into the SAR-1 pass (AOS T+2) so the bird is up before targeting it
    await advanceSimClock(page, 4);

    await programTrack(page, missionControl, '61701');

    // Beacon detection requires observation on the RX analysis tab
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Track MERIDIAN-SAR-1');
  });

  test('[decode-sar-video] holds RX lock with C/N above 8 dB', async () => {
    // Move to the high-elevation segment (C/N crosses 8 dB near 25 deg el)
    await advanceSimClock(page, 2.5);

    // Modem 1 is pre-tuned to 1414 MHz; observing on RX analysis latches
    // receiver-signal-locked and receiver-snr-threshold
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the SAR Imagery Downlink');
  });

  test('[second-contact] retunes to 1370 MHz and captures SAR-2', async () => {
    // Retune RX modem 1 to the SAR-2 video IF (1370 MHz) while still on SAR-1
    await missionControl.selectTab('rx-analysis');
    const frequencyInput = page.locator('#frequency-input');
    await expect(frequencyInput).toBeVisible({ timeout: 10000 });
    await frequencyInput.fill('1370');
    const applyBtn = page.locator('#apply-btn');
    await expect(applyBtn).toBeEnabled({ timeout: 5000 });
    await applyBtn.click();

    // Jump to the SAR-2 pass (AOS T+17.5; retarget + settle) and track it
    await advanceSimClock(page, 12);
    await programTrack(page, missionControl, '61702');
    await advanceSimClock(page, 3.5); // into the SAR-2 max-el window (~T+22, 25 deg)
    await page.waitForTimeout(4000);

    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);

    // Second-contact is the final objective; its completion pops the Mission
    // Complete modal (which freezes the checklist), so wait on the modal itself
    // rather than the checklist objective-item class.
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
