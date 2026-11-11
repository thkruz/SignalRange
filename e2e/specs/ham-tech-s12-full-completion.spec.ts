import type { Page } from '@playwright/test';
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
  reveal,
  reviewMissionBrief,
  setDevicePower,
  setOffset,
  setOffsetKHz,
  setTxPower,
  setTxTone,
  submitWorksheet,
  tuneRadio,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';
import { simAdvance } from '../utils/test-clock';

test.use({ testClock: true });

const MESSAGE = 'Zebra team requests nine quarts of water at Quincy Pavilion by noon Thursday';
const FALLBACK_MHZ = 147.525;

/** Unplug the dummy-load test cable from the mobile (the mast feed line is a separate cable) */
const disconnectMobile = (page: Page): Promise<void> => disconnectConnection(page, 'mobile.ant~dummy.in');

/** Key the mobile for `holdS` seconds and take a DC reading inside the hold */
async function keyAndMeter(page: Page, holdS: number, red: string, black: string): Promise<void> {
  await pttTransmit(page, 'mobile', { kind: 'test' }, holdS);
  await page.waitForTimeout(500);
  await meterReadDcv(page, red, black);
}

/**
 * Campaign 3 Technician S12 "Your Station, Your Call" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s12.solve.test.ts (plan, assemble, net check-in, diagnose, repair, outage, relay, pack down).
 */
test('ham-tech-s12 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(900000);
  page.setDefaultTimeout(30000);
  await openTechScenario(page, mc, 'ham-tech-s12');
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

  // plan-portable-station
  await submitWorksheet(page, 's12-site', {
    site: 'Open ground, well away from power lines and trees',
    route: 'Along the edge, covered where people walk, away from the guy lines',
    public: 'Mark a clear zone around the mast and keep a helper watching it',
    weather: 'Stop and lower the mast at the first sign of a storm, then resume at a safe site and time',
  });
  await submitWorksheet(page, 's12-energy', {
    avg: 21.6,
    used: 32.4,
    left: 87.6,
    reserve: 'Yes, 87.6 Wh is well above the 30 Wh reserve',
  });
  await step('Plan the Portable Station', 'plan-portable-station', 2);

  // assemble-and-test: dummy-load test first, then the mast feed
  await inspectItem(page, 'feed');
  await connectPorts(page, { device: 'mobile', port: 'ant' }, { device: 'dummy', port: 'in' });
  await pttTransmit(page, 'mobile', { kind: 'test' }, 3);
  await simAdvance(page, 5000);
  await disconnectMobile(page);
  await tuneRadio(page, 'mobile', 146.58);
  await setOffset(page, 'mobile', 'simplex');
  await setTxTone(page, 'mobile', null);
  await connectPorts(page, { device: 'mobile', port: 'ant' }, { device: 'feed', port: 'a' });
  await simAdvance(page, 6000);
  await step('Assemble and Test the Equipment', 'assemble-and-test');

  // check-into-net: repeater settings from the net card, then check in when net control calls
  await tuneRadio(page, 'mobile', 146.94);
  await setOffset(page, 'mobile', 'minus');
  await setOffsetKHz(page, 'mobile', 600);
  await setTxTone(page, 'mobile', 100);
  await simAdvance(page, 40000);
  await pttTransmit(page, 'mobile', { kind: 'net-checkin' }, 3);
  await simAdvance(page, 30000);
  await step('Check into the Club Net', 'check-into-net');

  // diagnose-fault: 50 W browns out the radio, then 5 W with meter reads at PSU and radio
  // meter on DC volts at the radio terminals first, so it holds the dip at the reset
  await meterReadDcv(page, 'radio+', 'radio-');
  await setTxPower(page, 'mobile', 50);
  await pttTransmit(page, 'mobile', { kind: 'test' }, 3);
  await simAdvance(page, 6000);
  await setTxPower(page, 'mobile', 5);
  await keyAndMeter(page, 6, 'psu+', 'psu-');
  await meterReadDcv(page, 'radio+', 'radio-');
  await simAdvance(page, 8000);
  await step('Diagnose the Station Fault', 'diagnose-fault');

  // replace-lead: inspect, de-energize, replace, power back on
  await (await reveal(page, 'ham-dc-batt-inspect')).click();
  await (await reveal(page, 'ham-dc-batt-source')).setChecked(false);
  await (await reveal(page, 'ham-dc-batt-repair-poor-dc-lead')).click();
  await (await reveal(page, 'ham-dc-batt-source')).setChecked(true);
  await setDevicePower(page, 'mobile', false);
  await setDevicePower(page, 'mobile', true);
  await step('Replace the Lead', 'replace-lead', 3);

  // verify-repair: 50 W under load through the repeater
  await simAdvance(page, 5000);
  await setTxPower(page, 'mobile', 50);
  await keyAndMeter(page, 4, 'radio+', 'radio-');
  await simAdvance(page, 8000);
  await step('Verify the Repair Under Load', 'verify-repair');

  // move-to-fallback: the outage starts 30 s after the first repeater relay following the repair
  await simAdvance(page, 40000);
  await tuneRadio(page, 'mobile', FALLBACK_MHZ);
  await setOffset(page, 'mobile', 'simplex');
  await setTxTone(page, 'mobile', null);
  await setTxPower(page, 'mobile', 5);
  await pttTransmit(page, 'mobile', { kind: 'call', target: 'N0BEL' }, 4);
  await simAdvance(page, 15000);
  await pttTransmit(page, 'mobile', { kind: 'reply', item: 'report' }, 3);
  await simAdvance(page, 12000);
  await pttTransmit(page, 'mobile', { kind: 'identify' }, 3);
  await simAdvance(page, 12000);
  await step('Move to the Fallback Channel', 'move-to-fallback');

  // relay-exact-message: the first delivery loses a word, so ask for the fill first
  await pttTransmit(page, 'mobile', { kind: 'reply', item: 'fill' }, 3);
  await simAdvance(page, 15000);
  await pttTransmit(page, 'mobile', { kind: 'message', text: MESSAGE }, 20);
  await simAdvance(page, 40000);
  await step('Relay the Exact Message', 'relay-exact-message');

  // check-radiogram
  await submitWorksheet(page, 's12-radiogram', { check: 13, precedence: 'Routine', count: 'Only the words of the text' });
  await step('Check the Radiogram Header', 'check-radiogram', 3);

  // close-station
  await pttTransmit(page, 'mobile', { kind: 'identify' }, 3);
  await simAdvance(page, 12000);
  await step('Close the Net', 'close-station');

  // pack-down (last): power down, read the gauge, close-out report
  await setDevicePower(page, 'mobile', false);
  await (await reveal(page, 'ham-dc-batt-read-gauge')).click();
  await submitWorksheet(page, 's12-defect', {
    'old-lead': 'Tag it as defective and set it aside so it is not used again',
    report: 'The poor lead connection, the readings that showed it, and that the spare lead is now used',
  });
  await answerTechQuizzes(page, 2);
  await simAdvance(page, 2000);
  await expectMissionComplete(page);
});
