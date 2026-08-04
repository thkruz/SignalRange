import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import {
  advanceMissionClock,
  answerRileyQuiz,
  domClick,
  engageTrack,
  rideUntilObjectiveComplete,
  waitForObjectiveComplete,
} from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * ham-sdr Scenario 7 "Margin Call" - full completion.
 *
 * RFI foxhunt + marginal pass on the yagi rig. The E1 terrestrial hash
 * (435.36 MHz, 1.2 km due east) comes up at T+60 s; the player DFs it with
 * the new MAN AZ control, notches it with the new FILTER section, narrows
 * the IF filter to 100 kHz, and locks CUBEHOP-1 through the 18.4-degree pass
 * (AOS T+20 min, crossed with advanceMissionClock).
 */
test.describe('ham-sdr Scenario 7 Full Completion', () => {
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

    await missionControl.gotoScenario('ham-sdr', 'ham-sdr-scenario7');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(300000);
  });

  test('[review-mission-brief] reads the note and answers the link-margin quiz', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();

    await answerRileyQuiz(page, 'comes straight out of the decode margin');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, "Read Riley's Note");
  });

  test('[hear-the-hash] the terrestrial hash appears on the waterfall', async () => {
    // RFI comes up at T+60 s on the mission clock
    await advanceMissionClock(page, 2);

    await missionControl.selectGroundStation('BKYD-YAGI');
    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Confirm the Intruder', 60000);
  });

  test('[df-the-source] sweeps the yagi onto the emitter bearing with MAN AZ', async () => {
    // Sanity: the hash should be louder ON the bearing than off it. Slew to
    // due east via the new manual control and let the rotator arrive.
    await page.locator('#sdr-rot-az-input').fill('90');
    await domClick(page, '#sdr-rot-go');

    await waitForObjectiveComplete(missionControl, 'Foxhunt: Take a Bearing', 90000);
  });

  test('[notch-it] carves the hash out with the one-knob notch', async () => {
    const notchFreq = page.locator('#sdr-notch-freq');
    await notchFreq.fill('435.36');
    await notchFreq.dispatchEvent('change');
    await domClick(page, '#sdr-notch-enable');

    await missionControl.dismissDialogIfPresent();
    await waitForObjectiveComplete(missionControl, 'Notch the Hash', 30000);
  });

  test('[narrow-and-catch] narrows the IF filter and locks the 18-degree pass', async () => {
    // Jump to just before the 15:35 AOS (T+20 min)
    await advanceMissionClock(page, 15);

    await missionControl.selectTab('sdr-console');
    await missionControl.dismissDialogIfPresent();

    // 100 kHz front-end filter (index 5): the noise gate drops 3 dB
    await page.locator('#sdr-if-filter-select').selectOption('5');

    await engageTrack(page, '63002');
    await domClick(page, '#sdr-afc-toggle');

    const everLocked = await rideUntilObjectiveComplete(
      page,
      missionControl,
      'Make the Margin, Catch the Pass',
      { maxMs: 300_000, correct: true },
    );
    expect(everLocked).toBe(true);
  });

  test('[margin-log] logs the audit and completes the mission', async () => {
    await answerRileyQuiz(page, 'ground signals hold still');
    await missionControl.dismissDialogIfPresent();

    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
    const modalTitle = page.locator('#level-complete-modal .complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');
  });
});
