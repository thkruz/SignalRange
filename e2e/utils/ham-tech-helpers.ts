import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, Locator, Page } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForObjectiveComplete } from './ham-sdr-helpers';
import { dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from './simulation-helpers';

/**
 * Shared helpers for the Campaign 3 Technician (ham-tech-sNN) full-completion specs.
 * Everything is driven through the Station tab by data-testid (scheme documented in
 * src/pages/mission-control/tabs/ham-station-tab.ts). The tab is a drawn bench: a control only
 * exists in the Close-up of the device or cable it belongs to, so every helper goes through
 * reveal(), which selects the owner on the bench first (or opens the Notebook). Quiz answers come from the same JSON
 * the scenarios are built from, matched on the displayed question stem.
 */

export const HAM_CAMPAIGN = 'ham-sdr';

interface QuizItem {
  localId: string;
  stem: string;
  options: string[];
  correctIndex: number;
}

let quizItems: QuizItem[] | null = null;

function items(): QuizItem[] {
  quizItems ??= (JSON.parse(readFileSync(join(process.cwd(), 'src/campaigns/ham-sdr/quiz/c3-quiz-items.json'), 'utf8')) as { items: QuizItem[] }).items;

  return quizItems;
}

/** Mirrors ui-kit tid(): runs of characters outside [A-Za-z0-9_-] become one dash */
export const tid = (...parts: (string | number)[]): string => parts.map((p) => String(p).replace(/[^a-zA-Z0-9_-]+/gu, '-')).join('-');

const norm = (s: string): string => s.replace(/\s+/gu, ' ').trim();

// ---- Bench navigation: one Close-up at a time, worksheets/cards/log in the Notebook ----

const NOTEBOOK_PREFIXES = ['ham-ws-', 'ham-card-', 'ham-log-'];

async function isShown(page: Page, testId: string): Promise<boolean> {
  const l = page.getByTestId(testId).first();

  return (await l.count()) > 0 && (await l.isVisible());
}

/** Select a device or cable on the bench drawing; false when it is not drawn at this location */
export async function benchSelect(page: Page, id: string): Promise<boolean> {
  for (const kind of ['dev', 'conn']) {
    const el = page.getByTestId(tid(`ham-bench-${kind}`, id));
    if ((await el.count()) === 0) continue;
    if ((await el.getAttribute('aria-pressed')) !== 'true') await el.dispatchEvent('click');

    return true;
  }

  return false;
}

/** The kind of a device drawn on the bench, or null when it is not drawn here */
export const benchKind = (page: Page, id: string): Promise<string | null> =>
  page
    .getByTestId(tid('ham-bench-dev', id))
    .first()
    .getAttribute('data-kind', { timeout: 1000 })
    .catch(() => null);

/**
 * Make a control visible and return it. Tries the hinted owners first, then every device and
 * cable at this location, then the other locations. Notebook ids open the Notebook tab.
 */
export async function reveal(page: Page, testId: string, hints: string[] = []): Promise<Locator> {
  const target = page.getByTestId(testId).first();
  if (await isShown(page, testId)) return target;
  if (NOTEBOOK_PREFIXES.some((p) => testId.startsWith(p))) {
    await page.getByTestId('ham-side-notebook').click();
    await expect(target).toBeVisible({ timeout: 5000 });

    return target;
  }
  if (await isShown(page, 'ham-side-closeup')) await page.getByTestId('ham-side-closeup').click();
  const tryHere = async (): Promise<boolean> => {
    for (const h of hints) if ((await benchSelect(page, h)) && (await isShown(page, testId))) return true;
    if (await isShown(page, testId)) return true;
    const owners = await page
      .locator('[data-testid^="ham-bench-dev-"], [data-testid^="ham-bench-conn-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-dev') ?? e.getAttribute('data-conn') ?? ''));
    for (const id of owners) if ((await benchSelect(page, id)) && (await isShown(page, testId))) return true;

    return false;
  };
  if (await tryHere()) return target;
  const here = await page.locator('[data-testid^="ham-loc-"][aria-pressed="true"]').first().getAttribute('data-testid');
  const locs = await page.locator('[data-testid^="ham-loc-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? ''));
  for (const loc of locs) {
    if (loc === here) continue;
    await page.getByTestId(loc).click();
    if (await tryHere()) return target;
  }
  if (here) await page.getByTestId(here).click();
  throw new Error(`reveal: no bench device or cable shows ${testId}`);
}

