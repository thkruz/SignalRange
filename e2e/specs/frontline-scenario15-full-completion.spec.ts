import { test } from '@playwright/test';
import { powerSetMode, readBatteryWh, recordsFileRequest } from '../utils/frontline-forward-helpers';
import {
  advanceClock,
  answerStatusCheck,
  collectPageProblems,
  expectMissionComplete,
  expectNoPageProblems,
  LATEST,
  notebookAddHypothesis,
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
 * Frontline S15 "Suspected Interference", played through the UI.
 * Mirrors the `acts` in test/campaigns/frontline-s15-completion.test.ts.
 */
const EUS = 'forward-eurosat';
const SKY = 'skylink';
const ALL = 99;

test.describe('Frontline S15 full completion', () => {
  test.setTimeout(10 * 60 * 1000);
  test.use({ actionTimeout: 15000 });

  // The two valid assessments: suspected interference (two separate drops) and an unexplained outage (one drop, no pattern claim)
  for (const variant of ['suspected-interference', 'unexplained-outage'] as const) {
    test(`plays S15 to Mission Complete through the UI as ${variant}`, async ({ page }) => {
      const problems = collectPageProblems(page);

      await test.step('[open] scenario selection and start', async () => {
        await openFrontlineScenario(page, 15);
      });

      await test.step('[s15-record-anomaly] Record the anomaly', async () => {
        await advanceClock(page, 20000);
        for (let i = 0; i < 4 && !(await readFieldStatus(page)).firedEvents.includes('s15-eurosat-onset'); i++) {
          await advanceClock(page, 5000); // the onset is timed from objective activation, which can lag the scenario start
        }
        await page.waitForTimeout(1500); // let the live loop stamp the onset result, as it does for a player
        await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
        await servicesTakeSample(page, EUS, 'application', 'endpoint-report');
        await servicesTakeSample(page, EUS, 'local', 'local-probe');
        await servicesTakeSample(page, SKY, 'application', 'endpoint-report');
        await recordsSubmit(page, 'anomaly', {
          service: { value: 'eurosat' },
          onset: { cites: ALL },
          local: { value: LATEST },
          skylink: { value: LATEST },
          symptoms: { cites: ALL },
        });
        await waitForObjective(page, 's15-record-anomaly');
      });

      await test.step('[s15-review-evidence] Review the evidence', async () => {
        // Play it as a player would: watch the registration layer in small slices and read it on each change
        let lastSeen = '';
        const seen: string[] = [];
        for (let t = 0; t < 240; t += 5) {
          await advanceClock(page, 5000);
          const st = (await readFieldStatus(page)) as unknown as { services: Record<string, Array<{ layer: string; status: string }>> };
          const reg = st.services[EUS]?.find((l) => l.layer === 'registration')?.status ?? '?';
          if (reg !== lastSeen) {
            lastSeen = reg;
            seen.push(`t+${t + 5}s:${reg}`);
            await servicesTakeSample(page, EUS, 'registration', 'terminal-app');
          }
          if (seen.length >= 5) {
            break;
          }
        }
        await test.info().attach('registration-transitions.txt', { body: seen.join('; '), contentType: 'text/plain' });
        await servicesTakeSample(page, EUS, 'local', 'local-probe');
        await plantInspect(page, 'vsat-feed');
        await plantInspect(page, 'vsat-ifl:lnb');
        await plantInspect(page, 'vsat-ifl:modem');
        await plantInspect(page, 'power-station');
        await servicesTakeSample(page, EUS, 'provider', 'provider-portal');
        await recordsSubmit(page, 'evidence', {
          pattern: { cites: ALL },
          provider: { value: LATEST },
          local: { value: 'ruled-out' },
          limits: { value: 'not-proof' },
        });
        await waitForObjective(page, 's15-review-evidence');
      });

      await test.step('[s15-assess-confidence] Assess confidence', async () => {
        await notebookAddHypothesis(page, { scope: 'segment', target: EUS, cause: variant, confidence: 'medium', cites: 'all' });
        // Counterexamples: a provider fault and a named source are not supported by the readings
        await recordsExpectRefused(page, 'assessment', {
          classification: { value: 'provider-fault', cites: ALL },
          confidence: { value: 'moderate' },
          source: { value: 'not-established' },
          basis: { cites: ALL },
        });
        await recordsExpectRefused(page, 'assessment', {
          classification: { value: variant, cites: ALL },
          confidence: { value: 'moderate' },
          source: { value: 'nearest-transmitter' },
          basis: { cites: ALL },
        });
        await recordsSubmit(page, 'assessment', {
          classification: { value: variant, cites: ALL },
          confidence: { value: 'moderate' },
          source: { value: 'not-established' },
          basis: { cites: ALL },
        });
        await answerStatusCheck(page, 'Interference is suspected; the source remains unestablished.');
        await waitForObjective(page, 's15-assess-confidence');
      });

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

      await test.step('[end] Mission Complete and page problems', async () => {
        await expectMissionComplete(page);
        await test.info().attach('field-status.json', { body: JSON.stringify(await readFieldStatus(page), null, 2), contentType: 'application/json' });
        await expectNoPageProblems(problems);
      });
    });
  }
});
