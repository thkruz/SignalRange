import { expect, test } from '@playwright/test';
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
  readObjective,
  recordsAcceptUnit,
  recordsExpectRefused,
  recordsRequestCorrection,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S7 "Accept Equipment Securely", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s07-completion.test.ts.
 */
test.describe('Frontline S7 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S7 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 7);
    });

    await test.step('[s07-reconcile-delivery] Reconcile the Delivery', async () => {
      await plantInspect(page, 'skylink-router');
      // Counterexample: calling the configuration confirmed, or the depot test enough, is not what the records show
      await recordsExpectRefused(
        page,
        'inventory',
        { serial: { value: 'matches' }, account: { value: 'matches' }, configuration: { value: 'approved-later' }, depot: { value: 'service-test' } },
        /configuration/iu
      );
      expect((await readObjective(page, 's07-reconcile-delivery')).isCompleted).toBe(false);
      await recordsSubmit(page, 'inventory', {
        serial: { value: 'matches' },
        account: { value: 'matches' },
        configuration: { value: 'unconfirmed' },
        depot: { value: 'earlier-test-only' },
      });
      await waitForObjective(page, 's07-reconcile-delivery');
    });

    await test.step('[s07-separate-readiness] Separate Hardware from Service Readiness', async () => {
      await servicesTakeSample(page, 'skylink', 'power', 'device-indicator');
      await servicesTakeSample(page, 'skylink', 'local', 'local-probe');
      await servicesTakeSample(page, 'skylink', 'registration', 'terminal-app');
      await recordsSubmit(page, 'readiness', {
        hardware: { cites: 99 },
        registration: { value: LATEST },
        authorization: { value: 'unresolved' },
        workload: { value: 'not-ready' },
      });
      await waitForObjective(page, 's07-separate-readiness');
    });

    await test.step('[s07-review-records] Review the Configuration History', async () => {
      await recordsSubmit(page, 'config-review', {
        entry: { value: 'configVersion' },
        original: { value: 'handover-v2' },
        unexplained: { value: 'depot-v3' },
        reference: { value: 'none' },
      });
      await waitForObjective(page, 's07-review-records');
    });

    await test.step('[s07-assess-discrepancy] State What the Evidence Supports', async () => {
      await answerStatusCheck(page, 'The entry is unexplained and needs authorized review.');
      await waitForObjective(page, 's07-assess-discrepancy');
    });

    await test.step('[s07-request-correction] Request the Authorized Correction', async () => {
      // Counterexample: accepting the unit before the authorized correction is refused; the recovery is the request below
      expect(await recordsAcceptUnit(page, 'kivilahti-router')).toMatch(/Not accepted/u);
      await recordsRequestCorrection(page, 's7-config-approval');
      // The records office answers after a while
      await advanceClock(page, 120_000);
      await waitForObjective(page, 's07-request-correction');
    });

    await test.step('[s07-verify-acceptance] Verify and Hand Over the Unit', async () => {
      await advanceClock(page, 100_000);
      const runId = await workloadsStart(page, 'ola-check', 'skylink');
      expect(await workloadsWaitForRun(page, runId)).toBe('supported');
      await recordsAcceptUnit(page, 'kivilahti-router');
      await recordsSubmit(page, 'acceptance', {
        mismatch: { value: 'config-version' },
        cause: { value: 'not-established' },
        observations: { cites: 99 },
        verified: { value: LATEST_SUPPORTED_RUN },
      });
      await waitForObjective(page, 's07-verify-acceptance');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
