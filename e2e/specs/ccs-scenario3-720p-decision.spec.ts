import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceMissionClockToElapsed,
  answerStatusCheck,
  expectNoMissionFail,
  keyUpString,
  readAntennaPosition,
  selectTxModem,
  setHpaEnabled,
  slewAntenna,
} from '../utils/ccs-helpers';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { closeWorkingDocumentIfOpen, sendCommandAndExpectAck, setTxModemFrequency } from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ccs Scenario 3 "First Shift" - full completion (phase 18 E).
 *
 * The contractor's first shift: TT&C backup for TALON-2, the unit's own
 * X-band relay. Jam strings confirmed cold, monitor aperture slewed from its
 * park (az 90 / el 10) onto TALON-2 (az 166 / el 50), telemetry acquired on
 * the new Telemetry tab, each subsystem read in band, the state-of-health
 * decision graded on fresh frames inside limits, modem 1 retuned to the 1200
 * MHz TT&C IF, HK-DUMP ACKed inside the T+10:00 .. T+40:00 window, the chain
 * safed, the contact logged.
 *
 * Objective flow (12):
 *  1. read-the-shift-package  2. jam-strings-cold      3. point-the-monitor
 *  4. acquire-telemetry       5. read-the-power-bus    6. read-the-thermal
 *  7. read-attitude-and-comm  8. call-state-of-health  9. arm-the-uplink
 * 10. housekeeping-dump      11. safe-the-uplink      12. log-and-hand-back
 */
