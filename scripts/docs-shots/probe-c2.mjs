// Ad-hoc probe: node probe-c2.mjs <path> <out.png> [js-steps-file]
// steps file exports default async (page, h) => {...}; h has domClick, tab, asset, adv.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [, , urlPath, out, stepsFile] = process.argv;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
await page.addInitScript(() => { window.AUTO_CLOSE_DIALOGS = true; localStorage.clear(); sessionStorage.clear(); });
await page.goto(`http://localhost:3011${urlPath}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#app-shell-page', { timeout: 90000 });
await page.waitForFunction(() => !!document.querySelector('.scene-modal[open]') || document.querySelector('#app-shell-page')?.inert === false, null, { timeout: 60000 });
const op = page.locator('.scene-modal[open]');
if (await op.isVisible()) { await op.getByRole('button', { name: 'Start', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('.scene-modal[open]')); }
await page.waitForSelector('[data-asset-id]', { timeout: 60000 });
await page.waitForTimeout(2000);
const h = {
  domClick: (s) => page.locator(s).first().evaluate((e) => e.click()),
  tab: async (t) => { await page.locator(`#tab-bar .nav-link[data-tab-id="${t}"]`).first().evaluate((e) => e.click()); await page.waitForTimeout(1500); },
  asset: async (a) => { await page.locator(`#asset-tree-sidebar-container [data-asset-id="${a}"]`).first().evaluate((e) => e.click()); await page.waitForTimeout(1200); },
  adv: (ms) => page.evaluate((m) => window.advanceClock(m), ms),
  txt: (s) => page.locator(s).first().innerText().catch((e) => 'ERR ' + String(e).slice(0, 80)),
};
if (stepsFile) { await (await import(pathToFileURL(path.resolve(stepsFile)).href)).default(page, h); }
await page.evaluate(() => document.activeElement?.blur?.());
await page.screenshot({ path: out, animations: 'disabled', style: '*:focus,*:focus-visible{outline:none!important}' });
await b.close();
