import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerSystemQuiz,
  closeWorkingDocumentIfOpen,
  expectDashboardAlarm,
  fillAndChange,
  parkAntenna,
  programTrack,
  setRxModemFrequency,
  setSwitch,
} from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 20 "False Time" - full completion (Gray Zone 4/8).
 *
 * A GNSS spoofer local to Galway from 05:08 to 05:36 walks the GNSS vs REF
 * delta-T at 2 us/s while the constellation panel stays LOCKED with a full satellite count.
 * Shetland reads +0.0. Call it (decision graded on timing-drifting AND
 * gnss-constellation-healthy), GNSS switch down, fly SAR-1 in holdover, flag
 * the skew entry and report, probe the sky after LOS (still walking - back
 * down), probe again after 05:36 (still - stays up), SAR-2 on true time,
 * debrief. Clock starts 2027-04-19 05:00:00Z:
 *   MERIDIAN-SAR-1  AOS 05:21:59Z  max el 29.2 deg at 05:26:45Z  LOS 05:31:28Z
 *   MERIDIAN-SAR-2  AOS 05:44:00Z  max el 27.0 deg at 05:48:44Z  LOS 05:53:29Z
 *   spoofer         05:08:00Z .. 05:36:00Z (GW-01 only)
 *
 * Objective flow (17):
 *  1. review-mission-brief  2. dashboard-sweep      3. timing-baseline
 *  4. rx-chain-ready        5. preposition-for-aos  6. spot-the-walk
 *  7. cross-check-sh02      8. call-the-lie         9. go-to-holdover
 * 10. acquire-sar1         11. decode-on-holdover  12. report-the-attack
 * 13. probe-the-sky        14. all-clear           15. acquire-sar2
 * 16. decode-sar2          17. close-and-debrief
 */
