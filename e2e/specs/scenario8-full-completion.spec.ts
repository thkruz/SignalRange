import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 8 - "Night Shift": solo troubleshooting of an intermittent AURORA-7 link.
 *
 * Every objective is completed through the UI: LNB power cycle, step-track,
 * feed heater, Modem 1 off, Modem 2 configured and run through the BUC
 * loopback test, then the live uplink enabled.
 *
 * Step types:
 * - 'quiz': status-check quiz
 * - 'select-station': asset tree station selection
 * - 'click-tab': tab navigation plus the observation dwell
 * - 'lnb-power-cycle': LNB power off, then on
 * - 'set-tracking-mode': ACU tracking mode button
 * - 'toggle': a switch by element id (suffix match for per-instance ids)
 * - 'configure-speca': spectrum analyzer settings
 * - 'power-off-modem1' / 'select-modem2' / 'configure-modem2' / 'transmit-modem2': TX chain modem steps
 * - 'configure-buc-gain': BUC gain field plus Apply
 */
type StepType =
  | 'quiz'
  | 'select-station'
  | 'click-tab'
  | 'lnb-power-cycle'
  | 'set-tracking-mode'
  | 'toggle'
  | 'configure-speca'
  | 'power-off-modem1'
  | 'select-modem2'
  | 'configure-modem2'
  | 'transmit-modem2'
  | 'configure-buc-gain';

interface Scenario8Step {
  /** Objective id; also the debug hook key when waitForComplete is set */
  id: string;
  title: string;
  type: StepType;
  correctAnswer?: string;
  tabId?: string;
  /** Extra wait after a tab click for observation dwells longer than the default */
  dwellMs?: number;
  trackingMode?: string;
  switchId?: string;
  switchState?: boolean;
  bucGain?: number;
  specaConfig?: { centerFrequency: number; span: number; minAmplitude: number; maxAmplitude: number }; // MHz, MHz, dBm, dBm
  /** Stay on the step until the scenario engine reports the objective complete */
  waitForComplete?: boolean;
  completeTimeoutMs?: number;
}

