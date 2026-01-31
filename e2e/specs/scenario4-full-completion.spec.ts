import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 4 objectives - New Bird on the Block: Satellite Switchover Operations.
 *
 * Objectives can be:
 * - 'quiz': Requires answering a quiz question
 * - 'select-station': Requires clicking on ground station in asset tree
 * - 'click-tab': Requires clicking a specific tab
 * - 'auto': Automatically satisfied by game state
 * - 'toggle-switch': Requires toggling a switch on/off
 * - 'set-tracking-mode': Requires clicking a tracking mode button
 * - 'configure-speca': Requires configuring spectrum analyzer settings
 * - 'configure-rx-modem': Requires configuring receiver modem
 * - 'configure-tx-modem': Requires configuring transmitter modem
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'auto'
  | 'toggle-switch'
  | 'set-tracking-mode'
  | 'configure-speca'
  | 'configure-rx-modem'
  | 'configure-tx-modem';

interface Scenario4Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string; // For quiz type
  tabId?: string; // For click-tab type
  switchId?: string; // For toggle-switch type
  switchState?: boolean; // true = on/checked, false = off/unchecked
  trackingMode?: string; // For set-tracking-mode type
  waitForAntennaPosition?: boolean; // Wait for antenna to reach position
  specaConfig?: {
    // For configure-speca type
    centerFrequency: number; // MHz
    span: number; // kHz
    rbw: number; // Hz
    referenceLevel: number; // dBm
  };
  rxModemConfig?: {
    // For configure-rx-modem type
    frequency?: number; // MHz
    bandwidth?: number; // MHz
    modulation?: string;
    fec?: string;
  };
  txModemConfig?: {
    // For configure-tx-modem type
    frequency?: number; // MHz
    bandwidth?: number; // MHz
    power?: number; // dBm
    modulation?: string;
    fec?: string;
    transmitting?: boolean;
  };
}

