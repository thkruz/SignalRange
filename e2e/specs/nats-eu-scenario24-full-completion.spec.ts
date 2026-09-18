import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, domClick, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerPendingQuizFrom,
  answerSystemQuiz,
  assignContact,
  closeWorkingDocumentIfOpen,
  disableHpa,
  enableDopplerComp,
  enableHpa,
  expectDashboardAlarm,
  fillAndChange,
  loadEphemeris,
  programTrack,
  sendCommandAndExpectAck,
  sendCommandAndExpectNak,
  setRxModemFrequency,
  setSwitch,
  setTxModemFrequency,
  setTxModemOnAir,
} from '../utils/nats-eu-helpers';
import { answerDecision, dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 24 "North Atlantic Storm" - full completion (campaign capstone).
 *
 * Incident commander for the network: plan three P1 contacts across two
 * sites, sweep Galway in the rain band, ready both stations, collect SAR-1
 * from Galway in the lull under the terrestrial carrier (notch), load SAR-2's
 * post-burn set, spot the spoof on Shetland's reference with Galway as the
 * cross-check, holdover at Shetland, collect SAR-2 from Shetland, heater on
 * at Galway before the sleet, arm for SAR-3, acquire it, chain up, HK-DUMP
 * ACKs, PLD-SAFE NAKs into the jammer, call it, hop, PLD-SAFE ACKs, safe the
 * network, log and hand over. Clock starts 2027-04-27 03:00:00Z:
 *   SAR-1 @ GW-01  AOS 03:19:58Z  max el 30.2 deg  LOS 03:29:28Z   carrier 03:21:30-03:28:30
 *   SAR-2 @ SH-02  AOS 03:31:01Z  max el 35.1 deg  LOS 03:41:01Z   burn 03:15; spoof on SH-02 from 03:25
 *   SAR-3 @ GW-01  AOS 03:52:00Z  max el 28.4 deg  LOS 04:01:35Z   window 03:52:21-04:01:15; jammer 03:55-04:01:40
 *   rain band 03:01-03:16; sleet 03:40-04:10
 *
 * Objective flow (20):
 *  1. take-command             2. plan-the-network        3. galway-dashboard-sweep
 *  4. galway-rx-ready          5. shetland-baseline       6. acquire-sar1-in-the-lull
 *  7. notch-the-carrier        8. load-the-ephemeris      9. shetland-spot-the-walk
 * 10. shetland-holdover       11. acquire-sar2-from-shetland
 * 12. decode-the-collect      13. protect-the-feed       14. arm-galway-for-sar3
 * 15. acquire-sar3            16. chain-up-and-command   17. call-the-denial
 * 18. hop-and-deliver         19. safe-the-network       20. incident-log-and-handover
 */
test.describe('nats-eu Scenario 24 Full Completion', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let context: import('@playwright/test').BrowserContext;
  let missionControl: MissionControlPage;

  const readOffsetUs = async (): Promise<number> => {
    const text = (await page.locator('#gpsdo-time-offset').textContent()) ?? '';
    return parseFloat(text.replace(/[^\d.+-]/g, ''));
  };

  /** Configure one IF notch on the RX Analysis tab (the C1 S21 helper, verbatim). */
  async function configureNotchFilter(config: { centerFrequency: number; bandwidth: number; depth: number; notchIndex: number }): Promise<void> {
    const prefix = `notch-${config.notchIndex}`;

    const powerSwitch = page.locator('#notch-power');
    await expect(powerSwitch).toBeVisible({ timeout: 5000 });
    if (!(await powerSwitch.isChecked())) {
      await powerSwitch.click();
      await expect(powerSwitch).toBeChecked();
      await page.waitForTimeout(300);
    }

    const enableSwitch = page.locator(`#${prefix}-enabled`);
    await expect(enableSwitch).toBeVisible();
    if (!(await enableSwitch.isChecked())) {
      await enableSwitch.click();
      await expect(enableSwitch).toBeChecked();
      await page.waitForTimeout(200);
    }

    for (const [suffix, value] of [
      ['freq', config.centerFrequency],
      ['bw', config.bandwidth],
      ['depth', config.depth],
    ] as const) {
      const input = page.locator(`#${prefix}-${suffix}`);
      await expect(input).toBeVisible();
      await input.fill(value.toString());
      await input.press('Tab');
      await page.waitForTimeout(100);
    }

    const applyBtn = page.locator('#notch-apply-btn');
    if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await applyBtn.click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(500);
  }

  async function enableFeedHeater(): Promise<void> {
    await missionControl.selectTab('acu-control');
    const heater = page.locator('input[id$="heater-switch"]:visible').first();
    await expect(heater).toBeVisible({ timeout: 10000 });
    if (!(await heater.isChecked())) {
      await heater.evaluate((el) => (el as HTMLElement).click());
    }
    await expect(heater).toBeChecked();
  }

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    missionControl = new MissionControlPage(page);
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario24');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[take-command] reads the brief and puts the plan first', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'The plan: which bird from which site');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Take Command');
  });

  test('[plan-the-network] assigns the three P1 contacts and validates the plan', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('contact-schedule');
    await assignContact(page, 'C-SAR1-GW', 'GW-01');
    await assignContact(page, 'C-SAR2-SH', 'SH-02');
    await assignContact(page, 'C-SAR3-GW', 'GW-01');
    await expect(page.locator('#cs-plan-badge')).toHaveText('DECONFLICTED');
    await answerSystemQuiz(page, 'Because Galway has SAR-1 setting at 03:29');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Plan the Network');
  });

  test('[galway-dashboard-sweep] reads the board in the rain: AGC rail, no faults', async () => {
    await missionControl.selectTab('dashboard');
    await expectDashboardAlarm(page, 'AGC at max gain');
    await answerSystemQuiz(page, 'RX AGC at max gain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Storm Sweep');
  });

  test('[galway-rx-ready] frames Galway on 1414 for SAR-1', async () => {
    await setRxModemFrequency(page, missionControl, 1414);
    await fillAndChange(page, '#sa-center-freq', '1414');
    await fillAndChange(page, '#sa-span', '40');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Galway Ready for SAR-1');
  });

  test('[shetland-baseline] reads the Shetland reference and retunes it for SAR-2', async () => {
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('gps-timing');
    await expect(page.locator('#gpsdo-lock-badge')).toHaveText('LOCKED', { timeout: 15000 });
    expect(Math.abs(await readOffsetUs())).toBeLessThan(0.5);
    await page.waitForTimeout(3000);
    await setRxModemFrequency(page, missionControl, 1370);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Shetland Baseline');
  });

  test('[acquire-sar1-in-the-lull] program-tracks SAR-1 from Galway after the rain band', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T03:20:40Z');
    await missionControl.selectGroundStation('GW-01');
    await programTrack(page, missionControl, '61701');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-1 in the Lull', 60000);
  });

  test('[notch-the-carrier] notches 1410 MHz and holds C/N above 7 dB', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T03:21:45Z');
    await missionControl.selectTab('rx-analysis');
    await configureNotchFilter({ centerFrequency: 1410, bandwidth: 2, depth: 30, notchIndex: 1 });
    await advanceMissionClockToUtc(page, '2027-04-27T03:23:30Z');
    await page.waitForTimeout(4000);
    await answerSystemQuiz(page, 'Nothing in the handling - notch it, keep the collect');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Notch the Carrier', 60000);
  });

  test('[load-the-ephemeris] loads SAR-2 post-burn elements before the Shetland pass', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T03:29:40Z');
    await loadEphemeris(page, missionControl, 'SAR2-CAM2');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Load the Post-Burn Elements');
  });

  test('[shetland-spot-the-walk] Shetland walking, Galway clean', async () => {
    await missionControl.selectGroundStation('SH-02');
    await missionControl.selectTab('gps-timing');
    await expect.poll(readOffsetUs, { timeout: 30000 }).toBeGreaterThan(20);
    await expect(page.locator('#gpsdo-gnss-badge')).toHaveText(/\d+ SATS/);
    await page.waitForTimeout(3000);
    await answerSystemQuiz(page, 'A GNSS spoof, local to Shetland');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Shetland: Spot the Walk');
  });

  test('[shetland-holdover] takes the Shetland GNSS switch down', async () => {
    await missionControl.selectTab('gps-timing');
    await setSwitch(page, '#gpsdo-gnss-switch', false);
    await expect(page.locator('#gpsdo-holdover-badge').first()).toHaveText('ACTIVE', { timeout: 10000 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Shetland: Stop Trusting GNSS', 60000);
  });

  test('[acquire-sar2-from-shetland] program-tracks SAR-2 from Shetland on the post-burn set', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T03:31:40Z');
    await programTrack(page, missionControl, '61702');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-2 from Shetland', 60000);
  });

  test('[decode-the-collect] locks SAR-2 at Shetland and logs the first half hour', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T03:34:30Z');
    await missionControl.selectTab('rx-analysis');
    await page.waitForTimeout(4000);
    await answerSystemQuiz(page, '03:01-03:16 rain band GW-01');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Decode the Collect', 60000);
  });

  test('[protect-the-feed] heater on at Galway before the sleet', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T03:36:30Z');
    await missionControl.selectGroundStation('GW-01');
    await enableFeedHeater();
    await answerSystemQuiz(page, 'Rain does not stick and a heated feed in rain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Protect the Feed');
  });

  test('[arm-galway-for-sar3] retunes TX to 1465, RX to 1340, Doppler on', async () => {
    await setTxModemFrequency(page, missionControl, 1465);
    await enableDopplerComp(page, missionControl);
    await setRxModemFrequency(page, missionControl, 1340);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Arm Galway for SAR-3');
  });

  test('[acquire-sar3] program-tracks SAR-3 through the sleet', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T03:52:40Z');
    await programTrack(page, missionControl, '61703');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-3 Through the Sleet', 60000);
  });

  test('[chain-up-and-command] chains up and gets the HK-DUMP ACK', async () => {
    await setTxModemOnAir(page, missionControl);
    await setSwitch(page, '#buc-mute', false);
    await enableHpa(page, missionControl);
    await page.waitForTimeout(3000);
    await sendCommandAndExpectAck(page, missionControl, 'HK-DUMP');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Chain Up and Command');
  });

  test('[call-the-denial] PLD-SAFE NAKs into the jammer; reads console and key; calls the denial', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T03:55:20Z');
    await sendCommandAndExpectNak(page, missionControl, 'PLD-SAFE', 'Uplink denied - carrier jammed');
    await page.waitForTimeout(3000);
    await missionControl.selectTab('tx-chain');
    await expect(page.locator('#tx-payload-enc-key-status').first()).toHaveText(/Valid/i);
    await page.waitForTimeout(3000);
    await answerDecision(page, 'Uplink denial on the fixed carrier - key HOP-SAR3-01', ['TT&C console read', 'Command key read on TX Chain']);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Call the Denial');
  });

  test('[hop-and-deliver] loads HOP-SAR3-01, hops, and puts PLD-SAFE through', async () => {
    await missionControl.selectTab('security-console');
    await domClick(page, '#sec-transec-load-key');
    await expect(page.locator('#sec-transec-key-badge')).toHaveText('LOADED', { timeout: 10000 });
    await page.locator('#sec-transec-mode').selectOption({ value: 'hopping' });
    await expect(page.locator('#sec-transec-sync-badge')).toHaveText('SYNC LOCKED', { timeout: 10000 });
    await sendCommandAndExpectAck(page, missionControl, 'PLD-SAFE');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Hop and Deliver');
  });

  test('[safe-the-network] chains Galway down after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-04-27T04:01:50Z');
    await disableHpa(page, missionControl);
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Safe the Network');
  });

  test('[incident-log-and-handover] logs the second half hour, hands over, and completes', async () => {
    const answers = [
      { questionHint: 'second half hour', answerText: '03:36 GW-01 feed heater on' },
      { questionHint: 'handover line', answerText: 'Open: SH-02 reference in holdover' },
    ];
    await answerPendingQuizFrom(page, answers);
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await answerPendingQuizFrom(page, answers);
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 45000 });
  });

  test('verifies mission complete', async () => {
    const levelCompleteModal = page.locator('#level-complete-modal');
    await expect(levelCompleteModal).toBeVisible();
    await expect(levelCompleteModal).toContainText(/Mission Complete|Scenario Complete/i);
  });
});
