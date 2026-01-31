import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 7 objectives - Uplink Validation: Transmit Enable Sequence & Power Verification.
 *
 * Following scenario3 pattern: each quiz is a separate objective with type: 'quiz'.
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'toggle-switch'
  | 'configure-speca'
  | 'configure-lnb-lo'
  | 'configure-tx-modem'
  | 'configure-buc-gain'
  | 'configure-hpa-backoff'
  | 'auto';

interface Scenario7Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string; // For quiz type
  tabId?: string; // For click-tab type
  switchId?: string; // For toggle-switch type
  switchState?: boolean; // true = on/checked, false = off/unchecked
  specaConfig?: {
    centerFrequency?: number; // MHz
    span?: number; // MHz
    minAmplitude?: number; // dBm
    maxAmplitude?: number; // dBm
    rbwAuto?: boolean;
  };
  lnbLoFrequency?: number; // MHz
  txModemConfig?: {
    frequency?: number; // MHz
    bandwidth?: number; // MHz
    modulation?: string;
    fec?: string;
    power?: number; // dBm
    transmitting?: boolean;
  };
  bucGain?: number; // dB
  hpaBackoff?: number; // dB
}

const SCENARIO_7_OBJECTIVES: Scenario7Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Mission Brief',
    type: 'quiz',
    correctAnswer: 'Yes, I have read the mission brief and I am ready to proceed.',
  },

  // ============================================================
  // RECEIVE CHAIN VERIFICATION
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Access Vermont Ground Station',
    type: 'select-station',
  },
  {
    id: 'check-dashboard-status',
    title: 'Check Dashboard for Alarms',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'check-dashboard-status-quiz',
    title: 'Identify Active Alarms',
    type: 'quiz',
    correctAnswer: 'BUC High Current Draw',
  },
  {
    id: 'diagnose-buc-high-current',
    title: 'Diagnose BUC High Current - Navigate to TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'diagnose-buc-high-current-quiz',
    title: 'Diagnose BUC High Current - Identify Cause',
    type: 'quiz',
    correctAnswer: 'BUC gain is set too high',
  },
  {
    id: 'resolve-buc-high-current-mute',
    title: 'Resolve BUC High Current - Mute BUC',
    type: 'toggle-switch',
    switchId: 'buc-mute',
    switchState: true,
  },
  {
    id: 'resolve-buc-high-current-loopback',
    title: 'Resolve BUC High Current - Disable Loopback',
    type: 'toggle-switch',
    switchId: 'buc-loopback',
    switchState: false,
  },
  {
    id: 'verify-fault-cleared',
    title: 'Verify Fault Cleared - Navigate to Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'verify-fault-cleared-quiz',
    title: 'Verify Fault Cleared - Confirm Alarm Cleared',
    type: 'quiz',
    correctAnswer: 'Normal - current draw within limits, no active alarms',
  },
  {
    id: 'verify-antenna-status',
    title: 'Verify Antenna Status - Navigate to ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'verify-antenna-status-quiz',
    title: 'Verify Antenna Status - Confirm Tracking',
    type: 'quiz',
    correctAnswer: 'Program Track - TIDEMARK-1',
  },
  {
    id: 'verify-lnb-operational',
    title: 'Verify LNB Operational - Navigate to RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'verify-lnb-operational-quiz',
    title: 'Verify LNB Operational - Noise Temperature Understanding',
    type: 'quiz',
    correctAnswer: 'Lower noise temperature means better sensitivity and signal-to-noise ratio',
  },

  // ============================================================
  // BEACON ACQUISITION
  // ============================================================
  {
    id: 'acquire-beacon-speca',
    title: 'Acquire Beacon - Configure Spectrum Analyzer',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1074.5,
      span: 0.002,
      minAmplitude: -100,
      maxAmplitude: -50,
    },
  },
  // acquire-beacon objective has TWO status-check quizzes - Beacon Purpose appears FIRST, then Beacon Identification
  {
    id: 'acquire-beacon-quiz1',
    title: 'Acquire Beacon - Beacon Purpose Quiz',
    type: 'quiz',
    correctAnswer: 'All of the above',
  },
  {
    id: 'acquire-beacon-quiz2',
    title: 'Acquire Beacon - Beacon Identification Quiz',
    type: 'quiz',
    correctAnswer: 'Beacon is a narrow CW carrier spike, while data signals have wider bandwidth',
  },
  {
    id: 'quiz-beacon-frequency',
    title: 'Confirm Beacon IF Frequency',
    type: 'quiz',
    correctAnswer: '1,074.5 MHz',
  },

  // ============================================================
  // TRANSMIT CHAIN CONFIGURATION
  // ============================================================
  {
    id: 'calculate-tx-if',
    title: 'Calculate TX IF Frequency',
    type: 'quiz',
    correctAnswer: '1,057 MHz',
  },
  {
    id: 'configure-tx-modem',
    title: 'Configure TX Modem - Navigate to TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'configure-tx-modem-settings',
    title: 'Configure TX Modem - Set Parameters',
    type: 'configure-tx-modem',
    txModemConfig: {
      frequency: 1057,
      bandwidth: 36,
      modulation: 'QPSK',
      fec: '3/4',
      power: -7, // Must match scenario7's tx-modem-power-set requirement
      transmitting: true,
    },
  },

  // ============================================================
  // LOOPBACK VALIDATION
  // ============================================================
  {
    id: 'reduce-buc-gain',
    title: 'Reduce BUC Gain for Loopback',
    type: 'configure-buc-gain',
    bucGain: 20, // Lower gain for loopback testing
  },
  {
    id: 'enable-loopback-switch',
    title: 'Enable BUC Loopback',
    type: 'toggle-switch',
    switchId: 'buc-loopback',
    switchState: true,
  },
  {
    id: 'enable-loopback-unmute',
    title: 'Unmute BUC',
    type: 'toggle-switch',
    switchId: 'buc-mute',
    switchState: false,
  },
  {
    id: 'enable-loopback-quiz',
    title: 'Loopback Mode Understanding',
    type: 'quiz',
    correctAnswer: 'Routes the TX RF signal to the LNB instead of the HPA',
  },
  {
    id: 'verify-loopback-signal-tab',
    title: 'Verify Loopback Signal - Navigate to RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'verify-loopback-signal-lnb',
    title: 'Verify Loopback Signal - Set LNB LO',
    type: 'configure-lnb-lo',
    lnbLoFrequency: 7000, // Match BUC LO for loopback verification
  },
  {
    id: 'verify-loopback-signal-speca',
    title: 'Verify Loopback Signal - Configure Spectrum Analyzer',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1057,
      span: 50,
      minAmplitude: -100,
      maxAmplitude: -20,
      rbwAuto: true,
    },
  },
  {
    id: 'verify-loopback-signal-quiz',
    title: 'Verify Loopback Signal - Confirm Signal',
    type: 'quiz',
    correctAnswer: 'A 36 MHz wide signal centered at 1,057 MHz - the TX modem output via loopback',
  },
  {
    id: 'quiz-loopback-purpose',
    title: 'Confirm Loopback Understanding',
    type: 'quiz',
    correctAnswer: 'TX modem output and BUC signal path are functioning',
  },

  // ============================================================
  // UPLINK ENABLE SEQUENCE
  // ============================================================
  {
    id: 'quiz-encryption-status-tab',
    title: 'Verify Encryption Status - Navigate to TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'quiz-encryption-status',
    title: 'Verify Encryption Status',
    type: 'quiz',
    correctAnswer: 'AES-256 Enabled',
  },
  {
    id: 'disable-loopback',
    title: 'Disable Loopback Mode',
    type: 'toggle-switch',
    switchId: 'buc-loopback',
    switchState: false,
  },
  {
    id: 'enable-hpa-output',
    title: 'Enable HPA Output',
    type: 'toggle-switch',
    switchId: 'hpa-enable',
    switchState: true,
  },

  // ============================================================
  // FINAL VERIFICATION
  // ============================================================
  {
    id: 'verify-hpa-power',
    title: 'Increase HPA Output Power',
    type: 'configure-hpa-backoff',
    hpaBackoff: 3, // Lower backoff = higher power
  },
  {
    id: 'final-verification',
    title: 'Final Configuration Verification',
    type: 'quiz',
    correctAnswer: 'TX IF: 1,057 MHz → RF: 5,943 MHz, QPSK 3/4, AES-256',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Toggle a switch to a desired state.
 */
async function toggleSwitch(
  page: import('@playwright/test').Page,
  switchId: string,
  desiredState: boolean
): Promise<void> {
  const switchEl = page.locator(`#${switchId}`);
  await expect(switchEl).toBeVisible({ timeout: 5000 });
  const isChecked = await switchEl.isChecked();
  if (isChecked !== desiredState) {
    await switchEl.click();
    // Verify the state changed
    if (desiredState) {
      await expect(switchEl).toBeChecked();
    } else {
      await expect(switchEl).not.toBeChecked();
    }
  }

  // Wait for state to propagate
  await page.waitForTimeout(200);
}

/**
 * Configure spectrum analyzer settings.
 * Uses same element IDs as scenario3: #sa-center-freq, #sa-span, #sa-min-amp, #sa-max-amp
 */
async function configureSpectrumAnalyzer(
  page: import('@playwright/test').Page,
  config: NonNullable<Scenario7Objective['specaConfig']>
): Promise<void> {
  // Center frequency (in MHz)
  if (config.centerFrequency !== undefined) {
    const centerInput = page.locator('#sa-center-freq');
    await expect(centerInput).toBeVisible({ timeout: 5000 });
    await centerInput.fill(config.centerFrequency.toString());
    await centerInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Span (in MHz)
  if (config.span !== undefined) {
    const spanInput = page.locator('#sa-span');
    await expect(spanInput).toBeVisible({ timeout: 5000 });
    await spanInput.fill(config.span.toString());
    await spanInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Min amplitude (in dBm)
  if (config.minAmplitude !== undefined) {
    const minInput = page.locator('#sa-min-amp');
    if ((await minInput.count()) > 0 && (await minInput.isVisible())) {
      await minInput.fill(config.minAmplitude.toString());
      await minInput.press('Tab');
      await page.waitForTimeout(100);
    }
  }

  // Max amplitude (in dBm)
  if (config.maxAmplitude !== undefined) {
    const maxInput = page.locator('#sa-max-amp');
    if ((await maxInput.count()) > 0 && (await maxInput.isVisible())) {
      await maxInput.fill(config.maxAmplitude.toString());
      await maxInput.press('Tab');
      await page.waitForTimeout(100);
    }
  }

  // Change dropdown for RBW to Auto if specified
  if (config.rbwAuto !== undefined) {
    const rbwSelect = page.locator('#sa-rbw');
    await expect(rbwSelect).toBeVisible({ timeout: 5000 });
    if (config.rbwAuto) {
      await rbwSelect.selectOption({ label: 'Auto' });
    }
  }

  await page.waitForTimeout(300);
}

/**
 * Configure LNB LO frequency.
 */
async function configureLnbLo(
  page: import('@playwright/test').Page,
  loFrequency: number
): Promise<void> {
  const loInput = page.locator('#lnb-lo-frequency');
  await expect(loInput).toBeVisible({ timeout: 5000 });
  await loInput.fill(loFrequency.toString());
  await loInput.press('Tab');
  await page.waitForTimeout(100);

  // Click Apply button
  const applyBtn = page.locator('#lnb-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();

  // Wait for LNB to stabilize
  await page.waitForTimeout(2000);
}

/**
 * Configure TX modem settings.
 */
async function configureTxModem(
  page: import('@playwright/test').Page,
  config: NonNullable<Scenario7Objective['txModemConfig']>
): Promise<void> {
  // Frequency (in MHz)
  if (config.frequency !== undefined) {
    const freqInput = page.locator('#tx-frequency-input');
    await expect(freqInput).toBeVisible({ timeout: 5000 });
    await freqInput.fill(config.frequency.toString());
    await freqInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Bandwidth (in MHz)
  if (config.bandwidth !== undefined) {
    const bwInput = page.locator('#tx-bandwidth-input');
    await expect(bwInput).toBeVisible({ timeout: 5000 });
    await bwInput.fill(config.bandwidth.toString());
    await bwInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Power (in dBm)
  if (config.power !== undefined) {
    const powerInput = page.locator('#tx-power-input');
    await expect(powerInput).toBeVisible({ timeout: 5000 });
    await powerInput.fill(config.power.toString());
    await powerInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Modulation
  if (config.modulation !== undefined) {
    const modSelect = page.locator('#tx-modulation-select');
    await expect(modSelect).toBeVisible({ timeout: 5000 });
    await modSelect.selectOption({ label: config.modulation });
    await page.waitForTimeout(100);
  }

  // FEC
  if (config.fec !== undefined) {
    const fecSelect = page.locator('#tx-fec-select');
    await expect(fecSelect).toBeVisible({ timeout: 5000 });
    await fecSelect.selectOption({ label: config.fec });
    await page.waitForTimeout(100);
  }

  // Enable transmitting
  if (config.transmitting !== undefined) {
    const txSwitch = page.locator('#tx-transmit-switch');
    await expect(txSwitch).toBeVisible({ timeout: 5000 });
    const isChecked = await txSwitch.isChecked();
    if (isChecked !== config.transmitting) {
      await txSwitch.click();
    }
    await page.waitForTimeout(200);
  }

  // Click Apply button
  const applyBtn = page.locator('#tx-apply-btn');
  if ((await applyBtn.count()) > 0 && (await applyBtn.isVisible())) {
    await applyBtn.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Configure BUC gain.
 */
async function configureBucGain(
  page: import('@playwright/test').Page,
  gain: number
): Promise<void> {
  const gainInput = page.locator('#buc-gain');
  await expect(gainInput).toBeVisible({ timeout: 5000 });
  await gainInput.fill(gain.toString());
  await gainInput.press('Tab');
  await page.waitForTimeout(100);

  // Click Apply button
  const applyBtn = page.locator('#buc-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Configure HPA backoff to achieve target power output.
 * Lower backoff = higher output power.
 */
async function configureHpaBackoff(
  page: import('@playwright/test').Page,
  backoff: number
): Promise<void> {
  const backoffInput = page.locator('#hpa-backoff');
  await expect(backoffInput).toBeVisible({ timeout: 5000 });
  await backoffInput.fill(backoff.toString());
  await backoffInput.press('Tab');
  await page.waitForTimeout(100);

  // Click Apply button
  const applyBtn = page.locator('#hpa-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Close any quiz modal that might be blocking interactions.
 */
async function closeQuizModalIfPresent(page: import('@playwright/test').Page): Promise<void> {
  const quizModal = page.locator('#quiz-modal, .quiz-box');
  try {
    if (await quizModal.isVisible({ timeout: 1000 })) {
      const closeBtn = quizModal.locator('.draggable-box__close-btn, [class*="close"], button:has-text("×")').first();
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(500);
      }
    }
  } catch {
    // No quiz modal present, continue
  }
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario7Objective
): Promise<void> {
  // For non-quiz objectives, close any blocking quiz modal first
  if (objective.type !== 'quiz') {
    await closeQuizModalIfPresent(page);
  }

  switch (objective.type) {
    case 'quiz': {
      // Wait for quiz to appear and answer it
      const pendingIndicatorBtn = page.locator('.pending-quiz-indicator__open-btn');
      const quizModalDirect = page.locator('#quiz-modal, .quiz-box');

      // Wait for the scenario engine to process any pending objective transitions
      await page.waitForTimeout(2000);

      // First check if quiz modal is already visible
      let isQuizOpen = await quizModalDirect.isVisible().catch(() => false);

      // Try multiple times to open the quiz
      let attempts = 0;
      while (!isQuizOpen && attempts < 15) {
        attempts++;
        try {
          // Wait for pending indicator button to appear
          await expect(pendingIndicatorBtn).toBeVisible({ timeout: 8000 });

          // Try JavaScript click to open the quiz
          await pendingIndicatorBtn.evaluate((btn) => (btn as HTMLButtonElement).click());
          await page.waitForTimeout(500);

          isQuizOpen = await quizModalDirect.isVisible().catch(() => false);

          // If click didn't work, try using the exposed QuizManager directly
          if (!isQuizOpen && attempts > 3) {
            await page.evaluate(() => {
              const qm = (window as unknown as { __quizManager__?: { reopenPendingQuiz: () => void } }).__quizManager__;
              if (qm) {
                qm.reopenPendingQuiz();
              }
            });
            await page.waitForTimeout(500);
            isQuizOpen = await quizModalDirect.isVisible().catch(() => false);
          }
        } catch {
          // Indicator not visible yet, wait a bit for objective transition
          await page.waitForTimeout(1000);
        }
      }

      // If quiz still not visible, open checklist to debug
      if (!isQuizOpen) {
        // Click on Checklist in the sidebar to see objective state
        const checklistItem = page.locator('text=Checklist').first();
        if (await checklistItem.isVisible().catch(() => false)) {
          await checklistItem.click();
          await page.waitForTimeout(1000);
          // Take a screenshot to see the checklist state
          console.log('Quiz not opening - checklist should be visible in screenshot');
        }
      }

      // Final check - quiz modal should be visible now
      await expect(quizModalDirect).toBeVisible({ timeout: 10000 });
      await answerQuizByText(page, objective.correctAnswer!);

      // Wait for scenario engine to process the quiz completion
      await page.waitForTimeout(1000);
      break;
    }

    case 'select-station':
      await missionControlPage.selectGroundStation('VT-01');
      break;

    case 'click-tab':
      await missionControlPage.selectTab(objective.tabId!);
      break;

    case 'toggle-switch':
      await toggleSwitch(page, objective.switchId!, objective.switchState!);
      break;

    case 'configure-speca':
      await configureSpectrumAnalyzer(page, objective.specaConfig!);
      break;

    case 'configure-lnb-lo':
      await configureLnbLo(page, objective.lnbLoFrequency!);
      break;

    case 'configure-tx-modem':
      await configureTxModem(page, objective.txModemConfig!);
      break;

    case 'configure-buc-gain':
      await configureBucGain(page, objective.bucGain!);
      break;

    case 'configure-hpa-backoff':
      await configureHpaBackoff(page, objective.hpaBackoff!);
      break;

    case 'auto':
      // Auto-satisfied objectives complete when conditions are met
      await page.waitForTimeout(500);
      break;
  }

  // Dismiss any dialog that appears after objective completion
  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 7 Full Completion', () => {
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

    // Navigate directly to scenario 7 (bypasses prerequisite check)
    await missionControlPage.gotoScenario('nats', 'nats-scenario7');
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
  // MISSION PREPARATION
  // ============================================================

  test('Objective: Review Mission Brief', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'review-mission-brief')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // RECEIVE CHAIN VERIFICATION
  // ============================================================

  test('Objective: Access Vermont Ground Station', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'select-vermont-station')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Check Dashboard for Alarms', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'check-dashboard-status')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Identify Active Alarms', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'check-dashboard-status-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Diagnose BUC High Current - Navigate to TX Chain', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'diagnose-buc-high-current')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Diagnose BUC High Current - Identify Cause', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'diagnose-buc-high-current-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Resolve BUC High Current - Mute BUC', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'resolve-buc-high-current-mute')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Resolve BUC High Current - Disable Loopback', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'resolve-buc-high-current-loopback')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Fault Cleared - Navigate to Dashboard', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-fault-cleared')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Fault Cleared - Confirm Alarm Cleared', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-fault-cleared-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Antenna Status - Navigate to ACU Control', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-antenna-status')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Antenna Status - Confirm Tracking', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-antenna-status-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify LNB Operational - Navigate to RX Analysis', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-lnb-operational')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify LNB Operational - Noise Temperature Understanding', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-lnb-operational-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // BEACON ACQUISITION
  // ============================================================

  test('Objective: Acquire Beacon - Configure Spectrum Analyzer', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'acquire-beacon-speca')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Acquire Beacon - Beacon Purpose Quiz', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'acquire-beacon-quiz1')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Acquire Beacon - Beacon Identification Quiz', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'acquire-beacon-quiz2')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Confirm Beacon IF Frequency', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'quiz-beacon-frequency')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // TRANSMIT CHAIN CONFIGURATION
  // ============================================================

  test('Objective: Calculate TX IF Frequency', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'calculate-tx-if')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure TX Modem - Navigate to TX Chain', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'configure-tx-modem')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure TX Modem - Set Parameters', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'configure-tx-modem-settings')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // LOOPBACK VALIDATION
  // ============================================================

  test('Objective: Reduce BUC Gain for Loopback', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'reduce-buc-gain')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Enable BUC Loopback', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'enable-loopback-switch')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Unmute BUC', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'enable-loopback-unmute')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Loopback Mode Understanding', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'enable-loopback-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Loopback Signal - Navigate to RX Analysis', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-loopback-signal-tab')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Loopback Signal - Set LNB LO', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-loopback-signal-lnb')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Loopback Signal - Configure Spectrum Analyzer', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-loopback-signal-speca')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Loopback Signal - Confirm Signal', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-loopback-signal-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Confirm Loopback Understanding', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'quiz-loopback-purpose')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // UPLINK ENABLE SEQUENCE
  // ============================================================

  test('Objective: Verify Encryption Status - Navigate to TX Chain', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'quiz-encryption-status-tab')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Encryption Status', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'quiz-encryption-status')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Disable Loopback Mode', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'disable-loopback')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Enable HPA Output', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'enable-hpa-output')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // FINAL VERIFICATION
  // ============================================================

  test('Objective: Increase HPA Output Power', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'verify-hpa-power')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Final Configuration Verification', async () => {
    const objective = SCENARIO_7_OBJECTIVES.find(o => o.id === 'final-verification')!;
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
