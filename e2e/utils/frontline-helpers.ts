import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * UI drivers for Campaign 6 "Frontline Signals" (campaign id `frontline`).
 *
 * Each helper replaces one service call from the scenario's completion test
 * (test/campaigns/frontline-sNN-completion.test.ts, the `acts` map) with what a
 * player does in the Site tab:
 *
 *   svc.plant.inspect(id)                  -> plantInspect(page, id)
 *   svc.plant.<verb>(id) (wiggle, feel...) -> plantVerb(page, verb, id)
 *   services.takeSample(svc, layer, via)   -> servicesTakeSample(page, svc, layer, via)
 *   workloads.start(card, svc)             -> workloadsStart(page, card, svc)
 *   workloads.waitForRun(runId)            -> workloadsWaitForRun(page, runId)
 *   records.submit(formId, input)          -> recordsSubmit(page, formId, input)
 *   (status-check quiz)                    -> answerStatusCheck(page, answerText)
 *   (objective engine)                     -> waitForObjective(page, objectiveId)
 *
 * Rules: real clicks and keys only, never `force: true`. page.evaluate is used
 * only to read state (window.__fieldStatus, window.debugObjective) and for the
 * clock dev hook window.advanceClock. Visibility is judged with
 * checkVisibility() (opacity aware), never innerText.
 */

export type ServiceLayer = 'power' | 'local' | 'registration' | 'account' | 'provider' | 'application';
export type SampleVia = 'device-indicator' | 'local-probe' | 'terminal-app' | 'pilot-report' | 'provider-portal' | 'endpoint-report' | 'workload-run';
export type PlantVerb = 'inspect' | 'wiggle' | 'feel' | 'reseat' | 'tighten' | 'seal' | 'swap' | 'powerCycle' | 'refuel' | 'setMode' | 'clearSnow' | 'removeNet' | 'reroute';

/** Set FRONTLINE_QA_PROBE=1 (run-c6.mjs --probe) to keep going past an objective that does not complete, so later helpers still get exercised. */
export const PROBE_MODE = process.env.FRONTLINE_QA_PROBE === '1';

/**
 * Where a plant id is reached in the camp Site view: the hotspot that opens its
 * close-up and the interaction point inside it. `view` is the side of the tent
 * the hotspot is on; going outside costs one of the three camp trips.
 * Add entries here when a scenario touches a new part (dump the close-up's
 * `[data-target]` points to find them).
 */
export const CAMP_PART_LOCATIONS: Record<string, { view: 'inside' | 'outside'; hotspot: string; target: string }> = {
  'power-station': { view: 'inside', hotspot: 'site-in-power-station', target: 'power-station' },
  'skylink-router': { view: 'inside', hotspot: 'site-in-router', target: 'skylink-router' },
  'router:dc': { view: 'inside', hotspot: 'site-in-router', target: 'router:dc' },
  'skylink-cable:router': { view: 'inside', hotspot: 'site-in-router', target: 'skylink-cable:router' },
  laptop: { view: 'inside', hotspot: 'site-in-laptop', target: 'laptop' },
  'power-strip': { view: 'inside', hotspot: 'site-in-power-strip', target: 'power-strip' },
  'strip:router': { view: 'inside', hotspot: 'site-in-power-strip', target: 'strip:router' },
  'strip:modem': { view: 'inside', hotspot: 'site-in-power-strip', target: 'strip:modem' },
  'strip:in': { view: 'inside', hotspot: 'site-in-power-strip', target: 'strip:in' },
  'vsat-modem': { view: 'inside', hotspot: 'site-in-vsat-modem', target: 'vsat-modem' },
  'modem:dc': { view: 'inside', hotspot: 'site-in-vsat-modem', target: 'modem:dc' },
  'vsat-ifl:modem': { view: 'inside', hotspot: 'site-in-vsat-modem', target: 'vsat-ifl:modem' },
  'skylink-dish': { view: 'outside', hotspot: 'site-out-skylink-dish', target: 'skylink-dish' },
  'skylink-cable:dish': { view: 'outside', hotspot: 'site-out-skylink-dish', target: 'skylink-cable:dish' },
  generator: { view: 'outside', hotspot: 'site-out-generator', target: 'generator' },
  'generator:out': { view: 'outside', hotspot: 'site-out-generator', target: 'generator:out' },
  'skylink-cable': { view: 'outside', hotspot: 'site-out-skylink-cable', target: 'skylink-cable' },
};

/**
 * Forward site (Rautala, S9+): ONE outdoor scene, no tent, no trips. Hotspot ids are `site-fwd-*`,
 * close-up targets are the same ids as the camp ones. EuroSat parts (vsat-*) only show once the
 * scenario puts them in the inventory (S11+). The EuroSat modem is a region of the router close-up
 * (no scene hotspot); the SkyLink and EuroSat cables are drawn as hotspots (cable + IFL).
 * openPart / goToView choose this map when the Site scene image is the forward one (isForwardSite).
 */