test.describe('nats-eu Scenario 20 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  /** GNSS vs REF delta-T as the GPS Timing tab currently shows it, in microseconds. */
  const readOffsetUs = async (): Promise<number> => {
    const text = (await page.locator('#gpsdo-time-offset').textContent()) ?? '';
    return parseFloat(text.replace(/[^\d.+-]/g, ''));
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
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario20');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the brief and the spoof signature', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'A healthy constellation - LOCKED, a full satellite count');
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

  test('[timing-baseline] observes the GPSDO and reads a zero delta-T', async () => {
    await missionControl.selectTab('gps-timing');
    await expect(page.locator('#gpsdo-lock-badge')).toHaveText('LOCKED', { timeout: 15000 });
    expect(Math.abs(await readOffsetUs())).toBeLessThan(0.5);
    await page.waitForTimeout(3000);
    await answerSystemQuiz(page, '+0.0 us - the GNSS timing solution');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Timing Baseline');
  });

  test('[rx-chain-ready] retunes the receiver and frames a 40 MHz span on 1414', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1414');
    await fillAndChange(page, '#sa-span', '40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Set Up the Receiver for SAR-1');
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 6 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 6, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[spot-the-walk] the delta-T walks past 20 us while the constellation stays healthy', async () => {
    // Cross the spoofStartS=480 threshold; 2 us/s puts the read past 20 us within seconds.
    await advanceMissionClockToUtc(page, '2027-04-19T05:08:30Z');
    await missionControl.selectTab('gps-timing');
    await expect.poll(readOffsetUs, { timeout: 30000 }).toBeGreaterThan(20);
    await expect(page.locator('#gpsdo-gnss-badge')).toHaveText(/\d+ SATS/);
    await expect(page.locator('#gpsdo-satellite-count')).not.toHaveText('0');
    await answerSystemQuiz(page, 'A full satellite count and LOCKED');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Spot the Walk');
  });

  test('[cross-check-sh02] Shetland reads zero under the same sky', async () => {
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('gps-timing');
    await expect(page.locator('#gpsdo-gnss-badge')).toHaveText(/\d+ SATS/, { timeout: 15000 });
    expect(Math.abs(await readOffsetUs())).toBeLessThan(0.5);
    await page.waitForTimeout(3000);
    await answerSystemQuiz(page, '+0.0 us - same sky, no walk');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Cross-Check Shetland');
  });

  test('[call-the-lie] reads the offset and the constellation on GW-01 and calls the spoof', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('gps-timing');
    await expect.poll(readOffsetUs, { timeout: 15000 }).toBeGreaterThan(20);
    await page.waitForTimeout(3000);
    await answerDecision(page, 'GNSS spoof - the constellation is healthy and the time is walking', ['Offset read on GPS Timing', 'Constellation read on GPS Timing']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call the Lie');
  });

  test('[go-to-holdover] takes the GNSS switch down and the offset freezes', async () => {
    await missionControl.selectTab('gps-timing');
    await setSwitch(page, '#gpsdo-gnss-switch', false);
    await expect(page.locator('#gpsdo-holdover-badge').first()).toHaveText('ACTIVE', { timeout: 10000 });

    // Frozen: sample twice across several seconds of the spoofer still being up.
    const before = await readOffsetUs();
    await page.waitForTimeout(5000);
    expect(Math.abs((await readOffsetUs()) - before)).toBeLessThan(0.5);

    await answerSystemQuiz(page, 'It froze the reference where the lie had walked it');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    // maintainDuration 20 ticks on real time
    await waitForObjectiveComplete(missionControl, 'Stop Trusting GNSS', 60000);
  });

  test('[acquire-sar1] program-tracks SAR-1 and observes the beacon', async () => {
    await advanceMissionClockToUtc(page, '2027-04-19T05:22:40Z');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-1', 60000);
  });

  test('[decode-on-holdover] locks SAR-1 with the reference free-running', async () => {
    await advanceMissionClockToUtc(page, '2027-04-19T05:25:00Z');
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(4000);
    await answerSystemQuiz(page, 'The modem needs a stable 10 MHz, not a true one');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode on the Oscillator', 60000);
  });

  test('[report-the-attack] flags the timestamp-skew entry and reports in progress', async () => {
    await missionControl.selectTab('security-console');
    await domClick(page, 'button[data-event-id="evt-ts-skew"]');
    await answerSystemQuiz(page, 'Time of onset, the delta-T reading and its rate');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Report It');
  });

  test('[probe-the-sky] GNSS back up after LOS: the offset resumes walking, switch back down', async () => {
    await advanceMissionClockToUtc(page, '2027-04-19T05:32:00Z');
    await missionControl.selectTab('gps-timing');
    const frozen = await readOffsetUs();
    await setSwitch(page, '#gpsdo-gnss-switch', true);
    await expect(page.locator('#gpsdo-lock-badge')).toHaveText('LOCKED', { timeout: 15000 });

    // Spoofer still up: the walk resumes from where it froze.
    await expect.poll(readOffsetUs, { timeout: 20000 }).toBeGreaterThan(frozen + 2);
    await page.waitForTimeout(2000);
    await answerDecision(page, 'Still walking - the spoofer is up', ['GNSS re-selected', 'Offset read on GPS Timing']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Probe the Sky');

    await setSwitch(page, '#gpsdo-gnss-switch', false);
    await expect(page.locator('#gpsdo-holdover-badge').first()).toHaveText('ACTIVE', { timeout: 10000 });
  });

  test('[all-clear] second probe after 05:36: the offset holds still on GNSS, leave it up', async () => {
    await advanceMissionClockToUtc(page, '2027-04-19T05:37:00Z');
    await missionControl.selectTab('gps-timing');
    const frozen = await readOffsetUs();
    await setSwitch(page, '#gpsdo-gnss-switch', true);
    await expect(page.locator('#gpsdo-lock-badge')).toHaveText('LOCKED', { timeout: 15000 });
    await expect(page.locator('#gpsdo-gnss-badge')).toHaveText(/\d+ SATS/, { timeout: 15000 });

    // Spoofer gone: still, with the receiver listening.
    await page.waitForTimeout(5000);
    expect(Math.abs((await readOffsetUs()) - frozen)).toBeLessThan(0.5);

    await answerSystemQuiz(page, 'The delta-T stopped moving with GNSS re-selected');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Ride It Out, Then Come Back', 60000);
  });

  test('[acquire-sar2] retunes and retargets for SAR-2', async () => {
    await setRxModemFrequency(page, missionControl, 1370);
    await programTrack(page, missionControl, '61702');
    await advanceMissionClockToUtc(page, '2027-04-19T05:44:40Z');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire MERIDIAN-SAR-2', 60000);
  });

  test('[decode-sar2] locks SAR-2 on true time', async () => {
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-04-19T05:47:00Z');
    await page.waitForTimeout(4000);
    await answerSystemQuiz(page, 'Their timestamps are true again');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Decode SAR-2 on True Time', 60000);
  });

  test('[close-and-debrief] writes the debrief line and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'GNSS is an input, not the truth');
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
