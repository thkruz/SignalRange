import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 11 - "Planned Maintenance: Hand Off": Coordinated Traffic Transfer.
 *
 * Qualified-operator planned-handover archetype. ME-02 is pre-staged with
 * TIDEMARK-1 RX hot. The operator verifies the receive side, brings up
 * ME-02 transmit (BUC unmute + HPA enable + TX modem transmit), executes
 * the handover via the satellite dashboard, then safes VT-01 for the
 * maintenance crew (HPA disable, BUC mute, antenna to maintenance position
 * at 5° elevation).
 *
 * Objective types:
 * - 'quiz': Status-check quiz (all SYSTEM-voiced in this scenario)
 * - 'select-station': Asset tree station selection
 * - 'click-tab': Tab navigation
 * - 'toggle-switch': Switch toggle (BUC mute, HPA enable, TX transmit)
 * - 'enable-tx-commit': Composite - unmute BUC + enable HPA + enable TX transmit
 * - 'set-tracking-mode': Antenna tracking mode (maintenance position)
 * - 'select-satellite': Asset tree satellite selection (open dashboard)
 * - 'execute-handover': Traffic handover dropdown + execute button
 * - 'auto': Pre-staged state already satisfies the condition
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'toggle-switch'
  | 'enable-tx-commit'
  | 'set-tracking-mode'
  | 'select-satellite'
  | 'execute-handover'
  | 'auto';

interface Scenario11Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  switchId?: string;
  switchState?: boolean;
  trackingMode?: string;
  waitForAntennaPosition?: boolean;
  satelliteId?: string;
  handoverConfig?: {
    targetStation: string;
  };
}

const SCENARIO_11_OBJECTIVES: Scenario11Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Shift Brief',
    type: 'quiz',
    correctAnswer:
      'TIDEMARK-1 traffic moves to ME-02 for a 2-hour VT-01 maintenance window, then comes back next shift',
  },

  // ============================================================
  // PHASE 1: VT-01 PRE-HANDOVER VERIFICATION
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'vt-pre-handover-dashboard-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'vt-pre-handover-dashboard',
    title: 'VT-01 Pre-Handover Sweep',
    type: 'quiz',
    correctAnswer:
      'A pre-handover snapshot documents what the link looked like healthy, so any post-handover anomaly can be attributed correctly',
  },
  {
    id: 'vt-confirm-tm1-locked',
    title: 'Confirm VT-01 Owns TIDEMARK-1',
    type: 'click-tab',
    tabId: 'acu-control',
  },

  // ============================================================
  // PHASE 2: ME-02 RECEIVE-SIDE VERIFICATION
  // ============================================================
  {
    id: 'switch-to-maine',
    title: 'Open ME-02',
    type: 'select-station',
    stationId: 'ME-02',
  },
  {
    id: 'me-verify-antenna-on-tm1',
    title: 'ME-02 Antenna on TIDEMARK-1',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'me-verify-beacon-and-rx',
    title: 'ME-02 Receive Chain Hot',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },

  // ============================================================
  // PHASE 3: ME-02 TRANSMIT COMMIT
  // ============================================================
  {
    id: 'me-tx-tab',
    title: 'Open TX Chain (ME-02)',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'me-stage-tx-for-handover',
    title: 'Stage ME-02 Transmit (cold)',
    type: 'enable-tx-commit',
  },
  {
    id: 'understand-commit-point',
    title: 'Understand the Commit Point',
    type: 'quiz',
    correctAnswer:
      'Antenna locked, RX carrier with C/N margin, TX chain staged - modem transmitting into a muted BUC, HPA disabled until the transfer swaps RF authority',
  },

  // ============================================================
  // PHASE 4: EXECUTE HANDOVER
  // ============================================================
  {
    id: 'open-tm1-dashboard',
    title: 'Open TIDEMARK-1 Dashboard',
    type: 'select-satellite',
    satelliteId: 'sat-61525',
  },
  {
    id: 'execute-handover',
    title: 'Execute Handover',
    type: 'execute-handover',
    handoverConfig: {
      targetStation: 'ME-02',
    },
  },
  {
    id: 'verify-me-traffic-owner',
    title: 'Verify ME-02 Owns Traffic',
    type: 'auto',
  },
  {
    id: 'catherine-confirm-hot',
    title: 'Confirm with Catherine',
    type: 'quiz',
    correctAnswer: 'Switch back to VT-01 and safe the RF chain for the maintenance crew',
  },

  // ============================================================
  // PHASE 5: VT-01 SAFING FOR MAINTENANCE CREW
  // ============================================================
  {
    id: 'switch-to-vermont-safing',
    title: 'Return to VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'vt-safe-tx-tab',
    title: 'Open TX Chain (VT-01)',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'vt-safe-tx-chain-hpa-disable',
    title: 'Safe VT-01 TX Chain - Disable HPA',
    type: 'toggle-switch',
    switchId: 'hpa-enable',
    switchState: false,
  },
  {
    id: 'vt-safe-tx-chain-buc-mute',
    title: 'Safe VT-01 TX Chain - Mute BUC',
    type: 'toggle-switch',
    switchId: 'buc-mute',
    switchState: true,
  },
  {
    id: 'vt-acu-tab',
    title: 'Open ACU Control (VT-01)',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'vt-antenna-maintenance-position',
    title: 'Park VT-01 Antenna at Maintenance Position',
    type: 'set-tracking-mode',
    trackingMode: 'maintenance',
    waitForAntennaPosition: true,
  },
  {
    id: 'vt-final-rf-safety-check',
    title: 'Final RF Safety Check',
    type: 'quiz',
    correctAnswer:
      'HPA disabled, BUC muted, antenna at maintenance position - no RF energy on the feed, dish accessible',
  },

  // ============================================================
  // SHIFT WRAP
  // ============================================================
  {
    id: 'log-handover-entry',
    title: 'Log the Handover',
    type: 'quiz',
    correctAnswer:
      '1000 - Planned handover TM-1 VT-01 to ME-02 complete. VT-01 RF chain safed, antenna at maintenance position. Crew on-site for HPA waveguide inspection. ME-02 (Vega) carrying traffic. Return to service next shift.',
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
  // Let the adapter's throttled DOM sync land before reading - the static
  // template can render a stale checked state right after the tab mounts.
  await page.waitForTimeout(1200);
  const isChecked = await switchEl.isChecked();
  if (isChecked !== desiredState) {
    await switchEl.click();
    if (desiredState) {
      await expect(switchEl).toBeChecked();
    } else {
      await expect(switchEl).not.toBeChecked();
    }
  }
  await page.waitForTimeout(200);
}

