/**
 * Phase 3 constellation-scale baseline harness (P3-WP0).
 *
 * Loads the dev-only perf-constellation scenario with N synthetic satellites,
 * then measures sim time per tick, long tasks, JS heap, embed frame time and
 * browser working set at speeds 1/2/5 and during a time skip. Writes
 * perf-results/<date>-<n>.json and prints a pass/fail table against the
 * plan's section 4.6 budgets.
 *
 * Needs the dev server (the scenario is dev-only):
 *   SR_DEV_PORT=3200 pnpm dev
 * Env: PERF_N (default 1000), PERF_BASE (default http://localhost:3200),
 *      PERF_BASELINE_HEAP_MB (heap with ~100 sats, to compute heap added),
 *      PERF_LOAD_TIMEOUT_MS (default 240000), PERF_PHASE_S (default 15).
 * Uses http://localhost, not 127.0.0.1: the embed licence does not cover the latter.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type CDPSession, chromium, type Frame, type Page, test } from '@playwright/test';

const N = Number(process.env.PERF_N ?? 1000);
const BASE = process.env.PERF_BASE ?? 'http://localhost:3200';
const LOAD_TIMEOUT = Number(process.env.PERF_LOAD_TIMEOUT_MS ?? 240000);
const PHASE_S = Number(process.env.PERF_PHASE_S ?? 15);
const ANT = process.env.PERF_ANT ?? '';
const POINT = process.env.PERF_POINT ?? '180,40';
const PROP = process.env.PERF_PROP !== '0';
/** PERF_SETS=real loads the real starlink-2026-11 and geo-belt-2026-11 TLE sets instead of N synthetic members. */
const SETS = process.env.PERF_SETS ?? '';
/** PERF_SHOT=<png path> saves one full-scale screenshot of the World Map tab after the speed phases. */
const SHOT = process.env.PERF_SHOT ?? '';
const BASELINE_HEAP_MB = process.env.PERF_BASELINE_HEAP_MB ? Number(process.env.PERF_BASELINE_HEAP_MB) : null;
const ARGS = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];
const PHASE2_WORKING_SET_MB = 1540;

interface Stats {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

function stats(values: number[]): Stats | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1] };
}

function round(v: number | null | undefined, d = 3): number | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d));
}

/** Race a promise against a timer so a hung main thread is recorded, not waited on. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), ms);
  });
  const res = await Promise.race([p.then((value) => ({ ok: true as const, value })), timeout]);
  if (timer) clearTimeout(timer);
  return res;
}

async function processSnapshot(browserCdp: CDPSession): Promise<{ workingSetMb: number; cpuS: number; processes: number } | null> {
  try {
    const info = (await browserCdp.send('SystemInfo.getProcessInfo' as never)) as { processInfo: { id: number; cpuTime: number }[] };
    const ids = info.processInfo.map((p) => p.id);
    const cpuS = info.processInfo.reduce((a, p) => a + p.cpuTime, 0);
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum`], {
      encoding: 'utf8',
    });
    return { workingSetMb: Number(out.trim()) / 1048576, cpuS, processes: ids.length };
  } catch {
    return null;
  }
}

async function openReady(page: Page): Promise<void> {
  await page.locator('#app-shell-page').waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
  const opening = page.locator('.scene-modal[open]');
  if (await opening.isVisible().catch(() => false)) {
    await opening.getByRole('button', { name: 'Start', exact: true }).click();
    await opening.waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
  }
  await page.locator('#tab-bar').waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
  await page
    .locator('.scene-modal[open]')
    .waitFor({ state: 'detached', timeout: 15000 })
    .catch(() => undefined);
}

/** rAF delta sampling inside the embed iframe: frame-to-frame time as the embed sees it. */
async function embedFrameTimes(frame: Frame | null, seconds: number): Promise<number[] | null> {
  if (!frame) return null;
  const r = await withTimeout(
    frame.evaluate(
      (s) =>
        new Promise<number[]>((resolve) => {
          const deltas: number[] = [];
          let last = performance.now();
          const end = last + s * 1000;
          const tick = (t: number) => {
            deltas.push(t - last);
            last = t;
            if (t < end) requestAnimationFrame(tick);
            else resolve(deltas);
          };
          requestAnimationFrame(tick);
        }),
      seconds
    ),
    (seconds + 30) * 1000
  );
  return r.ok ? r.value : null;
}

interface PhaseResult {
  name: string;
  hung?: boolean;
  advances?: number;
  steps?: number;
  perTickMs?: Stats | null;
  perFrameMs?: Stats | null;
  longTasks?: { count: number; perMin: number; maxMs: number };
  heapMb?: number | null;
  heapAfterGcMb?: number | null;
  workingSetMb?: number | null;
  cpuS?: number | null;
  embedFrameMs?: Stats | null;
  extra?: Record<string, unknown>;
}

