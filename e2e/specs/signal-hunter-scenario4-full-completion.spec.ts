import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceMissionClockMs,
  answerPendingStatusChecks,
  answerStatusCheck,
  type CaptureContext,
  captureOnce,
  closeWorkingDocumentIfOpen,
  collectCaptures,
  computeFix,
  computeFixWithin,
  type DutyCycle,
  debugObjective,
  domClick,
  ensureOnWindowStart,
  greatCircleKm,
  type InterfererPhase,
  measurementCount,
  setConsoleInput,
  waitForObjectiveComplete,
} from '../utils/signal-hunter-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Signal Hunter (Campaign 5) Scenario 4 "Prove It" - full completion
 * (phase 18 F).
 *
 * The correlator is calibrated on the Cannon AFB terminal's continuous
 * carrier (6003 MHz -> 1372 MHz IF): six captures two minutes apart, fix
 * inside 20 km of the base. The console is CLEARed and the hostile
 * (6021 MHz -> 1354 MHz IF, 36 s on / 84 s off, ~56 km east of Cannon) is
 * captured inside its on-windows, fixed inside 20 km, and the ellipse closed
 * to a 20 km semi-major axis (geolocation-ellipse-within). The call is graded
 * on transponder-interference-active with the hostile observed as evidence,
 * then the basis and confidence fields are filed.
 *
 * Objective flow (10):
 *  1. review-mission-brief   2. find-both-carriers   3. capture-the-reference
 *  4. fix-the-reference      5. read-the-calibration 6. clear-and-hunt
 *  7. fix-the-hostile        8. prove-it             9. make-the-call
 * 10. file-the-proof
 */

const CAMPAIGN_ID = 'signal-hunter';
const SCENARIO_ID = 'signal-hunter-scenario4';

const DUTY: DutyCycle = { onSeconds: 36, periodSeconds: 120 };
const CAPTURE_WINDOW_S = 12;
const REFERENCE = { uplinkMHz: 6003, bwMHz: 2, site: { lat: 34.383, lon: -103.322 }, maxErrorKm: 20 };
const HOSTILE = { uplinkMHz: 6021, bwMHz: 3, emitter: { lat: 34.75, lon: -102.9 }, maxErrorKm: 20, maxSemiMajorKm: 20 };
/** Objective whose first signal-detected condition (the hostile) is the ON/OFF probe */
const PROBE_OBJECTIVE = 'find-both-carriers';

const log = (line: string): void => console.log(`[signal-hunter-4] ${line}`);

