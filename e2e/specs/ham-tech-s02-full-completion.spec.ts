import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  debugObjective,
  expectMissionComplete,
  inspectBoard,
  meterReadAcross,
  meterReadSeries,
  openStationTab,
  openTechScenario,
  repairBoardFault,
  reviewMissionBrief,
  setBoardPower,
  setBoardSwitch,
  setMeterMode,
  setMeterSocket,
  submitWorksheet,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';

/**
 * Campaign 3 Technician S2 "Power on the Bench" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s02.solve.test.ts. Quizzes surface once an objective's practical rows are done.
 */
test('ham-tech-s02 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(240000);
  await openTechScenario(page, mc, 'ham-tech-s02');
  const step = async (title: string, id: string, quizzes = 0): Promise<void> => {
    if (quizzes > 0) await answerTechQuizzes(page, quizzes);
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(mc, title);
    } catch (error) {
      console.log(`${id}: ${JSON.stringify(await debugObjective(page, id))}`);
      throw error;
    }
  };

  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);

  // match-circuit-symbols
  await submitWorksheet(page, 's02-symbols', {
    parts: {
      resistor: 'R1, the 120 ohm resistor',
      capacitor: 'C1, the capacitor',
      inductor: 'L1, the coil',
      diode: 'D1, the diode',
      'switch-spst': 'SW1, the switch',
      battery: 'BT1, the battery',
    },
  });
  await step('Match the Circuit Symbols', 'match-circuit-symbols', 2);

  // select-meter-function
  await submitWorksheet(page, 's02-select', { setup: 'DC voltage, red lead in the VΩ socket' });
  await setMeterMode(page, 'DCV');
  await step('Select the Meter Function', 'select-meter-function');

  // measure-test-supply: forward, reversed, forward again
  await meterReadAcross(page, 'tp-supply+', 'tp-supply-');
  await meterReadAcross(page, 'tp-supply-', 'tp-supply+');
  await meterReadAcross(page, 'tp-supply+', 'tp-supply-');
  await step('Measure the Test Supply', 'measure-test-supply');

  // predict-branch-current: close SW1, calculate, series current (reads ~0 A: open contact)
  await setBoardSwitch(page, true);
  await submitWorksheet(page, 's02-predict', { current: 0.1, power: 1.2 });
  await setMeterMode(page, 'DCA');
  await setMeterSocket(page, 'A');
  await meterReadSeries(page, 'r1-branch');
  await step('Predict the Branch Current', 'predict-branch-current', 3);

  // find-open-branch: power off, 0 V, then continuity across SW1
  await setBoardPower(page, false);
  await setMeterMode(page, 'DCV');
  await setMeterSocket(page, 'VΩ');
  await meterReadAcross(page, 'tp-supply+', 'tp-supply-');
  await setMeterMode(page, 'CONT');
  await meterReadAcross(page, 'tp-sw1-in', 'tp-sw1-out');
  await step('Find the Open Branch', 'find-open-branch');

  // restore-indicator-circuit: inspect, repair (board off), power on, read both branches
  await inspectBoard(page);
  await repairBoardFault(page, 'sw1-contact');
  await setBoardPower(page, true);
  await page.waitForTimeout(2000);
  await setMeterMode(page, 'DCA');
  await setMeterSocket(page, 'A');
  await meterReadSeries(page, 'r1-branch');
  await meterReadSeries(page, 'led-branch');
  await step('Restore the Indicator Circuit', 'restore-indicator-circuit', 3);

  // compare-circuit-families
  await submitWorksheet(page, 's02-families', {
    series: 'series',
    branches: 'parallel',
    capacitor: 'an electric field',
    inductor: 'a magnetic field',
    diode: 'rectification',
    regulator: 'regulation',
  });
  await answerTechQuizzes(page, 2);
  await expectMissionComplete(page);
});
