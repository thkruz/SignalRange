// Docs screenshot capture. Run with `pnpm docs:shots` (shot list: shots.mjs).
//   pnpm docs:shots                         all shots
//   pnpm docs:shots -- --only mc-rx,eq-     shots whose id starts with one of the prefixes
//   pnpm docs:shots -- --base http://localhost:3000   use an already running server
// Without --base it starts an isolated dev server (rspack.isolated.config.mts, port 3011) and stops it at the end.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { OUT_DIR, TARGETS, VIEWPORT, shots } from './shots.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);

  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt('only')?.split(',');
const PORT = Number(process.env.SR_DEV_PORT) || 3011;
let base = opt('base');
let server;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  server = spawn(cmd, ['cross-env', 'NODE_ENV=development', 'rspack', 'serve', '--mode', 'development', '-c', 'scripts/docs-shots/rspack.isolated.config.mts'], {
    cwd: repo,
    env: { ...process.env, SR_DEV_PORT: String(PORT) },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';

  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    if (/compiled/u.test(log)) { return; }
    if (/EADDRINUSE/u.test(log)) { throw new Error(`port ${PORT} is in use; set SR_DEV_PORT or free it`); }
    await sleep(2000);
  }
  throw new Error(`dev server did not compile in time:\n${log.slice(-800)}`);
}

function stopServer() {
  if (!server?.pid) { return; }
  try {
    if (process.platform === 'win32') { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } else { server.kill('SIGTERM'); }
  } catch { /* already gone */ }
}

function commit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim(); } catch { return 'unknown'; }
}

async function dismissOpening(page) {
  await page.waitForSelector('#app-shell-page', { timeout: 90000 });
  await page.waitForFunction(() => !!document.querySelector('.scene-modal[open]') || document.querySelector('#app-shell-page')?.inert === false, null, { timeout: 60000 });
  const opening = page.locator('.scene-modal[open]');

  if (await opening.isVisible()) {
    await opening.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.scene-modal[open]'), null, { timeout: 15000 });
  }
  await page.waitForSelector('[data-asset-id]', { timeout: 60000 });
}

const domClick = (page, sel) => page.locator(sel).first().evaluate((el) => el.click());

