import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 22 - "End-of-Life Planning": AURORA-7 Sunset Recommendation.
 *
 * Second Working Document scenario - this one produces an executive impact
 * report. The operator runs a final AURORA-7 data pass (acquire, step-track,
 * measure beacon), then the analysis quizzes build the report. The spec
 * verifies the report content in the Working Document before the final quizzes
 * (the Mission Complete modal overlays the sidebar afterward).
 */
type ObjectiveType = 'quiz' | 'select-station' | 'click-tab' | 'repoint-program-track' | 'set-step-track' | 'configure-speca' | 'verify-working-doc' | 'auto';

interface Scenario22Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  satelliteNoradId?: string;
  centerFrequencyMhz?: number;
  autoWaitSeconds?: number;
}

const SCENARIO_22_OBJECTIVES: Scenario22Objective[] = [
  {
    id: 'review-mission-brief',
    title: 'Review the Tasking',
    type: 'quiz',
    correctAnswer: 'A defensible recommendation grounded in measured data and an honest trend, with assumptions labeled - not a single date',
  },
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },

  // PHASE 1: FINAL DATA RUN
  {
    id: 'acquire-aurora-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'acquire-aurora',
    title: 'Acquire AURORA-7',
    type: 'repoint-program-track',
    satelliteNoradId: '28899',
  },
  {
    id: 'engage-step-track',
    title: 'Step-Track for the Weak Beacon',
    type: 'set-step-track',
  },
  {
    id: 'measure-beacon-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'measure-beacon',
    title: "Measure Today's Beacon",
    type: 'configure-speca',
    centerFrequencyMhz: 1085,
  },
  {
    id: 'record-data-point-quiz',
    title: "Report: Today's Measurement",
    type: 'quiz',
    correctAnswer: 'Beacon at -4.0 dB relative to the 24-month reference; step-track held lock at this level; carrier C/N above demod threshold',
  },

  // PHASE 2: TREND ANALYSIS
  {
    id: 'trend-slope-quiz',
    title: 'Report: the Trend',
    type: 'quiz',
    correctAnswer: 'Accelerating - the last 6 months lost ~1.6 dB against ~1.3 dB in the 6 before; a steepening curve, not a straight line',
  },
  {
    id: 'binding-constraint-quiz',
    title: 'Report: What Fails First',
    type: 'quiz',
    correctAnswer: 'The beacon getting too weak to step-track - AURORA-7 is inclined, so without it every pass becomes manual figure-8 chasing',
  },
  {
    id: 'marcus-corroboration-quiz',
    title: 'Report: Vehicle Corroboration',
    type: 'quiz',
    correctAnswer: 'It raises confidence: ground-measured beacon decline and spacecraft-reported power loss agree from independent vantage points',
  },

  // PHASE 3: RECOMMENDATION
  {
    id: 'sunset-window-quiz',
    title: 'Report: the Recommendation',
    type: 'quiz',
    correctAnswer: 'Begin migration now; sunset in one to two quarters, reviewed monthly, with a firm trigger at the step-track floor',
  },
  {
    id: 'assumptions-quiz',
    title: 'Report: Label the Assumptions',
    type: 'quiz',
    correctAnswer: 'The decline continues or steepens (no recovery), no single-event failure intervenes, and tracking is the binding constraint',
  },
  {
    id: 'false-precision-quiz',
    title: 'Confidence Discipline',
    type: 'quiz',
    correctAnswer: "Explicitly: today's -4.0 dB and the historical points are measured; the sunset window is a projection under stated assumptions",
  },

  // Verify the report BEFORE the final quizzes (modal overlays the sidebar after)
  {
    id: 'verify-working-doc',
    title: 'Working Document: report assembled',
    type: 'verify-working-doc',
  },

  // PHASE 4: REVIEW AND DELIVER
  {
    id: 'review-report',
    title: 'Review the Assessment',
    type: 'quiz',
    correctAnswer: 'It has data, a trend, the binding-constraint risk, a windowed recommendation with tripwires, and labeled assumptions',
  },
  {
    id: 'log-delivery',
    title: 'Deliver and Log',
    type: 'quiz',
    correctAnswer: 'AURORA-7 EOL assessment to board: beacon -4.0 dB, trend accelerating; migrate now, sunset ~1-2 quarters, trigger at tracking floor',
  },
];

