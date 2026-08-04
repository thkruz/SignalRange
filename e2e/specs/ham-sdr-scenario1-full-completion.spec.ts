import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceSimClock,
  answerRileyQuiz,
  domClick,
  rideUntilObjectiveComplete,
  waitForObjectiveComplete,
} from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ham-sdr Scenario 1 "First Light" - full completion.
 *
 * The campaign opener on the fixed QFH: the rig boots as Riley left it after
 * an FM session - VFO parked at 137.170 MHz (70 kHz above the bird) on a
 * 15 kHz voice channel that cannot fit the 34 kHz APT signal. The player has
 * to click-to-tune onto the stripe, open the channel to 50 kHz, lock, and
 * then hold the lock hands-off for 45 s (VHF Doppler ~+/-3 kHz stays inside
 * the channel, so hands-off holds). RF envelope live-verified in phase 1
 * (AOS T+3.0, max el 55.1 at T+10.6, LOS T+18.3, start 2027-06-19 16:00 UTC).
 *
 * Also asserts the sign-up funnel: this run is unauthenticated, so the
 * Mission Complete modal must offer Sign Up / Log In (progress only persists
 * to an account; the CTA is how an anonymous player keeps the completion).
 */
test.describe('ham-sdr Scenario 1 Full Completion', () => {
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

    await missionControl.gotoScenario('ham-sdr', 'ham-sdr-scenario1');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(240000);
  });

  test('[review-mission-brief] reads the note and answers the beamwidth quiz', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerRileyQuiz(page, 'Its beam is enormous');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, "Read Riley's Note");
  });

  test('[check-observations] opens the Observations list', async () => {
    await missionControl.selectGroundStation('BKYD-QFH');
    await missionControl.selectTab('pass-schedule');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Check the Observations List');
  });

  test('[detect-apt] sees the APT downlink appear on the waterfall', async () => {
    // Jump into the pass - well past AOS, toward the strong segment
    await advanceSimClock(page, 5);

    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    // Detection is watching the waterfall - the demodulator is still
    // mis-tuned and too narrow, and that must not matter here
    await waitForObjectiveComplete(missionControl, 'See First Light', 90000);
  });

  test('[tune-apt] clicks the stripe to pull the VFO onto the bird', async () => {
    // The APT stripe sits at 137.100 MHz - the exact center of the 200 kHz
    // view (speca center 137.1, span 200 kHz), while the VFO is parked 70 kHz
    // high. Click-to-tune at the horizontal center of the display stack.
    // DOM-dispatched with coordinates: the draggable checklist can float over
    // the console and swallow real pointer clicks (S2 lesson).
    await page.locator('#sdr-display-stack').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('click', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
      }));
    });

    // Fallback: if display padding skewed the click outside +/-5 kHz, the
    // WXSAT-19 bookmark tunes exactly
    const tuned = await page
      .waitForFunction(() => {
        const item = [...document.querySelectorAll('.objective-item')]
          .find((el) => el.textContent?.includes('Put the VFO on the Bird'));
        return item?.classList.contains('completed') ?? false;
      }, { timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    if (!tuned) {
      await domClick(page, '.sdr-bookmark');
    }

    await waitForObjectiveComplete(missionControl, 'Put the VFO on the Bird');
  });

  test('[lock-apt] opens the channel to 50 kHz and locks', async () => {
    // On frequency but still no decode: the 15 kHz voice channel clips the
    // 34 kHz APT signal. Open it to 50 kHz; lock follows on its own.
    const bwInput = page.locator('#sdr-bw-input');
    await bwInput.fill('50');
    await bwInput.dispatchEvent('change');

    await waitForObjectiveComplete(missionControl, 'Open the Channel and Lock', 90000);
  });

  test('[hold-the-picture] holds the lock hands-off for 45 seconds', async () => {
    await missionControl.dismissDialogIfPresent();

    // Real-time maintain window - no sim jumps, no corrections, hands off
    const everLocked = await rideUntilObjectiveComplete(
      page,
      missionControl,
      "Don't Touch What's Working",
      { maxMs: 120_000, correct: false },
    );
    expect(everLocked).toBe(true);
  });

  test('[first-light-log] answers the Doppler-contrast quiz and completes the mission', async () => {
    await answerRileyQuiz(page, 'the 50 kHz channel swallows it');
    await missionControl.dismissDialogIfPresent();

    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    const modalTitle = page.locator('#level-complete-modal .complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');
  });

  test('[signup-funnel] unauthenticated completion offers Sign Up / Log In', async () => {
    // This run is signed out, so the completion cannot be saved to an account
    // yet - the modal must show the sign-up funnel instead of losing it silently
    const signupSection = page.locator('#complete-signup-section');
    await expect(signupSection).toBeVisible();
    await expect(signupSection).toContainText('Create a free account');

    // The CTA opens the login/sign-up modal on top of the completion modal
    await domClick(page, '#signup-save-btn');
    await expect(page.locator('#modal-login')).toBeVisible({ timeout: 10000 });
  });
});
