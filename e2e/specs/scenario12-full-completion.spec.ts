import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 12 - "Planned Maintenance: Return to Service".
 *
 * Closes the S11-S12 mini-arc. VT-01 has finished a waveguide gasket
 * inspection window: antenna stowed, RF chain cold (LNB/BUC/HPA powered
 * off). ME-02 (Catherine) is holding TM-1 traffic. The operator brings
 * Vermont back online in a clean restoration sequence, catches a small
 * leftover from the maintenance crew (BUC gain bumped to 50 dB during
 * bench testing), and then pulls TM-1 traffic back from Maine.
 *
 * Objective types reused from earlier scenarios:
 * - 'quiz': Status-check quiz (Character.SYSTEM)
 * - 'select-station': Asset tree station selection
 * - 'click-tab': Tab navigation
 * - 'auto': Auto-satisfied (signal-detected, receiver-lock)
 * - 'set-tracking-mode': Antenna tracking mode + satellite selection
 * - 'configure-speca': Spectrum analyzer center frequency tuning
 * - 'configure-lnb': Power on LNB + LO + gain
 * - 'configure-buc-gain': BUC gain adjustment (S7 pattern)
 * - 'toggle-switch': Equipment power / enable switches
 * - 'select-satellite': Satellite selection in asset tree (S3 pattern)
 * - 'execute-handover': Handover target select + execute (S3 pattern, ME-02 → VT-01)
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'auto'
  | 'set-tracking-mode'
  | 'configure-speca'
  | 'configure-lnb'
  | 'configure-buc-gain'
  | 'toggle-switch'
  | 'select-satellite'
  | 'execute-handover';

interface Scenario12Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  trackingMode?: string;
  satelliteNoradId?: string;
  waitForAntennaPosition?: boolean;
  specaConfig?: {
    centerFrequency: number; // MHz
    span?: number; // MHz
  };
  lnbConfig?: {
    loFrequency: number; // MHz
    gain: number; // dB
  };
  bucGain?: number; // dB
  switchId?: string;
  switchState?: boolean;
  satelliteAssetId?: string;
  handoverTargetStation?: string;
}