// ============================================================
// Helper Functions
// ============================================================

async function repointProgramTrack(page: import('@playwright/test').Page, satelliteNoradId: string): Promise<void> {
  const modeButton = page.locator('.btn-tracking[data-mode="program-track"]');
  await expect(modeButton).toBeVisible({ timeout: 5000 });
  await modeButton.click();
  await page.waitForTimeout(300);

  const satelliteSelect = page.locator('select[id$="satellite-select"]');
  await expect(satelliteSelect).toBeVisible({ timeout: 5000 });
  await satelliteSelect.selectOption({ value: satelliteNoradId });
  await page.waitForTimeout(200);

  const moveBtn = page.locator('button[id$="move-to-target-btn"]');
  await expect(moveBtn).toBeEnabled({ timeout: 5000 });
  await moveBtn.click();

  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        signalRange?: {
          simulationManager?: {
            groundStations?: Array<{
              state?: { id?: string };
              antennas?: Array<{ state?: { slewing?: boolean; isLocked?: boolean } }>;
            }>;
          };
        };
      };
      const gs = w.signalRange?.simulationManager?.groundStations?.find((g) => g.state?.id === 'VT-01');
      const antennaState = gs?.antennas?.[0]?.state;
      return antennaState ? antennaState.slewing === false && antennaState.isLocked === true : false;
    },
    undefined,
    { timeout: 180000 }
  );
  await page.waitForTimeout(1500);
}

async function setStepTrack(page: import('@playwright/test').Page): Promise<void> {
  const stepTrackToggle = page.locator('input[id$="step-track-toggle"]');
  await expect(stepTrackToggle).toBeVisible({ timeout: 5000 });
  if (!(await stepTrackToggle.isChecked())) {
    await stepTrackToggle.click();
  }
  await expect(stepTrackToggle).toBeChecked();
  await page.waitForTimeout(300);
}

async function configureSpeca(page: import('@playwright/test').Page, centerFrequencyMhz: number): Promise<void> {
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(centerFrequencyMhz.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(500);
}

async function verifyWorkingDocument(page: import('@playwright/test').Page): Promise<void> {
  const docIcon = page.locator('.working-doc-icon');
  await expect(docIcon).toBeVisible({ timeout: 5000 });
  await docIcon.click();

  const docBox = page.locator('#draggable-html-box-working-document');
  await expect(docBox).toBeVisible({ timeout: 5000 });

  // 7 documentLine quizzes passed by this point
  await expect(docBox).toContainText('6 entries');
  await expect(docBox).toContainText('Recommendation');
  await expect(docBox).toContainText('Binding constraint = beacon trackability');
  await expect(docBox).toContainText('Assumptions');

  const closeBtn = docBox.locator('.draggable-box__close-btn, [id$="-close"]').first();
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
}

async function executeObjective(page: import('@playwright/test').Page, missionControlPage: MissionControlPage, objective: Scenario22Objective): Promise<void> {
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

    case 'repoint-program-track':
      await repointProgramTrack(page, objective.satelliteNoradId!);
      break;

    case 'set-step-track':
      await setStepTrack(page);
      break;

    case 'configure-speca':
      await configureSpeca(page, objective.centerFrequencyMhz!);
      break;

    case 'verify-working-doc':
      await verifyWorkingDocument(page);
      break;

    case 'auto':
      await page.waitForTimeout((objective.autoWaitSeconds ?? 5) * 1000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 22 Full Completion', () => {
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

    await missionControlPage.gotoScenario('nats', 'nats-scenario22');
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

  for (const objective of SCENARIO_22_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      if (objective.type === 'repoint-program-track') {
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
