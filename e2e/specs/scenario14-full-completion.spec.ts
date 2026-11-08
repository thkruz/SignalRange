import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 14 - "Rain Fade": Adapt Without Handover.
 *
 * Qualified-operator weather scenario. A moderate rain front passes over
 * VT-01. The customer (James Okafor, SeaLink) has asked the operator to
 * hold the link rather than execute a handover. The right call for a
 * sub-dB C-band fade with AGC headroom is to hold; the test exercises that path.
 *
 * Objective types:
 * - 'quiz': Status-check quiz (SYSTEM or named character)
 * - 'select-station': Asset tree station selection (VT-01)
 * - 'click-tab': Tab navigation
 * - 'toggle-switch': Equipment switch toggle (feed heater)
 * - 'auto': Auto-satisfied by simulation state (signal locks, HPA nominal,
 *   sustained-monitor objectives whose conditions are already met)
 */
type ObjectiveType = 'quiz' | 'select-station' | 'click-tab' | 'toggle-switch' | 'auto' | 'objective-skip';

interface Scenario14Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  switchId?: string;
  switchState?: boolean;
  /** Wait (ms) for the objective to report complete after its action */
  waitDoneMs?: number;
  /**
   * Jump the scenario clock this far (ms, window.advanceClock) after the
   * action, as a player waiting it out would; it burns the step's countdown
   */
  advanceMs?: number;
  /**
   * Reads the panel the quiz is about and asserts the keyed option is what
   * the screen shows, before the answer is clicked (the answer comes from
   * the sim state, not from matching the option text)
   */
  checkScreen?: (page: import('@playwright/test').Page) => Promise<void>;
}

