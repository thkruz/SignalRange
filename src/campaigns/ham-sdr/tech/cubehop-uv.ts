/**
 * @file cubehop-uv - Satellite for C3 Technician S11 "A Contact Through Space"
 * @description CUBEHOP-UV is a simulation fixture on the CUBEHOP-1 orbit (NORAD 63002 in the authored
 * campaign catalog). The ham station manager supplies the uplink, downlink and beacon behavior, so
 * the orbital object only provides pass geometry (azimuth, elevation, range, Doppler).
 * With the S11 start time of 2027-06-19 16:13 the first pass rises about 5 minutes later and
 * peaks near 48 degrees.
 */

import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { Degrees } from 'ootk';
import { backyardObserver, CUBEHOP1_TLE1, CUBEHOP1_TLE2 } from '../satellites';

export const CUBEHOP_UV_NORAD = 63002;

/** Fresh instance per scenario run; options objects are never shared */
export const makeCubehopUvSatellite = (): OrbitalSatellite =>
  new OrbitalSatellite(
    'CUBEHOP-UV',
    CUBEHOP_UV_NORAD,
    [],
    [],
    { tle1: CUBEHOP1_TLE1, tle2: CUBEHOP1_TLE2, observer: backyardObserver },
    { rotation: 0 as Degrees, ephemerisErrorAz: 0.1 as Degrees, ephemerisErrorEl: 0.1 as Degrees, transponderConfigs: [] }
  );
