import { expect } from '@playwright/test';
import { test } from '../fixtures/test-fixtures';
import { startAtCheckpoint } from '../utils/checkpoints';
import {
  answerTechQuizzes,
  debugObjective,
  expectMissionComplete,
  meterReadDcv,
  openStationTab,
  pttTransmit,
  reveal,
  setDevicePower,
  setOffset,
  setTxPower,
  setTxTone,
  submitWorksheet,
  tuneRadio,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

const MESSAGE = 'Zebra team requests nine quarts of water at Quincy Pavilion by noon Thursday';
const FALLBACK_MHZ = 147.525;

/**
 * Pilot: Campaign 3 Technician S12 from the checkpoint taken after diagnose-fault (e2e/fixtures/checkpoints/ham-sdr).
 * Plays replace-lead onward; the first four objectives are not replayed.
 * Recapture with e2e/specs/zz-capture-checkpoints.spec.ts when ham-tech-s12 changes.
 */
test('ham-tech-s12 finishes from replace-lead', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(30000);
  const cp = await startAtCheckpoint(page, 'ham-tech-s12@replace-lead');
  expect(cp.activeObjectiveIds).toContain('replace-lead');
  await waitForSimulationReady(page);
  await dismissDialogIfPresent(page);
  await openStationTab(page, mc);

  const step = async (title: string, id: string, quizzes = 0): Promise<void> => {
    if (quizzes > 0) await answerTechQuizzes(page, quizzes);
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(mc, title, 60000);
    } catch (error) {
      console.log(`${id}: ${JSON.stringify(await debugObjective(page, id))}`);
      throw error;
    }
  };
  const keyAndMeter = async (holdS: number, red: string, black: string): Promise<void> => {
    await pttTransmit(page, 'mobile', { kind: 'test' }, holdS);
    await page.waitForTimeout(500);
    await meterReadDcv(page, red, black);
  };

  // replace-lead: inspect, de-energize, replace, power back on
  await (await reveal(page, 'ham-dc-batt-inspect')).click();
  await (await reveal(page, 'ham-dc-batt-source')).setChecked(false);
  await (await reveal(page, 'ham-dc-batt-repair-poor-dc-lead')).click();
  await (await reveal(page, 'ham-dc-batt-source')).setChecked(true);
  await setDevicePower(page, 'mobile', false);
  await setDevicePower(page, 'mobile', true);
  await step('Replace the Lead', 'replace-lead', 3);

  // verify-repair
  await page.waitForTimeout(5000);
  await setTxPower(page, 'mobile', 50);
  await keyAndMeter(4, 'radio+', 'radio-');
  await page.waitForTimeout(8000);
  await step('Verify the Repair Under Load', 'verify-repair');

  // move-to-fallback
  await page.waitForTimeout(40000);
  await tuneRadio(page, 'mobile', FALLBACK_MHZ);
  await setOffset(page, 'mobile', 'simplex');
  await setTxTone(page, 'mobile', null);
  await setTxPower(page, 'mobile', 5);
  await pttTransmit(page, 'mobile', { kind: 'call', target: 'N0BEL' }, 4);
  await page.waitForTimeout(15000);
  await pttTransmit(page, 'mobile', { kind: 'reply', item: 'report' }, 3);
  await page.waitForTimeout(12000);
  await pttTransmit(page, 'mobile', { kind: 'identify' }, 3);
  await page.waitForTimeout(12000);
  await step('Move to the Fallback Channel', 'move-to-fallback');

  // relay-exact-message
  await pttTransmit(page, 'mobile', { kind: 'reply', item: 'fill' }, 3);
  await page.waitForTimeout(15000);
  await pttTransmit(page, 'mobile', { kind: 'message', text: MESSAGE }, 20);
  await page.waitForTimeout(40000);
  await step('Relay the Exact Message', 'relay-exact-message');

  // check-radiogram
  await submitWorksheet(page, 's12-radiogram', { check: 13, precedence: 'Routine', count: 'Only the words of the text' });
  await step('Check the Radiogram Header', 'check-radiogram', 3);

  // close-station
  await pttTransmit(page, 'mobile', { kind: 'identify' }, 3);
  await page.waitForTimeout(12000);
  await step('Close the Net', 'close-station');

  // pack-down
  await setDevicePower(page, 'mobile', false);
  await (await reveal(page, 'ham-dc-batt-read-gauge')).click();
  await submitWorksheet(page, 's12-defect', {
    'old-lead': 'Tag it as defective and set it aside so it is not used again',
    report: 'The poor lead connection, the readings that showed it, and that the spare lead is now used',
  });
  await answerTechQuizzes(page, 2);
  await page.waitForTimeout(2000);
  await expectMissionComplete(page);
});
