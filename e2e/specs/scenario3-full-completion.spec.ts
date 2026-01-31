import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 3 objectives - Weather Emergency Handover: Multi-Site Operations.
 *
 * Objectives can be:
 * - 'quiz': Requires answering a quiz question
 * - 'select-station': Requires clicking on ground station in asset tree
 * - 'click-tab': Requires clicking a specific tab
 * - 'auto': Automatically satisfied by game state
 * - 'toggle-switch': Requires toggling a switch on/off
 * - 'set-tracking-mode': Requires clicking a tracking mode button
 * - 'configure-lnb': Requires configuring LNB settings
 * - 'configure-speca': Requires configuring spectrum analyzer settings
 * - 'configure-rx-modem': Requires configuring receiver modem
 * - 'configure-tx-modem': Requires configuring transmitter modem
 * - 'select-satellite': Requires selecting satellite in asset tree
 * - 'execute-handover': Requires executing traffic handover
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'auto'
  | 'toggle-switch'
  | 'set-tracking-mode'
  | 'configure-lnb'
  | 'configure-speca'
  | 'configure-rx-modem'
  | 'configure-tx-modem'
  | 'select-satellite'
  | 'execute-handover';

interface Scenario3Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string; // For quiz type
  tabId?: string; // For click-tab type
  switchId?: string; // For toggle-switch type
  switchState?: boolean; // true = on/checked, false = off/unchecked
  trackingMode?: string; // For set-tracking-mode type
  waitForAntennaPosition?: boolean; // Wait for antenna to reach position
  stationId?: string; // For select-station type
  lnbConfig?: {
    // For configure-lnb type
    loFrequency: number;
    gain: number;
  };
  specaConfig?: {
    // For configure-speca type
    centerFrequency: number; // MHz
    span: number; // MHz (UI input uses MHz)
    minAmplitude?: number; // dBm
    maxAmplitude?: number; // dBm
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
  satelliteId?: string; // For select-satellite type
  handoverConfig?: {
    // For execute-handover type
    targetStation: string;
  };
}

