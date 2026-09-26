import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerPendingStatusChecks,
  answerStatusCheck,
  type CaptureContext,
  closeWorkingDocumentIfOpen,
  collectCaptures,
  computeFixWithin,
  type DutyCycle,
  debugObjective,
  ensureOnWindowStart,
  greatCircleKm,
  type InterfererPhase,
  objectiveItem,
  setConsoleInput,
  waitForObjectiveComplete,
} from '../utils/signal-hunter-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Signal Hunter (Campaign 5) Scenario 1 "First Fix" - full completion.
 *
 * The hostile uplink (6021 MHz, 3 MHz, H-pol) rides SENTRY-7 TP-1 on a
 * 40 s on / 90 s off cycle and the correlator integrates for 12 s, so every
 * capture has to start early in an on-window. The helpers track the
 * interferer phase through the window.debugObjective probe and skip the
 * off-windows with window.advanceClock between captures; the clock
 * jumps also move the inclined SENTRY pair, which rotates the FDOA lines and
 * tightens the fix the way real cycles would.
 *
 * Objective flow:
 * 1. review-mission-brief      - open the incident package
 * 2. detect-interference       - interferer observed on RX Analysis while ON
 * 3. characterize-duty-cycle   - cadence quiz
 * 4. open-geolocation-console  - Geolocation tab
 * 5. collect-measurements      - >= 6 captures on the interferer
 * 6. compute-fix               - fix within 25 km
 * 7. refine-fix (optional)     - >= 12 captures and fix within 15 km,
 *                                driven BEFORE the report so the Mission
 *                                Complete modal does not freeze the console
 * 8. file-incident-report      - three characterization quizzes; last
 *                                required objective, asserted via the modal
 */

const CAMPAIGN_ID = 'signal-hunter';
const SCENARIO_ID = 'signal-hunter-scenario1';

/** Interference event quay-hostile (scenario1.ts) */
const DUTY: DutyCycle = { onSeconds: 40, periodSeconds: 130 };
const CAPTURE_WINDOW_S = 12;
const INTERFERER_UPLINK_MHZ = 6021;
const INTERFERER_BW_MHZ = 3;
/** Emitter ground truth: Quay County ranch airstrip */
const EMITTER = { lat: 35.17, lon: -103.72 };
/** Objective whose signal-detected condition doubles as the ON/OFF probe */
const PROBE_OBJECTIVE = 'detect-interference';

const log = (line: string): void => console.log(`[signal-hunter-1] ${line}`);

