import { test } from '@playwright/test';
import { pathDiagramRecord, recordsAcceptUnit } from '../utils/frontline-forward-helpers';
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
 * Frontline S9 "Commission the Forward Post", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s09-completion.test.ts.
 */
test.describe('Frontline S9 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S9 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 9);
    });

    await test.step('[s09-reconcile-post] Reconcile the Post Handover', async () => {
      await recordsSubmit(page, 'delivery', {
        serial: { value: 'matches' },
        account: { value: 'matches' },
        stock: { value: 'matches-list' },
        camp: { value: 'not-certified' },
      });
      await recordsAcceptUnit(page, 'rautala-skylink');
      await waitForObjective(page, 's09-reconcile-post');
    });

    await test.step('[s09-map-service] Trace the Local Dependencies', async () => {
      await pathDiagramRecord(page, ['skylink-dish', 'skylink-cable', 'skylink-router', 'laptop', 'power-strip', 'power-station']);
      await waitForObjective(page, 's09-map-service');
    });

    await test.step('[s09-establish-baseline] Establish a Forward-Site Baseline', async () => {
      await plantInspect(page, 'skylink-router');
      await plantInspect(page, 'power-station');
      await servicesTakeSample(page, 'skylink', 'power', 'device-indicator');
      await servicesTakeSample(page, 'skylink', 'local', 'local-probe');
      await servicesTakeSample(page, 'skylink', 'registration', 'terminal-app');
      await servicesTakeSample(page, 'skylink', 'account', 'provider-portal');
      await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
      await recordsSubmit(page, 'baseline', {
        local: { value: LATEST },
        registration: { value: LATEST },
        account: { value: LATEST },
        application: { value: LATEST },
        energy: { value: LATEST },
      });
      await waitForObjective(page, 's09-establish-baseline');
    });

    await test.step('[s09-check-freshness] Separate Current and Last-Known Readings', async () => {
      // The link interruption fires once this objective is active and invalidates every earlier reading
      await page.waitForTimeout(3000);
      // Counterexample: calling the interrupted readings current is refused
      await recordsExpectRefused(page, 'freshness', { local: { value: 'current' }, registration: { value: 'current' }, remote: { value: 'current' } });
      await recordsSubmit(page, 'freshness', {
        local: { value: 'last-known' },
        registration: { value: 'last-known' },
        remote: { value: 'last-known' },
      });
      await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
      await answerStatusCheck(page, 'Last-known, until a fresh observation establishes its state.');
      await waitForObjective(page, 's09-check-freshness');
    });

    await test.step('[s09-confirm-readiness] Assess the First Task', async () => {
      await servicesTakeSample(page, 'skylink', 'power', 'device-indicator');
      await servicesTakeSample(page, 'skylink', 'local', 'local-probe');
      await servicesTakeSample(page, 'skylink', 'registration', 'terminal-app');
      await servicesTakeSample(page, 'skylink', 'account', 'provider-portal');
      await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
      // Counterexample: readiness justified by the camp checks is refused
      await recordsExpectRefused(page, 'readiness', {
        task: { value: 'fwd-first' },
        registration: { value: LATEST },
        account: { value: LATEST },
        application: { value: LATEST },
        basis: { cites: 99 },
        status: { value: 'ready-on-camp' },
      });
      await recordsSubmit(page, 'readiness', {
        task: { value: 'fwd-first' },
        registration: { value: LATEST },
        account: { value: LATEST },
        application: { value: LATEST },
        basis: { cites: 99 },
        status: { value: 'ready' },
      });
      await waitForObjective(page, 's09-confirm-readiness');
    });

    await test.step('[s09-run-first-window] Verify and Record the Initial Shift', async () => {
      const runId = await workloadsStart(page, 'fwd-first', 'skylink');
      await workloadsWaitForRun(page, runId);
      await advanceClock(page, 61000);
      await servicesTakeSample(page, 'skylink', 'power', 'device-indicator');
      await recordsSubmit(page, 'shift', {
        verified: { value: LATEST_SUPPORTED_RUN },
        rate: { value: LATEST },
        energy: { value: LATEST },
        limitation: { value: 'single-window' },
      });
      await waitForObjective(page, 's09-run-first-window');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
