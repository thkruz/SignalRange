import { expect, test } from '../fixtures/test-fixtures';
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
 * - 'quiz': Requires answering a quiz question
 * - 'select-station': Requires clicking on ground station in asset tree
 * - 'click-tab': Requires clicking a specific tab
 * - 'auto': Automatically satisfied by game state (equipment-powered, signal-detected, etc.)
 */
type ObjectiveType = 'quiz' | 'select-station' | 'click-tab' | 'auto';

interface Scenario1Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;  // For quiz type
  tabId?: string;          // For click-tab type
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
    id: 'verify-lnb-equipment',
    title: 'Verify LNB Equipment Status',
    type: 'auto',  // equipment-powered + lnb-thermally-stable - auto-satisfied
  },
  {
    id: 'verify-lnb-quiz',
    title: 'LNB Performance Check',
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
    type: 'auto',  // signal-detected - auto-satisfied when on RX Analysis tab
  },
  {
    id: 'verify-beacon-quiz',
    title: 'Beacon Signal Analysis',
    type: 'quiz',
    correctAnswer: 'A clear spike - the TIDEMARK-1 beacon signal',
  },
  {
    id: 'verify-speca-settings',
    title: 'Spectrum Analyzer Settings',
    type: 'quiz',
    correctAnswer: '1074.5 MHz center, 2 kHz span',
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

test.describe('Scenario 1 Full Completion', () => {
  test('completes all objectives from campaign selection to mission complete', async ({
    page,
    campaignSelectionPage,
    scenarioSelectionPage,
    missionControlPage,
  }) => {
    // Configure longer timeout (5 minutes) for full scenario completion
    test.setTimeout(300000);

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

    // Step 7: Complete each objective based on its type
    for (const objective of SCENARIO_1_OBJECTIVES) {
      switch (objective.type) {
        case 'quiz':
          // Wait for quiz to appear and answer it
          await waitForQuizToAppear(page);
          await answerQuizByText(page, objective.correctAnswer!);
          break;

        case 'select-station':
          // Click on Vermont Ground Station in the asset tree using data-asset-id
          await missionControlPage.selectGroundStation('VT-01');
          break;

        case 'click-tab':
          // Click on the specified tab using data-tab-id selector
          await missionControlPage.selectTab(objective.tabId!);
          break;

        case 'auto':
          // Auto-satisfied objectives complete when conditions are met
          // The objective system evaluates on UPDATE ticks, brief wait is sufficient
          await page.waitForTimeout(100);
          break;
      }

      // Dismiss any dialog that appears after objective completion
      await dismissDialogIfPresent(page);
    }

    // Step 8: Verify Level Complete modal appears
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });

    // Step 9: Verify "Mission Complete!" text is shown
    const modalTitle = levelCompleteModal.locator('.complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');

    // Step 10: Verify score is displayed
    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();

    // Optionally verify the score is positive (all objectives should give points)
    const scoreText = await totalScore.textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});
