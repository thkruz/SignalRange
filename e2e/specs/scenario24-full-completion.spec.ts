import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 24 - "Constellation Crisis": Campaign Capstone.
 *
 * Five concurrent tracks: VT-01 storm (proactive heater), ME-02 BUC thermal
 * trend (de-rate), AURORA-7 customer pass (acquire + step-track), customer +
 * board comms. The Working Document is the incident-command log. No new
 * mechanics - this validates the orchestration of everything prior.
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'toggle-switch'
  | 'configure-buc-gain'
  | 'repoint-program-track'
  | 'set-step-track'
  | 'verify-working-doc'
  | 'auto';

interface Scenario24Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  switchId?: string;
  switchState?: boolean;
  bucGain?: number;
  satelliteNoradId?: string;
  autoWaitSeconds?: number;
}

const SCENARIO_24_OBJECTIVES: Scenario24Objective[] = [
  {
    id: 'review-mission-brief',
    title: 'Assume Incident Command',
    type: 'quiz',
    correctAnswer:
      'Order the board before touching anything: separate the clocks you do not control (storm ETA, pass window, board deadline) from the trends you can bend (BUC heat, customer confidence), and sequence your attention accordingly',
  },
  {
    id: 'sequencing-quiz',
    title: 'Set the Sequence',
    type: 'quiz',
    correctAnswer:
      'Protect against the fixed clock first: enable VT-01 heater NOW (one switch, beats the front), then de-rate the ME-02 BUC trend, then set up the AURORA pass before its window - acting on the soonest fixed deadline first, cheap protections before expensive ones',
  },

  // TRACK 1: VT-01 STORM
  {
    id: 'select-vermont',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'enable-heater-proactive-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'enable-heater-proactive',
    title: 'Heater Before the Front',
    type: 'toggle-switch',
    switchId: 'heater-switch',
    switchState: true,
  },

  // TRACK 2: ME-02 BUC
  {
    id: 'select-maine',
    title: 'Open ME-02',
    type: 'select-station',
    stationId: 'ME-02',
  },
  {
    id: 'recognize-buc-signature-tab',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'recognize-buc-signature',
    title: 'Recognize the Signature',
    type: 'quiz',
    correctAnswer:
      'The same over-gain thermal trend from before - the swap that never cleared procurement. Fix is the de-rate: gain back to the 23 dB operating value, which cuts the dissipation at the source',
  },
  {
    id: 'derate-buc',
    title: 'De-Rate the BUC',
    type: 'configure-buc-gain',
    bucGain: 23,
  },
  {
    id: 'verify-buc-trending-down',
    title: 'Confirm the Trend Bends',
    type: 'auto',
    autoWaitSeconds: 5,
  },

  // TRACK 3: AURORA-7 PASS
  {
    id: 'return-vermont-for-pass',
    title: 'Back to VT-01 for the Pass',
    type: 'select-station',
    stationId: 'VT-01',
  },
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
    id: 'step-track-weak-beacon',
    title: 'Step-Track the Weak Beacon',
    type: 'set-step-track',
  },
  {
    id: 'pass-go-nogo-quiz',
    title: 'Pass Go/No-Go',
    type: 'quiz',
    correctAnswer:
      'GO with a caveat: step-track holding, margin thin on an end-of-life beacon; proceed with the pass but flag that AURORA is on its sunset trajectory - and deliver that BEFORE 0800, not mid-pass',
  },

  // CUSTOMER + BOARD
  {
    id: 'customer-escalation-quiz',
    title: 'Manage the Customer Channel',
    type: 'quiz',
    correctAnswer:
      'Per-trunk cause/action/next-update, in thirty seconds each: TM-1 protected ahead of the storm (heater on, holding), TM-2 stabilized (BUC de-rated, no impact) - with a committed next-update time so he stops calling and you keep working',
  },
  {
    id: 'storm-hold-check',
    title: 'Storm Holding',
    type: 'quiz',
    correctAnswer:
      'The feed stays clear as fast as ice tries to form - no accumulation, link holding; the proactive heater turned a potential outage into a non-event you only have to monitor',
  },
  {
    id: 'board-note-quiz',
    title: 'The Board Note',
    type: 'quiz',
    correctAnswer:
      'Posture, exposure, action: both stations stable through a concurrent storm + thermal-trend morning, no customer outage; AURORA pass delivered on a sunsetting beacon (reinforces the migration recommendation); residual risk = the pending ME-02 BUC swap. One paragraph, board-level, no jargon',
  },

  // Verify command log BEFORE the final quizzes (modal overlays sidebar after)
  {
    id: 'verify-working-doc',
    title: 'Incident-command log assembled',
    type: 'verify-working-doc',
  },

  // CLOSE
  {
    id: 'review-command-log',
    title: 'Review the Command Log',
    type: 'quiz',
    correctAnswer:
      'It shows the ordered board, the sequence and why, each track\'s action and outcome, the customer and board comms, and the residual risk - someone could pick up your shift cold and know exactly what happened and what is still open',
  },
  {
    id: 'log-crisis-closed',
    title: 'Close the Incident',
    type: 'quiz',
    correctAnswer:
      'Constellation crisis worked under single-operator incident command: VT-01 storm protected (proactive heater, no ice), ME-02 BUC thermal trend de-rated (no outage), AURORA SeaLink pass delivered on EOL beacon, customers briefed per-trunk, board note filed. Zero customer outage across five concurrent tracks. Residual: ME-02 BUC swap pending. IC closed.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

async function toggleSwitch(
  page: import('@playwright/test').Page,
  switchId: string,
  desiredState: boolean
): Promise<void> {
  let switchEl = page.locator(`#${switchId}`);
  if ((await switchEl.count()) === 0) {
    switchEl = page.locator(`[id$="${switchId}"]`);
  }
  await expect(switchEl.first()).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(1200);
  const isChecked = await switchEl.first().isChecked();
  if (isChecked !== desiredState) {
    await switchEl.first().click();
  }
  if (desiredState) {
    await expect(switchEl.first()).toBeChecked();
  } else {
    await expect(switchEl.first()).not.toBeChecked();
  }
  await page.waitForTimeout(300);
}

async function configureBucGain(
  page: import('@playwright/test').Page,
  gain: number
): Promise<void> {
  const gainInput = page.locator('#buc-gain');
  await expect(gainInput).toBeVisible({ timeout: 5000 });
  await gainInput.fill(gain.toString());
  await gainInput.press('Tab');
  await page.waitForTimeout(100);

  const applyBtn = page.locator('#buc-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
  await page.waitForTimeout(400);
}

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

async function setStepTrack(page: import('@playwright/test').Page): Promise<void> {
  const stepTrackToggle = page.locator('input[id$="step-track-toggle"]');
  await expect(stepTrackToggle).toBeVisible({ timeout: 5000 });
  if (!(await stepTrackToggle.isChecked())) {
    await stepTrackToggle.click();
  }
  await expect(stepTrackToggle).toBeChecked();
  await page.waitForTimeout(300);
}

async function verifyWorkingDocument(page: import('@playwright/test').Page): Promise<void> {
  const docIcon = page.locator('.working-doc-icon');
  await expect(docIcon).toBeVisible({ timeout: 5000 });
  await docIcon.click();

  const docBox = page.locator('#draggable-html-box-working-document');
  await expect(docBox).toBeVisible({ timeout: 5000 });

  // 8 documentLine quizzes passed by this point
  await expect(docBox).toContainText('7 entries');
  await expect(docBox).toContainText('Command');
  await expect(docBox).toContainText('Board Note');
  await expect(docBox).toContainText('Residual risk');

  const closeBtn = docBox.locator('.draggable-box__close-btn, [id$="-close"]').first();
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
}

async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario24Objective
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

    case 'configure-buc-gain':
      await configureBucGain(page, objective.bucGain!);
      break;

    case 'repoint-program-track':
      await repointProgramTrack(page, objective.satelliteNoradId!);
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

test.describe('Scenario 24 Full Completion', () => {
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

    await missionControlPage.gotoScenario('nats', 'nats-scenario24');
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

  for (const objective of SCENARIO_24_OBJECTIVES) {
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
