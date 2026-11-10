import { expect, test } from '@playwright/test';
import {
  advanceClock,
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  notebookAddHypothesis,
  openFrontlineScenario,
  readFieldStatus,
  readObjective,
  recordsExpectRefused,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsInspect,
  workloadsSetPriority,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S5 "Check the Service Beyond the Dish", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s05-completion.test.ts.
 */
test.describe('Frontline S5 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S5 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);
    let badRun = '';

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 5);
    });

    await test.step('[s5-compare-endpoints] Compare Terminal and Application', async () => {
      await advanceClock(page, 10_000);
      await servicesTakeSample(page, 'skylink', 'registration', 'device-indicator');
      badRun = await workloadsStart(page, 'ola-app', 'skylink');
      expect(await workloadsWaitForRun(page, badRun)).toBe('unsupported');
      await answerStatusCheck(page, 'It establishes the terminal state, while application usability still needs separate evidence.');
      await waitForObjective(page, 's5-compare-endpoints');
    });

    await test.step('[s5-read-service-quality] Read the Service Indicators', async () => {
      await servicesTakeSample(page, 'skylink', 'registration', 'device-indicator');
      await recordsSubmit(page, 'service-comparison', {
        run: { value: badRun },
        short: { value: 'capacity' },
        met: { value: 'delay-and-registration' },
        evidence: { cites: 99 },
      });
      await waitForObjective(page, 's5-read-service-quality');
    });

    await test.step('[s5-assess-service-scope] Assess the Affected Service', async () => {
      await notebookAddHypothesis(page, { scope: 'segment', target: 'skylink', cause: 'shared-capacity', confidence: 'medium', cites: 'all' });
      // Counterexample: blaming the terminal or power is not what the readings show; recovery is the refiling below
      await recordsExpectRefused(page, 'scope', { scope: { value: 'terminal-or-cable' }, 'ruled-out': { value: 'nothing-ruled-out' }, evidence: { cites: 99 } }, /scope|ruled/iu);
      expect((await readObjective(page, 's5-assess-service-scope')).isCompleted).toBe(false);
      await recordsSubmit(page, 'scope', {
        scope: { value: 'local-shared-service' },
        'ruled-out': { value: 'terminal-and-power' },
        evidence: { cites: 99 },
      });
      await waitForObjective(page, 's5-assess-service-scope');
    });

    await test.step('[s5-identify-shared-use] Identify the Shared Workload', async () => {
      await workloadsInspect(page, 'ola-app');
      await workloadsInspect(page, 'sync-transfer');
      // Counterexample: blaming the app that must stay up
      await recordsExpectRefused(page, 'attribution', { workload: { value: 'ola-app' }, keep: { value: 'ola-app' }, basis: { cites: 99 } }, /workload|keep/iu);
      await recordsSubmit(page, 'attribution', {
        workload: { value: 'sync-transfer' },
        keep: { value: 'ola-app' },
        basis: { cites: 99 },
      });
      await waitForObjective(page, 's5-identify-shared-use');
    });

    await test.step('[s5-apply-priority] Apply the Approved Priority', async () => {
      await workloadsSetPriority(page, 'sync-transfer', 'background');
      await waitForObjective(page, 's5-apply-priority');
    });

    await test.step('[s5-verify-service-change] Verify the Local Change', async () => {
      await advanceClock(page, 5_000);
      const runId = await workloadsStart(page, 'ola-app', 'skylink');
      expect(await workloadsWaitForRun(page, runId)).toBe('supported');
      // Counterexample: the pre-change failed run cannot stand as the after run
      await recordsExpectRefused(
        page,
        'service-record',
        { before: { value: badRun }, after: { value: badRun }, cause: { value: 'shared-capacity' }, deferred: { value: 'sync-transfer' }, terminal: { value: 'unchanged' } },
        /after|run/iu
      );
      expect((await readObjective(page, 's5-verify-service-change')).isCompleted).toBe(false);
      await recordsSubmit(page, 'service-record', {
        before: { value: badRun },
        after: { value: runId },
        cause: { value: 'shared-capacity' },
        deferred: { value: 'sync-transfer' },
        terminal: { value: 'unchanged' },
      });
      await waitForObjective(page, 's5-verify-service-change');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