/**
 * Composite action: bring ME-02 transmit hot for the planned handover.
 * Unmutes BUC, enables HPA output, enables TX modem transmit.
 *
 * Order matters: unmute BUC first so the TX path has a signal source,
 * then enable HPA (interlock will see BUC unmuted), then enable transmit.
 * (Mirrors the safe enable sequence taught in S2/S7.)
 */
async function enableTxForHandover(page: import('@playwright/test').Page): Promise<void> {
  // STAGE ONLY: the BUC stays muted and the HPA stays disabled. The handover
  // engine swaps RF authority (source TX down, target TX up) at execute time.
  // Radiating from both stations at once trips the dual-transmission failure.

  // TX modem power + transmit switch. Power is already true in the pre-staged
  // state, but flip if needed for resilience.
  const powerSwitch = page.locator('#tx-power-switch');
  if ((await powerSwitch.count()) > 0) {
    const isPowered = await powerSwitch.isChecked();
    if (!isPowered) {
      await powerSwitch.click();
      await expect(powerSwitch).toBeChecked();
      await page.waitForTimeout(200);
    }
  }

  const txSwitch = page.locator('#tx-transmit-switch');
  await expect(txSwitch).toBeVisible({ timeout: 5000 });
  if (!(await txSwitch.isChecked())) {
    await txSwitch.click();
    await expect(txSwitch).toBeChecked();
  }

  // Wait for the objective manager to evaluate all three conditions.
  await page.waitForTimeout(2000);
}

/**
 * Set the antenna tracking mode by clicking the appropriate button.
 * For maintenance and stow modes, also clicks Apply to commit position.
 */
async function setTrackingMode(
  page: import('@playwright/test').Page,
  trackingMode: string
): Promise<void> {
  const modeButton = page.locator(`.btn-tracking[data-mode="${trackingMode}"]`);
  await expect(modeButton).toBeVisible({ timeout: 5000 });
  await modeButton.click();
  await page.waitForTimeout(300);

  if (trackingMode === 'maintenance' || trackingMode === 'stow') {
    const applyBtn = page.locator('button[id$="apply-changes-btn"]');
    await expect(applyBtn).toBeEnabled({ timeout: 3000 });
    await applyBtn.click();
    await page.waitForTimeout(200);
  }
}