export const FORWARD_PART_LOCATIONS: Record<string, { hotspot: string; target: string }> = {
  generator: { hotspot: 'site-fwd-generator', target: 'generator' },
  'generator:out': { hotspot: 'site-fwd-generator', target: 'generator:out' },
  'power-station': { hotspot: 'site-fwd-power-station', target: 'power-station' },
  'ps:ac-out': { hotspot: 'site-fwd-power-station', target: 'ps:ac-out' },
  'ps:dc-out': { hotspot: 'site-fwd-power-station', target: 'ps:dc-out' },
  'ps:in': { hotspot: 'site-fwd-power-station', target: 'ps:in' },
  laptop: { hotspot: 'site-fwd-laptop', target: 'laptop' },
  'power-strip': { hotspot: 'site-fwd-power-box', target: 'power-strip' },
  'strip:router': { hotspot: 'site-fwd-power-box', target: 'strip:router' },
  'strip:modem': { hotspot: 'site-fwd-power-box', target: 'strip:modem' },
  'strip:in': { hotspot: 'site-fwd-power-box', target: 'strip:in' },
  'skylink-router': { hotspot: 'site-fwd-router', target: 'skylink-router' },
  'router:dc': { hotspot: 'site-fwd-router', target: 'router:dc' },
  'skylink-cable:router': { hotspot: 'site-fwd-router', target: 'skylink-cable:router' },
  'vsat-modem': { hotspot: 'site-fwd-router', target: 'vsat-modem' },
  'modem:dc': { hotspot: 'site-fwd-router', target: 'modem:dc' },
  'vsat-ifl:modem': { hotspot: 'site-fwd-router', target: 'vsat-ifl:modem' },
  'skylink-dish': { hotspot: 'site-fwd-skylink-dish', target: 'skylink-dish' },
  'skylink-cable:dish': { hotspot: 'site-fwd-skylink-dish', target: 'skylink-cable:dish' },
  'skylink-cable': { hotspot: 'site-fwd-skylink-cable', target: 'skylink-cable' },
  'vsat-dish': { hotspot: 'site-fwd-vsat-dish', target: 'vsat-dish' },
  'vsat-lnb': { hotspot: 'site-fwd-vsat-lnb', target: 'vsat-lnb' },
  'vsat-feed': { hotspot: 'site-fwd-vsat-lnb', target: 'vsat-feed' },
  'vsat-ifl:lnb': { hotspot: 'site-fwd-vsat-lnb', target: 'vsat-ifl:lnb' },
  'vsat-ifl': { hotspot: 'site-fwd-vsat-ifl', target: 'vsat-ifl' },
};

// ---------------------------------------------------------------------------
// Page problems: uncaught errors, console errors, failed images, placeholder art
// ---------------------------------------------------------------------------

export interface PageProblems {
  pageErrors: string[];
  consoleErrors: string[];
  failedImages: string[];
  placeholderCards: string[];
}

/** Start collecting problems the spec fails on at the end. Call before the first navigation. */
export function collectPageProblems(page: Page): PageProblems {
  const p: PageProblems = { pageErrors: [], consoleErrors: [], failedImages: [], placeholderCards: [] };
  page.on('pageerror', (e) => p.pageErrors.push(e.message.slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      p.consoleErrors.push(m.text().slice(0, 300));
    }
  });
  page.on('requestfailed', (r) => {
    if (r.resourceType() === 'image') {
      p.failedImages.push(`${r.url()} (${r.failure()?.errorText ?? 'failed'})`);
    }
  });
  page.on('response', (r) => {
    if (r.request().resourceType() === 'image' && r.status() >= 400) {
      p.failedImages.push(`${r.url()} (HTTP ${r.status()})`);
    }
    if (/\/images\/placeholder\.png/u.test(r.url())) {
      p.placeholderCards.push(page.url());
    }
  });

  return p;
}

/** Attach the collected problems to the report and fail the test if there are any */
export async function expectNoPageProblems(problems: PageProblems): Promise<void> {
  await test.info().attach('page-problems.json', { body: JSON.stringify(problems, null, 2), contentType: 'application/json' });
  const lines = [
    ...problems.pageErrors.map((e) => `pageerror: ${e}`),
    ...problems.consoleErrors.map((e) => `console.error: ${e}`),
    ...problems.failedImages.map((e) => `image failed: ${e}`),
    ...problems.placeholderCards.map((e) => `placeholder card art on ${e}`),
  ];
  expect(lines, 'page problems during the run').toEqual([]);
}

/** Record a non-fatal QA note (layout or UI gap) that the run report lists */
export function note(text: string): void {
  test.info().annotations.push({ type: 'qa-note', description: text });
}

// ---------------------------------------------------------------------------
// Reading state (allowed: read-only hooks)
// ---------------------------------------------------------------------------

export interface FieldStatus {
  services: Record<string, Array<{ layer: ServiceLayer; status: string; reason?: string; freshness: unknown }>>;
  firedEvents: string[];
  flags: Record<string, unknown>;
  workloads: Array<{ id: string; card: string; service: string; status: string; invalidatedBy: string | null; startS?: number; endS?: number | null; power?: unknown }>;
  evidenceCount: number;
}

/** window.__fieldStatus(): layers, sample freshness, events, flags, workloads */
export async function readFieldStatus(page: Page): Promise<FieldStatus> {
  return page.evaluate(() => (window as unknown as { __fieldStatus: () => FieldStatus }).__fieldStatus());
}

interface ObjectiveDebug {
  isActive: boolean;
  isCompleted: boolean;
  conditions: Array<{ type: string; isSatisfied: boolean; evaluatesNow: boolean }>;
  error?: string;
}

/** window.debugObjective(id): the objective engine's live view of one objective */
export async function readObjective(page: Page, objectiveId: string): Promise<ObjectiveDebug> {
  return page.evaluate((id) => (window as unknown as { debugObjective: (i: string) => ObjectiveDebug }).debugObjective(id), objectiveId);
}