const SCENARIO_8_STEPS: Scenario8Step[] = [
  // Phase 1: ticket, station, dashboard
  {
    id: 'review-mission-brief',
    title: 'Review Customer Trouble Ticket',
    type: 'quiz',
    correctAnswer: 'Troubleshoot step by step: timing, RX chain, antenna, then TX if needed',
  },
  { id: 'access-vermont-station', title: 'Access Ground Station', type: 'select-station', waitForComplete: true },
  { id: 'check-dashboard-alarms', title: 'Check Dashboard for Alarms (tab)', type: 'click-tab', tabId: 'dashboard' },
  { id: 'check-dashboard-alarms', title: 'Check Dashboard for Alarms (quiz)', type: 'quiz', correctAnswer: 'LNB Reference Unlocked' },

  // Phase 2: timing and LNB reference fault
  { id: 'verify-gpsdo-status', title: 'Verify GPSDO Status (tab)', type: 'click-tab', tabId: 'gps-timing' },
  {
    id: 'verify-gpsdo-status',
    title: 'Verify GPSDO Status (quiz)',
    type: 'quiz',
    correctAnswer: 'The 10 MHz reference is available - the problem is likely the cable or LNB input',
  },
  { id: 'diagnose-lnb-fault', title: 'Diagnose LNB Reference Fault (tab)', type: 'click-tab', tabId: 'rx-analysis' },
  {
    id: 'diagnose-lnb-fault',
    title: 'Diagnose LNB Reference Fault (quiz)',
    type: 'quiz',
    correctAnswer: 'Power cycle the LNB to re-acquire the external reference',
  },
  { id: 'resolve-lnb-fault', title: 'Resolve LNB Reference Fault', type: 'lnb-power-cycle', waitForComplete: true, completeTimeoutMs: 180000 },
  { id: 'verify-fault-cleared', title: 'Verify Fault Cleared', type: 'click-tab', tabId: 'dashboard', waitForComplete: true },

  // Phase 3: beacon on the spectrum analyzer
  { id: 'calculate-aurora7-beacon-if', title: 'Calculate AURORA-7 Beacon IF', type: 'quiz', correctAnswer: '1085 MHz' },
  { id: 'configure-speca-beacon', title: 'Configure Spectrum Analyzer for Beacon (tab)', type: 'click-tab', tabId: 'rx-analysis' },
  {
    id: 'configure-speca-beacon',
    title: 'Configure Spectrum Analyzer for Beacon',
    type: 'configure-speca',
    specaConfig: { centerFrequency: 1085, span: 0.01, minAmplitude: -120, maxAmplitude: -60 },
    waitForComplete: true,
  },

  // Phase 4: tracking
  { id: 'identify-tracking-problem', title: 'Identify Tracking Problem (tab)', type: 'click-tab', tabId: 'acu-control' },
  {
    id: 'identify-tracking-problem',
    title: 'Identify Tracking Problem (quiz)',
    type: 'quiz',
    correctAnswer: 'Inclined orbits require step-track to follow satellite drift - program-track cannot compensate',
  },
  { id: 'enable-step-track', title: 'Enable Step-Track Mode', type: 'set-tracking-mode', trackingMode: 'step-track', waitForComplete: true },
  {
    id: 'verify-beacon-lock',
    title: 'Verify Beacon Acquisition',
    type: 'click-tab',
    tabId: 'rx-analysis',
    dwellMs: 12000,
    waitForComplete: true,
    completeTimeoutMs: 180000,
  },

  // Phase 5: weather
  {
    id: 'weather-alert-decision',
    title: 'Weather Alert Assessment',
    type: 'quiz',
    correctAnswer: 'Enable the feed heater now as a precaution and keep monitoring the link',
  },
  { id: 'enable-feed-heater', title: 'Enable Feed Heater (tab)', type: 'click-tab', tabId: 'acu-control' },
  { id: 'enable-feed-heater', title: 'Enable Feed Heater', type: 'toggle', switchId: 'heater-switch', switchState: true, waitForComplete: true },

  // Phase 6: confirm RX path and find the TX fault
  { id: 'verify-acu-tracking-stable', title: 'Verify Antenna Tracking Stable (tab)', type: 'click-tab', tabId: 'acu-control' },
  {
    id: 'verify-acu-tracking-stable',
    title: 'Verify Antenna Tracking Stable (quiz)',
    type: 'quiz',
    correctAnswer: 'The antenna is tracking properly - the intermittent issue is not caused by tracking problems',
  },
  { id: 'verify-rx-path-healthy', title: 'Compare Beacon and Carrier (tab)', type: 'click-tab', tabId: 'rx-analysis', dwellMs: 12000 },
  {
    id: 'verify-rx-path-healthy',
    title: 'Compare Beacon and Carrier (quiz)',
    type: 'quiz',
    correctAnswer: 'The receive chain is healthy, so the carrier is dropping on the transmit side',
  },
  { id: 'check-tx-chain-status', title: 'Investigate TX Chain (tab)', type: 'click-tab', tabId: 'tx-chain' },
  {
    id: 'check-tx-chain-status',
    title: 'Investigate TX Chain (quiz)',
    type: 'quiz',
    correctAnswer: 'The modem Output Power display - it shows DROPOUT during fault periods',
  },

  // Phase 7: backup modem
  { id: 'switch-to-modem-2', title: 'Power Off Modem 1', type: 'power-off-modem1' },
  { id: 'switch-to-modem-2', title: 'Switch to Backup Modem', type: 'select-modem2', waitForComplete: true },
  { id: 'calculate-aurora7-uplink-if', title: 'Calculate AURORA-7 Uplink IF', type: 'quiz', correctAnswer: '1047 MHz' },
  { id: 'configure-tx-modem', title: 'Configure Modem 2 for AURORA-7', type: 'configure-modem2', waitForComplete: true },

  // Phase 8: BUC loopback test
  { id: 'prepare-buc-loopback', title: 'Disable HPA', type: 'toggle', switchId: 'hpa-enable', switchState: false },
  { id: 'prepare-buc-loopback', title: 'Set BUC gain 15 dB', type: 'configure-buc-gain', bucGain: 15 },
  { id: 'prepare-buc-loopback', title: 'Enable BUC loopback', type: 'toggle', switchId: 'buc-loopback', switchState: true },
  {
    id: 'prepare-buc-loopback',
    title: 'Prepare BUC for Loopback Test (quiz)',
    type: 'quiz',
    correctAnswer: 'To prevent accidental RF transmission through the HPA until the new modem is verified',
  },
  { id: 'test-modem2-loopback', title: 'Start Modem 2 transmitting', type: 'transmit-modem2' },
  {
    id: 'test-modem2-loopback',
    title: 'Test Modem 2 Transmission (quiz)',
    type: 'quiz',
    correctAnswer: 'The full signal path from modem through BUC, without engaging the HPA',
  },
  { id: 'verify-loopback-signal', title: 'Verify Loopback Signal (tab)', type: 'click-tab', tabId: 'rx-analysis' },
  {
    id: 'verify-loopback-signal',
    title: 'Verify Loopback Signal (speca)',
    type: 'configure-speca',
    specaConfig: { centerFrequency: 1422, span: 40, minAmplitude: -100, maxAmplitude: -30 },
  },
  {
    id: 'verify-loopback-signal',
    title: 'Verify Loopback Signal (quiz)',
    type: 'quiz',
    correctAnswer: 'A 24 MHz wide modulated carrier at 1422 MHz - Modem 2 through the BUC and the test loop',
  },

  // Phase 9: live uplink
  { id: 'disable-loopback-prepare-uplink', title: 'Prepare for Live Uplink (tab)', type: 'click-tab', tabId: 'tx-chain' },
  { id: 'disable-loopback-prepare-uplink', title: 'Disable BUC loopback', type: 'toggle', switchId: 'buc-loopback', switchState: false },
  { id: 'disable-loopback-prepare-uplink', title: 'Restore BUC gain 23 dB', type: 'configure-buc-gain', bucGain: 23, waitForComplete: true },
  { id: 'enable-hpa-sequence', title: 'Enable HPA', type: 'toggle', switchId: 'hpa-enable', switchState: true, waitForComplete: true },

  // Phase 10: wrap-up
  { id: 'verify-link-operational', title: 'Verify Link Operational (tab)', type: 'click-tab', tabId: 'dashboard' },
  { id: 'verify-link-operational', title: 'Verify Link Operational (quiz)', type: 'quiz', correctAnswer: 'All of the above' },
  {
    id: 'final-summary',
    title: 'Document Resolution',
    type: 'quiz',
    correctAnswer: 'LNB reference unlock, program-track drift, Modem 1 fault; fixed by LNB power cycle, step-track, Modem 2',
  },
];

