import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 16 - "Cascade Failure": Multi-System Recovery Under Customer Pressure.
 *
 * Phase 2 capstone. Three concurrent unrelated faults on VT-01:
 *  - BUC over-temperature (>70°C) with high current draw
 *  - LNB sticky reference-lock fault (clears on power cycle)
 *  - HPA back-off drifted to 2 dB (overdriven)
 *
 * Recovery order tested: triage → disable HPA output → mute BUC → restore HPA
 * back-off → wait for BUC thermal recovery → power-cycle LNB → restore receiver →
 * unmute BUC → re-enable HPA → verify clean TX → final sweep → customer
 * notification → log entry.
 *
 * RF safety rule (rf-front-end-core): an enabled HPA with the BUC muted/off
 * fails the mission instantly. HPA must come down before the BUC mute and go
 * back up only after the BUC is unmuted.
 *
 * Objective types:
 *  - 'quiz': Status-check quiz (Character.SYSTEM)
 *  - 'select-station': Asset tree station selection
 *  - 'click-tab': Tab navigation
 *  - 'toggle-switch': Boolean equipment switch (mute, power, enable)
 *  - 'configure-hpa-backoff': Set HPA back-off via input + Apply
 *  - 'lnb-power-cycle': OFF, wait, ON sequence
 *  - 'auto': Auto-satisfied by simulation state (waiting for thermal recovery)
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'toggle-switch'
  | 'configure-hpa-backoff'
  | 'lnb-power-cycle'
  | 'auto';

interface Scenario16Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  switchId?: string;
  switchState?: boolean;
  hpaBackoff?: number;
  /** For auto/cooling waits: max seconds to wait for the condition (default 90) */
  waitForSeconds?: number;
}

