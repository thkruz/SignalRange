import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  connectPorts,
  dcTestCoax,
  debugObjective,
  disconnectConnection,
  expectMissionComplete,
  inspectItem,
  installSpare,
  keyAndReadSwr,
  openStationTab,
  openTechScenario,
  powerDevice,
  pttTransmit,
  reviewMissionBrief,
  submitWorksheet,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';
import { simAdvance } from '../utils/test-clock';

test.use({ testClock: true });

/**
 * Campaign 3 Technician S6 "Where Did the Watts Go?" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s06.solve.test.ts.
 */
test('ham-tech-s06 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(30000);
  await openTechScenario(page, mc, 'ham-tech-s06');
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
  await simAdvance(page, 12000);

  // fault-baseline
  await keyAndReadSwr(page, 'mobile');
  await step('Record the Fault Baseline', 'fault-baseline', 2);

  // test-radio-locally: meter output to the dummy load, power cycle, short reading
  await disconnectConnection(page, 'swr-long');
  await connectPorts(page, { device: 'swr', port: 'ant' }, { device: 'dummy', port: 'in' });
  await powerDevice(page, 'mobile');
  await powerDevice(page, 'mobile');
  await simAdvance(page, 3000);
  await keyAndReadSwr(page, 'mobile');
  await step('Test the Radio Locally', 'test-radio-locally');

  // test-feed-line: meter on the long coax, dummy load at its far end through the barrel adapter
  await disconnectConnection(page, 'swr.ant~dummy.in');
  await connectPorts(page, { device: 'swr', port: 'ant' }, { device: 'long-coax', port: 'a' });
  await disconnectConnection(page, 'long-ant');
  await connectPorts(page, { device: 'long-coax', port: 'b' }, { device: 'barrel', port: 'a' });
  await connectPorts(page, { device: 'barrel', port: 'b' }, { device: 'dummy', port: 'in' });
  await simAdvance(page, 3000);
  await keyAndReadSwr(page, 'mobile');
  await step('Test the Long Feed Line', 'test-feed-line', 3);

  // inspect-route: inspect, power off, disconnect both ends, DC test
  await inspectItem(page, 'long-coax');
  await powerDevice(page, 'mobile');
  await disconnectConnection(page, 'swr.ant~long-coax.a');
  await disconnectConnection(page, 'long-coax.b~barrel.a');
  await disconnectConnection(page, 'barrel.b~dummy.in');
  await dcTestCoax(page, 'long-coax');
  await step('Inspect the Cable Route', 'inspect-route');

  // replace-cable
  await installSpare(page, 'spare-coax', 'long-coax');
  await submitWorksheet(page, 's06-weatherproof', { method: 'Seal the outdoor connector with self-amalgamating tape and leave a drip loop below it' });
  await step('Replace and Protect the Cable', 'replace-cable', 3);

  // repeat-tests: dummy load first, then the antenna through the spare, then contact with Riley
  await powerDevice(page, 'mobile');
  await simAdvance(page, 3000);
  await connectPorts(page, { device: 'swr', port: 'ant' }, { device: 'dummy', port: 'in' });
  await keyAndReadSwr(page, 'mobile');
  await disconnectConnection(page, 'swr.ant~dummy.in');
  await connectPorts(page, { device: 'swr', port: 'ant' }, { device: 'spare-coax', port: 'a' });
  await connectPorts(page, { device: 'spare-coax', port: 'b' }, { device: 'outdoor-ant', port: 'in' });
  await simAdvance(page, 3000);
  await keyAndReadSwr(page, 'mobile');
  await pttTransmit(page, 'mobile', { kind: 'call', target: 'KD0RLY' }, 4);
  await simAdvance(page, 15000);
  await pttTransmit(page, 'mobile', { kind: 'reply', item: 'report' }, 3);
  await simAdvance(page, 12000);
  await pttTransmit(page, 'mobile', { kind: 'identify' }, 3);
  await simAdvance(page, 12000);

  // last objective: completing it pops Mission Complete, which hides the checklist row
  await answerTechQuizzes(page, 2);
  await expectMissionComplete(page);
});
