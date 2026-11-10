import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, Page } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForObjectiveComplete } from './ham-sdr-helpers';
import { dismissDialogIfPresent, waitForQuizToAppear, waitForSimulationReady } from './simulation-helpers';

/**
 * Shared helpers for the Campaign 3 Technician (ham-tech-sNN) full-completion specs.
 * Everything is driven through the Station tab by data-testid (scheme documented in
 * src/pages/mission-control/tabs/ham-station-tab.ts). Quiz answers come from the same JSON
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
export async function submitWorksheet(page: Page, id: string, values: Record<string, string | number | Record<string, string>>): Promise<void> {
  for (const [field, v] of Object.entries(values)) {
    if (typeof v === 'number') {
      await page.getByTestId(`ham-ws-${id}-${field}`).fill(String(v));
    } else if (typeof v === 'string') {
      await page.getByTestId(`ham-ws-${id}-${field}`).selectOption(v);
    } else {
      for (const [key, val] of Object.entries(v)) await page.getByTestId(tid('ham-ws', id, field, key)).selectOption(val);
    }
  }
  await page.getByTestId(`ham-ws-${id}-submit`).click();
  await expect(page.getByTestId(`ham-ws-${id}-status`)).toContainText('correct', { timeout: 5000 });
}

/** Connections panel */
export async function connectPorts(page: Page, a: { device: string; port: string }, b: { device: string; port: string }): Promise<void> {
  await page.getByTestId('ham-conn-new-a-device').selectOption(a.device);
  await page.getByTestId('ham-conn-new-a-port').selectOption(a.port);
  await page.getByTestId('ham-conn-new-b-device').selectOption(b.device);
  await page.getByTestId('ham-conn-new-b-port').selectOption(b.port);
  await page.getByTestId('ham-conn-new-connect').click();
}
export const inspectItem = (page: Page, id: string) => page.getByTestId(`ham-conn-${id}-inspect`).click();
export const seatConnection = (page: Page, id: string) => page.getByTestId(`ham-conn-${id}-seat`).click();
export const repairFault = (page: Page, faultId: string) => page.getByTestId(`ham-conn-${faultId}-repair`).click();
/** Device power button in the connections panel (toggles; not for circuit boards, use the board panel) */
export const powerDevice = (page: Page, id: string) => page.getByTestId(`ham-conn-${id}-power`).click();

/** Radio panel. Frequency is staged: input then Apply. */
export async function tuneRadio(page: Page, dev: string, mhz: number): Promise<void> {
  await page.getByTestId(`ham-radio-${dev}-freq-input`).fill(String(mhz));
  await page.getByTestId(`ham-radio-${dev}-apply`).click();
}
export const setFilterPreset = (page: Page, dev: string, hz: number) => page.getByTestId(`ham-radio-${dev}-filter-preset`).selectOption(String(hz));
export const setSquelch = (page: Page, dev: string, v: number) => page.getByTestId(`ham-radio-${dev}-squelch`).fill(String(v));
export const setVolume = (page: Page, dev: string, v: number) => page.getByTestId(`ham-radio-${dev}-volume`).fill(String(v));

/** Meter panel (dmm defaults to 'dmm1', the id used when the config has no multimeter device) */
export const setMeterMode = (page: Page, mode: 'OFF' | 'DCV' | 'DCA' | 'OHM' | 'CONT', dmm = 'dmm1') => page.getByTestId(`ham-meter-${dmm}-mode-${mode}`).click();
export const setMeterSocket = (page: Page, socket: 'VΩ' | 'A', dmm = 'dmm1') => page.getByTestId(`ham-meter-${dmm}-socket`).selectOption(socket);
/** Place probes across two test points and read (series select is disabled outside DCA mode, so it is left alone). */
export async function meterReadAcross(page: Page, red: string, black: string, dmm = 'dmm1'): Promise<void> {
  await page.getByTestId(`ham-meter-${dmm}-red`).selectOption(red);
  await page.getByTestId(`ham-meter-${dmm}-black`).selectOption(black);
  await page.getByTestId(`ham-meter-${dmm}-read`).click();
}
/** Read current with the meter in series at a break point (DCA mode + A socket must already be set). */
export async function meterReadSeries(page: Page, breakId: string, dmm = 'dmm1'): Promise<void> {
  await page.getByTestId(`ham-meter-${dmm}-series`).selectOption(breakId);
  await page.getByTestId(`ham-meter-${dmm}-read`).click();
}