/** First number in a visible readout (e.g. "13.1 dB") */
async function readNumber(page: import('@playwright/test').Page, selector: string): Promise<number> {
  const text = (await page.locator(`${selector}:visible`).first().textContent()) ?? '';
  const match = /[-+]?\d+(?:\.\d+)?/u.exec(text);
  expect(match, `${selector} reads a number (got "${text}")`).not.toBeNull();
  return Number.parseFloat(match![0]);
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
    correctAnswer: 'Their SLA penalizes handover events more heavily than a few dB of margin loss',
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
    correctAnswer: 'No warnings or criticals, just the Signal(s) Detected info row',
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
    correctAnswer: 'Keeping water from sheeting on the feed - dry surfaces attenuate less than wet ones',
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
    // Phase 27 Q3: the observation rows latch on RX Analysis, then the C/N read
    type: 'quiz',
    correctAnswer: 'About 13 dB',
    // RX modem 1 Raw C/N, the readout the 7 dB action threshold is read on
    checkScreen: async (page) => {
      const rawCn = await readNumber(page, '#cn-raw-display');
      expect(rawCn).toBeGreaterThan(12);
      expect(rawCn).toBeLessThan(14.5);
    },
  },
  {
    id: 'baseline-margin-quiz',
    title: 'Link Margin Baseline',
    type: 'quiz',
    correctAnswer: 'It shows how much fade the link can absorb before demodulation fails',
  },

  // ============================================================
  // ACTIVE MONITORING - RAIN ARRIVES
  // ============================================================
  {
    id: 'monitor-during-fade',
    title: 'Monitor Through the Fade',
    // Phase 32 D20: the RAIN FADE alarm (about 2 min into the cell) held 20 s
    // and C/N >= 7 dB held 20 s, accrued only while RX Analysis is open. The
    // jump fits the 6 min countdown
    type: 'auto',
    advanceMs: 150000,
    waitDoneMs: 90000,
  },
  {
    id: 'agc-behavior-quiz',
    title: 'AGC Behavior in the Fade',
    type: 'quiz',
    // The quiz says the cell is over the dish: the RAIN FADE alarm is up
    // (nats-r7-s14-F1, it used to open before any fade)
    checkScreen: async (page) => {
      const rainFadeUp = await page.evaluate(() => {
        const gs = (window as any).signalRange?.simulationManager?.groundStations?.find((g: any) => g.state?.id === 'VT-01');
        const alarms: Array<{ message: string }> = gs?.antennas?.[0]?.getStatusAlarms?.() ?? [];

        return alarms.some((a) => a.message.startsWith('RAIN FADE'));
      });
      expect(rainFadeUp).toBe(true);
    },
    correctAnswer: 'The AGC is compensating, and the gain stage still has headroom',
  },
  {
    id: 'agc-headroom-quiz',
    title: 'AGC Headroom Reading',
    type: 'quiz',
    correctAnswer: 'Plenty of headroom is left, so holding is justified',
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
    correctAnswer: "No. The link is healthy, and extra IMD risk buys margin we don't need",
  },
  {
    id: 'verify-hpa-still-nominal',
    title: 'Verify HPA Still Nominal',
    // Phase 27 Q3: the HPA rows latch on TX Chain, then the panel read
    type: 'quiz',
    correctAnswer: 'Output 50 dBm (100 W), back-off 10 dB, IM3 about -43 dBc, Overdrive Normal',
    checkScreen: async (page) => {
      expect(Math.abs((await readNumber(page, '#hpa-output-power-display')) - 50)).toBeLessThan(0.6);
      expect(Math.abs((await readNumber(page, '#hpa-imd-display')) + 43)).toBeLessThan(1.5);
    },
  },

  // ============================================================
  // DECISION POINT - HOLD OR HAND OFF
  // ============================================================
  {
    id: 'handover-threshold-quiz',
    title: 'Handover Threshold',
    type: 'quiz',
    correctAnswer: 'Raw C/N under 7 dB and falling, AGC at max in a continued fade, or lost lock',
  },
  {
    id: 'decision-hold',
    title: 'Make the Call',
    type: 'quiz',
    correctAnswer: 'Hold VT-01. AGC has headroom, modem locked, customer preference honored. Re-evaluate if state changes.',
  },

  // ============================================================
  // SUSTAINED MONITORING THROUGH PEAK
  // ============================================================
  {
    id: 'sustained-monitor',
    title: 'Hold Through the Cell',
    // Phase 27 Q4 / Phase 28 D1: the 20-min rain cell is a command-bar skip,
    // offered once the lock / C/N hold rows are met; it lands at the end of
    // the cell and the mission clock reads HOLD while the step waits
    type: 'objective-skip',
    waitDoneMs: 120000,
  },

  // ============================================================
  // POST-STORM AND DOCUMENTATION
  // ============================================================
  {
    id: 'post-storm-baseline-quiz',
    title: 'Post-Storm Recovery',
    type: 'quiz',
    correctAnswer: 'C/N recovers toward baseline; AGC backs its gain down; modem lock unchanged',
  },
  {
    id: 'document-handover-avoided',
    title: 'Log the Hold',
    type: 'quiz',
    correctAnswer: 'Heavy rain cell over VT-01, about 1 dB of C/N lost. Held TM-1 per SeaLink SLA; watched 7 dB Raw C/N, AGC at max, modem unlock, none fired. SeaLink told.',
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
async function toggleSwitch(page: import('@playwright/test').Page, switchId: string, targetState: boolean): Promise<void> {
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

  // Let the adapter's throttled DOM sync settle before reading - the static
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
 * Execute an objective based on its type.
 */
async function executeObjective(page: import('@playwright/test').Page, missionControlPage: MissionControlPage, objective: Scenario14Objective): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      await waitForQuizToAppear(page);
      await objective.checkScreen?.(page);
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

    case 'toggle-switch':
      await toggleSwitch(page, objective.switchId!, objective.switchState!);
      break;

    case 'auto':
      // Conditions are satisfied by ambient simulation state. Give the
      // engine a beat to confirm the objective transitioned to complete.
      await page.waitForTimeout(2000);
      break;

    case 'objective-skip': {
      // The skip is offered on the command bar once its rows are met
      const skip = page.locator('#objective-skip-control');
      await expect(skip).toBeVisible({ timeout: 90000 });
      // D1: waiting the cell out costs no mission time - the HUD shows HOLD
      await expect(page.locator('#scenario-timer-hold')).toBeVisible({ timeout: 10000 });
      await skip.click({ timeout: 90000 });
      break;
    }
  }

  if (objective.advanceMs) {
    await page.waitForFunction(() => typeof (window as any).advanceClock === 'function');
    await page.evaluate((ms) => (window as any).advanceClock(ms), objective.advanceMs);
  }

  if (objective.waitDoneMs) {
    await waitForObjectiveDone(page, objective.id, objective.waitDoneMs);
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
      if (objective.id === 'monitor-during-fade' || objective.id === 'sustained-monitor') {
        test.setTimeout(240000);
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
