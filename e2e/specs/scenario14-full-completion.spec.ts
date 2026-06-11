import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 14 - "Rain Fade": Adapt Without Handover.
 *
 * Qualified-operator weather scenario. A moderate rain front passes over
 * VT-01. The customer (James Okafor, SeaLink) has asked the operator to
 * hold the link rather than execute a handover. The right call for a
 * 3 dB fade with AGC headroom is to hold; the test exercises that path.
 *
 * Objective types:
 * - 'quiz': Status-check quiz (SYSTEM or named character)
 * - 'select-station': Asset tree station selection (VT-01)
 * - 'click-tab': Tab navigation
 * - 'toggle-switch': Equipment switch toggle (feed heater)
 * - 'auto': Auto-satisfied by simulation state (signal locks, HPA nominal,
 *   sustained-monitor objectives whose conditions are already met)
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'toggle-switch'
  | 'auto';

interface Scenario14Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  switchId?: string;
  switchState?: boolean;
}

const SCENARIO_14_OBJECTIVES: Scenario14Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Shift Brief',
    type: 'quiz',
    correctAnswer: 'Yes, brief reviewed. Standing by for the front.',
  },

  // ============================================================
  // CUSTOMER CONSTRAINT
  // ============================================================
  {
    id: 'acknowledge-customer-constraint',
    title: 'Customer Constraint',
    type: 'quiz',
    correctAnswer:
      'Their SLA penalizes handover events more heavily than a few dB of margin loss',
  },

  // ============================================================
  // PROACTIVE PROTECTION - FEED HEATER
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'pre-storm-dashboard-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'pre-storm-dashboard',
    title: 'Pre-Storm Dashboard Sweep',
    type: 'quiz',
    correctAnswer: 'No active alarms, link healthy - clean baseline to fade from',
  },
  {
    id: 'enable-feed-heater-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'enable-feed-heater',
    title: 'Enable Feed Heater',
    type: 'toggle-switch',
    // ACU control IDs are prefixed per-instance (acu-{uuid}-ant0-heater-switch);
    // the [id$=...] fallback in toggleSwitch resolves this suffix correctly.
    switchId: 'heater-switch',
    switchState: true,
  },
  {
    id: 'understand-heater-vs-rain',
    title: 'Heater Purpose for Rain',
    type: 'quiz',
    correctAnswer:
      'Keeping water from beading and sheeting on the feed - dry surfaces attenuate less than wet ones',
  },

  // ============================================================
  // BASELINE LINK MARGIN
  // ============================================================
  {
    id: 'open-rx-analysis-baseline',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'baseline-beacon-and-lock',
    title: 'Baseline Beacon and Lock',
    type: 'auto',
  },
  {
    id: 'baseline-margin-quiz',
    title: 'Link Margin Baseline',
    type: 'quiz',
    correctAnswer:
      'It defines how much fade the link can absorb before reaching the demodulation threshold',
  },

  // ============================================================
  // ACTIVE MONITORING - RAIN ARRIVES
  // ============================================================
  {
    id: 'monitor-during-fade',
    title: 'Monitor Through the Fade',
    type: 'auto',
  },
  {
    id: 'agc-behavior-quiz',
    title: 'AGC Behavior in the Fade',
    type: 'quiz',
    correctAnswer:
      'AGC is compensating - the demodulator still sees a usable signal, and we still have headroom in the gain stage',
  },
  {
    id: 'agc-headroom-quiz',
    title: 'AGC Headroom Reading',
    type: 'quiz',
    correctAnswer:
      'Plenty of headroom remaining - link is comfortable, hold is justified',
  },

  // ============================================================
  // OPTIMIZATION - HPA BACKOFF
  // ============================================================
  {
    id: 'open-tx-chain',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'hpa-backoff-decision-quiz',
    title: 'HPA Backoff Decision',
    type: 'quiz',
    correctAnswer:
      'No - the link is healthy; trading IMD risk for unused margin is a bad bargain',
  },
  {
    id: 'verify-hpa-still-nominal',
    title: 'Verify HPA Still Nominal',
    type: 'auto',
  },

  // ============================================================
  // DECISION POINT - HOLD OR HAND OFF
  // ============================================================
  {
    id: 'handover-threshold-quiz',
    title: 'Handover Threshold',
    type: 'quiz',
    correctAnswer: 'AGC at max with continued fade, or modem dropping lock',
  },
  {
    id: 'decision-hold',
    title: 'Make the Call',
    type: 'quiz',
    correctAnswer:
      'Hold VT-01. AGC has headroom, modem locked, customer preference honored. Re-evaluate if state changes.',
  },

  // ============================================================
  // SUSTAINED MONITORING THROUGH PEAK
  // ============================================================
  {
    id: 'sustained-monitor',
    title: 'Hold Through the Peak',
    type: 'auto',
  },

  // ============================================================
  // POST-STORM AND DOCUMENTATION
  // ============================================================
  {
    id: 'post-storm-baseline-quiz',
    title: 'Post-Storm Recovery',
    type: 'quiz',
    correctAnswer:
      'C/N recovers toward baseline; AGC backs its gain down; modem lock unchanged',
  },
  {
    id: 'document-handover-avoided',
    title: 'Log the Hold',
    type: 'quiz',
    correctAnswer:
      'Moderate rain over VT-01, ~3 dB fade. Held TM-1 service per customer SLA preference; AGC max 3 dB, modem lock maintained throughout, no handover.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Toggle a switch element to the specified state.
 * Tries exact ID match first, then suffix and substring fallbacks
 * to tolerate prefix variations.
 */
async function toggleSwitch(
  page: import('@playwright/test').Page,
  switchId: string,
  targetState: boolean
): Promise<void> {
  let switchEl = page.locator(`#${switchId}`);

  if ((await switchEl.count()) === 0) {
    switchEl = page.locator(`[id$="${switchId}"]`);
  }
  if ((await switchEl.count()) === 0) {
    // Fallback: match by suffix without station prefix
    const bareId = switchId.replace(/^[a-z0-9-]+-/, '');
    switchEl = page.locator(`[id*="${bareId}"]`);
  }

  await expect(switchEl.first()).toBeVisible({ timeout: 5000 });

  // Let the adapter's throttled DOM sync land before reading - the static
  // template can render a stale checked state right after the tab mounts.
  await page.waitForTimeout(1200);
  const isChecked = await switchEl.first().isChecked();
  if (isChecked !== targetState) {
    await switchEl.first().click();
  }

  if (targetState) {
    await expect(switchEl.first()).toBeChecked();
  } else {
    await expect(switchEl.first()).not.toBeChecked();
  }

  await page.waitForTimeout(200);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario14Objective
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

    case 'auto':
      // Conditions are satisfied by ambient simulation state. Give the
      // engine a beat to confirm the objective transitioned to complete.
      await page.waitForTimeout(2000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 14 Full Completion', () => {
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

    // Navigate directly (bypasses prerequisite check on S13)
    await missionControlPage.gotoScenario('nats', 'nats-scenario14');
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

  for (const objective of SCENARIO_14_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // Monitor-during-fade and sustained-monitor wait for the simulation
      // to advance through the rain event. Give them more runway.
      if (
        objective.id === 'monitor-during-fade' ||
        objective.id === 'sustained-monitor'
      ) {
        test.setTimeout(180000);
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
