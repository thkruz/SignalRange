import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 18 - "Satellite Anomaly": TIDEMARK-2 Station-Keeping Drift.
 *
 * A scenario-local drifting TM-2 variant (inclined figure-8, stale ephemeris)
 * degrades ME-02's program-track link. The operator reads the signature,
 * transitions to step-track, verifies beacon + carrier recovery, holds the
 * link, and closes out with role/escalation discipline quizzes.
 *
 * Objective types:
 * - 'quiz': Status-check quiz (Character.SYSTEM)
 * - 'select-station': Asset tree station selection (ME-02)
 * - 'click-tab': Tab navigation
 * - 'set-tracking-mode': Step-track toggle (rides program-track)
 * - 'auto': Simulation-satisfied condition (maintain-duration holds)
 */
type ObjectiveType = 'quiz' | 'select-station' | 'click-tab' | 'set-tracking-mode' | 'auto';

interface Scenario18Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  trackingMode?: string;
  autoWaitSeconds?: number;
  /** Reads the panel the quiz is about and asserts the keyed option is what the screen shows */
  checkScreen?: (page: import('@playwright/test').Page) => Promise<void>;
}

/** ME-02's ACU beacon C/N as the panel shows it (e.g. "28.0 dB") */
async function readAcuBeaconCn(page: import('@playwright/test').Page): Promise<number> {
  const text = (await page.locator('[id$="beacon-cn-value"]:visible').first().textContent()) ?? '';
  const match = /[-+]?\d+(?:\.\d+)?/u.exec(text);
  expect(match, `ACU beacon C/N reads a number (got "${text}")`).not.toBeNull();
  return Number.parseFloat(match![0]);
}