/** Click a control after revealing it */
const press = async (page: Page, testId: string, hints: string[] = []): Promise<void> => (await reveal(page, testId, hints)).click();

/** SDR receivers have no front panel: their controls are the SDR program on the laptop */
const isSdr = async (page: Page, dev: string): Promise<boolean> => (await benchKind(page, dev)) === 'sdr';

/** Show the laptop SDR program for this receiver (it must be plugged into a running laptop) */
async function sdrControl(page: Page, dev: string, control: string): Promise<Locator> {
  const laptops = await page.locator('[data-kind="laptop"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dev') ?? ''));

  return reveal(page, tid('ham-sdr', dev, control), laptops);
}

/** Open a tech scenario (e.g. 'ham-tech-s01') and start it. The station stays locked until the brief is opened: call reviewMissionBrief, then openStationTab. */
export async function openTechScenario(page: Page, missionControl: MissionControlPage, scenarioId: string): Promise<void> {
  await missionControl.gotoScenario(HAM_CAMPAIGN, scenarioId);
  await waitForSimulationReady(page);
  await missionControl.dismissDialogIfPresent();
}

export async function openStationTab(page: Page, missionControl: MissionControlPage): Promise<void> {
  await missionControl.selectGroundStation('KF0SRT-HOME');
  await missionControl.selectTab('ham-station');
  await expect(page.getByTestId('ham-station-tab')).toBeVisible({ timeout: 15000 });
}

/** review-mission-brief objective: open then close the brief (unlocks the station in the asset tree). */
export async function reviewMissionBrief(page: Page, missionControl: MissionControlPage, title = 'Read the Mission Brief'): Promise<void> {
  await missionControl.openMissionBrief();
  await missionControl.closeMissionBrief();
  await dismissDialogIfPresent(page);
  await waitForObjectiveComplete(missionControl, title);
}

/** Answer the next pending status-check quiz with the correct option from c3-quiz-items.json. Returns the localId. */
export async function answerTechQuiz(page: Page): Promise<string> {
  await waitForQuizToAppear(page);
  const question = norm((await page.locator('#quiz-question').textContent()) ?? '');
  const item = items().find((i) => norm(i.stem) === question);
  if (!item) throw new Error(`No quiz item for question: ${question}`);
  const option = page.locator('.quiz-option-btn', { hasText: item.options[item.correctIndex] });
  await expect(option.first()).toBeVisible({ timeout: 10000 });
  await option.first().click();
  const next = page.locator('#quiz-continue-btn');
  await expect(next).toBeVisible({ timeout: 5000 });
  await next.click();
  await dismissDialogIfPresent(page);

  return item.localId;
}

export async function answerTechQuizzes(page: Page, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(await answerTechQuiz(page));

  return ids;
}

/** Fill and submit a worksheet. Match fields take a record, choice fields a string, number fields a number. */
/** Tag a bench part with its job: select the part on the bench, then click the job button in the Close-up */
async function tagOnBench(page: Page, part: string, job: string): Promise<void> {
  const btn = page.getByRole('button', { name: `${part}: ${job}`, exact: true });
  const shown = async (): Promise<boolean> => (await btn.count()) > 0 && (await btn.first().isVisible());
  if (await isShown(page, 'ham-side-closeup')) await page.getByTestId('ham-side-closeup').click();
  if (!(await shown())) {
    const owners = await page.locator('[data-testid^="ham-bench-dev-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dev') ?? ''));
    for (const dev of owners) if ((await benchSelect(page, dev)) && (await shown())) break;
  }
  if (!(await shown())) throw new Error(`tagOnBench: no bench device offers the job "${job}" for ${part}`);
  await btn.first().click();
  await expect(btn.first()).toHaveAttribute('aria-pressed', 'true');
}

