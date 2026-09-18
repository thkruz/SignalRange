import { expect, Page } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { domClick } from './ham-sdr-helpers';
import { waitForQuizToAppear } from './simulation-helpers';

/**
 * Shared console drivers for the nats-eu qualified-tier full-completion specs
 * (S9 to S12). Each helper drives one operator console through its real DOM:
 * the ACU program-track section, the Link Analysis worksheet, the TX chain
 * (HPA back-off / enable, modem on air), the TT&C commanding console, the
 * contact plan, the ephemeris panel and the RX modem tuning strip.
 *
 * Every click aimed at a console goes through domClick: the checklist
 * box stays open so the specs can poll it, and as a draggable overlay it can
 * sit on top of a console control and intercept a pointer click. Inputs are
 * filled and then handed a synthetic change event, which is what each adapter
 * listens for.
 *
 * Clock rule: contact windows, command windows and space events all run on
 * the mission clock, so specs jump with advanceMissionClockToUtc (sim AND
 * mission together), never advanceSimClock alone.
 */

/**
 * Assert the Dashboard's Active Alarms card lists an entry containing `text`.
 * Sweep quizzes are graded against the board the simulation actually shows,
 * so read the board before answering instead of trusting the quiz's own copy.
 */
export async function expectDashboardAlarm(page: Page, text: string): Promise<void> {
  const entry = page.locator('#alarm-list .alarm-message', { hasText: text });
  await expect(entry.first()).toBeVisible({ timeout: 15000 });
}

/** Answer a SYSTEM status-check quiz by option text and dismiss the feedback. */
export async function answerSystemQuiz(page: Page, answerText: string): Promise<void> {
  await waitForQuizToAppear(page);

  const option = page.locator('.quiz-option-btn', { hasText: answerText });
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();

  const feedbackContinue = page.locator('#quiz-continue-btn');
  await expect(feedbackContinue).toBeVisible({ timeout: 5000 });
  await feedbackContinue.click();
}

/**
 * Answer whichever SYSTEM quiz is pending, choosing the answer whose question
 * matches. For objectives with several status-check conditions the quiz
 * manager presents them in its own order, not the declared one.
 */
export async function answerPendingQuizFrom(page: Page, answers: Array<{ questionHint: string; answerText: string }>): Promise<string> {
  await waitForQuizToAppear(page);

  const questionText = (await page.locator('#quiz-modal, .quiz-box').first().innerText()) ?? '';
  const match = answers.find((a) => questionText.includes(a.questionHint));
  expect(match, `no answer registered for quiz text: ${questionText.slice(0, 120)}`).toBeTruthy();

  const option = page.locator('.quiz-option-btn', { hasText: match!.answerText });
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();

  const feedbackContinue = page.locator('#quiz-continue-btn');
  await expect(feedbackContinue).toBeVisible({ timeout: 5000 });
  await feedbackContinue.click();

  return match!.questionHint;
}

/**
 * Close the Working Document box if a documentLine quiz just opened it. The
 * box auto-shows on the first entry and floats over the consoles.
 */
export async function closeWorkingDocumentIfOpen(page: Page): Promise<void> {
  const box = page.locator('#draggable-html-box-working-document');
  if (await box.isVisible({ timeout: 1000 }).catch(() => false)) {
    const closeBtn = box.locator('.draggable-box__close-btn, [id$="-close"]').first();
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click();
    }
  }
}

/** Fill a numeric input and fire the change event the adapters listen for. */
export async function fillAndChange(page: Page, selector: string, value: string): Promise<void> {
  const input = page.locator(selector);
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill(value);
  await input.dispatchEvent('change');
}

/**
 * Enable program-track on the ACU tab (if not already) and select the target
 * satellite. Selecting a target copies its beacon frequency into the ACU
 * beacon field and slews the pedestal to the target's current position.
 */
export async function programTrack(page: Page, missionControl: MissionControlPage, noradId: string): Promise<void> {
  await missionControl.selectTab('acu-control');

  const modeButton = page.locator('.btn-tracking[data-mode="program-track"]');
  await expect(modeButton).toBeVisible({ timeout: 10000 });
  if (!(await modeButton.evaluate((el) => el.classList.contains('active')))) {
    await domClick(page, '.btn-tracking[data-mode="program-track"]');
    await page.waitForTimeout(300);
  }

  const satelliteSelect = page.locator('select[id$="satellite-select"]');
  await expect(satelliteSelect).toBeVisible({ timeout: 10000 });
  await satelliteSelect.selectOption({ value: noradId });

  const moveBtn = page.locator('button[id$="move-to-target-btn"]');
  if (await moveBtn.isEnabled({ timeout: 1000 }).catch(() => false)) {
    await domClick(page, 'button[id$="move-to-target-btn"]');
  }
}

export interface LinkBudgetWorksheet {
  eirpDbm: number;
  fsplDb: number;
  rxGainDbi: number;
  noiseTempK: number;
  bandwidthMHz: number;
  miscLossDb: number;
}

