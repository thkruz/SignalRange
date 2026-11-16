/**
 * P3-WP10 ground-track check: pin 10 members with the embed open and report embed console warnings.
 * Run: PERF_BASE=http://localhost:3500 PERF_SETS=real pnpm exec playwright test -c e2e/perf/playwright.perf.config.ts p3wp10-tracks
 */
import { chromium, test } from '@playwright/test';

const BASE = process.env.PERF_BASE ?? 'http://localhost:3500';
const SETS = process.env.PERF_SETS ?? 'real';

test('pin 10 members, tracks drawn', async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(() => {
    (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
  });
  const page = await ctx.newPage();
  const logs: string[] = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'warning' || m.type() === 'error' || t.includes('WP10')) logs.push(`${m.type()}: ${t.slice(0, 300)}`);
  });
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
  const before = logs.length;
  const pinned = await page.evaluate(() => window.__srPerf?.pinQuiet(10, 60));
  await page.waitForTimeout(6000);
  console.log('pinned', pinned, 'logs before pin', before);
  console.log('AFTERPIN', JSON.stringify(logs.slice(before).filter((l) => !l.includes('Analyst Satellite'))));
  console.log('REFUSED', JSON.stringify(logs.filter((l) => l.includes('refused'))));
  const frame = page.frames().find((f) => f !== page.mainFrame());
  console.log('frame', !!frame);
  await page.screenshot({ path: process.env.WP10_SHOT ?? 'perf-results/p3wp10-tracks.png' });
  await browser.close();
});
