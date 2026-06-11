import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 23 - "Emergency Bypass": Manual Operations During Automation Failure.
 *
 * The ACU automation controller is faulted (isAcuAutomationFaulted) - program-track,
 * step-track, and move-to-target are disabled in the UI. The dish is parked on
 * TIDEMARK-1. The operator commits to MANUAL, proves pointing on the beacon
 * (the only trustworthy source), holds the link, and coordinates the repair.
 *
 * Spec also asserts the ACU-fault UI gating: program-track button disabled,
 * MANUAL button still usable.
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'set-manual-mode'
  | 'configure-speca'
  | 'verify-acu-gating'
  | 'auto';

interface Scenario23Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  centerFrequencyMhz?: number;
  autoWaitSeconds?: number;
}

const SCENARIO_23_OBJECTIVES: Scenario23Objective[] = [
  {
    id: 'review-mission-brief',
    title: 'Review the Fault',
    type: 'quiz',
    correctAnswer:
      'Broken: program-track, step-track, move-to-target, lock logic (the automation brain). Working: servos, manual mode, and the RF chain - the dish can still move, you just have to fly it',
  },
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },

  // PHASE 1: ASSESS
  {
    id: 'confirm-fault-dashboard-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'confirm-fault-dashboard',
    title: 'Confirm the Automation Fault',
    type: 'quiz',
    correctAnswer:
      'Current position (Az 161.8 / El 34.2 on TM-1) and that beacon + carrier are still locked - the dish is ON the bird; whatever you do next must not lose that',
  },
  {
    id: 'what-automation-did-quiz',
    title: 'What the Automation Was Doing',
    type: 'quiz',
    correctAnswer:
      'Compute the pointing solution (from the prediction sheet), drive the axes manually, and judge lock from the spectrum - the ACU lock indicator is part of the dead automation and cannot be trusted',
  },
  {
    id: 'no-reboot-quiz',
    title: 'Why Not Reboot It',
    type: 'quiz',
    correctAnswer:
      'A reboot can return with stale/defaulted axis calibration and destroys the crash state IT needs for root cause - bypass keeps the link up AND preserves the evidence; IT cycles it on their schedule',
  },

  // PHASE 2: COMMIT TO MANUAL (+ UI gating assertion)
  {
    id: 'switch-to-manual-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'verify-acu-gating',
    title: 'ACU gating: program-track disabled, manual usable',
    type: 'verify-acu-gating',
  },
  {
    id: 'switch-to-manual',
    title: 'Switch to Manual Control',
    type: 'set-manual-mode',
  },
  {
    id: 'manual-deliberate-quiz',
    title: 'Why Deliberate Manual',
    type: 'quiz',
    correctAnswer:
      'In program-track the panel implies an automation is flying the dish when none is - manual makes the truth explicit: YOU are the controller, the displays mean what they say, and there is no phantom loop to fight',
  },

  // PHASE 3: PROVE THE LINK
  {
    id: 'prove-beacon-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'prove-beacon',
    title: 'Prove Pointing on the Beacon',
    type: 'configure-speca',
    centerFrequencyMhz: 1074.5,
  },
  {
    id: 'prove-carrier',
    title: 'Prove the Carrier',
    type: 'auto',
    autoWaitSeconds: 5,
  },
  {
    id: 'instruments-not-feel-quiz',
    title: 'Fly Instruments, Not Feel',
    type: 'quiz',
    correctAnswer:
      'The beacon at 1074.5 MHz on the spectrum and receiver lock - the RF truth, independent of the dead ACU automation. Never the ACU lock indicator',
  },

  // PHASE 4: HOLD AND COORDINATE
  {
    id: 'sustained-manual-hold',
    title: 'Hold Under Manual Control',
    type: 'auto',
    autoWaitSeconds: 40,
  },
  {
    id: 'geo-feasibility-quiz',
    title: 'Why Manual Holds (This Time)',
    type: 'quiz',
    correctAnswer:
      'TIDEMARK-1 is a well-behaved GEO bird - it barely moves over hours, so a fixed manual point holds. It would NOT work for an inclined bird like AURORA-7, whose figure-8 needs the step-track this fault disabled',
  },
  {
    id: 'it-coordination-quiz',
    title: 'Coordinate the Repair',
    type: 'quiz',
    correctAnswer:
      'Confirm the link is stable on manual first, agree a window, expect to re-establish program-track and re-verify pointing AFTER recovery - and be ready to fall back to manual if the restart misbehaves',
  },
  {
    id: 'log-bypass',
    title: 'Log the Bypass',
    type: 'quiz',
    correctAnswer:
      'ACU automation fault 1358 (IT NOC-2026-2231). Bypassed to manual 1404 - TM-1 held on prediction-sheet pointing, beacon + carrier verified on spectrum (ACU lock indicator NOT trusted, driven by failed processor). Link nominal under manual. Controller NOT rebooted - crash state preserved for IT. Recovery to be re-verified on RF post-restart.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/** Select MANUAL via the tracking-mode button. */
async function setManualMode(page: import('@playwright/test').Page): Promise<void> {
  const manualBtn = page.locator('.btn-tracking[data-mode="manual"]');
  await expect(manualBtn).toBeVisible({ timeout: 5000 });
  await manualBtn.click();
  await page.waitForTimeout(500);
}

/** Assert the ACU-fault UI gating. */
async function verifyAcuGating(page: import('@playwright/test').Page): Promise<void> {
  const programBtn = page.locator('.btn-tracking[data-mode="program-track"]');
  await expect(programBtn).toBeVisible({ timeout: 5000 });
  // Let the throttled sync apply the disabled state
  await page.waitForTimeout(1500);
  await expect(programBtn).toBeDisabled();

  const manualBtn = page.locator('.btn-tracking[data-mode="manual"]');
  await expect(manualBtn).toBeEnabled();
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

async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario23Objective
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

    case 'set-manual-mode':
      await setManualMode(page);
      break;

    case 'verify-acu-gating':
      await verifyAcuGating(page);
      break;

    case 'configure-speca':
      await configureSpeca(page, objective.centerFrequencyMhz!);
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

test.describe('Scenario 23 Full Completion', () => {
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

    await missionControlPage.gotoScenario('nats', 'nats-scenario23');
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

  for (const objective of SCENARIO_23_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      if (objective.type === 'auto' && (objective.autoWaitSeconds ?? 0) >= 30) {
        test.setTimeout(120000);
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
