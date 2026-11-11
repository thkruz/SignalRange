import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  debugObjective,
  expectMissionComplete,
  inspectItem,
  openStationTab,
  openTechScenario,
  pttTransmit,
  reveal,
  reviewMissionBrief,
  selectRadioTab,
  setAntennaAzimuth,
  setRadioMode,
  setTxPower,
  setTxTone,
  submitWorksheet,
  tuneRadio,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';
import { advanceUntil, simAdvance } from '../utils/test-clock';

test.use({ testClock: true });

const num = (text: string | null): number => Number.parseFloat((text ?? '').replace(/[^0-9.+-]/gu, ''));

interface PassView {
  az: number;
  el: number;
  above: boolean;
  upMHz: number;
  downMHz: number;
}

/** Read the live pass geometry and the computed Doppler-corrected frequencies from the Satellite pass panel */
async function readPass(page: Page): Promise<PassView> {
  const t = async (id: string): Promise<string | null> => (await reveal(page, id)).textContent();
  return {
    az: num(await t('ham-sat-pass-az')),
    el: num(await t('ham-sat-pass-el')),
    above: ((await t('ham-sat-pass-horizon')) ?? '').startsWith('Above'),
    upMHz: num(await t('ham-sat-doppler-uplink')),
    downMHz: num(await t('ham-sat-doppler-downlink')),
  };
}

/** Point the Yagi at the satellite where the panel says it is now (azimuth and elevation, then Apply) */
async function aimYagi(page: Page, pass: PassView): Promise<void> {
  await (await reveal(page, 'ham-antenna-yagi-el')).fill(String(Math.max(0, Math.round(pass.el))));
  await setAntennaAzimuth(page, 'yagi', Math.round(pass.az));
}

/** Aim the Yagi and retune the SDR to the Doppler-shifted downlink read from the panel */
async function trackDownlink(page: Page): Promise<PassView> {
  const pass = await readPass(page);
  await aimYagi(page, pass);
  await selectRadioTab(page, 'sdr');
  await tuneRadio(page, 'sdr', pass.downMHz);
  return pass;
}

/** Retune the handheld to the Doppler-corrected uplink (and the SDR to the downlink), then key the given intent */
async function keyCorrected(page: Page, intent: Parameters<typeof pttTransmit>[2]): Promise<void> {
  const pass = await trackDownlink(page);
  await selectRadioTab(page, 'ht');
  await tuneRadio(page, 'ht', pass.upMHz);
  await pttTransmit(page, 'ht', intent, 2);
}

/** Keep tracking the downlink every few seconds for the given time */
async function followFor(page: Page, seconds: number): Promise<void> {
  // Counts page time, not wall time: under the test clock a wall-time loop would follow far longer
  for (let followedMs = 0; followedMs < seconds * 1000; followedMs += 3000) {
    await trackDownlink(page);
    await simAdvance(page, 3000);
  }
}

/** True when the nth condition row of an objective is satisfied (window.debugObjective) */
async function conditionMet(page: Page, id: string, index: number): Promise<boolean> {
  const info = (await debugObjective(page, id)) as { conditions?: { isSatisfied: boolean }[] } | null;
  return info?.conditions?.[index]?.isSatisfied === true;
}

/**
 * Campaign 3 Technician S11 "A Contact Through Space" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s11.solve.test.ts, but the pass geometry is the real CUBEHOP-UV orbit:
 * the spec waits for the rise, reads azimuth, elevation and Doppler from the Satellite pass panel and
 * retunes by hand (no hardcoded shifts). Simulated time runs in real time.
 */
