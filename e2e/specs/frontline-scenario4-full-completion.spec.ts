import { expect, type Page, test } from '@playwright/test';
import {
  advanceClock,
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST_SUPPORTED_RUN,
  openFrontlineScenario,
  plantInspect,
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

/**
 * Frontline S4 "Recognize an Environmental Problem", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s04-completion.test.ts.
 * Sim waits (tick) are done with the advanceClock dev hook.
 */
test.describe('Frontline S4 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  /** Objectives 1-3: the normal restart, then the persistent problem */
  async function playToPersistence(page: Page): Promise<void> {
    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 4);
    });
    await test.step('[s4-identify-recovery] Identify the Recovery State', async () => {
      await plantInspect(page, 'skylink-dish');
      await answerStatusCheck(page, 'About a minute and a half, so waiting is the right first step.');
      await waitForObjective(page, 's4-identify-recovery');
    });
    await test.step('[s4-observe-recovery] Observe Normal Recovery', async () => {
      await advanceClock(page, 20_000);
      await servicesTakeSample(page, 'skylink', 'registration', 'local-probe');
      await advanceClock(page, 100_000);
      await servicesTakeSample(page, 'skylink', 'registration', 'local-probe');
      await waitForObjective(page, 's4-observe-recovery');
    });
    await test.step('[s4-recognize-persistence] Recognize the Persistent Problem', async () => {
      await advanceClock(page, 5_000);
      await servicesTakeSample(page, 'skylink', 'registration', 'local-probe');
      await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
      await answerStatusCheck(page, 'Waiting will not explain it, because the normal start is over.');
      await waitForObjective(page, 's4-recognize-persistence');
    });
  }

  /** Fresh check after the correction, then the environment report */
  async function verifyAndReport(page: Page): Promise<void> {
    await advanceClock(page, 120_000);
    const runId = await workloadsStart(page, 'ola-check', 'skylink');
    expect(await workloadsWaitForRun(page, runId)).toBe('supported');
    await recordsSubmit(page, 'environment-report', {
      recovery: { cites: 99 },
      condition: { value: 'obstruction' },
      correction: { cites: 99 },
      verified: { value: LATEST_SUPPORTED_RUN },
    });
    await waitForObjective(page, 's4-verify-environment-result');
  }

  async function finish(page: Page, problems: ReturnType<typeof collectPageProblems>): Promise<void> {
    await expectMissionComplete(page);
    await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
    await expectNoPageProblems(problems);
  }

  test('plays S4 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);
    await playToPersistence(page);

    await test.step('[s4-inspect-environment] Inspect the Terminal Environment', async () => {
      await plantInspect(page, 'skylink-dish');
      await waitForObjective(page, 's4-inspect-environment');
    });

    await test.step('[s4-correct-environment] Correct the Observed Condition', async () => {
      await plantVerb(page, 'removeNet', 'skylink-dish');
      await waitForObjective(page, 's4-correct-environment');
    });

    await test.step('[s4-verify-environment-result] counterexamples: wrong condition, one entry cannot fill both recovery readings', async () => {
      await advanceClock(page, 120_000);
      const runId = await workloadsStart(page, 'ola-check', 'skylink');
      expect(await workloadsWaitForRun(page, runId)).toBe('supported');
      const base = { condition: { value: 'obstruction' }, correction: { cites: 99 }, verified: { value: LATEST_SUPPORTED_RUN } };
      await recordsExpectRefused(page, 'environment-report', { ...base, recovery: { cites: 1 } }, /recovery: .*(Repeated or unrelated|notebook entries)/su);
      await recordsExpectRefused(page, 'environment-report', { ...base, recovery: { cites: 99 }, condition: { value: 'slow-restart' } }, /condition/u);
      expect((await readObjective(page, 's4-verify-environment-result')).isCompleted).toBe(false);
      await recordsSubmit(page, 'environment-report', { ...base, recovery: { cites: 99 } });
      await waitForObjective(page, 's4-verify-environment-result');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await finish(page, problems);
      expect(await readDebrief(page)).toMatch(/Fixes with earlier evidence: 1\. Fixes without it: 0/u);
    });
  });

  test('recovers from a blind correction: still completes, debrief charges the unsupported fix', async ({ page }) => {
    const problems = collectPageProblems(page);
    await playToPersistence(page);

    await test.step('[blind] remove the net without inspecting it first', async () => {
      await plantVerb(page, 'removeNet', 'skylink-dish');
    });
    await test.step('[s4-inspect-environment] inspect afterwards', async () => {
      await plantInspect(page, 'skylink-dish');
      await waitForObjective(page, 's4-inspect-environment');
    });
    await test.step('[s4-correct-environment] correction credited once the objective is live', async () => {
      await waitForObjective(page, 's4-correct-environment');
    });
    await test.step('[s4-verify-environment-result] verify', async () => {
      await verifyAndReport(page);
    });
    await test.step('[end] Mission Complete with the debrief penalty', async () => {
      await finish(page, problems);
      expect(await readDebrief(page)).toMatch(/Fixes without it: 1/u);
      expect(await readDebrief(page)).toMatch(/Penalty -\d+ points/u);
    });
  });
});