const SCENARIO_3_OBJECTIVES: Scenario3Objective[] = [
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
  // WEATHER PROTECTION - VT-01
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Access Vermont Ground Station',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'navigate-acu-vt01-heater',
    title: 'Open ACU Control Tab',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'enable-vt01-heater',
    title: 'Enable Feed Heater',
    type: 'toggle-switch',
    switchId: 'vt-01-heater-switch',
    switchState: true,
  },
  {
    id: 'understand-prioritization',
    title: 'Understand Operational Priorities',
    type: 'quiz',
    correctAnswer: 'Safety → Customer Impact → Equipment Protection → Efficiency',
  },
  {
    id: 'verify-heater-quiz',
    title: 'Understand Feed Heater Consequences',
    type: 'quiz',
    correctAnswer:
      'Ice would accumulate on the feed horn and waveguide, causing signal attenuation and potential physical damage',
  },

  // ============================================================
  // AGC MONITORING - VT-01
  // ============================================================
  {
    id: 'navigate-rx-vt01-agc',
    title: 'Open RX Analysis Tab',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'verify-agc-status',
    title: 'Understand AGC Function',
    type: 'quiz',
    correctAnswer:
      'The output signal level would drop as weather attenuated the input, eventually causing loss of lock',
  },
  {
    id: 'estimate-time-remaining',
    title: 'Understand Time Pressure',
    type: 'quiz',
    correctAnswer:
      "Weather degradation is progressive - once AGC runs out of compensation range, the link fails rapidly",
  },
  {
    id: 'verify-agc-limits-quiz',
    title: 'Understand AGC Limitations',
    type: 'quiz',
    correctAnswer:
      'AGC has a maximum gain limit - once reached, further signal loss cannot be compensated',
  },

  // ============================================================
  // SWITCH TO MAINE STATION
  // ============================================================
  {
    id: 'switch-to-maine',
    title: 'Access Maine Backup Station',
    type: 'select-station',
    stationId: 'ME-02',
  },
  {
    id: 'verify-multisite-quiz',
    title: 'Understand Multi-Site Operations',
    type: 'quiz',
    correctAnswer:
      'Vermont continues operating normally - customers are still being served from VT-01',
  },

  // ============================================================
  // VERIFY MAINE TIMING REFERENCE
  // ============================================================
  {
    id: 'navigate-gps-timing-maine',
    title: 'Open GPS Timing Tab',
    type: 'click-tab',
    tabId: 'gps-timing',
  },
  {
    id: 'verify-maine-gpsdo',
    title: 'Verify GPSDO Lock Status',
    type: 'quiz',
    correctAnswer: 'Locked - stable frequency reference available',
  },
  {
    id: 'verify-gpsdo-weather-quiz',
    title: 'Understand Weather Impact on GPSDO',
    type: 'quiz',
    correctAnswer:
      'GPS uses L-band frequencies (~1.5 GHz) which are less affected by precipitation than C-band',
  },

  // ============================================================
  // CONFIGURE MAINE ANTENNA
  // ============================================================
  {
    id: 'navigate-acu-maine',
    title: 'Open ACU Control Tab',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'configure-maine-antenna',
    title: 'Point Antenna at TIDEMARK-1',
    type: 'set-tracking-mode',
    trackingMode: 'program-track',
    waitForAntennaPosition: true,
  },
  {
    id: 'catherine-look-angles',
    title: "Catherine's Sanity Check",
    type: 'quiz',
    correctAnswer:
      "Because look angles to a satellite depend on the ground station's geographic location",
  },

  // ============================================================
  // CONFIGURE MAINE LNB
  // ============================================================
  {
    id: 'navigate-rx-maine-lnb',
    title: 'Open RX Analysis Tab',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'configure-maine-lnb',
    title: 'Power Up LNB',
    type: 'configure-lnb',
    lnbConfig: {
      loFrequency: 5250,
      gain: 60,
    },
  },
  {
    id: 'verify-lnb-config-quiz',
    title: 'Verify LNB Configuration',
    type: 'quiz',
    correctAnswer:
      'Same LO frequency produces the same IF frequency, so downstream equipment configuration is identical',
  },

  // ============================================================
  // VERIFY BEACON ON SPECTRUM ANALYZER
  // ============================================================
  {
    id: 'configure-speca-maine',
    title: 'Configure Spectrum Analyzer',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1074.5, // MHz
      span: 0.002, // MHz (2 kHz) - span input uses MHz
      minAmplitude: -65, // dBm
      maxAmplitude: -50, // dBm
    },
  },
  {
    id: 'verify-beacon-maine',
    title: 'Verify Beacon Signal',
    type: 'auto', // signal-detected condition is auto-satisfied
  },
  {
    id: 'verify-beacon-reason-quiz',
    title: 'Understand Beacon Verification',
    type: 'quiz',
    correctAnswer:
      'Beacon confirms the entire receive chain is working - antenna, feed, LNB, cables, and spectrum analyzer',
  },

  // ============================================================
  // CONFIGURE MAINE RECEIVER MODEM
  // ============================================================
  {
    id: 'configure-maine-rx-modem',
    title: 'Configure Receiver Modem',
    type: 'configure-rx-modem',
    rxModemConfig: {
      frequency: 1532, // MHz
      bandwidth: 36, // MHz
      modulation: 'QPSK',
      fec: '3/4',
    },
  },
  {
    id: 'verify-modem-match-quiz',
    title: 'Understand Parameter Matching',
    type: 'quiz',
    correctAnswer:
      'Both sites are receiving the same satellite carrier - mismatched parameters would fail to demodulate',
  },

  // ============================================================
  // VERIFY MAINE RECEIVER LOCK
  // ============================================================
  {
    id: 'verify-maine-lock',
    title: 'Confirm Signal Acquisition',
    type: 'auto', // receiver-signal-locked + receiver-snr-threshold conditions are auto-satisfied
  },
  {
    id: 'verify-lock-quality-quiz',
    title: 'Understand Lock vs. Quality',
    type: 'quiz',
    correctAnswer:
      'Lock can occur at low C/N but with high error rates - we need margin for reliable data',
  },

  // ============================================================
  // CONFIGURE MAINE TRANSMITTER
  // ============================================================
  {
    id: 'navigate-tx-maine',
    title: 'Open TX Chain Tab',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'configure-maine-tx-modem',
    title: 'Configure Transmitter Modem',
    type: 'configure-tx-modem',
    txModemConfig: {
      frequency: 1094, // MHz
      bandwidth: 36, // MHz
      power: -7, // dBm
      modulation: 'QPSK',
      fec: '3/4',
      transmitting: true,
    },
  },

  // ============================================================
  // EXECUTE TRAFFIC HANDOVER
  // ============================================================
  {
    id: 'navigate-dashboard-handover',
    title: 'Open Satellite Dashboard',
    type: 'select-satellite',
    satelliteId: 'sat-61525', // TIDEMARK-1
  },
  {
    id: 'understand-handover-quiz',
    title: 'Understand Handover Process',
    type: 'quiz',
    correctAnswer:
      "Maine's transmitter activates fully while Vermont's is disabled - avoiding dual uplinks to the satellite",
  },
  {
    id: 'execute-handover',
    title: 'Execute Traffic Handover',
    type: 'execute-handover',
    handoverConfig: {
      targetStation: 'ME-02',
    },
  },
  {
    id: 'verify-handover-success-quiz',
    title: 'Confirm Handover Success',
    type: 'quiz',
    correctAnswer:
      'Traffic indicator shows ME-02 as active, VT-01 TX disabled, no alarms, continuous data flow',
  },

  // ============================================================
  // STOW VERMONT ANTENNA
  // ============================================================
  {
    id: 'switch-to-vermont-stow',
    title: 'Return to Vermont Station',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'navigate-acu-vt01-stow',
    title: 'Open ACU Control Tab',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'stow-vermont-antenna',
    title: 'Stow Vermont Antenna',
    type: 'set-tracking-mode',
    trackingMode: 'stow',
    waitForAntennaPosition: true,
  },
  {
    id: 'verify-stow-quiz',
    title: 'Understand Stow Position',
    type: 'quiz',
    correctAnswer:
      'Minimizes wind loading on the dish and prevents snow from accumulating in the reflector',
  },
  // This is a single objective in the scenario with TWO quiz conditions.
  // The second quiz (Documentation Purpose) appears first in the UI, followed by the first quiz (What to Log).
  {
    id: 'document-handover-event-quiz1',
    title: 'Document Handover Event - Purpose',
    type: 'quiz',
    // This quiz has shuffled options with letter prefixes
    correctAnswer: 'Enables pattern analysis and improves future response procedures',
  },
  {
    id: 'document-handover-event-quiz2',
    title: 'Document Handover Event - What to Log',
    type: 'quiz',
    // This quiz has preserveOptionOrder: true so options stay in order
    correctAnswer: 'All of the above',
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
  // Try multiple selectors to find the switch
  let switchEl = page.locator(`#${switchId}`);

  // If not found, try with partial match for prefixed IDs
  if ((await switchEl.count()) === 0) {
    switchEl = page.locator(`[id$="${switchId}"]`);
  }
  if ((await switchEl.count()) === 0) {
    switchEl = page.locator(`[id*="heater-switch"]`);
  }

  await expect(switchEl.first()).toBeVisible({ timeout: 5000 });

  // Check current state
  const isChecked = await switchEl.first().isChecked();

  // Only click if state needs to change
  if (isChecked !== targetState) {
    await switchEl.first().click();
  }

  // Verify the switch is in the expected state
  if (targetState) {
    await expect(switchEl.first()).toBeChecked();
  } else {
    await expect(switchEl.first()).not.toBeChecked();
  }

  // Wait for state to propagate
  await page.waitForTimeout(200);
}