/** Board panel: 12 V supply (power) and SW1 lever are checkboxes */
export const setBoardPower = (page: Page, on: boolean, board = 'board') => page.getByTestId(`ham-board-${board}-power`).setChecked(on);
export const setBoardSwitch = (page: Page, on: boolean, board = 'board') => page.getByTestId(`ham-board-${board}-sw1`).setChecked(on);
export const inspectBoard = (page: Page, board = 'board') => page.getByTestId(`ham-board-${board}-inspect`).click();
export const repairBoardFault = (page: Page, faultId: string, board = 'board') => page.getByTestId(`ham-board-${board}-repair-${faultId}`).click();

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
export const selectRadioTab = (page: Page, dev: string) => page.getByTestId(`ham-radio-${dev}-tab`).dispatchEvent('click');
export const setTxPower = (page: Page, dev: string, watts: number) => page.getByTestId(`ham-radio-${dev}-txpower`).selectOption(String(watts));
export const setOffset = (page: Page, dev: string, dir: 'simplex' | 'plus' | 'minus') => page.getByTestId(`ham-radio-${dev}-offset`).selectOption(dir);
export const setOffsetKHz = async (page: Page, dev: string, khz: number): Promise<void> => {
  const input = page.getByTestId(`ham-radio-${dev}-offset-khz`);
  await input.fill(String(khz));
  await input.blur();
};
/** CTCSS TX tone in Hz, or null for none */
export const setTxTone = (page: Page, dev: string, hz: number | null) => page.getByTestId(`ham-radio-${dev}-txtone`).selectOption(hz === null ? '' : String(hz));
export async function storeMemory(page: Page, dev: string, slot: number, name: string): Promise<void> {
  await page.getByTestId(`ham-radio-${dev}-mem-slot`).fill(String(slot));
  await page.getByTestId(`ham-radio-${dev}-mem-name`).fill(name);
  await page.getByTestId(`ham-radio-${dev}-mem-store`).click();
}
export async function recallMemory(page: Page, dev: string, slot: number): Promise<void> {
  await page.getByTestId(`ham-radio-${dev}-mem-slot`).fill(String(slot));
  await page.getByTestId(`ham-radio-${dev}-mem-recall`).click();
}
/** DMR codeplug channel by zero-based index */
export const selectDmrChannel = (page: Page, dev: string, index: number) => page.getByTestId(`ham-radio-${dev}-dmr-channel`).selectOption(String(index));

export type PttIntent =
  | { kind: 'cq' | 'identify' | 'net-checkin' | 'carrier' | 'test' }
  | { kind: 'call'; target: string }
  | { kind: 'reply'; item: string }
  | { kind: 'message'; text: string };

/** Pick an intent in the PTT area and press Transmit (holdS optional). Asserts no refusal alert. */
export async function pttTransmit(page: Page, dev: string, intent: PttIntent, holdS?: number): Promise<void> {
  await page.getByTestId(`ham-ptt-${dev}-intent`).selectOption(intent.kind);
  if (intent.kind === 'call') await page.getByTestId(`ham-ptt-${dev}-target`).selectOption(intent.target);
  if (intent.kind === 'reply') await page.getByTestId(`ham-ptt-${dev}-item`).selectOption(intent.item);
  if (intent.kind === 'message') await page.getByTestId(`ham-ptt-${dev}-message`).fill(intent.text);
  if (holdS !== undefined) await page.getByTestId(`ham-ptt-${dev}-hold`).fill(String(holdS));
  await page.getByTestId(`ham-ptt-${dev}-transmit`).click();
  await expect(page.getByTestId(`ham-ptt-${dev}-refusal`)).toBeHidden();
}

/** Receive-only radio (SDR): record a reading of one emitter ('' = noise only) */
export async function recordReading(page: Page, dev: string, emitterId = ''): Promise<void> {
  await page.getByTestId(`ham-radio-${dev}-record-emitter`).selectOption(emitterId);
  await page.getByTestId(`ham-radio-${dev}-record`).click();
}

// ---- Antenna analyzer and adjustable dipole (S5) ----

export const disconnectConnection = (page: Page, connectionId: string) => page.getByTestId(tid('ham-conn', connectionId, 'disconnect')).click();
/** Calibrate with the open end at the analyzer port ('') or at the end of a feed line device */
export async function calibrateAnalyzer(page: Page, referenceDeviceId = '', an = 'analyzer'): Promise<void> {
  await page.getByTestId(`ham-analyzer-${an}-cal-ref`).selectOption(referenceDeviceId);
  await page.getByTestId(`ham-analyzer-${an}-calibrate`).click();
}
export async function sweepAnalyzer(page: Page, startMHz: number, stopMHz: number, points: number, an = 'analyzer'): Promise<void> {
  await page.getByTestId(`ham-analyzer-${an}-start`).fill(String(startMHz));
  await page.getByTestId(`ham-analyzer-${an}-stop`).fill(String(stopMHz));
  await page.getByTestId(`ham-analyzer-${an}-points`).fill(String(points));
  await page.getByTestId(`ham-analyzer-${an}-sweep`).click();
}
/** Set both dipole element lengths (centimetres in the UI) and apply */
export async function setDipoleLengths(page: Page, dev: string, aCm: number, bCm: number): Promise<void> {
  await page.getByTestId(`ham-antenna-${dev}-len-a`).fill(String(aCm));
  await page.getByTestId(`ham-antenna-${dev}-len-b`).fill(String(bCm));
  await page.getByTestId(`ham-antenna-${dev}-apply`).click();
}
export const setDipoleOrientation = (page: Page, dev: string, o: 'vertical' | 'horizontal') => page.getByTestId(`ham-antenna-${dev}-orientation`).selectOption(o);

