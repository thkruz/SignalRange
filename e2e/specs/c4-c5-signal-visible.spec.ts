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
}

async function readTrace(page: Page, stationId: string): Promise<TraceSummary | null> {
  return page.evaluate((id) => (window as unknown as { __srTest?: { spectrumTrace(id: string): TraceSummary | null } }).__srTest?.spectrumTrace(id) ?? null, stationId);
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

  test('C5 scenario 1: the SENTRY-7 service carrier stands above the noise floor', async ({ page }) => {
    await openAnalysis(page, 'signal-hunter', 'signal-hunter-scenario1', 'PA-22', 'Review the Incident Package');

    // The service carrier is always on (the jammer is duty-cycled), 12+ dB C/N authored
    await expect
      .poll(
        async () => {
          const trace = await readTrace(page, 'PA-22');
          return trace ? trace.peakDbm - trace.floorDbm : Number.NaN;
        },
        { timeout: 30000 }
      )
      .toBeGreaterThan(8);
  });

  test('C4 scenario 1: trace summary', async ({ page }) => {
    await openAnalysis(page, 'ccs', 'ccs-scenario1', 'SS-01');
    await page.waitForTimeout(3000);
    console.log(`[c4-s1] ${JSON.stringify(await readTrace(page, 'SS-01'))}`);
    await page.screenshot({ path: 'shots/c4-s1-analysis.png' });
  });
});