test.describe('Signal Hunter Scenario 4 Full Completion', () => {
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

  test('[find-both-carriers] observes the hostile and the Cannon reference on RX Analysis', async () => {
    await missionControl.selectGroundStation('PA-22');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await ensureOnWindowStart(ctx);
    await missionControl.selectTab('rx-analysis');
    try {
      await waitForObjectiveComplete(missionControl, 'Find the Reference and the Hostile', 30000);
    } catch (error) {
      log(`find-both-carriers debug: ${JSON.stringify(await debugObjective(page, 'find-both-carriers'))}`);
      throw error;
    }
  });

  test('[capture-the-reference] captures the continuous reference carrier six times, two minutes apart', async () => {
    await missionControl.selectTab('geolocation');
    await dismissDialogIfPresent(page);
    await setConsoleInput(page, '#geo-freq-value', REFERENCE.uplinkMHz);
    await setConsoleInput(page, '#geo-bw-value', REFERENCE.bwMHz);
    for (let i = 0; i < 6; i++) {
      const result = await captureOnce(page, CAPTURE_WINDOW_S);
      log(`reference capture ${i + 1}: ${result}`);
      expect(result).toMatch(/^CAPTURE/);
      await advanceMissionClockMs(page, 120000);
    }
    expect(await measurementCount(page)).toBeGreaterThanOrEqual(6);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Capture the Reference');
  });

  test('[fix-the-reference] the reference fix lands on Cannon inside 20 km', async () => {
    let fix = await computeFix(page);
    let errorKm = greatCircleKm(fix, REFERENCE.site);
    log(`reference fix: ${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)} -> ${errorKm.toFixed(1)} km from Cannon`);
    for (let round = 0; round < 3 && errorKm > REFERENCE.maxErrorKm; round++) {
      for (let i = 0; i < 2; i++) {
        await captureOnce(page, CAPTURE_WINDOW_S);
        await advanceMissionClockMs(page, 120000);
      }
      fix = await computeFix(page);
      errorKm = greatCircleKm(fix, REFERENCE.site);
      log(`reference fix (round ${round + 1}): ${errorKm.toFixed(1)} km from Cannon`);
    }
    expect(errorKm).toBeLessThanOrEqual(REFERENCE.maxErrorKm);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Fix the Reference');
  });

  test('[read-the-calibration] says what the calibration proves', async () => {
    await answerStatusCheck(page, 'That the pair');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Read the Calibration');
  });

  test('[clear-and-hunt] clears the console and captures the hostile eight times', async () => {
    await missionControl.selectTab('geolocation');
    await dismissDialogIfPresent(page);
    await domClick(page, '#geo-clear-btn');
    await expect.poll(() => measurementCount(page)).toBe(0);
    await setConsoleInput(page, '#geo-freq-value', HOSTILE.uplinkMHz);
    await setConsoleInput(page, '#geo-bw-value', HOSTILE.bwMHz);
    phase.onStartMs = null; // the clock has moved a long way since the last on-window was seen
    const count = await collectCaptures(ctx, 8);
    expect(count).toBeGreaterThanOrEqual(8);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Clear and Hunt');
  });

  test('[fix-the-hostile] fixes the hostile inside 20 km on its own captures', async () => {
    const result = await computeFixWithin(ctx, HOSTILE.emitter, HOSTILE.maxErrorKm, { extraPerRound: 3, maxRounds: 4 });
    expect(greatCircleKm(result.fix, HOSTILE.emitter)).toBeLessThanOrEqual(HOSTILE.maxErrorKm);
    expect(greatCircleKm(result.fix, REFERENCE.site)).toBeGreaterThan(30);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Fix the Hostile');
  });

  test('[prove-it] closes the 95% ellipse to 20 km with twelve or more captures', async () => {
    let count = await collectCaptures(ctx, 12);
    let fix = await computeFix(page);
    log(`ellipse from ${count} captures: ±${fix.semiMajorKm}×${fix.semiMinorKm} km`);
    for (let round = 0; round < 4 && (fix.semiMajorKm === null || fix.semiMajorKm > HOSTILE.maxSemiMajorKm); round++) {
      count = await collectCaptures(ctx, count + 3);
      fix = await computeFix(page);
      log(`ellipse from ${count} captures: ±${fix.semiMajorKm}×${fix.semiMinorKm} km`);
    }
    expect(fix.semiMajorKm).not.toBeNull();
    expect(fix.semiMajorKm!).toBeLessThanOrEqual(HOSTILE.maxSemiMajorKm);
    // The ellipse cannot reach the base
    expect(greatCircleKm(fix, REFERENCE.site)).toBeGreaterThan(fix.semiMajorKm!);
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(missionControl, 'Close the Ellipse Past Cannon');
    } catch (error) {
      log(`prove-it debug: ${JSON.stringify(await debugObjective(page, 'prove-it'))}`);
      throw error;
    }
  });

  test('[make-the-call] tasks the team with the hostile on the trace', async () => {
    await ensureOnWindowStart(ctx);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(3500);
    await answerDecision(page, 'Hostile, not Cannon', ['Hostile carrier on the trace']);
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(missionControl, 'Make the Call');
    } catch (error) {
      log(`make-the-call debug: ${JSON.stringify(await debugObjective(page, 'make-the-call'))}`);
      throw error;
    }
  });

  test('[file-the-proof] files the basis and the confidence statement and completes the mission', async () => {
    const seen = await answerPendingStatusChecks(
      page,
      [
        { question: /BASIS/, answer: 'Reference fix on the Cannon terminal' },
        { question: /CONFIDENCE/, answer: 'Emitter assessed inside the reported 95% ellipse' },
      ],
      2
    );
    expect(new Set(seen).size).toBe(2);
    await dismissDialogIfPresent(page);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#level-complete-modal .complete-modal__title')).toContainText('Mission Complete');
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });
    const score = parseInt((await levelCompleteModal.locator('.total-value').textContent()) || '0', 10);
    expect(score).toBeGreaterThan(0);
    log(`score ${score}`);
  });
});
