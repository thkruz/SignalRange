import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerPendingQuizFrom,
  answerSystemQuiz,
  assignContact,
  closeWorkingDocumentIfOpen,
  commitLinkWithMargin,
  computeLinkBudget,
  disableHpa,
  enableDopplerComp,
  enableHpa,
  programTrack,
  sendCommandAndExpectAck,
  setRxModemFrequency,
  setSwitch,
  setTxModemOnAir,
} from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 8 "Night Passes" - full completion (phase 16).
 *
 * The solo qualification night: plan, rotation and budget before the 00:31
 * SAR-1 pass (link proven cold, chain up inside the window, REC-PLAYBACK
 * acknowledged, chain down),
 * then the Shetland console remotely for a 13 deg SAR-2 telemetry contact on
 * a reference in holdover (GNSS outage 02:44-02:59, E3), then Galway again
 * for the 73 deg SAR-2 pass after the fleet traffic key rolls at 04:15 (E3).
 * Sim clock starts 2027-03-16 00:15:00Z:
 *   GW-01 MERIDIAN-SAR-1  AOS 00:31:19Z  max el 40.4 at 00:35:03Z  LOS 00:38:49Z
 *   SH-02 MERIDIAN-SAR-2  AOS 02:54:39Z  max el 13.4 at 02:57:34Z  LOS 03:00:27Z
 *   GW-01 MERIDIAN-SAR-2  AOS 04:27:31Z  max el 73.1 at 04:31:23Z  LOS 04:35:12Z
 *
 * The clock jumps (advanceMissionClockToUtc) stand in for the operator's time
 * skips; both faults fire on the mission clock, so the jump to each contact
 * trips the fault the objective expects to find.
 *
 * Objective flow (21):
 *  1. review-mission-brief        2. build-the-night-plan     3. night-key-rotation
 *  4. night-budget                5. gw-reference-and-chain   6. acquire-sar1
 *  7. prove-the-night-link        8. chain-up-for-commanding  9. command-the-bird
 * 10. secure-the-chain           11. log-contact-1           12. shetland-remote-sweep
 * 13. holdover-diagnosis         14. acquire-sar2-from-shetland 15. telemetry-contact
 * 16. confirm-reference-recovered 17. traffic-key-alarm      18. re-key-before-aos
 * 19. acquire-sar2-galway        20. decode-the-steep-pass   21. hand-over-the-shift
 */
/**
 * Answer one objective's pending quiz. Plan, rotation and budget activate
 * together after the brief and the quiz manager only auto-surfaces one of
 * their quizzes, so open the others from the checklist's "?" button and
 * answer whichever question is showing by its text.
 */
async function answerObjectiveQuiz(
  page: Page,
  missionControl: MissionControlPage,
  objectiveId: string,
  answers: Array<{ questionHint: string; answerText: string }>
): Promise<void> {
  const modal = page.locator('#quiz-modal, .quiz-box');
  if (!(await modal.isVisible().catch(() => false))) {
    if (!(await missionControl.objectivesChecklist.isVisible().catch(() => false))) {
      await missionControl.openChecklist();
    }
    const button = page.locator(`.condition-quiz-btn[data-objective-id="${objectiveId}"]`);
    if ((await button.count()) === 0) {
      return; // already answered
    }
    await domClick(page, `.condition-quiz-btn[data-objective-id="${objectiveId}"]`);
  }
  await answerPendingQuizFrom(page, answers);
  await dismissDialogIfPresent(page);
}