export async function submitWorksheet(page: Page, id: string, values: Record<string, string | number | Record<string, string>>): Promise<void> {
  for (const [field, v] of Object.entries(values)) {
    if (typeof v === 'number') {
      await (await reveal(page, `ham-ws-${id}-${field}`)).fill(String(v));
    } else if (typeof v === 'string') {
      await (await reveal(page, `ham-ws-${id}-${field}`)).selectOption(v);
    } else {
      for (const [key, val] of Object.entries(v)) {
        const row = await reveal(page, tid('ham-ws', id, field, key));
        if ((await row.evaluate((e) => e.tagName)) === 'SELECT') await row.selectOption(val);
        else await tagOnBench(page, key, val);
      }
    }
  }
  await (await reveal(page, `ham-ws-${id}-submit`)).click();
  await expect(page.getByTestId(`ham-ws-${id}-status`)).toContainText('correct', { timeout: 5000 });
}

/** Connections panel */
export async function connectPorts(page: Page, a: { device: string; port: string }, b: { device: string; port: string }): Promise<void> {
  // Pick up one connector, then click the one it plugs into
  await (await reveal(page, tid('ham-port', a.device, a.port), [a.device])).dispatchEvent('click');
  await (await reveal(page, tid('ham-port', b.device, b.port), [b.device])).dispatchEvent('click');
}
export const inspectItem = (page: Page, id: string) => press(page, tid('ham-conn', id, 'inspect'), [id]);
export const seatConnection = (page: Page, id: string) => press(page, tid('ham-conn', id, 'seat'), [id]);
export const repairFault = (page: Page, faultId: string) => press(page, tid('ham-conn', faultId, 'repair'));
/** Device power button in the connections panel (toggles; not for circuit boards, use the board panel) */
export const powerDevice = (page: Page, id: string) => press(page, tid('ham-conn', id, 'power'), [id]);

/** Radio panel. Frequency is staged: input then Apply. */
export async function tuneRadio(page: Page, dev: string, mhz: number): Promise<void> {
  if (await isSdr(page, dev)) {
    await (await sdrControl(page, dev, 'freq-input')).fill(String(mhz));
    await (await sdrControl(page, dev, 'freq-enter')).click();

    return;
  }
  await (await reveal(page, `ham-radio-${dev}-freq-input`, [dev])).fill(String(mhz));
  await press(page, `ham-radio-${dev}-apply`, [dev]);
}
export async function setFilterPreset(page: Page, dev: string, hz: number): Promise<void> {
  if (await isSdr(page, dev)) await (await sdrControl(page, dev, `bw-${hz}`)).click();
  else await (await reveal(page, `ham-radio-${dev}-filter-preset`, [dev])).selectOption(String(hz));
}
export async function setSquelch(page: Page, dev: string, v: number): Promise<void> {
  await (await ((await isSdr(page, dev)) ? sdrControl(page, dev, 'squelch') : reveal(page, `ham-radio-${dev}-squelch`, [dev]))).fill(String(v));
}
export async function setVolume(page: Page, dev: string, v: number): Promise<void> {
  await (await ((await isSdr(page, dev)) ? sdrControl(page, dev, 'volume') : reveal(page, `ham-radio-${dev}-volume`, [dev]))).fill(String(v));
}

/** Meter panel (dmm defaults to 'dmm1', the id used when the config has no multimeter device) */
export const setMeterMode = (page: Page, mode: 'OFF' | 'DCV' | 'DCA' | 'OHM' | 'CONT', dmm = 'dmm1') => press(page, `ham-meter-${dmm}-mode-${mode}`, [dmm]);
export const setMeterSocket = async (page: Page, socket: 'VΩ' | 'A', dmm = 'dmm1') => (await reveal(page, `ham-meter-${dmm}-socket`, [dmm])).selectOption(socket);
/** Place probes across two test points and read (series select is disabled outside DCA mode, so it is left alone). */
export async function meterReadAcross(page: Page, red: string, black: string, dmm = 'dmm1'): Promise<void> {
  await (await reveal(page, `ham-meter-${dmm}-red`, [dmm])).selectOption(red);
  await (await reveal(page, `ham-meter-${dmm}-black`, [dmm])).selectOption(black);
  await press(page, `ham-meter-${dmm}-read`, [dmm]);
}
/** Read current with the meter in series at a break point (DCA mode + A socket must already be set). */
export async function meterReadSeries(page: Page, breakId: string, dmm = 'dmm1'): Promise<void> {
  await (await reveal(page, `ham-meter-${dmm}-series`, [dmm])).selectOption(breakId);
  await press(page, `ham-meter-${dmm}-read`, [dmm]);
}