/** Jump the sim clock through the e2e dev hook (timers burn as if the player waited) */
export async function advanceClock(page: Page, ms: number): Promise<void> {
  await page.evaluate((d) => (window as unknown as { advanceClock: (n: number) => void }).advanceClock(d), ms);
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Generic input: click an element where a player could, else use the keyboard
// ---------------------------------------------------------------------------

/**
 * Click `el` at a point where it is the top element (SVG hotspots overlap their
 * neighbours, so the bounding-box centre can belong to another one). When no
 * such point exists, focus it and press Enter, as a keyboard player would, and
 * note that a pointer could not reach it.
 */
export async function activate(page: Page, el: Locator, what: string, key: 'Enter' | 'Space' = 'Enter'): Promise<void> {
  await el.waitFor({ state: 'attached' });
  await el.evaluate((node) => (node as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' }));
  const pt = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) {
      return null;
    }
    for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === node || node.contains(hit))) {
          return { x, y };
        }
      }
    }

    return null;
  });
  if (pt) {
    await page.mouse.click(pt.x, pt.y);

    return;
  }
  const cover = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const owner = top?.closest('[id]');

    const cls = top && typeof top.className === 'string' && top.className ? `.${top.className.trim().split(/\s+/u).slice(0, 2).join('.')}` : '';

    return top ? `${top.tagName.toLowerCase()}${cls}${owner ? ` in #${owner.id}` : ''}` : 'nothing (off screen or zero size)';
  });
  note(`${what}: pointer blocked (covered by ${cover}); used keyboard (focus + ${key})`);
  // The hit shape inside a hotspot is not focusable; focus the tabbable ancestor so Enter cannot go to whatever held focus before
  await el.evaluate((node) => ((node.closest('[tabindex]') ?? node) as HTMLElement | SVGElement).focus());
  await page.keyboard.press(key);
}

/** Opacity-aware visibility, as a player sees it */
export async function isShown(el: Locator): Promise<boolean> {
  if ((await el.count()) === 0) {
    return false;
  }

  return el.first().evaluate((n) => n.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
}

// ---------------------------------------------------------------------------
// Opening the campaign and scenario
// ---------------------------------------------------------------------------

/**
 * Open Frontline from the scenario selection page (checks the card art is not
 * the placeholder), start scenario `n`, wait for the plant and objectives hooks,
 * then select the camp station and open the Site tab.
 */
export async function openFrontlineScenario(page: Page, n: number): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { AUTO_CLOSE_DIALOGS: boolean; UNLOCK_ALL_SCENARIOS: boolean };
    w.AUTO_CLOSE_DIALOGS = true;
    w.UNLOCK_ALL_SCENARIOS = true;
    if (!sessionStorage.getItem('frontline-qa-cleared')) {
      localStorage.clear();
      sessionStorage.setItem('frontline-qa-cleared', '1');
    }
  });
  const id = `frontline-scenario${n}`;
  await page.goto('/campaigns/frontline');
  const container = page.locator('#scenario-selection-page');
  await expect(container).toBeVisible({ timeout: 30000 });
  await expect(container).not.toHaveAttribute('aria-busy', 'true', { timeout: 30000 });
  const row = page.locator(`.scenario-list-item[data-scenario-id="${id}"]`);
  const toggle = page.locator('.selection-phase').filter({ has: row }).locator('.selection-phase-toggle');
  if ((await toggle.count()) > 0 && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await row.click();
  const card = page.locator(`.scenario-card[data-scenario-id="${id}"]`);
  const img = card.locator('.scenario-image img:not(.selection-art-outgoing)');
  await expect(img).toBeVisible();
  await expect.poll(async () => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { message: `${id} card art loads` }).toBe(true);
  const src = (await img.getAttribute('src')) ?? '';
  const now = await img.evaluate((i: HTMLImageElement) => i.currentSrc);
  expect(`${src} ${now}`, `${id} card shows its own art, not the placeholder`).not.toContain('placeholder');
  await card.locator('.btn-start').click();
  await page.waitForURL(new RegExp(`/campaigns/frontline/scenarios/${id}$`, 'u'), { timeout: 30000 });
  await startFromPrologue(page);
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __fieldStatus?: unknown }).__fieldStatus === 'function' &&
      typeof (window as unknown as { debugObjective?: unknown }).debugObjective === 'function',
    undefined,
    { timeout: 60000 }
  );
  await dismissDialogs(page);
  await page.locator('a[data-asset-type="ground-station"]').first().click();
  await openSiteTab(page);
}

/** The mission opening scene (prologue) waits for its Start button before the sim runs */
export async function startFromPrologue(page: Page, timeoutMs = 30000): Promise<void> {
  const start = page.locator('.scene-modal .scene-start');
  const hooks = () => page.evaluate(() => typeof (window as unknown as { __fieldStatus?: unknown }).__fieldStatus === 'function');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isShown(start)) {
      await start.click();
      await expect(start).toBeHidden();

      return;
    }
    if (await hooks()) {
      return;
    }
    await page.waitForTimeout(250);
  }
}

/**
 * Dismiss character dialogs the way a player does: press and hold on the box
 * (1.5 s while voice plays). With AUTO_CLOSE_DIALOGS set this is usually a no-op.
 * Returns the dismissed texts.
 */
export async function dismissDialogs(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let k = 0; k < 6; k++) {
    const dlg = page.locator('.dialog-overlay.dialog-visible');
    if (!(await isShown(dlg))) {
      break;
    }
    seen.push((await dlg.innerText().catch(() => '')).replace(/\s+/gu, ' ').trim().slice(0, 200));
    const box = await dlg.locator('.dialog-box').boundingBox();
    if (!box) {
      break;
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1800);
    await page.mouse.up();
    await page.waitForTimeout(400);
  }

  return seen;
}

// ---------------------------------------------------------------------------
// Site tab: views, panels and the close-up
// ---------------------------------------------------------------------------

export async function openSiteTab(page: Page): Promise<void> {
  const tab = page.locator('[data-tab-id="site"]');
  await expect(tab).toBeVisible({ timeout: 20000 });
  if (!((await tab.getAttribute('class')) ?? '').includes('active')) {
    await tab.click();
  }
  await expect(page.locator('#site-stage')).toBeAttached();
}

/** The Site panels (Service checks, Workloads, Notebook, Handover...) by summary text */
function panel(page: Page, title: RegExp): Locator {
  return page.locator('.site-tab details').filter({ has: page.locator('summary', { hasText: title }) });
}

