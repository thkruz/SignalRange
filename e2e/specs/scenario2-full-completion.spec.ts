import { test, expect } from '../fixtures/test-fixtures';
import {
  waitForSimulationReady,
  waitForQuizToAppear,
  answerQuizByText,
  dismissDialogIfPresent,
} from '../utils/simulation-helpers';

/**
 * Scenario 2 objectives - Scheduled Maintenance: Power Down and Recovery Procedures.
 *
 * Objectives can be:
 * - 'quiz': Requires answering a quiz question
 * - 'select-station': Requires clicking on ground station in asset tree
 * - 'click-tab': Requires clicking a specific tab
 * - 'auto': Automatically satisfied by game state
 * - 'toggle-switch': Requires toggling a switch on/off
 * - 'set-tracking-mode': Requires clicking a tracking mode button
 * - 'configure-lnb': Requires configuring LNB settings
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'auto'
  | 'toggle-switch'
  | 'set-tracking-mode'
  | 'configure-lnb';

interface Scenario2Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string; // For quiz type
  tabId?: string; // For click-tab type
  switchId?: string; // For toggle-switch type
  switchState?: boolean; // true = on/checked, false = off/unchecked
  trackingMode?: string; // For set-tracking-mode type
  lnbConfig?: {
    // For configure-lnb type
    loFrequency: number;
    gain: number;
  };
  waitForAntennaPosition?: boolean; // Wait for antenna to reach position
}

const SCENARIO_2_OBJECTIVES: Scenario2Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Mission Brief',
    type: 'quiz',
    correctAnswer: 'Yes, I have read the mission brief and I am ready to proceed.',
  },
  {
    id: 'safety-briefing',
    title: 'Acknowledge RF Safety Briefing',
    type: 'quiz',
    correctAnswer:
      'I have received and understood the RF safety briefing for today\'s maintenance work.',
  },

  // ============================================================
  // STATION ACCESS - TRANSMIT CHAIN
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Access Vermont Ground Station',
    type: 'select-station',
  },
  {
    id: 'navigate-tx-chain-shutdown',
    title: 'Open TX Chain Tab',
    type: 'click-tab',
    tabId: 'tx-chain',
  },

  // ============================================================
  // POWER-DOWN SEQUENCE: HPA
  // ============================================================
  {
    id: 'verify-hpa-initial-state',
    title: 'Verify Current HPA State',
    type: 'quiz',
    correctAnswer: 'HPA is enabled and transmitting with 10 dB backoff',
  },
  {
    id: 'disable-hpa-output',
    title: 'Disable HPA Output',
    type: 'toggle-switch',
    switchId: 'hpa-enable',
    switchState: false,
  },
  {
    id: 'verify-hpa-disabled-quiz',
    title: 'Confirm HPA Output Disabled',
    type: 'quiz',
    correctAnswer: 'HPA Enable indicator shows OFF - no RF output, but tubes still hot',
  },
  {
    id: 'power-off-hpa',
    title: 'Power Off HPA',
    type: 'toggle-switch',
    switchId: 'hpa-power',
    switchState: false,
  },

  // ============================================================
  // POWER-DOWN SEQUENCE: BUC
  // ============================================================
  {
    id: 'mute-buc',
    title: 'Mute BUC RF Output',
    type: 'toggle-switch',
    switchId: 'buc-mute',
    switchState: true,
  },
  {
    id: 'verify-buc-muted-quiz',
    title: 'Confirm BUC Muted',
    type: 'quiz',
    correctAnswer: 'RF Mute indicator is ON - no RF output from BUC',
  },

  // ============================================================
  // POWER-DOWN SEQUENCE: LNB
  // ============================================================
  {
    id: 'navigate-rx-analysis-shutdown',
    title: 'Open RX Analysis Tab',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'power-down-lnb',
    title: 'Power Down LNB',
    type: 'toggle-switch',
    switchId: 'lnb-power',
    switchState: false,
  },
  {
    id: 'verify-rf-chain-shutdown-quiz',
    title: 'Confirm RF Chain Shutdown',
    type: 'quiz',
    correctAnswer: 'GPSDO and control systems only - all RF equipment is off',
  },

  // ============================================================
  // ANTENNA POSITIONING
  // ============================================================
  {
    id: 'navigate-acu-control-maintenance',
    title: 'Open ACU Control Tab',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'antenna-to-maintenance',
    title: 'Move Antenna to Maintenance Position',
    type: 'set-tracking-mode',
    trackingMode: 'maintenance',
    waitForAntennaPosition: true,
  },
  {
    id: 'verify-maintenance-position-quiz',
    title: 'Confirm Maintenance Position',
    type: 'quiz',
    correctAnswer: 'Low enough for crew access, high enough to clear obstructions',
  },

  // ============================================================
  // MAINTENANCE WINDOW (SIMULATED)
  // ============================================================
  {
    id: 'maintenance-complete',
    title: 'Maintenance Window Complete',
    type: 'quiz',
    correctAnswer: 'Confirm all personnel are clear of the antenna and feed assembly',
  },

  // ============================================================
  // SERVICE RESTORATION: ANTENNA
  // ============================================================
  {
    id: 'repoint-antenna',
    title: 'Repoint Antenna at TIDEMARK-1',
    type: 'set-tracking-mode',
    trackingMode: 'program-track',
    waitForAntennaPosition: true,
  },

  // ============================================================
  // SERVICE RESTORATION: LNB
  // ============================================================
  {
    id: 'navigate-rx-analysis-restore',
    title: 'Open RX Analysis Tab',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'power-up-lnb',
    title: 'Restore LNB',
    type: 'configure-lnb',
    lnbConfig: {
      loFrequency: 5250,
      gain: 60,
    },
  },
  {
    id: 'verify-lnb-restored-quiz',
    title: 'Verify LNB Restoration',
    type: 'quiz',
    correctAnswer: 'All of the above should be confirmed',
  },

  // ============================================================
  // SERVICE RESTORATION: VERIFY BEACON
  // ============================================================
  {
    id: 'verify-beacon',
    title: 'Verify Beacon Reception',
    type: 'auto', // signal-detected condition is auto-satisfied
  },
  {
    id: 'verify-beacon-quiz',
    title: 'Confirm Beacon Analysis',
    type: 'quiz',
    correctAnswer: 'LO (5,250 MHz) - RF (4,175.5 MHz) = IF (1,074.5 MHz)',
  },

  // ============================================================
  // SERVICE RESTORATION: BUC
  // ============================================================
  {
    id: 'navigate-tx-chain-restore',
    title: 'Open TX Chain Tab',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'unmute-buc',
    title: 'Unmute BUC RF Output',
    type: 'toggle-switch',
    switchId: 'buc-mute',
    switchState: false,
  },

  // ============================================================
  // SERVICE RESTORATION: HPA
  // ============================================================
  {
    id: 'power-on-hpa',
    title: 'Power On HPA',
    type: 'toggle-switch',
    switchId: 'hpa-power',
    switchState: true,
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
    id: 'final-verification',
    title: 'Confirm Service Restored',
    type: 'quiz',
    correctAnswer:
      'Shutdown: HPA → BUC → LNB → Antenna. Restore: Antenna → LNB → BUC → HPA',
  },
];

test.describe('Scenario 2 Full Completion', () => {
  test('completes all objectives from campaign selection to mission complete', async ({
    page,
    missionControlPage,
  }) => {
    // Configure longer timeout (8 minutes) for full scenario completion
    // Scenario 2 is longer due to equipment operations and antenna movement
    test.setTimeout(480000);

    // Navigate directly to scenario 2 (bypasses prerequisite check)
    // In production, scenario 2 requires scenario 1 completion, but for e2e testing
    // we access the URL directly
    await missionControlPage.gotoScenario('nats', 'nats-scenario2');
    await waitForSimulationReady(page);

    // Step 1: Dismiss intro dialog
    await missionControlPage.dismissDialogIfPresent();

    // Step 2: Open mission brief (required for first objective's mission-brief-opened condition)
    await missionControlPage.openMissionBrief();
    // Close mission brief so it doesn't block subsequent UI interactions
    await missionControlPage.closeMissionBrief();

    // Step 3: Complete each objective based on its type
    for (const objective of SCENARIO_2_OBJECTIVES) {
      // Log current objective for debugging
      console.log(`Processing objective: ${objective.id} (${objective.type})`);

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

        case 'auto':
          // Auto-satisfied objectives complete when conditions are met
          // The objective system evaluates on UPDATE ticks, brief wait is sufficient
          await page.waitForTimeout(500);
          break;
      }

      // Dismiss any dialog that appears after objective completion
      await dismissDialogIfPresent(page);
    }

    // Step 4: Verify Level Complete modal appears
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });

    // Step 5: Verify "Mission Complete!" text is shown
    const modalTitle = levelCompleteModal.locator('.complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');

    // Step 6: Verify score is displayed
    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();

    // Optionally verify the score is positive (all objectives should give points)
    const scoreText = await totalScore.textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});

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
 * For maintenance mode, also clicks Apply to commit the position change.
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
    console.log(`Clicked Apply button after setting tracking mode to ${trackingMode}`);
    await page.waitForTimeout(200);
  }
}

/**
 * Select TIDEMARK-1 satellite in dropdown and click Move to Target.
 * Only used for program-track mode.
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
    // The Elevation control has a label and value span - use text matching
    // Try multiple selector strategies
    let elDisplay = page.locator('.fine-adjust-control', { hasText: 'Elevation' })
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
          console.log(`Antenna stabilized at elevation: ${currentPosition}`);
          return;
        }
      } else {
        stableCount = 0;
        lastPosition = currentPosition || '';
        console.log(`Antenna moving... elevation: ${currentPosition}`);
      }
    } catch {
      // Display not found, log and retry
      console.log(`Waiting for elevation display... (${Date.now() - startTime}ms elapsed)`);
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

  // Verify thermal stability indicator shows green (if visible)
  // The objective condition checks for lnb-thermally-stable, so we wait
}
