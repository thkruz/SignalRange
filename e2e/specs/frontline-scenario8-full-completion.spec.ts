import { expect, type Page, test } from '@playwright/test';
import {
  advanceClock,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST,
  LATEST_SUPPORTED_RUN,
  notebookAddHypothesis,
  openFrontlineScenario,
  plantInspect,
  plantMeasure,
  plantVerb,
  readDebrief,
  readFieldStatus,
  recordsExpectRefused,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S8 "Qualify for Independent Operation", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s08-completion.test.ts.
 */
test.describe('Frontline S8 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S8 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 8);
    });

    await test.step('[s08-interpret-assignment] Interpret the Assignment', async () => {
      await recordsSubmit(page, 'assignment', {
        requirement: { value: '5-2-150' },
        limits: { value: 'one-kit-one-cable' },
        reserve: { value: '150wh' },
        trips: { value: 'three' },
      });
      await waitForObjective(page, 's08-interpret-assignment');
    });

    await test.step('[s08-establish-state] Establish the Available Service', async () => {
      await servicesTakeSample(page, 'skylink', 'registration', 'terminal-app');
      await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
      await plantInspect(page, 'skylink-dish');
      // Counterexample: swapping everything is not a diagnostic check
      await recordsExpectRefused(page, 'plan', { symptom: { value: LATEST }, check: { value: 'swap-everything' }, basis: { cites: 99 } }, /check/iu);
      await recordsSubmit(page, 'plan', {
        symptom: { value: LATEST },
        check: { value: 'inspect-connectors' },
        basis: { cites: 99 },
      });
      await waitForObjective(page, 's08-establish-state');
    });

    await test.step('[s08-diagnose-fault] Support a Diagnosis', async () => {
      await plantMeasure(page, 'cable-tester', 'skylink-cable');
      await plantInspect(page, 'skylink-cable:router');
      await notebookAddHypothesis(page, { scope: 'part', target: 'skylink-cable:router', cause: 'connector-moisture', confidence: 'medium', cites: 'all' });
      // Counterexample: a cause the observations do not support
      await recordsExpectRefused(page, 'diagnosis', { cause: { value: 'router' }, observations: { cites: 99 } }, /cause/iu);
      await recordsSubmit(page, 'diagnosis', {
        cause: { value: 'connector-moisture' },
        observations: { cites: 99 },
      });
      await waitForObjective(page, 's08-diagnose-fault');
    });

    await test.step('[s08-repair-service] Complete the Justified Intervention', async () => {
      await plantVerb(page, 'swap', 'skylink-cable:router');
      await recordsSubmit(page, 'intervention', {
        basis: { cites: 99 },
        action: { cites: 99 },
        spare: { value: 'connector-kit' },
      });
      await waitForObjective(page, 's08-repair-service');
    });

    await test.step('[s08-verify-outcome] Verify the Assessment Outcome', async () => {
      // The terminal restarts after the repair: boot plus satellite search takes up to 300 s
      await advanceClock(page, 330_000);
      const runId = await workloadsStart(page, 'ola-assess', 'skylink');
      expect(await workloadsWaitForRun(page, runId)).toBe('supported');
      await recordsSubmit(page, 'outcome', {
        verified: { value: LATEST_SUPPORTED_RUN },
        rate: { value: LATEST },
        reserve: { value: LATEST },
      });
      await waitForObjective(page, 's08-verify-outcome');
    });

    await test.step('[s08-submit-handover] Submit the Qualification Handover', async () => {
      await recordsSubmit(page, 'qualification', {
        observations: { cites: 99 },
        diagnosis: { value: 'connector-moisture' },
        action: { cites: 99 },
        verification: { value: LATEST_SUPPORTED_RUN },
        limitation: { value: 'single-window' },
      });
      await waitForObjective(page, 's08-submit-handover');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });

  test('recovers from a blind swap: still completes, debrief charges the unsupported fix', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 8);
    });

    await test.step('[s08-interpret-assignment] Interpret the Assignment', async () => {
      await recordsSubmit(page, 'assignment', {
        requirement: { value: '5-2-150' },
        limits: { value: 'one-kit-one-cable' },
        reserve: { value: '150wh' },
        trips: { value: 'three' },
      });
      await waitForObjective(page, 's08-interpret-assignment');
    });

    await test.step('[blind] swap the connector before any observation', async () => {
      await plantVerb(page, 'swap', 'skylink-cable:router');
    });

    await test.step('[s08-establish-state] Establish the Available Service', async () => {
      await servicesTakeSample(page, 'skylink', 'registration', 'terminal-app');
      await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
      await plantInspect(page, 'skylink-dish');
      await recordsSubmit(page, 'plan', {
        symptom: { value: LATEST },
        check: { value: 'inspect-connectors' },
        basis: { cites: 99 },
      });
      await waitForObjective(page, 's08-establish-state');
    });

    await test.step('[s08-diagnose-fault] Support a Diagnosis', async () => {
      await plantMeasure(page, 'cable-tester', 'skylink-cable');
      await plantInspect(page, 'skylink-cable:router');
      await notebookAddHypothesis(page, { scope: 'part', target: 'skylink-cable:router', cause: 'connector-moisture', confidence: 'medium', cites: 'all' });
      await recordsSubmit(page, 'diagnosis', {
        cause: { value: 'connector-moisture' },
        observations: { cites: 99 },
      });
      await waitForObjective(page, 's08-diagnose-fault');
    });

    await test.step('[s08-repair-service] Complete the Justified Intervention', async () => {
      await recordsSubmit(page, 'intervention', {
        basis: { cites: 99 },
        action: { cites: 99 },
        spare: { value: 'connector-kit' },
      });
      await waitForObjective(page, 's08-repair-service');
    });

    await test.step('[s08-verify-outcome] Verify the Assessment Outcome', async () => {
      // The terminal restarts after the repair: boot plus satellite search takes up to 300 s
      await advanceClock(page, 330_000);
      const runId = await workloadsStart(page, 'ola-assess', 'skylink');
      expect(await workloadsWaitForRun(page, runId)).toBe('supported');
      await recordsSubmit(page, 'outcome', {
        verified: { value: LATEST_SUPPORTED_RUN },
        rate: { value: LATEST },
        reserve: { value: LATEST },
      });
      await waitForObjective(page, 's08-verify-outcome');
    });

    await test.step('[s08-submit-handover] Submit the Qualification Handover', async () => {
      await recordsSubmit(page, 'qualification', {
        observations: { cites: 99 },
        diagnosis: { value: 'connector-moisture' },
        action: { cites: 99 },
        verification: { value: LATEST_SUPPORTED_RUN },
        limitation: { value: 'single-window' },
      });
      await waitForObjective(page, 's08-submit-handover');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
      expect(await readDebrief(page)).toMatch(/Fixes without it: 1/u);
    });
  });
});