/** Open or close one Site panel by clicking its summary */
export async function setPanelOpen(page: Page, title: RegExp, open: boolean): Promise<Locator> {
  const d = panel(page, title).first();
  await expect(d).toBeAttached();
  const isOpen = await d.evaluate((n) => (n as HTMLDetailsElement).open);
  if (isOpen !== open) {
    await d.locator('summary').first().click();
  }

  return d;
}

/**
 * Make the scene image usable. With every panel open the stage box is squeezed
 * to zero height and the panels sit over the hotspots, so a player has to
 * collapse the panels first. Noted once per run.
 */
export async function revealSiteStage(page: Page): Promise<void> {
  await openSiteTab(page);
  const box = page.locator('.site-stage-box');
  const h = await box.evaluate((n) => n.getBoundingClientRect().height);
  if (h >= 150) {
    return;
  }
  if (!test.info().annotations.some((a) => a.description?.startsWith('Site stage'))) {
    note(`Site stage is ${Math.round(h)} px tall with the panels open; the scene is unusable until the panels are collapsed`);
  }
  const open = page.locator('.site-tab details[open] > summary');
  while ((await open.count()) > 0) {
    await open.first().click();
  }
  await expect.poll(async () => box.evaluate((n) => n.getBoundingClientRect().height)).toBeGreaterThan(150);
}

/** True on the forward (Rautala) site: its scene hotspots are `site-fwd-*` and there is no tent */
export async function isForwardSite(page: Page): Promise<boolean> {
  return (await page.locator('#site-stage [data-hotspot^="site-fwd-"]').count()) > 0;
}

/** Tent controls: the header control (since 04ad5e27) or the older Site strip */
const LOCATION_TEXT = '#tent-location-text, #site-location-text';
const VIEW_TOGGLE = '#tent-toggle, #site-view-toggle';
const TRIPS = '#tent-trips, #site-trips';

async function currentView(page: Page): Promise<'inside' | 'outside'> {
  const text = (await page.locator(LOCATION_TEXT).first().innerText()).trim().toLowerCase();

  return text === 'outside' ? 'outside' : 'inside';
}

/** Walk out of the tent (costs one trip at the camp) or back in, with the door button */
export async function goToView(page: Page, view: 'inside' | 'outside'): Promise<void> {
  await openSiteTab(page);
  if (await isForwardSite(page)) {
    return; // forward site: one scene, no tent control, no trips
  }
  if ((await currentView(page)) === view) {
    return;
  }
  const toggles = page.locator(VIEW_TOGGLE);
  let clicked = false;
  for (let i = 0; i < (await toggles.count()); i++) {
    if (await isShown(toggles.nth(i))) {
      await toggles.nth(i).click();
      clicked = true;
      // Stepping out asks first (it spends a rationed trip)
      const confirm = page.locator('#tent-confirm');
      if (view === 'outside' && (await isShown(confirm))) {
        await confirm.click();
      }
      break;
    }
  }
  expect(clicked, 'a visible tent toggle (Step outside / Go back in)').toBe(true);
  await expect.poll(() => currentView(page), { message: `now ${view}` }).toBe(view);
}

export const goOutside = (page: Page) => goToView(page, 'outside');
export const goInside = (page: Page) => goToView(page, 'inside');

/** Camp trip counter "used/limit" */
export async function readTrips(page: Page): Promise<{ used: number; limit: number }> {
  const [used, limit] = (await page.locator(TRIPS).first().innerText()).split('/').map((s) => parseInt(s, 10));

  return { used, limit };
}

const closeup = (page: Page) => page.locator('#part-closeup-modal');

export async function closeCloseup(page: Page): Promise<void> {
  const close = page.locator('#part-closeup-modal-close');
  if (await isShown(close)) {
    await close.click();
  }
}

/**
 * Open the close-up for a plant id and select its interaction point. Moves
 * inside or outside first when the hotspot is on the other side of the tent.
 */
export async function openPart(page: Page, partId: string): Promise<Locator> {
  const forward = await isForwardSite(page);
  const loc = forward ? { view: 'outside' as const, ...FORWARD_PART_LOCATIONS[partId] } : CAMP_PART_LOCATIONS[partId];
  if (!loc || !loc.hotspot) {
    throw new Error(`No Site location for '${partId}'; add it to ${forward ? 'FORWARD_PART_LOCATIONS' : 'CAMP_PART_LOCATIONS'} in e2e/utils/frontline-helpers.ts`);
  }
  await closeCloseup(page);
  // A character dialog that fires after the previous close-up covers the hotspot; a player dismisses it first
  const dismissed = await dismissDialogs(page);
  if (dismissed.length > 0) {
    note(`dismissed dialog before opening ${partId}: ${dismissed[0].slice(0, 80)}`);
  }
  await goToView(page, loc.view);
  await revealSiteStage(page);
  await page.waitForTimeout(400); // let the layout settle after the modal closed / panels collapsed, or the click lands on stale coordinates
  const spot = page.locator(`#site-stage [data-hotspot="${loc.hotspot}"]`);
  const hit = spot.locator('.pp-hit, .pp-hit-path').first();
  await activate(page, (await hit.count()) > 0 ? hit : spot, `hotspot ${loc.hotspot}`);
  if (
    !(await closeup(page)
      .isVisible()
      .catch(() => false))
  ) {
    // The first click did not open a close-up (seen on the forward scene right after a panel collapsed). A player would click again.
    await page.waitForTimeout(1500);
    if (
      !(await closeup(page)
        .isVisible()
        .catch(() => false))
    ) {
      note(`hotspot ${loc.hotspot}: first click opened no close-up, clicked again`);
      await activate(page, (await hit.count()) > 0 ? hit : spot, `hotspot ${loc.hotspot} (retry)`);
    }
  }
  await expect(closeup(page)).toBeVisible();
  const point = closeup(page).locator(`[data-target="${loc.target}"]`).first();
  await expect(point, `close-up from ${loc.hotspot} offers point ${loc.target}`).toBeAttached();
  await activate(page, point, `close-up point ${loc.target}`);
  await expect(point).toHaveClass(/pp-selected/u);

  return closeup(page);
}

