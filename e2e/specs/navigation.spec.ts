import { test, expect } from '../fixtures/test-fixtures';

test.describe('Navigation', () => {
  test('should load campaign selection page at root URL', async ({ campaignSelectionPage }) => {
    await campaignSelectionPage.goto();

    await expect(campaignSelectionPage.pageTitle).toHaveText('Signal Range Training');
    await expect(campaignSelectionPage.subtitle).toContainText('Select a campaign');
    await expect(campaignSelectionPage.campaignGrid).toBeVisible();
  });

  test('should display NATS campaign card', async ({ campaignSelectionPage }) => {
    await campaignSelectionPage.goto();

    const natsCard = campaignSelectionPage.getCampaignCard('nats');
    await expect(natsCard).toBeVisible();
    await expect(natsCard).not.toHaveClass(/disabled/);
  });

  test('should navigate to scenario selection when campaign is clicked', async ({
    campaignSelectionPage,
    page,
  }) => {
    await campaignSelectionPage.goto();
    await campaignSelectionPage.selectCampaign('nats');

    await expect(page).toHaveURL('/campaigns/nats');
  });

  test('should navigate back to campaigns from scenario selection', async ({
    scenarioSelectionPage,
    page,
  }) => {
    await scenarioSelectionPage.gotoCampaign('nats');

    await expect(scenarioSelectionPage.backButton).toBeVisible();
    await scenarioSelectionPage.backButton.click();

    // App may redirect to / or /campaigns/ (host-agnostic: baseURL may be
    // localhost or 127.0.0.1)
    await page.waitForURL(/^http:\/\/(localhost|127\.0\.0\.1):3000\/(campaigns\/?)?$/);
  });

  test('should handle unknown routes gracefully', async ({ page }) => {
    await page.goto('/some/unknown/route');

    // App may redirect to root or show the unknown route - either is acceptable
    // Just verify the page loads without crashing
    await page.waitForLoadState('domcontentloaded');

    // Should either be at root, campaigns, or show some content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