/**
 * Set the antenna tracking mode by clicking the appropriate button.
 * ACU control tab must be active before calling this.
 * For maintenance and stow modes, also clicks Apply to commit the position change.
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
    // Wait for Apply button to be enabled (indicates pending changes)
    await expect(applyBtn).toBeEnabled({ timeout: 3000 });
    await applyBtn.click();
    await page.waitForTimeout(200);
  }
}

/**
 * Select TIDEMARK-1 satellite in dropdown and click Move to Target.
 * Used for program-track mode.
 */
async function selectSatelliteAndMove(page: import('@playwright/test').Page): Promise<void> {
  // Wait for satellite dropdown to be visible
  const satelliteSelect = page.locator('select[id$="satellite-select"]');
  await expect(satelliteSelect).toBeVisible({ timeout: 5000 });

  // Select TIDEMARK-1 (NORAD ID 61525)
  await satelliteSelect.selectOption({ value: '61525' });
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

    // Fallback: try finding by ID pattern (contains "el-fine")
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
      // Display not found, log and retry
      await page.waitForTimeout(500);
    }
  }

  // If we get here, antenna movement timed out but continue anyway
  console.warn('Antenna movement may not have completed within timeout');
}

/**
 * Configure LNB with specified settings.
 * Powers on LNB, sets LO frequency and gain, waits for thermal stabilization.
 */
