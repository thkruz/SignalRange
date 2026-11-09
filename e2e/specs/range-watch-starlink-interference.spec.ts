import { existsSync } from 'node:fs';
import { expect, test } from '../fixtures/test-fixtures';
import { advanceMissionClockToUtc, waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
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

  test('files an interference report for a real in-line event and rejects a wrong NORAD', async ({ page, missionControlPage }) => {
    test.setTimeout(150000);
    await page.goto('/campaigns/range-watch/scenarios/starlink-interference');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();
    await missionControlPage.openChecklist();
    await missionControlPage.selectTab('ground-track');
    await expect(page.locator('#kt-embed-host')).toBeVisible({ timeout: 60000 });

    // Pin a member so the report objective opens
    await page.evaluate(() => {
      const sm = (window as unknown as { signalRange: { simulationManager: { registry: { memberNoradIds(): Int32Array; pin(n: number): boolean } } } }).signalRange
        .simulationManager;

      sm.registry.pin(sm.registry.memberNoradIds()[0]);
    });
    await waitForObjectiveComplete(missionControlPage, 'Pin a Starlink');

    // Read the sim state through the test hook: first look at the Starlinks known to cross early
    // (found by the authoring script), then scan the whole set if that set has been refreshed.
    const event = await page.evaluate(() => {
      type Hook = { findInLineEvents(n: number[] | null, from: number, to: number, step?: number, max?: number): Array<{ norad: number; atMs: number }> };
      const w = window as unknown as { __rangeWatch: Hook; simClockMs(): number };
      const t0 = w.simClockMs();
      const known = [64244, 56496, 54868, 59397, 59380, 59470, 61519, 100024];
      const hits = w.__rangeWatch.findInLineEvents(known, t0, t0 + 60 * 60_000);

      return hits[0] ?? w.__rangeWatch.findInLineEvents(null, t0, t0 + 20 * 60_000, 6000, 1)[0] ?? null;
    });

    expect(event, 'a Starlink crosses the GEO link within the first hour').not.toBeNull();
    const hhmmss = (ms: number): string => new Date(ms).toISOString().slice(11, 19);

    await advanceMissionClockToUtc(page, new Date(event!.atMs + 90_000).toISOString());

    const form = page.locator('.condition-form-btn[data-report-form="starlink-interference-report"]');

    await form.click();
    const dialog = page.locator('form[data-report-form="starlink-interference-report"]');

    const file = async (norad: number, start: number, end: number): Promise<string> => {
      await dialog.locator('input[data-field="norad"]').fill(String(norad));
      await dialog.locator('input[data-field="start"]').fill(hhmmss(start));
      await dialog.locator('input[data-field="end"]').fill(hhmmss(end));
      await dialog.locator('input[data-field="drop"]').fill('1.5');
      await dialog.locator('[data-report-submit]').click();

      return (await dialog.locator('[data-report-result]').textContent()) ?? '';
    };

    // A wide window and a wrong NORAD are refused
    expect(await file(event!.norad, event!.atMs - 30 * 60_000, event!.atMs + 60_000)).toContain('longer than 10 minutes');
    expect(await file(1, event!.atMs - 60_000, event!.atMs + 60_000)).toContain('not');

    expect(await file(event!.norad, event!.atMs - 60_000, event!.atMs + 60_000)).toContain('Report accepted');
    await waitForObjectiveComplete(missionControlPage, 'File an Interference Report');
  });
});
