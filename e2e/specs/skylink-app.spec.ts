import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test-fixtures';

// Campaign 6 registers only on a local host name; localhost matches the other specs (the embed licence).
const BASE = process.env.SR_E2E_BASE ?? 'http://localhost:3000';
// Exercise 10 (forward post, SkyLink only): the sandbox variants author no service model, so the speed test and throughput do not work there.
const URL_PATH = '/campaigns/frontline/scenarios/frontline-scenario10';
const SHOTS = 'art-review/phase-40/screens';
const SCREENS = ['home', 'obstructions', 'statistics', 'speed-test', 'settings', 'advanced'] as const;

type W = { advanceClock(ms: number): void };

const screen = (page: Page) => page.locator('#skylink-screen > :not([hidden])');

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Skip the sim clock forward in steps so the plant and the app both tick between jumps */
async function advance(page: Page, seconds: number, stepS = 30): Promise<void> {
  for (let done = 0; done < seconds; done += stepS) {
    await page.evaluate((ms) => (window as unknown as W).advanceClock(ms), stepS * 1000);
    await page.waitForTimeout(150);
  }
}

async function openScreen(page: Page, id: (typeof SCREENS)[number]): Promise<void> {
  await page.locator(`[data-screen="${id}"]`).evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator(`[data-screen="${id}"]`)).toHaveClass(/active/u);
}

/** Scenario dialogs (briefing, notices) overlay the page; close any that are up */
async function dismissDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const overlay = page.locator('.dialog-overlay.dialog-visible');

    if (!(await overlay.count())) {
      return;
    }
    // Briefing dialogs advance on Space
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
  }
}

async function openTab(page: Page, tabId: string): Promise<void> {
  await dismissDialogs(page);
  if (tabId.startsWith('station-')) {
    // The trainer panel floats over the app; close it so it neither hides the screens nor shows up in the shots
    await page.locator('.draggable-box:has(.pp-trainer) .draggable-box__close-btn').evaluateAll((els) => els.forEach((el) => (el as HTMLElement).click()));
  }
  await page.locator(`#tab-bar .nav-link[data-tab-id="${tabId}"]`).evaluate((el) => (el as HTMLElement).click());
}

async function openTrainer(page: Page): Promise<void> {
  await openTab(page, 'site');
  await page.locator('#site-open-trainer').evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator('.pp-trainer')).toBeVisible();
}

