import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerQuizByText,
  dismissDialogIfPresent,
  waitForQuizToAppear,
  waitForSimulationReady,
} from '../utils/simulation-helpers';

/**
 * Scenario 21 - "Hostile RF": Suspected Intentional Interference.
 *
 * A duty-cycled jammer (InterferenceManager) is injected at the TM-2
 * transponder and relayed to ME-02. The operator characterizes the signature,
 * discriminates jamming from accident, verifies the data layer is intact
 * (RF denial, not intrusion), applies a notch filter, confirms the carrier
 * survives, and builds the regulator package.
 *
 * The intermittent jammer provides the authentic signature for the player;
 * objective completion hinges on the discrimination quizzes, the data-layer
 * crypto checks (ACTIVE/Valid by default), the notch filter, and a
 * post-notch receiver-lock check (the carrier is ~15 dB above the jammer).
 */
type ObjectiveType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'configure-speca'
  | 'configure-notch'
  | 'auto';

interface Scenario21Objective {
  id: string;
  title: string;
  type: ObjectiveType;
  correctAnswer?: string;
  tabId?: string;
  stationId?: string;
  specaConfig?: { centerFrequencyMhz: number; spanMhz: number };
  notchConfig?: { centerFrequency: number; bandwidth: number; depth: number; notchIndex: number };
  autoWaitSeconds?: number;
}

const SCENARIO_21_OBJECTIVES: Scenario21Objective[] = [
  {
    id: 'review-mission-brief',
    title: 'Review the Interference Flag',
    type: 'quiz',
    correctAnswer:
      'As an interference incident: characterize, discriminate, mitigate, document - and verify the data layer separately. The same evidence resolves an accident or builds the case for deliberate interference',
  },
  {
    id: 'select-maine-station',
    title: 'Open ME-02',
    type: 'select-station',
    stationId: 'ME-02',
  },

  // PHASE 1: CHARACTERIZE
  {
    id: 'open-spectrum-tab',
    title: 'Open RX Analysis',
    type: 'click-tab',
    tabId: 'rx-analysis',
  },
  {
    id: 'open-spectrum',
    title: 'Observe the Interference',
    type: 'configure-speca',
    specaConfig: { centerFrequencyMhz: 1458, spanMhz: 40 },
  },
  {
    id: 'duty-cycle-quiz',
    title: 'Characterize the Duty Cycle',
    type: 'quiz',
    correctAnswer:
      'Against accident, toward deliberation: natural and accidental sources are continuous or random; a clean repeating on/off cadence on the scale of a minute implies a hand on a switch or an automated transmitter, not weather or a stuck oscillator',
  },
  {
    id: 'transponder-vs-local-quiz',
    title: 'Transponder or Local?',
    type: 'quiz',
    correctAnswer:
      'It is in the UPLINK - the satellite is relaying it to every receiving station, so the source is transmitting at the bird, not a local terrestrial source at Maine. That rules out radar/5G/our own equipment and points at a misaligned or deliberate uplink',
  },
  {
    id: 'signature-shape-quiz',
    title: 'Signature vs the Database',
    type: 'quiz',
    correctAnswer:
      'It matches nothing in the coordination database: cross-pol leakage would mirror a known neighbor\'s carrier, an errant uplink would look like a modulated carrier at a coordinated slot - broadband noise shaped to our carrier inside our passband fits neither',
  },

  // PHASE 2: DENIAL VS INTRUSION
  {
    id: 'denial-vs-intrusion-quiz',
    title: 'Denial or Intrusion?',
    type: 'quiz',
    correctAnswer:
      'It is a DENIAL attack on the RF layer - it degrades or blocks the signal but does not touch the data, crypto, or keys. The distinction matters because an intrusion (data-layer compromise) has a different escalation path and you must verify which you are facing',
  },
  {
    id: 'verify-data-layer',
    title: 'Verify the Data Layer',
    type: 'auto',
    autoWaitSeconds: 4,
  },
  {
    id: 'data-layer-meaning-quiz',
    title: 'What Intact Crypto Proves',
    type: 'quiz',
    correctAnswer:
      'Confirms RF-layer denial only: the link is being degraded, not breached. If crypto state changed or keys went invalid/mismatched mid-incident, it would become a security incident with a different escalation (Dana then security officer; nothing holding keys gets power-cycled)',
  },

  // PHASE 3: MITIGATION
  {
    id: 'mitigation-choice-quiz',
    title: 'Choose Mitigation',
    type: 'quiz',
    correctAnswer:
      'Notch filter on the interferer band - excise its energy at the cost of a little SNR in that slice; reversible, customer-preserving, and it does nothing to neighbors',
  },
  {
    id: 'configure-notch',
    title: 'Apply the Notch Filter',
    type: 'configure-notch',
    notchConfig: { centerFrequency: 1470, bandwidth: 8, depth: 30, notchIndex: 0 },
  },
  {
    id: 'verify-carrier-survives',
    title: 'Confirm the Customer Survives',
    type: 'auto',
    autoWaitSeconds: 5,
  },
  {
    id: 'no-burn-through-quiz',
    title: 'Why Not Fight Back',
    type: 'quiz',
    correctAnswer:
      'You cannot out-shout an uplink jammer from the ground without violating coordination and degrading every neighbor on the transponder - a power war escalates the incident, harms bystanders, and still loses. Receive-side mitigation plus regulatory action is the path',
  },

  // PHASE 4: COORDINATE AND REPORT
  {
    id: 'regulator-package-quiz',
    title: 'Build the Regulator Package',
    type: 'quiz',
    correctAnswer:
      'Victim (satellite/transponder/pol/center freq/BW), interferer (center freq, BW, measured duty cycle, first/last seen), spectrum captures at documented settings, cross-station confirmation (transponder vs local), service impact, and mitigation applied - all timestamped',
  },
  {
    id: 'attribution-restraint-quiz',
    title: 'Conclude Carefully',
    type: 'quiz',
    correctAnswer:
      '"Signature consistent with deliberate uplink interference" - a confidence-bounded characterization backed by the evidence; attribution and intent are for the regulator to determine, not the ground operator to assert',
  },
  {
    id: 'log-incident',
    title: 'Log the Incident',
    type: 'quiz',
    correctAnswer:
      'TM-2 TP-1 interference: broadband noise ~1470 MHz IF, ~90s/60s duty cycle, confirmed uplink (seen VT-01 + Halifax). Data layer intact (crypto ACTIVE, keys Valid) - RF denial, not intrusion. Notch applied, carrier holding. Signature consistent with deliberate interference - regulator package filed. Monitoring; escalate on any data-layer change.',
  },
];

