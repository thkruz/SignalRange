import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  debugObjective,
  expectMissionComplete,
  openStationTab,
  openTechScenario,
  pttExpectRefusal,
  pttTransmit,
  reviewMissionBrief,
  setFilterHz,
  setRadioMode,
  setRit,
  submitWorksheet,
  tuneRadio,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';
import { simAdvance } from '../utils/test-clock';

test.use({ testClock: true });

/**
 * Campaign 3 Technician S10 "Beyond the Local Horizon" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s10.solve.test.ts (HF rig "hf": mode, filter, RIT, contact, band edge).
 */
test('ham-tech-s10 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(360000);
  page.setDefaultTimeout(30000);
  await openTechScenario(page, mc, 'ham-tech-s10');
  const step = async (title: string, id: string, quizzes = 0): Promise<void> => {
    if (quizzes > 0) {
      try {
        await answerTechQuizzes(page, quizzes);
      } catch (error) {
        console.log(`${id}: ${JSON.stringify(await debugObjective(page, id))}`);
        throw error;
      }
    }
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(mc, title, 60000);
    } catch (error) {
      console.log(`${id}: ${JSON.stringify(await debugObjective(page, id))}`);
      throw error;
    }
  };

  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);
  await simAdvance(page, 3000);

  // check-segment
  await submitWorksheet(page, 's10-segment', {
    low: 28.3,
    high: 28.5,
    maxDial: 28.4972,
    below: 'No, that part of the band is for CW and data',
  });
  await step('Check the Segment', 'check-segment', 2);

  // set-mode-and-filter: local net on 28.380 USB with a 2.7 kHz filter
  await tuneRadio(page, 'hf', 28.38);
  await setRadioMode(page, 'hf', 'USB');
  await setFilterHz(page, 'hf', 2700);
  await step('Set the Mode and Filter', 'set-mode-and-filter', 3);

  // tune-with-rit: offset station on 28.420, RIT +700 Hz, then key up on the dial frequency
  await tuneRadio(page, 'hf', 28.42);
  await setRit(page, 'hf', true, 700);
  await simAdvance(page, 6000);
  await pttTransmit(page, 'hf', { kind: 'test' }, 2);
  await simAdvance(page, 4000);
  await step('Fine Tune with RIT', 'tune-with-rit');
  await setRit(page, 'hf', false, 0);
  await tuneRadio(page, 'hf', 28.4);

  // read-propagation
  await submitWorksheet(page, 's10-propagation', {
    paths: {
      'Line of sight': 'A direct path between two antennas that see each other',
      'Ionospheric path': 'A signal refracted back by a charged layer high above the ground',
      'Sporadic E': 'A short-lived patch of dense ionization that opens a distant path',
      Ducting: 'A layer of air near the ground that guides a VHF signal far beyond the horizon',
      'Radio horizon': 'The distance at which the curve of the Earth blocks a direct path',
    },
  });
  await step('Read the Propagation Evidence', 'read-propagation', 3);

  // make-hf-contact: CQ, report, identify
  await pttTransmit(page, 'hf', { kind: 'cq' }, 3);
  await simAdvance(page, 12000);
  await pttTransmit(page, 'hf', { kind: 'reply', item: 'report' }, 3);
  await simAdvance(page, 12000);
  await pttTransmit(page, 'hf', { kind: 'identify' }, 3);
  await simAdvance(page, 12000);
  await step('Make the HF Contact', 'make-hf-contact');

  // compare-modes: CW example then FT8 example, then the allowed-modes worksheet
  await setRadioMode(page, 'hf', 'CW');
  await tuneRadio(page, 'hf', 28.06);
  await simAdvance(page, 8000);
  await setRadioMode(page, 'hf', 'FT8');
  await tuneRadio(page, 'hf', 28.074);
  await simAdvance(page, 8000);
  await submitWorksheet(page, 's10-allowed', {
    cw: 'CW is allowed there, in the segment below 28.300 MHz',
    ft8: 'No, it is a narrow digital mode in the data segment',
  });
  await step('Compare CW and FT8', 'compare-modes', 2);

  // reject-band-edge (last): 28.498 USB is refused, then a valid setting transmits
  await setRadioMode(page, 'hf', 'USB');
  await tuneRadio(page, 'hf', 28.498);
  await pttExpectRefusal(page, 'hf', { kind: 'test' });
  await tuneRadio(page, 'hf', 28.4);
  await pttTransmit(page, 'hf', { kind: 'test' }, 1);
  await simAdvance(page, 2000);
  await expectMissionComplete(page);
});
