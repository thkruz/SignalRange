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
test.describe('ccs Scenario 3 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;
  let wallStartMs = 0;

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
    wallStartMs = Date.now();
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

  test('[call-state-of-health] reads the whole panel and calls NOMINAL', async () => {
    await missionControl.selectTab('telemetry');
    await expect(page.locator('#tlm-soh-badge')).toHaveText('NOMINAL');
    await expect(page.locator('#tlm-link-badge')).toHaveText('LIVE');
    await page.waitForTimeout(3000);
    await answerDecision(page, 'Nominal - every channel inside yellow limits on fresh frames', ['State of health read on Telemetry']);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Call the State of Health');
  });

  test('[arm-the-uplink] retunes modem 1 to the 1200 MHz TT&C IF', async () => {
    await selectTxModem(page, missionControl, 1);
    await setTxModemFrequency(page, missionControl, 1200);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Arm the TT&C Uplink');
  });

  test('[housekeeping-dump] HPA up, modem 1 keyed, HK-DUMP ACKs inside the window', async () => {
    await advanceMissionClockToElapsed(page, wallStartMs, 600);
    await setHpaEnabled(page, missionControl, true);
    await keyUpString(page, missionControl, true);
    await sendCommandAndExpectAck(page, missionControl, 'HK-DUMP');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Housekeeping Dump');
  });

  test('[safe-the-uplink] un-keys modem 1 and disables the HPA', async () => {
    await keyUpString(page, missionControl, false);
    await setHpaEnabled(page, missionControl, false);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Safe the Uplink');
  });

  test('[log-and-hand-back] logs the contact and completes', async () => {
    await answerStatusCheck(page, '0210Z contact SANDSTORM (backup)');
    await missionControl.dismissDialogIfPresent();
    await closeWorkingDocumentIfOpen(page);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    await expectNoMissionFail(page);
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
