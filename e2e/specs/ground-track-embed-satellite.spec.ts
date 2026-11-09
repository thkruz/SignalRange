import { existsSync } from 'node:fs';
import { expect, test } from '../fixtures/test-fixtures';
import { answerSystemQuiz } from '../utils/nats-eu-helpers';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

// The embed licence is domain-locked: 127.0.0.1 is not licensed, localhost is.
const BASE = process.env.SR_E2E_BASE ?? 'http://localhost:3000';

test.describe('Per-satellite ground track (KeepTrack embed)', () => {
  // PR CI has no Cloudflare credentials, so the bundle is never fetched and the app uses GeoMap.
  test.skip(!existsSync('public/keeptrack/index.html'), 'KeepTrack embed bundle not fetched (public/keeptrack/ missing)');
  test.use({ baseURL: BASE });

  test('shows the embed with the access toggle for a selected satellite', async ({ page, missionControlPage }) => {
    test.setTimeout(120000);
    await page.goto('/campaigns/nats-eu/scenarios/nats-eu-scenario1');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();

    // The asset tree is locked until the mission brief has been opened.
    await missionControlPage.openMissionBrief();
    await missionControlPage.closeMissionBrief();
    await answerSystemQuiz(page, 'Starting the pre-pass sweep');
    await dismissDialogIfPresent(page);

    await page.locator('[data-asset-type="satellite"]').first().click();
    await missionControlPage.selectTab('ground-track');

    const host = page.locator('#kt-embed-host');

    await expect(page.locator('#gt-embed-anchor')).toBeVisible();
    await expect(host).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#gt-toggle-access')).toBeVisible();

    await page.locator('#gt-toggle-access').check();
    await page.locator('#gt-toggle-footprints').uncheck();
    await expect(host).toBeVisible();
  });
});
