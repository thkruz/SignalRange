import { expect, test } from '@playwright/test';
import {
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST,
  LATEST_SUPPORTED_RUN,
  openFrontlineScenario,
  plantInspect,
  readFieldStatus,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S1 "Take Over the Training Post", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s01-completion.test.ts, one
 * test.step per objective, named `[objective-id] title` (run-c6.mjs reads them).
 */
test.describe('Frontline S1 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S1 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 1);
    });

    await test.step('[s1-identify-equipment] Identify the Field Equipment', async () => {
      await plantInspect(page, 'power-station');
      await plantInspect(page, 'skylink-router');
      await plantInspect(page, 'laptop');
      await plantInspect(page, 'skylink-dish');
      await answerStatusCheck(page, 'The battery supplies power, the router connects local devices, and the terminal reaches the satellite service.');
      await waitForObjective(page, 's1-identify-equipment');
    });

    await test.step('[s1-check-condition] Assess the Post Condition', async () => {
      // Outside first (one trip), then the inside parts.
      await plantInspect(page, 'generator');
      await plantInspect(page, 'skylink-cable');
      await plantInspect(page, 'skylink-cable:dish');
      await plantInspect(page, 'power-station');
      await plantInspect(page, 'power-strip');
      await plantInspect(page, 'skylink-cable:router');
      await waitForObjective(page, 's1-check-condition');
    });

    await test.step('[s1-establish-connection] Establish Local Service', async () => {
      await servicesTakeSample(page, 'skylink', 'local', 'local-probe');
      await servicesTakeSample(page, 'skylink', 'registration', 'terminal-app');
      await waitForObjective(page, 's1-establish-connection');
    });

    await test.step('[s1-test-application] Run the Application Check', async () => {
      const runId = await workloadsStart(page, 'ola-check', 'skylink');
      expect(await workloadsWaitForRun(page, runId)).toBe('supported');
      await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
      await waitForObjective(page, 's1-test-application');
    });

    await test.step('[s1-record-baseline] Capture the Healthy Baseline', async () => {
      // Readings go stale after any site action (the workload run counts), so take
      // all three again right before filling the form, as the form's hint says.
      await servicesTakeSample(page, 'skylink', 'power', 'device-indicator');
      await servicesTakeSample(page, 'skylink', 'local', 'local-probe');
      await servicesTakeSample(page, 'skylink', 'registration', 'terminal-app');
      await recordsSubmit(page, 'baseline', {
        service: { value: 'skylink' },
        energy: { value: LATEST },
        power: { value: LATEST },
        local: { value: LATEST },
        registration: { value: LATEST },
        application: { value: LATEST_SUPPORTED_RUN },
        evidence: { cites: 3 },
      });
      await waitForObjective(page, 's1-record-baseline');
    });

    await test.step('[s1-hand-over-post] Submit the First Handover', async () => {
      await recordsSubmit(page, 'handover', {
        verified: { value: 'skylink' },
        untested: { value: 'camp-vsat' },
        run: { value: LATEST_SUPPORTED_RUN },
        readiness: { value: 'skylink-only' },
      });
      await waitForObjective(page, 's1-hand-over-post');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
