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
});
