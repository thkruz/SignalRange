import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 15 - "Frequency Coordination": Inter-Operator Spectrum Etiquette.
 *
 * Qualified-operator coordination work. A partner teleport (RedSky) is about to
 * light up a V-pol carrier 2 MHz off our active SeaLink TIDEMARK-3 H-pol edge.
 * The player verifies guard band, raises HPA back-off from 5 dB (the latent
 * defect) to 10 dB to suppress IMD into RedSky's slot, confirms the customer
 * carrier survives, then sends the coordination confirmation back.
 *
 * Only one physical action: HPA back-off change. Everything else is SYSTEM
 * status-checks plus tab/station navigation and one spectrum-analyzer retune.
 *
 * Objective types:
 * - 'quiz': Status-check quiz (Character.SYSTEM)
 * - 'select-station': Asset tree station selection (VT-01)
 * - 'click-tab': Tab navigation
 * - 'configure-speca': Spectrum analyzer reconfiguration
 * - 'configure-hpa-backoff': HPA back-off slider/input
 * - 'auto': Auto-satisfied by simulation state (no user action needed)
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'configure-speca'
  | 'configure-hpa-backoff'
  | 'auto';

interface Scenario15Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  hpaBackoff?: number;
  specaConfig?: {
    centerFrequency?: number; // MHz
    span?: number; // MHz
    minAmplitude?: number; // dBm
    maxAmplitude?: number; // dBm
    rbwAuto?: boolean;
  };
}

