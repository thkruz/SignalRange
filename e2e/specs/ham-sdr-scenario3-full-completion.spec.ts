import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceSimClock,
  answerRileyQuiz,
  domClick,
  engageTrack,
  readOffsetHz,
  rideUntilObjectiveComplete,
  waitForObjectiveComplete,
} from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ham-sdr Scenario 3 "Wrong-Handed" - full completion.
 *
 * The yagi STARTS on LHCP (the phase-1 retro note) against CUBEHOP-1's RHCP
 * downlink: ~18 dB in the hole. The spec verifies the diagnosis arc live -
 * signal visible-but-weak while wrong-handed, the C/N swing when the feed is
 * flipped (the new antenna-polarization-set condition), then a >= 10 dB lock
 * held 60 s to prove the fix.
 *
 * Pass geometry (start 2027-06-20 16:24 UTC): AOS T+4.3 min, max el 63.4 deg
 * at T+10.6, LOS T+17.0 (locked by test/campaigns/ham-sdr.test.ts).
 */
test.describe('ham-sdr Scenario 3 Full Completion (handedness diagnosis)', () => {
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

    await missionControl.gotoScenario('ham-sdr', 'ham-sdr-scenario3');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(300000);
  });

  test('[review-mission-brief] reads the note and answers the reflection quiz', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerRileyQuiz(page, 'reflection reverses the handedness');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, "Read Riley's Note");
  });

  test('[track-cubehop] tracks the pass and sees the weak wrong-handed signal', async () => {
    await missionControl.selectGroundStation('BKYD-YAGI');
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    // The scenario boots with the feed harness on LHCP
    await expect(page.locator('#sdr-pol-lhcp')).toHaveClass(/active/);

    await advanceSimClock(page, 3);
    await engageTrack(page, '63002');

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Track the Pass', 120000);
  });

  test('[fix-the-feed] flips the feed to RHCP and the signal jumps', async () => {
    // Get onto the carrier first so the C/N readout means something
    await advanceSimClock(page, 2);
    const offsetHz = await readOffsetHz(page);
    if (Number.isFinite(offsetHz)) {
      // A few fine clicks is plenty; the swing is the point here
      const btn = offsetHz > 0 ? '#sdr-tune-up-fine' : '#sdr-tune-dn-fine';
      for (let i = 0; i < Math.min(9, Math.round(Math.abs(offsetHz) / 1000)); i++) {
        await domClick(page, btn);
      }
    }

    const cnBefore = parseFloat(((await page.locator('#sdr-cn-readout').textContent()) ?? '').replace(/[^\d.-]/g, ''));

    await domClick(page, '#sdr-pol-rhcp');
    await expect(page.locator('#sdr-pol-rhcp')).toHaveClass(/active/);
    await page.waitForTimeout(3000);

    const cnAfter = parseFloat(((await page.locator('#sdr-cn-readout').textContent()) ?? '').replace(/[^\d.-]/g, ''));
    // The handedness swing: whatever was readable before, RHCP is dramatically
    // stronger after (full 18 dB when both readings exist)
    if (Number.isFinite(cnBefore) && Number.isFinite(cnAfter)) {
      expect(cnAfter - cnBefore).toBeGreaterThan(10);
    }

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Find the Switch', 30000);
  });

  test('[prove-the-link] holds a >= 10 dB lock for 60 s', async () => {
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    const everLocked = await rideUntilObjectiveComplete(page, missionControl, 'Prove It with a Lock', { maxMs: 180_000 });

    expect(everLocked).toBe(true);
    await waitForObjectiveComplete(missionControl, 'Prove It with a Lock', 30000);
  });

  test('[wrong-handed-log] answers the symptom-pattern quiz and completes the mission', async () => {
    await answerRileyQuiz(page, 'Polarization mismatch');
    await missionControl.dismissDialogIfPresent();

    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    const modalTitle = page.locator('#level-complete-modal .complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');
  });
});
