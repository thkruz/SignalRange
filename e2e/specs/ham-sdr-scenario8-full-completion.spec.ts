import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceMissionClockToUtc,
  answerRileyQuiz,
  domClick,
  engageTrack,
  rideUntilObjectiveComplete,
  waitForObjectiveComplete,
} from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ham-sdr Scenario 8 "Callsign" - full completion. The campaign finale on the
 * TX-capable yagi rig (E2) plus the weather rig:
 * 1. Riley's license exam (two status-check quizzes),
 * 2. pirate carrier relayed by CUBEHOP's V/U transponder (pass 15:55, 28.9 deg),
 * 3. first TX: uplink 435.900, key, lock own downlink at 435.290 (pass 17:31),
 * 4. fake WXSAT-19 beacon on the QFH at ~17:47 with a provably empty sky.
 *
 * Clock jumps use advanceMissionClockToUtc (sim + mission together) - the
 * interference envelopes run on the mission clock.
 */
test.describe('ham-sdr Scenario 8 Full Completion', () => {
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

    await missionControl.gotoScenario('ham-sdr', 'ham-sdr-scenario8');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(300000);
  });

  test('[review-mission-brief] reads the note', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, "Read Riley's Note");
  });

  test('[exam] passes both license-exam questions', async () => {
    await answerRileyQuiz(page, 'all three have to be true');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Exam, Part One');

    await answerRileyQuiz(page, 'self-policing');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Exam, Part Two');
  });

  test('[hear-the-pirate] tracks the afternoon pass and hears the pirate downlink', async () => {
    await missionControl.selectGroundStation('BKYD-YAGI');
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    // The TRANSMIT section exists on this rig (E2) - and only on this rig
    await expect(page.locator('#sdr-tx-key')).toBeVisible();
    await expect(page.locator('#sdr-tx-status')).toHaveText('STANDBY');

    // Jump to just before the 15:55:47 AOS; the pirate keyed up at T+20 min
    await advanceMissionClockToUtc(page, '2027-06-26T15:54:30Z');
    await engageTrack(page, '63002');

    await waitForObjectiveComplete(missionControl, 'Somebody Is Already on the Bird', 180000);
  });

  test('[pirate-ethics] explains what the transponder could NOT do', async () => {
    await answerRileyQuiz(page, 'authorization lives in licenses');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'What Makes a Transmission Authorized');
  });

  test('[set-uplink] dials the TX to 435.900', async () => {
    const txFreq = page.locator('#sdr-tx-freq');
    await txFreq.fill('435.900');
    await txFreq.dispatchEvent('change');

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Dial In the Uplink');
  });

  test('[first-contact] keys the transmitter and locks its own transponded downlink', async () => {
    // Jump to just before the 17:31:29 AOS (the pirate is long gone)
    await advanceMissionClockToUtc(page, '2027-06-26T17:30:30Z');

    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();
    await engageTrack(page, '63002');

    // Key the transmitter: the ON AIR pill and the red key confirm the E2 chain
    await domClick(page, '#sdr-tx-key');
    await expect(page.locator('#sdr-tx-status')).toHaveText('ON AIR');

    // Tune the receiver from the 435.25 beacon up to the 435.29 return
    // (4 coarse clicks = +40 kHz), then let AFC ride the downlink Doppler
    for (let i = 0; i < 4; i++) {
      await domClick(page, '#sdr-tune-up-coarse');
    }
    await domClick(page, '#sdr-afc-toggle');

    // The objective's receiver-signal-locked condition IS the lock proof;
    // the ride loop's own lock-indicator poll (every 4 s) can miss a fast
    // lock entirely, so assert the checklist rather than the side-channel
    await rideUntilObjectiveComplete(
      page,
      missionControl,
      'Work Yourself Through the Bird',
      { maxMs: 300_000, correct: true },
    );
    await waitForObjectiveComplete(missionControl, 'Work Yourself Through the Bird', 10000);

    // And the E2 chain's physical readout: the brick amp is putting out real watts
    await expect(page.locator('#sdr-tx-pa-readout')).toHaveText('1.3 W');
  });

  test('[clear-the-channel] unkeys after the contact', async () => {
    await domClick(page, '#sdr-tx-key');
    await expect(page.locator('#sdr-tx-status')).toHaveText('STANDBY');

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Clear the Channel');
  });

  test('[unmask-the-beacon] catches the fake WXSAT beacon on the weather rig and completes', async () => {
    // Fake beacon on the air at T+8200 s (~17:46:40); WXSAT is below the horizon
    await advanceMissionClockToUtc(page, '2027-06-26T17:47:30Z');

    await missionControl.selectGroundStation('BKYD-QFH');
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    // The QFH rig is RX-only: the TRANSMIT section renders the stub, not a key
    await expect(page.locator('#sdr-tx-key')).toHaveCount(0);

    await answerRileyQuiz(page, 'the real bird is below the horizon');
    await missionControl.dismissDialogIfPresent();

    // The FINAL objective is asserted through the Mission Complete modal, not
    // the checklist: the checklist box stops its 1 s refresh when the
    // completion flow takes over, so the last row keeps its "In Progress"
    // class even though the objective state is completed (cosmetic, and it
    // sits behind the modal). Same pattern as the S5/S6/S7 specs.
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 90000 });
    const modalTitle = page.locator('#level-complete-modal .complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');
  });
});
