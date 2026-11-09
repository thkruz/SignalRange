/**
 * P3-WP10 picker check: open time, search latency and DOM node count of the ACU target picker and the mission overview cards.
 * Run: PERF_BASE=http://localhost:3500 PERF_SETS=real pnpm exec playwright test -c e2e/perf/playwright.perf.config.ts p3wp10-picker
 */
import { chromium, test } from '@playwright/test';

const BASE = process.env.PERF_BASE ?? 'http://localhost:3500';
const SETS = process.env.PERF_SETS ?? 'real';

test('picker open, search, nodes', async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(() => {
    (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/campaigns/perf/scenarios/perf-constellation?perfN=1000&perfProp=1&perfSets=${SETS}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#app-shell-page').waitFor({ state: 'visible', timeout: 240000 });
  const opening = page.locator('.scene-modal[open]');
  if (await opening.isVisible().catch(() => false)) {
    await opening.getByRole('button', { name: 'Start', exact: true }).click();
    await opening.waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
  }
  await page.locator('#tab-bar').waitFor({ state: 'visible', timeout: 240000 });
  await page.waitForTimeout(3000);
  await page.locator('#tab-bar .nav-link[data-tab-id="ground-track"]').click();
  await page.locator('#kt-embed-host').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForTimeout(8000);
  const ids = await page.locator('#tab-bar .nav-link').evaluateAll((els) => els.map((e) => e.getAttribute('data-tab-id')));
  console.log('TABS', JSON.stringify(ids));
  const out: Record<string, unknown> = {};
  for (const id of ids.filter((t) => t === 'mission-overview' || t === 'dashboard' || t === 'acu-control-0' || t === 'sdr-console')) {
    const t0 = Date.now();
    await page.locator(`#tab-bar .nav-link[data-tab-id="${id}"]`).click();
    const search = page.locator('.sr-picker-search').first();
    const hasSearch = await search.waitFor({ state: 'visible', timeout: 8000 }).then(
      () => true,
      () => false
    );
    const openMs = Date.now() - t0;
    const nodes = await page.evaluate(() => document.querySelectorAll('*').length);
    const opts = await page.evaluate(() => document.querySelectorAll('select option').length);
    let searchMs: number | null = null;
    let results: number | null = null;
    if (hasSearch) {
      const t1 = await page.evaluate(() => performance.now());
      await search.fill('STARLINK-10');
      await page.waitForFunction(() => document.querySelectorAll('select option').length > 0);
      searchMs = (await page.evaluate(() => performance.now())) - t1;
      results = await page.evaluate(() => Math.max(...[...document.querySelectorAll('select')].map((s) => s.options.length)));
    }
    out[id as string] = { openMs, hasSearch, nodes, options: opts, searchMs, resultOptions: results };
  }
  console.log('PICKER', JSON.stringify(out));
  await browser.close();
});
