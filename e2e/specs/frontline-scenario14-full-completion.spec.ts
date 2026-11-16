import { type Page, test } from '@playwright/test';
import { pathDiagramRecord, powerSetMode, readBatteryWh } from '../utils/frontline-forward-helpers';
import {
  advanceClock,
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST,
  openFrontlineScenario,
  readFieldStatus,
  recordsExpectRefused,
  recordsSubmit,
  servicesTakeSample,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S14 "Two Connections", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s14-completion.test.ts.
 */
const EUS = 'forward-eurosat';
const REMOTE = 'forward-skylink-remote';
const SKY = 'skylink';
const ALL = 99;
const INTERACTIVE = 'fwd-interactive';
const TRANSFER = 'fwd-transfer';

async function runCard(page: Page, card: string, service: string): Promise<string> {
  const id = await workloadsStart(page, card, service);
  await workloadsWaitForRun(page, id);

  return id;
}

test.describe('Frontline S14 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S14 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 14);
    });

    await test.step('[s14-confirm-restoration] Confirm the restoration', async () => {
      await advanceClock(page, 25000);
      const verified = await runCard(page, INTERACTIVE, SKY);
      await servicesTakeSample(page, SKY, 'account', 'provider-portal');
      await servicesTakeSample(page, REMOTE, 'application', 'endpoint-report');
      await recordsSubmit(page, 'restoration', {
        notice: { cites: ALL },
        account: { value: LATEST },
        verified: { value: verified },
        remote: { value: LATEST },
        policy: { value: 'remains-in-force' },
      });
      await waitForObjective(page, 's14-confirm-restoration');
    });

    await test.step('[s14-compare-services] Compare the two services', async () => {
      const skylink = await runCard(page, INTERACTIVE, SKY);
      const eurosat = await runCard(page, INTERACTIVE, EUS);
      const transfer = await runCard(page, TRANSFER, EUS);
      await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
      await servicesTakeSample(page, EUS, 'application', 'endpoint-report');
      await recordsSubmit(page, 'comparison', {
        skylink: { value: skylink },
        eurosat: { value: eurosat },
        transfer: { value: transfer },
        unmet: { value: 'delay' },
        basis: { cites: ALL },
      });
      await waitForObjective(page, 's14-compare-services');
    });

    await test.step('[s14-check-dependencies] Check shared dependencies', async () => {
      await pathDiagramRecord(page, ['power-station', 'power-strip', 'laptop']);
      // Counterexample: treating the terminal alone as the shared path is refused; the correct dependency answers follow
      await recordsExpectRefused(page, 'dependencies', { shared: { value: 'terminal-only' }, separate: { value: 'terminal-only' } });
      await recordsSubmit(page, 'dependencies', {
        shared: { value: 'workstation-and-power' },
        separate: { value: 'terminal-account-provider-endpoint' },
        covered: { value: 'terminal-or-service' },
        uncovered: { value: 'power-or-workstation' },
      });
      await answerStatusCheck(page, 'Another service path, with common local dependencies remaining.');
      await waitForObjective(page, 's14-check-dependencies');
    });

    await test.step('[s14-select-readiness] Select the readiness arrangement', async () => {
      await powerSetMode(page, 'vsat-modem', 'standby');
      await advanceClock(page, 2000);
      const wh = await readBatteryWh(page);
      await recordsSubmit(page, 'readiness', {
        active: { value: 'run' },
        standby: { value: 'standby' },
        energy: { value: wh },
        reason: { value: 'interactive-needs-skylink' },
      });
      await waitForObjective(page, 's14-select-readiness');
    });

    await test.step('[s14-test-readiness] Test the readiness arrangement', async () => {
      await powerSetMode(page, 'vsat-modem', 'run');
      await advanceClock(page, 25000);
      await servicesTakeSample(page, SKY, 'provider', 'provider-portal');
      await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
      const transfer = await runCard(page, TRANSFER, EUS);
      await servicesTakeSample(page, SKY, 'provider', 'provider-portal');
      await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
      const wh = await readBatteryWh(page);
      await recordsSubmit(page, 'transition', {
        skylink: { value: LATEST },
        registration: { value: LATEST },
        verified: { value: transfer },
        restoration: { value: LATEST },
        energy: { value: wh },
        'registration-time': { value: 'about-20-s' },
        interactive: { value: 'unavailable' },
        basis: { cites: ALL },
      });
      await waitForObjective(page, 's14-test-readiness');
    });

    await test.step('[s14-handover-dual-service] Hand over both connections', async () => {
      await powerSetMode(page, 'skylink-dish', 'standby');
      await advanceClock(page, 2000);
      const wh = await readBatteryWh(page);
      await servicesTakeSample(page, SKY, 'account', 'provider-portal');
      await servicesTakeSample(page, REMOTE, 'application', 'endpoint-report');
      await recordsSubmit(page, 'dual-handover', {
        active: { value: 'run' },
        standby: { value: 'standby' },
        energy: { value: wh },
        skylink: { value: LATEST },
        remote: { value: LATEST },
        policy: { value: 'remains-in-force' },
        shared: { value: 'workstation-and-power' },
        unsupported: { value: INTERACTIVE },
      });
      await waitForObjective(page, 's14-handover-dual-service');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
