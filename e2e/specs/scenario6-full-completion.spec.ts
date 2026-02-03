import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 6: "Old Faithful" - Step-Track Operations on Inclined Orbit
 *
 * This scenario teaches step-track mode on AURORA-7, a legacy satellite with
 * an inclined orbit. Key objectives include:
 * 1. Understanding inclined orbits and why step-track is needed
 * 2. Acquiring AURORA-7 via program-track, then switching to step-track
 * 3. Configuring spectrum analyzer and RX modem for downlink
 * 4. Calculating TX IF frequency and enabling transmit path
 *
 * Objective types:
 * - 'quiz': Requires answering a status-check quiz question
 * - 'set-tracking-mode': Requires clicking a tracking mode button
 * - 'wait-beacon-lock': Wait for step-track beacon lock
 * - 'configure-speca': Configure spectrum analyzer settings
 * - 'configure-rx-modem': Configure RX modem settings
 * - 'wait-rx-lock': Wait for receiver signal lock
 * - 'configure-tx-modem': Configure TX modem frequency
 * - 'enable-tx-path': Unmute BUC and enable HPA
 */
type ObjectiveType =
  | 'quiz'
  | 'set-tracking-mode'
  | 'wait-beacon-lock'
  | 'configure-speca'
  | 'configure-rx-modem'
  | 'wait-rx-lock'
  | 'configure-tx-modem'
  | 'enable-tx-path';

interface Scenario6Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string; // For quiz type
  trackingMode?: string; // For set-tracking-mode type
  waitForAntennaPosition?: boolean; // Wait for antenna to reach position
  specaConfig?: {
    // For configure-speca type
    centerFrequency: number; // MHz
    span: number; // MHz
    maxAmplitude: number; // dBm
    minAmplitude: number; // dBm
    rbwAuto: boolean;
  };
  rxModemConfig?: {
    // For configure-rx-modem type
    frequency: number; // MHz
    bandwidth: number; // MHz
    modulation: string;
    fec: string;
  };
  txModemConfig?: {
    // For configure-tx-modem type
    frequency: number; // MHz
  };
}

