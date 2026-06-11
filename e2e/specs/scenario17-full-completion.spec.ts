import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 17 - "Solar Event": Sun Transit Outage.
 *
 * Phase 3 opener. A predicted sun transit (weather event type 'sun-transit')
 * raises VT-01's sky noise from T+300s to T+600s with a 12 dB sin^2 peak.
 * The operator baselines the link, notifies the customer BEFORE the window,
 * holds configuration through the peak (demod loses lock and self-recovers),
 * verifies recovery, and documents predicted-vs-actual.
 *
 * Spec notes:
 *  - 'wait-sky-noise' steps poll the simulation state directly
 *    (skyNoiseDegradation_dB on VT-01's antenna) instead of sleeping.
 *  - Total wall-clock is dominated by the transit timeline (~11 min).
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'auto'
  | 'wait-sky-noise';

interface Scenario17Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  /** For wait-sky-noise: condition to await */
  skyNoise?: { above?: number; below?: number };
  /** For wait-sky-noise: max seconds to wait */
  waitTimeoutSeconds?: number;
}

const SCENARIO_17_OBJECTIVES: Scenario17Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Transit Prediction',
    type: 'quiz',
    correctAnswer: 'Acknowledged - prediction sheet reviewed, pre-event checklist starting now.',
  },
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },

  // ============================================================
  // PHASE 1: PRE-WINDOW BASELINE AND UNDERSTANDING
  // ============================================================
  {
    id: 'baseline-dashboard-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'baseline-dashboard',
    title: 'Pre-Transit Baseline',
    type: 'quiz',
    correctAnswer:
      'Anything abnormal AFTER the window starts will be attributed to the Sun - a fault hiding under the transit would survive unnoticed unless the board was provably clean before',
  },
  {
    id: 'transit-geometry-quiz',
    title: 'Transit Geometry',
    type: 'quiz',
    correctAnswer:
      'The Sun (a ~20,000 K noise source at C-band) passes through the antenna main beam behind the satellite - system noise temperature soars and C/N collapses, with the signal itself unchanged',
  },
  {
    id: 'transit-predictability-quiz',
    title: 'Why It Is Predictable',
    type: 'quiz',
    correctAnswer:
      'Twice a year near the equinoxes - a few minutes a day for several consecutive days, at a time computable years in advance from the station/satellite geometry',
  },
  {
    id: 'baseline-rx-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'baseline-rx-check',
    title: 'Baseline RX Snapshot',
    type: 'auto',
  },
  {
    id: 'why-not-handover-quiz',
    title: 'The Handover Question',
    type: 'quiz',
    correctAnswer:
      'The outage is brief, predicted, and SLA-excluded with notice - a handover trades that for two transfer events, and ME-02 inherits its own transit on its own schedule anyway',
  },
  {
    id: 'notify-customer-quiz',
    title: 'Pre-Event Notification',
    type: 'quiz',
    correctAnswer:
      'Predicted solar transit on TIDEMARK-1 from Vermont, window and peak times attached; expect degraded margin and a possible 1-3 minute carrier interruption near peak; service recovers without intervention; this message constitutes SLA advance notice.',
  },

  // ============================================================
  // PHASE 2: THE WINDOW
  // ============================================================
  {
    id: 'observe-onset-quiz',
    title: 'Confirm Predicted Onset (quiz)',
    type: 'quiz',
    correctAnswer:
      'Confidence this is the predicted transit and not a coincidental fault - the alarm tracking the prediction sheet IS the diagnosis',
  },
  {
    id: 'observe-onset-wait',
    title: 'Wait for Sky Noise Onset',
    type: 'wait-sky-noise',
    skyNoise: { above: 2 },
    waitTimeoutSeconds: 420,
  },
  {
    // ride-through-peak completes on its own at >6 dB as long as the spec
    // touches nothing - which is the whole point of the objective.
    id: 'ride-through-peak',
    title: 'Hold Through the Peak',
    type: 'wait-sky-noise',
    skyNoise: { above: 6 },
    waitTimeoutSeconds: 300,
  },
  {
    id: 'peak-behavior-quiz',
    title: 'What the Peak Looks Like',
    type: 'quiz',
    correctAnswer:
      'The downlink is buried in solar noise at OUR antenna only - the satellite still hears our uplink perfectly, and the demod will relock on its own as the Sun moves off boresight',
  },

  // ============================================================
  // PHASE 3: RECOVERY AND DOCUMENTATION
  // ============================================================
  {
    id: 'verify-recovery',
    title: 'Verify Self-Recovery',
    type: 'wait-sky-noise',
    skyNoise: { below: 1 },
    waitTimeoutSeconds: 420,
  },
  {
    id: 'post-event-sweep-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'post-event-sweep',
    title: 'Post-Event Alarm Sweep',
    type: 'quiz',
    correctAnswer:
      'Any alarm that survived the window - the transit excuses exactly five minutes of sky noise and nothing else',
  },
  {
    id: 'marcus-confirm',
    title: 'Spacecraft-Side Confirmation',
    type: 'quiz',
    correctAnswer:
      'Nothing abnormal on the spacecraft - our uplink steady throughout, vehicle telemetry nominal; the event existed only at our antenna',
  },
  {
    id: 'document-impact',
    title: 'Impact Documentation',
    type: 'quiz',
    correctAnswer:
      'Predicted vs actual window times, peak degradation observed, carrier lock-loss duration, notification timestamp (pre-window), and customer impact statement',
  },
  {
    id: 'log-shift-summary',
    title: 'Log the Event',
    type: 'quiz',
    correctAnswer:
      'Predicted solar transit TM-1/VT-01 executed per SOP-SX-001. Customer notified pre-window. Peak ~12 dB sky noise, brief demod loss near peak, self-recovered to baseline. No operator intervention, no residual alarms. Day 2 of 4 in this transit series - next window tomorrow, ~4 minutes earlier.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/** Poll VT-01's antenna sky-noise state until the threshold is met. */
async function waitForSkyNoise(
  page: import('@playwright/test').Page,
  condition: { above?: number; below?: number },
  timeoutSeconds: number
): Promise<void> {
  await page.waitForFunction(
    (cond) => {
      const w = window as unknown as {
        signalRange?: {
          simulationManager?: {
            groundStations?: Array<{
              state?: { id?: string };
              antennas?: Array<{ state?: { skyNoiseDegradation_dB?: number } }>;
            }>;
          };
        };
      };
      const gs = w.signalRange?.simulationManager?.groundStations?.find(g => g.state?.id === 'VT-01');
      const sky = gs?.antennas?.[0]?.state?.skyNoiseDegradation_dB ?? 0;
      if (cond.above !== undefined && sky <= cond.above) return false;
      if (cond.below !== undefined && sky >= cond.below) return false;
      return true;
    },
    condition,
    { timeout: timeoutSeconds * 1000 }
  );
  // Give the objectives manager a beat to evaluate the custom condition
  await page.waitForTimeout(2500);
}

async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario17Objective
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

    case 'wait-sky-noise':
      await waitForSkyNoise(page, objective.skyNoise!, objective.waitTimeoutSeconds ?? 420);
      break;

    case 'auto':
      await page.waitForTimeout(3000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 17 Full Completion', () => {
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

    await missionControlPage.gotoScenario('nats', 'nats-scenario17');
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

  for (const objective of SCENARIO_17_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // Transit-timeline waits run on astronomy's clock, not ours
      if (objective.type === 'wait-sky-noise') {
        test.setTimeout(((objective.waitTimeoutSeconds ?? 420) + 60) * 1000);
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
