import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 19 - "Train the New Hire": Producing the Quick-Reference Card.
 *
 * First scenario using the Working Document panel: teaching quizzes carry
 * documentLine params and the quick-reference card accumulates as they are
 * passed. The spec performs the live AURORA-7 procedure (repoint,
 * beacon tune, step-track, verify) interleaved with the card quizzes, then
 * verifies the Working Document panel actually contains the card lines.
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'repoint-program-track'
  | 'configure-speca'
  | 'set-step-track'
  | 'verify-working-doc'
  | 'auto';

interface Scenario19Objective {
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

const SCENARIO_19_OBJECTIVES: Scenario19Objective[] = [
  {
    id: 'review-mission-brief',
    title: 'Review the Assignment',
    type: 'quiz',
    correctAnswer: 'Ready - procedure live, card building in the Working Document panel.',
  },
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'card-scope-quiz',
    title: 'Set the Card\'s Scope',
    type: 'quiz',
    correctAnswer:
      'The numbers someone needs under pressure plus the mistakes with the highest local base rate - one page, taped to the console; the procedure itself stays in the SOP',
  },

  // PHASE 1: ACQUIRE
  {
    id: 'repoint-to-aurora-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'repoint-to-aurora',
    title: 'Fly It: Acquire AURORA-7',
    type: 'repoint-program-track',
    satelliteNoradId: '28899',
  },
  {
    id: 'acquire-callout-quiz',
    title: 'Card Line: Acquisition',
    type: 'quiz',
    correctAnswer:
      'Program-track FIRST - it puts you inside beacon capture range. Nominal: Az 190, El 32, but the bird rides a ±3° figure-8',
  },
  {
    id: 'tune-beacon-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'tune-beacon',
    title: 'Fly It: Find the Beacon',
    type: 'configure-speca',
    centerFrequencyMhz: 1085,
  },
  {
    id: 'beacon-formula-quiz',
    title: 'Card Line: the Beacon Number',
    type: 'quiz',
    correctAnswer:
      'Beacon IF = LO − RF = 5250 − 4165 = 1085 MHz. Weak CW (aging bird) - use a narrow span, ~2 kHz',
  },
  {
    id: 'mistake-lo-quiz',
    title: 'Card Line: First Watch-Out',
    type: 'quiz',
    correctAnswer:
      'Beacon "missing" at 1085? Check the LNB LO = 5250 - an operator fresh from Maine duty once hunted a healthy beacon for an hour with the LO still at Maine\'s 6080 default',
  },

  // PHASE 2: TRACK
  {
    id: 'enable-step-track-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'enable-step-track',
    title: 'Fly It: Engage Step-Track',
    type: 'set-step-track',
  },
  {
    id: 'step-track-rule-quiz',
    title: 'Card Line: the Engagement Rule',
    type: 'quiz',
    correctAnswer:
      'Step-track RIDES program-track - engage it as an optimization on an acquired beacon, never from MANUAL (the loop needs a beacon to optimize)',
  },
  {
    id: 'hold-beacon',
    title: 'Fly It: Hold the Figure-8',
    type: 'auto',
    autoWaitSeconds: 30,
  },
  {
    id: 'healthy-track-quiz',
    title: 'Card Line: What Healthy Looks Like',
    type: 'quiz',
    correctAnswer:
      'Healthy = beacon C/N steady at its peak while Az/El visibly wander the figure-8. Moving dish + flat C/N is the loop WORKING, not a fault',
  },
  {
    id: 'mistake-chase-quiz',
    title: 'Card Line: Second Watch-Out',
    type: 'quiz',
    correctAnswer:
      'C/N sagging mid-track? Verify step-track is still ON before touching the axes - hand-chasing the figure-8 is a losing game an operator here once played for twenty minutes',
  },

