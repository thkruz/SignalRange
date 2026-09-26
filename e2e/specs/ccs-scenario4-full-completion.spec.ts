import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToElapsed, answerStatusCheck, expectNoMissionFail, keyUpString, selectTxModem, setHpaEnabled } from '../utils/ccs-helpers';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { closeWorkingDocumentIfOpen, sendCommandAndExpectAck } from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ccs Scenario 4 "State of Health" - full completion (phase 18 E).
 *
 * Second TALON-2 backup contact. Telemetry acquired with the battery green;
 * the wheel transient (T+240..300) read in yellow and named a transient; the
 * battery trend (heater stuck from T+420, yellow from ~T+680) read with the
 * heater state beside it; the DEGRADED call graded on soh-yellow-limit;
 * TCS-HTR-OFF ACKed inside the window; the verification read back in green
 * once the recovery ramp (240 s) has run; safe, log, complete.
 *
 * Clock: excursions and the window run on the mission clock, which
 * advanceMissionClockToElapsed jumps; the telemetry manager delivers a fresh
 * frame on the next tick after a jump, so every read waits a beat.
 *
 * Objective flow (10):
 *  1. read-the-shift-package  2. acquire-telemetry   3. the-transient
 *  4. spot-the-trend          5. call-state-of-health 6. arm-the-uplink
 *  7. heater-off              8. verify-the-command   9. safe-the-uplink
 * 10. log-and-hand-back
 */
test.describe('ccs Scenario 4 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const band = (channelId: string) => page.locator(`tr[data-channel-id="${channelId}"] .tlm-band`);
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
    await missionControl.gotoScenario('ccs', 'ccs-scenario4');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(180000);
  });

  test('[read-the-shift-package] reads the package and what an ACK verifies', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerStatusCheck(page, 'That the bird received and accepted the frame');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Read the Shift Package');
  });

  test('[acquire-telemetry] the stream goes LIVE with the battery green', async () => {
    await missionControl.selectGroundStation('SS-01');
    await missionControl.dismissDialogIfPresent();
    await missionControl.selectTab('telemetry');
    await expect(page.locator('#tlm-link-badge')).toHaveText('LIVE', { timeout: 20000 });
    await expect.poll(readFrames, { timeout: 30000 }).toBeGreaterThanOrEqual(10);
    await expect(band('batt-t')).toHaveText('NOMINAL');
    await page.waitForTimeout(3000);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Acquire Telemetry');
  });

  test('[the-transient] wheel 1 reads yellow at T+4:00 and is named a transient', async () => {
    await advanceMissionClockToElapsed(page, 245, 0);
    await missionControl.selectTab('telemetry');
    await expect(band('wheel-rpm')).toHaveText('YELLOW', { timeout: 15000 });
    await page.waitForTimeout(3000);
    await answerStatusCheck(page, 'A transient: a momentum bump the wheel absorbed');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Transient on Wheel 1');
  });

  test('[spot-the-trend] the battery reads yellow with the heater ON beside it', async () => {
    await advanceMissionClockToElapsed(page, 720, 0);
    await missionControl.selectTab('telemetry');
    await expect(band('batt-t')).toHaveText('YELLOW', { timeout: 15000 });
    await expect(band('htr-state')).toHaveText('YELLOW');
    await expect(band('wheel-rpm')).toHaveText('NOMINAL'); // the transient is gone
    await page.waitForTimeout(3000);
    await answerStatusCheck(page, 'A stuck heater: the eclipse-exit heater should have cycled off');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Spot the Trend');
  });

  test('[call-state-of-health] calls DEGRADED with the channel named', async () => {
    await missionControl.selectTab('telemetry');
    await expect(page.locator('#tlm-soh-badge')).toHaveText('YELLOW');
    await page.waitForTimeout(3000);
    await answerDecision(page, 'Degraded - battery temperature in yellow and climbing', ['Battery temperature read on Telemetry']);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Call the State of Health');
  });

  test('[arm-the-uplink] HPA up and modem 1 keyed on the TT&C IF', async () => {
    await selectTxModem(page, missionControl, 1);
    await setHpaEnabled(page, missionControl, true);
    await keyUpString(page, missionControl, true);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Arm the Uplink');
  });

  test('[heater-off] TCS-HTR-OFF ACKs inside the window', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'TCS-HTR-OFF');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Command the Heater Off');
  });

  test('[verify-the-command] the heater reads OFF and the battery comes back inside limits', async () => {
    await missionControl.selectTab('telemetry');
    await page.waitForTimeout(2500);
    await expect(band('htr-state')).toHaveText('NOMINAL', { timeout: 15000 });
    // The recovery ramp is 240 s of mission time: jump past it.
    await advanceMissionClockToElapsed(page, 1100, 0);
    await missionControl.selectTab('telemetry');
    await expect(band('batt-t')).toHaveText('NOMINAL', { timeout: 20000 });
    await page.waitForTimeout(3000);
    await answerStatusCheck(page, 'Both, in order: the heater state changing proves the command executed');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Verify the Command');
  });

  test('[safe-the-uplink] un-keys modem 1 and disables the HPA', async () => {
    await keyUpString(page, missionControl, false);
    await setHpaEnabled(page, missionControl, false);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Safe the Uplink');
  });

  test('[log-and-hand-back] logs the contact and completes', async () => {
    await answerStatusCheck(page, '0205Z contact SANDSTORM (backup). Telemetry LIVE. T+4:00 wheel 1 transient');
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