test.describe('nats-eu Scenario 8 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario8');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] takes the shift', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'None of them - all three');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Take the Shift');
  });

  test('[build-the-night-plan] splits the pairs and drops the P3 overhead', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('contact-schedule');
    await expect(page.locator('#cs-plan-badge')).toHaveText('UNALLOCATED');
    await assignContact(page, 'N-SAR1-GW', 'GW-01');
    await assignContact(page, 'N-SAR1-SH', 'SH-02');
    await assignContact(page, 'N-SAR2-SH', 'SH-02');
    await assignContact(page, 'N-SAR2-GW', 'GW-01');
    await expect(page.locator('#cs-conflict-count')).toHaveText('0');
    await expect(page.locator('#cs-plan-badge')).toHaveText('DECONFLICTED');
    await dismissDialogIfPresent(page);
  });

  test('[night-key-rotation] rotates the command key', async () => {
    await missionControl.selectTab('commanding');
    await expect(page.locator('#cmd-begin-rotation')).toBeVisible({ timeout: 10000 });
    await domClick(page, '#cmd-begin-rotation');
    await page.waitForTimeout(300);
    await domClick(page, '#cmd-complete-rotation');
    await expect(page.locator('#cmd-key-badge')).toHaveText(/Valid/i, { timeout: 5000 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Complete the COMSEC Rotation');
  });

  test('[night-budget] predicts the night link and answers both pre-pass quizzes', async () => {
    await computeLinkBudget(page, missionControl, { eirpDbm: 28, fsplDb: 169.1, rxGainDbi: 51.8, noiseTempK: 88, bandwidthMHz: 36, miscLossDb: 1 });
    // Plan, rotation and budget activate together after the brief, and the
    // quiz manager surfaces the last-registered quiz first, so answer the two
    // pending quizzes by their question text rather than in objective order.
    const answers = [
      { questionHint: 'Shetland overhead', answerText: 'It is priority 3 and may be dropped' },
      { questionHint: '2.3 dB', answerText: '20 log(761 / 581)' },
    ];
    await answerObjectiveQuiz(page, missionControl, 'build-the-night-plan', answers);
    await answerObjectiveQuiz(page, missionControl, 'night-budget', answers);
    await waitForObjectiveComplete(missionControl, 'Build the Night Contact Plan');
    await waitForObjectiveComplete(missionControl, 'Predict the Night Link');
  });

  test('[gw-reference-and-chain] observes the GPSDO and BUC reference', async () => {
    for (const tab of ['gps-timing', 'tx-chain']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Reference and BUC Lock');
  });

  test('[acquire-sar1] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-03-16T00:31:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[prove-the-night-link] locks and commits the link with margin', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-16T00:34:00Z');
    await page.waitForTimeout(2500); // receiver-signal-locked latches on RX analysis
    await commitLinkWithMargin(page, missionControl, 10.5);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Prove the Night Link', 60000);
  });

  test('[chain-up-for-commanding] brings the chain up inside the window, after the link is proven', async () => {
    await enableDopplerComp(page, missionControl);
    await setTxModemOnAir(page, missionControl);
    await setSwitch(page, '#buc-mute', false);
    await enableHpa(page, missionControl);
    await page.waitForTimeout(2500);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Chain Up for Commanding');
  });

  test('[command-the-bird] sends REC-PLAYBACK and gets the ACK', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'REC-PLAYBACK');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Command the Bird');
  });

  test('[secure-the-chain] brings the chain down in order after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-03-16T00:39:30Z');
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Secure the Chain');
  });

  test('[log-contact-1] logs the first contact', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Rotation completed before the window');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Log the First Contact');
  });

  test('[shetland-remote-sweep] skips to the Shetland window and sweeps SH-02', async () => {
    // The SH-02 GNSS outage trips at 02:44 on the mission clock
    await advanceMissionClockToUtc(page, '2027-03-16T02:52:30Z');
    await closeWorkingDocumentIfOpen(page);
    await missionControl.selectGroundStation('SH-02');
    for (const tab of ['tx-chain', 'rx-analysis']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await setRxModemFrequency(page, missionControl, 1370);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Shetland Remote Sweep');
  });

  test('[holdover-diagnosis] reads the Shetland reference in holdover', async () => {
    await missionControl.selectTab('gps-timing');
    // Both stations' GPS Timing panels stay mounted; only SH-02 is in holdover.
    await expect(page.locator('#gpsdo-holdover-badge').filter({ hasText: /^ACTIVE$/u })).toHaveCount(1, { timeout: 15000 });
    await answerSystemQuiz(page, 'A GNSS outage at the site');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Shetland Reference');
  });

  test('[acquire-sar2-from-shetland] program-tracks SAR-2 on the SH-02 pedestal', async () => {
    await advanceMissionClockToUtc(page, '2027-03-16T02:54:50Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-2 from Shetland', 60000);
  });

  test('[telemetry-contact] holds lock above 5 dB through culmination', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-16T02:56:30Z');
    await answerSystemQuiz(page, 'No: 20 log(1233 / 581)');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Work the Telemetry Contact', 60000);
  });

  test('[confirm-reference-recovered] sees the GNSS return and logs contact 2', async () => {
    // The outage clears at 02:59 on the mission clock
    await advanceMissionClockToUtc(page, '2027-03-16T03:00:10Z');
    await missionControl.selectTab('gps-timing');
    await expect(page.locator('#gpsdo-holdover-badge').filter({ hasText: /^ACTIVE$/u })).toHaveCount(0, { timeout: 15000 });
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'GNSS outage 02:44 to 02:59');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Confirm the Shetland Reference Recovered', 60000);
  });

  test('[traffic-key-alarm] skips to the Galway window and reads the mismatch', async () => {
    // The fleet traffic key rolls at 04:15 on the mission clock
    await advanceMissionClockToUtc(page, '2027-03-16T04:23:30Z');
    await closeWorkingDocumentIfOpen(page);
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('rx-analysis');
    await expect(page.locator('#rx-payload-dec-key-status').first()).toHaveText(/Mismatch/i, { timeout: 15000 });
    await answerSystemQuiz(page, 'Rotterdam rolled the fleet traffic key');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Traffic Key', 60000);
  });

  test('[re-key-before-aos] loads the new traffic key', async () => {
    await missionControl.selectTab('tx-chain');
    await domClick(page, '#tx-payload-rekey-btn');
    await expect(page.locator('#tx-payload-enc-key-status').first()).toHaveText(/Valid/i, { timeout: 5000 });
    await page.waitForTimeout(1500);
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(2500);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Re-key the Payload Crypto', 60000);
  });

  test('[acquire-sar2-galway] retunes and program-tracks the steep pass', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await advanceMissionClockToUtc(page, '2027-03-16T04:27:50Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-2 over Galway', 60000);
  });

  test('[decode-the-steep-pass] decodes through the top of the 73 deg pass', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-16T04:30:00Z');
    await answerSystemQuiz(page, 'The azimuth rate at the top');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Steep Pass', 60000);
  });

  test('[hand-over-the-shift] closes the handover and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'The contact plan, the COMSEC state of both keys');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });
    await expect(levelCompleteModal.locator('.complete-modal__title')).toContainText('Mission Complete');

    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();
    const score = parseInt((await totalScore.textContent()) || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});
