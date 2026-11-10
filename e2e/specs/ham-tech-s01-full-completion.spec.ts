import { expect, test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  connectPorts,
  debugObjective,
  disconnectConnection,
  expectMissionComplete,
  inspectItem,
  openStationTab,
  openTechScenario,
  reviewMissionBrief,
  seatConnection,
  setFilterPreset,
  setSquelch,
  setVolume,
  submitWorksheet,
  tuneRadio,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';

/**
 * Campaign 3 Technician S1 "The First Signal" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s01.solve.test.ts. Quizzes surface once an objective's practical rows are done.
 */
const MESSAGE = 'Club training net tonight at seven, check in on one four six five five zero';

test('ham-tech-s01 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(170000);
  await openTechScenario(page, mc, 'ham-tech-s01');
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

  // trace-receive-path
  await submitWorksheet(page, 's01-trace', {
    order: {
      Antenna: 'Captures the radio wave',
      'Coax jumper': 'Carries the signal to the receiver',
      'SMA adapter': 'Changes the connector style',
      'USB SDR': 'Turns radio signals into data',
      Laptop: 'Shows the waterfall and plays the audio',
    },
  });
  await connectPorts(page, { device: 'sdr', port: 'usb' }, { device: 'laptop', port: 'usb1' });
  await step('Trace the Receive Path', 'trace-receive-path', 2);

  // inspect-antenna-plug: inspect, pull the USB plug (the SDR has no switch), seat, plug back in
  await inspectItem(page, 'sdr-sma');
  await disconnectConnection(page, 'sdr.usb~laptop.usb1');
  await seatConnection(page, 'sdr-sma');
  await connectPorts(page, { device: 'sdr', port: 'usb' }, { device: 'laptop', port: 'usb1' });
  await step('Inspect the Antenna Plug', 'inspect-antenna-plug');

  // find-training-signal
  await tuneRadio(page, 'sdr', 146.55);
  await setFilterPreset(page, 'sdr', 15000);
  await step('Find the Training Signal', 'find-training-signal');

  // open-audio-path: volume first (squelch stays closed), then open the squelch
  await setVolume(page, 'sdr', 10);
  await page.waitForTimeout(3000);
  await setSquelch(page, 'sdr', 0);
  await step('Open the Audio Path', 'open-audio-path', 3);

  // compare-filter-settings: narrow filter, then back to 15 kHz
  await setFilterPreset(page, 'sdr', 6000);
  await page.waitForTimeout(3000);
  await setFilterPreset(page, 'sdr', 15000);
  await step('Compare the Filter Settings', 'compare-filter-settings', 3);

  // recover-message
  await submitWorksheet(page, 's01-message', { text: MESSAGE });
  await answerTechQuizzes(page, 2);
  await expectMissionComplete(page);
  expect(await page.locator('#level-complete-modal').isVisible()).toBe(true);
});
