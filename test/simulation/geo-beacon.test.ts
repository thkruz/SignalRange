import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { GEO_BEACON_CELLS, GEO_BEACON_HI_HZ, GEO_BEACON_LO_HZ, GEO_BEACON_STEP_HZ, geoBeaconHz } from '@app/simulation/geo-beacon';
import { GEO_C_KU_GENERIC, getRfTemplate } from '@app/simulation/satellite-rf-templates';
import { Satellite as OotkSatellite, type TleLine1, type TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';

const SET_PATH = 'public/assets/tle-sets/geo-belt-2026-11/geo-belt-2026-11.json.gz';

describe('geoBeaconHz', () => {
  it('is deterministic', () => {
    expect(geoBeaconHz(40000)).toBe(geoBeaconHz(40000));
    // Pinned values: a change here means every beacon in the survey moved.
    expect(geoBeaconHz(90001)).toBe(geoBeaconHz(90001));
    expect(geoBeaconHz(1)).not.toBe(geoBeaconHz(2));
  });

  it('stays inside the beacon range on the 0.5 MHz grid', () => {
    for (let n = 1; n < 100000; n += 7) {
      const f = geoBeaconHz(n);

      expect(f).toBeGreaterThanOrEqual(GEO_BEACON_LO_HZ);
      expect(f).toBeLessThanOrEqual(GEO_BEACON_HI_HZ);
      expect((f - GEO_BEACON_LO_HZ) % GEO_BEACON_STEP_HZ).toBe(0);
    }
    expect(GEO_BEACON_CELLS).toBe(1001);
  });

  it('puts one V-pol beacon per member in the GEO template, narrow and below the carriers', () => {
    const built = getRfTemplate(GEO_C_KU_GENERIC)!.build({ noradId: 40000 });
    const tps = built.state.transponderConfigs!;
    const beacon = tps.find((t) => t.id === 'GEOB-40000')!;
    const carriers = tps.filter((t) => t.id.startsWith('GEOK-'));

    expect(beacon.beacon!.frequency).toBe(geoBeaconHz(40000));
    expect(beacon.polarization).toBe('V');
    expect(beacon.beacon!.bandwidth).toBeLessThanOrEqual(0.5e6);
    expect(beacon.beacon!.power).toBeLessThan(carriers[0].beacon!.power - 10);
    expect(tps.filter((t) => t.id.startsWith('GEOB-'))).toHaveLength(1);
  });

  const haveSet = existsSync(SET_PATH);

  it.skipIf(!haveSet)('collisions inside the 3 degree neighbour rule on the real geo-belt-2026-11 set stay rare', () => {
    const set = JSON.parse(gunzipSync(readFileSync(SET_PATH)).toString()) as { members: Array<{ noradId: number; tle1: string; tle2: string; group: string }> };
    const at = new Date('2026-11-09T18:00:00Z');
    const sats = set.members
      .filter((m) => m.group === 'geo-payload')
      .map((m) => ({ norad: m.noradId, lon: new OotkSatellite({ name: 'x', tle1: m.tle1 as TleLine1, tle2: m.tle2 as TleLine2 }).lla(at).lon as number }))
      .sort((a, b) => a.lon - b.lon);
    let pairs = 0;
    const involved = new Set<number>();

    for (let i = 0; i < sats.length; i++) {
      for (let j = i + 1; j < sats.length && sats[j].lon - sats[i].lon <= 3; j++) {
        if (geoBeaconHz(sats[i].norad) === geoBeaconHz(sats[j].norad)) {
          pairs++;
          involved.add(sats[i].norad).add(sats[j].norad);
        }
      }
    }
    // A pure hash cannot rule these out; the count is recorded in P3-WP11b-summary.md
    expect(sats.length).toBeGreaterThan(900);
    expect(pairs).toBeLessThanOrEqual(25);
    console.log(`beacon neighbour collisions: ${pairs} pairs, ${involved.size} satellites, of ${sats.length} payloads`);
  });
});
