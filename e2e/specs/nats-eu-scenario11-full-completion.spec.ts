import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, fillAndChange, loadEphemeris, programTrack, setSpecaRbw } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 11 "LEOP: Launch Day" - full completion (phase 16).
 *
 * MERIDIAN-SAR-3's first pass over a commercial station, done as a readiness
 * sweep (board, reference, ACU beacon plan, analyzer framed for a beacon
 * search, uplink confirmed cold), the refined elements loaded and the pass
 * read back, then program-track, the beacon found on the analyzer, the RBW
 * narrowed and the Doppler sign read, ACU beacon lock, the beacon level, the
 * SOH call, the close-out and the handover. Clock starts 2027-03-22 08:50:00Z:
 *   MERIDIAN-SAR-3 (refined)  AOS 09:08:58Z  max el 31.6 deg at 09:13:44Z  LOS 09:18:33Z
 *   SAR-3 beacon 11785 MHz -> IF 1315 MHz (LNB LO 13100)
 *
 * The refined set fires at mission T+45 s (the ephemeris panel flags STALE).
 * The TRR's beacon-frequency condition is met by selecting SAR-3 as the
 * program-track target, which copies the target's beacon frequency into the
 * ACU field (the ACU beacon input itself is hidden unless step-track is on).
 *
 * Objective flow (15):
 *  1. review-mission-brief    2. dashboard-sweep        3. reference-check
 *  4. test-readiness          5. analyzer-on-the-beacon 6. uplink-cold-check
 *  7. load-refined-elements   8. read-the-refined-pass  9. first-acquisition
 * 10. narrow-the-analyzer    11. acu-beacon-lock       12. beacon-level
 * 13. state-of-health        14. secure-after-los      15. leop-handover
 */
test.describe('nats-eu Scenario 11 Full Completion', () => {
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

    // Direct navigation bypasses the nats-eu-scenario10 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario11');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the LEOP card and the acquisition risk', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'At AOS the bird can be a few degrees from prediction');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the LEOP Card');
  });

  test('[dashboard-sweep] confirms a clean board', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'No active alarms');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[reference-check] observes the GPSDO and reads why Rotterdam wants it logged', async () => {
    await missionControl.selectTab('gps-timing');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'The Doppler curve is SOH evidence');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference Check');
  });

  test('[test-readiness] configures the ACU for SAR-3 and closes the TRR', async () => {
    // Picking SAR-3 as the program-track target copies its 11785 MHz beacon
    // into the ACU beacon field
    await programTrack(page, missionControl, '61703');
    await page.waitForTimeout(1000);
    await answerSystemQuiz(page, 'reference disciplined, injection set loaded');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Test Readiness Review');
  });

  test('[analyzer-on-the-beacon] frames the beacon search at 1315 MHz, 2 MHz span', async () => {
    await missionControl.selectTab('rx-analysis');
    await fillAndChange(page, '#sa-center-freq', '1315');
    await fillAndChange(page, '#sa-span', '2');
    await answerSystemQuiz(page, 'At 60 MHz span a CW tone is one pixel');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Analyzer on the Beacon');
  });

  test('[uplink-cold-check] confirms the chain is cold under the flight rule', async () => {
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'Modem off air, BUC muted, HPA output disabled');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Uplink Cold Check');
  });

  test('[load-refined-elements] loads the ranging solution once the panel flags SAR-3', async () => {
    // The refined set fires at mission T+45 s; move the clocks a minute past
    // the start so it has reached the console
    await advanceMissionClockToUtc(page, '2027-03-22T08:51:00Z');
    await loadEphemeris(page, missionControl, 'SAR3-INJ');
    await answerSystemQuiz(page, 'Origin: one is a launch-provider estimate');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Load the Refined Elements');
  });

  test('[read-the-refined-pass] reads AOS, peak and LOS off the refined schedule', async () => {
    await missionControl.selectTab('pass-schedule');
    await answerSystemQuiz(page, 'AOS 09:08:59 at azimuth 143');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Refined Pass');
  });

  test('[first-acquisition] program-tracks SAR-3 on the refined set and finds the beacon', async () => {
    // Just before the 09:08:58Z AOS: re-point on the refined set
    await advanceMissionClockToUtc(page, '2027-03-22T09:08:30Z');
    await programTrack(page, missionControl, '61703');
    await page.waitForTimeout(3000);

    // Rising leg: the beacon latches on RX Analysis
    await advanceMissionClockToUtc(page, '2027-03-22T09:10:30Z');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'First Acquisition', 60000);
  });

  test('[narrow-the-analyzer] drops the RBW to 10 kHz and reads the Doppler sign', async () => {
    await setSpecaRbw(page, missionControl, '0.01');
    await answerSystemQuiz(page, 'Yes: the high-side LNB LO inverts');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Narrow the Analyzer');
  });

  test('[acu-beacon-lock] confirms ACU beacon lock and logs it', async () => {
    await missionControl.selectTab('acu-control');
    await expect(page.locator('[id$="beacon-lock-status"]')).toHaveText('LOCKED', { timeout: 30000 });
    await answerSystemQuiz(page, "The pedestal's own receiver");
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'ACU Beacon Lock', 60000);
  });

  test('[beacon-level] reads the beacon level near culmination and logs it', async () => {
    await advanceMissionClockToUtc(page, '2027-03-22T09:13:00Z');
    await missionControl.selectTab('rx-analysis');
    await answerSystemQuiz(page, 'A level against the link prediction');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Beacon Level', 60000);
  });

  test('[state-of-health] makes the SOH call for Rotterdam', async () => {
    await answerSystemQuiz(page, 'no anomaly; recommend proceeding to command checkout');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Initial State of Health');
  });

  test('[secure-after-los] confirms the uplink stayed cold and closes the contact', async () => {
    await advanceMissionClockToUtc(page, '2027-03-22T09:19:00Z');
    await closeWorkingDocumentIfOpen(page);
    await missionControl.selectTab('tx-chain');
    await page.waitForTimeout(2500);
    await answerSystemQuiz(page, 'The injection set is superseded');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Secure After LOS');
  });

  test('[leop-handover] explains why nothing went up and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'The flight rules sequence LEOP');
    await dismissDialogIfPresent(page);

    // FINAL objective: assert through the Mission Complete modal, since the
    // checklist stops repainting once the completion flow takes over
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible({ timeout: 30000 });

    const modalTitle = levelCompleteModal.locator('.complete-modal__title');
    await expect(modalTitle).toContainText('Mission Complete');

    const totalScore = levelCompleteModal.locator('.total-value');
    await expect(totalScore).toBeVisible();
    const score = parseInt((await totalScore.textContent()) || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});
