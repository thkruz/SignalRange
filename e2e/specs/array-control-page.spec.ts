import { existsSync } from 'node:fs';
import { expect, test } from '../fixtures/test-fixtures';
import { waitForSimulationReady } from '../utils/simulation-helpers';

// The embed licence is domain-locked: 127.0.0.1 is not licensed, localhost is.
const BASE = process.env.SR_E2E_BASE ?? 'http://localhost:3000';
const URL_PATH = '/campaigns/range-watch/scenarios/starlink-interference';

type ArrayHook = {
  model: { target: { norad: number } | null; mode: string; geoArc: { enabled: boolean }; visible: unknown[] } | null;
  plottedDotCounts: Record<string, number>;
  drawStats: { draws: number; lastMs: number; maxMs: number; totalMs: number; dots: number };
  dotClientPos(norad: number): { x: number; y: number } | null;
};
type W = { __arrayControl?: ArrayHook; advanceClock(ms: number): void; __longTasks?: number[] };

test.describe('Array Control page (phased array on Range Watch Starlink)', () => {
  test.skip(!existsSync('public/keeptrack/index.html'), 'KeepTrack embed bundle not fetched (public/keeptrack/ missing)');
  test.skip(!existsSync('public/assets/tle-sets/starlink-2026-11/starlink-2026-11.json.gz'), 'TLE set starlink-2026-11 not present');
  test.use({ baseURL: BASE });

  test('shows the Starlink sky, hands over, locks manually, toggles the GEO zone', async ({ page, missionControlPage }) => {
    test.setTimeout(240000);
    await page.addInitScript(() => {
      (window as unknown as W).__longTasks = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) (window as unknown as W).__longTasks!.push(e.duration);
        }).observe({ entryTypes: ['longtask'] });
      } catch {
        // longtask not supported
      }
    });
    await page.goto(URL_PATH);
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();
    await missionControlPage.selectGroundStation('CM-01');
    await missionControlPage.selectTab('acu-control');

    const tab = page.locator('.array-control-tab');

    await expect(tab).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.acu-control-tab')).toHaveCount(0);
    await expect(tab.locator('[id$="mode-auto"]')).toHaveClass(/active/u);

    // Blue dots and a green target
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__arrayControl?.plottedDotCounts.known ?? 0), { timeout: 30000 }).toBeGreaterThanOrEqual(10);
    const counts = await page.evaluate(() => (window as unknown as W).__arrayControl!.plottedDotCounts);

    expect(counts.target).toBe(1);

    // Steady-state window at 1x: long tasks and redraw cost with the page open
    await page.evaluate(() => {
      (window as unknown as W).__longTasks!.length = 0;
    });
    await page.waitForTimeout(15000);
    const steady = await page.evaluate(() => {
      const s = (window as unknown as W).__arrayControl!.drawStats;

      return { draws: s.draws, meanMs: s.totalMs / Math.max(1, s.draws), maxMs: s.maxMs, dots: s.dots, longTasks: [...((window as unknown as W).__longTasks ?? [])] };
    });

    console.log('PA-WP4 steady 15s', JSON.stringify(steady));

    // Handover: the target NORAD changes within a few minutes of sim time
    const targetNorad = (): Promise<number | null> => page.evaluate(() => (window as unknown as W).__arrayControl?.model?.target?.norad ?? null);
    const first = await targetNorad();

    expect(first).not.toBeNull();
    let changed = false;

    for (let i = 0; i < 20 && !changed; i++) {
      await page.evaluate(() => (window as unknown as W).advanceClock(30_000));
      await page.waitForTimeout(1500);
      const now = await targetNorad();

      changed = now !== null && now !== first;
    }
    expect(changed, 'target changed after handover').toBe(true);

    // Manual lock by clicking a plotted dot that is not the target
    const pick = await page.evaluate(() => {
      const hook = (window as unknown as W).__arrayControl!;
      const m = hook.model as unknown as { target: { norad: number } | null; visible: { norad: number; inScan: boolean; inExclusion: boolean }[] };
      const v = m.visible.find((s) => s.inScan && !s.inExclusion && s.norad !== m.target?.norad);

      return v ? { norad: v.norad, pos: hook.dotClientPos(v.norad) } : null;
    });

    expect(pick?.pos).toBeTruthy();
    await page.mouse.click(pick!.pos!.x, pick!.pos!.y);
    await expect(tab.locator('[id$="mode-manual"]')).toHaveClass(/active/u);
    await expect.poll(targetNorad).toBe(pick!.norad);

    // GEO zone toggle
    const geo = tab.locator('[id$="geo-switch"]');

    await expect(geo).toBeChecked();
    await geo.uncheck();
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__arrayControl!.model!.geoArc.enabled)).toBe(false);
    await geo.check();
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__arrayControl!.model!.geoArc.enabled)).toBe(true);

    // Redraw cost with the real set
    const perf = await page.evaluate(() => {
      const s = (window as unknown as W).__arrayControl!.drawStats;

      return { draws: s.draws, meanMs: s.totalMs / Math.max(1, s.draws), maxMs: s.maxMs, dots: s.dots, longTasks: (window as unknown as W).__longTasks ?? [] };
    });

    console.log('PA-WP4 perf', JSON.stringify(perf));
    expect(perf.dots).toBeGreaterThan(0);
  });
});
