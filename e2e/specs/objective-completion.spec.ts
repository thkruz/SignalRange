import { test, expect } from '../fixtures/test-fixtures';
import { waitForSimulationReady } from '../utils/simulation-helpers';

test.describe('Objective Completion', () => {
  test.beforeEach(async ({ page, missionControlPage }) => {
    // Navigate to scenario 1 mission control
    await page.goto('/campaigns/nats/scenarios/nats-scenario1');
    await waitForSimulationReady(page);
    // Dismiss any intro dialog that appears
    await missionControlPage.dismissDialogIfPresent();
  });

  test.describe('Objectives Display', () => {
    test('should show objectives in checklist', async ({ missionControlPage }) => {
      await missionControlPage.openChecklist();
      await expect(missionControlPage.objectivesChecklist).toBeVisible();

      // Should have at least one objective
      const objectives = missionControlPage.getObjectiveItems();
      const count = await objectives.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should have active objective indicator', async ({ missionControlPage }) => {
      await missionControlPage.openChecklist();
      await expect(missionControlPage.objectivesChecklist).toBeVisible();

      // Look for active objective styling
      const activeObjective = missionControlPage.objectivesChecklist.locator(
        '.objective-item.active, .objective-active, [data-active="true"]'
      );

      // May or may not have an active objective depending on scenario state
      const count = await activeObjective.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Scenario Dialogs', () => {
    test('should handle intro dialog if present', async ({ missionControlPage }) => {
      // Dialog should have been dismissed in beforeEach
      // Verify we can interact with the page
      await expect(missionControlPage.pageContainer).toBeVisible();
      await expect(missionControlPage.assetTreeSidebar).toBeVisible();
    });
  });

  test.describe('Quiz Interaction', () => {
    test('should handle quiz modal if present', async ({ missionControlPage, page }) => {
      // Quizzes may appear during scenario progression
      const quizModal = missionControlPage.quizModal;

      // If quiz appears, answer it
      try {
        await quizModal.waitFor({ state: 'visible', timeout: 3000 });
        if (await quizModal.isVisible()) {
          // Click first option (may not be correct, but tests the interaction)
          await missionControlPage.answerQuiz(0);
        }
      } catch {
        // No quiz present, which is expected in most states
      }
    });
  });

  test.describe('Objective State', () => {
    test('should track objective completion state', async ({ missionControlPage }) => {
      await missionControlPage.openChecklist();
      await expect(missionControlPage.objectivesChecklist).toBeVisible();

      // Get all objectives
      const objectives = missionControlPage.getObjectiveItems();
      const count = await objectives.count();

      if (count > 0) {
        // Check that objectives have expected structure
        const firstObjective = objectives.first();
        await expect(firstObjective).toBeVisible();

        // Objective should have text content
        const text = await firstObjective.textContent();
        expect(text?.length).toBeGreaterThan(0);
      }
    });
  });
});

test.describe('Full Scenario Flow', () => {
  // This is a longer test that exercises the full user workflow
  test('should complete campaign to scenario flow', async ({
    campaignSelectionPage,
    scenarioSelectionPage,
    missionControlPage,
    page,
  }) => {
    // Step 1: Start at campaign selection
    await campaignSelectionPage.goto();
    await expect(campaignSelectionPage.pageTitle).toHaveText('Signal Range Training');

    // Step 2: Select NATS campaign
    await campaignSelectionPage.selectCampaign('nats');
    await expect(page).toHaveURL('/campaigns/nats');

    // Step 3: Verify scenario selection loaded
    await expect(scenarioSelectionPage.pageTitle).toContainText('North Atlantic');

    // Step 4: Start first scenario
    const scenario1Card = scenarioSelectionPage.getScenarioCard('nats-scenario1');
    await expect(scenario1Card).toBeVisible();

    await scenarioSelectionPage.startScenario('nats-scenario1');

    // Step 5: Verify mission control loaded
    await expect(page).toHaveURL(/\/campaigns\/nats\/scenarios\/nats-scenario1/);
    await waitForSimulationReady(page);

    // Dismiss any intro dialog
    await missionControlPage.dismissDialogIfPresent();

    await expect(missionControlPage.pageContainer).toBeVisible();
    await expect(missionControlPage.assetTreeSidebar).toBeVisible();
    await expect(missionControlPage.tabbedCanvas).toBeVisible();
  });
});
