import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  debugObjective,
  expectMissionComplete,
  inspectItem,
  openStationTab,
  openTechScenario,
  pttTransmit,
  repairFault,
  reviewMissionBrief,
  setTxPower,
  submitWorksheet,
  tuneRadio,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';

/**
 * Campaign 3 Technician S3 "Your First Contact" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s03.solve.test.ts. Simulated time runs in real time here, so the
 * listening window and the remote station's reply delay are waited out.
 */
test('ham-tech-s03 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(300000);
  await openTechScenario(page, mc, 'ham-tech-s03');
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

  // confirm-station-privileges
  await submitWorksheet(page, 's03-privileges', {
    band: 'Yes, it is inside Technician privileges',
    power: 'The minimum needed to communicate',
    ident: 'At the end of the contact and at least every 10 minutes during it',
  });
  await step('Confirm the Station Privileges', 'confirm-station-privileges', 2);

  // check-power-connection
  await inspectItem(page, 'ht');
  await inspectItem(page, 'ht-ant');
  await repairFault(page, 'ht-battery');
  await step('Check the Power Connection', 'check-power-connection');

  // review-antenna-clearance
  await submitWorksheet(page, 's03-exposure', { hold: 'Upright, with the antenna kept away from your head and body', power: 'A lower transmit power' });
  await step('Review the Antenna Clearance', 'review-antenna-clearance', 3);

  // listen-before-calling (monitoring time accrues in real time)
  await tuneRadio(page, 'ht', 146.55);
  await setTxPower(page, 'ht', 0.5);
  await page.waitForTimeout(12000);
  await step('Listen Before Calling', 'listen-before-calling');

  // make-first-call
  await pttTransmit(page, 'ht', { kind: 'call', target: 'W0SRC' }, 3);
  await page.waitForTimeout(10000);
  await step('Make the First Call', 'make-first-call');

  // exchange-signal-report
  for (const item of ['name', 'location', 'report']) {
    await pttTransmit(page, 'ht', { kind: 'reply', item }, 3);
    await page.waitForTimeout(10000);
  }
  await step('Exchange a Signal Report', 'exchange-signal-report', 3);

  // close-the-contact
  await pttTransmit(page, 'ht', { kind: 'identify' }, 3);
  await page.waitForTimeout(10000);
  // last objective: completing it pops Mission Complete, which hides the checklist row
  await answerTechQuizzes(page, 2);

  await expectMissionComplete(page);
});
