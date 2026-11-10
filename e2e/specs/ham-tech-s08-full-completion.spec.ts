import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  debugObjective,
  expectMissionComplete,
  inspectItem,
  installSpare,
  openStationTab,
  openTechScenario,
  pttTransmit,
  recordReading,
  reviewMissionBrief,
  selectRadioTab,
  setAntennaAzimuth,
  setDevicePower,
  setMicGain,
  submitWorksheet,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';

/**
 * Campaign 3 Technician S8 "Noise in the Shack" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s08.solve.test.ts. Receiver readings use the SDR's
 * "Record reading" button (noise only); supplies are powered from the connections panel.
 */
test('ham-tech-s08 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(30000);
  await openTechScenario(page, mc, 'ham-tech-s08');
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
  const record = async (): Promise<void> => {
    await page.waitForTimeout(1500);
    await recordReading(page, 'sdr', '');
  };

  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);
  await page.waitForTimeout(3000);

  // record-pattern
  await record();
  await step('Record the Noise Pattern', 'record-pattern', 2);

  // battery-baseline: suspect supply and laptop charger both off
  await setDevicePower(page, 'suspect-supply', false);
  await setDevicePower(page, 'laptop-charger', false);
  await record();
  await step('Try the Battery Baseline', 'battery-baseline');

  // isolate-source: charger only, then suspect supply only
  await setDevicePower(page, 'laptop-charger', true);
  await record();
  await setDevicePower(page, 'laptop-charger', false);
  await setDevicePower(page, 'suspect-supply', true);
  await record();
  await step('Isolate the Source', 'isolate-source', 3);

  // locate-direction: sweep the DF yagi, then the reflection worksheet
  for (const az of [0, 45, 90, 135, 225]) {
    await setAntennaAzimuth(page, 'df-yagi', az);
    await record();
  }
  await submitWorksheet(page, 's08-reflection', {
    why: 'The noise bounces off a nearby surface and reaches the antenna from another direction',
    trust: 'The direction with the strongest, most consistent reading',
  });
  await step('Locate the Strongest Direction', 'locate-direction');

  // substitute-supply: point at the source, inspect, swap in the spare, record
  await setAntennaAzimuth(page, 'df-yagi', 0);
  await inspectItem(page, 'suspect-supply');
  await installSpare(page, 'spare-supply', 'suspect-supply');
  await record();
  await step('Substitute the Noisy Supply', 'substitute-supply', 3);

  // check-audio: call Riley, raise mic gain mid-contact like the headless solve, report, identify
  await selectRadioTab(page, 'mobile');
  await pttTransmit(page, 'mobile', { kind: 'call', target: 'KD0RLY' }, 4);
  await page.waitForTimeout(15000);
  await setMicGain(page, 'mobile', 5);
  await pttTransmit(page, 'mobile', { kind: 'reply', item: 'report' }, 3);
  await page.waitForTimeout(12000);
  await pttTransmit(page, 'mobile', { kind: 'identify' }, 3);
  await page.waitForTimeout(12000);
  await step('Check the Outgoing Audio', 'check-audio');

  // name-the-symptom (last objective)
  await submitWorksheet(page, 's08-symptoms', { audio: 'Microphone gain set too high' });
  await answerTechQuizzes(page, 2);
  await expectMissionComplete(page);
});
