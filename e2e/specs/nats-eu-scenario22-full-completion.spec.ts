import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, expectDashboardAlarm, fillAndChange, parkAntenna, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 22 "Connecting the Dots" - full completion (Gray Zone 6/8).
 *
 * The attribution report. Open the Campaign Record (S17-S21's Working
 * Documents, as filed in a fresh browser), read the carried-forward audit
 * chain, flag the 13 April export as the origin, build the timeline, fly a
 * routine SAR-1 pass in the middle of it, make the attribution call (graded on
 * evidence-chain-intact: with no S21 record in this browser nothing was
 * destroyed, so the KG-01 line is present and "one actor" is right), write
 * the referral, continuity, board, notifications, header and debrief lines.
 * Clock starts 2027-04-22 14:00:00Z:
 *   MERIDIAN-SAR-1  AOS 14:30:00Z  max el 23.8 deg at 14:34:49Z  LOS 14:39:34Z
 *
 * Objective flow (17):
 *  1. review-mission-brief  2. dashboard-sweep      3. open-the-record
 *  4. read-the-chain        5. flag-the-origin      6. build-the-timeline
 *  7. rx-chain-ready        8. preposition-for-aos  9. acquire-sar1
 * 10. decode-sar1          11. attribute-the-actor 12. the-referral
 * 13. continuity-plan      14. board-summary       15. notifications
 * 16. close-the-record     17. close-and-debrief
 */
test.describe('nats-eu Scenario 22 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const closeCampaignRecordIfOpen = async (): Promise<void> => {
    const box = page.locator('#draggable-html-box-campaign-record');
    if (await box.isVisible({ timeout: 1000 }).catch(() => false)) {
      const closeBtn = box.locator('.draggable-box__close-btn, [id$="-close"]').first();
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click();
      }
    }
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario22');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the brief and the scope of an attribution report', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'What was observed, when, on which input');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Brief');
  });

  test('[dashboard-sweep] reads the board: AGC rail, no faults', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await expectDashboardAlarm(page, 'AGC at max gain');
    await answerSystemQuiz(page, 'RX AGC at max gain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[open-the-record] opens the Campaign Record and finds S17-S21 filed', async () => {
    const icon = page.locator('.campaign-record-icon');
    await expect(icon).toBeVisible({ timeout: 10000 });
    await domClick(page, '.campaign-record-icon');
    const box = page.locator('#draggable-html-box-campaign-record');
    await expect(box).toBeVisible({ timeout: 10000 });
    await expect(box).toContainText('S21 Knocking on the Door');
    await expect(box).toContainText('S17 Unusual Activity');
    await answerSystemQuiz(page, 'Five: a downlink carrier and a login spray');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Open the Campaign Record');
    await closeCampaignRecordIfOpen();
  });

  test('[read-the-chain] signs off the carried-forward log and names the common thread', async () => {
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-audit-body')).toContainText('KG-01 unit log (sealed 21 Apr)', { timeout: 10000 });
    await expect(page.locator('#sec-audit-body')).toContainText('full station configuration exported');
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await answerSystemQuiz(page, 'Each used something in it');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Chain');
  });

  test('[flag-the-origin] flags the 13 April export', async () => {
    await domClick(page, 'button[data-event-id="evt-s17-export"]');
    await answerSystemQuiz(page, '13 Apr 01:58 password spray on svc-legacy');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Flag the Origin');
  });

  test('[build-the-timeline] flags the denial and the skew and writes the rest', async () => {
    await domClick(page, 'button[data-event-id="evt-s19-denial"]');
    await domClick(page, 'button[data-event-id="evt-s20-skew"]');
    await answerSystemQuiz(page, '14 Apr terrestrial interference 11726/11690 MHz');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Build the Timeline');
  });

  test('[rx-chain-ready] retunes the receiver and frames a 40 MHz span on 1414', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1414');
    await fillAndChange(page, '#sa-span', '40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-1');
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 25 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 25, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar1] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-22T14:30:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[decode-sar1] locks SAR-1 and answers why the pass is flown', async () => {
    await advanceMissionClockToUtc(page, '2027-04-22T14:33:30Z');
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(4000);
    await answerSystemQuiz(page, 'Because the report is about a station that is still operating');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Operations Continue', 60000);
  });

  test('[attribute-the-actor] re-reads the chain and calls one actor with the KG-01 line present', async () => {
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-audit-body')).toContainText('KG-01 unit log (sealed 21 Apr)');
    await page.waitForTimeout(3000);
    await answerDecision(page, 'One actor, one method', ['Campaign record open', 'Audit chain read on the Security console']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Attribute the Pattern');
  });

  test('[the-referral] writes the geolocation referral', async () => {
    await answerSystemQuiz(page, 'A geolocation team with two or more receivers');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Refer the Location');
  });

  test('[continuity-plan] writes the recommendations', async () => {
    await answerSystemQuiz(page, 'Decommissioned accounts disabled on the day');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Continuity of Operations');
  });

  test('[board-summary] writes the board paragraph', async () => {
    await answerSystemQuiz(page, 'Five deliberate events over ten days');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Brief the Board');
  });

  test('[notifications] sets who is told what', async () => {
    await answerSystemQuiz(page, 'ComReg: IR-2027-0414 extended');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Notify');
  });

  test('[close-the-record] writes the header', async () => {
    await answerSystemQuiz(page, 'IAR-2027-0422-GW01: five events 13-21 Apr');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Close the Record');
  });

  test('[close-and-debrief] writes the debrief line and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'Five records closed on their own days were one incident');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
