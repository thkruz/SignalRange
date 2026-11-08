import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 24 - "Constellation Crisis": Campaign Capstone.
 *
 * Five concurrent tracks: VT-01 storm (proactive heater), ME-02 BUC thermal
 * trend (de-rate), AURORA-7 customer pass (acquire + step-track), customer +
 * board comms. The Working Document is the incident-command log. No new
 * mechanics - this validates the orchestration of everything prior. The BUC
 * heat is a staged buc-overtemp fault; the closing step needs a typed Ops Log
 * entry.
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
  | 'ops-log'
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
  logText?: string;
  /** For quiz: how long to wait for it (rows listed before it must hold first) */
  quizWaitMs?: number;
  /** For quiz: read the BUC panel (current down, Trend negative) before answering */
  assertBucTrendTurned?: boolean;
  /** For quiz: a timed hold row comes first; advance the clock this far (s) so it completes */
  holdSeconds?: number;
  /** For quiz: VT-01 is under the rain band, feed clear, beacon still locked (Phase 29 D13) */
  assertRainBand?: boolean;
}

const SCENARIO_24_OBJECTIVES: Scenario24Objective[] = [
  {
    id: 'review-mission-brief',
    title: 'Assume Incident Command',
    type: 'quiz',
    correctAnswer: 'Order the board: fixed clocks (storm, pass, board note) against trends you can bend (BUC heat, customer)',
  },
  {
    id: 'sequencing-quiz',
    title: 'Set the Sequence',
    type: 'quiz',
    correctAnswer: 'Switch the VT-01 heater on now, then de-rate the ME-02 BUC, then set up the AURORA-7 pass before 0800',
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
    correctAnswer: 'The same over-gain trend as before, swap still pending. De-rate the gain back to the 23 dB operating value',
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
    // Phase 27 Q3: the current / linearity rows latch on TX Chain, then the panel read.
    // nats-r3-s24-F1: the current row holds 45 s so the Trend (1 min) has turned
    // when the quiz opens; the spec reads the panel before answering.
    type: 'quiz',
    correctAnswer: 'Current about 3.1 A, temperature still in the low 60s, Trend (1 min) negative, P1dB Margin about 12 dB',
    quizWaitMs: 90000,
    assertBucTrendTurned: true,
  },

  // TRACK 3: AURORA-7 PASS
  {
    id: 'return-vermont-for-pass',
    title: 'Back to VT-01 for the Pass',
    type: 'select-station',
    stationId: 'VT-01',
  },
  // Phase 27: never slew a keyed dish off TIDEMARK-1 - HPA down first, then
  // mute the BUC (an enabled HPA on a muted BUC is an RF-safety failure)
  {
    id: 'inhibit-tm1-tx-tab',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'inhibit-tm1-tx-hpa',
    title: 'Take TM-1 Off the Air: HPA',
    type: 'toggle-switch',
    switchId: 'hpa-enable',
    switchState: false,
  },
  {
    id: 'inhibit-tm1-tx',
    title: 'Take TM-1 Off the Air',
    type: 'toggle-switch',
    switchId: 'buc-mute',
    switchState: true,
    autoWaitSeconds: 20,
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
    // Step-track on, then the beacon held 15 s on ACU Control
    id: 'step-track-weak-beacon',
    title: 'Step-Track the Weak Beacon',
    type: 'set-step-track',
    autoWaitSeconds: 90,
  },
  {
    id: 'pass-go-nogo-quiz',
    title: 'Pass Go/No-Go',
    type: 'quiz',
    correctAnswer: 'GO with a caveat: the margin is thin, so flag the sunset trajectory to Marcus BEFORE 0800',
  },

  // CUSTOMER + BOARD
  {
    id: 'customer-escalation-quiz',
    title: 'Manage the Customer Channel',
    type: 'quiz',
    correctAnswer: 'Cause, action and next-update time for each trunk, thirty seconds each: TM-1 on its backup, TM-2 stabilized',
  },
  {
    // Phase 29 D13: the quiz waits behind "Watch the beacon on ACU Control (held 60 s)"
    id: 'storm-hold-check-tab',
    title: 'Open ACU Control for the storm read',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'storm-hold-check',
    title: 'Storm Holding',
    type: 'quiz',
    holdSeconds: 62,
    assertRainBand: true,
    correctAnswer: 'The heater is holding the feed clear (Ice 0.0 dB) and rain costs the beacon about 1 dB, still above the 6.5 dB lock',
  },
  {
    id: 'board-note-quiz',
    title: 'The Board Note',
    type: 'quiz',
    correctAnswer: 'Posture and exposure: both stations stable, no outage, AURORA pass GO for 0800 on a sunsetting beacon, BUC swap as residual risk',
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
    correctAnswer: "It shows the ordered board, the sequence and why, each track's action and outcome, the comms and the residual risk",
  },
  {
    id: 'log-crisis-closed',
    title: 'Close the Incident',
    type: 'quiz',
    correctAnswer: 'IC closed: VT-01 storm protected, ME-02 BUC de-rated, AURORA pass GO for 0800 (caveat briefed); zero outage; residual = ME-02 BUC swap',
  },
  {
    id: 'log-crisis-closed-typed',
    title: 'Close the Incident: typed Ops Log entry',
    type: 'ops-log',
    logText: 'IC closed: VT-01 storm protected, ME-02 BUC de-rated, AURORA GO for 0800; residual = ME-02 BUC swap',
  },
];

