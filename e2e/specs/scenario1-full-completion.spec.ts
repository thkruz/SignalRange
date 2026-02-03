import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { CampaignSelectionPage } from '../pages/campaign-selection.page';
import { ScenarioSelectionPage } from '../pages/scenario-selection.page';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 1 objectives - expanded tutorial with interactive conditions and quizzes.
 *
 * Objectives can be:
 * - 'quiz': Requires answering a quiz question (may have auto conditions that are auto-satisfied)
 * - 'select-station': Requires clicking on ground station in asset tree
 * - 'click-tab': Requires clicking a specific tab
 */
type ObjectiveType = 'quiz' | 'select-station' | 'click-tab';

interface Scenario1Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string; // For quiz type
  tabId?: string; // For click-tab type
}

const SCENARIO_1_OBJECTIVES: Scenario1Objective[] = [
  // Phase 1: Mission Preparation
  {
    id: 'review-mission-brief',
    title: 'Review Mission Brief',
    type: 'quiz',
    correctAnswer: 'Yes, I have read the mission brief and I am ready to proceed.',
  },
  // Phase 2: Station Access
  {
    id: 'select-vermont-station',
    title: 'Access Vermont Ground Station',
    type: 'select-station',
  },
  // Phase 3: Timing Reference
  {
    id: 'navigate-gps-timing',
    title: 'Open GPS Timing Tab',
    type: 'click-tab',
    tabId: 'gps-timing',
  },
  {
    id: 'verify-gpsdo-status',
    title: 'GPSDO Status Check',
    type: 'quiz',
    correctAnswer: 'Locked (green) - stable frequency reference',
  },
  // Phase 4: Receive Chain
  {
    id: 'navigate-rx-analysis',
    title: 'Open RX Analysis Tab',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'verify-lnb',
    title: 'Verify LNB Status',
    type: 'quiz',
    correctAnswer: '43K - within spec (good receive sensitivity)',
  },
  {
    id: 'verify-tap-points',
    title: 'Tap Points Configuration',
    type: 'quiz',
    correctAnswer: 'RX IF selected - monitoring the receive chain after downconversion',
  },
  {
    id: 'identify-beacon',
    title: 'Identify Beacon Signal',
    type: 'quiz',
    correctAnswer: 'A clear spike - the TIDEMARK-1 beacon signal',
  },
  {
    id: 'verify-speca-settings',
    title: 'Spectrum Analyzer Settings',
    type: 'quiz',
    correctAnswer: '1074.5 MHz center, 0.002 MHz span',
  },
  {
    id: 'verify-receiver',
    title: 'Receiver Modem Check',
    type: 'quiz',
    correctAnswer: '≥ 8 dB - Strong link with good operating margin',
  },
  {
    id: 'verify-constellation',
    title: 'I&Q Constellation Check',
    type: 'quiz',
    correctAnswer: 'Tight clusters at symbol points - clean QPSK modulation',
  },
  // Phase 4b: RX Payload Data
  {
    id: 'verify-rx-payload',
    title: 'RX Payload Data Check',
    type: 'quiz',
    correctAnswer: 'Frame sync locked, CRC valid, Reed-Solomon active - data path healthy',
  },
  // Phase 5: Transmit Chain
  {
    id: 'navigate-tx-chain',
    title: 'Open TX Chain Tab',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'verify-hpa-status',
    title: 'HPA Status Check',
    type: 'quiz',
    correctAnswer: 'Transmitting with 10 dB backoff',
  },
  // Phase 5b: TX Payload Data
  {
    id: 'verify-tx-payload',
    title: 'TX Payload Data Check',
    type: 'quiz',
    correctAnswer: 'Source feed active, encryption enabled, buffer healthy - ready to transmit',
  },
  // Phase 6: Antenna Control
  {
    id: 'navigate-acu-control',
    title: 'Open ACU Control Tab',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'verify-tracking-mode',
    title: 'Antenna Tracking Status',
    type: 'quiz',
    correctAnswer: 'Program-track - following predicted orbital position',
  },
  {
    id: 'verify-polarization',
    title: 'Polarization Check',
    type: 'quiz',
    correctAnswer: '14° - matched to TIDEMARK-1 satellite polarization',
  },
  // Phase 7: Final Verification
  {
    id: 'navigate-dashboard',
    title: 'Open Dashboard Tab',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'verify-alarm-status',
    title: 'Dashboard Alarm Check',
    type: 'quiz',
    correctAnswer: 'No active alarms - all systems nominal',
  },
];

/**
 * Helper to complete a single objective
 */
async function completeObjective(
  page: Page,
  missionControlPage: MissionControlPage,
  objective: Scenario1Objective
): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      await waitForQuizToAppear(page);
      await answerQuizByText(page, objective.correctAnswer!);
      break;

    case 'select-station':
      await missionControlPage.selectGroundStation('VT-01');
      break;

    case 'click-tab':
      await missionControlPage.selectTab(objective.tabId!);
      break;
  }

  // Dismiss any dialog that appears after objective completion
  await dismissDialogIfPresent(page);
}

base.describe.serial('Scenario 1 Full Completion', () => {
  // Shared state across all tests in this serial block
  let context: BrowserContext;
  let page: Page;
  let campaignSelectionPage: CampaignSelectionPage;
  let scenarioSelectionPage: ScenarioSelectionPage;
  let missionControlPage: MissionControlPage;

  base.beforeAll(async ({ browser }) => {
    // Configure longer timeout for the entire test suite
    base.setTimeout(300000);

    // Create a shared browser context and page
    context = await browser.newContext();
    page = await context.newPage();

    // Set up test mode flags
    await page.addInitScript(() => {
      (window as any).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    // Initialize page objects
    campaignSelectionPage = new CampaignSelectionPage(page);
    scenarioSelectionPage = new ScenarioSelectionPage(page);
    missionControlPage = new MissionControlPage(page);
  });

  base.afterAll(async () => {
    await page?.close();
    await context?.close();
  });

  base('setup: navigate to scenario and prepare', async () => {
    // Step 1: Start at campaign selection
    await campaignSelectionPage.goto();
    await expect(campaignSelectionPage.pageTitle).toHaveText('Signal Range Training');

    // Step 2: Select NATS campaign
    await campaignSelectionPage.selectCampaign('nats');
    await expect(page).toHaveURL('/campaigns/nats');

    // Step 3: Start scenario 1
    const scenario1Card = scenarioSelectionPage.getScenarioCard('nats-scenario1');
    await expect(scenario1Card).toBeVisible();
    await scenarioSelectionPage.startScenario('nats-scenario1');

    // Step 4: Wait for simulation to load
    await expect(page).toHaveURL(/\/campaigns\/nats\/scenarios\/nats-scenario1/);
    await waitForSimulationReady(page);

    // Step 5: Dismiss intro dialog
    await missionControlPage.dismissDialogIfPresent();

    // Step 6: Open mission brief (required for first objective's mission-brief-opened condition)
    await missionControlPage.openMissionBrief();
    // Close mission brief so it doesn't block subsequent UI interactions
    await missionControlPage.closeMissionBrief();
  });

  // Generate a test for each objective
  for (const objective of SCENARIO_1_OBJECTIVES) {
    base(`completes objective: ${objective.title}`, async () => {
      await completeObjective(page, missionControlPage, objective);
    });
  }

  base('verifies mission complete', async () => {
    // Verify Level Complete modal appears
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });

    // Verify "Mission Complete!" text is shown
    const modalTitle = levelCompleteModal.locator('.complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');

    // Verify score is displayed
    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();

    // Verify the score is positive (all objectives should give points)
    const scoreText = await totalScore.textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});
