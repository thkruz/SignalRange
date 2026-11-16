import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test-fixtures';
import { putDownHeld } from '../utils/ham-sdr-helpers';
import {
  answerTechQuizzes,
  inspectItem,
  openStationTab,
  openTechScenario,
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

// Bench HUD: the header skip control is hidden; the wait is a pusher on the raised wristwatch
const WATCH = '#hud-watch';
const WATCH_WAIT = '.mc-watch-panel .mc-watch-wait';
const SKIP_CONFIRM = '#time-skip-confirm-btn';
const SKIP_OVERLAY = '#time-skip-overlay';

async function readPass(page: Page): Promise<{ az: number; el: number; above: boolean; downMHz: number }> {
  const t = async (id: string): Promise<string | null> => (await reveal(page, id)).textContent();

  return {
    az: num(await t('ham-sat-pass-az')),
    el: num(await t('ham-sat-pass-el')),
    above: ((await t('ham-sat-pass-horizon')) ?? '').startsWith('Above'),
    downMHz: num(await t('ham-sat-doppler-downlink')),
  };
}

/**
 * Campaign 3 Technician S11, missed first pass. The first CUBEHOP-UV pass is over about 17.5 minutes after
 * the start and the next is about 100 minutes later, so settings.timeSkip offers a skip. This spec moves the
 * scenario clock past the first pass with the dev hook (a player would simply have waited), then checks the
 * header skip control is offered, uses it, and acquires the downlink on the next pass.
 */
test('ham-tech-s11 missed first pass is recoverable with the time skip', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(900000);
  page.setDefaultTimeout(30000);
  await openTechScenario(page, mc, 'ham-tech-s11');
  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);
  await simAdvance(page, 3000);

  // Before the first pass has gone there is nothing worth skipping
  await putDownHeld(page);
  await page.locator(WATCH).click();
  await expect(page.locator(`${WATCH_WAIT}:not([disabled])`)).toHaveCount(0);
  await putDownHeld(page);

  // Work the early objectives, then let the first pass go by
  await submitWorksheet(page, 's11-pass', { uplink: 435.9, tone: 67, shift: 3.36, direction: 'Above 145.900 MHz, then lower as it passes' });
  await answerTechQuizzes(page, 3);
  await dismissDialogIfPresent(page);
  await waitForObjectiveComplete(mc, 'Read the Pass Card', 60000);
  await inspectItem(page, 'duplexer');
  await selectRadioTab(page, 'ht');
  await tuneRadio(page, 'ht', 435.9);
  await setTxTone(page, 'ht', 67);
  await setTxPower(page, 'ht', 2.5);
  await selectRadioTab(page, 'sdr');
  await tuneRadio(page, 'sdr', 145.9);
  await setRadioMode(page, 'sdr', 'FM');
  await waitForObjectiveComplete(mc, 'Prepare Both Paths', 60000);

  await page.waitForFunction(() => typeof (window as unknown as { advanceClock?: unknown }).advanceClock === 'function');
  await page.evaluate((ms) => (window as unknown as { advanceClock: (n: number) => void }).advanceClock(ms), 20 * 60_000);
  await simAdvance(page, 1500);
  expect((await readPass(page)).above).toBe(false);

  // The offer appears in the header and names the next pass
  await putDownHeld(page);
  await page.locator(WATCH).click();
  const wait = page.locator(`${WATCH_WAIT}:not([disabled])`).first();
  await expect(wait).toBeVisible({ timeout: 20000 });
  await wait.click();
  await expect(page.locator(SKIP_CONFIRM)).toBeVisible({ timeout: 10000 });
  await page.locator(SKIP_CONFIRM).click();
  await expect(page.locator(SKIP_OVERLAY)).toBeHidden({ timeout: 60000 });
  await dismissDialogIfPresent(page);

  // The skip stops short of the rise: wait for the satellite to come up, then acquire the downlink
  await (await reveal(page, 'ham-sat-doppler-toggle')).check();
  await advanceUntil(page, async () => (await readPass(page)).above, { maxMs: 300000, stepMs: 2000, message: 'pass rise' });
  for (let i = 0; i < 14; i += 1) {
    const pass = await readPass(page);
    await (await reveal(page, 'ham-antenna-yagi-el')).fill(String(Math.max(0, Math.round(pass.el))));
    await setAntennaAzimuth(page, 'yagi', Math.round(pass.az));
    await selectRadioTab(page, 'sdr');
    await tuneRadio(page, 'sdr', pass.downMHz);
    await simAdvance(page, 3000);
  }
  await answerTechQuizzes(page, 3);
  await dismissDialogIfPresent(page);
  await waitForObjectiveComplete(mc, 'Acquire the Downlink', 60000);
});
