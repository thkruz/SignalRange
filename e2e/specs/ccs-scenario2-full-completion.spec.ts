import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceMissionClockToElapsed,
  answerStatusCheck,
  debugObjective,
  expectNoMissionFail,
  keyUpString,
  missionElapsedS,
  readAntennaPosition,
  resetFault,
  selectTxModem,
  setHpaEnabled,
  slewAntenna,
} from '../utils/ccs-helpers';
import { objectiveItem, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ccs Scenario 2 "Failover" - full completion.
 *
 * SANDSTORM (SS-01) denies the COBALT-4 X-band service uplink and holds the
 * effect through two scheduled exciter trips (hardwareFaultEvents): JAM-A
 * (modem 1) at mission T+480 s and JAM-B (modem 2) at T+840 s. Both strings
 * share one BUC/HPA, so every recovery leaves the HPA up and changes strings.
 *
 * Clock handling: the trips fire on the mission clock (missionNowMs), which
 * window.advanceMissionClock jumps, so each trip is brought forward with an
 * explicit jump to just past its schedule. The maintain windows (120 / 120 /
 * 180 s) tick on REAL time and are waited out on the EA Assessment tab, which
 * is the observationTab every jamming-effective condition requires. The
 * first hold has to finish before T+480 so the trip does not lapse it, and
 * the second before T+840 - the elapsed-time budget is asserted rather than
 * assumed.
 *
 * hold-to-recall is the last REQUIRED objective; cease-fire is isOptional and
 * needs the HPA disabled, which would lapse the hold, so it is never driven.
 * The Mission Complete modal pops when hold-to-recall completes and freezes
 * the checklist, so the last step waits on the modal and asserts cease-fire
 * is still open under it. A protected-band hit (8175-8225 MHz) would raise
 * #objective-failed-modal; the spec asserts it never appears.
 */
test.describe('ccs Scenario 2 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;
  /** Wall-clock stamp of scenario boot, for mission-elapsed estimates */
  let wallStartMs = 0;

  const JAM_A_TRIP_S = 480;
  const JAM_B_TRIP_S = 840;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);

    await missionControl.gotoScenario('ccs', 'ccs-scenario2');
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

  test('[acknowledge-tasking] reads the shift package and confirms the ROE', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerStatusCheck(page, 'Any jam waveform overlapping 8175-8225 MHz');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Acknowledge the Tasking Order');
  });

  test('[coordinate-apertures] slews the monitor aperture onto COBALT-4', async () => {
    await missionControl.selectGroundStation('SS-01');
    await missionControl.dismissDialogIfPresent();

    // Monitor aperture (antenna 1) parks at az 90 / el 10; the jam dish is
    // already on the bird. Stage +85 az / +40 el and APPLY.
    await slewAntenna(page, missionControl, 1, 85, 40);

    // 3 m pedestal slews at 3 deg/s: ~30 s to close 85 deg of azimuth
    await expect
      .poll(
        async () => {
          const pos = await readAntennaPosition(page, 1);
          return Math.abs(pos.az - 175) <= 2 && Math.abs(pos.el - 50) <= 2;
        },
        { timeout: 90000, intervals: [1000] }
      )
      .toBe(true);

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Coordinate the Apertures', 30000);
  });

  test('[establish-denial] enables the HPA, keys JAM-A, and drives the link to DENIED', async () => {
    await setHpaEnabled(page, missionControl, true);
    await selectTxModem(page, missionControl, 1);
    await keyUpString(page, missionControl, true);

    // Both jamming conditions require observation on the EA Assessment tab
    await missionControl.selectTab('ea-assessment');
    await missionControl.dismissDialogIfPresent();
    await expect(page.locator('#ea-status-badge')).toContainText('DENIED', { timeout: 30000 });

    await expectNoMissionFail(page);
    await waitForObjectiveComplete(missionControl, 'Establish the Denial Effect', 30000);
  });

  test('[hold-primary] holds the blackout for 120 s on JAM-A', async () => {
    // The first hold must end before the JAM-A trip at T+480 or the trip
    // lapses it. Budget: elapsed now + 120 s window + slack.
    const elapsed = await missionElapsedS(page, wallStartMs);
    expect(elapsed + 120, 'hold-primary must finish before the T+480 trip').toBeLessThan(JAM_A_TRIP_S - 20);

    await missionControl.selectTab('ea-assessment');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Hold the Blackout', 160000);
    await expectNoMissionFail(page);
  });

  test('[detect-first-trip] JAM-A trips at T+480 and the lapse is recognised', async () => {
    await advanceMissionClockToElapsed(page, wallStartMs, JAM_A_TRIP_S);
    await missionControl.dismissDialogIfPresent();

    // Still on the EA tab: the badge leaves DENIED once modem 1 stops radiating
    await expect(page.locator('#ea-status-badge')).not.toContainText('DENIED', { timeout: 20000 });
    await waitForObjectiveComplete(missionControl, 'Recognise the Lapse', 30000);
  });

  test('[failover-backup] isolates the exciter fault and keys JAM-B with the HPA still up', async () => {
    await answerStatusCheck(page, 'The JAM-A exciter tripped; the amplifier is healthy');
    await missionControl.dismissDialogIfPresent();

    // HPA stays enabled; select the backup string and key it
    await selectTxModem(page, missionControl, 2);
    await keyUpString(page, missionControl, true);
    await expect(page.locator('#hpa-enable')).toBeChecked();

    await missionControl.selectTab('ea-assessment');
    await missionControl.dismissDialogIfPresent();
    await expect(page.locator('#ea-status-badge')).toContainText('DENIED', { timeout: 30000 });

    await expectNoMissionFail(page);
    try {
      await waitForObjectiveComplete(missionControl, 'Diagnose and Fail Over', 30000);
    } catch (err) {
      console.log('[failover-backup] debugObjective:', JSON.stringify(await debugObjective(page, 'failover-backup')));
      throw err;
    }
  });

  test('[hold-backup] holds the blackout for 120 s on JAM-B', async () => {
    const elapsed = await missionElapsedS(page, wallStartMs);
    expect(elapsed + 120, 'hold-backup must finish before the T+840 trip').toBeLessThan(JAM_B_TRIP_S - 20);

    await missionControl.selectTab('ea-assessment');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Hold on the Backup', 160000);
    await expectNoMissionFail(page);
  });

  test('[detect-second-trip] JAM-B trips at T+840', async () => {
    await advanceMissionClockToElapsed(page, wallStartMs, JAM_B_TRIP_S);
    await missionControl.dismissDialogIfPresent();

    await expect(page.locator('#ea-status-badge')).not.toContainText('DENIED', { timeout: 20000 });
    await waitForObjectiveComplete(missionControl, 'Second Trip', 30000);
  });

  test('[recover-string] resets the cooled JAM-A exciter, re-keys it, and restores DENIED', async () => {
    const t0 = Date.now();
    const stamp = (label: string) => console.log(`[recover-string] +${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`);

    await answerStatusCheck(page, 'run FAULT RESET with it un-keyed');
    await missionControl.dismissDialogIfPresent();
    stamp('quiz answered');

    // JAM-A has been un-keyed since its own trip: select it, clear the latched
    // fault, then key it behind the still-enabled HPA
    await selectTxModem(page, missionControl, 1);
    await resetFault(page, missionControl);
    stamp('fault reset');
    await keyUpString(page, missionControl, true);
    await expect(page.locator('#hpa-enable')).toBeChecked();
    stamp('JAM-A keyed');

    await missionControl.selectTab('ea-assessment');
    await missionControl.dismissDialogIfPresent();
    await expect(page.locator('#ea-status-badge')).toContainText('DENIED', { timeout: 30000 });
    stamp('DENIED');

    await expectNoMissionFail(page);
    try {
      await waitForObjectiveComplete(missionControl, 'Reset a String and Recover', 30000);
    } catch (err) {
      console.log('[recover-string] debugObjective:', JSON.stringify(await debugObjective(page, 'recover-string')));
      throw err;
    }
  });

  test('[hold-to-recall] carries the effect 180 s to the recall and completes the mission', async () => {
    await missionControl.selectTab('ea-assessment');
    await missionControl.dismissDialogIfPresent();

    // Last REQUIRED objective: its completion pops the Mission Complete modal,
    // which freezes the checklist, so wait on the modal rather than the row.
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 230000 });
    await expect(levelCompleteModal.locator('.complete-modal__title')).toContainText('Mission Complete');

    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();
    expect(parseInt((await totalScore.textContent()) || '0', 10)).toBeGreaterThan(0);
  });

  test('[cease-fire] optional stand-down never gated completion', async () => {
    // cease-fire needs the HPA disabled, which would lapse hold-to-recall, so
    // it is left untouched: the frozen checklist must still show it open.
    const ceaseFire = objectiveItem(missionControl, 'Cease Fire');
    await expect(ceaseFire).toHaveCount(1);
    await expect(ceaseFire).not.toHaveClass(/completed/);
  });

  test('protected-band interlock never tripped', async () => {
    await expectNoMissionFail(page);
  });
});
