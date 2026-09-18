import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  answerPendingStatusChecks,
  answerStatusCheck,
  type CaptureContext,
  captureOnce,
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
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Signal Hunter (Campaign 5) Scenario 2 "Two Carriers" - full completion
 * (phase 18 F).
 *
 * Two carriers off the plan on one trace: the uplink interferer through TP-1
 * (6001 MHz -> 1374 MHz IF, 36 s on / 84 s off) and a terrestrial
 * fixed-wireless sector arriving at the dish directly (3752 MHz -> 1398 MHz
 * IF, continuous). The correlator is tried on the terrestrial carrier first
 * and reports NO CORRELATION (nothing on the bird to correlate); the path
 * decision is graded on the transponder-/terrestrial-interference-active
 * facts with both carriers observed as evidence; then the uplink carrier is
 * captured, fixed inside 25 km, refined to 15 km, and the two dispositions
 * are filed.
 *
 * Objective flow (8):
 *  1. review-mission-brief   2. find-both-carriers   3. time-the-carriers
 *  4. call-the-path          5. collect-measurements 6. compute-fix
 *  7. refine-fix (optional)  8. file-the-disposition
 */

const CAMPAIGN_ID = 'signal-hunter';
const SCENARIO_ID = 'signal-hunter-scenario2';

/** Interference event dalhart-uplink (scenario2.ts) */
const DUTY: DutyCycle = { onSeconds: 36, periodSeconds: 120 };
const CAPTURE_WINDOW_S = 12;
const UPLINK_MHZ = 6001;
const UPLINK_BW_MHZ = 2.5;
/** The terrestrial carrier's would-be uplink (3752 + 2225): below TP-1, nothing to correlate */
const TERRESTRIAL_WOULD_BE_UPLINK_MHZ = 5977;
const TERRESTRIAL_BW_MHZ = 5;
/** Emitter ground truth: grain elevator lot outside Dalhart, Texas */
const EMITTER = { lat: 36.06, lon: -102.52 };
/** Objective whose first signal-detected condition (the uplink carrier) is the ON/OFF probe */
const PROBE_OBJECTIVE = 'find-both-carriers';

const log = (line: string): void => console.log(`[signal-hunter-2] ${line}`);

test.describe('Signal Hunter Scenario 2 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;
  const phase: InterfererPhase = { onStartMs: null };
  let ctx: CaptureContext;

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

  test('[find-both-carriers] observes the cycling and the continuous carrier on RX Analysis', async () => {
    await missionControl.selectGroundStation('PA-22');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);

    // The terrestrial carrier is always up; the uplink carrier only inside its on-window
    await ensureOnWindowStart(ctx);
    await missionControl.selectTab('rx-analysis');
    try {
      await waitForObjectiveComplete(missionControl, 'Find Both Carriers', 30000);
    } catch (error) {
      log(`find-both-carriers debug: ${JSON.stringify(await debugObjective(page, 'find-both-carriers'))}`);
      throw error;
    }
  });

  test('[time-the-carriers] logs the cadence of one and the absence of one', async () => {
    await answerStatusCheck(page, 'The 1374 carrier is up about 36 s in every 120 s');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Time What Cycles');
  });

  test('[call-the-path] the correlator cannot see the terrestrial carrier; the split call grades correct', async () => {
    // Try the correlator on the continuous carrier: no event on the bird matches, so NO CORRELATION
    await missionControl.selectTab('geolocation');
    await dismissDialogIfPresent(page);
    await setConsoleInput(page, '#geo-freq-value', TERRESTRIAL_WOULD_BE_UPLINK_MHZ);
    await setConsoleInput(page, '#geo-bw-value', TERRESTRIAL_BW_MHZ);
    const result = await captureOnce(page, CAPTURE_WINDOW_S);
    log(`capture on the terrestrial carrier: ${result}`);
    expect(result).toMatch(/NO CORRELATION/);

    // Evidence: both carriers observed again on RX Analysis inside an on-window
    await ensureOnWindowStart(ctx);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(3500);
    await answerDecision(page, 'The 1374 carrier is on the transponder', ['Cycling carrier on the trace', 'Continuous carrier on the trace']);
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(missionControl, 'Call the Path');
    } catch (error) {
      log(`call-the-path debug: ${JSON.stringify(await debugObjective(page, 'call-the-path'))}`);
      throw error;
    }
  });

  test('[collect-measurements] captures the uplink carrier six times inside the on-windows', async () => {
    await missionControl.selectTab('geolocation');
    await dismissDialogIfPresent(page);
    await setConsoleInput(page, '#geo-freq-value', UPLINK_MHZ);
    await setConsoleInput(page, '#geo-bw-value', UPLINK_BW_MHZ);
    await expect(page.locator('#geo-freq-value')).toHaveValue(String(UPLINK_MHZ));

    const count = await collectCaptures(ctx, 6);
    expect(count).toBeGreaterThanOrEqual(6);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Capture the Uplink Carrier');
  });

  test('[compute-fix] solves a fix within 25 km of the emitter', async () => {
    const result = await computeFixWithin(ctx, EMITTER, 25, { extraPerRound: 3, maxRounds: 4 });
    expect(greatCircleKm(result.fix, EMITTER)).toBeLessThanOrEqual(25);
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(missionControl, 'Fix the Uplink Carrier');
    } catch (error) {
      log(`compute-fix debug: ${JSON.stringify(await debugObjective(page, 'compute-fix'))}`);
      throw error;
    }
  });

  test('[refine-fix] closes the ellipse to 15 km with twelve or more captures', async () => {
    await dismissDialogIfPresent(page);
    const count = await collectCaptures(ctx, 12);
    expect(count).toBeGreaterThanOrEqual(12);
    const result = await computeFixWithin(ctx, EMITTER, 15, { extraPerRound: 3, maxRounds: 4 });
    expect(greatCircleKm(result.fix, EMITTER)).toBeLessThanOrEqual(15);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Close the Ellipse');
  });

  test('[file-the-disposition] files the frequency and the referral and completes the mission', async () => {
    const seen = await answerPendingStatusChecks(
      page,
      [
        { question: /FREQUENCY/, answer: '6001 MHz (3776 MHz downlink' },
        { question: /DISPOSITION/, answer: 'Referred to spectrum management' },
      ],
      2
    );
    expect(new Set(seen).size).toBe(2);
    await dismissDialogIfPresent(page);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#level-complete-modal .complete-modal__title')).toContainText('Mission Complete');
  });

  test('verifies mission complete with the optional refine-fix objective completed', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });
    const score = parseInt((await levelCompleteModal.locator('.total-value').textContent()) || '0', 10);
    expect(score).toBeGreaterThan(0);
    const refine = objectiveItem(missionControl, 'Close the Ellipse');
    await expect(refine).toHaveClass(/completed/);
    log(`score ${score}`);
  });
});