const SCENARIO_16_OBJECTIVES: Scenario16Objective[] = [
  // ============================================================
  // MISSION PREPARATION
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Incident Brief',
    type: 'quiz',
    correctAnswer:
      'Triage all alarms first, then act in priority order: RF safety, customer impact, equipment health',
  },

  // ============================================================
  // PHASE 1: TRIAGE AND PRIORITIZATION
  // ============================================================
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'triage-dashboard-alarms-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'triage-dashboard-alarms',
    title: 'Triage the Alarm Board',
    type: 'quiz',
    correctAnswer:
      'BUC over-temperature and high current, LNB reference unlocked, HPA overdriven',
  },
  {
    id: 'prioritize-recovery-order',
    title: 'Set the Recovery Order',
    type: 'quiz',
    correctAnswer:
      'RF safety first (HPA overdrive + BUC) → customer impact next (LNB / RX) → final verification',
  },

  // ============================================================
  // PHASE 2: RF SAFETY - DISABLE HPA, MUTE BUC, RESTORE BACK-OFF
  // ============================================================
  {
    id: 'navigate-tx-chain',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'disable-hpa-for-safety-toggle',
    title: 'Disable the HPA Output',
    type: 'toggle-switch',
    switchId: 'hpa-enable',
    switchState: false,
  },
  {
    id: 'disable-hpa-for-safety',
    title: 'Disable the HPA - Confirm Rationale',
    type: 'quiz',
    correctAnswer:
      'It takes the dirty uplink off the air immediately, and an enabled HPA must never be left without BUC drive - it would amplify raw noise into the feed',
  },
  {
    id: 'mute-buc-for-cooldown',
    title: 'Mute the BUC for Cooldown',
    type: 'toggle-switch',
    switchId: 'buc-mute',
    switchState: true,
  },
  {
    id: 'diagnose-hpa-overdrive',
    title: 'Diagnose HPA Overdrive',
    type: 'quiz',
    correctAnswer:
      'Output is too close to saturation - IMD products are rising and the amplifier is at risk',
  },
  {
    id: 'correct-hpa-backoff',
    title: 'Restore HPA Back-off to 10 dB',
    type: 'configure-hpa-backoff',
    hpaBackoff: 10,
  },

  // ============================================================
  // PHASE 3: BUC THERMAL RECOVERY (wait for cooldown)
  // ============================================================
  {
    id: 'wait-for-buc-cooling',
    title: 'Allow BUC to Cool',
    type: 'auto',
    // Muted BUC cools toward ambient at ~0.14°C/s; 72°C -> <70°C in ~20 s.
    waitForSeconds: 45,
  },

  // ============================================================
  // PHASE 4: LNB RECOVERY
  // ============================================================
  {
    id: 'navigate-rx-analysis',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'diagnose-lnb-fault',
    title: 'Diagnose LNB Reference Unlock',
    type: 'quiz',
    correctAnswer: 'Power cycle the LNB to clear the sticky reference lock fault',
  },
  {
    id: 'power-cycle-lnb',
    title: 'Power Cycle the LNB',
    type: 'lnb-power-cycle',
  },

  // verify-rx-locked is auto-satisfied once LNB stabilizes after power cycle
  {
    id: 'verify-rx-locked',
    title: 'Verify Receiver Locked',
    type: 'auto',
    waitForSeconds: 15,
  },

  // ============================================================
  // PHASE 5: TX RESTORATION
  // ============================================================
  {
    id: 'return-to-tx-chain',
    title: 'Return to TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'unmute-buc-restore-tx',
    title: 'Unmute the BUC',
    type: 'toggle-switch',
    switchId: 'buc-mute',
    switchState: false,
  },
  {
    id: 'restore-hpa-output-toggle',
    title: 'Re-enable HPA Output',
    type: 'toggle-switch',
    switchId: 'hpa-enable',
    switchState: true,
  },
  {
    id: 'verify-tx-output-clean',
    title: 'Restore HPA Output - Confirm Spectrum Posture',
    type: 'quiz',
    correctAnswer:
      'Clean - IMD products are back below coordination limits and we are no longer interfering',
  },

  // ============================================================
  // PHASE 6: VERIFICATION AND CLOSE-OUT
  // ============================================================
  {
    id: 'final-alarm-sweep-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'final-alarm-sweep',
    title: 'Final Dashboard Sweep',
    type: 'quiz',
    correctAnswer:
      'All three faults cleared - BUC thermal normal, LNB locked, HPA within back-off - link operational',
  },
  {
    id: 'customer-notification',
    title: 'Notify the Customer',
    type: 'quiz',
    correctAnswer:
      'Three concurrent faults identified and cleared in priority order. Link is operational. Will follow up with a written impact report within the hour.',
  },
  {
    id: 'log-cascade-event',
    title: 'Log the Cascade Event',
    type: 'quiz',
    correctAnswer:
      'Concurrent unrelated faults VT-01: BUC over-temp (72°C, high I), LNB ref unlock (sticky), HPA back-off drift (2 dB). Recovery in order: HPA output disabled, BUC muted for cooldown, back-off restored to 10 dB, LNB power cycled, BUC unmuted, HPA restored. Customer (SeaLink) notified.',
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
  const switchEl = page.locator(`#${switchId}`);
  await expect(switchEl).toBeVisible({ timeout: 5000 });
  // Adapters sync DOM to sim state on a ~1 s throttle; the static template may
  // render a stale checked state right after the tab mounts. Let the first
  // sync land before reading.
  await page.waitForTimeout(1200);
  const isChecked = await switchEl.isChecked();
  if (isChecked !== desiredState) {
    await switchEl.click();
    if (desiredState) {
      await expect(switchEl).toBeChecked();
    } else {
      await expect(switchEl).not.toBeChecked();
    }
  }
  await page.waitForTimeout(300);
}

