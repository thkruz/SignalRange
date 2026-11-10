import { type Page, test } from '@playwright/test';
import { powerSetMode, recordsAcceptUnit } from '../utils/frontline-forward-helpers';
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
 * Frontline S11 "Bring EuroSat Into Service", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s11-completion.test.ts.
 */
const EUS = 'forward-eurosat';
const ALL = 99;

async function takeAllEurosat(page: Page): Promise<void> {
  await servicesTakeSample(page, EUS, 'power', 'device-indicator');
  await servicesTakeSample(page, EUS, 'local', 'local-probe');
  await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
  await servicesTakeSample(page, EUS, 'account', 'provider-portal');
  await servicesTakeSample(page, EUS, 'application', 'endpoint-report');
}

test.describe('Frontline S11 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S11 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 11);
    });

    await test.step('[s11-receive-equipment] Accept the EuroSat Delivery', async () => {
      await plantInspect(page, 'vsat-modem');
      await recordsSubmit(page, 'delivery', {
        serial: { value: 'matches' },
        account: { value: 'matches' },
        accessories: { value: 'complete' },
        depot: { value: 'hardware-only' },
      });
      await recordsAcceptUnit(page, 'rautala-eurosat');
      await waitForObjective(page, 's11-receive-equipment');
    });

    await test.step('[s11-commission-terminal] Commission the New Connection', async () => {
      await powerSetMode(page, 'vsat-modem', 'run');
      await advanceClock(page, 25000);
      await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
      await servicesTakeSample(page, EUS, 'account', 'provider-portal');
      await recordsSubmit(page, 'commissioning', {
        unit: { value: 'rautala-eurosat' },
        mode: { value: 'run' },
        registration: { value: LATEST },
        account: { value: LATEST },
        service: { value: 'ready-not-proven' },
      });
      await waitForObjective(page, 's11-commission-terminal');
    });

    await test.step('[s11-measure-service] Measure the Available Service', async () => {
      for (const m of ['rttMs', 'downMbps', 'lossPct', 'jitterMs'] as const) await servicesTakeSample(page, EUS, 'registration', 'terminal-app', m);
      await takeAllEurosat(page);
      await recordsSubmit(page, 'measurement', {
        local: { value: LATEST },
        application: { value: LATEST },
        samples: { cites: ALL },
        jitter: { value: LATEST },
        delay: { value: 'much-higher' },
      });
      await waitForObjective(page, 's11-measure-service');
    });

    await test.step('[s11-select-workload] Assess the Pending Workloads', async () => {
      const runId = await workloadsStart(page, 'fwd-interactive', EUS);
      await workloadsWaitForRun(page, runId);
      // Counterexample: calling the interactive task supported is refused; the corrected form follows
      await recordsExpectRefused(page, 'suitability', { transfer: { value: 'supported' }, interactive: { value: 'supported' }, unmet: { value: 'delay' } });
      await recordsSubmit(page, 'suitability', {
        transfer: { value: 'supported' },
        interactive: { value: 'unsupported' },
        unmet: { value: 'delay' },
        basis: { cites: ALL },
      });
      await answerStatusCheck(page, 'The transfer may qualify; the interactive task does not.');
      await waitForObjective(page, 's11-select-workload');
    });

    await test.step('[s11-verify-workload] Verify the Supported Task', async () => {
      const runId = await workloadsStart(page, 'fwd-transfer', EUS);
      await workloadsWaitForRun(page, runId);
      await servicesTakeSample(page, EUS, 'application', 'endpoint-report');
      await waitForObjective(page, 's11-verify-workload');
    });

    await test.step('[s11-handover-capability] Report the Restored Capability', async () => {
      await plantInspect(page, 'power-station');
      await servicesTakeSample(page, 'skylink', 'account', 'provider-portal');
      await recordsSubmit(page, 'capability', {
        verified: { value: LATEST_SUPPORTED_RUN },
        energy: { value: LATEST },
        skylink: { value: LATEST },
        restored: { value: 'fwd-transfer' },
        unavailable: { value: 'fwd-interactive' },
        restriction: { value: 'remains-active' },
      });
      await waitForObjective(page, 's11-handover-capability');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
