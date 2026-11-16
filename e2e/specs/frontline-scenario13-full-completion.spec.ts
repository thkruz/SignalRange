import { type Page, test } from '@playwright/test';
import { pathDiagramRecord } from '../utils/frontline-forward-helpers';
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
 * Frontline S13 "Remote Endpoint" (SkyLink task), played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s13-completion.test.ts.
 */
const REMOTE = 'forward-skylink-remote';
const SKY = 'skylink';
const ALL = 99;
const PATH = ['skylink-dish', 'account:forward-skylink', 'provider:skylink-net', 'endpoint:remote-terminal'];

test.describe('Frontline S13 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S13 to Mission Complete through the UI', async ({ page }: { page: Page }) => {
    const problems = collectPageProblems(page);

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 13);
    });

    await test.step('[s13-map-endpoints] Map both ends', async () => {
      await pathDiagramRecord(page, PATH);
      await recordsSubmit(page, 'endpoints', {
        ground: { value: 'forward-skylink' },
        remote: { value: 'remote-terminal' },
        link: { value: 'provider-network' },
      });
      await waitForObjective(page, 's13-map-endpoints');
    });

    await test.step('[s13-capture-baseline] Capture the baseline', async () => {
      await servicesTakeSample(page, SKY, 'registration', 'terminal-app');
      await servicesTakeSample(page, SKY, 'account', 'terminal-app');
      await servicesTakeSample(page, REMOTE, 'application', 'endpoint-report');
      await recordsSubmit(page, 'baseline', {
        ground: { value: LATEST },
        remote: { value: LATEST },
        phase: { value: 'before-policy-event' },
        basis: { cites: ALL },
      });
      await waitForObjective(page, 's13-capture-baseline');
    });

    await test.step('[s13-record-interruption] Record the remote interruption', async () => {
      await advanceClock(page, 16000);
      await recordsSubmit(page, 'interruption', { remote: { value: 'last-known' }, onset: { cites: ALL } });
      await servicesTakeSample(page, REMOTE, 'application', 'endpoint-report');
      await waitForObjective(page, 's13-record-interruption');
    });

    await test.step('[s13-review-provider-evidence] Review the provider evidence', async () => {
      await advanceClock(page, 2000);
      await recordsSubmit(page, 'notice-correlation', {
        endpoint: { value: 'remote-terminal' },
        scope: { value: 'remote-mobility-policy' },
        ground: { value: 'separate-unchanged' },
        local: { value: 'not-implicated' },
        timing: { cites: ALL },
      });
      await waitForObjective(page, 's13-review-provider-evidence');
    });

    await test.step('[s13-assess-local-options] Assess local options', async () => {
      await servicesTakeSample(page, REMOTE, 'application', 'endpoint-report');
      await recordsSubmit(page, 'local-limits', {
        remote: { value: LATEST },
        restart: { value: 'does-not-clear' },
        route: { value: 'does-not-clear' },
        action: { value: 'report-and-hold' },
      });
      await answerStatusCheck(page, 'It would change the ground path without clearing remote policy.');
      await waitForObjective(page, 's13-assess-local-options');
    });

    await test.step('[s13-record-hold] Record the hold', async () => {
      const runId = await workloadsStart(page, 'fwd-remote-task', REMOTE);
      await workloadsWaitForRun(page, runId);
      await servicesTakeSample(page, REMOTE, 'application', 'endpoint-report');
      // Counterexample: reading the hold as lifted by the notice is refused; the separate restriction follows
      await recordsExpectRefused(page, 'hold-report', { limit: { value: 'local-capacity' } });
      await recordsSubmit(page, 'hold-report', {
        run: { value: runId },
        remote: { value: LATEST },
        limit: { value: 'remote-mobility-policy' },
        ground: { value: 'separate-still-in-force' },
        outcome: { value: 'hold-no-success' },
        reassess: { value: 'provider-lifts-policy' },
      });
      await waitForObjective(page, 's13-record-hold');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