test.describe('Signal Hunter Scenario 1 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;
  const phase: InterfererPhase = { onStartMs: null };
  let ctx: CaptureContext;

  let firstFixErrorKm = Number.NaN;
  let firstFixCaptures = 0;
  let refinedFixErrorKm = Number.NaN;
  let refinedFixCaptures = 0;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);
    ctx = { page, phase, probeObjectiveId: PROBE_OBJECTIVE, duty: DUTY, windowS: CAPTURE_WINDOW_S, log };

    // Direct navigation (bypasses the sandbox prerequisite card lock)
    await missionControl.gotoScenario(CAMPAIGN_ID, SCENARIO_ID);
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(300000);
  });

  test('[review-mission-brief] opens the incident package', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Review the Incident Package');
  });

  test('[detect-interference] observes the hostile carrier on RX Analysis during an on-window', async () => {
    await missionControl.selectGroundStation('PA-22');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);

    // signal-detected latches only while the interferer is on the air AND the
    // RX Analysis tab is active, so bring the clock to an on-window start.
    await ensureOnWindowStart(ctx);
    await missionControl.selectTab('rx-analysis');

    try {
      await waitForObjectiveComplete(missionControl, 'Find the Carrier', 30000);
    } catch (error) {
      log(`detect-interference debug: ${JSON.stringify(await debugObjective(page, 'detect-interference'))}`);
      throw error;
    }
  });

  test('[characterize-duty-cycle] reports the 40 s on / 90 s off cadence', async () => {
    await answerStatusCheck(page, 'About 40 s on, then about 90 s off');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Time the Cadence');
  });

  test('[open-geolocation-console] brings up the correlator', async () => {
    await missionControl.selectTab('geolocation');
    await dismissDialogIfPresent(page);
    await expect(page.locator('#geo-adjacent-select')).toBeVisible();
    await waitForObjectiveComplete(missionControl, 'Bring Up the Correlator');
  });

  test('[collect-measurements] tunes the correlator and captures six times inside the on-windows', async () => {
    // Uplink worked back from the 1354 MHz IF: RF = 5150 - 1354 = 3796,
    // uplink = 3796 + 2225 = 6021 MHz; correlation bandwidth matched to 3 MHz
    await setConsoleInput(page, '#geo-freq-value', INTERFERER_UPLINK_MHZ);
    await setConsoleInput(page, '#geo-bw-value', INTERFERER_BW_MHZ);
    await expect(page.locator('#geo-freq-value')).toHaveValue(String(INTERFERER_UPLINK_MHZ));
    await expect(page.locator('#geo-bw-value')).toHaveValue(String(INTERFERER_BW_MHZ));

    const count = await collectCaptures(ctx, 6);
    expect(count).toBeGreaterThanOrEqual(6);

    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Capture Inside the Window');
  });

  test('[compute-fix] solves a fix within 25 km of the emitter', async () => {
    const result = await computeFixWithin(ctx, EMITTER, 25, { extraPerRound: 3, maxRounds: 4 });
    firstFixErrorKm = result.errorKm;
    firstFixCaptures = result.captures;

    // Independent check of the console's grading: great-circle error against truth
    expect(greatCircleKm(result.fix, EMITTER)).toBeLessThanOrEqual(25);

    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(missionControl, 'First Fix');
    } catch (error) {
      log(`compute-fix debug: ${JSON.stringify(await debugObjective(page, 'compute-fix'))}`);
      throw error;
    }
  });

  test('[refine-fix] closes the ellipse to 15 km with twelve or more captures', async () => {
    // Driven before the report quizzes: file-incident-report is the last
    // REQUIRED objective and its completion pops the Mission Complete modal.
    await dismissDialogIfPresent(page);
    const count = await collectCaptures(ctx, 12);
    expect(count).toBeGreaterThanOrEqual(12);

    const result = await computeFixWithin(ctx, EMITTER, 15, { extraPerRound: 3, maxRounds: 4 });
    refinedFixErrorKm = result.errorKm;
    refinedFixCaptures = result.captures;
    expect(greatCircleKm(result.fix, EMITTER)).toBeLessThanOrEqual(15);

    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(missionControl, 'Close the Ellipse');
    } catch (error) {
      log(`refine-fix debug: ${JSON.stringify(await debugObjective(page, 'refine-fix'))}`);
      throw error;
    }
  });

  test('[file-incident-report] files the characterization and completes the mission', async () => {
    // Three status-checks on one objective: the QuizManager surfaces the last
    // registered (polarization) first, then promotes the remaining ones, so
    // answer by question text rather than by condition order.
    const seen = await answerPendingStatusChecks(
      page,
      [
        { question: /DUTY CYCLE/, answer: 'Approximately 30%' },
        { question: /OCCUPIED BANDWIDTH/, answer: 'About 3 MHz' },
        { question: /POLARIZATION/, answer: 'Horizontal - TP-1 is an H-pol transponder' },
      ],
      3
    );
    expect(new Set(seen).size).toBe(3);
    await dismissDialogIfPresent(page);

    // Last required objective: its checklist row never repaints once the
    // completion flow starts, so assert the Mission Complete modal instead.
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#level-complete-modal .complete-modal__title')).toContainText('Mission Complete');
  });

  test('verifies mission complete with the optional refine-fix objective completed', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });

    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();
    const score = parseInt((await totalScore.textContent()) || '0', 10);
    expect(score).toBeGreaterThan(0);

    // The checklist is frozen in its final state under the modal: the
    // optional stretch objective was driven and must show completed.
    const refine = objectiveItem(missionControl, 'Close the Ellipse');
    await expect(refine).toHaveCount(1);
    await expect(refine).toHaveClass(/completed/);

    log(
      `first fix: ${firstFixErrorKm.toFixed(2)} km from ${firstFixCaptures} captures; ` +
        `refined fix: ${refinedFixErrorKm.toFixed(2)} km from ${refinedFixCaptures} captures; score ${score}`
    );
  });
});
