import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 10 - "Customer Pass": High-Throughput Window on AURORA-7.
 *
 * SeaLink booked a 30-minute high-priority pass on AURORA-7. Marcus Chen is on
 * the line throughout. The operator switches the antenna from program-track to
 * step-track for the inclined orbit, tightens HPA backoff from 10 dB to 6 dB
 * for the pass window, holds sustained margin, then restores 10 dB backoff at
 * window close.
 *
 * Objective types:
 * - 'quiz': Status-check quiz (Character.SYSTEM)
 * - 'select-station': Asset tree station selection (VT-01)
 * - 'click-tab': Tab navigation
 * - 'auto': Auto-satisfied by simulation state (no user action) - used for
 *   maintain-duration objectives and pre-configured-state checks
 * - 'set-tracking-mode': Antenna tracking mode change (step-track, no satellite reselect)
 * - 'configure-hpa-backoff': HPA backoff field + Apply button
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'auto'
  | 'set-tracking-mode'
  | 'configure-hpa-backoff';

interface Scenario10Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  trackingMode?: string;
  hpaBackoff?: number;
  /** Seconds to wait for an 'auto' objective with maintainDuration */
  autoWaitSeconds?: number;
}

const SCENARIO_10_OBJECTIVES: Scenario10Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Customer Pass Brief',
    type: 'quiz',
    correctAnswer: 'Yes - link is up on program-track. Switching to pass configuration.',
  },

  // ============================================================
  // PHASE 1: PRE-PASS TRACKING SETUP
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'dashboard-sweep-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'dashboard-sweep',
    title: 'Pre-Pass Alarm Sweep',
    type: 'quiz',
    correctAnswer: 'No active alarms - clean board, link up on AURORA-7',
  },
  {
    id: 'why-step-track',
    title: 'Confirm Tracking Mode for the Pass',
    type: 'quiz',
    correctAnswer:
      'Inclined orbit drift will degrade C/N across the pass - step-track holds beacon optimum continuously',
  },
  {
    id: 'enable-step-track-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'enable-step-track',
    title: 'Switch to Step-Track',
    type: 'set-tracking-mode',
    trackingMode: 'step-track',
  },
  {
    id: 'acquire-stable-beacon',
    title: 'Acquire Stable Beacon Lock',
    type: 'auto',
    autoWaitSeconds: 20,
  },

  // ============================================================
  // PHASE 2: CUSTOMER LINK VERIFICATION
  // ============================================================
  {
    id: 'verify-rx-lock-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'verify-rx-lock',
    title: 'Verify Customer Downlink',
    type: 'auto',
    autoWaitSeconds: 5,
  },
  {
    id: 'payload-integrity-check',
    title: 'Payload Data Integrity',
    type: 'quiz',
    correctAnswer: 'Frame sync locked + CRC valid + FEC engaged with no uncorrectables',
  },
  {
    id: 'verify-uplink-active-tab',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'verify-uplink-active',
    title: 'Verify Uplink Return Path',
    type: 'auto',
    autoWaitSeconds: 5,
  },

  // ============================================================
  // PHASE 3: HPA BACKOFF OPTIMIZATION
  // ============================================================
  {
    id: 'assess-current-backoff',
    title: 'Assess Current HPA Backoff',
    type: 'quiz',
    correctAnswer:
      'Safe but conservative - tighter backoff gives the customer more EIRP without breaking the amp',
  },
  {
    id: 'optimize-hpa-backoff',
    title: 'Tighten HPA Backoff for the Pass',
    type: 'configure-hpa-backoff',
    hpaBackoff: 6,
  },
  {
    id: 'verify-no-overdrive',
    title: 'Confirm HPA Stays Linear',
    type: 'auto',
    autoWaitSeconds: 15,
  },
  {
    id: 'imd-tradeoff-check',
    title: 'Acknowledge the IMD Tradeoff',
    type: 'quiz',
    correctAnswer:
      'IMD products rise as the amp moves closer to saturation - monitor for overdrive across the window',
  },

  // ============================================================
  // PHASE 4: SUSTAINED MARGIN MONITORING
  // ============================================================
  {
    id: 'sustain-rx-margin',
    title: 'Sustain Customer Downlink Margin',
    type: 'auto',
    autoWaitSeconds: 35,
  },
  {
    id: 'sustain-beacon-track',
    title: 'Sustain Step-Track Through the Pass',
    type: 'auto',
    autoWaitSeconds: 25,
  },

  // ============================================================
  // PHASE 5: PASS CLOSE
  // ============================================================
  {
    id: 'restore-conservative-backoff',
    title: 'Restore Conservative Backoff',
    type: 'configure-hpa-backoff',
    hpaBackoff: 10,
  },
  {
    id: 'final-pass-snapshot',
    title: 'Final Pass Disposition',
    type: 'quiz',
    correctAnswer:
      'AURORA-7 pass complete - step-track held throughout, C/N margin sustained, no overdrive events, HPA returned to 10 dB',
  },
  {
    id: 'log-customer-pass',
    title: 'Log the Customer Pass',
    type: 'quiz',
    correctAnswer:
      'SeaLink 30-min high-priority pass on AURORA-7 - step-track engaged, HPA optimized to 6 dB backoff for window then restored to 10 dB. C/N margin sustained, no link events.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Set the antenna tracking mode by clicking the appropriate button.
 * ACU control tab must be active before calling this. For step-track on
 * AURORA-7 the satellite selection is already correct from the scenario
 * preconfig, so no target reselection is required.
 */
async function setTrackingMode(
  page: import('@playwright/test').Page,
  trackingMode: string
): Promise<void> {
  // Step-track is an optimization toggle on top of program-track, not a
  // separate mode button (same pattern as the scenario 6 spec).
  if (trackingMode === 'step-track') {
    const stepTrackToggle = page.locator('input[id$="step-track-toggle"]');
    await expect(stepTrackToggle).toBeVisible({ timeout: 5000 });

    if (!(await stepTrackToggle.isChecked())) {
      await stepTrackToggle.click();
    }
    await expect(stepTrackToggle).toBeChecked();
    await page.waitForTimeout(300);
    return;
  }

  const modeButton = page.locator(`.btn-tracking[data-mode="${trackingMode}"]`);
  await expect(modeButton).toBeVisible({ timeout: 5000 });
  await modeButton.click();
  await page.waitForTimeout(500);

  // Some tracking modes require an explicit Apply click. Only click Apply if
  // the button surfaces as enabled.
  const applyBtn = page.locator('button[id$="apply-changes-btn"]');
  if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    if (await applyBtn.isEnabled({ timeout: 500 }).catch(() => false)) {
      await applyBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

/**
 * Configure HPA backoff to achieve target output power.
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
  await page.waitForTimeout(150);

  const applyBtn = page.locator('#hpa-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
  await page.waitForTimeout(400);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario10Objective
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
      break;

    case 'configure-hpa-backoff':
      await configureHpaBackoff(page, objective.hpaBackoff!);
      break;

    case 'auto':
      await page.waitForTimeout((objective.autoWaitSeconds ?? 2) * 1000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 10 Full Completion', () => {
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

    // Navigate directly (bypasses prerequisite check on S9)
    await missionControlPage.gotoScenario('nats', 'nats-scenario10');
    await waitForSimulationReady(page);

    await missionControlPage.dismissDialogIfPresent();

    await missionControlPage.openMissionBrief();
    await missionControlPage.closeMissionBrief();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(90000);
  });

  for (const objective of SCENARIO_10_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // Sustained-margin and beacon-track holds need longer timeouts than the default
      if (objective.type === 'auto' && (objective.autoWaitSeconds ?? 0) >= 25) {
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
