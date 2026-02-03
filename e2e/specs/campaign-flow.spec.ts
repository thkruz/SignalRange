import { test, expect } from '../fixtures/test-fixtures';

test.describe('Campaign Flow', () => {
  test.describe('Campaign Selection', () => {
    test('should display NATS campaign as available', async ({ campaignSelectionPage }) => {
      await campaignSelectionPage.goto();

      const natsCard = campaignSelectionPage.getCampaignCard('nats');
      await expect(natsCard).toBeVisible();
      await expect(natsCard).not.toHaveClass(/disabled/);

      // Should have campaign info
      await expect(natsCard.locator('.campaign-title')).toContainText('North Atlantic');
    });

    test('should show campaign metadata badges', async ({ campaignSelectionPage }) => {
      await campaignSelectionPage.goto();

      const natsCard = campaignSelectionPage.getCampaignCard('nats');

      // Should have duration and difficulty badges
      await expect(natsCard.locator('.badge.duration')).toBeVisible();
      await expect(natsCard.locator('.badge[class*="difficulty"]')).toBeVisible();
    });
  });

  test.describe('Scenario Selection', () => {
    test('should show scenarios after selecting NATS campaign', async ({
      campaignSelectionPage,
      scenarioSelectionPage,
    }) => {
      await campaignSelectionPage.goto();
      await campaignSelectionPage.selectCampaign('nats');

      await expect(scenarioSelectionPage.pageTitle).toContainText('North Atlantic');
      await expect(scenarioSelectionPage.scenarioGrid).toBeVisible();
    });

    test('should display first scenario as available', async ({ scenarioSelectionPage }) => {
      await scenarioSelectionPage.gotoCampaign('nats');

      const scenario1 = scenarioSelectionPage.getScenarioCard('nats-scenario1');
      await expect(scenario1).toBeVisible();
      await expect(scenario1).not.toHaveClass(/disabled/);
    });

    test('should show scenario metadata', async ({ scenarioSelectionPage }) => {
      await scenarioSelectionPage.gotoCampaign('nats');

      const scenario1 = scenarioSelectionPage.getScenarioCard('nats-scenario1');

      // Should have scenario number, title, and badges
      await expect(scenario1.locator('.scenario-number')).toContainText('Scenario');
      await expect(scenario1.locator('.scenario-title')).toBeVisible();
      await expect(scenario1.locator('.badge.duration')).toBeVisible();
    });

    test('should have start button for new scenario', async ({ scenarioSelectionPage }) => {
      await scenarioSelectionPage.gotoCampaign('nats');

      const scenario1 = scenarioSelectionPage.getScenarioCard('nats-scenario1');
      const startButton = scenario1.locator('.btn-start');

      await expect(startButton).toBeVisible();
      await expect(startButton).toHaveText('Start');
    });

    test('should show campaign progress info', async ({ scenarioSelectionPage }) => {
      await scenarioSelectionPage.gotoCampaign('nats');

      // Progress should show 0 completed initially
      await expect(scenarioSelectionPage.campaignProgress).toContainText('0');
      await expect(scenarioSelectionPage.campaignProgress).toContainText('scenarios completed');
    });

    test('should get correct scenario count', async ({ scenarioSelectionPage }) => {
      await scenarioSelectionPage.gotoCampaign('nats');

      const count = await scenarioSelectionPage.getScenarioCount();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Scenario Navigation', () => {
    test('should navigate to mission control when starting scenario', async ({
      scenarioSelectionPage,
      page,
    }) => {
      await scenarioSelectionPage.gotoCampaign('nats');
      await scenarioSelectionPage.startScenario('nats-scenario1');

      // Should navigate to mission control
      await expect(page).toHaveURL(/\/campaigns\/nats\/scenarios\/nats-scenario1/);
    });
  });
});
