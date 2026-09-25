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
 * (startAfterObjectiveId: 'observe-onset', 20 s after it activates), and the
 * Sky Temp readout includes the transit's noise.
 *
 * This spec plays a slow operator: it parks on 'Pre-Event Notification' and
 * jumps the scenario clock through the entire old window (window.advanceClock
 * moves every mission-elapsed schedule but not objective countdowns).
 *  - BEFORE the onset objective: the old peak time and the old window's end
 *    both pass with zero sky noise and no active weather event. (Old engine:
 *    ~12 dB at T+450 s - this test fails.)
 *  - AFTER the onset objective activates: the transit arrives on cue, the
 *    checklist condition ticks, the objective completes, and Sky Temp climbs
 *    far above the clear-sky 10 K. (Old engine: sky noise stays 0 - fails.)
 */

type SimWindow = {
  advanceClock?: (ms: number) => void;
  missionElapsedMs?: () => number;
  signalRange?: {
    simulationManager?: {
      groundStations?: Array<{ state?: { id?: string }; antennas?: Array<{ state?: { skyNoiseDegradation_dB?: number } }> }>;
      objectivesManager?: { getObjectiveState: (id: string) => { isActive: boolean; isCompleted: boolean } | undefined };
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

  test('play the pre-window objectives up to Pre-Event Notification', async () => {
    await answerQuiz(page, 'Acknowledged - prediction sheet reviewed, pre-event checklist starting now.');
    await missionControlPage.selectGroundStation('VT-01');

    await missionControlPage.selectTab('dashboard');
    await answerQuiz(page, 'Anything abnormal after window-open gets blamed on the Sun - a hidden fault only shows if the board was provably clean before');
    await answerQuiz(page, 'The Sun (~20,000 K at C-band) passes through the main beam behind the satellite - noise soars, C/N collapses, signal unchanged');
    await answerQuiz(page, 'Twice a year near the equinoxes - a few minutes a day for several days, at a time computable years ahead from the geometry');

    await missionControlPage.selectTab('rx-analysis');
    await waitForObjectiveComplete(missionControlPage, 'Baseline RX Snapshot');
    await answerQuiz(page, 'Brief, predicted, SLA-excluded with notice - a handover costs two transfer events, and ME-02 gets its own transit anyway');

    // Parked on the notice quiz: onset objective not yet up
    await waitForQuizToAppear(page);
    expect(await readObjective(page, 'notify-customer-quiz')).toEqual({ isActive: true, isCompleted: false });
    expect(await readObjective(page, 'observe-onset')).toEqual({ isActive: false, isCompleted: false });
  });

  test('BEFORE onset objective: no transit through the old T+300..600 s window', async () => {
    // The old schedule's peak (T+450 s: ~12 dB on the unfixed engine)
    const atOldPeak = await advanceMissionTo(page, 450);
    expect(atOldPeak).toBeGreaterThanOrEqual(450);
    expect(await readSkyNoiseDb(page)).toBe(0);

    // Past the old window entirely - where the reported players were stuck
    const pastOldWindow = await advanceMissionTo(page, 720);
    expect(pastOldWindow).toBeGreaterThanOrEqual(720);
    expect(await readSkyNoiseDb(page)).toBe(0);
    expect(await readObjective(page, 'observe-onset')).toEqual({ isActive: false, isCompleted: false });
  });

  test('AFTER onset objective activates: transit arrives on cue and the objective completes', async () => {
    test.setTimeout(180_000);

    await answerQuiz(
      page,
      'Predicted solar transit on TIDEMARK-1, window and peak times attached; possible 1-3 minute carrier loss near peak, self-recovering; this is SLA advance notice.'
    );
    await expect.poll(async () => (await readObjective(page, 'observe-onset'))?.isActive, { timeout: 15_000 }).toBe(true);

    await answerQuiz(page, 'Confidence this is the predicted transit, not a coincidental fault - the alarm tracking the sheet IS the diagnosis');

    // Anchor + 20 s start, >2 dB ~40 s later: about a minute of run time
    await expect.poll(() => readSkyNoiseDb(page), { timeout: 120_000, intervals: [1000] }).toBeGreaterThan(2);

    // Checklist first (DOM), then engine state
    await waitForObjectiveComplete(missionControlPage, 'Confirm Predicted Onset', 30_000);
    expect((await readObjective(page, 'observe-onset'))?.isCompleted).toBe(true);
    expect((await readObjective(page, 'ride-through-peak'))?.isActive).toBe(true);
  });

  test('AFTER: Sky Temp readout reflects the transit instead of clear sky', async () => {
    await missionControlPage.selectTab('acu-control');
    const skyTemp = page.locator('[id$="rf-metric-sky-temp"]:visible').first();

    // Clear sky is ~10 K; >2 dB of sun noise at 290 K is >170 K
    await expect.poll(async () => parseFloat(((await skyTemp.textContent()) ?? '').replace(/[^\d.]/g, '')), { timeout: 15_000 }).toBeGreaterThan(150);
  });
});