const SCENARIO_12_OBJECTIVES: Scenario12Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Restoration Brief',
    type: 'quiz',
    correctAnswer: 'Confirmed. Beginning restoration.',
  },

  // ============================================================
  // PHASE 1: PRE-RESTORATION STATE VERIFICATION
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'pre-restoration-dashboard-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'pre-restoration-dashboard',
    title: 'Confirm Safed State',
    type: 'quiz',
    correctAnswer: 'Antenna stowed, LNB/BUC/HPA powered off, GPSDO still running',
  },

  // ============================================================
  // PHASE 2: ANTENNA RESTORATION
  // ============================================================
  {
    id: 'repoint-antenna-tm1-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'repoint-antenna-tm1',
    title: 'Repoint VT-01 to TIDEMARK-1',
    type: 'set-tracking-mode',
    trackingMode: 'program-track',
    satelliteNoradId: '61525',
    waitForAntennaPosition: true,
  },

  // ============================================================
  // PHASE 3: RX CHAIN RESTORATION
  // ============================================================
  {
    id: 'power-up-lnb-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'power-up-lnb',
    title: 'Power Up LNB',
    type: 'configure-lnb',
    lnbConfig: {
      loFrequency: 5250,
      gain: 65,
    },
  },
  {
    id: 'acquire-tm1-beacon',
    title: 'Acquire TIDEMARK-1 Beacon',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1074.5,
    },
  },
  {
    id: 'verify-rx-modem-lock',
    title: 'Verify RX Modem Lock',
    type: 'auto',
  },

  // ============================================================
  // PHASE 4: POST-MAINTENANCE LEFTOVER SWEEP
  // ============================================================
  {
    id: 'tx-chain-inspection-tab',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'tx-chain-inspection',
    title: 'TX Chain Pre-Power Inspection',
    type: 'quiz',
    correctAnswer:
      'BUC gain is at 50 dB - testing value left over from maintenance, operating value is 23 dB',
  },
  // ============================================================
  // PHASE 5: TX CHAIN RESTORATION
  // ============================================================
  {
    // BUC powers up muted; gain correction follows (the buc-gain-set
    // condition only evaluates on a powered BUC).
    id: 'power-up-buc',
    title: 'Power Up BUC (Muted)',
    type: 'toggle-switch',
    switchId: 'buc-power',
    switchState: true,
  },
  {
    id: 'correct-buc-gain',
    title: 'Restore BUC Operating Gain',
    type: 'configure-buc-gain',
    bucGain: 23,
  },
  {
    id: 'power-up-hpa',
    title: 'Power Up HPA',
    type: 'toggle-switch',
    switchId: 'hpa-power',
    switchState: true,
  },
  {
    id: 'start-modem-transmitting',
    title: 'Enable TX Modem',
    type: 'toggle-switch',
    switchId: 'tx-transmit-switch',
    switchState: true,
  },
  {
    // TX stays staged cold (BUC muted, HPA disabled): ME-02 still carries
    // TM-1; radiating now would trip the dual-transmission failure. The
    // handover return swaps RF authority automatically.
    id: 'verify-tx-staged',
    title: 'Confirm TX Staged Cold',
    type: 'quiz',
    correctAnswer:
      'Two stations radiating at the same transponder is dual illumination - the handover swaps RF authority in one coordinated action so only one uplink is ever on the air',
  },

  // ============================================================
  // PHASE 6: HANDOVER RETURN FROM ME-02
  // ============================================================
  {
    id: 'select-maine-station',
    title: 'Switch to ME-02',
    type: 'select-station',
    stationId: 'ME-02',
  },
  {
    id: 'pre-handover-criteria',
    title: 'Confirm Handover-Ready State',
    type: 'quiz',
    correctAnswer:
      'Beacon lock + RX modem lock with C/N margin + TX chain staged cold (modem on, BUC muted, HPA disabled)',
  },
  {
    id: 'execute-handover-return-select-sat',
    title: 'Select TIDEMARK-1',
    type: 'select-satellite',
    satelliteAssetId: 'sat-61525',
  },
  {
    id: 'execute-handover-return',
    title: 'Pull Traffic Back to VT-01',
    type: 'execute-handover',
    handoverTargetStation: 'VT-01',
  },
  {
    id: 'verify-handover-success-select-vt',
    title: 'Return to VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'verify-handover-success',
    title: 'Confirm Return Complete',
    type: 'quiz',
    correctAnswer:
      'VT-01 owns TM-1 traffic, ME-02 TX stood down, no packet loss reported, no new alarms',
  },

  // ============================================================
  // PHASE 7: CUSTOMER NOTIFICATION & SHIFT CLOSE
  // ============================================================
  {
    id: 'notify-customer',
    title: 'Notify SeaLink',
    type: 'quiz',
    correctAnswer:
      'VT-01 restored, TM-1 traffic returned to primary station, no service interruption observed.',
  },
  {
    id: 'final-dashboard-sweep-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'final-dashboard-sweep',
    title: 'Final Dashboard Sweep',
    type: 'quiz',
    correctAnswer: 'No active alarms - all systems nominal, TM-1 traffic on primary',
  },
  {
    id: 'log-maintenance-complete',
    title: 'Log Maintenance Cycle Complete',
    type: 'quiz',
    correctAnswer:
      'VT-01 returned to service post-waveguide-gasket inspection. TM-1 traffic returned from ME-02. Maintenance leftover (BUC gain 50 dB) corrected before energizing. No customer impact.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Set the antenna tracking mode by clicking the appropriate button.
 * ACU control tab must be active before calling this.
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
 * Select a target satellite from the ACU dropdown and click Move to Target.
 * Used after setTrackingMode('program-track').
 */
async function selectSatelliteAndMove(
  page: import('@playwright/test').Page,
  satelliteNoradId: string
): Promise<void> {
  const satelliteSelect = page.locator('select[id$="satellite-select"]');
  await expect(satelliteSelect).toBeVisible({ timeout: 5000 });
  await satelliteSelect.selectOption({ value: satelliteNoradId });
  await page.waitForTimeout(200);

  const moveBtn = page.locator('button[id$="move-to-target-btn"]');
  await expect(moveBtn).toBeEnabled({ timeout: 5000 });
  await moveBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Wait for antenna movement to complete by polling the simulation state
 * directly. DOM-based polling proved unreliable (display locator misses exit
 * the wait early while the dish is still slewing from stow, which desyncs the
 * whole objective chain).
 */
async function waitForAntennaMovement(
  page: import('@playwright/test').Page,
  timeout = 240000
): Promise<void> {
  await page.waitForFunction(
    () => {
      const sim = (window as unknown as {
        signalRange?: { simulationManager?: { groundStations?: Array<{ antennas?: Array<{ state?: { slewing?: boolean; isLocked?: boolean } }> }> } };
      }).signalRange?.simulationManager;
      const antennaState = sim?.groundStations?.[0]?.antennas?.[0]?.state;
      return antennaState ? antennaState.slewing === false && antennaState.isLocked === true : false;
    },
    undefined,
    { timeout }
  );
  // Give the objectives manager a beat to register the lock
  await page.waitForTimeout(1500);
}

/**
 * Configure spectrum analyzer center frequency. Span is optional.
 */
async function configureSpectrumAnalyzer(
  page: import('@playwright/test').Page,
  config: { centerFrequency: number; span?: number }
): Promise<void> {
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(config.centerFrequency.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(100);

  if (config.span !== undefined) {
    const spanInput = page.locator('#sa-span');
    await expect(spanInput).toBeVisible();
    await spanInput.fill(config.span.toString());
    await spanInput.press('Tab');
    await page.waitForTimeout(100);
  }

  await page.waitForTimeout(300);
}

/**
 * Power on the LNB and apply operating LO + gain values.
 * Waits for thermal stabilization after Apply.
 */
async function configureLnb(
  page: import('@playwright/test').Page,
  config: { loFrequency: number; gain: number }
): Promise<void> {
  const powerSwitch = page.locator('#lnb-power');
  await expect(powerSwitch).toBeVisible({ timeout: 5000 });
  // The static template renders the power switch `checked`; the adapter syncs
  // the real (powered-off) state on a ~1 s throttle. Wait for the first sync
  // before reading, or the click gets skipped and the LNB never powers on.
  await page.waitForTimeout(1500);
  if (!(await powerSwitch.isChecked())) {
    await powerSwitch.click();
  }
  await expect(powerSwitch).toBeChecked();
  await page.waitForTimeout(500);

  const loInput = page.locator('#lnb-lo-frequency');
  await expect(loInput).toBeVisible();
  await loInput.fill(config.loFrequency.toString());
  await loInput.press('Tab');
  await page.waitForTimeout(100);

  const gainInput = page.locator('#lnb-gain');
  await expect(gainInput).toBeVisible();
  await gainInput.fill(config.gain.toString());
  await gainInput.press('Tab');
  await page.waitForTimeout(100);

  const applyBtn = page.locator('#lnb-apply-btn');
  await expect(applyBtn).toBeVisible();
  await applyBtn.click();

  // LNB thermal stabilization ~3 s
  await page.waitForTimeout(4000);
}

/**
 * Set the BUC gain via the TX Chain panel and click Apply.
 * TX Chain tab must be active.
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

  const applyBtn = page.locator('#buc-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Toggle a switch to the desired state.
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
  await page.waitForTimeout(300);
}

/**
 * Select a satellite by clicking its asset-tree item.
 */
async function selectSatellite(
  page: import('@playwright/test').Page,
  satelliteAssetId: string
): Promise<void> {
  const satTreeItem = page.locator(`[data-asset-id="${satelliteAssetId}"]`);
  await expect(satTreeItem).toBeVisible({ timeout: 10000 });
  await satTreeItem.click();
  await page.waitForTimeout(1000);
  await expect(satTreeItem).toHaveClass(/active/, { timeout: 5000 });
}

/**
 * Execute the satellite-dashboard traffic handover to the target station.
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
  objective: Scenario12Objective
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

    case 'set-tracking-mode':
      await setTrackingMode(page, objective.trackingMode!);
      if (objective.trackingMode === 'program-track' && objective.satelliteNoradId) {
        await selectSatelliteAndMove(page, objective.satelliteNoradId);
      }
      if (objective.waitForAntennaPosition) {
        await waitForAntennaMovement(page);
      }
      break;

    case 'configure-speca':
      await configureSpectrumAnalyzer(page, objective.specaConfig!);
      break;

    case 'configure-lnb':
      await configureLnb(page, objective.lnbConfig!);
      break;

    case 'configure-buc-gain':
      await configureBucGain(page, objective.bucGain!);
      break;

    case 'toggle-switch':
      await toggleSwitch(page, objective.switchId!, objective.switchState!);
      break;

    case 'select-satellite':
      await selectSatellite(page, objective.satelliteAssetId!);
      break;

    case 'execute-handover':
      await executeTrafficHandover(page, objective.handoverTargetStation!);
      break;

    case 'auto':
      // Signal/lock acquisition takes a few seconds in sim time.
      await page.waitForTimeout(3000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 12 Full Completion', () => {
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

    // Navigate directly (bypasses prerequisite check on S11)
    await missionControlPage.gotoScenario('nats', 'nats-scenario12');
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
  for (const objective of SCENARIO_12_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // Antenna repoint needs a longer timeout: the slew from stow (el 90)
      // to TIDEMARK-1 (az 161.8, el 34.2) takes minutes of wall-clock.
      if (objective.type === 'set-tracking-mode' && objective.waitForAntennaPosition) {
        test.setTimeout(300000);
      }
      // Handover transfer + service-continuity evaluation can be slow
      if (objective.type === 'execute-handover') {
        test.setTimeout(90000);
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
