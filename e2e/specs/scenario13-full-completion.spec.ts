import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 13 - "Thermal Anomaly": Reading the Trend.
 *
 * Mid-shift trend assessment on VT-01. BUC temperature climbing on the
 * TIDEMARK-1 carrier (62°C, +0.3°C/min). Pre-alarm. Operator must read
 * the trend, identify the root cause (excess BUC gain), pick a course of
 * action (de-rate), execute it (reduce BUC gain to 23 dB), and document.
 *
 * Objective types:
 * - 'quiz': Status-check quiz (Character.SYSTEM)
 * - 'select-station': Asset tree station selection (VT-01)
 * - 'click-tab': Tab navigation
 * - 'configure-buc-gain': Lower BUC gain via the TX Chain adjust input
 * - 'auto': Satisfied by simulation state once read on the tab for the
 *           5 s observation dwell
 */
type ObjectiveType = 'quiz' | 'select-station' | 'click-tab' | 'configure-buc-gain' | 'auto';

interface Scenario13Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  bucGain?: number;
  /** Wait (ms) for the objective to complete after its action - for steps gated on a live reading */
  waitDoneMs?: number;
}

const SCENARIO_13_OBJECTIVES: Scenario13Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Shift Brief',
    type: 'quiz',
    correctAnswer: 'Yes - moving to VT-01 to read the equipment.',
  },

  // ============================================================
  // PHASE 1: OBSERVATION
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'confirm-no-active-alarm-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'confirm-no-active-alarm',
    title: 'Confirm Pre-Alarm State',
    type: 'quiz',
    correctAnswer: 'Pre-alarm - you have time to choose a deliberate action instead of a reflexive one',
  },
  {
    id: 'open-tx-chain',
    title: 'Open the TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'read-buc-temp-trend',
    title: 'Read the Temperature Trend',
    type: 'quiz',
    correctAnswer: 'Roughly 25-30 minutes from now if nothing changes',
  },
  {
    id: 'check-current-draw',
    title: 'Cross-Check Current Draw',
    type: 'quiz',
    correctAnswer: 'BUC is dissipating more power as heat - consistent with the thermal rise, not a separate fault',
  },
  {
    id: 'cross-check-spectrum-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'cross-check-spectrum',
    title: 'Rule Out an RX-Side Fault',
    type: 'auto',
  },
  {
    id: 'record-baseline-readings',
    title: 'Record Baseline Readings',
    type: 'quiz',
    correctAnswer: 'Time, BUC temperature, BUC current, BUC gain, HPA backoff - the next operator can rebuild the curve',
  },

  // ============================================================
  // PHASE 2: DIAGNOSIS & JUDGMENT
  // ============================================================
  {
    id: 'identify-root-cause',
    title: 'Name the Root Cause',
    type: 'quiz',
    correctAnswer: 'Excess gain on a weak fan - 10 dB over the operating value adds dissipation the degraded fan cannot shed',
  },
  {
    id: 'evaluate-options',
    title: 'Choose a Course of Action',
    type: 'quiz',
    correctAnswer: 'De-rate now - reduce BUC gain ~10 dB, watch the trend reverse, schedule a swap for the next planned window',
  },
  {
    id: 'confirm-action-plan',
    title: 'Confirm the Sequence',
    type: 'quiz',
    correctAnswer: 'Lower BUC gain ~10 dB, verify HPA still linear, verify carrier still nominal, then watch the temperature curve',
  },

  // ============================================================
  // PHASE 3: EXECUTION
  // ============================================================
  {
    id: 'reduce-buc-gain-tab',
    title: 'Open the TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'reduce-buc-gain',
    title: 'De-Rate the BUC',
    type: 'configure-buc-gain',
    bucGain: 23,
  },
  {
    id: 'verify-hpa-headroom',
    title: 'Verify HPA Still Linear',
    type: 'auto',
  },
  {
    id: 'verify-trend-stabilizing',
    title: 'Confirm the Trend Is Bending',
    type: 'quiz',
    correctAnswer: 'Watch a few minutes: current drops to about 3.1 A at once, temperature turns down and passes 61°C in about 2 minutes, carrier still locked',
    // The BUC must read below 61 degC on TX Chain: real cooling after the
    // de-rate (~1.5-3 min of sim time; advanceClock does not run physics)
    waitDoneMs: 240000,
  },

  // ============================================================
  // PHASE 4: SCHEDULE & DOCUMENT
  // ============================================================
  {
    id: 'schedule-maintenance-ticket',
    title: 'Open the Maintenance Ticket',
    type: 'quiz',
    correctAnswer: 'Trend record (10-min curve), cooling-fault warning, de-rate action taken, gain/backoff settings, swap recommended for next planned window',
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
    correctAnswer: 'Only the BUC cooling-fault warning, BUC running de-rated, carrier nominal, swap ticket open against next planned window',
  },
  {
    id: 'log-shift-summary',
    title: 'Log the Shift Entry',
    type: 'quiz',
    correctAnswer: '1003 - VT-01 BUC thermal trend (57->62°C over 10 min, fan degraded) addressed by 10 dB gain de-rate. Trend reversing, swap ticket open, carrier nominal.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/** Wait until the objective reports complete, via the debugObjective dev hook. */
async function waitForObjectiveDone(page: import('@playwright/test').Page, objectiveId: string, timeout: number): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const hook = (window as unknown as { debugObjective?: (id: string) => { isCompleted?: boolean } }).debugObjective;
      return typeof hook === 'function' && hook(id)?.isCompleted === true;
    },
    objectiveId,
    { timeout, polling: 500 }
  );
}

/**
 * Configure BUC gain via the TX Chain adjust control.
 * TX Chain tab must be active before calling this.
 */
async function configureBucGain(page: import('@playwright/test').Page, gain: number): Promise<void> {
  const gainInput = page.locator('#buc-gain');
  await expect(gainInput).toBeVisible({ timeout: 5000 });
  await gainInput.fill(gain.toString());
  await gainInput.press('Tab');
  await page.waitForTimeout(100);

  const applyBtn = page.locator('#buc-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();

  // Let the simulator propagate the gain change through to HPA drive
  // (reduces overdrive, drops output power, allows HPA backoff to recover)
  await page.waitForTimeout(2000);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(page: import('@playwright/test').Page, missionControlPage: MissionControlPage, objective: Scenario13Objective): Promise<void> {
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
      // Observation-gated conditions latch only after the default dwell on
      // the tab (DEFAULT_OBSERVATION_DWELL_SECONDS); leaving at once would
      // reset the read and strand the objective.
      await page.waitForTimeout(3000);
      break;

    case 'configure-buc-gain':
      await configureBucGain(page, objective.bucGain!);
      break;

    case 'auto':
      // Satisfied by simulation state once read on the tab (5 s dwell)
      await waitForObjectiveDone(page, objective.id, 20000);
      break;
  }

  if (objective.waitDoneMs) {
    await waitForObjectiveDone(page, objective.id, objective.waitDoneMs);
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 13 Full Completion', () => {
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

    // Navigate directly (bypasses prerequisite check on S12)
    await missionControlPage.gotoScenario('nats', 'nats-scenario13');
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

  // verify-trend-stabilizing waits out real BUC cooling
  const longestWaitMs = Math.max(...SCENARIO_13_OBJECTIVES.map((o) => o.waitDoneMs ?? 0));

  for (const objective of SCENARIO_13_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      if (objective.waitDoneMs) {
        test.setTimeout(60000 + longestWaitMs);
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