const SCENARIO_18_OBJECTIVES: Scenario18Objective[] = [
  {
    id: 'review-mission-brief',
    title: 'Review Anomaly Brief',
    type: 'quiz',
    correctAnswer: 'Keep the link alive and feed Halifax ground observations - the vehicle is theirs, the lock is mine',
  },
  {
    id: 'select-maine-station',
    title: 'Open ME-02',
    type: 'select-station',
    stationId: 'ME-02',
  },

  // PHASE 1: READ THE SIGNATURE
  {
    id: 'dashboard-baseline-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'dashboard-baseline',
    title: 'Station Health vs Link Health',
    type: 'quiz',
    correctAnswer: "The ground segment is healthy - the problem is on the space side or in the geometry, matching Halifax's report",
  },
  {
    id: 'station-keeping-quiz',
    title: 'What Died on the Spacecraft',
    type: 'quiz',
    correctAnswer: 'A daily figure-8 - the bird swings about 1.3° north and south of its slot, and the pre-burn ephemeris does not show it',
  },
  {
    id: 'read-program-track-decay-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'read-program-track-decay',
    title: 'Read the Program-Track Decay',
    type: 'quiz',
    correctAnswer: 'Program-track IS on the ephemeris target - the satellite is elsewhere, and the gap between prediction and reality costs pattern loss',
    // The sag the quiz names: ~28 dB on the stale ephemeris against ~34 under step-track
    checkScreen: async (page) => {
      const beaconCn = await readAcuBeaconCn(page);
      expect(beaconCn).toBeGreaterThan(24);
      expect(beaconCn).toBeLessThan(31);
    },
  },
  {
    id: 'beamwidth-risk-quiz',
    title: 'How Long Until It Falls Off',
    type: 'quiz',
    correctAnswer: 'Borrowed time - in about twenty minutes the gap reaches about one beamwidth (~0.55-0.6°) and the carrier would drop out of lock',
    // "about 0.4 deg now (beacon ~6 dB down)": the ACU still shows the sag
    checkScreen: async (page) => {
      const beaconCn = await readAcuBeaconCn(page);
      expect(beaconCn).toBeGreaterThan(24);
      expect(beaconCn).toBeLessThan(31);
    },
  },

  // PHASE 2: TRANSITION TO STEP-TRACK
  {
    id: 'enable-step-track',
    title: 'Engage Step-Track',
    type: 'set-tracking-mode',
    trackingMode: 'step-track',
  },
  {
    id: 'acquire-stable-beacon',
    title: 'Beacon Recovery',
    type: 'auto',
    autoWaitSeconds: 120,
  },
  {
    id: 'verify-carrier-recovery-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'verify-carrier-recovery',
    title: 'Carrier Recovery',
    type: 'auto',
    autoWaitSeconds: 90,
  },
  {
    id: 'no-manual-chase-quiz',
    title: 'Why Not Fly It By Hand',
    type: 'quiz',
    correctAnswer: 'A human chases where the bird WAS while the loop tracks where it IS - nudges add error, and a bad one can drop the beacon',
  },

  // PHASE 3: HOLD AND REPORT
  {
    // Phase 27: the 30 s watch accrues only while ACU Control is open
    id: 'sustained-hold-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'sustained-hold',
    title: 'Watch the Link Through the Drift',
    type: 'auto',
    autoWaitSeconds: 90,
  },
  {
    id: 'ground-observations-quiz',
    title: 'Feed the Vehicle Team',
    type: 'quiz',
    correctAnswer: 'Timestamped step-track pointing history - the dish is following the satellite, so its az/el trace measures the actual orbit',
  },
  {
    id: 'impact-assessment-quiz',
    title: 'Customer Impact Posture',
    type: 'quiz',
    correctAnswer: 'No current impact; service nominal under step-track. Elevated risk while the anomaly is open; decision points: step-track margin loss, Halifax status change',
  },
  {
    id: 'escalation-boundary-quiz',
    title: 'Escalation Tripwires',
    type: 'quiz',
    correctAnswer: 'Step-track losing the beacon, C/N below demod threshold despite good tracking, or Halifax declaring the vehicle unsafe',
  },
  {
    id: 'log-shift-summary',
    title: 'Log the Anomaly Response',
    type: 'quiz',
    correctAnswer:
      'TM-2 vehicle anomaly (Halifax ref): N-S burn overran, ~1.3° inclination, ephemeris stale. ME-02 on step-track (time in the Ops Log), carrier recovered, no impact. Pointing history to Halifax. Anomaly OPEN.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/** Step-track is a toggle riding program-track (same pattern as S6/S10). */
async function setTrackingMode(page: import('@playwright/test').Page, trackingMode: string): Promise<void> {
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
  await page.waitForTimeout(300);
}

async function executeObjective(page: import('@playwright/test').Page, missionControlPage: MissionControlPage, objective: Scenario18Objective): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      await waitForQuizToAppear(page);
      await objective.checkScreen?.(page);
      await answerQuizByText(page, objective.correctAnswer!);
      break;

    case 'select-station':
      await missionControlPage.selectGroundStation(objective.stationId || 'ME-02');
      break;

    case 'click-tab':
      await missionControlPage.selectTab(objective.tabId!);
      // Observation-gated conditions latch only after the default dwell on
      // the tab (DEFAULT_OBSERVATION_DWELL_SECONDS); leaving at once would
      // reset the read and strand the objective.
      await page.waitForTimeout(3000);
      break;

    case 'set-tracking-mode':
      await setTrackingMode(page, objective.trackingMode!);
      break;

    case 'auto':
      // Holds (maintainDuration) complete the objective on their own; wait
      // for it rather than a fixed sleep
      await page.waitForFunction(
        (id) => {
          const hook = (window as unknown as { debugObjective?: (id: string) => { isCompleted?: boolean } }).debugObjective;
          return typeof hook === 'function' && hook(id)?.isCompleted === true;
        },
        objective.id,
        { timeout: (objective.autoWaitSeconds ?? 30) * 1000, polling: 500 }
      );
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 18 Full Completion', () => {
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

    await missionControlPage.gotoScenario('nats', 'nats-scenario18');
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

  for (const objective of SCENARIO_18_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      if (objective.type === 'auto' && (objective.autoWaitSeconds ?? 0) >= 30) {
        test.setTimeout((objective.autoWaitSeconds! + 30) * 1000);
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
