import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 5 objectives - Interference Hunt: Spectrum Analysis and Mitigation
 *
 * Objectives can be:
 * - 'quiz': Requires answering a quiz question
 * - 'select-station': Requires clicking on ground station in asset tree
 * - 'click-tab': Requires clicking a specific tab
 * - 'configure-speca': Requires configuring spectrum analyzer settings
 * - 'configure-notch-filter': Requires configuring notch filter settings
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'configure-speca'
  | 'configure-notch-filter';

interface Scenario5Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string; // For quiz type
  tabId?: string; // For click-tab type
  specaConfig?: {
    // For configure-speca type
    centerFrequency: number; // MHz
    span: number; // MHz
    rbw: 'auto' | number; // 'auto' or MHz
    minAmplitude: number; // dBm
    maxAmplitude: number; // dBm
  };
  notchConfig?: {
    // For configure-notch-filter type
    centerFrequency: number; // MHz
    bandwidth: number; // MHz
    depth: number; // dB
    notchIndex: number; // 0, 1, or 2
  };
}

const SCENARIO_5_OBJECTIVES: Scenario5Objective[] = [
  // ============================================================
  // PHASE 1: MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Mission Brief',
    type: 'quiz',
    correctAnswer: 'Yes, I have read the mission brief and I am ready to proceed.',
  },
  {
    id: 'select-vermont-station',
    title: 'Select Vermont Ground Station',
    type: 'select-station',
  },

  // ============================================================
  // PHASE 2: CONFIRM THE PROBLEM
  // ============================================================
  {
    id: 'navigate-rx-analysis',
    title: 'Navigate to Receiver',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'phase-1-observe-degradation',
    title: 'Confirm Signal Degradation',
    type: 'quiz',
    correctAnswer: 'C/N is degraded - well below normal operating threshold',
  },
  {
    id: 'verify-receiver-state-quiz',
    title: 'Assess Full Impact',
    type: 'quiz',
    correctAnswer: 'Elevated BER (Bit Error Rate) and increased packet retransmissions',
  },

  // ============================================================
  // PHASE 3: CONFIGURE SPECTRUM ANALYZER
  // ============================================================
  {
    id: 'verify-speca-initial-state',
    title: 'Assess Current Configuration',
    type: 'quiz',
    correctAnswer:
      "The narrow span only shows the beacon, not our 36 MHz wideband signal where the problem likely exists",
  },
  {
    id: 'phase-2-configure-and-locate',
    title: 'Configure Spectrum View',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1532, // MHz - main signal IF
      span: 75, // MHz - wide enough to see full signal
      rbw: 'auto',
      minAmplitude: -100, // dBm
      maxAmplitude: -30, // dBm
    },
  },

  // ============================================================
  // PHASE 4: LOCATE AND IDENTIFY INTERFERENCE
  // ============================================================
  {
    id: 'phase-4-identify-interference',
    title: 'Identify Interference',
    type: 'quiz',
    correctAnswer: 'A narrowband spike sitting within our wideband signal',
  },
  {
    id: 'phase-5-characterize-interference',
    title: 'Characterize the Interference',
    type: 'quiz',
    correctAnswer: 'Much narrower - a spike only a few MHz wide within our wideband signal',
  },
  {
    id: 'measure-interference-frequency',
    title: 'Record Interference Frequency',
    type: 'quiz',
    correctAnswer: '1515 MHz',
  },
  {
    id: 'understand-notch-frequency-domain',
    title: 'Understand Frequency Domain for Notch Filter',
    type: 'quiz',
    correctAnswer: 'IF frequency',
  },

  // ============================================================
  // PHASE 5: UNDERSTAND THE CAUSE
  // ============================================================
  {
    id: 'phase-6-understand-cause',
    title: 'Understand the Interference Source',
    type: 'quiz',
    correctAnswer: "Cross-polarization leakage from another operator's uplink",
  },
  {
    id: 'phase-7-understand-impact',
    title: 'Understand the AGC Impact',
    type: 'quiz',
    correctAnswer: 'The AGC sees the spike as part of the total signal and reduces gain accordingly',
  },

  // ============================================================
  // PHASE 6: EVALUATE MITIGATION OPTIONS
  // ============================================================
  {
    id: 'understand-mitigation-options',
    title: 'Evaluate Mitigation Approaches',
    type: 'quiz',
    correctAnswer: 'Notch filter - surgically removes the spike while passing the rest of our signal',
  },

  // ============================================================
  // PHASE 7: APPLY NOTCH FILTER
  // ============================================================
  {
    id: 'phase-8-apply-notch-filter',
    title: 'Configure Notch Filter',
    type: 'configure-notch-filter',
    notchConfig: {
      centerFrequency: 1515, // MHz - IF frequency of interference
      bandwidth: 1, // MHz - matches narrowband interference
      depth: 40, // dB - sufficient attenuation
      notchIndex: 0, // Use first notch slot
    },
  },

  // ============================================================
  // PHASE 8: VERIFY RESTORATION
  // ============================================================
  {
    id: 'verify-spectrum-cleared',
    title: 'Verify Spectrum Cleared',
    type: 'quiz',
    correctAnswer: 'The spike is gone - the notch filter removed it from the passband',
  },
  {
    id: 'phase-9-verify-restoration',
    title: 'Verify Service Restored',
    type: 'quiz',
    correctAnswer: 'C/N restored to normal levels - the spike is notched out and AGC normalized',
  },

  // ============================================================
  // PHASE 9: DOCUMENTATION
  // ============================================================
  {
    id: 'document-interference-quiz',
    title: 'Understand Documentation Requirements',
    type: 'quiz',
    correctAnswer:
      'Interference frequency, bandwidth, apparent source, time of occurrence, and mitigation applied',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Configure the spectrum analyzer with the specified settings.
 * All frequency values are in MHz.
 */
async function configureSpectrumAnalyzer(
  page: import('@playwright/test').Page,
  config: {
    centerFrequency: number;
    span: number;
    rbw: 'auto' | number;
    minAmplitude: number;
    maxAmplitude: number;
  }
): Promise<void> {
  // Set center frequency
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(config.centerFrequency.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(200);

  // Set span
  const spanInput = page.locator('#sa-span');
  await expect(spanInput).toBeVisible();
  await spanInput.fill(config.span.toString());
  await spanInput.press('Tab');
  await page.waitForTimeout(200);

  // Set RBW
  const rbwSelect = page.locator('#sa-rbw');
  await expect(rbwSelect).toBeVisible();
  if (config.rbw === 'auto') {
    await rbwSelect.selectOption({ value: 'auto' });
  } else {
    await rbwSelect.selectOption({ value: config.rbw.toString() });
  }
  await page.waitForTimeout(200);

  // Set min amplitude
  const minAmpInput = page.locator('#sa-min-amp');
  await expect(minAmpInput).toBeVisible();
  await minAmpInput.fill(config.minAmplitude.toString());
  await minAmpInput.press('Tab');
  await page.waitForTimeout(200);

  // Set max amplitude
  const maxAmpInput = page.locator('#sa-max-amp');
  await expect(maxAmpInput).toBeVisible();
  await maxAmpInput.fill(config.maxAmplitude.toString());
  await maxAmpInput.press('Tab');
  await page.waitForTimeout(200);

  // Wait for spectrum analyzer to update and objective to be evaluated
  await page.waitForTimeout(1000);
}

/**
 * Configure the notch filter with the specified settings.
 * Powers on the filter, sets parameters, and clicks Apply.
 */
async function configureNotchFilter(
  page: import('@playwright/test').Page,
  config: {
    centerFrequency: number;
    bandwidth: number;
    depth: number;
    notchIndex: number;
  }
): Promise<void> {
  const prefix = `notch-${config.notchIndex}`;

  // Power on the notch filter module if not already on
  const powerSwitch = page.locator('#notch-power');
  await expect(powerSwitch).toBeVisible({ timeout: 5000 });
  const isPowered = await powerSwitch.isChecked();
  if (!isPowered) {
    await powerSwitch.click();
    await expect(powerSwitch).toBeChecked();
    await page.waitForTimeout(300);
  }

  // Enable the specific notch slot
  const enableSwitch = page.locator(`#${prefix}-enabled`);
  await expect(enableSwitch).toBeVisible();
  const isEnabled = await enableSwitch.isChecked();
  if (!isEnabled) {
    await enableSwitch.click();
    await expect(enableSwitch).toBeChecked();
    await page.waitForTimeout(200);
  }

  // Set center frequency
  const freqInput = page.locator(`#${prefix}-freq`);
  await expect(freqInput).toBeVisible();
  await freqInput.fill(config.centerFrequency.toString());
  await freqInput.press('Tab');
  await page.waitForTimeout(100);

  // Set bandwidth
  const bwInput = page.locator(`#${prefix}-bw`);
  await expect(bwInput).toBeVisible();
  await bwInput.fill(config.bandwidth.toString());
  await bwInput.press('Tab');
  await page.waitForTimeout(100);

  // Set depth
  const depthInput = page.locator(`#${prefix}-depth`);
  await expect(depthInput).toBeVisible();
  await depthInput.fill(config.depth.toString());
  await depthInput.press('Tab');
  await page.waitForTimeout(100);

  // Click Apply button
  const applyBtn = page.locator('#notch-apply-btn');
  await expect(applyBtn).toBeVisible();
  await applyBtn.click();

  // Wait for filter to be applied and objective to be evaluated
  await page.waitForTimeout(1000);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario5Objective
): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      // Wait for quiz to appear and answer it
      await waitForQuizToAppear(page);
      await answerQuizByText(page, objective.correctAnswer!);
      break;

    case 'select-station':
      // Click on Vermont Ground Station in the asset tree
      await missionControlPage.selectGroundStation('VT-01');
      break;

    case 'click-tab':
      // Click on the specified tab
      await missionControlPage.selectTab(objective.tabId!);
      break;

    case 'configure-speca':
      // Configure spectrum analyzer settings
      await configureSpectrumAnalyzer(page, objective.specaConfig!);
      break;

    case 'configure-notch-filter':
      // Configure notch filter settings
      await configureNotchFilter(page, objective.notchConfig!);
      break;
  }

  // Dismiss any dialog that appears after objective completion
  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 5 Full Completion', () => {
  // Configure serial execution - tests must run in order
  test.describe.configure({ mode: 'serial' });

  // Shared state across all tests in this describe block
  let page: import('@playwright/test').Page;
  let missionControlPage: MissionControlPage;
  let context: import('@playwright/test').BrowserContext;

  test.beforeAll(async ({ browser }) => {
    // Create a new context and page that will be shared across all tests
    context = await browser.newContext();
    page = await context.newPage();

    // Set up test mode: auto-close dialogs and clear storage
    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControlPage = new MissionControlPage(page);

    // Navigate directly to scenario 5 (bypasses prerequisite check)
    await missionControlPage.gotoScenario('nats', 'nats-scenario5');
    await waitForSimulationReady(page);

    // Dismiss intro dialog
    await missionControlPage.dismissDialogIfPresent();

    // Open mission brief (required for first objective's mission-brief-opened condition)
    await missionControlPage.openMissionBrief();
    // Close mission brief so it doesn't block subsequent UI interactions
    await missionControlPage.closeMissionBrief();
  });

  test.afterAll(async () => {
    await context.close();
  });

  // Configure timeout for individual objective tests
  test.beforeEach(async () => {
    // Default timeout of 60 seconds per objective
    test.setTimeout(60000);
  });

  // ============================================================
  // PHASE 1: MISSION PREPARATION
  // ============================================================

  test('Objective: Review Mission Brief', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'review-mission-brief')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Select Vermont Ground Station', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'select-vermont-station')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 2: CONFIRM THE PROBLEM
  // ============================================================

  test('Objective: Navigate to Receiver', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'navigate-rx-analysis')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Confirm Signal Degradation', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'phase-1-observe-degradation')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Assess Full Impact', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'verify-receiver-state-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 3: CONFIGURE SPECTRUM ANALYZER
  // ============================================================

  test('Objective: Assess Current Configuration', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'verify-speca-initial-state')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure Spectrum View', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'phase-2-configure-and-locate')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 4: LOCATE AND IDENTIFY INTERFERENCE
  // ============================================================

  test('Objective: Identify Interference', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'phase-4-identify-interference')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Characterize the Interference', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'phase-5-characterize-interference')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Record Interference Frequency', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'measure-interference-frequency')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Frequency Domain for Notch Filter', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'understand-notch-frequency-domain')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 5: UNDERSTAND THE CAUSE
  // ============================================================

  test('Objective: Understand the Interference Source', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'phase-6-understand-cause')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand the AGC Impact', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'phase-7-understand-impact')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 6: EVALUATE MITIGATION OPTIONS
  // ============================================================

  test('Objective: Evaluate Mitigation Approaches', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'understand-mitigation-options')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 7: APPLY NOTCH FILTER
  // ============================================================

  test('Objective: Configure Notch Filter', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'phase-8-apply-notch-filter')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 8: VERIFY RESTORATION
  // ============================================================

  test('Objective: Verify Spectrum Cleared', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'verify-spectrum-cleared')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Service Restored', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'phase-9-verify-restoration')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 9: DOCUMENTATION
  // ============================================================

  test('Objective: Understand Documentation Requirements', async () => {
    const objective = SCENARIO_5_OBJECTIVES.find(o => o.id === 'document-interference-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // MISSION COMPLETE VERIFICATION
  // ============================================================

  test('Mission Complete: Verify Level Complete Modal', async () => {
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
