import { chromium } from '@playwright/test';
const [t, asset, ...tabs] = process.argv.slice(2);
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { window.AUTO_CLOSE_DIALOGS = true; localStorage.clear(); sessionStorage.clear(); });
await page.goto('http://127.0.0.1:3011' + t, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#app-shell-page', { timeout: 60000 });
await page.waitForFunction(() => !!document.querySelector('.scene-modal[open]') || document.querySelector('#app-shell-page')?.inert === false);
const op = page.locator('.scene-modal[open]');
if (await op.isVisible()) await op.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForTimeout(3000);
await page.locator(`[data-asset-id="${asset}"]`).first().evaluate((e) => e.click());
await page.waitForTimeout(1000);
for (const tab of tabs) {
  await page.locator(`#tab-bar .nav-link[data-tab-id="${tab}"]`).evaluate((e) => e.click());
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const c = document.querySelector('#tabbed-canvas-container');
    const ids = [...c.querySelectorAll('[id]')].map((e) => e.id).filter((i) => !/^(sa-|btn)/.test(i)).slice(0, 50);
    const heads = [...c.querySelectorAll('.card-header, .card-title, h1,h2,h3,h4,h5')].map((e) => (e.className.split(' ')[0] + ':' + e.textContent.trim().slice(0, 40))).slice(0, 30);
    return { ids, heads };
  });
  console.log('##', tab, JSON.stringify(info));
}
await b.close();