interface RawSamples {
  samples: number[];
  longTasks: number[];
  heap: number;
  speed?: number;
}

function splitSamples(samples: number[]): { perFrame: number[]; perTick: number[]; steps: number } {
  const perFrame: number[] = [];
  const perTick: number[] = [];
  let steps = 0;
  for (let i = 0; i < samples.length; i += 2) {
    perFrame.push(samples[i]);
    perTick.push(samples[i] / samples[i + 1]);
    steps += samples[i + 1];
  }
  return { perFrame, perTick, steps };
}

const readProp = () => {
  const p = window.__srPerf?.prop;
  return p
    ? {
        serviceMs: [...p.serviceMs],
        busyMs: p.workerBusyMs(),
        fallbacks: p.fallbacks(),
        reasons: p.fallbackReasons(),
        stale: p.staleDropped(),
        holds: p.holds(),
        warm: p.warmCount(),
        hydrated: p.hydratedCount(),
        hasWorker: p.hasWorker(),
        nowMs: performance.now(),
      }
    : null;
};

const readProbe = (): RawSamples => {
  const probe = window.__srPerf;
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
  return { samples: [...(probe?.samples ?? [])], longTasks: [...(probe?.longTasks ?? [])], heap, speed: probe?.SimClock.speed };
};

/** Retained JS heap after a forced GC, MB (usedJSHeapSize alone swings with GC timing). */
async function gcHeapMb(pageCdp: CDPSession): Promise<number | null> {
  try {
    await pageCdp.send('HeapProfiler.collectGarbage');
    const usage = (await pageCdp.send('Runtime.getHeapUsage')) as { usedSize: number };
    return usage.usedSize / 1048576;
  } catch {
    return null;
  }
}

async function runSpeedPhase(page: Page, pageCdp: CDPSession, browserCdp: CDPSession, frame: Frame | null, speed: number): Promise<PhaseResult> {
  const name = `speed-${speed}x`;
  const ok = await withTimeout(
    page.evaluate((sp) => {
      const probe = window.__srPerf;
      probe?.SimClock.setSpeed(sp as 1 | 2 | 5);
      probe?.reset();
    }, speed),
    30000
  );
  if (!ok.ok) return { name, hung: true };
  const prop0 = PROP ? await withTimeout(page.evaluate(readProp), 30000) : null;
  const cpu0 = await processSnapshot(browserCdp);
  const embedP = embedFrameTimes(frame, PHASE_S);
  await page.waitForTimeout(PHASE_S * 1000);
  const embed = await embedP;
  const data = await withTimeout(page.evaluate(readProbe), 30000);
  if (!data.ok) return { name, hung: true };
  const { perFrame, perTick, steps } = splitSamples(data.value.samples);
  const prop1 = PROP ? await withTimeout(page.evaluate(readProp), 30000) : null;
  const propExtra: Record<string, unknown> = {};
  if (prop0?.ok && prop1?.ok && prop1.value) {
    const a = prop0.value;
    const b = prop1.value;
    const wallMs = b.nowMs - (a?.nowMs ?? 0);
    propExtra.propServiceMs = stats(b.serviceMs);
    propExtra.propWorkerCpuPct = round(((b.busyMs - (a?.busyMs ?? 0)) / wallMs) * 100, 2);
    propExtra.propFallbacksInPhase = b.fallbacks - (a?.fallbacks ?? 0);
    propExtra.propFallbacksTotal = b.fallbacks;
    const reasons: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.reasons)) {
      const d = v - (a?.reasons?.[k] ?? 0);
      if (d) reasons[k] = d;
    }
    propExtra.propFallbackReasons = reasons;
    propExtra.propHolds = {
      holds: b.holds.holds - (a?.holds?.holds ?? 0),
      episodes: b.holds.episodes - (a?.holds?.episodes ?? 0),
      maxMs: round(b.holds.maxMs, 1),
      leadS: b.holds.leadS,
    };
    propExtra.propStaleInPhase = b.stale - (a?.stale ?? 0);
    propExtra.propWarm = b.warm;
    propExtra.propHydrated = b.hydrated;
    propExtra.propHasWorker = b.hasWorker;
  }
  const proc = await processSnapshot(browserCdp);
  const lt = data.value.longTasks;
  return {
    name,
    advances: perFrame.length,
    steps,
    perTickMs: stats(perTick),
    perFrameMs: stats(perFrame),
    longTasks: { count: lt.length, perMin: (lt.length * 60) / PHASE_S, maxMs: lt.length ? Math.max(...lt) : 0 },
    heapMb: data.value.heap / 1048576,
    heapAfterGcMb: await gcHeapMb(pageCdp),
    workingSetMb: proc?.workingSetMb ?? null,
    cpuS: proc && cpu0 ? proc.cpuS - cpu0.cpuS : null,
    embedFrameMs: embed ? stats(embed) : null,
    extra: { effectiveSpeed: data.value.speed, ...propExtra },
  };
}