/**
 * Run one verb on a plant id from its close-up (plant.inspect, plant.wiggle,
 * plant.feel ...). Returns the "Latest result" text. Closes the close-up and
 * returns to the Site tab (inspecting the laptop switches to the SkyLink tab).
 */
export async function plantVerb(page: Page, verb: PlantVerb, partId: string): Promise<string> {
  const modal = await openPart(page, partId);
  const btn = modal.locator(`button[data-verb="${verb}"]`);
  await expect(btn, `${verb} offered for ${partId}`).toBeVisible();
  const before = await modal.innerText();
  await btn.click();
  await expect.poll(async () => (await modal.innerText()) !== before, { message: `${verb} on ${partId} produced a result` }).toBe(true);
  const text = (await modal.innerText()).replace(/\s+/gu, ' ');
  const result = text.match(/LATEST RESULT(.*?)(HISTORY|$)/iu)?.[1]?.trim() ?? '';
  await closeCloseup(page);
  await openSiteTab(page);

  return result;
}

/** svc.plant.inspect(id) */
export const plantInspect = (page: Page, partId: string) => plantVerb(page, 'inspect', partId);

/** Measure with a tool from the close-up (multimeter, cable tester) */
export async function plantMeasure(page: Page, tool: string, partId: string): Promise<string> {
  const modal = await openPart(page, partId);
  const btn = modal.locator(`button[data-measure="${tool}"]`);
  await expect(btn, `${tool} offered for ${partId}`).toBeVisible();
  const before = await modal.innerText();
  await btn.click();
  await expect.poll(async () => (await modal.innerText()) !== before).toBe(true);
  const text = (await modal.innerText()).replace(/\s+/gu, ' ');
  await closeCloseup(page);
  await openSiteTab(page);

  return text.match(/LATEST RESULT(.*?)(HISTORY|$)/iu)?.[1]?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// Service checks, workloads, records
// ---------------------------------------------------------------------------

/**
 * services.takeSample(serviceId, layer, via): pick the check method in the
 * Service checks table and press Check. Needs the laptop, so it goes inside.
 * Returns the reading shown in the row.
 */
export async function servicesTakeSample(
  page: Page,
  serviceId: string,
  layer: ServiceLayer,
  via: SampleVia,
  metric?: 'rttMs' | 'jitterMs' | 'downMbps' | 'upMbps' | 'lossPct'
): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Service checks/u, true);
  const row = d.locator(`[data-svc-service="${serviceId}"][data-svc-layer="${layer}"]`).first();
  await expect(row, `service row ${serviceId}/${layer}`).toBeVisible();
  const sel = row.locator('select[data-svc-via]');
  await expect(sel.locator(`option[value="${via}"]`), `${serviceId}/${layer} offers ${via}`).toBeAttached();
  await sel.selectOption(via);
  if (metric) await row.locator('select[data-svc-metric]').selectOption(metric);
  const age = row.locator('[data-fsp^="age-"]');
  await row.locator('button[data-svc-check]').click();
  await expect(age).toHaveText(/\d+\s*s ago|now|just/iu);
  const reading = (await row.locator('[data-fsp^="value-"]').innerText()).trim();
  await setPanelOpen(page, /Service checks/u, false);

  return reading;
}

/** workloads.start(cardId, serviceId): returns the new run id */
export async function workloadsStart(page: Page, cardId: string, serviceId: string, priority?: string): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const before = new Set((await readFieldStatus(page)).workloads.map((w) => w.id));
  const d = await setPanelOpen(page, /Workloads/u, true);
  const card = d.locator(`[data-wl-card="${cardId}"]`);
  await expect(card, `workload card ${cardId}`).toBeVisible();
  await card.locator('select[data-wl-service]').selectOption(serviceId);
  if (priority) {
    await card.locator('select[data-wl-priority]').selectOption(priority);
  }
  await card.locator('button[data-wl-act="start"]').click();
  let runId = '';
  await expect
    .poll(
      async () => {
        runId = (await readFieldStatus(page)).workloads.find((w) => !before.has(w.id))?.id ?? '';

        return runId;
      },
      { message: `a ${cardId} run starts on ${serviceId}` }
    )
    .not.toBe('');

  return runId;
}

/** workloads.waitForRun(runId): "Hold for result", then wait until the run leaves 'running'. Returns its status. */
export async function workloadsWaitForRun(page: Page, runId: string, timeoutMs = 90000): Promise<string> {
  const d = await setPanelOpen(page, /Workloads/u, true);
  const hold = d.locator(`[data-wl-run="${runId}"] button[data-wl-act="hold"]`);
  if (await isShown(hold)) {
    await hold.click();
  }
  let status = 'running';
  await expect
    .poll(
      async () => {
        status = (await readFieldStatus(page)).workloads.find((w) => w.id === runId)?.status ?? 'missing';

        return status;
      },
      { timeout: timeoutMs, message: `run ${runId} finishes` }
    )
    .not.toMatch(/^(running|queued|pending|held)$/u);
  await setPanelOpen(page, /Workloads/u, false);

  return status;
}

/** Fill one form field from the player's latest reading ("Use my latest reading") */
export const LATEST = Symbol('latest reading');
/** For a run field: pick the newest run listed as supported */
export const LATEST_SUPPORTED_RUN = Symbol('latest supported run');

/** A pick or number can also carry notebook entries that back it (`value` plus `cites`) */
export type RecordField = { value: string | number | typeof LATEST | typeof LATEST_SUPPORTED_RUN; cites?: number | string[] } | { cites: number | string[] };

