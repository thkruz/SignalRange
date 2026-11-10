import { expect, type Page, test } from '@playwright/test';
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
import { powerApplyModes } from '../utils/frontline-power-helpers';

/**
 * Frontline S2 "Work Within the Power Budget", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s02-completion.test.ts.
 * Current mechanics: the supply loss fires once the outage objective is live, the verification is one 120 s
 * window that must hold the service and the reserve together, and the resource handover is certified against it.
 */
test.describe('Frontline S2 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  async function playToConfiguration(page: Page): Promise<void> {
    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 2);
    });
    await test.step('[s2-read-resources] Read the Available Resources', async () => {
      await plantInspect(page, 'power-station');
      await answerStatusCheck(page, '250 Wh, the difference between stored energy and the reserve.');
      await waitForObjective(page, 's2-read-resources');
    });
    await test.step('[s2-trace-dependencies] Trace the Shared Supply', async () => {
      await plantInspect(page, 'power-strip');
      await answerStatusCheck(page, 'It leaves the shared supply dependency, even though the two satellite service paths differ.');
      await waitForObjective(page, 's2-trace-dependencies');
    });
  }

  async function selectSkylinkOnly(page: Page): Promise<void> {
    await powerApplyModes(page, { 'vsat-modem': 'standby' });
    await waitForObjective(page, 's2-select-configuration');
  }

  /** After the reseat: wait out the terminal restart, run the 120 s window, confirm at the remote end */
  async function verifyWindow(page: Page): Promise<void> {
    for (let i = 0; i < 8; i++) await advanceClock(page, 100_000);
    const runId = await workloadsStart(page, 'ola-voice', 'skylink');
    expect(await workloadsWaitForRun(page, runId)).toBe('supported');
    await servicesTakeSample(page, 'skylink', 'application', 'endpoint-report');
    await waitForObjective(page, 's2-verify-service-reserve');
  }

  const resources = {
    energy: { value: LATEST },
    fuel: { value: LATEST },
    rate: { value: LATEST },
    skylink: { value: LATEST },
    vsat: { value: LATEST },
    verified: { value: LATEST_SUPPORTED_RUN },
    seating: { cites: 99 },
    reseat: { cites: 99 },
    limitation: { value: 'skylink-only' },
  };

  async function finish(page: Page, problems: ReturnType<typeof collectPageProblems>): Promise<void> {
    await expectMissionComplete(page);
    await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
    await expectNoPageProblems(problems);
  }

  test('plays S2 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);
    await playToConfiguration(page);

    await test.step('[s2-select-configuration] counterexample: VSAT only misses the low-delay card; then SkyLink only', async () => {
      await powerApplyModes(page, { 'skylink-dish': 'standby' });
      await page.waitForTimeout(500);
      expect((await readObjective(page, 's2-select-configuration')).isCompleted, 'VSAT-only must not satisfy the configuration').toBe(false);
      await powerApplyModes(page, { 'skylink-dish': 'run', 'vsat-modem': 'standby' });
      await waitForObjective(page, 's2-select-configuration');
    });

    await test.step('[s2-respond-to-outage] Respond to Supply Loss', async () => {
      await plantVerb(page, 'inspect', 'generator:out');
      // A visual look leaves the voltage to the multimeter; the meter reading is what records the fault
      await plantMeasure(page, 'multimeter', 'generator:out');
      await plantVerb(page, 'reseat', 'generator:out');
      await waitForObjective(page, 's2-respond-to-outage');
    });

    await test.step('[s2-verify-service-reserve] Verify Service and Reserve', async () => {
      await verifyWindow(page);
    });

    await test.step('[s2-record-resources] counterexamples: wrong terminal mode, wrong limitation; then the right filing', async () => {
      await plantInspect(page, 'power-station');
      await plantInspect(page, 'generator');
      await recordsExpectRefused(page, 'resources', { ...resources, vsat: { value: 'run' } }, /vsat/iu);
      await recordsExpectRefused(page, 'resources', { ...resources, limitation: { value: 'both-paths' } }, /limitation/iu);
      expect((await readObjective(page, 's2-record-resources')).isCompleted).toBe(false);
      await recordsSubmit(page, 'resources', resources);
      await waitForObjective(page, 's2-record-resources');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await finish(page, problems);
      expect(await readDebrief(page)).toMatch(/Fixes with earlier evidence: 1\. Fixes without it: 0/u);
    });
  });

  test('recovers from a blind reseat: still completes, debrief charges the unsupported fix', async ({ page }) => {
    const problems = collectPageProblems(page);
    await playToConfiguration(page);
    await selectSkylinkOnly(page);

    await test.step('[blind] reseat the plug without looking at it', async () => {
      await plantVerb(page, 'reseat', 'generator:out');
    });
    await test.step('[s2-respond-to-outage] inspect afterwards, objective still completes', async () => {
      await plantVerb(page, 'inspect', 'generator:out');
      await waitForObjective(page, 's2-respond-to-outage');
    });
    await test.step('[s2-verify-service-reserve] verify', async () => {
      await verifyWindow(page);
    });
    await test.step('[s2-record-resources] record', async () => {
      await plantInspect(page, 'power-station');
      await plantInspect(page, 'generator');
      await recordsSubmit(page, 'resources', resources);
      await waitForObjective(page, 's2-record-resources');
    });
    await test.step('[end] Mission Complete with the debrief penalty', async () => {
      await finish(page, problems);
      expect(await readDebrief(page)).toMatch(/Fixes without it: 1/u);
      expect(await readDebrief(page)).toMatch(/Penalty -\d+ points/u);
    });
  });
});
