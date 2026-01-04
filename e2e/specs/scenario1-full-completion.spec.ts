import { test, expect } from '../fixtures/test-fixtures';
import {
  waitForSimulationReady,
  waitForQuizToAppear,
  answerQuizByText,
  dismissDialogIfPresent,
} from '../utils/simulation-helpers';

/**
 * Scenario 1 objectives with their correct answer text.
 * Answers are matched by text content since quiz options are shuffled.
 */
const SCENARIO_1_OBJECTIVES = [
  {
    id: 'open-mission-brief',
    title: 'Review Mission Brief',
    correctAnswer: 'Yes, I have read the mission brief and I am ready to proceed.',
  },
  {
    id: 'phase-1-gpsdo',
    title: 'GPSDO Status Check',
    correctAnswer: 'Locked (green) - stable frequency reference',
  },
  {
    id: 'phase-2-lnb',
    title: 'LNB Status Check',
    correctAnswer: '43K - within spec (good receive sensitivity)',
  },
  {
    id: 'phase-3-hpa',
    title: 'HPA Status Check',
    correctAnswer: 'Transmitting with 10 db backoff',
  },
  {
    id: 'phase-4-antenna',
    title: 'Antenna Tracking Status',
    correctAnswer: 'Program-track - following predicted orbital position',
  },
  {
    id: 'phase-5-polarization',
    title: 'ACU Polarization Check',
    correctAnswer: '14° - matched to TIDEMARK-1 satellite polarization',
  },
  {
    id: 'phase-6-spectrum',
    title: 'Spectrum Analyzer Reading',
    correctAnswer: 'A clear spike - the TIDEMARK-1 beacon signal',
  },
  {
    id: 'phase-7-speca-settings',
    title: 'Spectrum Analyzer Settings',
    correctAnswer: '1074.5 MHz center, -91 dBm reference - configured for TIDEMARK-1 beacon IF',
  },
  {
    id: 'phase-8-receiver',
    title: 'Receiver Modem Check',
    correctAnswer: '≥ 8 dB - Strong link with good operating margin',
  },
  {
    id: 'phase-9-constellation',
    title: 'I&Q Constellation Check',
    correctAnswer: 'Tight clusters at symbol points - clean QPSK modulation',
  },
  {
    id: 'phase-10-alarms',
    title: 'Dashboard Alarm Check',
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
    // Give time for the condition to register
    await page.waitForTimeout(500);

    // Step 7: Complete each objective's quiz
    for (let i = 0; i < SCENARIO_1_OBJECTIVES.length; i++) {
      const objective = SCENARIO_1_OBJECTIVES[i];

      // Wait for quiz to appear
      await waitForQuizToAppear(page);

      // Answer with the correct text
      await answerQuizByText(page, objective.correctAnswer);

      // Dismiss any dialog that appears after objective completion
      await dismissDialogIfPresent(page);

      // Small wait between objectives to let the UI stabilize
      await page.waitForTimeout(300);
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
