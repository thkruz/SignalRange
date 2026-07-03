import { test, expect, Page } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Campaign 5 (Signal Hunter) - geolocation console mechanics.
 *
 * Validates the new two-satellite TDOA/FDOA interference geolocation feature
 * end to end against the sandbox scenario:
 * - the black-ops / coyote-brown campaign theme is applied,
 * - the Geolocation tab is registered (opt-in via settings.geolocation),
 * - the correlator captures measurements only while the duty-cycled jammer
 *   transmits (captures during OFF windows report NO CORRELATION and retry),
 * - COMPUTE FIX crosses the accumulated lines of position into a position fix.
 *
 * Capture timing follows the jammer duty cycle (60 s on / 45 s off), so the
 * capture step retries across cycles rather than asserting on the first press.
 */

const CAMPAIGN_ID = 'signal-hunter';
const SCENARIO_ID = 'signal-hunter-sandbox';

/** Number of visible measurement rows, excluding the empty-state placeholder */
async function measurementCount(page: Page): Promise<number> {
  const placeholder = await page.locator('#geo-measurement-rows td[colspan]').count();
  if (placeholder > 0) {
    return 0;
  }
  return page.locator('#geo-measurement-rows tr').count();
}

/** Press CAPTURE and wait for the integration window to resolve */
async function captureUntil(page: Page, target: number): Promise<number> {
  const captureBtn = page.locator('#geo-capture-btn');
  let count = 0;
  for (let attempt = 0; attempt < 40 && count < target; attempt++) {
    if (await captureBtn.isEnabled().catch(() => false)) {
      await captureBtn.click().catch(() => undefined);
    }
    // Wait for this capture to resolve (message updates to a terminal state)
    for (let poll = 0; poll < 30; poll++) {
      await page.waitForTimeout(500);
      const msg = (await page.locator('#geo-capture-msg').textContent().catch(() => '') ?? '').trim();
      if (/^(CAPTURE|NO CORRELATION|CORRELATOR)/.test(msg)) {
        break;
      }
    }
    count = await measurementCount(page);
  }
  return count;
}

test.describe('Signal Hunter geolocation console', () => {
  test.setTimeout(180000);

  test('applies theme, exposes the console, and computes a fix', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
      localStorage.clear();
      sessionStorage.clear();
    });

    const missionControl = new MissionControlPage(page);
    await page.goto(`/campaigns/${CAMPAIGN_ID}/scenarios/${SCENARIO_ID}`);
    await waitForSimulationReady(page);
    await dismissDialogIfPresent(page);

    // 1. Black-ops theme is applied via the per-campaign body class
    await expect(page.locator('body')).toHaveClass(/campaign-signal-hunter/);
    const accent = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--mc-accent-red').trim());
    expect(accent.toLowerCase()).toBe('#8f6f46'); // coyote brown

    // 2. Select the ground station and open the Geolocation tab
    await missionControl.selectGroundStation('PA-22');
    await dismissDialogIfPresent(page);
    const geoTab = page.locator('.nav-link[data-tab-id="geolocation"]');
    await expect(geoTab).toBeVisible();
    await geoTab.click();

    // 3. Console renders: correlator controls + geographic map
    await expect(page.locator('#geo-adjacent-select')).toBeVisible();
    await expect(page.locator('.geo-map-canvas')).toBeVisible();

    // 4. Tune the correlator to the interferer uplink (6013 MHz, 5 MHz BW)
    await page.locator('#geo-freq-value').fill('6013');
    await page.locator('#geo-freq-value').dispatchEvent('change');
    await page.locator('#geo-bw-value').fill('5');
    await page.locator('#geo-bw-value').dispatchEvent('change');

    // 5. Capture across duty cycles until at least 3 measurements land
    const count = await captureUntil(page, 3);
    expect(count).toBeGreaterThanOrEqual(3);

    // 6. Compute the fix - the summary shows a coordinate and error ellipse
    await page.locator('#geo-compute-btn').click();
    await page.waitForTimeout(1000);
    const summary = (await page.locator('#geo-fix-summary').textContent() ?? '').trim();
    expect(summary).toMatch(/-?\d+\.\d+°,\s*-?\d+\.\d+°/);
  });
});