async function configureHpaBackoff(
  page: import('@playwright/test').Page,
  backoff: number
): Promise<void> {
  const backoffInput = page.locator('#hpa-backoff');
  await expect(backoffInput).toBeVisible({ timeout: 5000 });
  await backoffInput.fill(backoff.toString());
  await backoffInput.press('Tab');
  await page.waitForTimeout(100);

  const applyBtn = page.locator('#hpa-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
  await page.waitForTimeout(500);
}

async function powerCycleLnb(page: import('@playwright/test').Page): Promise<void> {
  const powerSwitch = page.locator('#lnb-power');
  await expect(powerSwitch).toBeVisible({ timeout: 5000 });

  // Power OFF
  if (await powerSwitch.isChecked()) {
    await powerSwitch.click();
    await expect(powerSwitch).not.toBeChecked();
  }
  await page.waitForTimeout(1500);

  // Power ON
  await powerSwitch.click();
  await expect(powerSwitch).toBeChecked();

  // Wait for thermal stabilization + reference re-acquire
  await page.waitForTimeout(5000);
}

async function closeQuizModalIfPresent(page: import('@playwright/test').Page): Promise<void> {
  const quizModal = page.locator('#quiz-modal, .quiz-box');
  try {
    if (await quizModal.isVisible({ timeout: 500 })) {
      const closeBtn = quizModal
        .locator('.draggable-box__close-btn, [class*="close"], button:has-text("×")')
        .first();
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(400);
      }
    }
  } catch {
    // No quiz modal, continue
  }
}

async function openPendingQuiz(page: import('@playwright/test').Page): Promise<void> {
  const pendingIndicatorBtn = page.locator('.pending-quiz-indicator__open-btn');
  const quizModalDirect = page.locator('#quiz-modal, .quiz-box');

  await page.waitForTimeout(1500);

  let isQuizOpen = await quizModalDirect.isVisible().catch(() => false);
  let attempts = 0;
  while (!isQuizOpen && attempts < 15) {
    attempts++;
    try {
      await expect(pendingIndicatorBtn).toBeVisible({ timeout: 8000 });
      await pendingIndicatorBtn.evaluate((btn) => (btn as HTMLButtonElement).click());
      await page.waitForTimeout(500);
      isQuizOpen = await quizModalDirect.isVisible().catch(() => false);

      if (!isQuizOpen && attempts > 3) {
        await page.evaluate(() => {
          const qm = (
            window as unknown as { __quizManager__?: { reopenPendingQuiz: () => void } }
          ).__quizManager__;
          if (qm) {
            qm.reopenPendingQuiz();
          }
        });
        await page.waitForTimeout(500);
        isQuizOpen = await quizModalDirect.isVisible().catch(() => false);
      }
    } catch {
      await page.waitForTimeout(1000);
    }
  }

  await expect(quizModalDirect).toBeVisible({ timeout: 10000 });
}

async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario16Objective
): Promise<void> {
  if (objective.type !== 'quiz') {
    await closeQuizModalIfPresent(page);
  }

  switch (objective.type) {
    case 'quiz':
      await openPendingQuiz(page);
      await answerQuizByText(page, objective.correctAnswer!);
      await page.waitForTimeout(1000);
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

    case 'configure-hpa-backoff':
      await configureHpaBackoff(page, objective.hpaBackoff!);
      break;

    case 'lnb-power-cycle':
      await powerCycleLnb(page);
      break;

    case 'auto':
      // Wait for simulation-driven condition (e.g. BUC thermal recovery)
      await page.waitForTimeout((objective.waitForSeconds ?? 90) * 1000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 16 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: import('@playwright/test').Page;
  let missionControlPage: MissionControlPage;
  let context: import('@playwright/test').BrowserContext;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      (window as unknown as { DEVELOPER_MODE: boolean }).DEVELOPER_MODE = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControlPage = new MissionControlPage(page);

    // Direct navigation - bypasses prerequisite check on S15 (not yet built)
    await missionControlPage.gotoScenario('nats', 'nats-scenario16');
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

  for (const objective of SCENARIO_16_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // Thermal cooldown can take several minutes of sim time
      if (objective.type === 'auto' && (objective.waitForSeconds ?? 0) > 60) {
        test.setTimeout((objective.waitForSeconds! + 60) * 1000);
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
