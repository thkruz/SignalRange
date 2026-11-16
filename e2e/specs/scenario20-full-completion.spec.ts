import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 20 - "Dual Outage": Concurrent Site Loss, Prioritized Recovery.
 *
 * VT-01 ices under a severe winter storm (heater inherited OFF) while ME-02's
 * HPA sits overdriven at 1 dB back-off with a thermal alarm. The spec flies
 * the taught triage order: read VT -> heater ON -> read ME -> disable HPA ->
 * restore back-off -> re-enable -> sweep the ME spectrum -> verify VT melt ->
 * sweep the VT spectrum -> customer comms + adversarial rule-out + log.
 */
type ObjectiveType = 'quiz' | 'select-station' | 'click-tab' | 'toggle-switch' | 'configure-hpa-backoff' | 'configure-speca' | 'wait-ice-melt' | 'auto';

interface Scenario20Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  switchId?: string;
  switchState?: boolean;
  hpaBackoff?: number;
  centerFrequencyMhz?: number;
  spanMhz?: number;
  autoWaitSeconds?: number;
}

const SCENARIO_20_OBJECTIVES: Scenario20Objective[] = [
  {
    id: 'review-mission-brief',
    title: 'Review the Incident Brief',
    type: 'quiz',
    correctAnswer: 'Read both boards before fixing either, because the order depends on the whole picture',
  },

  // PHASE 1: VERMONT - START THE SLOW RECOVERY
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    // Precipitation and ice read on ACU Control (nats-s20-F3)
    id: 'vt-read-board-tab',
    title: 'Open ACU Control',
    type: 'click-tab',
    tabId: 'acu-control',
  },
  {
    id: 'vt-read-board',
    title: 'Read the Vermont Board',
    type: 'quiz',
    correctAnswer: 'The feed heater is off, and it should have been running before the front arrived',
  },
  {
    id: 'vt-enable-heater',
    title: 'Start the Slow Recovery',
    type: 'toggle-switch',
    switchId: 'heater-switch',
    switchState: true,
  },

  // PHASE 2: MAINE - KILL THE DANGEROUS FAULT
  {
    id: 'select-maine-station',
    title: 'Open ME-02',
    type: 'select-station',
    stationId: 'ME-02',
  },
  {
    id: 'me-read-board-tab',
    title: 'Open Dashboard',
    type: 'click-tab',
    tabId: 'dashboard',
  },
  {
    id: 'me-read-board',
    title: 'Read the Maine Board',
    type: 'quiz',
    correctAnswer: 'One fault: 1 dB back-off pushes the HPA near saturation, raising IMD (overdrive) and heat dissipation (thermal)',
  },
  {
    id: 'coincidence-quiz',
    title: 'Coincidence or Attack?',
    type: 'quiz',
    correctAnswer: 'Hold it open and collect rule-out evidence as you work: independent causes at each site, no unexplained RF on either spectrum',
  },
  {
    id: 'triage-order-quiz',
    title: 'Defend the Order',
    type: 'quiz',
    correctAnswer: "VT's fix is one switch that runs unattended, while ME's fault is dangerous and needs your full attention",
  },
  {
    id: 'me-tx-tab',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'me-disable-hpa',
    title: 'Take the Dirty Uplink Down',
    type: 'toggle-switch',
    switchId: 'hpa-enable',
    switchState: false,
  },
  {
    id: 'me-restore-backoff',
    title: 'Restore the Back-off',
    type: 'configure-hpa-backoff',
    hpaBackoff: 10,
  },
  {
    id: 'me-reenable-hpa',
    title: 'Bring Maine Back Clean',
    type: 'toggle-switch',
    switchId: 'hpa-enable',
    switchState: true,
  },
  {
    id: 'me-verify-quiz',
    title: 'Confirm Both Symptoms Cleared',
    type: 'quiz',
    correctAnswer: 'It falls on its own, because output power dropped about 9 dB and the stage dissipates far less heat',
  },
  {
    id: 'me-spectrum-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'me-spectrum-check',
    title: 'Sweep the Maine Spectrum',
    type: 'configure-speca',
    centerFrequencyMhz: 1458,
    spanMhz: 50,
  },

  // PHASE 3: VERIFY VERMONT
  {
    id: 'return-to-vermont',
    title: 'Back to Vermont',
    type: 'select-station',
    stationId: 'VT-01',
  },
  {
    id: 'vt-verify-recovery',
    title: 'Verify the Melt',
    type: 'wait-ice-melt',
  },
  {
    id: 'vt-spectrum-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'vt-spectrum-check',
    title: 'Sweep the Vermont Spectrum',
    type: 'configure-speca',
    centerFrequencyMhz: 1532,
    spanMhz: 50,
  },
  {
    id: 'spectra-read-quiz',
    title: 'What the Spectra Showed',
    type: 'quiz',
    correctAnswer: 'One carrier at each site where the plan puts it (1458 at ME-02, 1532 at VT-01), and nothing else in either passband',
  },
  {
    id: 'storm-steady-state-quiz',
    title: 'Steady State in the Storm',
    type: 'quiz',
    correctAnswer: 'Nothing new: the heater holds ice off as fast as it forms, so leave it on and check margin until the front clears',
  },

  // PHASE 4: CUSTOMER, EVIDENCE, LOG
  {
    id: 'james-comms-quiz',
    title: 'Call James Back',
    type: 'quiz',
    correctAnswer: "Both trunks are up. Vermont was storm icing (heater on), Maine was an amplifier config fault (fixed). It was coincidence, and here's why",
  },
  {
    id: 'adversarial-ruleout-quiz',
    title: 'Close the Question Cleanly',
    type: 'quiz',
    correctAnswer: 'VT tracked the storm (radar and precipitation agree, heater fixed it), ME was a config value with a mundane history, both spectra clean',
  },
  {
    id: 'log-dual-outage',
    title: 'Log the Dual Recovery',
    type: 'quiz',
    correctAnswer:
      'Dual degradation 0712: VT-01 icing (heater on, melted) | ME-02 HPA back-off 1 dB (10 dB restored); causes independent; process fix: heater on shift-change checklist',
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
  // Let the adapter's throttled DOM sync settle before reading
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

async function configureHpaBackoff(page: import('@playwright/test').Page, backoff: number): Promise<void> {
  const backoffInput = page.locator('#hpa-backoff');
  await expect(backoffInput).toBeVisible({ timeout: 5000 });
  await backoffInput.fill(backoff.toString());
  await backoffInput.press('Tab');
  await page.waitForTimeout(150);

  const applyBtn = page.locator('#hpa-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
  await page.waitForTimeout(400);
}

/** Centre the analyzer and set its span; analyzer rows tick on the next frame (Phase 29 D7, no dwell). */
async function configureSpeca(page: import('@playwright/test').Page, centerFrequencyMhz: number, spanMhz: number): Promise<void> {
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(centerFrequencyMhz.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(300);
  const spanInput = page.locator('#sa-span');
  await spanInput.fill(spanMhz.toString());
  await spanInput.press('Tab');
  await page.waitForTimeout(1500);
}

/** Wait for VT-01's feed ice to melt below the objective threshold. */
async function waitForIceMelt(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        signalRange?: {
          simulationManager?: {
            groundStations?: Array<{
              state?: { id?: string };
              antennas?: Array<{ state?: { iceAccumulation_dB?: number } }>;
            }>;
          };
        };
      };
      const gs = w.signalRange?.simulationManager?.groundStations?.find((g) => g.state?.id === 'VT-01');
      const ice = gs?.antennas?.[0]?.state?.iceAccumulation_dB ?? 99;
      return ice < 2;
    },
    undefined,
    { timeout: 420000 }
  );
  // Give the objectives manager a beat to evaluate the custom condition
  await page.waitForTimeout(2500);
}

