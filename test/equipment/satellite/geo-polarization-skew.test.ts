/**
 * Phase 29 D8 (nats-r4-s04-F1): a GEO satellite with a slot takes its linear
 * polarization skew from geometry, not from an authored `rotation`, and every
 * station sees the skew of its own site. One sign convention: from a northern
 * site a slot east of the station is positive.
 */
import { vi } from 'vitest';

let simSatellites: import('@app/equipment/satellite/satellite').Satellite[] = [];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatByNoradId: (noradId: number) => simSatellites.find((sat) => sat.noradId === noradId) ?? null,
      isDeveloperMode: false,
      groundStations: [],
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import { maineGroundStation, vermontGroundStation } from '@app/campaigns/nats/ground-stations';
import { aurora7Satellite, ses10Satellite, tidemark1Satellite, tidemark2Satellite, tidemark3Satellite } from '@app/campaigns/nats/satellites';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { type GeoSite, geoPolarizationSkewDeg } from '@app/simulation/geo-geometry';
import type { Hertz } from '@app/types';
import type { Degrees } from 'ootk';

const VT01: GeoSite = { latitude: 44.5588, longitude: -72.5778, elevationM: 210 };
const ME02_CENTRAL: GeoSite = { latitude: 45.2538, longitude: -69.7657, elevationM: 180 };
const ME02_BANGOR: GeoSite = { latitude: 45.215214, longitude: -68.785507, elevationM: 48 };

/** The skew a station's ACU reads: reference skew plus the station offset */
const skewAt = (sat: Satellite, site: GeoSite): number => (sat.rotation as number) + (sat.stationOffsets(site)?.dRotation ?? 0);

describe('GEO polarization skew from geometry (Phase 29 D8)', () => {
  it('ignores an authored rotation when the satellite has a slot', () => {
    const sat = new Satellite('SKEW', 99001, [], [], {
      az: 153.1 as Degrees,
      el: 35.1 as Degrees,
      rotation: 14 as Degrees,
      frequencyOffset: 2.225e9 as Hertz,
      lookAnglesFrom: VT01,
    });
    expect(sat.rotation as number).toBeCloseTo(geoPolarizationSkewDeg(VT01, sat.slotLongitudeDeg!), 9);
    expect(sat.rotation as number).not.toBeCloseTo(14, 0);
  });

  it('keeps an authored rotation on a satellite without a slot', () => {
    const sat = new Satellite('LEGACY', 99002, [], [], { az: 150 as Degrees, el: 30 as Degrees, rotation: -12 as Degrees, frequencyOffset: 2.225e9 as Hertz });
    expect(sat.rotation).toBe(-12);
  });

  it('gives both TIDEMARK slots east of Vermont a positive skew (TM-1 ~ +18.8, TM-2 ~ +25.2)', () => {
    expect(skewAt(tidemark1Satellite, VT01)).toBeCloseTo(18.8, 0);
    expect(skewAt(tidemark2Satellite, VT01)).toBeCloseTo(25.2, 0);
    expect(skewAt(tidemark2Satellite, VT01)).toBeGreaterThan(skewAt(tidemark1Satellite, VT01));
  });

  it('pins the campaign skew table: every station sees its own site', () => {
    const sats = { 'TM-1': tidemark1Satellite, 'TM-2': tidemark2Satellite, 'TM-3': tidemark3Satellite, 'AURORA-7': aurora7Satellite, 'SES-10': ses10Satellite };
    const sites = { 'VT-01': VT01, 'ME-02 (45.25 N 69.77 W)': ME02_CENTRAL, 'ME-02 (45.22 N 68.79 W)': ME02_BANGOR };
    const table = Object.fromEntries(
      Object.entries(sats).map(([name, sat]) => [
        name,
        {
          slotDegE: Number(sat.slotLongitudeDeg!.toFixed(2)),
          ...Object.fromEntries(Object.entries(sites).map(([siteName, site]) => [siteName, Number(skewAt(sat, site).toFixed(1))])),
        },
      ])
    );
    for (const [name, row] of Object.entries(table)) {
      for (const [siteName, site] of Object.entries(sites)) {
        expect(row[siteName as keyof typeof row], `${name} at ${siteName}`).toBeCloseTo(geoPolarizationSkewDeg(site, sats[name as keyof typeof sats].slotLongitudeDeg!), 1);
      }
    }
    expect(table).toMatchSnapshot();
  });

  it('starts a feed authored on a slotted target at that skew at its own station, ignoring the authored angle', () => {
    EventBus.destroy();
    simSatellites = [tidemark2Satellite];
    const build = (site: GeoSite) => {
      const antenna = new AntennaUIHeadless(
        `skew-${site.longitude}`,
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        {
          ...vermontGroundStation.antennasState![0],
          polarization: -28.4 as Degrees,
          targetPolarization: -28.4 as Degrees,
          targetSatelliteId: tidemark2Satellite.noradId,
        },
        1
      );
      antenna.attachStationLocation(site.latitude, site.longitude, site.elevationM);
      antenna.update(16);
      return antenna.state.polarization as number;
    };
    expect(build(VT01)).toBeCloseTo(skewAt(tidemark2Satellite, VT01), 6);
    const me = maineGroundStation.location;
    const meSite = { latitude: me.latitude, longitude: me.longitude, elevationM: me.elevation };
    expect(build(meSite)).toBeCloseTo(skewAt(tidemark2Satellite, meSite), 6);
    EventBus.destroy();
  });
});