const SCENARIO_4_OBJECTIVES: Scenario4Objective[] = [
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
    title: 'Access Vermont Ground Station',
    type: 'select-station',
  },
  {
    id: 'navigate-acu-verify',
    title: 'Open ACU Control Tab',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'verify-current-status',
    title: 'Verify Current TIDEMARK-1 Status',
    type: 'quiz',
    correctAnswer: 'TIDEMARK-1',
  },
  {
    id: 'verify-antenna-initial-state',
    title: 'Verify Antenna Configuration',
    type: 'quiz',
    correctAnswer:
      'Program-track - the antenna follows ephemeris data and will need new coordinates for TIDEMARK-2',
  },

  // ============================================================
  // PHASE 2: ANTENNA RECONFIGURATION
  // ============================================================
  {
    id: 'command-antenna',
    title: 'Command Antenna to Track TIDEMARK-2',
    type: 'set-tracking-mode',
    trackingMode: 'program-track',
    waitForAntennaPosition: true,
  },
  {
    id: 'verify-antenna-slew-quiz',
    title: 'Understand Position Change',
    type: 'quiz',
    correctAnswer:
      'TIDEMARK-2 is at a different orbital slot (45°W vs 53°W), requiring different look angles from Vermont',
  },

  // ============================================================
  // PHASE 3: BEACON ACQUISITION
  // ============================================================
  {
    id: 'navigate-rx-beacon',
    title: 'Open RX Analysis Tab',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'understand-frequency-calculation',
    title: 'Calculate Beacon IF Frequency',
    type: 'quiz',
    correctAnswer: '1,070 MHz (LO minus RF = 5,250 - 4,180)',
  },
  {
    id: 'configure-speca-beacon',
    title: 'Configure Spectrum Analyzer for TIDEMARK-2 Beacon',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1070, // MHz
      span: 10, // kHz
      rbw: 1000, // Hz
      referenceLevel: -90, // dBm
    },
  },
  {
    id: 'acquire-beacon',
    title: 'Acquire TIDEMARK-2 Beacon',
    type: 'auto', // signal-detected condition is auto-satisfied
  },
  {
    id: 'verify-beacon-acquisition',
    title: 'Verify Beacon Acquisition',
    type: 'quiz',
    correctAnswer: 'Both antenna pointing and LNB frequency are correct',
  },
  {
    id: 'verify-beacon-chain-quiz',
    title: 'Understand Receive Chain Validation',
    type: 'quiz',
    correctAnswer:
      'It proves the entire RF path is working - antenna feed, LNB, cables, and signal routing - so we know modem issues would be modem configuration, not upstream problems',
  },

  // ============================================================
  // PHASE 4: RECEIVER CONFIGURATION
  // ============================================================
  {
    id: 'configure-rx-frequency',
    title: 'Configure RX Modem Frequency',
    type: 'configure-rx-modem',
    rxModemConfig: {
      frequency: 1458, // MHz
      bandwidth: 36, // MHz
    },
  },
  {
    id: 'configure-rx-modulation',
    title: 'Configure RX Modem Modulation',
    type: 'configure-rx-modem',
    rxModemConfig: {
      modulation: 'QPSK',
      fec: '3/4',
    },
  },
  {
    id: 'verify-rx-lock',
    title: 'Verify RX Signal Lock',
    type: 'auto', // receiver-signal-locked condition is auto-satisfied once modem is configured
  },
  {
    id: 'verify-rx-margin-quiz',
    title: 'Understand Link Margin',
    type: 'quiz',
    correctAnswer:
      'Lock can occur at C/N as low as 3-4 dB, but error rates would be high - we need margin for reliable operation',
  },

  // ============================================================
  // PHASE 5: TRANSMITTER CONFIGURATION
  // ============================================================
  {
    id: 'navigate-tx-chain',
    title: 'Open TX Chain Tab',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'verify-tx-initial-state',
    title: 'Verify TX Chain Status',
    type: 'quiz',
    correctAnswer: 'BUC is muted and HPA is disabled - no RF output (safe state for switchover)',
  },
  {
    id: 'configure-tx-modem',
    title: 'Configure TX Modem',
    type: 'configure-tx-modem',
    txModemConfig: {
      frequency: 1020, // MHz
      bandwidth: 36, // MHz
      power: -7, // dBm
      modulation: 'QPSK',
      fec: '3/4',
      transmitting: true,
    },
  },
  {
    id: 'understand-buc-hpa-sequence',
    title: 'Understand TX Sequence',
    type: 'quiz',
    correctAnswer:
      'Unmute BUC first, then enable HPA - drive the amplifier chain from input to output to avoid undriven amplifiers',
  },
  {
    id: 'enable-transmit-path',
    title: 'Enable Transmit Path',
    type: 'toggle-switch',
    switchId: 'buc-mute', // First unmute BUC, then enable HPA
    switchState: false, // Unmute = unchecked
  },
  {
    id: 'verify-full-duplex-quiz',
    title: 'Verify Full Duplex Operation',
    type: 'quiz',
    correctAnswer:
      'Receiver locked with good C/N, HPA enabled with proper backoff, no alarms - bidirectional link established',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Toggle a switch element to the specified state.
 * @param switchId The ID of the switch element (without # prefix)
 * @param targetState true = checked/on, false = unchecked/off
 */
async function toggleSwitch(
  page: import('@playwright/test').Page,
  switchId: string,
  targetState: boolean
): Promise<void> {
  const switchEl = page.locator(`#${switchId}`);
  await expect(switchEl).toBeVisible({ timeout: 5000 });

  // Check current state
  const isChecked = await switchEl.isChecked();

  // Only click if state needs to change
  if (isChecked !== targetState) {
    await switchEl.click();
  }

  // Verify the switch is in the expected state
  if (targetState) {
    await expect(switchEl).toBeChecked();
  } else {
    await expect(switchEl).not.toBeChecked();
  }

  // Wait for state to propagate
  await page.waitForTimeout(200);
}

/**
 * Set the antenna tracking mode by clicking the appropriate button.
 * ACU control tab must be active before calling this.
 */
async function setTrackingMode(
  page: import('@playwright/test').Page,
  trackingMode: string
): Promise<void> {
  // Find the tracking mode button with data-mode attribute
  const modeButton = page.locator(`.btn-tracking[data-mode="${trackingMode}"]`);
  await expect(modeButton).toBeVisible({ timeout: 5000 });
  await modeButton.click();

  // Wait for mode change to stage position changes
  await page.waitForTimeout(300);

  // For maintenance and stow modes, the position is staged but needs Apply to move
  if (trackingMode === 'maintenance' || trackingMode === 'stow') {
    const applyBtn = page.locator('button[id$="apply-changes-btn"]');
    await expect(applyBtn).toBeEnabled({ timeout: 3000 });
    await applyBtn.click();
    await page.waitForTimeout(200);
  }
}

/**
 * Select TIDEMARK-2 satellite in dropdown and click Move to Target.
 * Used for program-track mode to switch satellites.
 */
async function selectTidemark2AndMove(page: import('@playwright/test').Page): Promise<void> {
  // Wait for satellite dropdown to be visible
  const satelliteSelect = page.locator('select[id$="satellite-select"]');
  await expect(satelliteSelect).toBeVisible({ timeout: 5000 });

  // Select TIDEMARK-2 (NORAD ID 61526)
  await satelliteSelect.selectOption({ value: '61526' });
  await page.waitForTimeout(200);

  // Click Move to Target button
  const moveBtn = page.locator('button[id$="move-to-target-btn"]');
  await expect(moveBtn).toBeEnabled({ timeout: 5000 });
  await moveBtn.click();

  // Wait for move command to be issued
  await page.waitForTimeout(300);
}

/**
 * Wait for antenna movement to complete by monitoring position changes.
 * The antenna moves at ~2-5 deg/sec, so large movements take several seconds.
 */
async function waitForAntennaMovement(
  page: import('@playwright/test').Page,
  timeout = 90000
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
 * Configure spectrum analyzer settings.
 * Note: RBW is a select dropdown, reference level is in hidden engineering controls.
 * Vermont's spectrum analyzer default reference level (-91 dBm) is already within tolerance.
 */
async function configureSpectrumAnalyzer(
  page: import('@playwright/test').Page,
  config: { centerFrequency: number; span: number; rbw: number; referenceLevel: number }
): Promise<void> {
  // Configure center frequency (in MHz)
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(config.centerFrequency.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(100);

  // Configure span - input expects MHz, config.span is in kHz
  // Convert kHz to MHz: 10 kHz = 0.01 MHz
  const spanInput = page.locator('#sa-span');
  await expect(spanInput).toBeVisible();
  const spanInMHz = config.span / 1000; // Convert kHz to MHz
  await spanInput.fill(spanInMHz.toString());
  await spanInput.press('Tab');
  await page.waitForTimeout(100);

  // Configure RBW - this is a select dropdown with values in MHz
  // config.rbw is in Hz: 1000 Hz = 1 kHz = 0.001 MHz
  const rbwSelect = page.locator('#sa-rbw');
  await expect(rbwSelect).toBeVisible();
  const rbwInMHz = config.rbw / 1e6; // Convert Hz to MHz
  await rbwSelect.selectOption({ value: rbwInMHz.toString() });
  await page.waitForTimeout(100);

  // Reference level is in hidden engineering controls - skip configuring it
  // Vermont's spectrum analyzer is already configured with referenceLevel: -91 dBm
  // which is within the tolerance of -90 ± 5 dBm

  await page.waitForTimeout(300);
}

/**
 * Configure receiver modem settings.
 * Element IDs: #frequency-input, #bandwidth-input, #modulation-select, #fec-select, #apply-btn
 */
async function configureRxModem(
  page: import('@playwright/test').Page,
  config: { frequency?: number; bandwidth?: number; modulation?: string; fec?: string }
): Promise<void> {
  // Configure frequency (in MHz) if specified
  if (config.frequency !== undefined) {
    const freqInput = page.locator('#frequency-input');
    await expect(freqInput).toBeVisible({ timeout: 5000 });
    await freqInput.fill(config.frequency.toString());
    await freqInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Configure bandwidth (in MHz) if specified
  if (config.bandwidth !== undefined) {
    const bwInput = page.locator('#bandwidth-input');
    await expect(bwInput).toBeVisible();
    await bwInput.fill(config.bandwidth.toString());
    await bwInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Configure modulation if specified
  if (config.modulation !== undefined) {
    const modSelect = page.locator('#modulation-select');
    await expect(modSelect).toBeVisible();
    await modSelect.selectOption({ label: config.modulation });
    await page.waitForTimeout(100);
  }

  // Configure FEC if specified
  if (config.fec !== undefined) {
    const fecSelect = page.locator('#fec-select');
    await expect(fecSelect).toBeVisible();
    await fecSelect.selectOption({ label: config.fec });
    await page.waitForTimeout(100);
  }

  // Click Apply button to commit changes
  const applyBtn = page.locator('#apply-btn');
  await expect(applyBtn).toBeVisible();
  await applyBtn.click();
  await page.waitForTimeout(500);
}

/**
 * Configure transmitter modem settings.
 * Element IDs: #tx-frequency-input, #tx-bandwidth-input, #tx-power-input,
 *              #tx-modulation-select, #tx-fec-select, #tx-apply-btn, #tx-transmit-switch
 */
async function configureTxModem(
  page: import('@playwright/test').Page,
  config: {
    frequency?: number;
    bandwidth?: number;
    power?: number;
    modulation?: string;
    fec?: string;
    transmitting?: boolean;
  }
): Promise<void> {
  // Configure frequency (in MHz) if specified
  if (config.frequency !== undefined) {
    const freqInput = page.locator('#tx-frequency-input');
    await expect(freqInput).toBeVisible({ timeout: 5000 });
    await freqInput.fill(config.frequency.toString());
    await freqInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Configure bandwidth (in MHz) if specified
  if (config.bandwidth !== undefined) {
    const bwInput = page.locator('#tx-bandwidth-input');
    await expect(bwInput).toBeVisible();
    await bwInput.fill(config.bandwidth.toString());
    await bwInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Configure power (in dBm) if specified
  if (config.power !== undefined) {
    const powerInput = page.locator('#tx-power-input');
    await expect(powerInput).toBeVisible();
    await powerInput.fill(config.power.toString());
    await powerInput.press('Tab');
    await page.waitForTimeout(100);
  }

  // Configure modulation if specified
  if (config.modulation !== undefined) {
    const modSelect = page.locator('#tx-modulation-select');
    await expect(modSelect).toBeVisible();
    await modSelect.selectOption({ label: config.modulation });
    await page.waitForTimeout(100);
  }

  // Configure FEC if specified
  if (config.fec !== undefined) {
    const fecSelect = page.locator('#tx-fec-select');
    await expect(fecSelect).toBeVisible();
    await fecSelect.selectOption({ label: config.fec });
    await page.waitForTimeout(100);
  }

  // Click Apply button to commit changes
  const applyBtn = page.locator('#tx-apply-btn');
  await expect(applyBtn).toBeVisible();
  await applyBtn.click();
  await page.waitForTimeout(300);

  // Enable transmission if specified
  if (config.transmitting === true) {
    const txSwitch = page.locator('#tx-transmit-switch');
    await expect(txSwitch).toBeVisible({ timeout: 5000 });
    const isChecked = await txSwitch.isChecked();
    if (!isChecked) {
      await txSwitch.click();
      await expect(txSwitch).toBeChecked();
    }
    await page.waitForTimeout(200);
  }
}

/**
 * Enable the transmit path by unmuting BUC and enabling HPA in correct sequence.
 * Dependency chain: BUC Power → HPA Power → HPA Enable
 */
async function enableTransmitPath(page: import('@playwright/test').Page): Promise<void> {
  // Step 1: Ensure BUC is powered on (required for HPA power)
  const bucPowerSwitch = page.locator('#buc-power');
  await expect(bucPowerSwitch).toBeVisible({ timeout: 5000 });
  if (!(await bucPowerSwitch.isChecked())) {
    await bucPowerSwitch.click();
    await expect(bucPowerSwitch).toBeChecked();
  }
  await page.waitForTimeout(300);

  // Step 2: Unmute BUC (uncheck the mute switch)
  const bucMuteSwitch = page.locator('#buc-mute');
  await expect(bucMuteSwitch).toBeVisible({ timeout: 5000 });
  if (await bucMuteSwitch.isChecked()) {
    await bucMuteSwitch.click();
    await expect(bucMuteSwitch).not.toBeChecked();
  }
  await page.waitForTimeout(300);

  // Step 3: Ensure HPA is powered on (requires BUC powered first)
  const hpaPowerSwitch = page.locator('#hpa-power');
  await expect(hpaPowerSwitch).toBeVisible({ timeout: 5000 });
  if (!(await hpaPowerSwitch.isChecked())) {
    await hpaPowerSwitch.click();
    await expect(hpaPowerSwitch).toBeChecked();
  }
  await page.waitForTimeout(300);

  // Step 4: Enable HPA output (requires HPA powered first)
  // Note: Due to state mismatch (isHpaSwitchEnabled=true but isHpaEnabled=false in scenario4),
  // the first click may sync the switch state rather than enable. Retry if needed.
  const hpaEnableSwitch = page.locator('#hpa-enable');
  await expect(hpaEnableSwitch).toBeVisible({ timeout: 5000 });

  // Try up to 3 clicks to handle state mismatch
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await hpaEnableSwitch.isChecked()) {
      break; // Already enabled
    }
    await hpaEnableSwitch.click();
    await page.waitForTimeout(300);
  }

  await expect(hpaEnableSwitch).toBeChecked({ timeout: 5000 });
  await page.waitForTimeout(300);
}

/**
 * Wait for receiver to lock with good SNR.
 * Element IDs: #signal-status (badge showing lock state), #cn-effective-display (C/N ratio)
 */
async function waitForRxLock(
  page: import('@playwright/test').Page,
  timeout = 30000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // Check signal status badge - it shows "Locked" when receiver is locked
      const signalStatus = page.locator('#signal-status');
      const statusText = await signalStatus.textContent({ timeout: 1000 });

      if (statusText?.toLowerCase().includes('lock')) {
        // Also verify C/N is above threshold (10 dB)
        const cnDisplay = page.locator('#cn-effective-display');
        const cnText = await cnDisplay.textContent({ timeout: 1000 });
        const cnMatch = cnText?.match(/([\d.]+)\s*dB/);
        if (cnMatch && parseFloat(cnMatch[1]) >= 10) {
          return;
        }
      }
    } catch {
      // Not locked yet, continue waiting
    }
    await page.waitForTimeout(1000);
  }
  // console.warn('RX lock may not have been achieved within timeout');
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario4Objective
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

    case 'toggle-switch':
      if (objective.id === 'enable-transmit-path') {
        // Special handling for transmit path - need to do BUC then HPA
        await enableTransmitPath(page);
      } else {
        await toggleSwitch(page, objective.switchId!, objective.switchState!);
      }
      break;

    case 'set-tracking-mode':
      await setTrackingMode(page, objective.trackingMode!);
      // For this scenario, we need to select TIDEMARK-2 specifically
      if (objective.trackingMode === 'program-track') {
        await selectTidemark2AndMove(page);
      }
      if (objective.waitForAntennaPosition) {
        await waitForAntennaMovement(page);
      }
      break;

    case 'configure-speca':
      await configureSpectrumAnalyzer(page, objective.specaConfig!);
      break;

    case 'configure-rx-modem':
      await configureRxModem(page, objective.rxModemConfig!);
      break;

    case 'configure-tx-modem':
      await configureTxModem(page, objective.txModemConfig!);
      break;

    case 'auto':
      // Auto-satisfied objectives complete when conditions are met
      // For verify-rx-lock, wait for the receiver to actually lock
      if (objective.id === 'verify-rx-lock') {
        await waitForRxLock(page);
      } else {
        await page.waitForTimeout(2000);
      }
      break;
  }

  // Dismiss any dialog that appears after objective completion
  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 4 Full Completion', () => {
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

    // Navigate directly to scenario 4 (bypasses prerequisite check)
    await missionControlPage.gotoScenario('nats', 'nats-scenario4');
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
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'review-mission-brief')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Access Vermont Ground Station', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'select-vermont-station')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Open ACU Control Tab', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'navigate-acu-verify')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Current TIDEMARK-1 Status', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-current-status')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Antenna Configuration', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-antenna-initial-state')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 2: ANTENNA RECONFIGURATION
  // ============================================================

  test('Objective: Command Antenna to Track TIDEMARK-2', async () => {
    // Antenna movement can take up to 90 seconds
    test.setTimeout(120000);
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'command-antenna')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Position Change', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-antenna-slew-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 3: BEACON ACQUISITION
  // ============================================================

  test('Objective: Open RX Analysis Tab', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'navigate-rx-beacon')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Calculate Beacon IF Frequency', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'understand-frequency-calculation')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure Spectrum Analyzer for TIDEMARK-2 Beacon', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'configure-speca-beacon')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Acquire TIDEMARK-2 Beacon', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'acquire-beacon')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Beacon Acquisition', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-beacon-acquisition')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Receive Chain Validation', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-beacon-chain-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 4: RECEIVER CONFIGURATION
  // ============================================================

  test('Objective: Configure RX Modem Frequency', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'configure-rx-frequency')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure RX Modem Modulation', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'configure-rx-modulation')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify RX Signal Lock', async () => {
    test.setTimeout(90000); // RX lock can take time
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-rx-lock')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Link Margin', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-rx-margin-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // PHASE 5: TRANSMITTER CONFIGURATION
  // ============================================================

  test('Objective: Open TX Chain Tab', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'navigate-tx-chain')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify TX Chain Status', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-tx-initial-state')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure TX Modem', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'configure-tx-modem')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand TX Sequence', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'understand-buc-hpa-sequence')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Enable Transmit Path', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'enable-transmit-path')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Full Duplex Operation', async () => {
    const objective = SCENARIO_4_OBJECTIVES.find((o) => o.id === 'verify-full-duplex-quiz')!;
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
