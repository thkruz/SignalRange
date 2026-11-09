import { existsSync } from 'node:fs';
import { geoBeaconHz } from '../../src/simulation/geo-beacon';
import { expect, test } from '../fixtures/test-fixtures';
import { waitForObjectiveComplete } from '../utils/ham-sdr-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

// The embed licence is domain-locked: 127.0.0.1 is not licensed, localhost is.
const BASE = process.env.SR_E2E_BASE ?? 'http://localhost:3000';

test.describe('Range Watch: GEO Belt Survey', () => {
  // PR CI has no Cloudflare credentials and no fetched TLE sets; skip like the embed specs.
  test.skip(!existsSync('public/keeptrack/index.html'), 'KeepTrack embed bundle not fetched (public/keeptrack/ missing)');
  test.skip(!existsSync('public/assets/tle-sets/geo-belt-2026-11/geo-belt-2026-11.json.gz'), 'TLE set geo-belt-2026-11 not present');
  test.use({ baseURL: BASE });

  test('loads, opens the World Map, pins a member and completes the first objective', async ({ page, missionControlPage }) => {
    test.setTimeout(240000);
    await page.goto('/campaigns/range-watch/scenarios/geo-belt-survey');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();

    await missionControlPage.openChecklist();
    await missionControlPage.selectTab('ground-track');
    await expect(page.locator('#kt-embed-host')).toBeVisible({ timeout: 60000 });
    await waitForObjectiveComplete(missionControlPage, 'Open the World Map');

    // Pin the first member of the real set; the registry is the same one the asset tree pins through.
    const pinned = await page.evaluate(() => {
      const sm = (
        window as unknown as {
          signalRange: { simulationManager: { registry: { memberNoradIds(): Int32Array; pin(n: number): boolean; pinnedCount: number; memberCount: number } } };
        }
      ).signalRange.simulationManager;
      const ok = sm.registry.pin(sm.registry.memberNoradIds()[0]);

      return { ok, count: sm.registry.pinnedCount, members: sm.registry.memberCount };
    });

    expect(pinned.ok).toBe(true);
    expect(pinned.count).toBe(1);
    expect(pinned.members).toBeGreaterThan(900);
    await waitForObjectiveComplete(missionControlPage, 'Pin a GEO Satellite');
  });

  test('tunes a satellite beacon and confirms which satellite it is', async ({ page, missionControlPage }) => {
    test.setTimeout(150000);
    await page.goto('/campaigns/range-watch/scenarios/geo-belt-survey');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();
    await missionControlPage.openChecklist();
    await missionControlPage.selectTab('ground-track');
    await expect(page.locator('#kt-embed-host')).toBeVisible({ timeout: 60000 });

    // Pick a visible slot with a beacon that no neighbour within 3 degrees shares, and pin it
    const pick = await page.evaluate(() => {
      const w = window as unknown as {
        signalRange: { simulationManager: { registry: { pin(n: number): boolean }; satellites: Array<{ noradId: number; az: number; el: number }> } };
      };
      const sats = w.signalRange.simulationManager.satellites.filter((s) => s.el > 10);

      return sats.map((s) => ({ norad: s.noradId, az: s.az, el: s.el }));
    });
    const sep = (a: { az: number; el: number }, b: { az: number; el: number }): number => {
      const r = Math.PI / 180;
      const c = Math.sin(a.el * r) * Math.sin(b.el * r) + Math.cos(a.el * r) * Math.cos(b.el * r) * Math.cos((a.az - b.az) * r);

      return Math.acos(Math.min(1, Math.max(-1, c))) / r;
    };
    const target = pick.find((s) => pick.every((o) => o.norad === s.norad || sep(s, o) > 3 || Math.abs(geoBeaconHz(o.norad) - geoBeaconHz(s.norad)) > 1.5e6));

    expect(target, 'a visible GEO satellite with a unique beacon').toBeDefined();
    const beaconMHz = geoBeaconHz(target!.norad) / 1e6;

    await page.evaluate((n) => {
      const sm = (window as unknown as { signalRange: { simulationManager: { registry: { pin(n: number): boolean } } } }).signalRange.simulationManager;

      sm.registry.pin(n);
    }, target!.norad);
    await waitForObjectiveComplete(missionControlPage, 'Pin a GEO Satellite');

    // Slew is slow in real time: set the dish state onto the slot directly
    await page.evaluate((t) => {
      const st = (window as unknown as { signalRange: { simulationManager: { groundStations: Array<{ antennas: Array<{ state: Record<string, number> }> }> } } }).signalRange
        .simulationManager.groundStations[0].antennas[0].state;

      st.azimuth = t.az;
      st.elevation = t.el;
      st.targetAzimuth = t.az;
      st.targetElevation = t.el;
    }, target!);
    await waitForObjectiveComplete(missionControlPage, 'Point the Dish at It');

    await missionControlPage.selectGroundStation('HD-01');
    await missionControlPage.selectTab('rx-analysis');
    await waitForObjectiveComplete(missionControlPage, 'Read the Carriers');

    // Tune modem 1 onto the beacon: IF = 13100 - RF, 1 MHz wide
    await page.evaluate((mhz) => {
      const rx = (
        window as unknown as {
          signalRange: {
            simulationManager: {
              groundStations: Array<{
                receivers: Array<{ handleModemFrequencyChange(n: number, f: number): void; handleModemConfigChange(n: number, c: { bandwidthMHz: number }): void }>;
              }>;
            };
          };
        }
      ).signalRange.simulationManager.groundStations[0].receivers[0];

      rx.handleModemConfigChange(1, { bandwidthMHz: 1 });
      rx.handleModemFrequencyChange(1, 13100 - mhz);
    }, beaconMHz);
    await waitForObjectiveComplete(missionControlPage, 'Tune a Beacon');

    // File the beacon ID, after one wrong answer
    await page.locator('.condition-form-btn[data-report-form="geo-beacon-report"]').click();
    const dialog = page.locator('form[data-report-form="geo-beacon-report"]');
    const result = dialog.locator('[data-report-result]');

    await dialog.locator('input[data-field="norad"]').fill('1');
    await dialog.locator('[data-report-submit]').click();
    await expect(result).toContainText('not the satellite');
    await dialog.locator('input[data-lookup-input]').fill(String(target!.norad));
    await expect(dialog.locator('[data-lookup-out]')).toContainText(beaconMHz.toFixed(1));
    await dialog.locator('input[data-field="norad"]').fill(String(target!.norad));
    await dialog.locator('[data-report-submit]').click();
    await expect(result).toContainText('Confirmed');
    await waitForObjectiveComplete(missionControlPage, 'Confirm Which Satellite It Is');
  });
});
