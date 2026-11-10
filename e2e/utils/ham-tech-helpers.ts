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
