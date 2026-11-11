import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  calibrateAnalyzer,
  connectPorts,
  debugObjective,
  disconnectConnection,
  expectMissionComplete,
  inspectItem,
  openStationTab,
  openTechScenario,
  recordReading,
  reviewMissionBrief,
  setDipoleLengths,
  setDipoleOrientation,
  submitWorksheet,
  sweepAnalyzer,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';
import { simAdvance } from '../utils/test-clock';

test.use({ testClock: true });

/**
 * Campaign 3 Technician S5 "Build the Better Antenna" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s05.solve.test.ts. The receiver reading is taken with the
 * radio panel's "Record reading" button on the SDR.
 */
test('ham-tech-s05 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(300000);
  await openTechScenario(page, mc, 'ham-tech-s05');
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

  // calculate-length
  await submitWorksheet(page, 's05-length', { total: 0.976, each: 0.488 });
  await step('Calculate a Starting Length', 'calculate-length', 2);

  // select-site
  await submitWorksheet(page, 's05-site', {
    sites: {
      'Under the overhead power line': 'Reject: contact risk if it falls',
      'Wobbly fence post by the garage': 'Reject: not stable enough',
      'Occupied corner of the TV mast': 'Reject: space already in use',
      'Clear garden mast away from wires': 'Use this site',
    },
  });
  await step('Select the Installation Site', 'select-site');

  // assemble-antenna: inspect, connect the feed line, record a baseline with the receiver
  await inspectItem(page, 'dipole');
  await connectPorts(page, { device: 'dipole-coax', port: 'b' }, { device: 'dipole', port: 'in' });
  await simAdvance(page, 3000);
  await recordReading(page, 'sdr', 'reference');
  await step('Assemble the Antenna', 'assemble-antenna');

  // resonant-region: analyzer on the coax, calibrate, sweep, trim both elements, sweep again
  await disconnectConnection(page, 'adp-coax');
  await connectPorts(page, { device: 'analyzer', port: 'rf' }, { device: 'dipole-coax', port: 'a' });
  await calibrateAnalyzer(page, 'dipole-coax');
  await sweepAnalyzer(page, 120, 160, 201);
  await setDipoleLengths(page, 'dipole', 48.8, 48.8);
  await sweepAnalyzer(page, 120, 160, 201);
  await step('Find the Resonant Region', 'resonant-region', 3);

  // match-polarization: receiver back on the coax, horizontal reading then vertical reading
  await disconnectConnection(page, 'analyzer.rf~dipole-coax.a');
  await connectPorts(page, { device: 'sdr-adapter', port: 'b' }, { device: 'dipole-coax', port: 'a' });
  await simAdvance(page, 3000);
  await recordReading(page, 'sdr', 'reference');
  await setDipoleOrientation(page, 'dipole', 'vertical');
  await simAdvance(page, 3000);
  await recordReading(page, 'sdr', 'reference');
  await step('Match the Polarization', 'match-polarization', 3);

  // check-exposure
  await submitWorksheet(page, 's05-exposure', { limit: '0.2', density: 0.033, verdict: 'Yes, under the limit' });
  await step('Check the Exposure Plan', 'check-exposure');

  // compare-reports
  // last objective: completing it pops Mission Complete, which hides the checklist row
  await answerTechQuizzes(page, 2);

  await expectMissionComplete(page);
});
