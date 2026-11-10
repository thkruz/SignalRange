// Dev helper: list asset ids and tab ids of a scenario URL path (server must be running on SR_DEV_PORT).
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { window.AUTO_CLOSE_DIALOGS = true; localStorage.clear(); sessionStorage.clear(); });
await page.goto(`http://localhost:${process.env.SR_DEV_PORT || 3011}${process.argv[2]}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#app-shell-page', { timeout: 60000 });
await page.waitForFunction(() => !!document.querySelector('.scene-modal[open]') || document.querySelector('#app-shell-page')?.inert === false);
const op = page.locator('.scene-modal[open]');
if (await op.isVisible()) await op.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForTimeout(3000);
const assets = await page.$$eval('[data-asset-id]', (els) => els.map((e) => e.getAttribute('data-asset-id')));
console.log(JSON.stringify(assets));
for (const id of assets.slice(0, 3)) {
  await page.locator(`#asset-tree-sidebar-container [data-asset-id="${id}"]`).first().evaluate((e) => e.click());
  await page.waitForTimeout(1500);
  console.log(id, JSON.stringify(await page.$$eval('#tab-bar .nav-link', (els) => els.map((e) => e.dataset.tabId))));
}
await b.close();
