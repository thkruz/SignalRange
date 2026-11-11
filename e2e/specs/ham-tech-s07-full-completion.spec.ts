import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  connectPorts,
  debugObjective,
  disconnectConnection,
  expectMissionComplete,
  inspectItem,
  meterReadDcv,
  openStationTab,
  openTechScenario,
  pttTransmit,
  repairFault,
  reviewMissionBrief,
  setDevicePower,
  submitWorksheet,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';
import { simAdvance } from '../utils/test-clock';

test.use({ testClock: true });

/**
 * Campaign 3 Technician S7 "It Only Fails on Transmit" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s07.solve.test.ts. Meter reads happen while the 3 s test
 * transmission is still keyed.
 */
test('ham-tech-s07 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(30000);
  await openTechScenario(page, mc, 'ham-tech-s07');
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
  const keyAndRead = async (red: string, black: string): Promise<void> => {
    await pttTransmit(page, 'mobile', { kind: 'test' }, 3);
    await page.waitForTimeout(500);
    await meterReadDcv(page, red, black);
    await simAdvance(page, 4000);
  };

  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);
  await simAdvance(page, 12000);

  // reproduce-reset: radio terminals while transmitting into the dummy load
  await keyAndRead('radio+', 'radio-');
  await step('Reproduce the Reset Safely', 'reproduce-reset', 2);

  // compare-probe-points: idle readings at supply and radio terminals
  await simAdvance(page, 3000);
  await meterReadDcv(page, 'psu+', 'psu-');
  await simAdvance(page, 1000);
  await meterReadDcv(page, 'radio+', 'radio-');
  await step('Compare the Two Probe Points', 'compare-probe-points', 3);

  // explain-missing-voltage: wrong first, then right
  await submitWorksheet(page, 's07-drop', { drop: 2.4, culprit: 'The DC lead has too much resistance' });
  await step('Explain the Missing Voltage', 'explain-missing-voltage');

  // repair-lead: refused while energized, so power the supply off first
  await inspectItem(page, 'psu');
  await setDevicePower(page, 'psu', false);
  await repairFault(page, 'worn-dc-lead');
  await setDevicePower(page, 'psu', true);
  await setDevicePower(page, 'mobile', false);
  await setDevicePower(page, 'mobile', true); // the objective needs a power event after the repair
  await step('Repair the Isolated Lead', 'repair-lead', 3);

  // verify-transmit-load: radio terminals under TX, feed line to the radio, contact with Riley
  await simAdvance(page, 3000);
  await keyAndRead('radio+', 'radio-');
  await disconnectConnection(page, 'mob-dummy');
  await connectPorts(page, { device: 'mobile', port: 'ant' }, { device: 'feed', port: 'a' });
  await simAdvance(page, 3000);
  await pttTransmit(page, 'mobile', { kind: 'call', target: 'KD0RLY' }, 4);
  await simAdvance(page, 15000);
  await pttTransmit(page, 'mobile', { kind: 'reply', item: 'report' }, 3);
  await simAdvance(page, 12000);
  await pttTransmit(page, 'mobile', { kind: 'identify' }, 3);
  await simAdvance(page, 12000);
  await step('Verify the Transmit Load', 'verify-transmit-load');

  // estimate-endurance (last objective)
  await submitWorksheet(page, 's07-endurance', { avg: 2.4, hours: 4.17, why: 'The transmitter is not 100 percent efficient, so the rest becomes heat' });
  await answerTechQuizzes(page, 2);
  await expectMissionComplete(page);
});