// ============================================================
// Helper Functions
// ============================================================

async function configureSpeca(
  page: import('@playwright/test').Page,
  config: { centerFrequencyMhz: number; spanMhz: number }
): Promise<void> {
  const centerFreqInput = page.locator('#sa-center-freq');
  await expect(centerFreqInput).toBeVisible({ timeout: 5000 });
  await centerFreqInput.fill(config.centerFrequencyMhz.toString());
  await centerFreqInput.press('Tab');
  await page.waitForTimeout(150);

  const spanInput = page.locator('#sa-span');
  if (await spanInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await spanInput.fill(config.spanMhz.toString());
    await spanInput.press('Tab');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
}

async function configureNotchFilter(
  page: import('@playwright/test').Page,
  config: { centerFrequency: number; bandwidth: number; depth: number; notchIndex: number }
): Promise<void> {
  const prefix = `notch-${config.notchIndex}`;

  const powerSwitch = page.locator('#notch-power');
  await expect(powerSwitch).toBeVisible({ timeout: 5000 });
  if (!(await powerSwitch.isChecked())) {
    await powerSwitch.click();
    await expect(powerSwitch).toBeChecked();
    await page.waitForTimeout(300);
  }

  const enableSwitch = page.locator(`#${prefix}-enabled`);
  await expect(enableSwitch).toBeVisible();
  if (!(await enableSwitch.isChecked())) {
    await enableSwitch.click();
    await expect(enableSwitch).toBeChecked();
    await page.waitForTimeout(200);
  }

  const freqInput = page.locator(`#${prefix}-freq`);
  await expect(freqInput).toBeVisible();
  await freqInput.fill(config.centerFrequency.toString());
  await freqInput.press('Tab');
  await page.waitForTimeout(100);

  const bwInput = page.locator(`#${prefix}-bw`);
  await expect(bwInput).toBeVisible();
  await bwInput.fill(config.bandwidth.toString());
  await bwInput.press('Tab');
  await page.waitForTimeout(100);

  const depthInput = page.locator(`#${prefix}-depth`);
  await expect(depthInput).toBeVisible();
  await depthInput.fill(config.depth.toString());
  await depthInput.press('Tab');
  await page.waitForTimeout(100);

  // Apply if there's an apply button
  const applyBtn = page.locator('#notch-apply-btn');
  if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await applyBtn.click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
}

async function executeObjective(
  page: import('@playwright/test').Page,
  missionControlPage: MissionControlPage,
  objective: Scenario21Objective
): Promise<void> {
  switch (objective.type) {
    case 'quiz':
      await waitForQuizToAppear(page);
      await answerQuizByText(page, objective.correctAnswer!);
      break;

    case 'select-station':
      await missionControlPage.selectGroundStation(objective.stationId || 'ME-02');
      break;

    case 'click-tab':
      await missionControlPage.selectTab(objective.tabId!);
      break;

    case 'configure-speca':
      await configureSpeca(page, objective.specaConfig!);
      break;

    case 'configure-notch':
      await configureNotchFilter(page, objective.notchConfig!);
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

test.describe('Scenario 21 Full Completion', () => {
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

    await missionControlPage.gotoScenario('nats', 'nats-scenario21');
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

  for (const objective of SCENARIO_21_OBJECTIVES) {
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
