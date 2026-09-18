import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToElapsed } from '../utils/ccs-helpers';
import {
  answerPendingStatusChecks,
  answerStatusCheck,
  type CaptureContext,
  closeWorkingDocumentIfOpen,
  collectCaptures,
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
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Signal Hunter (Campaign 5) Scenario 3 "Cold Trail" - full completion
 * (phase 18 F).
 *
 * The first carrier (6018 MHz -> 1357 MHz IF, from a site near Clayton NM)
 * is found, captured six times, fixed inside 25 km, and briefed to the team.
 * Its envelope closes at T+1520; the clock is jumped past it, the cold-trail
 * call is made (the objective is gated on interference-event-ended), and at
 * T+1800 the second carrier (6001 MHz -> 1374 MHz IF, ~80 km south-west)
 * appears. The console is CLEARed, retuned, the second carrier captured and
 * fixed on its own, and the mobility and current-fix fields are filed.
 *
 * Objective flow (10):
 *  1. review-mission-brief  2. find-carrier-a       3. capture-carrier-a
 *  4. fix-carrier-a         5. brief-the-team       6. the-trail-goes-cold
 *  7. find-carrier-b        8. capture-carrier-b    9. fix-carrier-b
 * 10. file-the-trail
 */

const CAMPAIGN_ID = 'signal-hunter';
const SCENARIO_ID = 'signal-hunter-scenario3';

const DUTY: DutyCycle = { onSeconds: 36, periodSeconds: 120 };
const CAPTURE_WINDOW_S = 12;
const FIRST = { uplinkMHz: 6018, bwMHz: 2.5, emitter: { lat: 36.45, lon: -103.18 }, endsAtS: 1520 };
const SECOND = { uplinkMHz: 6001, bwMHz: 2.5, emitter: { lat: 36.02, lon: -103.9 }, startsAtS: 1800 };

const log = (line: string): void => console.log(`[signal-hunter-3] ${line}`);

test.describe('Signal Hunter Scenario 3 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;
  let wallStartMs = 0;
  const phaseA: InterfererPhase = { onStartMs: null };
  const phaseB: InterfererPhase = { onStartMs: null };
  let ctxA: CaptureContext;
  let ctxB: CaptureContext;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);
    ctxA = { page, phase: phaseA, probeObjectiveId: 'find-carrier-a', duty: DUTY, windowS: CAPTURE_WINDOW_S, log };
    ctxB = { page, phase: phaseB, probeObjectiveId: 'find-carrier-b', duty: DUTY, windowS: CAPTURE_WINDOW_S, log };

    await missionControl.gotoScenario(CAMPAIGN_ID, SCENARIO_ID);
    wallStartMs = Date.now();
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

  test('[find-carrier-a] observes the first carrier below the service carrier', async () => {
    await missionControl.selectGroundStation('PA-22');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await ensureOnWindowStart(ctxA);
    await missionControl.selectTab('rx-analysis');
    try {
      await waitForObjectiveComplete(missionControl, 'Find the Carrier Below the Service', 30000);
    } catch (error) {
      log(`find-carrier-a debug: ${JSON.stringify(await debugObjective(page, 'find-carrier-a'))}`);
      throw error;
    }
  });

  test('[capture-carrier-a] captures the first carrier six times', async () => {
    await missionControl.selectTab('geolocation');
    await dismissDialogIfPresent(page);
    await setConsoleInput(page, '#geo-freq-value', FIRST.uplinkMHz);
    await setConsoleInput(page, '#geo-bw-value', FIRST.bwMHz);
    const count = await collectCaptures(ctxA, 6);
    expect(count).toBeGreaterThanOrEqual(6);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Capture the First Carrier');
  });

  test('[fix-carrier-a] fixes the first carrier inside 25 km', async () => {
    const result = await computeFixWithin(ctxA, FIRST.emitter, 25, { extraPerRound: 3, maxRounds: 4 });
    expect(greatCircleKm(result.fix, FIRST.emitter)).toBeLessThanOrEqual(25);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Fix the First Carrier');
  });

  test('[brief-the-team] hands the team an ellipse, a cadence, and a standing instruction', async () => {
    await answerStatusCheck(page, 'A 95% ellipse and its centre');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Brief the Team');
  });

  test('[the-trail-goes-cold] the first carrier stops; the team is held short', async () => {
    // Past the first carrier's envelope: two silent cycles and change
    await advanceMissionClockToElapsed(page, wallStartMs, FIRST.endsAtS + 250, 0);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(1500);
    await answerStatusCheck(page, 'Tell the team to hold short and stand by');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    try {
      await waitForObjectiveComplete(missionControl, 'The Trail Goes Cold');
    } catch (error) {
      log(`the-trail-goes-cold debug: ${JSON.stringify(await debugObjective(page, 'the-trail-goes-cold'))}`);
      throw error;
    }
  });

  test('[find-carrier-b] observes the new carrier above the service carrier', async () => {
    await advanceMissionClockToElapsed(page, wallStartMs, SECOND.startsAtS + 2, 0);
    await missionControl.selectTab('rx-analysis');
    await ensureOnWindowStart(ctxB);
    await missionControl.selectTab('rx-analysis');
    try {
      await waitForObjectiveComplete(missionControl, 'New Carrier Above the Service', 30000);
    } catch (error) {
      log(`find-carrier-b debug: ${JSON.stringify(await debugObjective(page, 'find-carrier-b'))}`);
      throw error;
    }
  });

  test('[capture-carrier-b] clears the console, retunes, and captures the second carrier six times', async () => {
    await missionControl.selectTab('geolocation');
    await dismissDialogIfPresent(page);
    await domClick(page, '#geo-clear-btn');
    await expect.poll(() => measurementCount(page)).toBe(0);
    await setConsoleInput(page, '#geo-freq-value', SECOND.uplinkMHz);
    await setConsoleInput(page, '#geo-bw-value', SECOND.bwMHz);
    const count = await collectCaptures(ctxB, 6);
    expect(count).toBeGreaterThanOrEqual(6);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Clear and Recapture');
  });

  test('[fix-carrier-b] fixes the second carrier inside 25 km on its own captures', async () => {
    const result = await computeFixWithin(ctxB, SECOND.emitter, 25, { extraPerRound: 3, maxRounds: 4 });
    expect(greatCircleKm(result.fix, SECOND.emitter)).toBeLessThanOrEqual(25);
    // The two sites are ~80 km apart: a clean second solve is nowhere near the first
    expect(greatCircleKm(result.fix, FIRST.emitter)).toBeGreaterThan(40);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Fix the Second Carrier');
  });

  test('[file-the-trail] files mobility and the current fix and completes the mission', async () => {
    const seen = await answerPendingStatusChecks(
      page,
      [
        { question: /MOBILITY/, answer: 'Mobile: retuned from 6018 MHz to 6001 MHz' },
        { question: /FIX\./, answer: 'Fix 2 (6001 MHz) as current' },
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
