import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 9 - "Morning Rounds": Multi-Satellite Health Check.
 *
 * First qualified-operator shift. Health check rotation across three TIDEMARK
 * birds: VT-01/TIDEMARK-1, ME-02/TIDEMARK-2, then a spot-check of newly
 * commissioned TIDEMARK-3 via VT-01.
 *
 * Objective types:
 * - 'quiz': Status-check quiz (Character.SYSTEM)
 * - 'select-station': Asset tree station selection (VT-01 or ME-02)
 * - 'click-tab': Tab navigation
 * - 'auto': Auto-satisfied by simulation state (no user action)
 * - 'set-tracking-mode': Antenna tracking mode + satellite selection
 * - 'configure-speca': Spectrum analyzer center frequency tuning
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'auto'
  | 'set-tracking-mode'
  | 'configure-speca';

interface Scenario9Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  trackingMode?: string;
  satelliteNoradId?: string; // For set-tracking-mode in program-track
  waitForAntennaPosition?: boolean;
  specaConfig?: {
    centerFrequency: number; // MHz
    span?: number; // kHz (optional - skipped if undefined)
  };
}

const SCENARIO_9_OBJECTIVES: Scenario9Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Shift Brief',
    type: 'quiz',
    correctAnswer: 'Yes, brief reviewed. Starting rounds.',
  },

  // ============================================================
  // PHASE 1: VT-01 / TIDEMARK-1
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'vt-dashboard-check-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'vt-dashboard-check',
    title: 'VT-01 Dashboard Sweep',
    type: 'quiz',
    correctAnswer: 'No active alarms - all systems nominal',
  },
  {
    id: 'vt-gpsdo-tab',
    title: 'Open GPS Timing',
    type: 'click-tab',
    tabId: 'gps-timing',
  },
  {
    id: 'vt-gpsdo-spot-check',
    title: 'VT-01 GPSDO Spot Check',
    type: 'quiz',
    correctAnswer: 'Stable 10 MHz reference available to all downstream RF equipment',
  },
  {
    id: 'vt-rx-beacon-check',
    title: 'VT-01 RX Chain Spot Check',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'vt-tx-hpa-check-tab',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'vt-tx-hpa-check',
    title: 'VT-01 TX Chain Spot Check',
    type: 'quiz',
    correctAnswer: 'Standard operating margin - reduces stress on the amplifier',
  },

  // ============================================================
  // PHASE 2: ME-02 / TIDEMARK-2
  // ============================================================
  {
    id: 'select-maine-station',
    title: 'Open ME-02',
    type: 'select-station',
    stationId: 'ME-02',
  },
  {
    id: 'me-dashboard-check-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'me-dashboard-check',
    title: 'ME-02 Dashboard Sweep',
    type: 'quiz',
    correctAnswer: 'No active alarms - station nominal',
  },
  {
    id: 'me-rx-beacon-check',
    title: 'ME-02 TIDEMARK-2 Beacon Check',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'me-verify-tracking-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'me-verify-tracking',
    title: 'ME-02 Antenna Tracking Check',
    type: 'quiz',
    correctAnswer:
      'GEO satellite holding station - ephemeris is accurate enough; no need to hunt the beacon',
  },
  {
    id: 'me-tx-payload-spot',
    title: 'ME-02 Customer Traffic Indicator',
    type: 'quiz',
    correctAnswer:
      'Frame sync locked + CRC valid + FEC engaged (Reed-Solomon active, no uncorrectables)',
  },

  // ============================================================
  // PHASE 3: TIDEMARK-3 VERIFICATION
  // ============================================================
  {
    id: 'switch-to-vermont',
    title: 'Return to VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'repoint-acu-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'repoint-to-tidemark3',
    title: 'Repoint VT-01 to TIDEMARK-3',
    type: 'set-tracking-mode',
    trackingMode: 'program-track',
    satelliteNoradId: '61527',
    waitForAntennaPosition: true,
  },
  {
    id: 'tidemark3-rx-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'tidemark3-beacon-acquire',
    title: 'TIDEMARK-3 Beacon Verification',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1078, // MHz
    },
  },
  {
    id: 'tidemark3-beacon-quality',
    title: 'Interpret TIDEMARK-3 Beacon',
    type: 'quiz',
    correctAnswer:
      'Antenna pointing is correct AND LNB LO is set correctly (5250 - 4172 = 1078)',
  },
  {
    id: 'return-acu-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'return-to-tidemark1-antenna',
    title: 'Repoint Back to TIDEMARK-1',
    type: 'set-tracking-mode',
    trackingMode: 'program-track',
    satelliteNoradId: '61525',
    waitForAntennaPosition: true,
  },
  {
    id: 'return-rx-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'return-to-tidemark1',
    title: 'Retune Spectrum Analyzer to TM-1',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1074.5, // MHz
    },
  },

  // ============================================================
  // SHIFT WRAP
  // ============================================================
  {
    id: 'final-alarm-sweep-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'final-alarm-sweep',
    title: 'Final Alarm Sweep',
    type: 'quiz',
    correctAnswer:
      'TIDEMARK-1 healthy, TIDEMARK-2 healthy, TIDEMARK-3 beacon verified - all three nominal',
  },
  {
    id: 'log-shift-summary',
    title: 'Log Shift Summary',
    type: 'quiz',
    correctAnswer:
      '0700 - Morning rounds complete. VT-01/TM-1, ME-02/TM-2, TM-3 beacon verified via VT-01 spot-check. No anomalies.',
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
 * Select a target satellite from the dropdown and click Move to Target.
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
 * Wait for antenna movement to complete by watching elevation stability.
 */
async function waitForAntennaMovement(
  page: import('@playwright/test').Page,
  timeout = 90000
): Promise<void> {
  const startTime = Date.now();
  let lastPosition = '';
  let stableCount = 0;

  await page.waitForTimeout(500);

  while (Date.now() - startTime < timeout) {
    await page.waitForTimeout(1000);

    let elDisplay = page
      .locator('.fine-adjust-control', { hasText: 'Elevation' })
      .locator('.fine-adjust-value-active');

    if ((await elDisplay.count()) === 0) {
      elDisplay = page.locator('[id*="el-fine"][id$="-value"]');
    }

    try {
      const currentPosition = await elDisplay.first().textContent({ timeout: 2000 });

      if (currentPosition === lastPosition && currentPosition !== '') {
        stableCount++;
        if (stableCount >= 3) {
          return;
        }
      } else {
        stableCount = 0;
        lastPosition = currentPosition || '';
      }
    } catch {
      await page.waitForTimeout(500);
    }
  }

  console.warn('Antenna movement may not have completed within timeout');
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
    const spanInMHz = config.span / 1000; // kHz → MHz
    await spanInput.fill(spanInMHz.toString());
    await spanInput.press('Tab');
    await page.waitForTimeout(100);
  }

  await page.waitForTimeout(300);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario9Objective
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

    case 'auto':
      await page.waitForTimeout(2000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 9 Full Completion', () => {
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

    // Navigate directly (bypasses prerequisite check on S8)
    await missionControlPage.gotoScenario('nats', 'nats-scenario9');
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
  for (const objective of SCENARIO_9_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // Antenna repoint objectives need a longer timeout for slew
      if (objective.type === 'set-tracking-mode' && objective.waitForAntennaPosition) {
        test.setTimeout(120000);
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
