import { expect, test } from '@playwright/test';
import { startAtCheckpoint } from '../utils/checkpoints';
import { powerSetMode, readBatteryWh, recordsFileRequest } from '../utils/frontline-forward-helpers';
import {
  advanceClock,
  collectPageProblems,
  dismissDialogs,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST,
  openSiteTab,
  recordsSubmit,
  servicesTakeSample,
  startFromPrologue,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Pilot: Frontline S15 from the checkpoint taken after s15-assess-confidence (e2e/fixtures/checkpoints/frontline).
 * Plays s15-preserve-package to Mission Complete; the first three objectives are not replayed.
 * Recapture with e2e/specs/zz-capture-checkpoints.spec.ts when scenario15 changes.
 */
const SKY = 'skylink';
const ALL = 99;
const variant = 'suspected-interference';

test.describe('Frontline S15 from checkpoint', () => {
  test.setTimeout(5 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('finishes S15 from s15-preserve-package', async ({ page }) => {
    const problems = collectPageProblems(page);
    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
    });
    const cp = await startAtCheckpoint(page, 'frontline-scenario15@s15-preserve-package');
    expect(cp.activeObjectiveIds).toContain('s15-preserve-package');
    await startFromPrologue(page);
    await page.waitForFunction(() => typeof (window as unknown as { __fieldStatus?: unknown }).__fieldStatus === 'function', undefined, { timeout: 60000 });
    await dismissDialogs(page);
    await openSiteTab(page);

    await test.step('[s15-preserve-package] Preserve the evidence package', async () => {
      await recordsSubmit(page, 'package', {
        observations: { cites: ALL },
        events: { cites: ALL },
        terminal: { value: 'run' },
        gap: { value: 'no-source-measurement' },
      });
      await waitForObjective(page, 's15-preserve-package');
    });

    await test.step('[s15-maintain-supported-work] Maintain supported work', async () => {
      await powerSetMode(page, 'vsat-modem', 'standby');
      await advanceClock(page, 2000);
      const wh = await readBatteryWh(page);
      const runId = await workloadsStart(page, 'fwd-first', SKY);
      await workloadsWaitForRun(page, runId);
      await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
      await recordsSubmit(page, 'alternative', {
        verified: { value: runId },
        modem: { value: 'standby' },
        energy: { value: wh },
        unavailable: { value: 'fwd-transfer' },
      });
      await waitForObjective(page, 's15-maintain-supported-work');
    });

    await test.step('[s15-submit-referral] Submit the referral', async () => {
      await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
      await recordsSubmit(page, 'incident', {
        classification: { value: variant, cites: ALL },
        source: { value: 'not-established' },
        available: { value: LATEST },
        unavailable: { value: 'fwd-transfer' },
        open: { value: 'source-and-cause' },
        evidence: { cites: ALL },
      });
      await recordsFileRequest(page, 's15-investigation-referral');
      await advanceClock(page, 2000);
      await waitForObjective(page, 's15-submit-referral');
    });

    await expectMissionComplete(page);
    await expectNoPageProblems(problems);
  });
});
