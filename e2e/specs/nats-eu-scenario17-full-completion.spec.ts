import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { answerSystemQuiz, closeWorkingDocumentIfOpen, expectDashboardAlarm, fillAndChange, parkAntenna, programTrack, setRxModemFrequency } from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 17 "Unusual Activity" - full completion (Gray Zone 1/8).
 *
 * Night shift: read the overnight log as a set and flag the spray, fly the
 * SAR-1 receive pass, characterise the 1410 MHz carrier that appears after
 * culmination and does not Doppler, call it (the first Gray Zone decision,
 * graded on live evidence facts), open the incident, flag the live
 * configuration export, disable the legacy account, fly SAR-2, close the
 * record. Clock starts 2027-04-12 02:00:00Z:
 *   MERIDIAN-SAR-1  AOS 02:20:00Z  max el 30.0 deg at 02:24:46Z  LOS 02:29:34Z
 *   carrier         on 02:25:30Z .. 02:34:00Z (terrestrial, Galway only)
 *   export          02:33:00Z in the audit log
 *   MERIDIAN-SAR-2  AOS 02:40:01Z  max el 26.3 deg at 02:44:46Z  LOS 02:49:30Z
 *
 * Objective flow (17):
 *  1. review-mission-brief     2. dashboard-sweep          3. reference-check
 *  4. rx-chain-ready           5. read-the-overnight-log   6. flag-the-spray
 *  7. preposition-for-aos      8. acquire-sar1             9. decode-sar1
 * 10. characterise-the-carrier 11. call-the-carrier        12. open-the-incident
 * 13. flag-the-config-export   14. harden-the-service-account
 * 15. retune-for-sar2          16. decode-sar2             17. close-the-shift
 */

/** Set an account's status on the Security console access-control panel. */
async function setAccountStatus(page: Page, accountId: string, status: 'active' | 'disabled' | 'expired'): Promise<void> {
  const select = page.locator(`select.sec-account-select[data-account-id="${accountId}"]`);
  await expect(select).toBeVisible({ timeout: 10000 });
  await select.selectOption({ value: status });
}

test.describe('nats-eu Scenario 17 Full Completion', () => {
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario17');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the night brief and the order of the rule', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'Acting first destroys the record');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Night Brief');
  });

  test('[dashboard-sweep] reads the board: AGC rail, no faults', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await expectDashboardAlarm(page, 'AGC at max gain');
    await answerSystemQuiz(page, 'RX AGC at max gain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[reference-check] observes the GPSDO', async () => {
    await missionControl.selectTab('gps-timing');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference Check');
  });

  test('[rx-chain-ready] retunes the modem to 1414 MHz and frames a 40 MHz span', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1414');
    await fillAndChange(page, '#sa-span', '40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-1');
  });

  test('[read-the-overnight-log] signs off the trail and names the spray', async () => {
    await missionControl.selectTab('security-console');
    await expect(page.locator('#sec-mark-reviewed')).toBeVisible({ timeout: 10000 });
    await domClick(page, '#sec-mark-reviewed');
    await expect(page.locator('#sec-reviewed-badge')).toHaveText('SIGNED OFF');
    await answerSystemQuiz(page, 'A spray: one source trying a few passwords');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Overnight Log');
  });

  test('[flag-the-spray] flags the legacy-account entry and notes the time', async () => {
    await domClick(page, 'button[data-event-id="evt-spray-legacy"]');
    await answerSystemQuiz(page, 'The flag and the time seen are the first lines');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Flag the Spray');
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 187 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 187, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar1] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-12T02:20:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[decode-sar1] holds RX lock above 8 dB before the carrier arrives', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-12T02:23:00Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Routine Downlink', 60000);
  });

  test('[characterise-the-carrier] frames the 1410 MHz carrier and reads the no-Doppler tell', async () => {
    // The carrier comes on at 02:25:30, after culmination.
    await advanceMissionClockToUtc(page, '2027-04-12T02:26:00Z');
    await missionControl.selectTab('rx-analysis');
    await fillAndChange(page, '#sa-center-freq', '1410');
    await fillAndChange(page, '#sa-span', '2');
    await page.waitForTimeout(3000); // RX Analysis stays on screen so the carrier read latches
    await answerSystemQuiz(page, 'It is not on the bird');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Characterise the Carrier', 60000);
  });

  test('[call-the-carrier] reads the carrier and the key, then calls it as interference', async () => {
    // Both evidence latches read on RX Analysis: the carrier and the RX key status.
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(3000);

    // Graded on live facts: the scripted carrier is radiating, no fault is
    // injected, the key reads Valid. The helper refuses to click until both
    // evidence items show latched.
    await answerDecision(page, 'External interference - characterise it and report it', ['Carrier read on RX Analysis', 'RX key status read on RX Analysis']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call the Carrier');
  });

  test('[open-the-incident] opens the record with both indicators and no cause', async () => {
    await answerSystemQuiz(page, 'Both, as seen');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Open the Incident');
  });

  test('[flag-the-config-export] flags the live export after it lands at 02:33', async () => {
    await advanceMissionClockToUtc(page, '2027-04-12T02:33:30Z');
    await missionControl.selectTab('security-console');
    await domClick(page, 'button[data-event-id="evt-config-export"]');
    await answerSystemQuiz(page, 'Enough to plan against the station');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Flag the Configuration Export');
  });

  test('[harden-the-service-account] disables the legacy account', async () => {
    await setAccountStatus(page, 'svc-legacy', 'disabled');
    await answerSystemQuiz(page, 'Because the account is a way in that still works');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Disable the Legacy Account');
  });

  test('[retune-for-sar2] retunes the modem and analyzer for SAR-2', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await fillAndChange(page, '#sa-center-freq', '1370');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Retune for SAR-2');
  });

  test('[decode-sar2] retargets to SAR-2 and decodes it clean', async () => {
    await programTrack(page, missionControl, '61702');
    await advanceMissionClockToUtc(page, '2027-04-12T02:40:40Z');
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-12T02:43:00Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Second Downlink', 60000);
  });

  test('[close-the-shift] writes the debrief line and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'A decommissioned account was still active');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
