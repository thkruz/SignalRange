import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import {
  answerSystemQuiz,
  closeWorkingDocumentIfOpen,
  commitLinkWithMargin,
  computeLinkBudget,
  disableHpa,
  enableDopplerComp,
  enableHpa,
  fillAndChange,
  parkAntenna,
  programTrack,
  sendCommandAndExpectAck,
  setRxModemFrequency,
  setSwitch,
  setTxModemFrequency,
  setTxModemOnAir,
} from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * nats-eu Scenario 12 "LEOP: Commissioning" - full completion (phase 16).
 *
 * SAR-3 payload acceptance done as the test card: readiness (board,
 * reference, prediction, crypto both ways, TX modem retuned from SAR-1's 1405
 * to SAR-3's 1465 MHz with Doppler comp, analyzer framed on 1330 MHz, tracker
 * parked on az 140), acquire with the chain cold, chain up in order inside
 * the window (carrier into the muted BUC, unmute, HPA), PLD-ON then
 * PLD-TEST-PATTERN, HPA off before the decode, RX modem to 1340 MHz, lock and
 * commit with 2 dB of margin, chain down, verdict, delivery. Clock starts
 * 2027-03-24 09:48:00Z:
 *   MERIDIAN-SAR-3  AOS 10:06:00Z  max el 27.9 deg at 10:10:45Z  LOS 10:15:29Z
 *   command window  mission T+1102 s .. T+1628 s
 *   worksheet truth 10.9 dB; threshold 6 dB + 2 dB required margin
 *
 * Objective flow (19):
 *  1. review-mission-brief    2. dashboard-sweep         3. reference-check
 *  4. predict-acceptance      5. crypto-both-ways        6. tune-the-uplink
 *  7. analyzer-on-sar3        8. preposition-for-aos     9. acquire-sar3
 * 10. carrier-into-muted-buc 11. unmute-the-buc         12. enable-the-hpa
 * 13. payload-power-on       14. payload-test-pattern   15. secure-for-decode
 * 16. first-video            17. chain-down-after-los   18. sign-the-card
 * 19. deliver-to-customer
 */
