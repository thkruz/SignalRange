import { existsSync } from 'node:fs';
import { expect, test } from '../fixtures/test-fixtures';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

// The embed licence is domain-locked: 127.0.0.1 is not licensed, localhost is.
const BASE = process.env.SR_E2E_BASE ?? 'http://localhost:3000';
const URL_PATH = '/campaigns/range-watch/scenarios/starlink-interference';

type SkyRow = { norad: number; az: number; el: number; inScan: boolean; inExclusion: boolean };
type ArrayHook = {
  model: { target: { norad: number } | null; mode: string; geoArc: { enabled: boolean; beamInGeoArc: boolean }; visible: SkyRow[] } | null;
  dotClientPos(norad: number): { x: number; y: number } | null;
};
type W = {
  __arrayControl?: ArrayHook;
  __rangeWatch?: { linkDrops(): Array<{ atMs: number; servingNorad: number }> };
  signalRange: {
    simulationManager: { groundStations: Array<{ antennas: Array<{ geoArcZone: { contains(az: number, el: number): boolean } | null; lock(n: number): unknown }> }> };
  };
  advanceClock(ms: number): void;
  simClockMs(): number;
};

test.describe('Range Watch: Starlink Interference (phased array terminal)', () => {
  // PR CI has no Cloudflare credentials and no fetched TLE sets; skip like the embed specs.
  test.skip(!existsSync('public/keeptrack/index.html'), 'KeepTrack embed bundle not fetched (public/keeptrack/ missing)');
  test.skip(!existsSync('public/assets/tle-sets/starlink-2026-11/starlink-2026-11.json.gz'), 'TLE set starlink-2026-11 not present');
  test.use({ baseURL: BASE });

  test('plays every objective: handovers, manual lock, GEO zone cycle, outage report', async ({ page, missionControlPage }) => {
    test.setTimeout(420000);
    // Tall enough that every sky-view dot is on screen for mouse clicks
    await page.setViewportSize({ width: 1600, height: 1200 });
    await page.goto(URL_PATH);
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();
    await missionControlPage.openChecklist();
    await missionControlPage.selectGroundStation('CM-01');
    await missionControlPage.selectTab('acu-control');

    const tab = page.locator('.array-control-tab');

    await expect(tab).toBeVisible({ timeout: 30000 });
    await waitForObjectiveComplete(missionControlPage, 'Open Array Control');

    const model = () => page.evaluate(() => (window as unknown as W).__arrayControl?.model ?? null);
    const advance = async (ms: number): Promise<void> => {
      await page.evaluate((d) => (window as unknown as W).advanceClock(d), ms);
      await page.waitForTimeout(1200);
    };

    const done = (title: string): Promise<boolean> =>
      waitForObjectiveComplete(missionControlPage, title, 1500).then(
        () => true,
        () => false
      );

    // (a) two handovers in AUTO
    await expect.poll(async () => (await model())?.target?.norad ?? null, { timeout: 30000 }).not.toBeNull();
    for (let i = 0; i < 60; i++) {
      if (await done('Watch Two Handovers')) break;
      await advance(30_000);
    }
    await waitForObjectiveComplete(missionControlPage, 'Watch Two Handovers');

    // (b) MANUAL, click-lock a Starlink low enough that scan loss passes 1 dB
    const pickLow = async (wantExclusion: boolean): Promise<{ norad: number; x: number; y: number } | null> =>
      page.evaluate((excl) => {
        const hook = (window as unknown as W).__arrayControl!;
        const m = hook.model!;
        const zone = (window as unknown as W).signalRange.simulationManager.groundStations[0].antennas[0].geoArcZone;
        // With the zone off nothing reports inExclusion, so ask the arc itself
        const cand = m.visible.filter((s) => s.inScan && (excl ? !!zone?.contains(s.az, s.el) : !s.inExclusion) && s.norad !== m.target?.norad);
        const withPos = cand.map((s) => ({ norad: s.norad, pos: hook.dotClientPos(s.norad) })).filter((c) => c.pos);

        return withPos.length ? { norad: withPos[0].norad, x: withPos[0].pos!.x, y: withPos[0].pos!.y } : null;
      }, wantExclusion);

    for (let i = 0; i < 40; i++) {
      await tab.locator('[id$="mode-manual"]').click();
      const pick = await pickLow(false);

      if (pick) await page.mouse.click(pick.x, pick.y);
      await page.waitForTimeout(1500);
      if (await done('Lock a Starlink by Hand')) break;
      await advance(60_000);
    }
    await waitForObjectiveComplete(missionControlPage, 'Lock a Starlink by Hand');

    // (c) zone off, lock a Starlink inside the arc, zone back on
    const geo = tab.locator('[id$="geo-switch"]');

    await geo.evaluate((el: HTMLInputElement) => el.click()); // the checklist overlay covers the switch
    for (let i = 0; i < 60; i++) {
      const pick = await pickLow(true);

      if (pick) {
        // The arc dots sit under the checklist overlay, so lock through the terminal; the dot click path is covered above
        await page.evaluate((n) => (window as unknown as W).signalRange.simulationManager.groundStations[0].antennas[0].lock(n), pick.norad);
        await page.waitForTimeout(1500);
        if ((await model())?.geoArc.beamInGeoArc) break;
      }
      await advance(60_000);
    }
    expect((await model())?.geoArc.beamInGeoArc, 'beam entered the GEO arc with the zone off').toBe(true);
    await geo.evaluate((el: HTMLInputElement) => el.click());
    await waitForObjectiveComplete(missionControlPage, 'Test the GEO Protection Zone');

    // (d) back to AUTO, wait for a drop, file the report from the terminal's own log
    await tab.locator('[id$="mode-auto"]').click();
    await advance(120_000);
    const drop = await page.evaluate(() => {
      const w = window as unknown as W;
      const list = w.__rangeWatch?.linkDrops() ?? [];

      return list[list.length - 1] ?? null;
    });

    expect(drop, 'the terminal logged a link drop').not.toBeNull();
    const hhmmss = (ms: number): string => new Date(ms).toISOString().slice(11, 19);

    // Let the clock pass the drop so the window is in the past
    await advance(10_000);
    await page.locator('.condition-form-btn[data-report-form="starlink-outage-report"]').click();
    const dialog = page.locator('form[data-report-form="starlink-outage-report"]');
    const file = async (norad: number, start: number, end: number): Promise<string> => {
      await dialog.locator('input[data-field="norad"]').fill(String(norad));
      await dialog.locator('input[data-field="start"]').fill(hhmmss(start));
      await dialog.locator('input[data-field="end"]').fill(hhmmss(end));
      await dialog.locator('[data-report-submit]').click();

      return (await dialog.locator('[data-report-result]').textContent()) ?? '';
    };

    expect(await file(drop!.servingNorad, drop!.atMs - 30 * 60_000, drop!.atMs + 2000)).toContain('longer than 10 minutes');
    expect(await file(1, drop!.atMs - 60_000, drop!.atMs + 2000)).toContain('not');
    expect(await file(drop!.servingNorad, drop!.atMs - 60_000, drop!.atMs + 2000)).toContain('Report accepted');
    // The last objective ends the mission: the completion dialog replaces the checklist
    await expect(page.getByRole('dialog', { name: 'Mission complete' })).toBeVisible({ timeout: 45000 });
  });
  test('handover prediction looks ahead, moves toward now and only lists Starlinks', async ({ page, missionControlPage }) => {
    test.setTimeout(180000);
    await page.goto(URL_PATH);
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();
    await missionControlPage.selectGroundStation('CM-01');
    await missionControlPage.selectTab('acu-control');
    await expect(page.locator('.array-control-tab')).toBeVisible({ timeout: 30000 });

    type Pred = { simMs: number; predictedUntilMs: number; handovers: Array<{ atMs: number; toNorad: number | null; toName: string }>; visible: Array<{ name: string }> };
    const read = (): Promise<Pred | null> => page.evaluate(() => ((window as unknown as { __arrayControl?: { model: unknown } }).__arrayControl?.model as Pred | null) ?? null);

    // Wait for the first worker look-ahead to land
    await expect.poll(async () => ((await read())?.handovers.length ?? 0) > 0, { timeout: 60000 }).toBe(true);
    const before = (await read())!;
    const first = before.handovers[0];

    expect(first.atMs).toBeGreaterThan(before.simMs);
    expect(before.predictedUntilMs).toBeGreaterThan(before.simMs + 300_000);

    await page.evaluate(() => (window as unknown as W).advanceClock(60_000));
    await page.waitForTimeout(1500);
    // A fresh prediction after the jump, not the old one
    await expect.poll(async () => (await read())?.predictedUntilMs ?? 0, { timeout: 30000 }).toBeGreaterThan(before.predictedUntilMs + 30_000);
    const after = (await read())!;
    const nowMs = after.simMs;
    const same = after.handovers.find((h) => h.atMs === first.atMs || (h.toNorad === first.toNorad && Math.abs(h.atMs - first.atMs) <= 30_000));

    // The same handover is about 60 s closer, or it has already happened
    if (first.atMs > nowMs) {
      expect(same, 'first handover still predicted').toBeTruthy();
      expect(first.atMs - before.simMs - (same!.atMs - nowMs)).toBeGreaterThan(30_000);
    }
    for (const h of [...before.handovers, ...after.handovers]) {
      expect(h.toName).not.toContain('KU-SAT');
    }
    expect(after.visible.every((v) => !v.name.includes('KU-SAT'))).toBe(true);
    await expect(page.locator('.array-strip-seg[title*="KU-SAT"]')).toHaveCount(0);
  });

  test('the handover strip shows no long coverage gaps and matches brute force', async ({ page, missionControlPage }) => {
    test.setTimeout(240000);
    await page.goto(URL_PATH);
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();
    await missionControlPage.selectGroundStation('CM-01');
    await missionControlPage.selectTab('acu-control');
    await expect(page.locator('.array-control-tab')).toBeVisible({ timeout: 30000 });

    type Model = { simMs: number; predictedUntilMs: number; target: { norad: number } | null; handovers: Array<{ atMs: number; toNorad: number | null }> };
    const read = (): Promise<Model | null> => page.evaluate(() => ((window as unknown as { __arrayControl?: { model: unknown } }).__arrayControl?.model as Model | null) ?? null);
    const SPAN = 600_000;

    /** Strip no-coverage ms inside [now, now + SPAN], from the prediction the page draws. */
    const stripGapMs = (m: Model): number => {
      let state: number | null = m.target?.norad ?? null;
      let cursor = m.simMs;
      let gap = 0;
      const end = Math.min(m.simMs + SPAN, m.predictedUntilMs);

      for (const h of m.handovers) {
        const at = Math.min(end, Math.max(cursor, h.atMs));

        if (state === null) {
          gap += at - cursor;
        }
        cursor = at;
        state = h.toNorad;
      }
      if (state === null) {
        gap += end - cursor;
      }

      return gap;
    };

    /** Brute force: time with no served Starlink inside the scan cone and outside the GEO zone, 15 s grid, every member. */
    const bruteGapMs = (): Promise<number> =>
      page.evaluate(async (span) => {
        const w = window as unknown as {
          simClockMs(): number;
          signalRange: {
            simulationManager: {
              scheduler: {
                anyService: { lookAhead(r: unknown): Promise<{ norads: number[]; count: number; data: Float32Array }> };
                registry: { memberNoradIds(): Int32Array; memberName(i: number): string };
              };
              groundStations: Array<{
                antennas: Array<{ panelGeometry: { isInScanCone(az: number, el: number): boolean }; geoArcZone: { contains(az: number, el: number): boolean } | null }>;
              }>;
            };
          };
        };
        const sim = w.signalRange.simulationManager;
        const reg = sim.scheduler.registry;
        const ids = reg.memberNoradIds();
        const served: number[] = [];

        for (let i = 0; i < ids.length; i++) {
          if (reg.memberName(i).startsWith('STARLINK')) {
            served.push(ids[i]);
          }
        }
        const ant = sim.groundStations[0].antennas[0];
        const step = 15_000;
        const count = Math.floor(span / step) + 1;
        const grid = await sim.scheduler.anyService.lookAhead({ noradIds: served, station: 0, startMs: w.simClockMs(), stepMs: step, count });
        let gap = 0;

        for (let i = 0; i < count - 1; i++) {
          let covered = false;

          for (let k = 0; k < grid.norads.length && !covered; k++) {
            const el = grid.data[(k * grid.count + i) * 2];
            const az = grid.data[(k * grid.count + i) * 2 + 1];

            covered = el > 0 && ant.panelGeometry.isInScanCone(az, el) && !(ant.geoArcZone?.contains(az, el) ?? false);
          }
          if (!covered) {
            gap += step;
          }
        }

        return gap;
      }, SPAN);

    const results: Array<{ atMin: number; strip: number; truth: number }> = [];

    for (let minute = 0; minute <= 6; minute += 3) {
      if (minute > 0) {
        await page.evaluate((d) => (window as unknown as W).advanceClock(d), 180_000);
        await page.waitForTimeout(1500);
      }
      await expect
        .poll(
          async () => {
            const m = await read();
            return m !== null && m.target !== null && m.predictedUntilMs >= m.simMs + SPAN - 20_000;
          },
          { timeout: 60000 }
        )
        .toBe(true);
      const m = (await read())!;

      results.push({ atMin: minute, strip: stripGapMs(m) / SPAN, truth: (await bruteGapMs()) / SPAN });
    }
    console.log('coverage gaps (fraction of 10 min)', JSON.stringify(results));
    for (const r of results) {
      expect(r.strip, `strip gap at +${r.atMin} min`).toBeLessThan(0.1);
      // The strip may lose a few seconds to beam outages and the 15 s grid, never invent a long gap
      expect(r.strip - r.truth, `strip gap beyond brute force at +${r.atMin} min`).toBeLessThan(0.03);
    }
  });
});
