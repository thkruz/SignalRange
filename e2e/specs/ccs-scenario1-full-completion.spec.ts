import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceMissionClockToElapsed,
  answerStatusCheck,
  debugObjective,
  expectNoMissionFail,
  keyUpString,
  readAntennaPosition,
  selectTxModem,
  setHpaEnabled,
  slewAntenna,
} from '../utils/ccs-helpers';
import { objectiveItem, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ccs Scenario 1 "Blackout" - full completion.
 *
 * Confirm the ROE, slew the monitor aperture onto COBALT-4, enable the HPA and
 * key JAM-A to drive the link to DENIED, answer the deconfliction check, then
 * fail over to JAM-B when the scheduled JAM-A exciter trip (hardwareFaultEvents,
 * mission T+150 s) fires. The trip runs on the mission clock, which
 * window.advanceClock jumps, so it is brought forward explicitly.
 *
 * failover-backup is the last REQUIRED objective; its completion pops the
 * Mission Complete modal. cease-fire is isOptional and is never driven (the
 * frozen checklist must still show it open). A protected-band hit would raise
 * #objective-failed-modal; the spec asserts it never appears.
 *
 * The denial steps depend on the target downlink being received on the EA
 * Assessment tab (issue 319); no reception is faked here.
 */
test.describe('ccs Scenario 1 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const JAM_A_TRIP_S = 150;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);

    await missionControl.gotoScenario('ccs', 'ccs-scenario1');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(300000);
  });

  test('[confirm-roe] confirms the deconfliction rule', async () => {
    await answerStatusCheck(page, 'Let the jam waveform overlap the friendly 8175-8225 MHz band');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Confirm Rules of Engagement');
  });

  test('[coordinate-apertures] slews the monitor aperture onto COBALT-4', async () => {
    await missionControl.selectGroundStation('SS-01');
    await missionControl.dismissDialogIfPresent();

    // Monitor aperture (antenna 2) parks at az 90 / el 10; the jam dish is
    // already on the bird. Stage +85 az / +40 el and APPLY.
    await slewAntenna(page, missionControl, 1, 85, 40);

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
    try {
      await waitForObjectiveComplete(missionControl, 'Establish the Denial Effect', 30000);
    } catch (err) {
      console.log('[establish-denial] debugObjective:', JSON.stringify(await debugObjective(page, 'establish-denial')));
      throw err;
    }
  });

  test('[deconfliction-check] confirms the jam is clear of the protected band', async () => {
    await answerStatusCheck(page, 'Yes - the jam is well clear of the protected band');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Verify Deconfliction', 30000);
    await expectNoMissionFail(page);
  });

  test('[failover-backup] JAM-A trips at T+150, fail over to JAM-B and restore DENIED', async () => {
    // The trip fires on the mission clock; jump just past T+150
    await advanceMissionClockToElapsed(page, JAM_A_TRIP_S);
    await missionControl.dismissDialogIfPresent();

    // Still on the EA tab: the badge leaves DENIED once modem 1 stops radiating
    await missionControl.selectTab('ea-assessment');
    await expect(page.locator('#ea-status-badge')).not.toContainText('DENIED', { timeout: 20000 });

    // HPA stays enabled; select the backup string and key it
    await selectTxModem(page, missionControl, 2);
    await keyUpString(page, missionControl, true);
    await expect(page.locator('#hpa-enable')).toBeChecked();

    await missionControl.selectTab('ea-assessment');
    await missionControl.dismissDialogIfPresent();
    await expect(page.locator('#ea-status-badge')).toContainText('DENIED', { timeout: 30000 });
    await expectNoMissionFail(page);

    // Last REQUIRED objective: completion pops the Mission Complete modal,
    // which freezes the checklist, so wait on the modal rather than the row.
    const levelCompleteModal = page.locator('#level-complete-modal');
    try {
      await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });
    } catch (err) {
      console.log('[failover-backup] debugObjective:', JSON.stringify(await debugObjective(page, 'failover-backup')));
      throw err;
    }
    await expect(levelCompleteModal.locator('.complete-modal__title')).toContainText('Mission Complete');

    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();
    expect(parseInt((await totalScore.textContent()) || '0', 10)).toBeGreaterThan(0);
  });

  test('[cease-fire] optional stand-down never gated completion', async () => {
    const ceaseFire = objectiveItem(missionControl, 'Cease Fire');
    await expect(ceaseFire).toHaveCount(1);
    await expect(ceaseFire).not.toHaveClass(/completed/u);
  });

  test('protected-band interlock never tripped', async () => {
    await expectNoMissionFail(page);
  });
});