// ============================================================
// Helper Functions
// ============================================================

/** Find a switch by exact id, or by id suffix for per-instance prefixed ids. */
function switchLocator(page: Page, switchId: string) {
  return page.locator(`input[id="${switchId}"], input[id$="-${switchId}"]`).locator('visible=true').first();
}

async function setSwitch(page: Page, switchId: string, desiredState: boolean): Promise<void> {
  const switchEl = switchLocator(page, switchId);
  await expect(switchEl).toBeVisible({ timeout: 5000 });
  if ((await switchEl.isChecked()) !== desiredState) {
    await switchEl.click();
  }
  if (desiredState) {
    await expect(switchEl).toBeChecked();
  } else {
    await expect(switchEl).not.toBeChecked();
  }
  await page.waitForTimeout(300);
}

async function powerCycleLnb(page: Page): Promise<void> {
  const powerSwitch = page.locator('#lnb-power');
  await expect(powerSwitch).toBeVisible({ timeout: 5000 });
  if (await powerSwitch.isChecked()) {
    await powerSwitch.click();
    await expect(powerSwitch).not.toBeChecked();
  }
  await page.waitForTimeout(1500);
  await powerSwitch.click();
  await expect(powerSwitch).toBeChecked();
  // Thermal stabilization plus reference re-acquire
  await page.waitForTimeout(5000);
}