/** The loading screen and scenario dialogs can cover the page; flip the checkbox through the DOM */
async function setEngineering(page: Page, on: boolean): Promise<void> {
  await page.locator('#pt-eng-tabs').evaluate((el, v) => {
    (el as HTMLInputElement).checked = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, on);
}

async function resetPlant(page: Page): Promise<void> {
  await openTrainer(page);
  await page.locator('#pt-reset').evaluate((el) => (el as HTMLElement).click());
  await openTab(page, 'station-skylink-app');
}

async function inject(page: Page, kind: string, target?: string): Promise<void> {
  await openTrainer(page);
  await page.locator('#pt-kind').selectOption(kind);
  if (target) {
    await page.locator('#pt-target').selectOption(target);
  }
  await page.locator('#pt-inject').evaluate((el) => (el as HTMLElement).click());
  await openTab(page, 'station-skylink-app');
}

test.describe('SkyLink app at the Frontline field station (real browser)', () => {
  test.use({ baseURL: BASE });
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  const consoleErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150000);
    mkdirSync(SHOTS, { recursive: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', (m) => {
      if (m.type() === 'error') {
        consoleErrors.push(m.text());
      }
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    await page.goto(BASE + URL_PATH);
    await expect(page.locator('#app-shell-page')).toBeVisible({ timeout: 20000 });
    const opening = page.locator('.scene-modal[open]');

    if (await opening.isVisible({ timeout: 3000 }).catch(() => false)) {
      await opening.getByRole('button', { name: 'Start', exact: true }).click();
    }
    // The clock re-renders the tree, so a plain click never sees a stable element; click through the DOM.
    const station = page.getByRole('heading', { name: 'Rautala Forward Post' }).first();

    await expect(page.locator('.mission-loading-screen')).toHaveCount(0, { timeout: 30000 });
    await dismissDialogs(page);
    await station.evaluate((el) => ((el.closest('[data-asset-id], .card') as HTMLElement | null) ?? (el as HTMLElement)).click(), undefined, { timeout: 20000 });
    await expect(page.locator('#skylink-screen')).toBeAttached({ timeout: 20000 });
    await dismissDialogs(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('tab bar is Site + SkyLink, SkyLink is the default, trainer toggles engineering tabs', async () => {
    const tabs = page.locator('#tab-bar .nav-link');

    await expect(tabs).toHaveText(['Site', 'SkyLink']);
    await expect(page.locator('#tab-bar .nav-link.active')).toHaveText('SkyLink');

    await openTrainer(page);
    await setEngineering(page, true);
    await expect.poll(async () => tabs.count()).toBeGreaterThan(2);
    const engineering = await tabs.allTextContents();

    // Finding: the unlocked set is the full engineering set; the SkyLink tab is not part of it (field mode only).
    expect(engineering.map((t) => t.trim())).toEqual(expect.arrayContaining(['ACU Control', 'RX Analysis', 'TX Chain', 'Site']));
    await setEngineering(page, false);
    await expect(tabs).toHaveText(['Site', 'SkyLink']);
    await openTab(page, 'station-skylink-app');
  });

  test('each of the six screens renders real content', async () => {
    const expectations: Record<(typeof SCREENS)[number], RegExp> = {
      home: /Download[\s\S]*Upload[\s\S]*Latency[\s\S]*Alerts/u,
      obstructions: /Obstruction/u,
      statistics: /Outage/iu,
      'speed-test': /Start speed test/u,
      settings: /Restart[\s\S]*Snow melt/iu,
      advanced: /Software version[\s\S]*Boot count[\s\S]*GNSS satellites/u,
    };

    await advance(page, 120);
    for (const id of SCREENS) {
      await openScreen(page, id);
      await expect(screen(page)).toHaveText(expectations[id]);
      expect((await screen(page).innerText()).trim().length).toBeGreaterThan(40);
      await shot(page, `screen-${id}`);
    }
    await openScreen(page, 'home');
    await expect(page.locator('#home-hero')).toHaveText('Online', { timeout: 30000 });
    expect(consoleErrors).toEqual([]);
  });

  test('speed test runs and shows a result', async () => {
    await openScreen(page, 'speed-test');
    await expect(page.locator('#speed-start')).toBeEnabled();
    await page.locator('#speed-start').evaluate((el) => (el as HTMLElement).click());
    await shot(page, 'speed-test-running');
    for (let i = 0; i < 12 && !(await page.locator('#speed-down').count()); i++) {
      await advance(page, 10, 5);
    }
    await expect(page.locator('#speed-down')).toContainText('Mbps', { timeout: 15000 });
    await expect(page.locator('#speed-up')).toContainText('Mbps');
    await expect(page.locator('#speed-lat')).toContainText('ms');
    await expect(page.locator('#speed-limit')).toHaveText(/SkyLink|Local network/u);
    await shot(page, 'speed-test-result');
  });

  test('GNSS denied: Searching, location not valid, 0 satellites, reboot does not help', async () => {
    await resetPlant(page);
    await inject(page, 'gnss-denied');
    await advance(page, 120);
    await openScreen(page, 'home');
    await expect(page.locator('#home-hero')).toHaveText('Searching', { timeout: 30000 });
    await shot(page, 'fault-gnss-home');

    await openScreen(page, 'advanced');
    await expect(screen(page)).toContainText('Not valid');
    await expect(screen(page)).toContainText(/GNSS satellites\s*0(?!\d)/u);
    await shot(page, 'fault-gnss-advanced');

    await openScreen(page, 'settings');
    await page.locator('#set-reboot').evaluate((el) => (el as HTMLElement).click());
    await page.locator('#skylink-confirm-yes').evaluate((el) => (el as HTMLElement).click());
    await advance(page, 300);
    await openScreen(page, 'home');
    await expect(page.locator('#home-hero')).toHaveText('Searching');
    await openScreen(page, 'advanced');
    await expect(screen(page)).toContainText('Not valid');
    await shot(page, 'fault-gnss-after-reboot');
  });

  test('router power off shows the no-router state', async () => {
    await resetPlant(page);
    await advance(page, 120);
    await inject(page, 'brick-dead', 'skylink-router');
    await advance(page, 60);
    await expect(page.locator('#skylink-blocked')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#skylink-blocked')).toContainText('Cannot connect');
    await shot(page, 'fault-no-router');
  });

  test('snow on the dish shows Heating with snow melt automatic', async () => {
    await resetPlant(page);
    await advance(page, 180);
    await inject(page, 'snow', 'skylink-dish');
    await advance(page, 30, 10);
    await openScreen(page, 'home');
    await expect(page.locator('#home-alerts')).toContainText('Heating', { timeout: 30000 });
    await shot(page, 'fault-snow-home');
    await openScreen(page, 'settings');
    await expect(screen(page)).toContainText(/Automatic/iu);
    await shot(page, 'fault-snow-settings');
  });

  test('no console errors across the whole run', () => {
    expect(consoleErrors).toEqual([]);
  });
});
