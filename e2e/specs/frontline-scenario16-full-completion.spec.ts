import { test } from '@playwright/test';
import { powerSetMode, readBatteryWh } from '../utils/frontline-forward-helpers';
import {
  advanceClock,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST,
  note,
  openFrontlineScenario,
  plantInspect,
  plantVerb,
  readFieldStatus,
  recordsExpectRefused,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S16 "Independent Shift", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s16-completion.test.ts.
 */
const SKY = 'skylink';
const EUS = 'forward-eurosat';
const FIRST = 'fwd-first';
const TRANSFER = 'fwd-transfer';
const SEAT = 'ps:ac-out';
const ALL = 99;

test.describe('Frontline S16 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S16 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 16);
    });

    await test.step('[s16-review-handover] Review the handover', async () => {
      await recordsSubmit(page, 'brief', {
        task: { value: FIRST },
        reserve: { value: 'reserve-200' },
        equipment: { value: 'both-terminals' },
        prior: { value: 'source-not-established' },
        unknowns: { value: 'service-and-power' },
      });
      await waitForObjective(page, 's16-review-handover');
    });

    await test.step('[s16-establish-configuration] Establish the configuration', async () => {
      await powerSetMode(page, 'vsat-modem', 'standby');
      await advanceClock(page, 40000);
      await plantInspect(page, 'power-station');
      await servicesTakeSample(page, SKY, 'local', 'local-probe');
      await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
      const runId = await workloadsStart(page, FIRST, SKY);
      await workloadsWaitForRun(page, runId);
      await servicesTakeSample(page, SKY, 'local', 'local-probe');
      await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
      const wh = await readBatteryWh(page);
      await recordsSubmit(page, 'baseline', {
        dish: { value: 'run' },
        modem: { value: 'standby' },
        local: { value: LATEST },
        application: { value: LATEST },
        verified: { value: runId },
        energy: { value: wh },
      });
      await waitForObjective(page, 's16-establish-configuration');
    });

    await test.step('[s16-investigate-local-change] Investigate the local change', async () => {
      await advanceClock(page, 5000);
      await plantInspect(page, SEAT);
      await plantVerb(page, 'wiggle', SEAT);
      note(`reseat result: ${await plantVerb(page, 'reseat', SEAT)}`);
      for (let i = 0; i < 6; i++) await advanceClock(page, 60000); // one large jump is clamped
      await plantInspect(page, 'power-station');
      let runId = await workloadsStart(page, FIRST, SKY);
      let status = await workloadsWaitForRun(page, runId);
      for (let i = 0; i < 3 && status !== 'supported'; i++) {
        note(`run ${runId} ended ${status} 360 s after the reseat; waiting 60 s more (${i + 1})`);
        await advanceClock(page, 60000);
        runId = await workloadsStart(page, FIRST, SKY);
        status = await workloadsWaitForRun(page, runId);
      }
      await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
      const wh = await readBatteryWh(page);
      await recordsSubmit(page, 'local', {
        seating: { cites: ALL },
        action: { cites: ALL },
        verified: { value: runId },
        application: { value: LATEST },
        energy: { value: wh },
      });
      await waitForObjective(page, 's16-investigate-local-change');
    });

    await test.step('[s16-assess-external-change] Assess the external change', async () => {
      await advanceClock(page, 20000);
      await servicesTakeSample(page, SKY, 'local', 'local-probe');
      await servicesTakeSample(page, SKY, 'provider', 'provider-portal');
      await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
      // Counterexample: tying the outage to the repaired supply fault is refused; the separate-incident record follows
      await recordsExpectRefused(page, 'external', { scope: { value: 'skylink-provider' }, local: { value: 'same-cause' }, fix: { value: 'clears' } });
      await recordsSubmit(page, 'external', {
        scope: { value: 'skylink-provider' },
        local: { value: 'separate' },
        provider: { value: LATEST },
        evidence: { cites: ALL },
        fix: { value: 'does-not-clear' },
      });
      await waitForObjective(page, 's16-assess-external-change');
    });

    await test.step('[s16-verify-final-service] Verify the final service', async () => {
      await powerSetMode(page, 'skylink-dish', 'standby');
      await powerSetMode(page, 'vsat-modem', 'run');
      await advanceClock(page, 40000);
      await plantInspect(page, 'power-station');
      const runId = await workloadsStart(page, TRANSFER, EUS);
      await workloadsWaitForRun(page, runId);
      await servicesTakeSample(page, EUS, 'application', 'endpoint-report');
      const wh = await readBatteryWh(page);
      await recordsSubmit(page, 'outcome', {
        modem: { value: 'run' },
        dish: { value: 'standby' },
        verified: { value: runId },
        rate: { value: LATEST },
        unavailable: { value: FIRST },
        energy: { value: wh },
      });
      await waitForObjective(page, 's16-verify-final-service');
    });

    await test.step('[s16-submit-final-handover] Submit the final handover', async () => {
      const wh = await readBatteryWh(page);
      await recordsSubmit(page, 'final', {
        localEvidence: { cites: ALL },
        localAction: { cites: ALL },
        externalEvidence: { cites: ALL },
        incidents: { value: 'separate' },
        service: { value: 'limited' },
        unavailable: { value: FIRST },
        prior: { value: 'source-not-established' },
        energy: { value: wh },
      });
      await waitForObjective(page, 's16-submit-final-handover');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