/** Fill the Link Analysis worksheet, press Compute, and expect IN FAMILY. */
export async function computeLinkBudget(page: Page, missionControl: MissionControlPage, worksheet: LinkBudgetWorksheet): Promise<void> {
  await missionControl.selectTab('link-budget');
  await expect(page.locator('#lb-compute')).toBeVisible({ timeout: 10000 });

  await page.locator('#lb-eirp').fill(String(worksheet.eirpDbm));
  await page.locator('#lb-fspl').fill(String(worksheet.fsplDb));
  await page.locator('#lb-rxgain').fill(String(worksheet.rxGainDbi));
  await page.locator('#lb-noisetemp').fill(String(worksheet.noiseTempK));
  await page.locator('#lb-bandwidth').fill(String(worksheet.bandwidthMHz));
  await page.locator('#lb-miscloss').fill(String(worksheet.miscLossDb));

  await domClick(page, '#lb-compute');
  await expect(page.locator('#lb-accept-badge')).toHaveText('IN FAMILY', { timeout: 5000 });
}

/** Read the live C/N shown on the Link Analysis tab (NaN when no modem lock). */
export async function readLiveCnr(page: Page): Promise<number> {
  const text = (await page.locator('#lb-live-cnr').textContent()) ?? '';
  return parseFloat(text);
}

/**
 * Press Accept Link on the Link Analysis tab once the live C/N clears the
 * margin the objective asks for, and expect the LINK GO badge.
 */
export async function commitLinkWithMargin(page: Page, missionControl: MissionControlPage, minLiveCnrDb: number, timeoutMs = 60000): Promise<void> {
  await missionControl.selectTab('link-budget');
  await expect(page.locator('#lb-commit')).toBeVisible({ timeout: 10000 });

  const deadline = Date.now() + timeoutMs;
  let live = NaN;
  while (Date.now() < deadline) {
    live = await readLiveCnr(page);
    if (Number.isFinite(live) && live >= minLiveCnrDb) break;
    await page.waitForTimeout(1000);
  }
  expect(live, `live C/N ${live} dB never reached ${minLiveCnrDb} dB`).toBeGreaterThanOrEqual(minLiveCnrDb);

  await expect(page.locator('#lb-commit')).toBeEnabled();
  await domClick(page, '#lb-commit');
  await expect(page.locator('#lb-margin-badge')).toHaveText('LINK GO', { timeout: 5000 });
}

/** Retune the active RX modem on the RX Analysis tab and apply. */
export async function setRxModemFrequency(page: Page, missionControl: MissionControlPage, mhz: number): Promise<void> {
  await missionControl.selectTab('rx-analysis');
  const freqInput = page.locator('#frequency-input');
  await expect(freqInput).toBeVisible({ timeout: 10000 });
  await freqInput.fill(String(mhz));
  await freqInput.press('Tab');
  await page.waitForTimeout(200);
  await domClick(page, '#apply-btn');
  await page.waitForTimeout(500);
}

/** Stage an HPA back-off (dB) on the TX Chain tab and apply it. */
export async function setHpaBackOff(page: Page, missionControl: MissionControlPage, backOffDb: number): Promise<void> {
  await missionControl.selectTab('tx-chain');
  await fillAndChange(page, '#hpa-backoff', String(backOffDb));
  await domClick(page, '#hpa-apply-btn');
  await expect(page.locator('#hpa-backoff')).toHaveValue(String(backOffDb));
}

/** Toggle a form switch to the wanted state via a DOM click (change fires). */
export async function setSwitch(page: Page, selector: string, wanted: boolean): Promise<void> {
  const el = page.locator(selector);
  await expect(el).toBeVisible({ timeout: 10000 });
  if ((await el.isChecked()) !== wanted) {
    await domClick(page, selector);
  }
  if (wanted) {
    await expect(el).toBeChecked();
  } else {
    await expect(el).not.toBeChecked();
  }
}

/** Put the transmit modem on air (power switch first if it is down). */
export async function setTxModemOnAir(page: Page, missionControl: MissionControlPage): Promise<void> {
  await missionControl.selectTab('tx-chain');
  await setSwitch(page, '#tx-power-switch', true);
  await page.waitForTimeout(200);
  await setSwitch(page, '#tx-transmit-switch', true);
}

/** Enable the HPA. Only call with the modem already driving the BUC. */
export async function enableHpa(page: Page, missionControl: MissionControlPage): Promise<void> {
  await missionControl.selectTab('tx-chain');
  await setSwitch(page, '#hpa-enable', true);
}

/** Disable the HPA (uplink cold). Safe in any modem state. */
export async function disableHpa(page: Page, missionControl: MissionControlPage): Promise<void> {
  await missionControl.selectTab('tx-chain');
  await setSwitch(page, '#hpa-enable', false);
}

/** Engage uplink Doppler compensation on the TT&C console. */
export async function enableDopplerComp(page: Page, missionControl: MissionControlPage): Promise<void> {
  await missionControl.selectTab('commanding');
  await setSwitch(page, '#cmd-doppler', true);
}