async function runTimeSkipPhase(page: Page, browserCdp: CDPSession): Promise<PhaseResult> {
  const name = 'time-skip';
  await withTimeout(
    page.evaluate(() => window.__srPerf?.reset()),
    30000
  );
  const t0 = Date.now();
  // findTarget scans every satellite across a 12 h horizon on the main thread
  const find = await withTimeout(
    page.evaluate(() => window.__srPerf?.timeFindTarget()),
    5 * 60 * 1000
  );
  if (!find.ok) return { name, hung: true, extra: { stage: 'findTarget', waitedMs: Date.now() - t0 } };
  const started = await withTimeout(
    page.evaluate(() => {
      const c = window.__srPerf?.TimeSkipController.getInstance();
      const target = c?.findTarget() ?? null;
      return { found: target !== null, started: target ? c?.start(target) === true : false, blocked: c?.getBlockedReason() ?? null };
    }),
    5 * 60 * 1000
  );
  if (!started.ok) return { name, hung: true, extra: { stage: 'start', findTargetMs: find.value?.ms ?? null } };
  let skipMs: number | null = null;
  let forcedJump = false;
  if (!started.value.started) {
    // Blocked by 'in view' (always true at scale): force a 1 h clock jump so the post-jump frames are still measured
    forcedJump = true;
    await withTimeout(
      page.evaluate(() => window.__srPerf?.SimClock.skip(3600e3)),
      60000
    );
    await page.waitForTimeout(5000);
  }
  if (started.value.started) {
    const s0 = Date.now();
    const done = await withTimeout(
      page.waitForFunction(() => window.__srPerf?.TimeSkipController.getInstance().isSkipping === false, undefined, { timeout: 120000 }),
      125000
    );
    skipMs = done.ok ? Date.now() - s0 : null;
  }
  const data = await withTimeout(page.evaluate(readProbe), 30000);
  if (!data.ok) return { name, hung: true };
  const { perFrame, perTick } = splitSamples(data.value.samples);
  const proc = await processSnapshot(browserCdp);
  const lt = data.value.longTasks;
  return {
    name,
    advances: perFrame.length,
    perTickMs: stats(perTick),
    perFrameMs: stats(perFrame),
    longTasks: { count: lt.length, perMin: 0, maxMs: lt.length ? Math.max(...lt) : 0 },
    heapMb: data.value.heap / 1048576,
    workingSetMb: proc?.workingSetMb ?? null,
    extra: {
      findTargetMs: round(find.value?.ms ?? null, 1),
      targetFound: started.value.found,
      started: started.value.started,
      blocked: started.value.blocked,
      skipWallMs: skipMs,
      forcedJump,
    },
  };
}

function nextResultPath(): string {
  const dir = path.resolve('perf-results');
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const taken = readdirSync(dir)
    .map((f) => new RegExp(`^${date}-([0-9]+)[.]json$`, 'u').exec(f))
    .map((m) => (m ? Number(m[1]) : 0));
  return path.join(dir, `${date}-${Math.max(0, ...taken) + 1}.json`);
}

interface Row {
  metric: string;
  budget: string;
  value: string;
  pass: boolean | null;
}

interface TreeResult {
  members: number;
  rowsTotal: number;
  rowsRendered: number;
  treeDomNodes: number;
  scrollFrameMs: { mean: number; p95: number; max: number; frames: number } | null;
  searchMs: { name: number; id: number; miss: number; worstOfRuns: number } | null;
  searchRows: number;
  error?: string;
}

