import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceMissionClock,
  answerRileyQuiz,
  domClick,
  waitForObjectiveComplete,
} from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ham-sdr Scenario 5 "The Noise Bump" - full completion.
 *
 * Security-half opener on the GPS patch: detect the L1 spread-spectrum hump
 * (NAVSTAR-77 is overhead all scenario - no pass to catch), then survive a
 * GPS spoofing attack. The spoofer is an E1 terrestrial emitter (narrow strong
 * carrier on 1575.42, no Doppler) paired with the gnssThreat clock walk; the
 * defense is the E4 REF control (GPS -> HOLDOVER -> back to GPS).
 *
 * Spoof window is mission-elapsed 420-900 s, so the spec crosses it with
 * advanceMissionClock (jumps BOTH clocks, unlike advanceSimClock). The
 * go-holdover maintain window (60 s) ticks on REAL time and is waited out.
 */
test.describe('ham-sdr Scenario 5 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);

    await missionControl.gotoScenario('ham-sdr', 'ham-sdr-scenario5');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(240000);
  });

  test('[review-mission-brief] reads the note and answers the spread-spectrum quiz', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerRileyQuiz(page, 'correlates against that code');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, "Read Riley's Note");
  });

  test('[find-the-hump] detects L1 on the waterfall and answers the detect-vs-demod quiz', async () => {
    await missionControl.selectGroundStation('BKYD-GPS');
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    await answerRileyQuiz(page, 'different privileges');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Find the Noise Bump', 90000);
  });

  test('[spot-the-spoofer] the terrestrial L1 carrier appears after the spoof window opens', async () => {
    // Cross the spoofStartS=420 threshold on the mission clock
    await advanceMissionClock(page, 8);

    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Something New on L1', 90000);
  });

  test('[read-the-tell] CLK deltaT walks while SATS stay healthy; quiz names the spoof', async () => {
    // E4 assertion: the timing-offset readout is actually walking
    await expect
      .poll(async () => {
        const text = (await page.locator('#sdr-clk-offset-readout').textContent()) ?? '';
        return parseFloat(text.replace(/[^\d.+-]/g, ''));
      }, { timeout: 30000 })
      .toBeGreaterThan(1);
    await expect(page.locator('#sdr-ref-readout')).toContainText('GPS');

    await answerRileyQuiz(page, 'walks your clock');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Read the Clock');
  });

  test('[go-holdover] flips REF to holdover and holds it for the 60 s window', async () => {
    await domClick(page, '#sdr-ref-toggle');
    await expect(page.locator('#sdr-ref-readout')).toContainText('HOLDOVER', { timeout: 10000 });

    // Offset must FREEZE in holdover: sample twice across several seconds
    const readOffset = async () => {
      const text = (await page.locator('#sdr-clk-offset-readout').textContent()) ?? '';
      return parseFloat(text.replace(/[^\d.+-]/g, ''));
    };
    const before = await readOffset();
    await page.waitForTimeout(6000);
    const after = await readOffset();
    expect(after - before).toBeLessThan(1);

    // maintainDuration 60 ticks on real time
    await waitForObjectiveComplete(missionControl, 'Stop Trusting GPS', 120000);
  });

  test('[all-clear] rides out the spoof, verifies the environment, returns to GPS', async () => {
    // Cross spoofEndS=900: the spoofer leaves the air and the walk stops
    await advanceMissionClock(page, 8);
    await missionControl.dismissDialogIfPresent();

    // Back to GPS (5 s reacquisition inside the GPSDO core)
    await domClick(page, '#sdr-ref-toggle');
    await expect(page.locator('#sdr-ref-readout')).toContainText('GPS', { timeout: 15000 });

    await answerRileyQuiz(page, 'stopped growing');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Ride It Out, Then Come Back', 60000);
  });

  test('[noise-bump-log] logs the principle and completes the mission', async () => {
    await answerRileyQuiz(page, 'physics were wrong');
    await missionControl.dismissDialogIfPresent();

    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    const modalTitle = page.locator('#level-complete-modal .complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');
  });
});
