import { test } from '@playwright/test';
import { pathDiagramRecord, recordsFileRequest } from '../utils/frontline-forward-helpers';
import {
  advanceClock,
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST,
  openFrontlineScenario,
  readFieldStatus,
  recordsExpectRefused,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S12 "Locate the Affected Connection Segment", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s12-completion.test.ts.
 */
const EUS = 'forward-eurosat';
const ALL = 99;
const PATH = ['laptop', 'vsat-modem', 'provider:eurosat-net', 'endpoint:pilot-app-eurosat'];

async function takePath(page: import('@playwright/test').Page): Promise<void> {
  await servicesTakeSample(page, EUS, 'local', 'local-probe');
  await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
  await servicesTakeSample(page, EUS, 'application', 'endpoint-report');
}

test.describe('Frontline S12 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S12 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 12);
    });

    await test.step('[s12-review-path] Identify the Complete Service Path', async () => {
      await takePath(page);
      await pathDiagramRecord(page, PATH);
      await recordsSubmit(page, 'architecture', {
        local: { value: LATEST },
        application: { value: LATEST },
        shared: { value: 'workstation-and-power' },
        independent: { value: 'terminal-account-provider-endpoint' },
      });
      await waitForObjective(page, 's12-review-path');
    });

    await test.step('[s12-record-symptoms] Record the Reported Interruption', async () => {
      await advanceClock(page, 3000);
      await recordsSubmit(page, 'symptoms', { remote: { value: 'last-known' }, onset: { cites: ALL } });
      await waitForObjective(page, 's12-record-symptoms');
    });

    await test.step('[s12-compare-observations] Compare the Available Observations', async () => {
      await takePath(page);
      await recordsSubmit(page, 'comparison', {
        local: { value: LATEST },
        registration: { value: LATEST },
        application: { value: LATEST },
        limits: { value: 'remote-condition' },
        basis: { cites: ALL },
      });
      await waitForObjective(page, 's12-compare-observations');
    });

    await test.step("[s12-bound-conclusion] State the Evidence's Limits", async () => {
      await pathDiagramRecord(page, ['endpoint:pilot-app-eurosat']);
      // Counterexample: asserting a local fault beyond what the local checks establish is refused; the bounded conclusion follows
      await recordsExpectRefused(page, 'diagnosis', { segment: { value: 'local-segment' }, confidence: { value: 'confirmed' } });
      await recordsSubmit(page, 'diagnosis', {
        segment: { value: 'remote-endpoint' },
        confidence: { value: 'likely-unconfirmed' },
        cause: { value: 'not-established' },
        basis: { cites: ALL },
      });
      await answerStatusCheck(page, 'The local check passed, but the remote path remains unverified.');
      await waitForObjective(page, 's12-bound-conclusion');
    });

    await test.step('[s12-refer-incident] Refer the Bounded Incident', async () => {
      await recordsSubmit(page, 'referral-package', {
        segment: { value: 'remote-endpoint' },
        confidence: { value: 'likely-unconfirmed' },
        local: { value: 'unchanged' },
        evidence: { cites: ALL },
      });
      await recordsFileRequest(page, 's12-specialist-referral');
      await advanceClock(page, 50000);
      await waitForObjective(page, 's12-refer-incident');
    });

    await test.step('[s12-verify-resolution] Verify the Reported Resolution', async () => {
      await advanceClock(page, 5000);
      const runId = await workloadsStart(page, 'fwd-transfer', EUS);
      await workloadsWaitForRun(page, runId);
      await servicesTakeSample(page, EUS, 'application', 'endpoint-report');
      await recordsSubmit(page, 'incident-update', {
        verified: { value: runId },
        application: { value: LATEST },
        recovery: { value: 'fresh-test' },
        cause: { value: 'not-established' },
      });
      await waitForObjective(page, 's12-verify-resolution');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