/** Asset tree at scale (P3-WP8): expand the Starlink shell, scroll it, search, count DOM nodes. */
async function runTreePhase(page: Page): Promise<TreeResult> {
  const r = await withTimeout(
    page.evaluate(async () => {
      const tree = (window as unknown as { __srTree?: any }).__srTree;
      if (!tree) return { error: 'no __srTree' };
      const out: any = { members: tree.model.memberCount };
      tree.expand(tree.model.keysUnderGroup(''));
      out.rowsTotal = tree.totalRowCount;
      const vp = tree.element.querySelector('.ct-viewport') as HTMLElement;
      const deltas: number[] = [];
      await new Promise<void>((resolve) => {
        const max = Math.max(1, vp.scrollHeight - vp.clientHeight);
        const t0 = performance.now();
        let last = t0;
        const step = (now: number) => {
          deltas.push(now - last);
          last = now;
          const f = (now - t0) / 4000;
          vp.scrollTop = Math.min(max, f * max);
          if (f < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      deltas.shift();
      deltas.sort((a, b) => a - b);
      const q = (f: number) => deltas[Math.min(deltas.length - 1, Math.floor(f * deltas.length))];
      out.scrollFrameMs = { mean: deltas.reduce((a, b) => a + b, 0) / deltas.length, p95: q(0.95), max: deltas[deltas.length - 1], frames: deltas.length };
      out.rowsRendered = tree.renderedRowCount;
      const first = tree.model.memberCount > 0 ? 'starlink' : 'a';
      const timeIt = (text: string) => {
        let best = 0;
        for (let i = 0; i < 5; i++) {
          tree.setQuery('');
          const t = tree.setQuery(i % 2 ? text : text + ' ');
          best = Math.max(best, t);
        }
        return best;
      };
      const name = timeIt(first);
      const id = timeIt('4');
      const miss = timeIt('zzzzqq');
      out.searchMs = { name, id, miss, worstOfRuns: Math.max(name, id, miss) };
      // Leave the view in the screenshot state: Starlink open, search active.
      tree.setQuery('starlink-1');
      out.searchRows = tree.totalRowCount;
      vp.scrollTop = 0;
      await new Promise((r2) => requestAnimationFrame(() => r2(null)));
      out.treeDomNodes = tree.element.querySelectorAll('*').length;
      return out;
    }),
    60000
  );
  if (!r.ok) return { members: 0, rowsTotal: 0, rowsRendered: 0, treeDomNodes: 0, scrollFrameMs: null, searchMs: null, searchRows: 0, error: 'hung' };
  return r.value as TreeResult;
}

function judge(phases: PhaseResult[], loadMs: number | null, heapAddedMb: number | null, tree: TreeResult | null = null): Row[] {
  const by = (n: string) => phases.find((p) => p.name === n);
  const s1 = by('speed-1x');
  const s5 = by('speed-5x');
  const fmt = (v: number | null | undefined, u = ' ms') => (v === null || v === undefined ? 'n/a' : `${round(v, 2)}${u}`);
  const lim = (v: number | null | undefined, max: number) => (v === null || v === undefined ? null : v <= max);
  const allLong = phases.filter((p) => p.longTasks && p.name.startsWith('speed')).map((p) => p.longTasks?.perMin ?? 0);
  const ws = Math.max(0, ...phases.map((p) => p.workingSetMb ?? 0));
  return [
    { metric: 'Tick mean 1x', budget: '<= 1.5 ms', value: s1?.hung ? 'HUNG' : fmt(s1?.perTickMs?.mean), pass: s1?.hung ? false : lim(s1?.perTickMs?.mean, 1.5) },
    { metric: 'Tick p99 1x', budget: '<= 4 ms', value: s1?.hung ? 'HUNG' : fmt(s1?.perTickMs?.p99), pass: s1?.hung ? false : lim(s1?.perTickMs?.p99, 4) },
    { metric: 'Frame mean 5x', budget: '<= 6 ms', value: s5?.hung ? 'HUNG' : fmt(s5?.perFrameMs?.mean), pass: s5?.hung ? false : lim(s5?.perFrameMs?.mean, 6) },
    {
      metric: 'Long tasks steady state',
      budget: '0 / min',
      value: allLong.length ? `${round(Math.max(...allLong), 1)} / min` : 'n/a',
      pass: allLong.length ? Math.max(...allLong) === 0 : null,
    },
    { metric: 'Scenario load', budget: '<= 2.5 s', value: loadMs === null ? 'FAILED' : fmt(loadMs / 1000, ' s'), pass: loadMs === null ? false : loadMs <= 2500 },
    { metric: 'Embed frame p95', budget: '<= 20 ms', value: fmt(s1?.embedFrameMs?.p95), pass: lim(s1?.embedFrameMs?.p95, 20) },
    {
      metric: 'JS heap added',
      budget: '<= 80 MB',
      value: heapAddedMb === null ? 'n/a (set PERF_BASELINE_HEAP_MB)' : fmt(heapAddedMb, ' MB'),
      pass: heapAddedMb === null ? null : heapAddedMb <= 80,
    },
    {
      metric: 'Working set',
      budget: `<= ${PHASE2_WORKING_SET_MB + 300} MB`,
      value: ws ? fmt(ws, ' MB') : 'n/a',
      pass: ws ? ws <= PHASE2_WORKING_SET_MB + 300 : null,
    },
    { metric: 'Tree scroll frame p95 (Starlink open)', budget: '60 fps (p95 <= 17.5 ms)', value: fmt(tree?.scrollFrameMs?.p95), pass: lim(tree?.scrollFrameMs?.p95, 17.5) },
    { metric: 'Tree search worst', budget: '<= 50 ms', value: fmt(tree?.searchMs?.worstOfRuns), pass: lim(tree?.searchMs?.worstOfRuns, 50) },
    { metric: 'Tree DOM nodes', budget: 'n/a (windowed)', value: tree ? String(tree.treeDomNodes) : 'n/a', pass: null },
    { metric: 'Worker CPU / main-thread fallbacks', budget: 'n/a today', value: 'n/a (no worker yet)', pass: null },
  ];
}

test(`constellation baseline N=${N}`, async () => {
  const browser = await chromium.launch({ headless: false, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(() => {
    (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
  });
  const page = await ctx.newPage();
  const pageCdp = await ctx.newCDPSession(page);
  const browserCdp = await browser.newBrowserCDPSession();
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message).slice(0, 200)));

  const result: Record<string, unknown> = { n: N, ant: ANT || null, point: ANT ? POINT : null, date: new Date().toISOString(), base: BASE };
  let loadMs: number | null = null;
  const phases: PhaseResult[] = [];
  let tree: TreeResult | null = null;
  try {
    const t0 = Date.now();
    await page.goto(
      `${BASE}/campaigns/perf/scenarios/perf-constellation?perfN=${N}${PROP ? '&perfProp=1' : ''}${SETS ? `&perfSets=${SETS}` : ''}${ANT ? `&perfAnt=${ANT}&perfPoint=${POINT}` : ''}`,
      { waitUntil: 'domcontentloaded' }
    );
    try {
      await openReady(page);
      loadMs = Date.now() - t0;
    } catch (e) {
      result.loadFailure = String((e as Error).message).slice(0, 300);
    }
    result.loadMs = loadMs;

    if (loadMs !== null) {
      await page.waitForTimeout(3000);
      const probeOk = await withTimeout(
        page.evaluate(() => ({ probe: !!window.__srPerf, sats: document.querySelectorAll('select[id$="satellite-select"] option').length })),
        60000
      );
      result.probe = probeOk.ok ? probeOk.value : 'hung';
      const tabClickMs = Date.now();
      await page
        .locator('#tab-bar .nav-link[data-tab-id="ground-track"]')
        .click({ timeout: 30000 })
        .catch(() => undefined);
      const hostVisible = await page
        .locator('#kt-embed-host')
        .waitFor({ state: 'visible', timeout: 90000 })
        .then(() => true)
        .catch(() => false);
      result.embedHostVisible = hostVisible;
      result.tabToMapMs = hostVisible ? Date.now() - tabClickMs : null;
      const frame = hostVisible ? (page.frames().find((f) => f !== page.mainFrame()) ?? null) : null;
      for (const speed of [1, 2, 5]) {
        const r = await runSpeedPhase(page, pageCdp, browserCdp, frame, speed);
        phases.push(r);
        if (r.hung) break;
      }
      await withTimeout(
        page.evaluate(() => window.__srPerf?.SimClock.setSpeed(1)),
        15000
      );
      if (hostVisible && !phases.some((p) => p.hung)) {
        tree = await runTreePhase(page);
        result.tree = tree;
      }
      if (SHOT) {
        await page.screenshot({ path: SHOT, fullPage: false });
      }
      if (!phases.some((p) => p.hung)) phases.push(await runTimeSkipPhase(page, browserCdp));
    }
  } finally {
    result.phases = phases;
    result.consoleErrors = consoleErrors.slice(0, 10);
    const heapRef = phases.find((p) => p.name === 'speed-1x')?.heapAfterGcMb ?? null;
    const heapAdded = heapRef !== null && BASELINE_HEAP_MB !== null ? heapRef - BASELINE_HEAP_MB : null;
    const rows = judge(phases, loadMs, heapAdded, tree);
    result.heapAddedMb = round(heapAdded, 1);
    result.budgets = rows;
    const file = nextResultPath();
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nN=${N}  results: ${file}`);
    console.log('| Metric | Budget | Measured | Result |\n|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.metric} | ${r.budget} | ${r.value} | ${r.pass === null ? 'n/a' : r.pass ? 'PASS' : 'FAIL'} |`);
    await withTimeout(browser.close(), 20000);
  }
});