/** Board panel: 12 V supply (power) and SW1 lever are checkboxes */
export const setBoardPower = async (page: Page, on: boolean, board = 'board') => (await reveal(page, `ham-board-${board}-power`, [board])).setChecked(on);
export const setBoardSwitch = async (page: Page, on: boolean, board = 'board') => (await reveal(page, `ham-board-${board}-sw1`, [board])).setChecked(on);
export const inspectBoard = (page: Page, board = 'board') => press(page, `ham-board-${board}-inspect`, [board]);
export const repairBoardFault = (page: Page, faultId: string, board = 'board') => press(page, `ham-board-${board}-repair-${faultId}`, [board]);

/** Diagnose a stuck objective via window.debugObjective */
export async function debugObjective(page: Page, id: string): Promise<unknown> {
  return page.evaluate((i) => (window as any).debugObjective?.(i), id);
}

export { waitForObjectiveComplete };

/** The final required objective pops the Mission Complete modal. */
export async function expectMissionComplete(page: Page): Promise<void> {
  const modal = page.locator('#level-complete-modal');
  await expect(modal).toBeVisible({ timeout: 45000 });
  await expect(modal.locator('.complete-modal__title')).toContainText('Mission Complete');
}

// ---- Radio panel extras (S3+): selects, memories, DMR, PTT, readings ----

/** Switch the radio panel to another radio's tab (only needed when the station has several radios) */
/** Bring a radio up: its Close-up, or for an SDR the laptop program */
export async function selectRadioTab(page: Page, dev: string): Promise<void> {
  if (await isSdr(page, dev)) await sdrControl(page, dev, 'freq-input');
  else await reveal(page, `ham-radio-${dev}-freq-input`, [dev]);
}
export const setTxPower = async (page: Page, dev: string, watts: number) => (await reveal(page, `ham-radio-${dev}-txpower`, [dev])).selectOption(String(watts));
export const setOffset = async (page: Page, dev: string, dir: 'simplex' | 'plus' | 'minus') => (await reveal(page, `ham-radio-${dev}-offset`, [dev])).selectOption(dir);
export const setOffsetKHz = async (page: Page, dev: string, khz: number): Promise<void> => {
  const input = await reveal(page, `ham-radio-${dev}-offset-khz`, [dev]);
  await input.fill(String(khz));
  await input.blur();
};
/** CTCSS TX tone in Hz, or null for none */
export const setTxTone = async (page: Page, dev: string, hz: number | null) => (await reveal(page, `ham-radio-${dev}-txtone`, [dev])).selectOption(hz === null ? '' : String(hz));
export async function storeMemory(page: Page, dev: string, slot: number, name: string): Promise<void> {
  await (await reveal(page, `ham-radio-${dev}-mem-slot`, [dev])).fill(String(slot));
  await (await reveal(page, `ham-radio-${dev}-mem-name`, [dev])).fill(name);
  await press(page, `ham-radio-${dev}-mem-store`, [dev]);
}
export async function recallMemory(page: Page, dev: string, slot: number): Promise<void> {
  await (await reveal(page, `ham-radio-${dev}-mem-slot`, [dev])).fill(String(slot));
  await press(page, `ham-radio-${dev}-mem-recall`, [dev]);
}
/** DMR codeplug channel by zero-based index */
export const selectDmrChannel = async (page: Page, dev: string, index: number) => (await reveal(page, `ham-radio-${dev}-dmr-channel`, [dev])).selectOption(String(index));

export type PttIntent =
  | { kind: 'cq' | 'identify' | 'net-checkin' | 'carrier' | 'test' }
  | { kind: 'call'; target: string }
  | { kind: 'reply'; item: string }
  | { kind: 'message'; text: string };

/** Pick an intent in the PTT area and press Transmit (holdS optional). Asserts no refusal alert. */
export async function pttTransmit(page: Page, dev: string, intent: PttIntent, holdS?: number): Promise<void> {
  await (await reveal(page, `ham-ptt-${dev}-intent`, [dev])).selectOption(intent.kind);
  if (intent.kind === 'call') await page.getByTestId(`ham-ptt-${dev}-target`).selectOption(intent.target);
  if (intent.kind === 'reply') await page.getByTestId(`ham-ptt-${dev}-item`).selectOption(intent.item);
  if (intent.kind === 'message') await page.getByTestId(`ham-ptt-${dev}-message`).fill(intent.text);
  if (holdS !== undefined) await page.getByTestId(`ham-ptt-${dev}-hold`).fill(String(holdS));
  await page.getByTestId(`ham-ptt-${dev}-transmit`).click();
  await expect(page.getByTestId(`ham-ptt-${dev}-refusal`)).toBeHidden();
}

