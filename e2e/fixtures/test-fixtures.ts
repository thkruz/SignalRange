import { test as base } from '@playwright/test';
import { CampaignSelectionPage } from '../pages/campaign-selection.page';
import { MissionControlPage } from '../pages/mission-control.page';
import { ScenarioSelectionPage } from '../pages/scenario-selection.page';
import { installTestClock, testClockWanted } from '../utils/test-clock';

/**
 * Custom fixtures for SignalRange e2e tests.
 * Provides page objects as test fixtures.
 */
type SignalRangeFixtures = {
  /**
   * Run the page on Playwright's fake clock (e2e/utils/test-clock.ts). Opt in per file with
   * `test.use({ testClock: true })`. E2E_TEST_CLOCK=0 forces it off, E2E_TEST_CLOCK=1 forces it on.
   */
  testClock: boolean;
  campaignSelectionPage: CampaignSelectionPage;
  scenarioSelectionPage: ScenarioSelectionPage;
  missionControlPage: MissionControlPage;
};

/**
 * Extended test function with SignalRange fixtures.
 */
export const test = base.extend<SignalRangeFixtures>({
  testClock: [false, { option: true }],

  // Clear storage and set test mode flags before each test
  page: async ({ page, testClock }, use) => {
    const clocked = testClockWanted(testClock);
    if (clocked) {
      await installTestClock(page);
    }
    // Set up test mode: auto-close dialogs and clear storage
    await page.addInitScript((fastUi: boolean) => {
      // Auto-close dialogs for faster testing
      (window as any).AUTO_CLOSE_DIALOGS = true;
      // Show the pending quiz/decision indicator at once instead of after the 5 s player-pacing delay
      // (not on the test clock, whose quiz helpers fast-forward past it)
      (window as any).SR_E2E_FAST_UI = fastUi;
      // Clear storage
      localStorage.clear();
      sessionStorage.clear();
    }, !clocked);
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