async function configureLnb(
  page: import('@playwright/test').Page,
  config: { loFrequency: number; gain: number }
): Promise<void> {
  // Power on LNB
  const powerSwitch = page.locator('#lnb-power');
  await expect(powerSwitch).toBeVisible({ timeout: 5000 });
  const isChecked = await powerSwitch.isChecked();
  if (!isChecked) {
    await powerSwitch.click();
  }
  await expect(powerSwitch).toBeChecked();
  await page.waitForTimeout(500);

  // Set LO frequency using input field
  const loInput = page.locator('#lnb-lo-frequency');
  await expect(loInput).toBeVisible();
  await loInput.fill(config.loFrequency.toString());
  await loInput.press('Tab'); // Trigger change event
  await page.waitForTimeout(100);

  // Set gain using input field
  const gainInput = page.locator('#lnb-gain');
  await expect(gainInput).toBeVisible();
  await gainInput.fill(config.gain.toString());
  await gainInput.press('Tab'); // Trigger change event
  await page.waitForTimeout(100);

  // Click Apply button
  const applyBtn = page.locator('#lnb-apply-btn');
  await expect(applyBtn).toBeVisible();
  await applyBtn.click();

  // Wait for thermal stabilization (LNB takes ~3 seconds to stabilize)
  await page.waitForTimeout(4000);
}

/**
 * Configure spectrum analyzer settings.
 */
