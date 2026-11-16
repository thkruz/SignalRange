import { test } from '../fixtures/test-fixtures';
import { captureCheckpoint, checkpointName } from '../utils/checkpoints';
import {
  advanceClock,
  answerStatusCheck,
  LATEST,
  notebookAddHypothesis,
  openFrontlineScenario,
  plantInspect,
  readFieldStatus,
  recordsExpectRefused,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
} from '../utils/frontline-helpers';
import {
  answerTechQuizzes,
  connectPorts,
  debugObjective,
  disconnectConnection,
  inspectItem,
  meterReadDcv,
  openStationTab,
  openTechScenario,
  pttTransmit,
  reviewMissionBrief,
  setOffset,
  setOffsetKHz,
  setTxPower,
  setTxTone,
  submitWorksheet,
  tuneRadio,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';

/**
 * Checkpoint capture. Skipped unless SR_CAPTURE=1:
 *   SR_CAPTURE=1 npx playwright test zz-capture-checkpoints --workers=1
 * Each test plays an existing full-completion spec up to an objective and stores the game with captureCheckpoint.
 * The steps are copied from the full-completion specs; keep them in sync when a scenario changes, then recapture.
 */
test.describe('@capture checkpoints', () => {
  test.skip(!process.env.SR_CAPTURE, 'set SR_CAPTURE=1 to recapture checkpoints');
  test.setTimeout(15 * 60 * 1000);

  test('@capture frontline-scenario15 before s15-preserve-package', async ({ page }) => {
    page.setDefaultTimeout(15000);
    const EUS = 'forward-eurosat';
    const SKY = 'skylink';
    const ALL = 99;
    const variant = 'suspected-interference';

    await openFrontlineScenario(page, 15);

    await advanceClock(page, 20000);
    for (let i = 0; i < 4 && !(await readFieldStatus(page)).firedEvents.includes('s15-eurosat-onset'); i++) {
      await advanceClock(page, 5000);
    }
    await page.waitForTimeout(1500);
    await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
    await servicesTakeSample(page, EUS, 'application', 'endpoint-report');
    await servicesTakeSample(page, EUS, 'local', 'local-probe');
    await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
    await recordsSubmit(page, 'anomaly', { service: { value: 'eurosat' }, onset: { cites: ALL }, local: { value: LATEST }, skylink: { value: LATEST }, symptoms: { cites: ALL } });
    await waitForObjective(page, 's15-record-anomaly');

    let lastSeen = '';
    let seenCount = 0;
    for (let t = 0; t < 240; t += 5) {
      await advanceClock(page, 5000);
      const st = (await readFieldStatus(page)) as unknown as { services: Record<string, Array<{ layer: string; status: string }>> };
      const reg = st.services[EUS]?.find((l) => l.layer === 'registration')?.status ?? '?';
      if (reg !== lastSeen) {
        lastSeen = reg;
        seenCount++;
        await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
      }
      if (seenCount >= 5) break;
    }
    await servicesTakeSample(page, EUS, 'local', 'local-probe');
    await plantInspect(page, 'vsat-feed');
    await plantInspect(page, 'vsat-ifl:lnb');
    await plantInspect(page, 'vsat-ifl:modem');
    await plantInspect(page, 'power-station');
    await servicesTakeSample(page, EUS, 'provider', 'provider-portal');
    await recordsSubmit(page, 'evidence', { pattern: { cites: ALL }, provider: { value: LATEST }, local: { value: 'ruled-out' }, limits: { value: 'not-proof' } });
    await waitForObjective(page, 's15-review-evidence');

    await notebookAddHypothesis(page, { scope: 'segment', target: EUS, cause: variant, confidence: 'medium', cites: 'all' });
    await recordsExpectRefused(page, 'assessment', {
      classification: { value: 'provider-fault', cites: ALL },
      confidence: { value: 'moderate' },
      source: { value: 'not-established' },
      basis: { cites: ALL },
    });
    await recordsSubmit(page, 'assessment', {
      classification: { value: variant, cites: ALL },
      confidence: { value: 'moderate' },
      source: { value: 'not-established' },
      basis: { cites: ALL },
    });
    await answerStatusCheck(page, 'Interference is suspected; the source remains unestablished.');
    await waitForObjective(page, 's15-assess-confidence');

    await captureCheckpoint(page, checkpointName('frontline-scenario15', 's15-preserve-package'));
  });

  test('@capture ham-tech-s12 before replace-lead', async ({ page, missionControlPage: mc }) => {
    page.setDefaultTimeout(30000);
    await openTechScenario(page, mc, 'ham-tech-s12');
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

    await reviewMissionBrief(page, mc);
    await openStationTab(page, mc);
    await page.waitForTimeout(3000);
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

    await inspectItem(page, 'feed');
    await connectPorts(page, { device: 'mobile', port: 'ant' }, { device: 'dummy', port: 'in' });
    await pttTransmit(page, 'mobile', { kind: 'test' }, 3);
    await page.waitForTimeout(5000);
    await disconnectConnection(page, 'mobile.ant~dummy.in');
    await tuneRadio(page, 'mobile', 146.58);
    await setOffset(page, 'mobile', 'simplex');
    await setTxTone(page, 'mobile', null);
    await connectPorts(page, { device: 'mobile', port: 'ant' }, { device: 'feed', port: 'a' });
    await page.waitForTimeout(6000);
    await step('Assemble and Test the Equipment', 'assemble-and-test');

    await tuneRadio(page, 'mobile', 146.94);
    await setOffset(page, 'mobile', 'minus');
    await setOffsetKHz(page, 'mobile', 600);
    await setTxTone(page, 'mobile', 100);
    await page.waitForTimeout(40000);
    await pttTransmit(page, 'mobile', { kind: 'net-checkin' }, 3);
    await page.waitForTimeout(30000);
    await step('Check into the Club Net', 'check-into-net');

    await meterReadDcv(page, 'radio+', 'radio-');
    await setTxPower(page, 'mobile', 50);
    await pttTransmit(page, 'mobile', { kind: 'test' }, 3);
    await page.waitForTimeout(6000);
    await setTxPower(page, 'mobile', 5);
    await pttTransmit(page, 'mobile', { kind: 'test' }, 6);
    await page.waitForTimeout(500);
    await meterReadDcv(page, 'psu+', 'psu-');
    await meterReadDcv(page, 'radio+', 'radio-');
    await page.waitForTimeout(8000);
    await step('Diagnose the Station Fault', 'diagnose-fault');

    await captureCheckpoint(page, checkpointName('ham-tech-s12', 'replace-lead'));
  });
});
