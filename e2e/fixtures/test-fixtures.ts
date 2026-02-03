import { test as base } from '@playwright/test';
import { CampaignSelectionPage } from '../pages/campaign-selection.page';
import { ScenarioSelectionPage } from '../pages/scenario-selection.page';
import { MissionControlPage } from '../pages/mission-control.page';

/**
 * Custom fixtures for SignalRange e2e tests.
 * Provides page objects as test fixtures.
 */
type SignalRangeFixtures = {
  campaignSelectionPage: CampaignSelectionPage;
  scenarioSelectionPage: ScenarioSelectionPage;
  missionControlPage: MissionControlPage;
};

/**
 * Extended test function with SignalRange fixtures.
 */
export const test = base.extend<SignalRangeFixtures>({
  // Clear storage and set test mode flags before each test
  page: async ({ page }, use) => {
    // Set up test mode: auto-close dialogs and clear storage
    await page.addInitScript(() => {
      // Auto-close dialogs for faster testing
      (window as any).AUTO_CLOSE_DIALOGS = true;
      // Clear storage
      localStorage.clear();
      sessionStorage.clear();
    });
    await use(page);
  },

  campaignSelectionPage: async ({ page }, use) => {
    await use(new CampaignSelectionPage(page));
  },

  scenarioSelectionPage: async ({ page }, use) => {
    await use(new ScenarioSelectionPage(page));
  },

  missionControlPage: async ({ page }, use) => {
    await use(new MissionControlPage(page));
  },
});

export { expect } from '@playwright/test';
