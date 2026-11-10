import { test } from '@playwright/test';
import { pathDiagramRecord, recordsFileRequest, recordsReadNotices } from '../utils/frontline-forward-helpers';
import {
  advanceClock,
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST,
  LATEST_SUPPORTED_RUN,
  openFrontlineScenario,
  plantInspect,
  readFieldStatus,
  recordsExpectRefused,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S10 "Identify the Provider Restriction", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s10-completion.test.ts.
 */
const ALL = 99; // cite every listed entry

async function takeAll(page: import('@playwright/test').Page): Promise<void> {
  await servicesTakeSample(page, 'skylink', 'local', 'local-probe');
  await servicesTakeSample(page, 'skylink', 'registration', 'terminal-app');
  await servicesTakeSample(page, 'skylink', 'account', 'provider-portal');
  await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
}

test.describe('Frontline S10 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S10 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 10);
    });

    await test.step('[s10-record-change] Record the Changed Service', async () => {
      // The restriction fires 20 s into this objective
      await advanceClock(page, 25000);
      await takeAll(page);
      await recordsSubmit(page, 'symptoms', {
        application: { value: LATEST },
        onset: { cites: ALL },
        evidence: { cites: ALL },
      });
      await waitForObjective(page, 's10-record-change');
    });

    await test.step('[s10-compare-health] Compare Equipment and Service Evidence', async () => {
      await plantInspect(page, 'skylink-router');
      await takeAll(page);
      await pathDiagramRecord(page, ['account:forward-skylink']);
      await recordsSubmit(page, 'health', {
        local: { value: LATEST },
        registration: { value: LATEST },
        application: { value: LATEST },
        policy: { value: 'not-established' },
      });
      await waitForObjective(page, 's10-compare-health');
    });

    await test.step('[s10-read-notice] Establish the Notice’s Scope', async () => {
      await advanceClock(page, 2000);
      await recordsReadNotices(page);
      await recordsSubmit(page, 'notice-scope', {
        account: { value: 'forward-skylink' },
        effect: { value: 'ground-capacity' },
        registration: { value: 'unchanged' },
        local: { value: 'not-implicated' },
        effective: { cites: ALL },
      });
      await answerStatusCheck(page, 'It would not remove the provider limit.');
      await waitForObjective(page, 's10-read-notice');
    });

    await test.step('[s10-assess-tasks] Assess Work Under the Limit', async () => {
      await recordsSubmit(page, 'assessment', { feed: { value: 'unsupported' }, report: { value: 'supported' }, basis: { cites: ALL } });
      await waitForObjective(page, 's10-assess-tasks');
    });

    await test.step('[s10-run-reduced-service] Deliver the Supported Service', async () => {
      // Counterexample: naming a terminal fault as the limit is refused; the correct limit follows
      await recordsExpectRefused(page, 'limitation-report', { limit: { value: 'terminal-fault' } });
      await recordsSubmit(page, 'limitation-report', { limit: { value: 'ground-capacity' }, task: { value: 'fwd-report' }, unavailable: { value: 'fwd-feed' } });
      const runId = await workloadsStart(page, 'fwd-report', 'skylink');
      await workloadsWaitForRun(page, runId);
      await servicesTakeSample(page, 'skylink', 'account', 'provider-portal');
      await recordsSubmit(page, 'reduced-outcome', { verified: { value: LATEST_SUPPORTED_RUN }, account: { value: LATEST }, restriction: { value: 'remains-active' } });
      await waitForObjective(page, 's10-run-reduced-service');
    });

    await test.step('[s10-file-request] Request the Missing Capability', async () => {
      await recordsSubmit(page, 'package', {
        onset: { cites: ALL },
        local: { cites: ALL },
        notice: { value: 's10-capacity-notice' },
        supported: { value: 'fwd-report' },
        gap: { value: 'fwd-feed' },
      });
      await recordsFileRequest(page, 's10-alternative-equipment');
      await advanceClock(page, 2000);
      await waitForObjective(page, 's10-file-request');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
