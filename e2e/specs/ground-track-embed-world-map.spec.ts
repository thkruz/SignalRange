import { existsSync } from 'node:fs';
import { expect, test } from '../fixtures/test-fixtures';
import { waitForSimulationReady } from '../utils/simulation-helpers';

// The embed licence is domain-locked: 127.0.0.1 is not licensed, localhost is.
const BASE = process.env.SR_E2E_BASE ?? 'http://localhost:3000';

test.describe('World map (KeepTrack embed)', () => {
  // PR CI has no Cloudflare credentials, so the bundle is never fetched and the app uses GeoMap.
  test.skip(!existsSync('public/keeptrack/index.html'), 'KeepTrack embed bundle not fetched (public/keeptrack/ missing)');
  test.use({ baseURL: BASE });

  test('shows the embed over the anchor, parks it on tab change, shows it again on return', async ({ page, missionControlPage }) => {
    test.setTimeout(120000);
    await page.goto('/campaigns/nats-eu/scenarios/nats-eu-scenario1');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();

    await missionControlPage.selectTab('ground-track');
    const host = page.locator('#kt-embed-host');

    await expect(page.locator('#gt-embed-anchor')).toBeVisible();
    await expect(host).toBeVisible({ timeout: 30000 });
    await expect(host.locator('iframe')).toHaveCount(1);
    const box = await host.boundingBox();

    expect(box?.width ?? 0).toBeGreaterThan(200);

    await missionControlPage.selectTab('mission-overview');
    await expect(host).toBeHidden();

    await missionControlPage.selectTab('ground-track');
    await expect(host).toBeVisible();
  });
});