test.describe('nats-eu Scenario 12 Full Completion', () => {
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

    // Direct navigation bypasses the nats-eu-scenario11 prerequisite card lock
    await missionControl.gotoScenario('nats-eu', 'nats-eu-scenario12');
    await waitForSimulationReady(page);
    await missionControl.dismissDialogIfPresent();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('[review-mission-brief] reads the test plan and why the order matters', async () => {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
    await answerSystemQuiz(page, 'Each step is the evidence for the next');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Read the Test Plan');
  });

  test('[dashboard-sweep] confirms a clean board', async () => {
    await missionControl.selectGroundStation('GW-01');
    await missionControl.selectTab('dashboard');
    await answerSystemQuiz(page, 'No active alarms');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'GW-01 Dashboard Sweep');
  });

  test('[reference-check] observes the GPSDO and the BUC reference', async () => {
    for (const tab of ['gps-timing', 'tx-chain']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Reference Check');
  });

  test('[predict-acceptance] computes the acceptance C/N from the survey numbers', async () => {
    await computeLinkBudget(page, missionControl, {
      eirpDbm: 28,
      fsplDb: 171.5,
      rxGainDbi: 51.8,
      noiseTempK: 88,
      bandwidthMHz: 36,
      miscLossDb: 1,
    });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Predict the Acceptance C/N');
  });

  test('[crypto-both-ways] records both key states on the card', async () => {
    for (const tab of ['tx-chain', 'rx-analysis']) {
      await missionControl.selectTab(tab);
      await page.waitForTimeout(2500);
    }
    await answerSystemQuiz(page, 'PLD-ON and the pattern command go up under the command key');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Crypto Both Ways');
  });

  test('[tune-the-uplink] retunes the TX modem to 1465 MHz and engages Doppler comp', async () => {
    await setTxModemFrequency(page, missionControl, 1465);
    await enableDopplerComp(page, missionControl);
    await answerSystemQuiz(page, '1465 MHz (RF minus LO');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Tune the Uplink');
  });

  test('[analyzer-on-sar3] frames the SAR-3 plan on the analyzer', async () => {
    await missionControl.selectTab('rx-analysis');
    await fillAndChange(page, '#sa-center-freq', '1330');
    await answerSystemQuiz(page, 'The CW beacon at 1315');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Analyzer on the SAR-3 Plan');
  });

  test('[preposition-for-aos] parks the tracker on the rise azimuth', async () => {
    // Parked az 5 / el 3; the rise is az 140 / el 5 (tolerance 3 deg).
    await parkAntenna(page, missionControl, { az: 5, el: 3 }, { az: 140, el: 5 });
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Pre-position for AOS', 60000);
  });

  test('[acquire-sar3] program-tracks SAR-3 and sees the 1315 MHz beacon with the chain cold', async () => {
    await advanceMissionClockToUtc(page, '2027-03-24T10:05:30Z');
    await programTrack(page, missionControl, '61703');
    await page.waitForTimeout(2000);

    // Early in the pass, with the command window already open
    await advanceMissionClockToUtc(page, '2027-03-24T10:07:00Z');
    await missionControl.selectTab('rx-analysis');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Acquire SAR-3', 60000);
  });

  test('[carrier-into-muted-buc] puts the modem on air into the muted BUC', async () => {
    await setTxModemOnAir(page, missionControl);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Carrier Into the Muted BUC');
  });

  test('[unmute-the-buc] unmutes the BUC and reads the order', async () => {
    await setSwitch(page, '#buc-mute', false);
    await answerSystemQuiz(page, 'Every stage sees a signal before it sees gain');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Unmute the BUC');
  });

  test('[enable-the-hpa] enables the HPA and confirms it is linear', async () => {
    await enableHpa(page, missionControl);
    await page.waitForTimeout(2500);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Enable the HPA');
  });

  test('[payload-power-on] sends PLD-ON and gets the ACK', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'PLD-ON');
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Payload Power On');
  });

  test('[payload-test-pattern] sends PLD-TEST-PATTERN and records the checkout', async () => {
    await sendCommandAndExpectAck(page, missionControl, 'PLD-TEST-PATTERN');
    await answerSystemQuiz(page, 'PLD-ON then PLD-TEST-PATTERN, both ACKed');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Payload Test Pattern');
  });

  test('[secure-for-decode] disables the HPA and reads the transponded return', async () => {
    // With the HPA up, SAR-3's TT&C transponder returns the station's own
    // 14065 MHz carrier at 11810 MHz (IF 1290) some 50 dB above the pattern;
    // the RX AGC drops and the 1340 MHz pattern reads ~3 dB instead of ~11.
    await disableHpa(page, missionControl);
    await expect(page.locator('#hpa-enable')).not.toBeChecked();
    await page.waitForTimeout(3000); // TX Chain stays on screen so the condition latches
    await answerSystemQuiz(page, "SAR-3's command transponder turns");
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Secure the Uplink for the Decode');
  });

  test('[first-video] retunes to 1340 MHz, locks the pattern, commits with 2 dB margin and records it', async () => {
    // The RX modem is still on SAR-1's 1414 MHz from the morning
    await setRxModemFrequency(page, missionControl, 1340);

    // Observe on RX Analysis BEFORE the jump so lock and C/N >= 8 dB latch as
    // soon as the bird is near max elevation (10:10:45Z)
    await missionControl.selectTab('rx-analysis');
    await advanceMissionClockToUtc(page, '2027-03-24T10:10:15Z');
    await dismissDialogIfPresent(page);
    await page.waitForTimeout(4000);

    // Commit with the live C/N at least 8 dB (6 dB threshold + 2 dB margin)
    await commitLinkWithMargin(page, missionControl, 8);
    await answerSystemQuiz(page, 'The measured C/N alongside the 10.9 dB prediction');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'First Imagery Decode', 60000);
  });

  test('[chain-down-after-los] mutes the BUC and drops the carrier after LOS', async () => {
    await advanceMissionClockToUtc(page, '2027-03-24T10:16:00Z');
    await closeWorkingDocumentIfOpen(page);
    await missionControl.selectTab('tx-chain');
    await setSwitch(page, '#buc-mute', true);
    await setSwitch(page, '#tx-transmit-switch', false);
    await dismissDialogIfPresent(page);
    await waitForObjectiveComplete(missionControl, 'Chain Down After LOS');
  });

  test('[sign-the-card] records the verdict', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'ACCEPTED at the tested performance');
    await dismissDialogIfPresent(page);
    await closeWorkingDocumentIfOpen(page);
    await waitForObjectiveComplete(missionControl, 'Sign the Card');
  });

  test('[deliver-to-customer] confirms what acceptance transfers and completes', async () => {
    await closeWorkingDocumentIfOpen(page);
    await answerSystemQuiz(page, 'SAR-3 enters the tasking pool');
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