  // PHASE 3: VERIFY
  {
    id: 'verify-receiver-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'verify-receiver',
    title: 'Fly It: Prove the Link',
    type: 'auto',
    autoWaitSeconds: 10,
  },
  {
    id: 'verify-chain-quiz',
    title: 'Card Line: the Proof Chain',
    type: 'quiz',
    correctAnswer:
      'Proof chain, in order: beacon at 1085 (pointing + LO) → RX locked at 1422 MHz / 24 MHz (carrier) → C/N ≥ 8 (margin). Each link proves something the others don\'t',
  },
  {
    id: 'mistake-span-quiz',
    title: 'Card Line: Third Watch-Out',
    type: 'quiz',
    correctAnswer:
      'Carrier "gone" but beacon fine? Widen the span - a 24 MHz carrier is invisible at the 2 kHz span you used for the beacon. (Operator here once declared an outage over this)',
  },
  {
    id: 'tx-numbers-quiz',
    title: 'Card Line: the TX Number',
    type: 'quiz',
    correctAnswer:
      'TX IF = BUC LO − uplink RF = 7500 − 6053 = 1447 MHz. AURORA\'s chain uses BUC LO 7500 - NOT the TIDEMARK 7000',
  },

  // Verify the card BEFORE the final quizzes (the Mission Complete modal
  // overlays the sidebar once the last objective lands)
  {
    id: 'verify-working-doc',
    title: 'Working Document: card accumulated all lines',
    type: 'verify-working-doc',
  },

  // PHASE 4: REVIEW AND HANDOFF
  {
    id: 'card-review-quiz',
    title: 'Editorial Review',
    type: 'quiz',
    correctAnswer:
      'Card space is the reader\'s attention under pressure - every line they scan past to find the one they need is time on a degraded link; the card earns trust by containing only what earns its place',
  },
  {
    id: 'log-handoff',
    title: 'Hand Off the Card',
    type: 'quiz',
    correctAnswer:
      'AURORA-7 quick-reference card complete - built against a live procedure run (acquire, step-track, verify, all green). Sections: Acquire / Track / Verify / Numbers / 3x Watch-Out from station history. Delivered to Dana for the new-hire packet.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/** Program-track + select satellite + Move to Target, then wait on sim state. */
async function repointProgramTrack(
  page: import('@playwright/test').Page,
  satelliteNoradId: string
): Promise<void> {
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

  // Wait for the slew to finish and lock to register (sim-state, not DOM)
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
      const gs = w.signalRange?.simulationManager?.groundStations?.find(g => g.state?.id === 'VT-01');
      const antennaState = gs?.antennas?.[0]?.state;
      return antennaState ? antennaState.slewing === false && antennaState.isLocked === true : false;
    },
    undefined,
    { timeout: 180000 }
  );
  await page.waitForTimeout(1500);
}

async function configureSpeca(
  page: import('@playwright/test').Page,
  centerFrequencyMhz: number
): Promise<void> {
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(centerFrequencyMhz.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(500);
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

/** Open the Working Document via the sidebar icon, assert the card content, close it. */
async function verifyWorkingDocument(page: import('@playwright/test').Page): Promise<void> {
  const docIcon = page.locator('.working-doc-icon');
  await expect(docIcon).toBeVisible({ timeout: 5000 });
  await docIcon.click();

  const docBox = page.locator('#draggable-html-box-working-document');
  await expect(docBox).toBeVisible({ timeout: 5000 });

  // All 10 documentLine quizzes passed by this point
  await expect(docBox).toContainText('10 entries');
  await expect(docBox).toContainText('Beacon IF = LO − RF = 5250 − 4165 = 1085 MHz');
  await expect(docBox).toContainText('Watch Out');
  await expect(docBox).toContainText('NOT the TIDEMARK 7000');

  // Close it so it cannot block the remaining quiz clicks
  const closeBtn = docBox.locator('.draggable-box__close-btn, [id$="-close"]').first();
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
}

async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario19Objective
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

    case 'repoint-program-track':
      await repointProgramTrack(page, objective.satelliteNoradId!);
      break;

    case 'configure-speca':
      await configureSpeca(page, objective.centerFrequencyMhz!);
      break;

    case 'set-step-track':
      await setStepTrack(page);
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

test.describe('Scenario 19 Full Completion', () => {
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

    await missionControlPage.gotoScenario('nats', 'nats-scenario19');
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

  for (const objective of SCENARIO_19_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // The AURORA repoint slews ~30° of azimuth
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