const SCENARIO_15_OBJECTIVES: Scenario15Objective[] = [
  // ============================================================
  // PHASE 1: MISSION PREP
  // ============================================================
  {
    id: 'review-mission-brief',
    title: 'Review Coordination Notice',
    type: 'quiz',
    correctAnswer: 'Brief reviewed. Notice acknowledged. Starting coordination check.',
  },
  {
    id: 'select-vermont-station',
    title: 'Open VT-01',
    type: 'select-station',
    stationId: 'VT-01',
  },

  // ============================================================
  // PHASE 2: PROCESS COORDINATION NOTICE
  // ============================================================
  {
    id: 'identify-partner-band',
    title: 'Identify RedSky Occupied Band',
    type: 'quiz',
    correctAnswer: '5957 - 5965 MHz',
  },
  {
    id: 'identify-our-band',
    title: 'Identify Our Occupied Band',
    type: 'quiz',
    correctAnswer: '5967 - 6003 MHz',
  },
  {
    id: 'compute-guard-band',
    title: 'Compute Guard Band',
    type: 'quiz',
    correctAnswer: '2 MHz',
  },
  {
    id: 'assess-guard-adequacy',
    title: 'Assess Guard Band Adequacy',
    type: 'quiz',
    correctAnswer:
      "Verify our TX chain is producing clean spectrum - no spurs or IMD landing in RedSky's band",
  },

  // ============================================================
  // PHASE 3: INSPECT TX CONFIGURATION
  // ============================================================
  {
    id: 'open-tx-chain',
    title: 'Open TX Chain',
    type: 'click-tab',
    tabId: 'tx-chain',
  },
  {
    id: 'check-tx-modem-frequency',
    title: 'Verify TX Modem Configuration',
    type: 'quiz',
    correctAnswer: 'Yes - 1015 MHz IF matches 7000 minus 5985, carrier on the right slot',
  },
  {
    id: 'observe-current-hpa-backoff',
    title: 'Observe HPA Backoff',
    type: 'quiz',
    correctAnswer:
      'Operating close to saturation - third-order IMD products will be elevated and extend several MHz beyond the carrier edges',
  },
  {
    id: 'understand-imd-mechanism',
    title: 'Understand IMD Mechanism',
    type: 'quiz',
    correctAnswer:
      'Nonlinearity in the amplifier mixes spectral components, generating intermodulation products that fall just outside the carrier edges',
  },

  // ============================================================
  // PHASE 4: MITIGATION DECISION
  // ============================================================
  {
    id: 'evaluate-mitigation-options',
    title: 'Choose Mitigation',
    type: 'quiz',
    correctAnswer:
      'Increase HPA backoff to 10 dB - reduces IMD without dropping the carrier and without requiring customer coordination',
  },

  // ============================================================
  // PHASE 5: APPLY MITIGATION
  // ============================================================
  {
    id: 'increase-hpa-backoff',
    title: 'Increase HPA Backoff to 10 dB',
    type: 'configure-hpa-backoff',
    hpaBackoff: 10,
  },
  {
    id: 'verify-hpa-still-online',
    title: 'Verify HPA Still Online',
    type: 'auto',
  },

  // ============================================================
  // PHASE 6: VERIFY ON SPECTRUM
  // ============================================================
  {
    id: 'open-rx-analysis',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'tune-speca-to-downlink',
    title: 'Tune Spectrum to TIDEMARK-3 Downlink',
    type: 'configure-speca',
    specaConfig: {
      centerFrequency: 1490,
      span: 75,
      minAmplitude: -100,
      maxAmplitude: -30,
      rbwAuto: true,
    },
  },
  {
    id: 'confirm-carrier-still-nominal',
    title: 'Confirm Carrier Still Nominal',
    type: 'quiz',
    correctAnswer:
      'Wideband carrier still present at slightly reduced power - customer link healthy, IMD skirts dropped well below the adjacent slot noise floor',
  },
  {
    id: 'verify-receiver-locked',
    title: 'Verify Receiver Locked',
    type: 'auto',
  },

  // ============================================================
  // PHASE 7: COORDINATE BACK
  // ============================================================
  {
    id: 'confirm-spectrum-clean-for-partner',
    title: 'Draft Confirmation to RedSky',
    type: 'quiz',
    correctAnswer:
      'Confirmed clear. TIDEMARK-3 TP-1 carrier holds 5967-6003 MHz H-pol with adjacent-channel emissions well below your planned slot. Proceed with your 5961 MHz V-pol uplink as scheduled.',
  },

  // ============================================================
  // PHASE 8: LOG
  // ============================================================
  {
    id: 'log-coordination-event',
    title: 'Log Coordination Event',
    type: 'quiz',
    correctAnswer:
      '0937 - RedSky coordination notice received and confirmed. TIDEMARK-3 TP-1 HPA backoff raised from 5 to 10 dB to suppress adjacent-channel IMD. Cleared RedSky for 5961 MHz V-pol uplink. SeaLink carrier remains nominal.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Configure spectrum analyzer settings.
 * Element IDs: #sa-center-freq, #sa-span, #sa-min-amp, #sa-max-amp, #sa-rbw
 */
async function configureSpectrumAnalyzer(
  page: import('@playwright/test').Page,
  config: NonNullable<Scenario15Objective['specaConfig']>
): Promise<void> {
  if (config.centerFrequency !== undefined) {
    const centerInput = page.locator('#sa-center-freq');
    await expect(centerInput).toBeVisible({ timeout: 5000 });
    await centerInput.fill(config.centerFrequency.toString());
    await centerInput.press('Tab');
    await page.waitForTimeout(100);
  }

  if (config.span !== undefined) {
    const spanInput = page.locator('#sa-span');
    await expect(spanInput).toBeVisible({ timeout: 5000 });
    await spanInput.fill(config.span.toString());
    await spanInput.press('Tab');
    await page.waitForTimeout(100);
  }

  if (config.minAmplitude !== undefined) {
    const minInput = page.locator('#sa-min-amp');
    if ((await minInput.count()) > 0 && (await minInput.isVisible())) {
      await minInput.fill(config.minAmplitude.toString());
      await minInput.press('Tab');
      await page.waitForTimeout(100);
    }
  }

  if (config.maxAmplitude !== undefined) {
    const maxInput = page.locator('#sa-max-amp');
    if ((await maxInput.count()) > 0 && (await maxInput.isVisible())) {
      await maxInput.fill(config.maxAmplitude.toString());
      await maxInput.press('Tab');
      await page.waitForTimeout(100);
    }
  }

  if (config.rbwAuto) {
    const rbwSelect = page.locator('#sa-rbw');
    await expect(rbwSelect).toBeVisible({ timeout: 5000 });
    await rbwSelect.selectOption({ label: 'Auto' });
    await page.waitForTimeout(100);
  }

  await page.waitForTimeout(300);
}

/**
 * Configure HPA back-off via input + Apply button.
 */
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
  await page.waitForTimeout(300);
}

/**
 * Execute an objective based on its type.
 */
async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario15Objective
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

    case 'configure-speca':
      await configureSpectrumAnalyzer(page, objective.specaConfig!);
      break;

    case 'configure-hpa-backoff':
      await configureHpaBackoff(page, objective.hpaBackoff!);
      break;

    case 'auto':
      // verify-hpa-still-online and verify-receiver-locked are both pure
      // state checks - HPA stayed enabled while we changed back-off, modem
      // never stopped transmitting, receiver was locked at scenario start.
      // Give the engine a beat to tick the conditions.
      await page.waitForTimeout(2000);
      break;
  }

  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 15 Full Completion', () => {
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

    // Navigate directly (bypasses prerequisite check on S14)
    await missionControlPage.gotoScenario('nats', 'nats-scenario15');
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

  // Generate a test per objective in order
  for (const objective of SCENARIO_15_OBJECTIVES) {
    test(`[${objective.id}] ${objective.title}`, async () => {
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