/** Transmit a canned command and wait for its ACK row in the command log. */
export async function sendCommandAndExpectAck(page: Page, missionControl: MissionControlPage, commandId: string): Promise<void> {
  await missionControl.selectTab('commanding');
  await expect(page.locator('#cmd-window-badge')).toHaveText('OPEN', { timeout: 10000 });
  await domClick(page, `#cmd-send-panel button[data-command-id="${commandId}"]`);

  const row = page.locator('#cmd-log-body tr', { hasText: commandId }).first();
  await expect(row).toBeVisible({ timeout: 5000 });
  await expect(row).toContainText('ACK received');
}

/** Allocate a contact to a station on the Contact Plan console. */
export async function assignContact(page: Page, contactId: string, stationId: string): Promise<void> {
  const select = page.locator(`select.cs-station-select[data-contact-id="${contactId}"]`);
  await expect(select).toBeVisible({ timeout: 10000 });
  await select.selectOption({ value: stationId });
}

/** Retune the transmit modem on the TX Chain tab (MHz) and apply. */
export async function setTxModemFrequency(page: Page, missionControl: MissionControlPage, mhz: number): Promise<void> {
  await missionControl.selectTab('tx-chain');
  await fillAndChange(page, '#tx-frequency-input', String(mhz));
  await domClick(page, '#tx-apply-btn');
  await expect(page.locator('#tx-frequency-current')).toContainText(`${mhz.toFixed(1)} MHz`, { timeout: 5000 });
}

/** Stage a BUC gain (dB) on the TX Chain tab and apply it. */
export async function setBucGain(page: Page, missionControl: MissionControlPage, gainDb: number): Promise<void> {
  await missionControl.selectTab('tx-chain');
  await fillAndChange(page, '#buc-gain', String(gainDb));
  await domClick(page, '#buc-apply-btn');
  await expect(page.locator('#buc-gain')).toHaveValue(String(gainDb));
}

/** Pick a resolution bandwidth on the RX Analysis spectrum analyzer (select values are MHz strings, e.g. '0.01' = 10 kHz). */
export async function setSpecaRbw(page: Page, missionControl: MissionControlPage, rbwOptionValue: string): Promise<void> {
  await missionControl.selectTab('rx-analysis');
  const select = page.locator('#sa-rbw');
  await expect(select).toBeVisible({ timeout: 10000 });
  await select.selectOption(rbwOptionValue);
}

/** Stage repeated fine-adjust clicks on one axis of the selected station's ACU (apply separately). */
export async function jogAxis(page: Page, axisPrefix: 'az-fine' | 'el-fine', delta: number, clicks: number): Promise<void> {
  const selector = `[id^="${axisPrefix}"] .btn-fine[data-delta="${delta}"]`;
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 10000 });
  for (let i = 0; i < clicks; i++) {
    await domClick(page, selector);
  }
}

/**
 * Park the selected station's tracker by jogging from its current staged
 * azimuth/elevation to a target with the ACU fine buttons, then apply. Jogs
 * in 10 deg steps and finishes with 1 deg steps; both axes.
 */
export async function parkAntenna(page: Page, missionControl: MissionControlPage, from: { az: number; el: number }, to: { az: number; el: number }): Promise<void> {
  await missionControl.selectTab('acu-control');
  const azDelta = to.az - from.az;
  const elDelta = to.el - from.el;
  const azCoarse = Math.trunc(azDelta / 10);
  const azFine = azDelta - azCoarse * 10;
  if (azCoarse !== 0) await jogAxis(page, 'az-fine', azCoarse > 0 ? 10 : -10, Math.abs(azCoarse));
  if (azFine !== 0) await jogAxis(page, 'az-fine', azFine > 0 ? 1 : -1, Math.abs(azFine));
  if (elDelta !== 0) await jogAxis(page, 'el-fine', elDelta > 0 ? 1 : -1, Math.abs(elDelta));
  await domClick(page, '[id$="apply-changes-btn"]');
}

/** Press Load Updated Ephemeris for a space event once its row reads STALE. */
export async function loadEphemeris(page: Page, missionControl: MissionControlPage, eventId: string, timeoutMs = 60000): Promise<void> {
  await missionControl.selectTab('pass-schedule');
  const selector = `#ephemeris-panel [data-ephemeris-event="${eventId}"]`;
  await expect(page.locator(selector)).toBeVisible({ timeout: timeoutMs });

  // The panel rebuilds its innerHTML on the update tick, so a button resolved
  // in one round trip and clicked in the next can be detached by the time the
  // click fires and never reach the delegated handler. Resolve and click in
  // one page task, and retry if a re-render swallowed it.
  const updated = page.locator('#ephemeris-panel .ephemeris-badge-updated');
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement | null)?.click(), selector);
    const ok = await updated
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return;
  }
  await expect(updated).toBeVisible({ timeout: 10000 });
}