test.use({ viewport: { width: 1280, height: 720 } });
test.describe('ccs Scenario 3 at 1280x720: decision Continue and next objective stay visible', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const readFrames = async (): Promise<number> => parseInt((await page.locator('#tlm-frames').textContent()) ?? '0', 10);

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);
    await missionControl.gotoScenario('ccs', 'ccs-scenario3');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(180000);
  });

  test('[read-the-shift-package] reads the package and confirms the role', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerStatusCheck(page, 'Backup TT&C: telemetry on the monitor aperture');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Read the Shift Package');
  });

  test('[jam-strings-cold] reads the TX chain cold', async () => {
    await missionControl.selectGroundStation('SS-01');
    await missionControl.dismissDialogIfPresent();
    await missionControl.selectTab('tx-chain');
    await expect(page.locator('#hpa-enable')).not.toBeChecked();
    await expect(page.locator('#tx-transmit-switch')).not.toBeChecked();
    await page.waitForTimeout(3000);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Confirm the Jam Strings Are Cold');
  });

  test('[point-the-monitor] slews the monitor aperture onto TALON-2', async () => {
    // Park az 90 / el 10; TALON-2 at az 166.0 / el 49.6. Stage +76 / +40 and APPLY.
    await slewAntenna(page, missionControl, 1, 76, 40);
    await expect
      .poll(
        async () => {
          const pos = await readAntennaPosition(page, 1);
          return Math.abs(pos.az - 166) <= 2 && Math.abs(pos.el - 50) <= 2;
        },
        { timeout: 90000, intervals: [1000] }
      )
      .toBe(true);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Point the Monitor at TALON-2', 30000);
  });

  test('[acquire-telemetry] the stream goes LIVE and the frame counter climbs', async () => {
    await missionControl.selectTab('telemetry');
    await expect(page.locator('#tlm-link-badge')).toHaveText('LIVE', { timeout: 20000 });
    await expect.poll(readFrames, { timeout: 30000 }).toBeGreaterThanOrEqual(10);
    await expect(page.locator('#tlm-soh-badge')).toHaveText('NOMINAL');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Acquire Telemetry');
  });

  test('[read-the-power-bus] reads EPS in band', async () => {
    await missionControl.selectTab('telemetry');
    await expect(page.locator('tr[data-channel-id="bus-v"] .tlm-band')).toHaveText('NOMINAL');
    await expect(page.locator('tr[data-channel-id="batt-soc"] .tlm-band')).toHaveText('NOMINAL');
    await page.waitForTimeout(3000);
    await answerStatusCheck(page, 'The array is carrying the load and topping the battery');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Read the Power Subsystem');
  });

  test('[read-the-thermal] reads TCS in band', async () => {
    await missionControl.selectTab('telemetry');
    await expect(page.locator('tr[data-channel-id="batt-t"] .tlm-band')).toHaveText('NOMINAL');
    await page.waitForTimeout(3000);
    await answerStatusCheck(page, 'The battery: its limits are tight');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Read the Thermal Picture');
  });

  test('[read-attitude-and-comm] reads ADCS and COMM in band', async () => {
    await missionControl.selectTab('telemetry');
    await expect(page.locator('tr[data-channel-id="wheel-rpm"] .tlm-band')).toHaveText('NOMINAL');
    await page.waitForTimeout(3000);
    await answerStatusCheck(page, 'Stored momentum: a wheel spins to hold the bird still');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Read Attitude and Comms');
  });

  test('[call-state-of-health] Continue is on screen and the checklist shows the next objective', async () => {
    await missionControl.selectTab('telemetry');
    await expect(page.locator('#tlm-soh-badge')).toHaveText('NOMINAL');
    await page.waitForTimeout(3000);
    const modal = page.locator('#decision-modal');
    for (let k = 0; k < 40 && !(await modal.isVisible()); k++) {
      const openQuiz = page.getByText('Open Quiz');
      if (await openQuiz.isVisible()) await openQuiz.click();
      await page.waitForTimeout(500);
    }
    const onScreen = async (sel: string): Promise<{ top: number; bottom: number; vh: number }> =>
      modal
        .locator(sel)
        .last()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
        });
    // Opens inside the viewport before any answer: every option, including the last, is on screen
    const lastOption = await onScreen('.quiz-option-btn');
    expect(lastOption.top).toBeGreaterThanOrEqual(0);
    expect(lastOption.bottom).toBeLessThanOrEqual(lastOption.vh);
    const boxOpen = await modal.evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight);
    expect(boxOpen).toBe(true);
    await page.screenshot({ path: 'shots/decision-open-1280.png' });
    // Drag the box by its title bar (down and sideways): the drag cap must not spill content past the border
    const bar = modal.locator('.draggable-box__title-bar').first();
    const bb = (await bar.boundingBox())!;
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    // A wrong answer grows the box with feedback; it must stay inside the viewport too
    await modal.locator('.quiz-option-btn', { hasNotText: 'Nominal - every channel' }).first().click();
    await expect(modal.locator('.feedback-incorrect')).toBeVisible();
    const explained = await modal.evaluate((el) => {
      const e = el.querySelector('.feedback-explanation')!.getBoundingClientRect();
      const c = el.querySelector('.draggable-box__content')!.getBoundingClientRect();
      return e.top >= c.top - 1 && e.bottom <= c.bottom + 1;
    });
    expect(explained).toBe(true);
    const wrongBox = await modal.evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight);
    expect(wrongBox).toBe(true);
    await page.screenshot({ path: 'shots/decision-fail-1280.png' });
    await modal.locator('.quiz-option-btn', { hasText: 'Nominal - every channel' }).first().click();
    const cont = modal.locator('#decision-continue-btn');
    await expect(cont).toBeVisible();
    await page.screenshot({ path: 'shots/decision-answered-1280.png' });
    const rect = await cont.evaluate((b) => {
      const r = b.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
    });
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(rect.vh - 4);
    // The penalty notice renders below Continue after a wrong-then-right answer; it must be inside the content too
    const penaltyInside = await modal.evaluate((el) => {
      const n = el.querySelector('#decision-penalty-notice') as HTMLElement;
      if (getComputedStyle(n).display === 'none') return null;
      const r = n.getBoundingClientRect();
      const c = el.querySelector('.draggable-box__content')!.getBoundingClientRect();
      return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
    });
    expect(penaltyInside).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: 'shots/decision-dragged-continue-720.png' });
    await cont.click();
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Call the State of Health');

    // Next objective is active and scrolled into the checklist window
    const next = page.locator('#draggable-html-box-checklist .objective-item.active', { hasText: 'Arm the TT&C Uplink' });
    await expect(next).toHaveCount(1);
    await expect
      .poll(async () =>
        next.evaluate((el) => {
          const box = document.querySelector('#draggable-html-box-content-checklist') as HTMLElement;
          const r = el.getBoundingClientRect();
          const c = box.getBoundingClientRect();
          return r.top >= c.top - 1 && r.top < c.bottom;
        })
      )
      .toBe(true);
    await page.screenshot({ path: 'shots/checklist-next-objective-1280.png' });
  });
});
