import { existsSync } from 'node:fs';
import { expect, test } from '../fixtures/test-fixtures';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

// The embed licence is domain-locked: 127.0.0.1 is not licensed, localhost is.
const BASE = process.env.SR_E2E_BASE ?? 'http://localhost:3000';

test.describe('Range Watch: Starlink Interference', () => {
  // PR CI has no Cloudflare credentials and no fetched TLE sets; skip like the embed specs.
  test.skip(!existsSync('public/keeptrack/index.html'), 'KeepTrack embed bundle not fetched (public/keeptrack/ missing)');
  test.skip(!existsSync('public/assets/tle-sets/starlink-2026-11/starlink-2026-11.json.gz'), 'TLE set starlink-2026-11 not present');
  test.use({ baseURL: BASE });

  test('loads, opens the World Map, pins a member and completes the first objective', async ({ page, missionControlPage }) => {
    test.setTimeout(240000);
    await page.goto('/campaigns/range-watch/scenarios/starlink-interference');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();

    await missionControlPage.openChecklist();
    await missionControlPage.selectTab('ground-track');
    await expect(page.locator('#kt-embed-host')).toBeVisible({ timeout: 60000 });
    await waitForObjectiveComplete(missionControlPage, 'Open the World Map');

    // Pin the first member of the real set; the registry is the same one the asset tree pins through.
    const pinned = await page.evaluate(() => {
      const sm = (
        window as unknown as {
          signalRange: { simulationManager: { registry: { memberNoradIds(): Int32Array; pin(n: number): boolean; pinnedCount: number; memberCount: number } } };
        }
      ).signalRange.simulationManager;
      const ok = sm.registry.pin(sm.registry.memberNoradIds()[0]);

      return { ok, count: sm.registry.pinnedCount, members: sm.registry.memberCount };
    });

    expect(pinned.ok).toBe(true);
    expect(pinned.count).toBe(1);
    expect(pinned.members).toBeGreaterThan(10000);
    await waitForObjectiveComplete(missionControlPage, 'Pin a Starlink');
  });
});
