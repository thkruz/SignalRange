import { expect, test } from '@playwright/test';
import {
  advanceClock,
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  openFrontlineScenario,
  readFieldStatus,
  readObjective,
  recordsExpectRefused,
  recordsSubmit,
  waitForObjective,
  workloadsStart,
  workloadsWaitForRun,
} from '../utils/frontline-helpers';

/**
 * Frontline S6 "Match the Connection to the Task", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s06-completion.test.ts.
 */
test.describe('Frontline S6 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  test('plays S6 to Mission Complete through the UI', async ({ page }) => {
    const problems = collectPageProblems(page);
    const ids: Record<string, string> = {};
    const run = async (key: string, card: string, service: string, expected: string) => {
      const id = await workloadsStart(page, card, service);
      expect(await workloadsWaitForRun(page, id), `${card} on ${service}`).toBe(expected);
      ids[key] = id;
    };

    await test.step('[open] scenario selection and start', async () => {
      await openFrontlineScenario(page, 6);
    });

    await test.step('[s06-read-requirements] Separate the Two Questions', async () => {
      await answerStatusCheck(page, 'The task requirements compared with measured path performance');
      await waitForObjective(page, 's06-read-requirements');
    });

    await test.step('[s06-compare-profiles] Compare the Service Profiles', async () => {
      await advanceClock(page, 120_000);
      await run('low', 'prompt-response', 'skylink', 'supported');
      await run('geo', 'prompt-response', 'camp-vsat', 'unsupported');
      await recordsSubmit(page, 'profile-comparison', {
        'low-delay': { value: ids.low },
        'geo-like': { value: ids.geo },
        changed: { value: 'delay' },
        evidence: { cites: 99 },
      });
      await waitForObjective(page, 's06-compare-profiles');
    });

    await test.step('[s06-assess-fiber] Assess the Prompt-Response Fiber Case', async () => {
      await run('pf', 'prompt-response', 'skylink-fiber', 'supported');
      await recordsSubmit(page, 'case-prompt-fiber', {
        run: { value: ids.pf },
        depends: { value: 'satellite-and-local' },
        finding: { value: 'requirement-met' },
        evidence: { cites: 99 },
      });
      await waitForObjective(page, 's06-assess-fiber');
    });

    await test.step('[s06-assess-radio] Assess the Prompt-Response Radio Case', async () => {
      await run('pr', 'prompt-response', 'skylink-radio', 'unsupported');
      // The case form only offers a missed run on the radio connection and only the measured finding, so a fiber run or a 'requirement met' claim cannot even be selected
      await recordsSubmit(page, 'case-prompt-radio', {
        run: { value: ids.pr },
        depends: { value: 'radio-and-satellite' },
        finding: { value: 'radio-adds-delay' },
        evidence: { cites: 99 },
      });
      await waitForObjective(page, 's06-assess-radio');
    });

    await test.step('[s06-assess-tolerant] Assess Both Queued-Report Cases', async () => {
      await run('qf', 'queued-report', 'skylink-fiber', 'supported');
      await run('qr', 'queued-report', 'skylink-radio', 'supported');
      await recordsSubmit(page, 'case-queued-fiber', {
        run: { value: ids.qf },
        depends: { value: 'satellite-and-local' },
        finding: { value: 'requirement-met' },
        evidence: { cites: 99 },
      });
      await recordsSubmit(page, 'case-queued-radio', {
        run: { value: ids.qr },
        depends: { value: 'radio-and-satellite' },
        finding: { value: 'requirement-met' },
        evidence: { cites: 99 },
      });
      await waitForObjective(page, 's06-assess-tolerant');
    });

    await test.step('[s06-report-suitability] Record Supported Tasks and Limits', async () => {
      // Counterexample: claiming the radio prompt-response task as supported
      await recordsExpectRefused(
        page,
        'suitability',
        {
          'prompt-fiber': { value: ids.pf },
          'prompt-radio': { value: ids.pr },
          'queued-fiber': { value: ids.qf },
          'queued-radio': { value: ids.qr },
          supported: { value: 'everything-both' },
          unmet: { value: 'prompt-radio-delay' },
          unresolved: { value: 'radio-segment-not-isolated' },
        },
        /supported/iu
      );
      await recordsSubmit(page, 'suitability', {
        'prompt-fiber': { value: ids.pf },
        'prompt-radio': { value: ids.pr },
        'queued-fiber': { value: ids.qf },
        'queued-radio': { value: ids.qr },
        supported: { value: 'prompt-fiber-and-queued' },
        unmet: { value: 'prompt-radio-delay' },
        unresolved: { value: 'radio-segment-not-isolated' },
      });
      await waitForObjective(page, 's06-report-suitability');
    });

    await test.step('[end] Mission Complete and page problems', async () => {
      await expectMissionComplete(page);
      await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
      await expectNoPageProblems(problems);
    });
  });
});