const SCENARIO_6_OBJECTIVES: Scenario6Objective[] = [
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
    id: 'understand-inclined-orbit',
    title: 'Understand Inclined Orbits',
    type: 'quiz',
    correctAnswer:
      'Inclined orbit causes the satellite to drift in az/el; step-track follows the beacon',
  },
  {
    id: 'recognize-wrong-satellite',
    title: 'Identify Current Target',
    type: 'quiz',
    correctAnswer: 'TIDEMARK-1 - we need to change to AURORA-7',
  },
  {
    id: 'program-track-aurora7',
    title: 'Acquire AURORA-7 via Program-Track',
    type: 'set-tracking-mode',
    trackingMode: 'program-track',
    waitForAntennaPosition: true,
  },
  {
    id: 'quiz-program-track-limitation',
    title: 'Understand Program-Track Limitations',
    type: 'quiz',
    correctAnswer:
      "AURORA-7's inclined orbit causes drift - ephemeris predictions aren't accurate enough",
  },

  // ============================================================
  // PHASE 2: STEP-TRACK CONFIGURATION
  // ============================================================
  {
    id: 'verify-beacon-config',
    title: 'Verify Beacon Configuration',
    type: 'quiz',
    correctAnswer: 'LNB LO (5250 MHz) minus beacon RF (4165 MHz) = 1085 MHz',
  },
  {
    id: 'enable-step-track',
    title: 'Enable Step-Track Mode',
    type: 'set-tracking-mode',
    trackingMode: 'step-track',
  },
  {
    id: 'acquire-beacon-lock',
    title: 'Acquire Beacon Lock',
    type: 'wait-beacon-lock',
  },

  // ============================================================
  // PHASE 3: RECEIVE CHAIN CONFIGURATION
  // ============================================================
  {
    id: 'configure-speca-downlink',
    title: 'Configure Spectrum Analyzer for Downlink',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1422,
      span: 50,
      maxAmplitude: -20,
      minAmplitude: -50,
      rbwAuto: true,
    },
  },
  {
    id: 'configure-rx-modem',
    title: 'Configure RX Modem',
    type: 'configure-rx-modem',
    rxModemConfig: {
      frequency: 1422,
      bandwidth: 24,
      modulation: 'QPSK',
      fec: '3/4',
    },
  },
  {
    id: 'verify-rx-lock',
    title: 'Verify RX Signal Lock',
    type: 'wait-rx-lock',
  },

  // ============================================================
  // PHASE 4: ENCRYPTION & PAYLOAD UNDERSTANDING
  // ============================================================
  {
    id: 'quiz-encryption',
    title: 'Verify Encryption Understanding',
    type: 'quiz',
    correctAnswer: 'AES-256-GCM with valid key - ready for secure transmission',
  },

  // ============================================================
  // PHASE 5: TRANSMIT CONFIGURATION
  // ============================================================
  {
    id: 'calculate-tx-if',
    title: 'Calculate TX IF Frequency',
    type: 'quiz',
    correctAnswer: '1447 MHz (7500 - 6053 = 1447)',
  },
  {
    id: 'configure-tx-modem',
    title: 'Configure TX Modem',
    type: 'configure-tx-modem',
    txModemConfig: {
      frequency: 1447,
    },
  },
  {
    id: 'enable-transmit-path',
    title: 'Enable Transmit Path',
    type: 'enable-tx-path',
  },

  // ============================================================
  // PHASE 6: FINAL VERIFICATION
  // ============================================================
  {
    id: 'final-verification',
    title: 'Full Duplex Established',
    type: 'quiz',
    correctAnswer:
      'Step-track maintaining lock on beacon, RX at 1422 MHz IF, TX at 1447 MHz IF, AES-256 encrypted',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Set the antenna tracking mode by clicking the appropriate button.
 * For step-track, toggle the step-track checkbox (requires program-track mode).
 * For program-track, selects AURORA-7 and clicks Move to Target.
 */
async function setTrackingMode(
  page: import('@playwright/test').Page,
  trackingMode: string
): Promise<void> {
  // Step-track is enabled via a toggle checkbox, not a mode button
  if (trackingMode === 'step-track') {
    // The step-track toggle is a checkbox that enables step-track optimization
    // The ID has a prefix pattern, so use partial match
    const stepTrackToggle = page.locator('input[id$="step-track-toggle"]');
    await expect(stepTrackToggle).toBeVisible({ timeout: 5000 });

    // Enable step-track if not already checked
    const isChecked = await stepTrackToggle.isChecked();
    if (!isChecked) {
      await stepTrackToggle.click();
    }
    await expect(stepTrackToggle).toBeChecked();
    await page.waitForTimeout(300);
    return;
  }

  // Find the tracking mode button with data-mode attribute
  const modeButton = page.locator(`.btn-tracking[data-mode="${trackingMode}"]`);
  await expect(modeButton).toBeVisible({ timeout: 5000 });
  await modeButton.click();

  // Wait for mode change to take effect
  await page.waitForTimeout(300);
}

/**
 * Select AURORA-7 satellite in dropdown and click Move to Target.
 * Used for program-track mode to acquire AURORA-7.
 */
async function selectAurora7AndMove(page: import('@playwright/test').Page): Promise<void> {
  // Wait for satellite dropdown to be visible
  const satelliteSelect = page.locator('select[id$="satellite-select"]');
  await expect(satelliteSelect).toBeVisible({ timeout: 5000 });

  // Select AURORA-7 (NORAD ID 28899)
  await satelliteSelect.selectOption({ value: '28899' });
  await page.waitForTimeout(200);

  // Click Move to Target button
  const moveBtn = page.locator('button[id$="move-to-target-btn"]');
  await expect(moveBtn).toBeEnabled({ timeout: 5000 });
  await moveBtn.click();

  // Wait for move command to be issued
  await page.waitForTimeout(300);
}

/**
 * Wait for antenna movement to complete by monitoring position stability.
 */
async function waitForAntennaMovement(
  page: import('@playwright/test').Page,
  timeout = 60000
): Promise<void> {
  const startTime = Date.now();
  let lastPosition = '';
  let stableCount = 0;

  // Wait a moment for tracking mode change to take effect
  await page.waitForTimeout(500);

  while (Date.now() - startTime < timeout) {
    await page.waitForTimeout(1000);

    // Get current elevation from the fine-adjust control display
    let elDisplay = page
      .locator('.fine-adjust-control', { hasText: 'Elevation' })
      .locator('.fine-adjust-value-active');

    // Fallback: try finding by ID pattern
    if ((await elDisplay.count()) === 0) {
      elDisplay = page.locator('[id*="el-fine"][id$="-value"]');
    }

    try {
      const currentPosition = await elDisplay.first().textContent({ timeout: 2000 });

      if (currentPosition === lastPosition && currentPosition !== '') {
        stableCount++;
        // Position stable for 3 consecutive checks = movement complete
        if (stableCount >= 3) {
          return;
        }
      } else {
        stableCount = 0;
        lastPosition = currentPosition || '';
      }
    } catch {
      // Display not found, retry
      await page.waitForTimeout(500);
    }
  }

  // If we get here, antenna movement timed out but continue anyway
  console.warn('Antenna movement may not have completed within timeout');
}

/**
 * Wait for step-track beacon lock to be acquired.
 * The objective requires maintaining lock for 10 seconds.
 */
async function waitForBeaconLock(
  page: import('@playwright/test').Page,
  timeout = 90000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // Wait briefly to let the step-track algorithm work
      await page.waitForTimeout(2000);

      // Check if beacon C/N is displayed and rising
      const cnDisplay = page.locator('[id*="beacon-cn"], .beacon-cn-value');
      if ((await cnDisplay.count()) > 0) {
        const cnText = await cnDisplay.first().textContent({ timeout: 1000 });
        const cn = parseFloat(cnText || '0');
        // If C/N > 10 dB, beacon is likely locked
        if (cn > 10) {
          // Wait additional time for the 10-second maintain duration
          await page.waitForTimeout(12000);
          return;
        }
      }
    } catch {
      // Continue waiting
    }

    await page.waitForTimeout(1000);
  }

  // Continue even if timeout - the objective system will validate
  console.warn('Beacon lock wait timed out, continuing...');
}