async function setTrackingMode(page: Page, trackingMode: string): Promise<void> {
  // Step-track is an optimization toggle on top of program-track, not a mode button
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

async function configureSpectrumAnalyzer(page: Page, config: NonNullable<Scenario8Step['specaConfig']>): Promise<void> {
  const fields: Array<[string, number]> = [
    ['#sa-center-freq', config.centerFrequency],
    ['#sa-span', config.span],
    ['#sa-min-amp', config.minAmplitude],
    ['#sa-max-amp', config.maxAmplitude],
  ];
  for (const [selector, value] of fields) {
    const input = page.locator(selector);
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(value.toString());
    await input.press('Tab');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
}

async function selectTxModem(page: Page, modemNumber: number): Promise<void> {
  const btn = page.locator(`button.modem-btn[data-modem="${modemNumber}"]`).locator('visible=true').first();
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  await page.waitForTimeout(400);
}

async function powerOffModem1(page: Page): Promise<void> {
  await selectTxModem(page, 1);
  const powerSwitch = page.locator('#tx-power-switch');
  await expect(powerSwitch).toBeVisible({ timeout: 5000 });
  if (await powerSwitch.isChecked()) {
    await powerSwitch.click();
  }
  await expect(powerSwitch).not.toBeChecked();
  await page.waitForTimeout(300);
}

async function configureModem2(page: Page): Promise<void> {
  await selectTxModem(page, 2);
  const numeric: Array<[string, string]> = [
    ['#tx-frequency-input', '1047'],
    ['#tx-bandwidth-input', '24'],
    ['#tx-power-input', '-7'],
  ];
  for (const [selector, value] of numeric) {
    const input = page.locator(selector);
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(value);
    await input.press('Tab');
    await page.waitForTimeout(100);
  }
  await page.locator('#tx-modulation-select').selectOption({ label: 'QPSK' });
  await page.locator('#tx-fec-select').selectOption({ label: '3/4' });
  await page.waitForTimeout(100);
  const applyBtn = page.locator('#tx-apply-btn');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
  await page.waitForTimeout(500);
}

async function transmitModem2(page: Page): Promise<void> {
  await selectTxModem(page, 2);
  const txSwitch = page.locator('#tx-transmit-switch');
  await expect(txSwitch).toBeVisible({ timeout: 5000 });
  if (!(await txSwitch.isChecked())) {
    await txSwitch.click();
  }
  await expect(txSwitch).toBeChecked();
  const applyBtn = page.locator('#tx-apply-btn');
  if ((await applyBtn.count()) > 0 && (await applyBtn.isVisible())) {
    await applyBtn.click();
  }
  await page.waitForTimeout(1000);
}

async function configureBucGain(page: Page, gain: number): Promise<void> {
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

async function executeStep(page: Page, missionControlPage: MissionControlPage, step: Scenario8Step): Promise<void> {
  switch (step.type) {
    case 'quiz':
      await waitForQuizToAppear(page);
      await answerQuizByText(page, step.correctAnswer!);
      break;
    case 'select-station':
      await missionControlPage.selectGroundStation('VT-01');
      break;
    case 'click-tab':
      await missionControlPage.selectTab(step.tabId!);
      // Observation-gated conditions latch only after the dwell on the tab
      await page.waitForTimeout(step.dwellMs ?? 3000);
      break;
    case 'lnb-power-cycle':
      await powerCycleLnb(page);
      break;
    case 'set-tracking-mode':
      await setTrackingMode(page, step.trackingMode!);
      break;
    case 'toggle':
      await setSwitch(page, step.switchId!, step.switchState!);
      break;
    case 'configure-speca':
      await configureSpectrumAnalyzer(page, step.specaConfig!);
      break;
    case 'power-off-modem1':
      await powerOffModem1(page);
      break;
    case 'select-modem2':
      await selectTxModem(page, 2);
      break;
    case 'configure-modem2':
      await configureModem2(page);
      break;
    case 'transmit-modem2':
      await transmitModem2(page);
      break;
    case 'configure-buc-gain':
      await configureBucGain(page, step.bucGain!);
      break;
  }
  await dismissDialogIfPresent(page);
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Scenario 8 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
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

    // Navigate directly (bypasses the prerequisite check on S7)
    await missionControlPage.gotoScenario('nats', 'nats-level-8-night-shift');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();

    // Required for the first objective's mission-brief-opened condition
    await missionControlPage.openMissionBrief();
    await missionControlPage.closeMissionBrief();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(150000);
  });

  for (const [index, step] of SCENARIO_8_STEPS.entries()) {
    test(`${String(index + 1).padStart(2, '0')} [${step.id}] ${step.title}`, async () => {
      if (step.completeTimeoutMs) {
        test.setTimeout(step.completeTimeoutMs + 60000);
      }
      await executeStep(page, missionControlPage, step);
      // Stay on the step's tab until its objective ticks: leaving early drops
      // the tab-active hold or activates the next objective off its tab.
      if (step.waitForComplete) {
        await page.waitForFunction(
          (id) => {
            const hook = (window as unknown as { debugObjective?: (id: string) => { isCompleted?: boolean; error?: string } }).debugObjective;
            const d = typeof hook === 'function' ? hook(id) : undefined;
            return d?.error !== undefined || d?.isCompleted === true;
          },
          step.id,
          { timeout: step.completeTimeoutMs ?? 60000, polling: 500 }
        );
        const state = await page.evaluate((id) => {
          const hook = (window as unknown as { debugObjective?: (id: string) => { isCompleted?: boolean; error?: string } }).debugObjective;
          return typeof hook === 'function' ? hook(id) : undefined;
        }, step.id);
        expect(state?.error, `objective ${step.id} reported an error`).toBeUndefined();
        expect(state?.isCompleted, `objective ${step.id} completed`).toBe(true);
      }
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
