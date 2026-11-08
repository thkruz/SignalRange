import { expect, type Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerQuizByText, dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Scenario 17 - late-player regression for the sun transit onset.
 *
 * Bug (reported 2026-09-25): the transit was scheduled T+300..600 s from
 * mission start. A player who reached 'Confirm Predicted Onset' after ~T+560 s
 * found the transit already over, so 'Sky Noise Rising (transit underway)'
 * could never tick (sky noise stayed 0, Sky Temp read 10 K).
 *
 * Fix: the weather event is anchored to the objective
 * (startAfterObjectiveId: 'observe-onset', as it activates), and the Sky Temp
 * readout includes the transit's noise. Since nats-r3-s17-F1 a skippable
 * hold, 'stand-by-for-window', sits between the notice and the onset step and
 * ends at the prediction sheet's 10:32:30 window-open on the station clock.
 *
 * This spec plays a slow operator, the way the reported players were slow:
 * it spends most of each objective's countdown before acting, which walks the
 * scenario clock through the entire old window. Since phase 19.0a
 * window.advanceClock burns countdowns the way waiting does, so every dwell
 * stays inside its objective's timer - a jump a real player cannot make
 * fails the objective.
 *  - BEFORE the onset objective: the old window's end passes with zero sky
 *    noise and no active weather event. (Old engine: the transit came and
 *    went during the dwells - this test fails.)
 *  - AFTER the onset objective activates: the transit arrives on cue, the
 *    checklist condition ticks, the objective completes, and Sky Temp climbs
 *    far above the clear-sky 10 K. (Old engine: sky noise stays 0 - fails.)
 *  - Phase 29 D10 (nats-r4-s17-F1): Hold Through the Peak ticks at the
 *    transit midpoint (onset + 150 s), not on a >6 dB crossing ~90 s early,
 *    and Verify Self-Recovery's "Receiver Re-Locked" needs the modem to have
 *    lost lock after onset and locked again. The clock is walked in 5 s steps
 *    so the objectives manager sees the unlock (one long jump would skip it).
 */

type SimWindow = {
  advanceClock?: (ms: number) => void;
  missionElapsedMs?: () => number;
  signalRange?: {
    simulationManager?: {
      groundStations?: Array<{ state?: { id?: string }; antennas?: Array<{ state?: { skyNoiseDegradation_dB?: number } }> }>;
      objectivesManager?: {
        getObjectiveState: (
          id: string
        ) => { isActive: boolean; isCompleted: boolean; conditionStates?: Array<{ condition: { type: string }; lockLostSeen?: boolean }> } | undefined;
      };
    };
  };
};

async function readSkyNoiseDb(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as SimWindow;
    const gs = w.signalRange?.simulationManager?.groundStations?.find((g) => g.state?.id === 'VT-01');
    return gs?.antennas?.[0]?.state?.skyNoiseDegradation_dB ?? 0;
  });
}

async function readObjective(page: Page, id: string): Promise<{ isActive: boolean; isCompleted: boolean } | null> {
  return page.evaluate((objectiveId) => {
    const s = (window as unknown as SimWindow).signalRange?.simulationManager?.objectivesManager?.getObjectiveState(objectiveId);
    return s ? { isActive: s.isActive, isCompleted: s.isCompleted } : null;
  }, id);
}

/** Jump the scenario clock to an absolute mission-elapsed second (no-op if past it). */
async function advanceMissionTo(page: Page, targetSeconds: number): Promise<number> {
  await page.waitForFunction(() => {
    const w = window as unknown as SimWindow;
    return typeof w.advanceClock === 'function' && typeof w.missionElapsedMs === 'function';
  });
  const elapsedMs = await page.evaluate((targetMs) => {
    const w = window as unknown as SimWindow;
    const delta = targetMs - w.missionElapsedMs!();
    if (delta > 0) w.advanceClock!(delta);
    return w.missionElapsedMs!();
  }, targetSeconds * 1000);
  // Let the weather manager and objectives tick over the jump
  await page.waitForTimeout(3000);
  // Whole ms: the skip offset accumulates float error (720 s reads 719.9999...)
  return Math.round(elapsedMs) / 1000;
}

/** Spend `seconds` of an objective's countdown, as a slow player would (keep it under the timer). */
async function dwell(page: Page, seconds: number): Promise<void> {
  await page.evaluate((ms) => (window as unknown as SimWindow).advanceClock!(ms), seconds * 1000);
  await page.waitForTimeout(1500);
}