// ---- S6-S8: SWR meter, coax DC test, PTT release, DF yagi, mic gain ----

export const pttRelease = (page: Page, dev: string) => page.getByTestId(`ham-ptt-${dev}-release`).click();
/** Press Read on the SWR / wattmeter panel (the transmitter must be keyed) */
export const swrRead = (page: Page, swr = 'swr') => page.getByTestId(`ham-swr-${swr}-read`).click();
/** Key briefly for a test carrier, read the SWR meter while keyed, release */
export async function keyAndReadSwr(page: Page, dev: string, swr = 'swr'): Promise<void> {
  await pttTransmit(page, dev, { kind: 'test' });
  await swrRead(page, swr);
  await pttRelease(page, dev);
}
/** Centre/shield ohmmeter test on a disconnected coax cable (Inspect row button) */
export const dcTestCoax = (page: Page, coaxId: string) => page.getByTestId(`ham-conn-${coaxId}-dctest`).click();
export const installSpare = async (page: Page, spareId: string, replaces: string): Promise<void> => {
  await page.getByTestId(`ham-conn-${spareId}-replaces`).selectOption(replaces);
  await page.getByTestId(`ham-conn-${spareId}-install`).click();
};
/** Staged direction (antenna panel): azimuth in degrees, then Apply */
export async function setAntennaAzimuth(page: Page, dev: string, azDeg: number): Promise<void> {
  await page.getByTestId(`ham-antenna-${dev}-az`).fill(String(azDeg));
  await page.getByTestId(`ham-antenna-${dev}-apply-dir`).click();
}
export const setMicGain = (page: Page, dev: string, v: number) => page.getByTestId(`ham-radio-${dev}-micgain`).fill(String(v));
/** Meter panel: select DCV mode and read across two DC test points of the system */
export async function meterReadDcv(page: Page, red: string, black: string, dmm = 'dmm1'): Promise<void> {
  await setMeterMode(page, 'DCV', dmm);
  await meterReadAcross(page, red, black, dmm);
}
/** Idempotent power: only clicks the connections-panel power button when the device is not already in the wanted state */
export async function setDevicePower(page: Page, id: string, on: boolean): Promise<void> {
  const btn = page.getByTestId(`ham-conn-${id}-power`);
  const label = ((await btn.textContent()) ?? '').trim();
  if (label === (on ? 'Power on' : 'Power off')) await btn.click();
}

// ---- Packet terminal (S9) and HF rig extras (S10) ----

/** Packet panel test id for a packet radio (the panel keys ids on the packet radio's device id) */
const pk = (radio: string, part: string): string => `ham-packet-${radio}-${part}`;

export async function setPacketAudio(
  page: Page,
  radio: string,
  v: { input?: 'laptop-mic' | 'interface'; output?: 'laptop-speakers' | 'interface'; txLevel?: number; systemSounds?: boolean }
): Promise<void> {
  if (v.input) await page.getByTestId(pk(radio, 'input-device')).selectOption(v.input);
  if (v.output) await page.getByTestId(pk(radio, 'output-device')).selectOption(v.output);
  if (v.txLevel !== undefined) await page.getByTestId(pk(radio, 'tx-level')).fill(String(v.txLevel));
  if (v.systemSounds !== undefined) await page.getByTestId(pk(radio, 'system-sounds')).setChecked(v.systemSounds);
}

export async function savePacketStation(page: Page, radio: string, mycall: string, destination: string, path: string): Promise<void> {
  await page.getByTestId(pk(radio, 'mycall')).fill(mycall);
  await page.getByTestId(pk(radio, 'destination')).fill(destination);
  await page.getByTestId(pk(radio, 'path')).fill(path);
  await page.getByTestId(pk(radio, 'save')).click();
}

export const packetConnect = (page: Page, radio: string) => page.getByTestId(pk(radio, 'connect')).click();
export const packetSendTestFrame = (page: Page, radio: string) => page.getByTestId(pk(radio, 'send-ui')).click();
export const packetCorruptNext = (page: Page, radio: string) => page.getByTestId(pk(radio, 'corrupt')).click();
export async function packetSend(page: Page, radio: string, text: string): Promise<void> {
  await page.getByTestId(pk(radio, 'send-text')).fill(text);
  await page.getByTestId(pk(radio, 'send')).click();
}

export const setRadioMode = (page: Page, dev: string, mode: string) => page.getByTestId(`ham-radio-${dev}-mode`).selectOption(mode);
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
