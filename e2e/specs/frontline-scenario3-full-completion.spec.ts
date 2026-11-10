import { expect, type Page, test } from '@playwright/test';
import {
  advanceClock,
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST_SUPPORTED_RUN,
  notebookAddHypothesis,
  openFrontlineScenario,
  plantInspect,
  plantMeasure,
  plantVerb,
  readDebrief,
  readFieldStatus,
  readObjective,
  recordsExpectRefused,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

const CONNECTOR = 'skylink-cable:dish';

/**
 * Frontline S3 "Find the Intermittent Fault", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s03-completion.test.ts.
 * The moisture flap is down while sim time % 90 < 30, so readings are timed with advanceClock.
 */
test.describe('Frontline S3 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  async function establishPattern(page: Page): Promise<void> {
    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 3);
    });
    await test.step('[s3-establish-pattern] Establish the Interruption Pattern', async () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        await advanceClock(page, 15_000);
        await servicesTakeSample(page, 'skylink', 'registration', 'pilot-report');
        await advanceClock(page, 30_000);
        await servicesTakeSample(page, 'skylink', 'registration', 'local-probe');
        await servicesTakeSample(page, 'skylink', 'local', 'local-probe');
        await advanceClock(page, 45_000);
      }
      await answerStatusCheck(page, 'The terminal link comes and goes while the local network holds, so the cause is open.');
      await waitForObjective(page, 's3-establish-pattern');
    });
  }

  async function compareAndPlan(page: Page, withCounterexamples: boolean): Promise<void> {
    await test.step('[s3-compare-baseline] Compare the Current Readings', async () => {
      await servicesTakeSample(page, 'skylink', 'power', 'device-indicator');
      await servicesTakeSample(page, 'skylink', 'local', 'device-indicator');
      await servicesTakeSample(page, 'skylink', 'registration', 'device-indicator');
      await plantInspect(page, 'skylink-dish');
      await plantInspect(page, 'power-strip');
      if (withCounterexamples) {
        await recordsExpectRefused(
          page,
          'comparison',
          { changed: { value: 'power-and-local' }, unchanged: { value: 'registration' }, evidence: { cites: 99 } },
          /changed|unchanged/iu
        );
        expect((await readObjective(page, 's3-compare-baseline')).isCompleted).toBe(false);
      }
      await recordsSubmit(page, 'comparison', {
        changed: { value: 'registration' },
        unchanged: { value: 'power-and-local' },
        evidence: { cites: 99 },
      });
      await waitForObjective(page, 's3-compare-baseline');
    });
    await test.step('[s3-select-check] Choose a Distinguishing Check', async () => {
      await notebookAddHypothesis(page, { scope: 'part', target: CONNECTOR, cause: 'connector-moisture', confidence: 'medium', cites: 'all' });
      if (withCounterexamples) {
        await recordsExpectRefused(page, 'check-plan', { check: { value: 'swap-terminal' }, expected: { value: 'sign-of-moisture' }, basis: { cites: 1 } }, /check/iu);
        await recordsExpectRefused(page, 'check-plan', { check: { value: 'inspect-connector' }, expected: { value: 'no-supply' }, basis: { cites: 1 } }, /expected|result/iu);
        expect((await readObjective(page, 's3-select-check')).isCompleted).toBe(false);
      }
      await recordsSubmit(page, 'check-plan', { check: { value: 'inspect-connector' }, expected: { value: 'sign-of-moisture' }, basis: { cites: 1 } });
      await waitForObjective(page, 's3-select-check');
    });
  }

  async function collectEvidence(page: Page): Promise<void> {
    await test.step('[s3-collect-local-evidence] Collect the Local Evidence', async () => {
      await plantMeasure(page, 'cable-tester', 'skylink-cable');
      await plantInspect(page, CONNECTOR);
      await waitForObjective(page, 's3-collect-local-evidence');
    });
    await test.step('[s3-assess-local-cause] Assess the Observed Cause', async () => {
      await answerStatusCheck(page, 'The observation justifies connector work, with service recovery still unverified.');
      await waitForObjective(page, 's3-assess-local-cause');
    });
  }

  async function verifyAndRecord(page: Page, withCounterexamples: boolean): Promise<void> {
    await test.step('[s3-verify-and-record] Verify and Document Recovery', async () => {
      await advanceClock(page, 120_000);
      const runId = await workloadsStart(page, 'ola-check', 'skylink');
      expect(await workloadsWaitForRun(page, runId)).toBe('supported');
      await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
      const base = { observations: { cites: 99 }, repair: { cites: 99 }, verified: { value: LATEST_SUPPORTED_RUN } };
      if (withCounterexamples) {
        await recordsExpectRefused(page, 'diagnosis', { ...base, cause: { value: 'router' } }, /cause/iu);
        expect((await readObjective(page, 's3-verify-and-record')).isCompleted).toBe(false);
      }
      await recordsSubmit(page, 'diagnosis', { ...base, cause: { value: 'connector-moisture' } });
      await waitForObjective(page, 's3-verify-and-record');
    });
  }

  async function finish(page: Page, problems: ReturnType<typeof collectPageProblems>): Promise<void> {
    await expectMissionComplete(page);
    await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
    await expectNoPageProblems(problems);
  }

  test('plays S3 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);
    await establishPattern(page);
    await compareAndPlan(page, true);
    await collectEvidence(page);
    await test.step('[s3-repair-local-fault] Complete the Supported Repair', async () => {
      await plantVerb(page, 'seal', CONNECTOR);
      await waitForObjective(page, 's3-repair-local-fault');
    });
    await verifyAndRecord(page, true);
    await test.step('[end] Mission Complete with a supported fix', async () => {
      await finish(page, problems);
      expect(await readDebrief(page)).toMatch(/Fixes with earlier evidence: 1\. Fixes without it: 0/u);
    });
  });

  test('recovers from a blind seal: still completes, debrief charges the unsupported fix', async ({ page }) => {
    const problems = collectPageProblems(page);
    await establishPattern(page);
    await test.step('[blind] seal the connector without looking at it first', async () => {
      await plantVerb(page, 'seal', CONNECTOR);
    });
    await compareAndPlan(page, false);
    await collectEvidence(page);
    await test.step('[s3-repair-local-fault] repair credited once the objective is live', async () => {
      await waitForObjective(page, 's3-repair-local-fault');
    });
    await verifyAndRecord(page, false);
    await test.step('[end] Mission Complete with the debrief penalty', async () => {
      await finish(page, problems);
      expect(await readDebrief(page)).toMatch(/Fixes without it: 1/u);
      expect(await readDebrief(page)).toMatch(/Penalty -\d+ points/u);
    });
  });
});