/**
 * records.submit(formId, input): choose the form in the Handover panel, fill
 * each field the way the input names it, press Check, then Submit. Throws with
 * the panel's per-field notes when the form refuses.
 */
export async function recordsSubmit(page: Page, formId: string, input: Record<string, RecordField>): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Handover/u, true);
  // The form picker only exists when the scenario has more than one form
  const picker = d.locator('select[data-hf-form]');
  if ((await picker.count()) > 0) {
    await picker.selectOption(formId);
  }
  for (const [key, f] of Object.entries(input)) {
    if ('cites' in f) {
      // A pick's backing entries sit in a collapsed details block: open it as a player would
      const backing = d.locator(`[data-hf-row="${key}"] details.fhf-backing`);
      if ((await backing.count()) > 0 && !(await backing.first().evaluate((n) => (n as HTMLDetailsElement).open))) {
        await backing.first().locator('summary').click();
      }
      // Older entries per source sit behind "Show older": open it as a player would before citing one
      const older = d.locator(`details.fhf-older[data-hf-older="${key}"]`);
      if ((await older.count()) > 0 && !(await older.first().evaluate((n) => (n as HTMLDetailsElement).open))) {
        await older.first().locator('summary').click();
      }
      const boxes = d.locator(`input[data-hf-key="${key}"][data-hf-cite]`);
      if (typeof f.cites === 'number') {
        // "Cite everything": the panel redraws its entry list on the site tab's 1 s tick, so a run that finished a moment ago
        // can be in the notebook before its boxes exist. Wait until the newest notebook entry has a box (the numbers in the
        // box labels count every notebook entry). A notebook ending in an entry the list never offers (a filed hypothesis)
        // falls through after a few ticks.
        const evidenceCount = (await readFieldStatus(page)).evidenceCount;
        await expect
          .poll(async () => boxes.evaluateAll((els) => Math.max(0, ...els.map((e) => Number(/#(\d+)/u.exec(e.parentElement?.textContent ?? '')?.[1] ?? 0)))), {
            timeout: 3500,
            message: `form ${formId} lists the newest of ${evidenceCount} notebook entries`,
          })
          .toBeGreaterThanOrEqual(evidenceCount)
          .catch(() => undefined);
      }
      // The newest entry can arrive after the first look: open "Show older" again so its older entries have boxes
      const olderLate = d.locator(`details.fhf-older[data-hf-older="${key}"]`);
      if ((await olderLate.count()) > 0 && !(await olderLate.first().evaluate((n) => (n as HTMLDetailsElement).open))) {
        await olderLate.first().locator('summary').click();
      }
      const ids = typeof f.cites === 'number' ? (await boxes.evaluateAll((els) => els.map((e) => e.getAttribute('data-hf-cite') ?? ''))).slice(0, f.cites) : f.cites;
      // A player can untick: drop leftovers from an earlier refused attempt so each filing is exactly what the input names
      const checked = await boxes.evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).checked).map((e) => e.getAttribute('data-hf-cite') ?? ''));
      for (const id of checked.filter((c) => !ids.includes(c))) {
        const stale = d.locator(`input[data-hf-key="${key}"][data-hf-cite="${id}"]`);
        await activate(page, stale, `form ${formId} untick ${id}`, 'Space');
        await expect(stale).not.toBeChecked();
      }
      for (const id of ids) {
        const box = d.locator(`input[data-hf-key="${key}"][data-hf-cite="${id}"]`);
        if (!(await box.isChecked())) {
          // The panel redraws on its own tick and can swallow a click: press again until it sticks
          for (let attempt = 0; attempt < 3 && !(await box.isChecked()); attempt++) {
            await activate(page, box, `form ${formId} cite ${id}`, 'Space');
            await page.waitForTimeout(150);
          }
          await expect(box).toBeChecked();
        }
      }
      if (!('value' in f)) continue;
    }
    const field = d.locator(`[data-hf-field="${key}"]`).first();
    await expect(field, `form ${formId} has field ${key}`).toBeAttached();
    const tag = await field.evaluate((n) => n.tagName);
    if (f.value === LATEST) {
      // The panel redraws on its own tick and can swallow the click: press again until the field holds a value
      for (let attempt = 0; attempt < 3; attempt++) {
        await activate(page, d.locator(`button[data-hf-fill="${key}"]`), `form ${formId} fill ${key}`);
        await page.waitForTimeout(200);
        const filled = await d
          .locator(`[data-hf-field="${key}"]`)
          .first()
          .evaluate((n) => ((n as HTMLInputElement).value ?? '') !== '')
          .catch(() => false);
        if (filled) break;
      }
    } else if (f.value === LATEST_SUPPORTED_RUN) {
      const readOpts = () => field.locator('option').evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? '' })));
      // The panel redraws on its own tick, so a run that just finished can still read 'running' for a moment
      await expect
        .poll(async () => (await readOpts()).some((o) => /supported/u.test(o.t) && o.v), { timeout: 8000 })
        .toBe(true)
        .catch(() => undefined);
      const opts = await readOpts();
      const pick = [...opts].reverse().find((o) => /supported/u.test(o.t) && o.v);
      expect(pick, `form ${formId} field ${key} lists a supported run; options: ${JSON.stringify(opts)}`).toBeTruthy();
      await field.selectOption(pick!.v);
    } else if (tag === 'SELECT') {
      await field.selectOption(String(f.value));
    } else {
      await field.fill(String(f.value));
    }
  }
  const msg = d.locator('.fhf-msg, [data-fhf="msg"]').first();
  await activate(page, d.locator('button[data-hf-act="check"]'), `form ${formId} Check`);
  // The verdict line is redrawn on the panel's own tick, so give it a moment before reading
  await expect
    .poll(async () => /Everything checks out|Not ready yet/u.test(await d.innerText()), { timeout: 8000 })
    .toBe(true)
    .catch(() => undefined);
  const checkText = (await d.innerText()).replace(/\s+/gu, ' ');
  if (!/Everything checks out/u.test(checkText)) {
    await page.waitForTimeout(500);
    const bad = await d
      .locator('[data-hf-note]')
      .evaluateAll((ns) => ns.map((n) => `${n.getAttribute('data-hf-note')}: ${(n.textContent ?? '').trim()}`).filter((t) => !/: OK$/u.test(t)));
    await setPanelOpen(page, /Handover/u, false);
    throw new Error(`form ${formId} refused on Check: ${bad.join(' | ').slice(0, 500) || checkText.slice(-400)}`);
  }
  await activate(page, d.locator('button[data-hf-act="submit"]'), `form ${formId} Submit`);
  // A Submit click is occasionally dropped when the panel redraws under it (seen S9/S12); press once more and note it
  const submitted = await expect(d)
    .toContainText(/Submitted at/u, { timeout: 2500 })
    .then(
      () => true,
      () => false
    );
  if (!submitted) {
    test.info().annotations.push({ type: 'qa-note', description: `form ${formId}: first Submit click had no effect; pressed again` });
    await activate(page, d.locator('button[data-hf-act="submit"]'), `form ${formId} Submit (retry)`);
  }
  await expect(d, `form ${formId} submitted`).toContainText(/Submitted at/u);
  const out = (await ((await msg.count()) > 0 ? msg.innerText() : d.innerText())).replace(/\s+/gu, ' ').slice(0, 200);
  await setPanelOpen(page, /Handover/u, false);

  return out;
}

