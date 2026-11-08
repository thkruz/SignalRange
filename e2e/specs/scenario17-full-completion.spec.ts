import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 17 - "Solar Event": Sun Transit Outage.
 *
 * Phase 3 opener. A predicted sun transit (weather event type 'sun-transit')
 * raises VT-01's sky noise for 300 s with a 16 dB sin^2 peak, starting as
 * 'observe-onset' activates (startAfterObjectiveId). 'stand-by-for-window'
 * holds until the prediction sheet's 10:32:30 window-open on the station
 * clock (nats-r3-s17-F1); the spec takes its skip. The slow-player case
 * lives in scenario17-late-onset.spec.ts.
 * The operator baselines the link, notifies the customer BEFORE the window,
 * holds configuration through the peak (demod loses lock and self-recovers),
 * verifies recovery, and documents predicted-vs-actual.
 *
 * Spec notes:
 *  - 'wait-sky-noise' steps poll the simulation state directly
 *    (skyNoiseDegradation_dB on VT-01's antenna) instead of sleeping.
 *  - 'wait-objective' steps wait for the objective itself (Phase 29 D10):
 *    Hold Through the Peak ticks at the transit midpoint (onset + 150 s), and
 *    Verify Self-Recovery needs the modem to have lost lock and locked again.
 *  - Total wall-clock is dominated by the transit timeline (~5 min).
 */
type ObjectiveType = 'quiz' | 'select-station' | 'click-tab' | 'auto' | 'wait-sky-noise' | 'wait-objective' | 'objective-skip';

interface Scenario17Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  /** For wait-sky-noise: condition to await */
  skyNoise?: { above?: number; below?: number };
  /** For wait-sky-noise / wait-objective: max seconds to wait */
  waitTimeoutSeconds?: number;
  /** Reads the panel the quiz is about and asserts the keyed option is what the screen shows */
  checkScreen?: (page: import('@playwright/test').Page) => Promise<void>;
}