test('ham-tech-s11 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(1500000);
  page.setDefaultTimeout(30000);
  await openTechScenario(page, mc, 'ham-tech-s11');
  const step = async (title: string, id: string, quizzes = 0): Promise<void> => {
    if (quizzes > 0) {
      try {
        await answerTechQuizzes(page, quizzes);
      } catch (error) {
        console.log(`${id}: ${JSON.stringify(await debugObjective(page, id))}`);
        throw error;
      }
    }
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(mc, title, 60000);
    } catch (error) {
      console.log(`${id}: ${JSON.stringify(await debugObjective(page, id))}`);
      throw error;
    }
  };

  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);
  await simAdvance(page, 3000);

  // read-pass-card
  await submitWorksheet(page, 's11-pass', {
    uplink: 435.9,
    tone: 67,
    shift: 3.36,
    direction: 'Above 145.900 MHz, then lower as it passes',
  });
  await step('Read the Pass Card', 'read-pass-card', 3);

  // prepare-paths
  await inspectItem(page, 'duplexer');
  await selectRadioTab(page, 'ht');
  await tuneRadio(page, 'ht', 435.9);
  await setTxTone(page, 'ht', 67);
  await setTxPower(page, 'ht', 2.5);
  await selectRadioTab(page, 'sdr');
  await tuneRadio(page, 'sdr', 145.9);
  await setRadioMode(page, 'sdr', 'FM');
  await step('Prepare Both Paths', 'prepare-paths');

  // acquire-downlink: wait for the real rise, receive only, aim the Yagi and follow the Doppler shift
  await (await reveal(page, 'ham-sat-doppler-toggle')).check();
  await advanceUntil(page, async () => (await readPass(page)).above, { maxMs: 720000, stepMs: 2000, message: 'pass rise' });
  console.log(`rise: ${JSON.stringify(await readPass(page))}`);
  await followFor(page, 45);
  console.log(`acquired: ${JSON.stringify(await readPass(page))}`);
  await step('Acquire the Downlink', 'acquire-downlink', 3);

  // The satellite spins, so a short key-up is not always heard cleanly. Wait for a higher pass, as a player would.
  const minEl = 12;
  const rising = async (): Promise<number> => (await trackDownlink(page)).el;
  await expect
    .poll(
      async () => {
        await simAdvance(page, 3000);
        return rising();
      },
      { timeout: 300000, intervals: [100] }
    )
    .toBeGreaterThanOrEqual(minEl);
  console.log(`high enough: ${JSON.stringify(await readPass(page))}`);

  // first-uplink: corrected CQ, then keep following the downlink to hear it come back (retry if the spin faded it)
  let firstKeyAt = 0;
  for (let attempt = 0; attempt < 4 && !(await conditionMet(page, 'first-uplink', 2)); attempt += 1) {
    await keyCorrected(page, { kind: 'cq' });
    if (firstKeyAt === 0) firstKeyAt = await page.evaluate(() => Date.now());
    await followFor(page, 12);
  }
  await step('Send a Modest Uplink', 'first-uplink');

  // follow-doppler: at least 90 s after the first accepted uplink the shift has changed; a second corrected key-up
  await followFor(page, Math.max(0, 95000 - ((await page.evaluate(() => Date.now())) - firstKeyAt)) / 1000);
  await keyCorrected(page, { kind: 'cq' });
  await followFor(page, 4);
  console.log(`second key: ${JSON.stringify(await readPass(page))}`);
  await step('Retune for the Changing Shift', 'follow-doppler');

  // grid-exchange: CQ, hear W0GRD answer, reply with our grid, identify (repeat the whole exchange if the answer faded)
  for (let attempt = 0; attempt < 3 && !(await conditionMet(page, 'grid-exchange', 0)); attempt += 1) {
    await keyCorrected(page, { kind: 'cq' });
    await followFor(page, 14);
    await keyCorrected(page, { kind: 'reply', item: 'grid' });
    await followFor(page, 5);
    await keyCorrected(page, { kind: 'identify' });
    await followFor(page, 14);
  }
  await step('Exchange Grid Squares', 'grid-exchange');

  // explain-fading
  await submitWorksheet(page, 's11-fading', {
    cause: 'The satellite spins, so its antenna turns relative to your linear antenna',
    fix: 'Rotate or tilt your antenna to follow the polarization',
  });
  await step('Explain the Fading', 'explain-fading', 3);

  // log-the-pass (last)
  await submitWorksheet(page, 's11-log', { entry: 'Date, time, CUBEHOP-UV, W0GRD, grid EN34, uplink and downlink frequencies, signal report' });
  await answerTechQuizzes(page, 1);
  await simAdvance(page, 2000);
  await expectMissionComplete(page);
});