// ---------------------------------------------------------------------------
// Quizzes, decisions, objectives, mission end
// ---------------------------------------------------------------------------

/**
 * Answer the pending status-check quiz by option text. A player reaches it
 * through the pending-quiz indicator or the checklist "?" button.
 */
export async function answerStatusCheck(page: Page, answerText: string, timeoutMs = 15000): Promise<void> {
  const quiz = page.locator('#quiz-modal');
  const deadline = Date.now() + timeoutMs;
  while (!(await isShown(quiz))) {
    const openBtn = page.locator('.pending-quiz-indicator.show .pending-quiz-indicator__open-btn');
    const qBtn = page.locator('.objectives-checklist .objective-item.active .condition-quiz-btn');
    if (await isShown(openBtn)) {
      await openBtn.click();
    } else if (await isShown(qBtn)) {
      await qBtn.first().click();
    } else if (Date.now() > deadline) {
      const ui = await page.evaluate(() => ({
        indicator: !!document.querySelector('.pending-quiz-indicator'),
        checklistSection: (document.querySelector('#mission-icons-section') as HTMLElement | null)?.style.display ?? 'missing',
      }));
      const msg =
        `UI GAP: no way to open the status-check quiz. pending-quiz indicator ${ui.indicator ? 'exists but not shown' : 'never created'}; ` +
        `checklist section display=${ui.checklistSection}. The sidebar hides the mission section and skips the indicator when the scenario has no missionBriefUrl (asset-tree-sidebar.ts initMissionSection_).`;
      if (PROBE_MODE) {
        expect.soft(false, msg).toBe(true);

        return;
      }
      throw new Error(msg);
    }
    await page.waitForTimeout(250);
  }
  const option = quiz.locator('.quiz-option-btn', { hasText: answerText });
  await expect(option, `quiz offers "${answerText.slice(0, 60)}"`).toBeVisible();
  await option.click();
  const cont = page.locator('#quiz-continue-btn');
  await expect(cont).toBeVisible();
  await cont.click();
  await dismissDialogs(page);
}

/** Pick a decision option by text and confirm it */
export async function answerDecision(page: Page, optionText: string): Promise<void> {
  const modal = page.locator('#decision-modal');
  if (!(await isShown(modal))) {
    const openBtn = page.locator('.pending-quiz-indicator.show .pending-quiz-indicator__open-btn');
    await expect(openBtn, 'a pending decision can be opened').toBeVisible();
    await openBtn.click();
  }
  await expect(modal).toBeVisible();
  await modal.getByText(optionText, { exact: false }).first().click();
  const confirm = modal.locator('button', { hasText: /Confirm|Submit|Continue/u }).first();
  if (await isShown(confirm)) {
    await confirm.click();
  }
  await dismissDialogs(page);
}

/**
 * Wait for the objective engine to mark the objective complete. On timeout the
 * error lists the conditions still unmet. In probe mode the failure is soft so
 * the rest of the scenario still exercises its helpers.
 */
export async function waitForObjective(page: Page, objectiveId: string, timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let last: ObjectiveDebug | null = null;
  while (Date.now() < deadline) {
    last = await readObjective(page, objectiveId);
    if (last.isCompleted) {
      await dismissDialogs(page);

      return true;
    }
    await page.waitForTimeout(300);
  }
  const open = (last?.conditions ?? []).map((c, i) => (c.isSatisfied ? null : `#${i} ${c.type}`)).filter(Boolean);
  const msg = `${objectiveId} not complete after ${timeoutMs / 1000}s (active=${last?.isActive}); unmet: ${open.join(', ') || '(none)'}${last?.error ? `; ${last.error}` : ''}`;
  if (PROBE_MODE) {
    expect.soft(false, msg).toBe(true);

    return false;
  }
  throw new Error(msg);
}

/** The scenario ends on the Mission Complete modal */
export async function expectMissionComplete(page: Page, timeoutMs = 30000): Promise<void> {
  const modal = page.locator('.complete-modal');
  await expect.poll(async () => isShown(modal), { timeout: timeoutMs, message: 'Mission Complete modal shows' }).toBe(true);
}

// ---------------------------------------------------------------------------
// Added for S5+: workload priority and the Notebook hypothesis form
// ---------------------------------------------------------------------------