/**
 * Wait for the VT-01 antenna to finish slewing to the maintenance position by
 * polling the simulation state directly (DOM polling can exit before the slew
 * starts and desync the objective chain).
 */
async function waitForAntennaMovement(
  page: import('@playwright/test').Page,
  timeout = 240000
): Promise<void> {
  await page.waitForFunction(
    () => {
      const sim = (window as unknown as {
        signalRange?: { simulationManager?: { groundStations?: Array<{ antennas?: Array<{ state?: { slewing?: boolean; elevation?: number } }> }> } };
      }).signalRange?.simulationManager;
      const antennaState = sim?.groundStations?.[0]?.antennas?.[0]?.state;
      if (!antennaState) return false;
      // Maintenance position is 5° elevation (±1° objective tolerance)
      return antennaState.slewing === false && Math.abs((antennaState.elevation ?? 90) - 5) < 1.5;
    },
    undefined,
    { timeout }
  );
  // Give the objectives manager a beat to register the position
  await page.waitForTimeout(1500);
}

/**
 * Select a satellite in the asset tree to open its dashboard.
 */
async function selectSatellite(
  page: import('@playwright/test').Page,
  satelliteId: string
): Promise<void> {
  const satTreeItem = page.locator(`[data-asset-id="${satelliteId}"]`);
  await expect(satTreeItem).toBeVisible({ timeout: 10000 });
  await satTreeItem.click();
  await page.waitForTimeout(1000);
  await expect(satTreeItem).toHaveClass(/active/, { timeout: 5000 });
}

/**
 * Execute traffic handover to target station via the satellite dashboard.
 */
async function executeTrafficHandover(
  page: import('@playwright/test').Page,
  targetStation: string
): Promise<void> {
  const handoverSelect = page.locator('#sat-handover-target');
  await expect(handoverSelect).toBeVisible({ timeout: 5000 });
  await handoverSelect.selectOption({ value: targetStation });
  await page.waitForTimeout(300);

  const executeBtn = page.locator('#sat-execute-handover');
  await expect(executeBtn).toBeVisible({ timeout: 5000 });
  await expect(executeBtn).toBeEnabled({ timeout: 10000 });
  await executeBtn.click();

  await page.waitForTimeout(2000);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario11Objective
): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      await waitForQuizToAppear(page);
      await answerQuizByText(page, objective.correctAnswer!);
      break;

    case 'select-station':
      await missionControlPage.selectGroundStation(objective.stationId || 'VT-01');
      break;

    case 'click-tab':
      await missionControlPage.selectTab(objective.tabId!);
      break;

    case 'toggle-switch':
      await toggleSwitch(page, objective.switchId!, objective.switchState!);
      break;

    case 'enable-tx-commit':
      await enableTxForHandover(page);
      break;

    case 'set-tracking-mode':
      await setTrackingMode(page, objective.trackingMode!);
      if (objective.waitForAntennaPosition) {
        await waitForAntennaMovement(page);
      }
      break;

    case 'select-satellite':
      await selectSatellite(page, objective.satelliteId!);
      break;

    case 'execute-handover':
      await executeTrafficHandover(page, objective.handoverConfig!.targetStation);
      break;

    case 'auto':
      await page.waitForTimeout(2000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 11 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: import('@playwright/test').Page;
  let missionControlPage: MissionControlPage;
  let context: import('@playwright/test').BrowserContext;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControlPage = new MissionControlPage(page);

    // Navigate directly (bypasses prerequisite check on S10)
    await missionControlPage.gotoScenario('nats', 'nats-scenario11');
    await waitForSimulationReady(page);

    await missionControlPage.dismissDialogIfPresent();

    await missionControlPage.openMissionBrief();
    await missionControlPage.closeMissionBrief();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(60000);
  });

  // Generate a test per objective in order
  for (const objective of SCENARIO_11_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // Maintenance-position objective needs a longer timeout for slew
      if (objective.type === 'set-tracking-mode' && objective.waitForAntennaPosition) {
        test.setTimeout(300000);
      }
      await executeObjective(page, missionControlPage, objective);
    });
  }

  test('Mission Complete: Verify Level Complete Modal', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });

    const modalTitle = levelCompleteModal.locator('.complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');

    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();

    const scoreText = await totalScore.textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});