async function configureSpectrumAnalyzer(
  page: import('@playwright/test').Page,
  config: {
    centerFrequency: number;
    span: number;
    minAmplitude?: number;
    maxAmplitude?: number;
  }
): Promise<void> {
  // Configure center frequency (in MHz)
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(config.centerFrequency.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(100);

  // Configure span (in kHz)
  const spanInput = page.locator('#sa-span');
  await expect(spanInput).toBeVisible();
  // Convert kHz to MHz for the input (span is in kHz, input expects kHz)
  await spanInput.fill(config.span.toString());
  await spanInput.press('Tab');
  await page.waitForTimeout(100);

  // Configure min amplitude if specified
  if (config.minAmplitude !== undefined) {
    const minAmpInput = page.locator('#sa-min-amp');
    if ((await minAmpInput.count()) > 0 && (await minAmpInput.isVisible())) {
      await minAmpInput.fill(config.minAmplitude.toString());
      await minAmpInput.press('Tab');
      await page.waitForTimeout(100);
    }
  }

  // Configure max amplitude if specified
  if (config.maxAmplitude !== undefined) {
    const maxAmpInput = page.locator('#sa-max-amp');
    if ((await maxAmpInput.count()) > 0 && (await maxAmpInput.isVisible())) {
      await maxAmpInput.fill(config.maxAmplitude.toString());
      await maxAmpInput.press('Tab');
      await page.waitForTimeout(100);
    }
  }

  await page.waitForTimeout(300);
}

/**
 * Configure receiver modem settings.
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

  // Click Apply button if present
  const applyBtn = page.locator('#apply-btn');
  if ((await applyBtn.count()) > 0 && (await applyBtn.first().isVisible())) {
    await applyBtn.first().click();
    await page.waitForTimeout(500);
  }
}

/**
 * Configure transmitter modem settings.
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

  // Click Apply button to apply all configuration changes
  const applyBtn = page.locator('#tx-apply-btn');
  if ((await applyBtn.count()) > 0 && (await applyBtn.isVisible())) {
    await applyBtn.click();
    await page.waitForTimeout(500);
  }

  // Enable transmission if specified
  // NOTE: Only enable the modem's power and transmit switches. Do NOT enable BUC/HPA here.
  // For scenario 3, the handover process coordinates enabling ME-02's HPA
  // while disabling VT-01's HPA to avoid dual uplinks.
  if (config.transmitting === true) {
    // Step 1: Power on the transmitter modem (required for both equipment-powered
    // and tx-modem-transmitting conditions)
    const powerSwitch = page.locator('#tx-power-switch');
    await expect(powerSwitch).toBeVisible({ timeout: 5000 });
    if (!(await powerSwitch.isChecked())) {
      await powerSwitch.click();
      await expect(powerSwitch).toBeChecked();
    }
    await page.waitForTimeout(200);

    // Step 2: Enable transmission on the modem
    const txSwitch = page.locator('#tx-transmit-switch');
    await expect(txSwitch).toBeVisible({ timeout: 5000 });
    if (!(await txSwitch.isChecked())) {
      await txSwitch.click();
      await expect(txSwitch).toBeChecked();
    }
    await page.waitForTimeout(200);
  }

  // Wait for objective conditions to be evaluated
  // The objective manager needs time to check all conditions
  await page.waitForTimeout(2000);
}

/**
 * Select a satellite by clicking on it in the map or asset tree.
 */
async function selectSatellite(
  page: import('@playwright/test').Page,
  satelliteId: string
): Promise<void> {
  // Try clicking on satellite in the asset tree
  const satTreeItem = page.locator(`[data-asset-id="${satelliteId}"]`);
  await expect(satTreeItem).toBeVisible({ timeout: 10000 });
  await satTreeItem.click();

  // Wait for the selection to be processed and objective to complete
  await page.waitForTimeout(1000);

  // Verify the satellite is now selected (has 'active' class)
  await expect(satTreeItem).toHaveClass(/active/, { timeout: 5000 });
}

/**
 * Execute traffic handover to target station.
 */
async function executeTrafficHandover(
  page: import('@playwright/test').Page,
  targetStation: string
): Promise<void> {
  // Select target station in handover dropdown
  const handoverSelect = page.locator('#sat-handover-target');
  await expect(handoverSelect).toBeVisible({ timeout: 5000 });
  await handoverSelect.selectOption({ value: targetStation });
  await page.waitForTimeout(300);

  // Click execute handover button
  const executeBtn = page.locator('#sat-execute-handover');
  await expect(executeBtn).toBeVisible({ timeout: 5000 });
  await expect(executeBtn).toBeEnabled({ timeout: 10000 });
  await executeBtn.click();

  // Wait for handover to complete
  await page.waitForTimeout(2000);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario3Objective
): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      // Wait for quiz to appear and answer it
      await waitForQuizToAppear(page);
      await answerQuizByText(page, objective.correctAnswer!);
      break;

    case 'select-station':
      // Click on ground station in the asset tree
      await missionControlPage.selectGroundStation(objective.stationId || 'VT-01');
      break;

    case 'click-tab':
      // Click on the specified tab
      await missionControlPage.selectTab(objective.tabId!);
      break;

    case 'toggle-switch':
      // Toggle a switch to the specified state
      await toggleSwitch(page, objective.switchId!, objective.switchState!);
      break;

    case 'set-tracking-mode':
      // Click a tracking mode button
      await setTrackingMode(page, objective.trackingMode!);
      // For program-track, need to select satellite and click Move to Target
      if (objective.trackingMode === 'program-track') {
        await selectSatelliteAndMove(page);
      }
      // Wait for antenna to reach position if needed
      if (objective.waitForAntennaPosition) {
        await waitForAntennaMovement(page);
      }
      break;

    case 'configure-lnb':
      // Power on LNB and configure settings
      await configureLnb(page, objective.lnbConfig!);
      break;

    case 'configure-speca':
      // Configure spectrum analyzer
      await configureSpectrumAnalyzer(page, objective.specaConfig!);
      break;

    case 'configure-rx-modem':
      // Configure receiver modem
      await configureRxModem(page, objective.rxModemConfig!);
      break;

    case 'configure-tx-modem':
      // Configure transmitter modem
      await configureTxModem(page, objective.txModemConfig!);
      break;

    case 'select-satellite':
      // Select satellite in asset tree or map
      await selectSatellite(page, objective.satelliteId!);
      break;

    case 'execute-handover':
      // Execute traffic handover
      await executeTrafficHandover(page, objective.handoverConfig!.targetStation);
      break;

    case 'auto':
      // Auto-satisfied objectives complete when conditions are met
      // Signal detection and receiver lock can take several seconds
      await page.waitForTimeout(3000);
      break;
  }

  // Dismiss any dialog that appears after objective completion
  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 3 Full Completion', () => {
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

    // Navigate directly to scenario 3 (bypasses prerequisite check)
    await missionControlPage.gotoScenario('nats', 'nats-scenario3');
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
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'review-mission-brief')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // WEATHER PROTECTION - VT-01
  // ============================================================

  test('Objective: Access Vermont Ground Station', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'select-vermont-station')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Open ACU Control Tab (VT-01)', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'navigate-acu-vt01-heater')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Enable Feed Heater', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'enable-vt01-heater')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Operational Priorities', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'understand-prioritization')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Feed Heater Consequences', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-heater-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // AGC MONITORING - VT-01
  // ============================================================

  test('Objective: Open RX Analysis Tab (VT-01)', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'navigate-rx-vt01-agc')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand AGC Function', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-agc-status')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Time Pressure', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'estimate-time-remaining')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand AGC Limitations', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-agc-limits-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // SWITCH TO MAINE STATION
  // ============================================================

  test('Objective: Access Maine Backup Station', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'switch-to-maine')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Multi-Site Operations', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-multisite-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // VERIFY MAINE TIMING REFERENCE
  // ============================================================

  test('Objective: Open GPS Timing Tab', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'navigate-gps-timing-maine')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify GPSDO Lock Status', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-maine-gpsdo')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Weather Impact on GPSDO', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-gpsdo-weather-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // CONFIGURE MAINE ANTENNA
  // ============================================================

  test('Objective: Open ACU Control Tab (Maine)', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'navigate-acu-maine')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Point Antenna at TIDEMARK-1', async () => {
    // Antenna movement can take up to 90 seconds
    test.setTimeout(120000);
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'configure-maine-antenna')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test("Objective: Catherine's Sanity Check", async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'catherine-look-angles')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // CONFIGURE MAINE LNB
  // ============================================================

  test('Objective: Open RX Analysis Tab (Maine)', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'navigate-rx-maine-lnb')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Power Up LNB', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'configure-maine-lnb')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify LNB Configuration', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-lnb-config-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // VERIFY BEACON ON SPECTRUM ANALYZER
  // ============================================================

  test('Objective: Configure Spectrum Analyzer', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'configure-speca-maine')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Verify Beacon Signal', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-beacon-maine')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Beacon Verification', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-beacon-reason-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // CONFIGURE MAINE RECEIVER MODEM
  // ============================================================

  test('Objective: Configure Receiver Modem', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'configure-maine-rx-modem')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Parameter Matching', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-modem-match-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // VERIFY MAINE RECEIVER LOCK
  // ============================================================

  test('Objective: Confirm Signal Acquisition', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-maine-lock')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Lock vs. Quality', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-lock-quality-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // CONFIGURE MAINE TRANSMITTER
  // ============================================================

  test('Objective: Open TX Chain Tab', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'navigate-tx-maine')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Configure Transmitter Modem', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'configure-maine-tx-modem')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // EXECUTE TRAFFIC HANDOVER
  // ============================================================

  test('Objective: Open Satellite Dashboard', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'navigate-dashboard-handover')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Handover Process', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'understand-handover-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Execute Traffic Handover', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'execute-handover')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Confirm Handover Success', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-handover-success-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  // ============================================================
  // STOW VERMONT ANTENNA
  // ============================================================

  test('Objective: Return to Vermont Station', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'switch-to-vermont-stow')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Open ACU Control Tab (Stow)', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'navigate-acu-vt01-stow')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Stow Vermont Antenna', async () => {
    // Antenna movement can take up to 90 seconds
    test.setTimeout(120000);
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'stow-vermont-antenna')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Understand Stow Position', async () => {
    const objective = SCENARIO_3_OBJECTIVES.find(o => o.id === 'verify-stow-quiz')!;
    await executeObjective(page, missionControlPage, objective);
  });

  test('Objective: Document Handover Event', async () => {
    // This objective has TWO quiz conditions but they may appear in different order.
    // The second quiz (Purpose) appears first in the UI with letter prefixes.
    const purposeQuiz = SCENARIO_3_OBJECTIVES.find(o => o.id === 'document-handover-event-quiz1')!;
    await executeObjective(page, missionControlPage, purposeQuiz);

    // The first quiz (What to Log) appears second in the UI without letter prefixes.
    // Check if there's another quiz to answer
    try {
      const whatToLogQuiz = SCENARIO_3_OBJECTIVES.find(o => o.id === 'document-handover-event-quiz2')!;
      await executeObjective(page, missionControlPage, whatToLogQuiz);
    } catch {
      // Quiz may have already been answered or doesn't appear
      console.log('Second quiz (What to Log) may have been auto-satisfied');
    }
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