/** workloads.setPriority(cardId, weight): pick the priority in the card's select (Background / Routine / Mission) */
export async function workloadsSetPriority(page: Page, cardId: string, priority: 'background' | 'routine' | 'mission'): Promise<void> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Workloads/u, true);
  const card = d.locator(`[data-wl-card="${cardId}"]`);
  await expect(card, `workload card ${cardId}`).toBeVisible();
  await card.locator('select[data-wl-priority]').selectOption(priority);
  await expect(card.locator('select[data-wl-priority]')).toHaveValue(priority);
  await setPanelOpen(page, /Workloads/u, false);
}

/**
 * Add a hypothesis in the Notebook ("I suspect ... Add hypothesis"). `cites` is
 * a count (the first N entries listed) or all entries when 'all'.
 */
export async function notebookAddHypothesis(page: Page, h: { scope: string; target: string; cause?: string; confidence?: string; cites: number | 'all' }): Promise<void> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Notebook/u, true);
  await d.locator('select[data-nb-scope]').selectOption(h.scope);
  await expect(d.locator(`select[data-nb-target] option[value="${h.target}"]`), `hypothesis target ${h.target} offered`)
    .toBeAttached({ timeout: 4000 })
    .catch(async (e) => {
      const have = await d.locator('select[data-nb-target] option').evaluateAll((os) => os.map((o) => `${(o as HTMLOptionElement).value}=${o.textContent}`));
      throw new Error(`target ${h.target} not offered for scope ${h.scope}; offered: ${have.join(' | ')} (${(e as Error).message.length})`);
    });
  await d.locator('select[data-nb-target]').selectOption(h.target);
  if (h.cause) {
    const cause = d.locator('[data-nb-cause]');
    if ((await cause.evaluate((n) => n.tagName)) === 'SELECT') {
      await cause.selectOption(h.cause);
    } else {
      await cause.fill(h.cause);
    }
  }
  if (h.confidence) {
    await d.locator('select[data-nb-confidence]').selectOption(h.confidence);
  }
  const boxes = d.locator('input[data-nb-cite]');
  const ids = await boxes.evaluateAll((els) => els.map((e) => e.getAttribute('data-nb-cite') ?? ''));
  for (const id of h.cites === 'all' ? ids : ids.slice(0, h.cites)) {
    const box = d.locator(`input[data-nb-cite="${id}"]`);
    if (!(await box.isChecked())) {
      await activate(page, box, `notebook cite ${id}`, 'Space');
      await expect(box).toBeChecked();
    }
  }
  await activate(page, d.locator('button[data-nb-act="add"]'), 'Add hypothesis');
  await expect(d).toContainText(/Hypothesis saved/u);
  await setPanelOpen(page, /Notebook/u, false);
}

// ---------------------------------------------------------------------------
// Added for S7+: the "Records and notices" panel (equipment ledger)
// ---------------------------------------------------------------------------

/** equipment.submitCorrection(requestId): press the request's button; `pick` chooses the new value in its select when the player must */
export async function recordsRequestCorrection(page: Page, requestId: string, pick?: string): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Records and notices/u, true);
  const req = d.locator(`[data-frp-req="${requestId}"]`);
  await expect(req, `correction request ${requestId} is offered`).toBeVisible();
  if (pick) {
    await req.locator('select[data-rp-pick]').selectOption(pick);
  }
  await req.locator('button[data-rp-act="request"]').click();
  await expect(d.locator('[data-frp="msg"]')).toContainText(/Request filed/u);
  const msg = (await d.locator('[data-frp="msg"]').innerText()).trim();
  await setPanelOpen(page, /Records and notices/u, false);

  return msg;
}

/** equipment.accept(unitId): press "Accept this unit"; returns the panel message */
export async function recordsAcceptUnit(page: Page, unitId: string): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Records and notices/u, true);
  const btn = d.locator(`button[data-rp-act="accept"][data-rp-unit="${unitId}"]`);
  await expect(btn, `Accept this unit offered for ${unitId}`).toBeVisible();
  await btn.click();
  await expect(d.locator('[data-frp="msg"]')).toContainText(/accepted\.|Not accepted/u);
  const msg = (await d.locator('[data-frp="msg"]').innerText()).trim();
  await setPanelOpen(page, /Records and notices/u, false);

  return msg;
}

/**
 * Counterexample helper: fill the form like recordsSubmit, expect Check to refuse it, and return the panel's
 * per-field notes (so the spec can assert the reason). Fails if the form is accepted.
 */
export async function recordsExpectRefused(page: Page, formId: string, input: Record<string, RecordField>, reason?: RegExp): Promise<string> {
  let refusal = '';
  try {
    await recordsSubmit(page, formId, input);
  } catch (e) {
    refusal = String((e as Error).message);
  }
  expect(refusal, `form ${formId} should have been refused on Check`).toMatch(/refused on Check/u);
  if (reason) expect(refusal, `form ${formId} refusal reason`).toMatch(reason);

  return refusal;
}

/** Text of the Mission Complete modal's Field diagnosis section (debrief lines and score notes) */
export async function readDebrief(page: Page): Promise<string> {
  const section = page.locator('.complete-modal .field-diagnosis');
  await expect(section).toBeAttached({ timeout: 15000 });
  // The modal reveals its text progressively; wait for the lines to be there
  await expect.poll(async () => (await section.textContent()) ?? '', { timeout: 15000 }).toMatch(/Fixes with earlier evidence/u);

  return ((await section.textContent()) ?? '').replace(/\s+/gu, ' ');
}

/** Press Inspect on a workload card, as a player does to see what the workload uses (the S5 attribution gate). */
export async function workloadsInspect(page: Page, cardId: string): Promise<void> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Workloads/u, true);
  const card = d.locator(`[data-wl-card="${cardId}"]`);
  await expect(card, `workload card ${cardId}`).toBeVisible();
  await card.locator('button[data-wl-act="inspect"]').click();
}
