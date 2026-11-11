import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  debugObjective,
  expectMissionComplete,
  openStationTab,
  openTechScenario,
  pttTransmit,
  recallMemory,
  reviewMissionBrief,
  selectDmrChannel,
  selectRadioTab,
  setOffset,
  setOffsetKHz,
  setTxTone,
  storeMemory,
  submitWorksheet,
  tuneRadio,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';
import { simAdvance } from '../utils/test-clock';

test.use({ testClock: true });

/**
 * Campaign 3 Technician S4 "I Can Hear Them" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s04.solve.test.ts. Simulated time runs in real time here, so the
 * repeater and remote-station replies are waited out after each transmission.
 */
test('ham-tech-s04 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(360000);
  await openTechScenario(page, mc, 'ham-tech-s04');
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
  const cq = async (): Promise<void> => {
    await pttTransmit(page, 'ht', { kind: 'cq' }, 3);
    await simAdvance(page, 9000);
  };

  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);
  await selectRadioTab(page, 'ht');

  // read-repeater-entry
  await submitWorksheet(page, 's04-directory', { output: 146.94, offset: '-600 kHz', tone: 100 });
  await step('Read the Repeater Entry', 'read-repeater-entry', 2);

  // check-transmit-frequency: first key up simplex (wrong frequency), then fix the offset
  await cq();
  await setOffset(page, 'ht', 'minus');
  await setOffsetKHz(page, 'ht', 600);
  await step('Check the Transmit Frequency', 'check-transmit-frequency');

  // correct-access-tone: key up with no tone (rejected), then set the tone and key up again
  await cq();
  await setTxTone(page, 'ht', 100);
  await cq();
  await step('Correct the Access Tone', 'correct-access-tone', 3);

  // save-and-recall-channel
  await storeMemory(page, 'ht', 3, 'CLUBRPT');
  await tuneRadio(page, 'ht', 146.52);
  await setOffset(page, 'ht', 'simplex');
  await setTxTone(page, 'ht', null);
  await recallMemory(page, 'ht', 3);
  await cq();
  await step('Save and Recall the Channel', 'save-and-recall-channel');

  // complete-repeater-contact
  await pttTransmit(page, 'ht', { kind: 'call', target: 'N0CLB' }, 3);
  await simAdvance(page, 9000);
  await pttTransmit(page, 'ht', { kind: 'reply', item: 'name' }, 3);
  await simAdvance(page, 9000);
  await pttTransmit(page, 'ht', { kind: 'identify' }, 3);
  await simAdvance(page, 9000);
  await step('Complete the Repeater Contact', 'complete-repeater-contact', 3);

  // explore-digital-memory: wrong color code, wrong time slot, then the matching channel
  await submitWorksheet(page, 's04-dmr', { cc: 1, slot: 2, tg: 31337 });
  await selectRadioTab(page, 'dmr-ht');
  for (const index of [0, 1, 2]) {
    await selectDmrChannel(page, 'dmr-ht', index);
    await pttTransmit(page, 'dmr-ht', { kind: 'call', target: 'KD0RLY' }, 2);
    await simAdvance(page, index === 2 ? 15000 : 5000);
  }
  // last objective: completing it pops Mission Complete, which hides the checklist row
  await answerTechQuizzes(page, 2);

  await expectMissionComplete(page);
});