// ============================================================
// Helper Functions
// ============================================================

async function toggleSwitch(page: import('@playwright/test').Page, switchId: string, desiredState: boolean): Promise<void> {
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

async function configureBucGain(page: import('@playwright/test').Page, gain: number): Promise<void> {
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

async function verifyWorkingDocument(page: import('@playwright/test').Page): Promise<void> {
  const docIcon = page.locator('.working-doc-icon');
  await expect(docIcon).toBeVisible({ timeout: 5000 });
  await docIcon.click();

  const docBox = page.locator('#draggable-html-box-working-document');
  await expect(docBox).toBeVisible({ timeout: 5000 });

  // 7 documentLine quizzes passed by this point
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

/**
 * Type an entry into the Operations Log (sidebar log icon) and close it.
 */
async function typeOpsLogEntry(page: import('@playwright/test').Page, text: string): Promise<void> {
  await page.locator('.ops-log-icon').first().click();
  const input = page.locator('#ops-log-manual-input');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(text);
  await input.press('Enter');
  await expect(page.locator('#ops-log-entries')).toContainText(text.slice(0, 20), { timeout: 5000 });
  // Mission Complete closes the log itself when this entry finishes the scenario
  await page
    .locator('#ops-log-modal-close')
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * The de-rate as the ME-02 BUC panel shows it when the quiz opens: current
 * near 3.1 A, temperature still in the low 60s, Trend (1 min) below zero.
 * Read off the DOM so the keyed answer is the screen, not the option text.
 */
async function assertBucTrendTurned(page: import('@playwright/test').Page): Promise<void> {
  const readNumber = async (selector: string): Promise<number> => {
    const text = (await page.locator(`${selector}:visible`).first().textContent()) ?? '';
    const match = /[-+]?\d+(?:\.\d+)?/u.exec(text);
    expect(match, `${selector} reads a number (got "${text}")`).not.toBeNull();
    return Number.parseFloat(match![0]);
  };
  expect(await readNumber('#buc-current-display')).toBeLessThan(3.5);
  const temperature = await readNumber('#buc-temperature-display');
  expect(temperature).toBeGreaterThanOrEqual(60);
  expect(temperature).toBeLessThan(65);
  expect(await readNumber('#buc-temp-trend-display')).toBeLessThan(0);
}

/** VT-01 under the rain band: rain falling, feed clear (heater), AURORA-7 beacon still locked. */
async function assertRainBand(page: import('@playwright/test').Page): Promise<void> {
  const vt = await page.evaluate(() => {
    const w = window as unknown as {
      signalRange?: {
        simulationManager?: {
          groundStations?: Array<{
            state?: { id?: string };
            antennas?: Array<{ state?: { rainRate_mmh?: number; iceAccumulation_dB?: number; isBeaconLocked?: boolean; beaconCN?: number | null } }>;
          }>;
        };
      };
    };
    const gs = w.signalRange?.simulationManager?.groundStations?.find((g) => g.state?.id === 'VT-01');
    return gs?.antennas?.[0]?.state ?? null;
  });
  expect(vt, 'VT-01 antenna state').not.toBeNull();
  expect(vt!.rainRate_mmh ?? 0).toBeGreaterThan(20);
  expect(vt!.iceAccumulation_dB ?? 99).toBeLessThan(0.1);
  expect(vt!.isBeaconLocked).toBe(true);
  expect(vt!.beaconCN ?? 0).toBeGreaterThan(6.5);
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

async function executeObjective(page: import('@playwright/test').Page, missionControlPage: MissionControlPage, objective: Scenario24Objective): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      if (objective.holdSeconds) {
        // advanceClock moves the weather (the rain band ramps in) but credits no
        // maintainDuration hold: the 60 s hold accrues in real time while ACU
        // Control is open, and waitForQuizToAppear waits for it
        await page.evaluate((ms) => (window as unknown as { advanceClock: (deltaMs: number) => void }).advanceClock(ms), objective.holdSeconds * 1000);
        await page.waitForTimeout(1500);
      }
      await waitForQuizToAppear(page, objective.quizWaitMs);
      if (objective.assertRainBand) {
        await assertRainBand(page);
      }
      if (objective.assertBucTrendTurned) {
        await assertBucTrendTurned(page);
      }
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
      if (objective.autoWaitSeconds) {
        await waitForObjectiveDone(page, objective.id, objective.autoWaitSeconds * 1000);
      }
      break;

    case 'configure-buc-gain':
      await configureBucGain(page, objective.bucGain!);
      break;

    case 'repoint-program-track':
      await repointProgramTrack(page, objective.satelliteNoradId!);
      break;

    case 'set-step-track':
      await setStepTrack(page);
      await waitForObjectiveDone(page, objective.id, (objective.autoWaitSeconds ?? 30) * 1000);
      break;

    case 'verify-working-doc':
      await verifyWorkingDocument(page);
      break;

    case 'ops-log':
      await typeOpsLogEntry(page, objective.logText!);
      break;

    case 'auto':
      await waitForObjectiveDone(page, objective.id, (objective.autoWaitSeconds ?? 30) * 1000);
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
      if ((objective.quizWaitMs ?? 0) > 30000 || (objective.autoWaitSeconds ?? 0) > 60) {
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
