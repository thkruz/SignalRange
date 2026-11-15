import { expect, type Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForObjectiveComplete } from '../utils/signal-hunter-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Phase 47 N3: the analyzer trace must show a received carrier above the
 * noise floor on the first screen of C4 and C5 scenario 1 (and on C1 as the
 * control). The full-completion specs only read the analyzer's input signal
 * list through objective conditions, so a carrier the antenna had dropped
 * under its C/N floor left every one of them green while the trace was flat.
 */

interface TraceSummary {
  peakDbm: number;
  floorDbm: number;
  pixels: number;
  levelAtDbm?: number;
}

/** Level at a frequency (Hz, analyzer IF) over the trace's median floor, dB; NaN until the trace exists */
async function readMarginAt(page: Page, stationId: string, atHz: number): Promise<number> {
  const trace = await page.evaluate(
    ([id, hz]) =>
      (window as unknown as { __srTest?: { spectrumTrace(id: string, index: number, atHz: number): TraceSummary | null } }).__srTest?.spectrumTrace(
        id as string,
        0,
        hz as number
      ) ?? null,
    [stationId, atHz] as const
  );

  return trace?.levelAtDbm === undefined ? Number.NaN : trace.levelAtDbm - trace.floorDbm;
}

async function openAnalysis(page: Page, campaignId: string, scenarioId: string, stationId: string, briefObjective?: string): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
    localStorage.clear();
    sessionStorage.clear();
  });
  const missionControl = new MissionControlPage(page);
  await missionControl.gotoScenario(campaignId, scenarioId);
  await waitForSimulationReady(page);
  await missionControl.dismissDialogIfPresent();
  // Tabs unlock once the mission brief has been reviewed
  if (
    await page
      .locator('.mission-brief-icon')
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false)
  ) {
    await missionControl.openMissionBrief();
    await missionControl.closeMissionBrief();
  }
  await dismissDialogIfPresent(page);
  if (briefObjective) {
    await waitForObjectiveComplete(missionControl, briefObjective);
  }
  await missionControl.selectGroundStation(stationId);
  await missionControl.selectTab('rx-analysis');
  await dismissDialogIfPresent(page);
}

test.describe('Analyzer trace shows the authored carrier', () => {
  test.setTimeout(120000);

  test('C5 scenario 1: the SENTRY-7 service carrier stands above the noise floor at 1365 MHz IF', async ({ page }) => {
    await openAnalysis(page, 'signal-hunter', 'signal-hunter-scenario1', 'PA-22', 'Review the Incident Package');

    // Read the bin AT the service carrier (the duty-cycled jammer sits at 1354 MHz, so a peak anywhere would pass on it)
    await expect.poll(() => readMarginAt(page, 'PA-22', 1365e6), { timeout: 30000 }).toBeGreaterThan(8);
  });

  test('C4 scenario 1: the COBALT-4 service downlink stands above the noise floor at 1450 MHz IF', async ({ page }) => {
    await openAnalysis(page, 'ccs', 'ccs-scenario1', 'SS-01');

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'shots/c4-s1-analysis.png' });

    // TP-X1 downlink gain is authored for about 10 dB C/N on the 5 m JAM chain the analyzer reads
    await expect.poll(() => readMarginAt(page, 'SS-01', 1450e6), { timeout: 30000 }).toBeGreaterThan(8);
  });
});