/** First number in a visible readout (e.g. "13.0 dB") */
async function readNumber(page: import('@playwright/test').Page, selector: string): Promise<number> {
  const text = (await page.locator(`${selector}:visible`).first().textContent()) ?? '';
  const match = /[-+]?\d+(?:\.\d+)?/u.exec(text);
  expect(match, `${selector} reads a number (got "${text}")`).not.toBeNull();
  return Number.parseFloat(match![0]);
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
    correctAnswer: 'Anything odd after the window opens gets blamed on the Sun, so a hidden fault only shows if the board was clean first',
  },
  {
    id: 'transit-geometry-quiz',
    title: 'Transit Geometry',
    type: 'quiz',
    correctAnswer: 'The Sun (about 20,000 K at C-band) passes through the beam behind the satellite, so noise soars and C/N collapses; the signal is unchanged',
  },
  {
    id: 'transit-predictability-quiz',
    title: 'Why It Is Predictable',
    type: 'quiz',
    correctAnswer: 'Twice a year near the equinoxes, a few minutes a day for several days, at times you can compute years ahead',
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
    // Phase 27 Q3: the observation rows latch on RX Analysis, then the C/N read
    type: 'quiz',
    correctAnswer: 'About 13 dB',
    checkScreen: async (page) => {
      const rawCn = await readNumber(page, '#cn-raw-display');
      expect(rawCn).toBeGreaterThan(12);
      expect(rawCn).toBeLessThan(14.5);
    },
  },
  {
    id: 'why-not-handover-quiz',
    title: 'The Handover Question',
    type: 'quiz',
    correctAnswer: 'The dip is brief, predicted and SLA-excluded with notice, a handover costs two transfers, and ME-02 has its own transit anyway',
  },
  {
    id: 'notify-customer-quiz',
    title: 'Pre-Event Notification',
    type: 'quiz',
    correctAnswer: 'Predicted solar transit on TIDEMARK-1, with window and peak times. Possible 1-3 minute carrier loss near peak, self-recovering. SLA advance notice.',
  },

  {
    // Holds until 10:32:30 on the station clock; the mission clock reads HOLD
    // meanwhile and the skip lands exactly on the sheet's window-open
    id: 'stand-by-for-window',
    title: 'Stand By for the Window',
    type: 'objective-skip',
  },

  // ============================================================
  // PHASE 2: THE WINDOW
  // ============================================================
  {
    // Phase 27 B7: the onset quiz waits for the sky-noise row listed before it
    id: 'observe-onset-wait',
    title: 'Wait for Sky Noise Onset',
    type: 'wait-sky-noise',
    skyNoise: { above: 2 },
    waitTimeoutSeconds: 420,
  },
  {
    id: 'observe-onset-quiz',
    title: 'Confirm Predicted Onset (quiz)',
    type: 'quiz',
    correctAnswer: 'Confidence that this is the predicted transit, not a coincidental fault, because the alarm tracking the sheet is the diagnosis',
  },
  {
    // ride-through-peak completes on its own once the transit has passed its
    // peak (weather-event-peaked, onset + 150 s) as long as the spec touches
    // nothing - which is the whole point of the objective. The receiver has
    // lost lock by then (Phase 29 D10).
    id: 'ride-through-peak',
    title: 'Hold Through the Peak',
    type: 'wait-objective',
    waitTimeoutSeconds: 300,
  },
  {
    id: 'peak-behavior-quiz',
    title: 'What the Peak Looks Like',
    type: 'quiz',
    correctAnswer: 'The downlink is buried in solar noise at our antenna only, the uplink is fine, and the demodulator relocks as the Sun moves off',
  },

  // ============================================================
  // PHASE 3: RECOVERY AND DOCUMENTATION
  // ============================================================
  {
    // Sky noise under 1 dB first, then the objective: Receiver Re-Locked is
    // receiver-relocked (lock lost after onset, then regained)
    id: 'verify-recovery-sky',
    title: 'Wait for Sky Noise to Clear',
    type: 'wait-sky-noise',
    skyNoise: { below: 1 },
    waitTimeoutSeconds: 420,
  },
  {
    id: 'verify-recovery',
    title: 'Verify Self-Recovery',
    type: 'wait-objective',
    waitTimeoutSeconds: 120,
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
    correctAnswer: 'Any alarm that survived the window, because the transit excuses exactly five minutes of sky noise and nothing else',
  },
  {
    id: 'marcus-confirm',
    title: 'Spacecraft-Side Confirmation',
    type: 'quiz',
    correctAnswer: 'Nothing abnormal on the spacecraft: our uplink steady and vehicle telemetry nominal, because the event existed only at our antenna',
  },
  {
    id: 'document-impact',
    title: 'Impact Documentation',
    type: 'quiz',
    correctAnswer: 'Predicted vs actual window times, peak degradation, lock-loss duration, notification timestamp, and a customer impact statement',
  },
  {
    id: 'log-shift-summary',
    title: 'Log the Event',
    type: 'quiz',
    correctAnswer:
      'TM-1 transit per SOP-SX-001, customer notified pre-window. Peak ~16 dB, brief demod loss, self-recovered, no residual alarms. Next window tomorrow, about the same time.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/** Poll VT-01's antenna sky-noise state until the threshold is met. */
async function waitForSkyNoise(page: import('@playwright/test').Page, condition: { above?: number; below?: number }, timeoutSeconds: number): Promise<void> {
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
      const gs = w.signalRange?.simulationManager?.groundStations?.find((g) => g.state?.id === 'VT-01');
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

/** Wait until the objective reports completed (window.debugObjective). */
async function waitForObjectiveComplete(page: import('@playwright/test').Page, id: string, timeoutSeconds: number): Promise<void> {
  await page.waitForFunction(
    (objectiveId) => {
      const hook = (window as unknown as { debugObjective?: (id: string) => { isCompleted?: boolean } }).debugObjective;
      return typeof hook === 'function' && hook(objectiveId)?.isCompleted === true;
    },
    id,
    { timeout: timeoutSeconds * 1000, polling: 500 }
  );
}

async function executeObjective(page: import('@playwright/test').Page, missionControlPage: MissionControlPage, objective: Scenario17Objective): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      await waitForQuizToAppear(page);
      await objective.checkScreen?.(page);
      await answerQuizByText(page, objective.correctAnswer!);
      break;

    case 'objective-skip': {
      const skip = page.locator('#objective-skip-control');
      await expect(skip).toBeVisible({ timeout: 30000 });
      // D1: waiting for the window costs no mission time
      await expect(page.locator('#scenario-timer-hold')).toBeVisible({ timeout: 10000 });
      await skip.click();
      await waitForObjectiveComplete(page, objective.id, 30);
      break;
    }

    case 'select-station':
      await missionControlPage.selectGroundStation(objective.stationId || 'VT-01');
      break;

    case 'click-tab':
      await missionControlPage.selectTab(objective.tabId!);
      // Observation-gated conditions latch only after their dwell on the tab
      // (Baseline RX Snapshot asks for 5 s); leaving at once would reset the
      // read and strand the objective.
      await page.waitForTimeout(6000);
      break;

    case 'wait-sky-noise':
      await waitForSkyNoise(page, objective.skyNoise!, objective.waitTimeoutSeconds ?? 420);
      break;

    case 'wait-objective':
      await waitForObjectiveComplete(page, objective.id, objective.waitTimeoutSeconds ?? 420);
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
      if (objective.type === 'wait-sky-noise' || objective.type === 'wait-objective') {
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
