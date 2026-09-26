import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToElapsed, answerStatusCheck, domClick, expectNoMissionFail, keyUpString, selectTxModem, setHpaEnabled } from '../utils/ccs-helpers';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { closeWorkingDocumentIfOpen, loadEphemeris } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ccs Scenario 5 "Ranging Pass" - full completion (phase 18 E).
 *
 * Third TALON-2 backup contact: telemetry LIVE and nominal, uplink armed,
 * three ranging tones before the 02:14Z (T+840) station-keeping burn, one
 * after it (the range steps ~1.5 km with pointing steady), the post-burn set
 * loaded from the Pass Schedule inbox, two more tones for the six-tone arc,
 * the hand-off, safe, log.
 *
 * Objective flow (10):
 *  1. read-the-shift-package  2. acquire-telemetry  3. arm-the-uplink
 *  4. pre-burn-arc            5. watch-the-burn     6. load-the-ephemeris
 *  7. post-burn-arc           8. od-handoff         9. safe-the-uplink
 * 10. log-and-hand-back
 */
test.describe('ccs Scenario 5 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const readFrames = async (): Promise<number> => parseInt((await page.locator('#tlm-frames').textContent()) ?? '0', 10);
  const readRangeCount = async (): Promise<number> => parseInt((await page.locator('#cmd-range-count').textContent()) ?? '0', 10);
  const readLastRangeKm = async (): Promise<number> => parseFloat(((await page.locator('#cmd-range-last').textContent()) ?? '').replace(/[^\d.]/g, ''));

  const sendTone = async (): Promise<void> => {
    await missionControl.selectTab('commanding');
    await expect(page.locator('#cmd-window-badge')).toHaveText('OPEN', { timeout: 10000 });
    const before = await readRangeCount();
    await domClick(page, '#cmd-range-tone');
    await expect.poll(readRangeCount, { timeout: 5000 }).toBe(before + 1);
  };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);
    await missionControl.gotoScenario('ccs', 'ccs-scenario5');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(180000);
  });

  test('[read-the-shift-package] reads the package and why an arc, not a range', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerStatusCheck(page, 'A single range is one number on one line of sight');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Read the Shift Package');
  });

  test('[acquire-telemetry] LIVE and nominal', async () => {
    await missionControl.selectGroundStation('SS-01');
    await missionControl.dismissDialogIfPresent();
    await missionControl.selectTab('telemetry');
    await expect(page.locator('#tlm-link-badge')).toHaveText('LIVE', { timeout: 20000 });
    await expect.poll(readFrames, { timeout: 30000 }).toBeGreaterThanOrEqual(10);
    await expect(page.locator('#tlm-soh-badge')).toHaveText('NOMINAL');
    await page.waitForTimeout(3000);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Acquire Telemetry');
  });

  test('[arm-the-uplink] HPA up and modem 1 keyed', async () => {
    await selectTxModem(page, missionControl, 1);
    await setHpaEnabled(page, missionControl, true);
    await keyUpString(page, missionControl, true);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Arm the Uplink');
  });

  test('[pre-burn-arc] three tones inside the window before the burn', async () => {
    await advanceMissionClockToElapsed(page, 320, 0);
    await sendTone();
    await sendTone();
    await sendTone();
    await expect(page.locator('#cmd-log-body')).toContainText('range');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Pre-Burn Arc');
  });

  test('[watch-the-burn] the fourth tone steps by about 1.5 km after 02:14Z', async () => {
    const preBurnKm = await readLastRangeKm();
    await advanceMissionClockToElapsed(page, 900, 0);
    await sendTone();
    const postBurnKm = await readLastRangeKm();
    const stepKm = Math.abs(postBurnKm - preBurnKm);
    expect(stepKm, `range step ${stepKm.toFixed(2)} km`).toBeGreaterThan(0.5);
    expect(stepKm).toBeLessThan(5);
    await expect(page.locator('#tlm-link-badge')).toBeHidden(); // still on the TT&C tab
    await answerStatusCheck(page, 'The burn: the bird moved along its orbit');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Watch the Burn');
  });

  test('[load-the-ephemeris] loads the post-burn set from the inbox', async () => {
    await loadEphemeris(page, missionControl, 'TALON2-SK');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Load the Post-Burn Set');
  });

  test('[post-burn-arc] two more tones make six', async () => {
    await sendTone();
    await sendTone();
    await expect.poll(readRangeCount).toBeGreaterThanOrEqual(6);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Post-Burn Arc');
  });

  test('[od-handoff] hands the arc to LANTERN', async () => {
    await answerStatusCheck(page, 'Six timed ranges from SANDSTORM');
    await missionControl.dismissDialogIfPresent();
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Hand Off the Solution');
  });

  test('[safe-the-uplink] un-keys modem 1 and disables the HPA', async () => {
    await keyUpString(page, missionControl, false);
    await setHpaEnabled(page, missionControl, false);
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Safe the Uplink');
  });

  test('[log-and-hand-back] logs the contact and completes', async () => {
    await answerStatusCheck(page, '0205Z contact SANDSTORM (backup). Telemetry LIVE, SOH NOMINAL. Ranging arc');
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