async function executeObjective(page: import('@playwright/test').Page, missionControlPage: MissionControlPage, objective: Scenario20Objective): Promise<void> {
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

    case 'toggle-switch':
      await toggleSwitch(page, objective.switchId!, objective.switchState!);
      break;

    case 'configure-hpa-backoff':
      await configureHpaBackoff(page, objective.hpaBackoff!);
      break;

    case 'configure-speca':
      await configureSpeca(page, objective.centerFrequencyMhz!, objective.spanMhz!);
      break;

    case 'wait-ice-melt':
      await waitForIceMelt(page);
      // Phase 27: then C/N >= 10 dB held 10 s before the objective completes.
      // C/N reads ~10-11 dB (±1 dB jitter) at 1 dB of ice and 12-13 dB once the
      // heater clears the last of it, about a minute after the 2 dB mark, so the
      // hold may restart a few times first
      await page.waitForFunction(
        (id) => {
          const hook = (window as unknown as { debugObjective?: (id: string) => { isCompleted?: boolean } }).debugObjective;
          return typeof hook === 'function' && hook(id)?.isCompleted === true;
        },
        objective.id,
        { timeout: 180000, polling: 500 }
      );
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

test.describe('Scenario 20 Full Completion', () => {
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

    await missionControlPage.gotoScenario('nats', 'nats-scenario20');
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

  for (const objective of SCENARIO_20_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
      // The melt wait runs on the weather clock
      if (objective.type === 'wait-ice-melt') {
        test.setTimeout(660000);
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