/** Walk the scenario clock to a mission-elapsed second in short steps, letting the sim tick between them. */
async function stepMissionTo(page: Page, targetSeconds: number, stepSeconds = 5): Promise<void> {
  for (;;) {
    const elapsedS = await page.evaluate(() => (window as unknown as SimWindow).missionElapsedMs!() / 1000);
    const remaining = targetSeconds - elapsedS;
    if (remaining <= 0.05) return;
    const step = Math.min(stepSeconds, remaining);
    await page.evaluate((ms) => (window as unknown as SimWindow).advanceClock!(ms), step * 1000);
    await page.waitForTimeout(400);
  }
}

/** Has verify-recovery's receiver-relocked row latched a lock loss? */
async function readLockLostSeen(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const s = (window as unknown as SimWindow).signalRange?.simulationManager?.objectivesManager?.getObjectiveState('verify-recovery');
    return s?.conditionStates?.find((c) => c.condition.type === 'receiver-relocked')?.lockLostSeen === true;
  });
}

async function answerQuiz(page: Page, answer: string): Promise<void> {
  await waitForQuizToAppear(page);
  await answerQuizByText(page, answer);
  await dismissDialogIfPresent(page);
}

test.describe('Scenario 17 Late Onset Regression', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let missionControlPage: MissionControlPage;
  let context: import('@playwright/test').BrowserContext;
  /** Mission-elapsed second at which observe-onset (and the transit) started */
  let onsetElapsedS = 0;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControlPage = new MissionControlPage(page);
    await missionControlPage.gotoScenario('nats', 'nats-scenario17');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();
    await missionControlPage.openMissionBrief();
    await missionControlPage.closeMissionBrief();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(90_000);
  });

  test('play the pre-window objectives slowly, most of each timer, up to Pre-Event Notification', async () => {
    await answerQuiz(page, 'Acknowledged - prediction sheet reviewed, pre-event checklist starting now.');
    await dwell(page, 20); // select-vermont-station: 60 s, with a maintain hold after the click
    await missionControlPage.selectGroundStation('VT-01');

    await dwell(page, 20); // baseline-dashboard: 60 s
    await missionControlPage.selectTab('dashboard');
    await answerQuiz(page, 'Anything odd after the window opens gets blamed on the Sun, so a hidden fault only shows if the board was clean first');
    await dwell(page, 100); // transit-geometry-quiz: 120 s
    await answerQuiz(page, 'The Sun (about 20,000 K at C-band) passes through the beam behind the satellite, so noise soars and C/N collapses; the signal is unchanged');
    await dwell(page, 100); // transit-predictability-quiz: 120 s
    await answerQuiz(page, 'Twice a year near the equinoxes, a few minutes a day for several days, at times you can compute years ahead');

    await dwell(page, 80); // baseline-rx-check: 120 s, with a maintain hold
    await missionControlPage.selectTab('rx-analysis');
    // Phase 27 Q3: the observation rows latch, then the C/N read quiz
    await answerQuiz(page, 'About 13 dB');
    await waitForObjectiveComplete(missionControlPage, 'Baseline RX Snapshot');
    await dwell(page, 100); // why-not-handover-quiz: 120 s
    await answerQuiz(page, 'The dip is brief, predicted and SLA-excluded with notice, a handover costs two transfers, and ME-02 has its own transit anyway');

    // Parked on the notice quiz: onset objective not yet up
    await waitForQuizToAppear(page);
    expect(await readObjective(page, 'notify-customer-quiz')).toEqual({ isActive: true, isCompleted: false });
    expect(await readObjective(page, 'observe-onset')).toEqual({ isActive: false, isCompleted: false });
  });

  test('BEFORE onset objective: no transit through the old T+300..600 s window', async () => {
    await dwell(page, 100); // notify-customer-quiz: 120 s
    // Deep in the old T+300..600 s window (about 9 dB at T+500 on the unfixed
    // engine), with the onset objective still not up. advanceMissionTo(0)
    // jumps nothing; it reads the clock.
    const lateArrival = await advanceMissionTo(page, 0);
    expect(lateArrival).toBeGreaterThanOrEqual(500);
    expect(await readSkyNoiseDb(page)).toBe(0);
    expect(await readObjective(page, 'notify-customer-quiz')).toEqual({ isActive: true, isCompleted: false });
    expect(await readObjective(page, 'observe-onset')).toEqual({ isActive: false, isCompleted: false });
  });

  test('AFTER onset objective activates: transit arrives on cue and the objective completes', async () => {
    test.setTimeout(180_000);

    await answerQuiz(page, 'Predicted solar transit on TIDEMARK-1, with window and peak times. Possible 1-3 minute carrier loss near peak, self-recovering. SLA advance notice.');

    // The stand-by hold waits for the sheet's window-open; no transit before it
    await expect.poll(async () => (await readObjective(page, 'stand-by-for-window'))?.isActive, { timeout: 15_000 }).toBe(true);
    expect(await readObjective(page, 'observe-onset')).toEqual({ isActive: false, isCompleted: false });
    expect(await readSkyNoiseDb(page)).toBe(0);
    const skip = page.locator('#objective-skip-control');
    await expect(skip).toBeVisible({ timeout: 15_000 });
    await skip.click();
    await expect.poll(async () => (await readObjective(page, 'observe-onset'))?.isActive, { timeout: 15_000, intervals: [250] }).toBe(true);
    onsetElapsedS = await page.evaluate(() => (window as unknown as SimWindow).missionElapsedMs!() / 1000);

    // Anchored start as the objective comes up, >2 dB ~55 s later: about a minute of run time
    await expect.poll(() => readSkyNoiseDb(page), { timeout: 120_000, intervals: [1000] }).toBeGreaterThan(2);

    // Phase 27 B7: the onset quiz waits for the sky-noise row listed before it
    await answerQuiz(page, 'Confidence that this is the predicted transit, not a coincidental fault, because the alarm tracking the sheet is the diagnosis');

    // Checklist first (DOM), then engine state
    await waitForObjectiveComplete(missionControlPage, 'Confirm Predicted Onset', 30_000);
    expect((await readObjective(page, 'observe-onset'))?.isCompleted).toBe(true);
    expect((await readObjective(page, 'ride-through-peak'))?.isActive).toBe(true);
  });

  test('AFTER: Sky Temp readout reflects the transit instead of clear sky', async () => {
    await missionControlPage.selectTab('acu-control');
    const skyTemp = page.locator('[id$="rf-metric-sky-temp"]:visible').first();

    // Clear-sky antenna temperature is ~14 K. Since phase 19.2 the transit is a
    // rise in system noise: >2 dB on VT-01's ~83 K system adds >50 K of solar
    // noise at the aperture, so the readout climbs past ~65 K
    await expect.poll(async () => parseFloat(((await skyTemp.textContent()) ?? '').replace(/[^\d.]/gu, '')), { timeout: 15_000 }).toBeGreaterThan(50);
  });

  test('Hold Through the Peak waits for the midpoint, not the >6 dB crossing', async () => {
    test.setTimeout(180_000);

    // Onset + 120 s: sky noise is well past 6 dB (about 14.5 dB on the sin^2
    // profile) but still rising, so the peak row must not have ticked
    // (nats-r4-s17-F1: the old >6 dB evaluator fired here)
    await stepMissionTo(page, onsetElapsedS + 120);
    expect(await readSkyNoiseDb(page)).toBeGreaterThan(6);
    expect(await readObjective(page, 'ride-through-peak')).toEqual({ isActive: true, isCompleted: false });

    // Past the midpoint (onset + 150 s): the row ticks and the step completes
    await stepMissionTo(page, onsetElapsedS + 160);
    await expect.poll(async () => (await readObjective(page, 'ride-through-peak'))?.isCompleted, { timeout: 15_000 }).toBe(true);
    // The demod has dropped by the peak, and the relock row has latched it
    expect(await readLockLostSeen(page)).toBe(true);

    await answerQuiz(page, 'The downlink is buried in solar noise at our antenna only, the uplink is fine, and the demodulator relocks as the Sun moves off');
    await expect.poll(async () => (await readObjective(page, 'verify-recovery'))?.isActive, { timeout: 15_000 }).toBe(true);
  });

  test('Verify Self-Recovery completes only after the drop and the relock', async () => {
    test.setTimeout(180_000);

    // The Sun is still close to boresight just after the peak: not recovered yet
    expect((await readObjective(page, 'verify-recovery'))?.isCompleted).toBe(false);

    // Walk through the fall (relock about onset + 220 s, clear under 1 dB by
    // about onset + 296 s)
    await stepMissionTo(page, onsetElapsedS + 305);
    await expect.poll(() => readSkyNoiseDb(page), { timeout: 15_000 }).toBeLessThan(1);
    await expect.poll(async () => (await readObjective(page, 'verify-recovery'))?.isCompleted, { timeout: 30_000 }).toBe(true);
    expect(await readLockLostSeen(page)).toBe(true);
  });
});
