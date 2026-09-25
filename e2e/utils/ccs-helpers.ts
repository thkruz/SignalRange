import { expect, Page } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForQuizToAppear } from './simulation-helpers';

/**
 * Shared helpers for the ccs (Campaign 4, Counter Communications) specs.
 *
 * SANDSTORM (SS-01) is a professional station, so the operator drives it
 * through the Mission Control tabs: one ACU tab per aperture (acu-control-0
 * for the jam dish, acu-control-1 for the look-through monitor), the TX Chain
 * tab for the shared BUC/HPA and the two jam exciters (modem 1 = JAM-A,
 * modem 2 = JAM-B), and the read-only EA Assessment tab for the denial effect.
 *
 * Timing rules:
 * - objective maintainDuration windows tick on REAL time and must be waited
 *   out with the EA Assessment tab selected (requiresObservation conditions
 *   only count while their observationTab is active);
 * - hardwareFaultEvents fire on the MISSION clock (missionNowMs), which
 *   window.advanceClock jumps, so a spec can bring a scheduled trip forward
 *   without waiting wall time.
 *
 * Every click goes through DOM dispatch: the checklist box stays open so the
 * specs can poll it, and it floats over the canvas.
 */

/** Click via DOM dispatch, immune to overlapping draggable boxes. */
export async function domClick(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .evaluate((el) => (el as HTMLElement).click());
}

/** Answer a Character.SYSTEM status-check quiz and dismiss its feedback panel. */
export async function answerStatusCheck(page: Page, answerText: string): Promise<void> {
  await waitForQuizToAppear(page);

  const option = page.locator('.quiz-option-btn', { hasText: answerText });
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();

  const feedbackContinue = page.locator('#quiz-continue-btn');
  await expect(feedbackContinue).toBeVisible({ timeout: 5000 });
  await feedbackContinue.click();
}

/**
 * Mission-elapsed seconds as the HardwareFaultManager sees them (the page's
 * scenario clock: it pauses for the brief and quizzes, and includes skips).
 */
export async function missionElapsedS(page: Page): Promise<number> {
  const elapsedMs = await page.evaluate(() => {
    const hook = (window as unknown as { missionElapsedMs?: () => number }).missionElapsedMs;
    return typeof hook === 'function' ? hook() : 0;
  });
  return elapsedMs / 1000;
}

/**
 * Skip the clock so mission-elapsed is at least `targetS` (plus `marginS`).
 * No-op if already past it. Used to bring a scheduled hardwareFaultEvent
 * forward; the fault fires on the next UPDATE tick.
 */
export async function advanceMissionClockToElapsed(page: Page, targetS: number, marginS = 10): Promise<void> {
  await page.waitForFunction(() => typeof (window as any).advanceClock === 'function');
  const elapsed = await missionElapsedS(page);
  const deltaS = targetS + marginS - elapsed;
  if (deltaS > 0) {
    await page.evaluate((ms) => (window as any).advanceClock(ms), deltaS * 1000);
  }
  await page.waitForTimeout(2500);
}

/**
 * Slew an aperture in MANUAL mode from the ACU tab: click the fine-adjust
 * step buttons to stage the delta, then APPLY. Resolves once the staged
 * change is applied - the pedestal keeps slewing at maxRate_deg_s after that.
 */
export async function slewAntenna(page: Page, missionControl: MissionControlPage, antennaIndex: number, deltaAzDeg: number, deltaElDeg: number): Promise<void> {
  await missionControl.selectTab(`acu-control-${antennaIndex}`);
  await page.waitForTimeout(500);

  const stepClicks = async (axis: 'az' | 'el', deltaDeg: number): Promise<void> => {
    const control = `[id^="${axis}-fine-"][id$="-ant${antennaIndex}"]`;
    await expect(page.locator(control)).toBeVisible({ timeout: 10000 });
    const sign = deltaDeg < 0 ? '-' : '';
    let remaining = Math.abs(deltaDeg);
    for (const step of [10, 1, 0.01]) {
      const n = Math.floor(remaining / step + 1e-9);
      for (let i = 0; i < n; i++) {
        await domClick(page, `${control} .btn-fine[data-delta="${sign}${step}"]`);
        await page.waitForTimeout(60);
      }
      remaining -= n * step;
    }
  };

  await stepClicks('az', deltaAzDeg);
  await stepClicks('el', deltaElDeg);

  const applyBtn = page.locator(`[id$="-ant${antennaIndex}-apply-changes-btn"]`);
  await expect(applyBtn).toBeEnabled({ timeout: 5000 });
  await domClick(page, `[id$="-ant${antennaIndex}-apply-changes-btn"]`);
}