/**
 * Configure spectrum analyzer settings for viewing downlink signal.
 * Element IDs: sa-center-freq, sa-span, sa-max-amp, sa-min-amp, sa-rbw
 */
async function configureSpectrumAnalyzer(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  config: {
    centerFrequency: number;
    span: number;
    maxAmplitude: number;
    minAmplitude: number;
    rbwAuto: boolean;
  }
): Promise<void> {
  // Navigate to RX Analysis tab where spectrum analyzer is located
  await missionControlPage.selectTab('rx-analysis');
  await page.waitForTimeout(300);

  // Set center frequency (in MHz)
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(config.centerFrequency.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(100);

  // Set span (in MHz)
  const spanInput = page.locator('#sa-span');
  await expect(spanInput).toBeVisible({ timeout: 5000 });
  await spanInput.fill(config.span.toString());
  await spanInput.press('Tab');
  await page.waitForTimeout(100);

  // Set max amplitude
  const maxAmpInput = page.locator('#sa-max-amp');
  await expect(maxAmpInput).toBeVisible({ timeout: 5000 });
  await maxAmpInput.fill(config.maxAmplitude.toString());
  await maxAmpInput.press('Tab');
  await page.waitForTimeout(100);

  // Set min amplitude
  const minAmpInput = page.locator('#sa-min-amp');
  await expect(minAmpInput).toBeVisible({ timeout: 5000 });
  await minAmpInput.fill(config.minAmplitude.toString());
  await minAmpInput.press('Tab');
  await page.waitForTimeout(100);

  // Set RBW to auto if needed (it's a select element)
  if (config.rbwAuto) {
    const rbwSelect = page.locator('#sa-rbw');
    if ((await rbwSelect.count()) > 0) {
      await rbwSelect.selectOption('auto');
    }
  }

  await page.waitForTimeout(500);
}

/**
 * Configure RX modem settings for downlink reception.
 * Element IDs: frequency-input, bandwidth-input, modulation-select, fec-select, apply-btn
 */
async function configureRxModem(
  page: import('@playwright/test').Page,
  config: {
    frequency: number;
    bandwidth: number;
    modulation: string;
    fec: string;
  }
): Promise<void> {
  // Set frequency (in MHz)
  const freqInput = page.locator('#frequency-input');
  await expect(freqInput).toBeVisible({ timeout: 5000 });
  await freqInput.fill(config.frequency.toString());
  await freqInput.press('Tab');
  await page.waitForTimeout(100);

  // Set bandwidth (in MHz)
  const bwInput = page.locator('#bandwidth-input');
  await expect(bwInput).toBeVisible({ timeout: 5000 });
  await bwInput.fill(config.bandwidth.toString());
  await bwInput.press('Tab');
  await page.waitForTimeout(100);

  // Set modulation
  const modSelect = page.locator('#modulation-select');
  await expect(modSelect).toBeVisible({ timeout: 5000 });
  await modSelect.selectOption(config.modulation);
  await page.waitForTimeout(100);

  // Set FEC
  const fecSelect = page.locator('#fec-select');
  await expect(fecSelect).toBeVisible({ timeout: 5000 });
  await fecSelect.selectOption(config.fec);
  await page.waitForTimeout(100);

  // Click Apply button
  const applyBtn = page.locator('#apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();

  await page.waitForTimeout(500);
}

/**
 * Wait for RX signal lock and SNR threshold to be met.
 * Objective requires 15 seconds of maintained SNR > 8 dB.
 * Uses cn-effective-display element from receiver adapter.
 */
async function waitForRxLock(
  page: import('@playwright/test').Page,
  timeout = 90000
): Promise<void> {
  const startTime = Date.now();
  let lockedTime = 0;

  while (Date.now() - startTime < timeout) {
    await page.waitForTimeout(2000);

    try {
      // Check effective C/N display from receiver adapter
      const cnDisplay = page.locator('#cn-effective-display');

      // Check C/N value if visible
      if ((await cnDisplay.count()) > 0) {
        const cnText = await cnDisplay.first().textContent({ timeout: 1000 });
        const cn = parseFloat(cnText?.replace(/[^\d.-]/g, '') || '0');

        if (cn >= 8) {
          lockedTime += 2000;
          if (lockedTime >= 17000) {
            // 15 seconds + buffer
            return;
          }
        } else {
          lockedTime = 0;
        }
      }
    } catch {
      // Continue waiting
      lockedTime = 0;
    }
  }

  // Continue even if timeout - the objective system will validate
  console.warn('RX lock wait timed out, continuing...');
}

/**
 * Configure TX modem frequency.
 * Element IDs: tx-frequency-input, tx-apply-btn
 */
async function configureTxModem(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  config: { frequency: number }
): Promise<void> {
  // Navigate to TX Chain tab
  await missionControlPage.selectTab('tx-chain');
  await page.waitForTimeout(300);

  // Set TX frequency (in MHz)
  const freqInput = page.locator('#tx-frequency-input');
  await expect(freqInput).toBeVisible({ timeout: 5000 });
  await freqInput.fill(config.frequency.toString());
  await freqInput.press('Tab');
  await page.waitForTimeout(100);

  // Click Apply button
  const applyBtn = page.locator('#tx-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();

  await page.waitForTimeout(500);
}

/**
 * Enable transmit path by unmuting BUC and enabling HPA.
 */
async function enableTransmitPath(page: import('@playwright/test').Page): Promise<void> {
  // Unmute BUC
  const bucMuteSwitch = page.locator('#buc-mute');
  await expect(bucMuteSwitch).toBeVisible({ timeout: 5000 });
  const bucIsMuted = await bucMuteSwitch.isChecked();
  if (bucIsMuted) {
    await bucMuteSwitch.click();
  }
  await expect(bucMuteSwitch).not.toBeChecked();
  await page.waitForTimeout(200);

  // Enable HPA
  const hpaEnableSwitch = page.locator('#hpa-enable');
  await expect(hpaEnableSwitch).toBeVisible({ timeout: 5000 });
  const hpaIsEnabled = await hpaEnableSwitch.isChecked();
  if (!hpaIsEnabled) {
    await hpaEnableSwitch.click();
  }
  await expect(hpaEnableSwitch).toBeChecked();
  await page.waitForTimeout(500);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario6Objective
): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      await waitForQuizToAppear(page);
      await answerQuizByText(page, objective.correctAnswer!);
      break;

    case 'set-tracking-mode': {
      // Ensure we're on the right ground station and tabs are available
      // Select ground station first if not already selected
      await page.waitForTimeout(500);
      await dismissDialogIfPresent(page);

      // Select Vermont Ground Station to make equipment tabs available
      // Use the sidebar item specifically and force click to bypass any overlay
      const gsItem = page.locator('#asset-tree-sidebar-container a[data-asset-id="VT-01"]');
      if ((await gsItem.count()) > 0) {
        await gsItem.click({ force: true });
        await page.waitForTimeout(500);
        await dismissDialogIfPresent(page);
      }

      // Navigate to ACU Control tab first
      await missionControlPage.selectTab('acu-control');
      await page.waitForTimeout(500);

      await setTrackingMode(page, objective.trackingMode!);

      // For program-track, select AURORA-7 and move
      if (objective.trackingMode === 'program-track') {
        await selectAurora7AndMove(page);
      }

      // Wait for antenna to reach position if needed
      if (objective.waitForAntennaPosition) {
        await waitForAntennaMovement(page);
      }
      break;
    }

    case 'wait-beacon-lock':
      await waitForBeaconLock(page);
      break;

    case 'configure-speca':
      await configureSpectrumAnalyzer(page, missionControlPage, objective.specaConfig!);
      break;

    case 'configure-rx-modem':
      await configureRxModem(page, objective.rxModemConfig!);
      break;

    case 'wait-rx-lock':
      await waitForRxLock(page);
      break;

    case 'configure-tx-modem':
      await configureTxModem(page, missionControlPage, objective.txModemConfig!);
      break;

    case 'enable-tx-path':
      await enableTransmitPath(page);
      break;
  }

  // Dismiss any dialog that appears after objective completion
  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 6 Full Completion', () => {
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

    // Navigate directly to scenario 6 (bypasses prerequisite check)
    await missionControlPage.gotoScenario('nats', 'nats-scenario6');
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
    // Default timeout of 90 seconds per objective (some have waits)
    test.setTimeout(90000);
  });

  // ============================================================
  // PHASE 1: MISSION PREPARATION
  // ============================================================

  test('Objective: Review Mission Brief', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'review-mission-brief')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Inclined Orbits', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'understand-inclined-orbit')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Identify Current Target', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'recognize-wrong-satellite')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Acquire AURORA-7 via Program-Track', async () => {
    // Antenna movement can take up to 90 seconds
    test.setTimeout(120000);
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'program-track-aurora7')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Program-Track Limitations', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'quiz-program-track-limitation')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 2: STEP-TRACK CONFIGURATION
  // ============================================================

  test('Objective: Verify Beacon Configuration', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'verify-beacon-config')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Enable Step-Track Mode', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'enable-step-track')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Acquire Beacon Lock', async () => {
    // Beacon lock can take time
    test.setTimeout(120000);
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'acquire-beacon-lock')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 3: RECEIVE CHAIN CONFIGURATION
  // ============================================================

  test('Objective: Configure Spectrum Analyzer for Downlink', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'configure-speca-downlink')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure RX Modem', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'configure-rx-modem')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify RX Signal Lock', async () => {
    // RX lock with SNR threshold can take time
    test.setTimeout(120000);
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'verify-rx-lock')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 4: ENCRYPTION & PAYLOAD UNDERSTANDING
  // ============================================================

  test('Objective: Verify Encryption Understanding', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'quiz-encryption')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 5: TRANSMIT CONFIGURATION
  // ============================================================

  test('Objective: Calculate TX IF Frequency', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'calculate-tx-if')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure TX Modem', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'configure-tx-modem')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Enable Transmit Path', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'enable-transmit-path')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 6: FINAL VERIFICATION
  // ============================================================

  test('Objective: Full Duplex Established', async () => {
    const objective = SCENARIO_6_OBJECTIVES.find(o => o.id === 'final-verification')!;
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