const MACROS = {
  // nats-eu scenario 1: open the brief, close it, answer the first quiz so the clock runs.
  async startScenario1(page) {
    await page.getByText('Mission Brief', { exact: true }).first().evaluate((el) => el.click());
    await page.waitForTimeout(1500);
    await domClick(page, '#draggable-html-box-mission-brief-close');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Open Quiz' }).first().evaluate((el) => el.click()).catch(() => {});
    const opt = page.locator('.quiz-option-btn', { hasText: 'Starting the pre-pass sweep' });

    await opt.waitFor({ timeout: 10000 });
    await opt.click();
    await page.locator('#quiz-continue-btn').click();
    await page.waitForTimeout(2000);
    // Visiting the station tabs lets the pending sweep objectives settle; the Skip control then enables.
    await selectAsset(page, 'GW-01');
    await selectTab(page, 'dashboard');
    await selectTab(page, 'rx-analysis');
    await page.waitForFunction(() => !(document.querySelector('#time-skip-control')?.disabled ?? true), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
  },
  // ACU Program Track onto a satellite (the pedestal then slews as the clock advances).
  async trackSat(page, norad) {
    await domClick(page, '.btn-tracking[data-mode="program-track"]');
    await page.waitForTimeout(300);
    await page.locator('select[id$="satellite-select"]').first().selectOption({ value: String(norad) });
    await page.waitForTimeout(200);
    if (await page.locator('button[id$="move-to-target-btn"]').first().isEnabled()) { await domClick(page, 'button[id$="move-to-target-btn"]'); }
  },
};

async function runStep(page, step) {
  if (step.click) { await page.locator(step.click).first().click({ timeout: 8000 }); }
  else if (step.domClick) { await domClick(page, step.domClick); }
  else if (step.select) { await page.locator(step.select).first().selectOption(step.value); }
  else if (step.fill) { await page.locator(step.fill).first().fill(String(step.value)); await page.locator(step.fill).first().dispatchEvent('change'); }
  else if (step.hover) { await page.locator(step.hover).first().hover(); }
  else if (step.eval) { await page.evaluate(step.eval); }
  else if (step.tab) { await selectTab(page, step.tab); }
  else if (step.asset) { await selectAsset(page, step.asset); }
  else if (step.advSteps) {
    // [totalMs, stepMs]: advance in slices so the pedestal and receiver keep up
    const [total, slice] = step.advSteps;

    for (let done = 0; done < total; done += slice) { await page.evaluate((ms) => window.advanceClock(ms), Math.min(slice, total - done)); await page.waitForTimeout(450); }
  }
  else if (step.advance) { await page.evaluate((ms) => window.advanceClock(ms), step.advance); }
  else if (step.waitFor) { await page.waitForSelector(step.waitFor, { timeout: step.timeout ?? 15000 }); }
  else if (step.macro) { await MACROS[step.macro](page, ...(step.args ?? [])); }
  else if (step.wait) { await page.waitForTimeout(step.wait); }
  else { throw new Error(`unknown step ${JSON.stringify(step)}`); }
}

async function selectAsset(page, id) {
  await page.locator(`#asset-tree-sidebar-container [data-asset-id="${id}"]`).first().evaluate((el) => el.click());
  await page.waitForTimeout(1200);
}

async function selectTab(page, tab) {
  const sel = `#tab-bar .nav-link[data-tab-id="${tab}"]`;

  await page.waitForSelector(sel, { state: 'attached', timeout: 10000 });
  await domClick(page, sel);
  await page.waitForTimeout(1500);
}

const manifest = [];
const failures = [];

async function capture(browser, targetKey, group) {
  const target = TARGETS[targetKey];
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();

  await page.addInitScript(() => {
    window.AUTO_CLOSE_DIALOGS = true;
    localStorage.clear();
    sessionStorage.clear();
  });
  try {
    await page.goto(base + target.path + (target.query ?? ''), { waitUntil: 'domcontentloaded' });
    await dismissOpening(page);
    await page.waitForTimeout(2000);
    if (target.asset) { await selectAsset(page, target.asset); }
    for (const step of target.setup ?? []) { await runStep(page, step); }
  } catch (e) {
    for (const s of group) { failures.push({ id: s.id, reason: `target ${targetKey} failed to load: ${String(e).split('\n')[0].slice(0, 160)}` }); }
    await ctx.close();

    return;
  }
  for (const s of group) {
    try {
      if (s.asset) { await selectAsset(page, s.asset); }
      if (s.tab) { await selectTab(page, s.tab); }
      for (const step of s.setup ?? []) { await runStep(page, step); }
      await page.waitForTimeout(s.settle ?? 1500);
      const root = s.selector ? page.locator(s.selector).first() : page;

      if (s.selector) {
        // A sticky tab bar would overlap an element crop; make sticky elements static first.
        await page.evaluate(() => document.querySelectorAll('#tabbed-canvas-container *').forEach((el) => { if (getComputedStyle(el).position === 'sticky') { el.style.position = 'static'; } }));
        await root.waitFor({ state: 'visible', timeout: 8000 });
      }
      // Clicks leave a :focus-visible ring (2px white outline) on the last control; it reads
      // as a highlight in docs. Drop focus and hide focus rings before every capture.
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) { document.activeElement.blur(); } });
      await page.mouse.move(0, 0);
      const shotStyle = '*:focus, *:focus-visible, *:focus-within { outline: none !important; }';
      let png;

      if (s.union) {
        // Union of several elements (e.g. two side-by-side cards): clip to their joint bounding box.
        const boxes = [];

        for (const sel of s.union) {
          const el = page.locator(sel).first();

          await el.waitFor({ state: 'visible', timeout: 8000 });
          await el.scrollIntoViewIfNeeded();
          boxes.push(await el.boundingBox());
        }
        const x = Math.min(...boxes.map((b) => b.x));
        const y = Math.min(...boxes.map((b) => b.y));
        const clip = { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };

        png = await page.screenshot({ animations: 'disabled', style: shotStyle, clip, fullPage: true });
      } else if (s.expand && s.selector) {
        // Full-width band around the element: `expand` adds px above and below so the crop shows surrounding UI.
        const box = await root.boundingBox();
        const y = Math.max(0, box.y - (s.expand.top ?? 0));
        const clip = { x: 0, y, width: VIEWPORT.width, height: Math.min(VIEWPORT.height - y, box.y + box.height + (s.expand.bottom ?? 0) - y) };

        png = await page.screenshot({ animations: 'disabled', style: shotStyle, clip });
      } else {
        png = await root.screenshot({ animations: 'disabled', style: shotStyle });
      }
      const dir = path.join(OUT_DIR, s.group);

      fs.mkdirSync(dir, { recursive: true });
      const file = `${s.slug}${s.variant ? `-${s.variant}` : ''}.webp`;
      const info = await sharp(png).webp({ quality: 82 }).toFile(path.join(dir, file));

      manifest.push({ id: s.id, path: `images/shots/${s.group}/${file}`, slug: `${s.group}/${s.slug}`, alt: s.alt, width: info.width, height: info.height, bytes: info.size, scenario: target.path, appCommit: commit() });
      console.log(`ok   ${s.id} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}k`);
    } catch (e) {
      failures.push({ id: s.id, reason: String(e).split('\n')[0].slice(0, 200) });
      console.log(`FAIL ${s.id} ${String(e).split('\n')[0].slice(0, 120)}`);
    }
  }
  await ctx.close();
}

try {
  if (!base) { await startServer(); base = `http://localhost:${PORT}`; }
  const browser = await chromium.launch();
  const wanted = shots.filter((s) => !only || only.some((p) => s.id.startsWith(p)));
  const byTarget = new Map();

  for (const s of wanted) { byTarget.set(s.target, [...(byTarget.get(s.target) ?? []), s]); }
  for (const [key, group] of byTarget) { await capture(browser, key, group); }
  await browser.close();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const mpath = path.join(OUT_DIR, 'manifest.json');
  const prev = only && fs.existsSync(mpath) ? JSON.parse(fs.readFileSync(mpath, 'utf8')).shots.filter((m) => !manifest.some((n) => n.id === m.id) && !failures.some((f) => f.id === m.id)) : [];

  fs.writeFileSync(mpath, `${JSON.stringify({ appCommit: commit(), viewport: VIEWPORT, shots: [...prev, ...manifest].sort((a, b) => a.id.localeCompare(b.id)) }, null, 2)}\n`);
  fs.writeFileSync(path.join(here, 'last-failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
  console.log(`done: ${manifest.length} captured, ${failures.length} failed`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  stopServer();
}