/** Receive-only radio (SDR): record a reading of one emitter ('' = noise only) */
export async function recordReading(page: Page, dev: string, _emitterId = ''): Promise<void> {
  if (await isSdr(page, dev)) {
    // The SDR program records whatever it is tuned to; emitterId documents the intent only
    await (await sdrControl(page, dev, 'record')).click();

    return;
  }
  await press(page, `ham-radio-${dev}-record`, [dev]);
}

// ---- Antenna analyzer and adjustable dipole (S5) ----

export const disconnectConnection = (page: Page, connectionId: string) => press(page, tid('ham-conn', connectionId, 'disconnect'), [connectionId]);
/** Calibrate with the open end at the analyzer port ('') or at the end of a feed line device */
export async function calibrateAnalyzer(page: Page, referenceDeviceId = '', an = 'analyzer'): Promise<void> {
  await (await reveal(page, `ham-analyzer-${an}-cal-ref`, [an])).selectOption(referenceDeviceId);
  await press(page, `ham-analyzer-${an}-calibrate`, [an]);
}
export async function sweepAnalyzer(page: Page, startMHz: number, stopMHz: number, points: number, an = 'analyzer'): Promise<void> {
  await (await reveal(page, `ham-analyzer-${an}-start`, [an])).fill(String(startMHz));
  await page.getByTestId(`ham-analyzer-${an}-stop`).fill(String(stopMHz));
  await page.getByTestId(`ham-analyzer-${an}-points`).fill(String(points));
  await page.getByTestId(`ham-analyzer-${an}-sweep`).click();
}
/** Set both dipole element lengths (centimetres in the UI) and apply */
export async function setDipoleLengths(page: Page, dev: string, aCm: number, bCm: number): Promise<void> {
  await (await reveal(page, `ham-antenna-${dev}-len-a`, [dev])).fill(String(aCm));
  await page.getByTestId(`ham-antenna-${dev}-len-b`).fill(String(bCm));
  await page.getByTestId(`ham-antenna-${dev}-apply`).click();
}
export const setDipoleOrientation = async (page: Page, dev: string, o: 'vertical' | 'horizontal') => (await reveal(page, `ham-antenna-${dev}-orientation`, [dev])).selectOption(o);

// ---- S6-S8: SWR meter, coax DC test, PTT release, DF yagi, mic gain ----

export const pttRelease = (page: Page, dev: string) => press(page, `ham-ptt-${dev}-release`, [dev]);
/** Press Read on the SWR / wattmeter panel (the transmitter must be keyed) */
export const swrRead = (page: Page, swr = 'swr') => press(page, `ham-swr-${swr}-read`, [swr]);
/** Key briefly for a test carrier, read the SWR meter while keyed, release */
export async function keyAndReadSwr(page: Page, dev: string, swr = 'swr'): Promise<void> {
  await pttTransmit(page, dev, { kind: 'test' });
  await swrRead(page, swr);
  await pttRelease(page, dev);
}
/** Centre/shield ohmmeter test on a disconnected coax cable (Inspect row button) */
export const dcTestCoax = (page: Page, coaxId: string) => press(page, tid('ham-conn', coaxId, 'dctest'), [coaxId]);
export const installSpare = async (page: Page, spareId: string, replaces: string): Promise<void> => {
  // Select the part being replaced; the spares shelf in its Close-up offers the swap
  await benchSelect(page, replaces);
  await press(page, tid('ham-conn', spareId, 'install'), [replaces]);
};
/** Staged direction (antenna panel): azimuth in degrees, then Apply */
export async function setAntennaAzimuth(page: Page, dev: string, azDeg: number): Promise<void> {
  await (await reveal(page, `ham-antenna-${dev}-az`, [dev])).fill(String(azDeg));
  await page.getByTestId(`ham-antenna-${dev}-apply-dir`).click();
}
export const setMicGain = async (page: Page, dev: string, v: number) => (await reveal(page, `ham-radio-${dev}-micgain`, [dev])).fill(String(v));
/** Meter panel: select DCV mode and read across two DC test points of the system */
export async function meterReadDcv(page: Page, red: string, black: string, dmm = 'dmm1'): Promise<void> {
  await setMeterMode(page, 'DCV', dmm);
  await meterReadAcross(page, red, black, dmm);
}
/** Idempotent power: only clicks the connections-panel power button when the device is not already in the wanted state */
export async function setDevicePower(page: Page, id: string, on: boolean): Promise<void> {
  const btn = await reveal(page, tid('ham-conn', id, 'power'), [id]);
  if ((await btn.getAttribute('aria-pressed')) !== String(on)) await btn.click();
}