/** Read the ACU tab's active (red) azimuth / elevation for an aperture. */
export async function readAntennaPosition(page: Page, antennaIndex: number): Promise<{ az: number; el: number }> {
  const read = async (axis: 'az' | 'el'): Promise<number> => {
    const text = (await page.locator(`[id^="${axis}-fine-"][id$="-ant${antennaIndex}-value"]`).textContent()) ?? '';
    return parseFloat(text.replace(/[^\d.+-]/g, ''));
  };
  return { az: await read('az'), el: await read('el') };
}

/** Enable (or disable) the jam HPA on the TX Chain tab. */
export async function setHpaEnabled(page: Page, missionControl: MissionControlPage, enabled: boolean): Promise<void> {
  await missionControl.selectTab('tx-chain');
  const hpaEnable = page.locator('#hpa-enable');
  await expect(hpaEnable).toBeVisible({ timeout: 10000 });
  if ((await hpaEnable.isChecked()) !== enabled) {
    await domClick(page, '#hpa-enable');
  }
  if (enabled) {
    await expect(hpaEnable).toBeChecked({ timeout: 5000 });
  } else {
    await expect(hpaEnable).not.toBeChecked({ timeout: 5000 });
  }
  await page.waitForTimeout(300);
}

/** Select a jam string (TX modem) on the TX Chain tab. */
export async function selectTxModem(page: Page, missionControl: MissionControlPage, modemNumber: number): Promise<void> {
  await missionControl.selectTab('tx-chain');
  const btn = page.locator(`.modem-btn[data-modem="${modemNumber}"]`);
  await expect(btn).toBeVisible({ timeout: 10000 });
  await domClick(page, `.modem-btn[data-modem="${modemNumber}"]`);
  await page.waitForTimeout(300);
}

/**
 * Key (or un-key) the currently selected jam string. The exciters are
 * pre-powered, so only the Transmit switch is touched; the power switch is
 * raised first if a scenario ever ships one cold.
 */
export async function keyUpString(page: Page, missionControl: MissionControlPage, transmitting: boolean): Promise<void> {
  await missionControl.selectTab('tx-chain');
  const powerSwitch = page.locator('#tx-power-switch');
  await expect(powerSwitch).toBeVisible({ timeout: 10000 });
  if (transmitting && !(await powerSwitch.isChecked())) {
    await domClick(page, '#tx-power-switch');
    await expect(powerSwitch).toBeChecked({ timeout: 8000 });
    await page.waitForTimeout(4500); // transmitter power-up delay
  }

  const txSwitch = page.locator('#tx-transmit-switch');
  if ((await txSwitch.isChecked()) !== transmitting) {
    await domClick(page, '#tx-transmit-switch');
  }
  if (transmitting) {
    await expect(txSwitch).toBeChecked({ timeout: 5000 });
  } else {
    await expect(txSwitch).not.toBeChecked({ timeout: 5000 });
  }
  await page.waitForTimeout(300);
}

/**
 * Run FAULT RESET on the currently selected string. The reset only takes
 * with the string un-keyed and clears a beat later, so the caller should
 * have the string un-keyed (a tripped exciter already is).
 */
export async function resetFault(page: Page, missionControl: MissionControlPage): Promise<void> {
  await missionControl.selectTab('tx-chain');
  await expect(page.locator('#tx-fault-reset-btn')).toBeVisible({ timeout: 10000 });
  await domClick(page, '#tx-fault-reset-btn');
  await page.waitForTimeout(1000);
}

/** Live per-condition dump of one objective (window.debugObjective dev hook). */
export async function debugObjective(page: Page, objectiveId: string): Promise<unknown> {
  return page.evaluate((id) => {
    const hook = (window as unknown as { debugObjective?: (id: string) => unknown }).debugObjective;
    return typeof hook === 'function' ? hook(id) : { error: 'debugObjective hook missing' };
  }, objectiveId);
}

/** Assert the protected-band interlock (or any other failure) has not ended the mission. */
export async function expectNoMissionFail(page: Page): Promise<void> {
  await expect(page.locator('#objective-failed-modal')).toBeHidden();
}