// ---- Packet terminal (S9) and HF rig extras (S10) ----

/** Packet panel test id for a packet radio (the panel keys ids on the packet radio's device id) */
const pk = (radio: string, part: string): string => `ham-packet-${radio}-${part}`;

export async function setPacketAudio(
  page: Page,
  radio: string,
  v: { input?: 'laptop-mic' | 'interface'; output?: 'laptop-speakers' | 'interface'; txLevel?: number; systemSounds?: boolean }
): Promise<void> {
  await reveal(page, pk(radio, 'input-device'));
  if (v.input) await page.getByTestId(pk(radio, 'input-device')).selectOption(v.input);
  if (v.output) await page.getByTestId(pk(radio, 'output-device')).selectOption(v.output);
  if (v.txLevel !== undefined) await page.getByTestId(pk(radio, 'tx-level')).fill(String(v.txLevel));
  if (v.systemSounds !== undefined) await page.getByTestId(pk(radio, 'system-sounds')).setChecked(v.systemSounds);
}

export async function savePacketStation(page: Page, radio: string, mycall: string, destination: string, path: string): Promise<void> {
  await (await reveal(page, pk(radio, 'mycall'))).fill(mycall);
  await page.getByTestId(pk(radio, 'destination')).fill(destination);
  await page.getByTestId(pk(radio, 'path')).fill(path);
  await page.getByTestId(pk(radio, 'save')).click();
}

export const packetConnect = (page: Page, radio: string) => press(page, pk(radio, 'connect'));
export const packetSendTestFrame = (page: Page, radio: string) => press(page, pk(radio, 'send-ui'));
export const packetCorruptNext = (page: Page, radio: string) => press(page, pk(radio, 'corrupt'));
export async function packetSend(page: Page, radio: string, text: string): Promise<void> {
  await (await reveal(page, pk(radio, 'send-text'))).fill(text);
  await page.getByTestId(pk(radio, 'send')).click();
}

export async function setRadioMode(page: Page, dev: string, mode: string): Promise<void> {
  if (await isSdr(page, dev)) await (await sdrControl(page, dev, `mode-${mode}`)).click();
  else await (await reveal(page, `ham-radio-${dev}-mode`, [dev])).selectOption(mode);
}
/** Number inputs apply on change (blur), so fill then blur */
async function fillAndCommit(page: Page, testId: string, v: number): Promise<void> {
  const el = page.getByTestId(testId);
  await el.fill(String(v));
  await el.blur();
}
export const setFilterHz = (page: Page, dev: string, hz: number) => fillAndCommit(page, `ham-radio-${dev}-filter-hz`, hz);
export async function setRit(page: Page, dev: string, on: boolean, hz?: number): Promise<void> {
  if (hz !== undefined) await fillAndCommit(page, `ham-radio-${dev}-rit-hz`, hz);
  await page.getByTestId(`ham-radio-${dev}-rit-on`).setChecked(on);
}

/** Press Transmit on an intent the manager must refuse (e.g. band edge) and assert the inline refusal shows */
export async function pttExpectRefusal(page: Page, dev: string, intent: PttIntent, holdS = 1): Promise<void> {
  await page.getByTestId(`ham-ptt-${dev}-intent`).selectOption(intent.kind);
  await page.getByTestId(`ham-ptt-${dev}-hold`).fill(String(holdS));
  await page.getByTestId(`ham-ptt-${dev}-transmit`).click();
  await expect(page.getByTestId(`ham-ptt-${dev}-refusal`)).toBeVisible();
}
