import { OrbitalObserver, OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { TransponderConfig } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { FECType, Hertz, ModulationType, RfFrequency, dBi, dBm } from '@app/types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';

/**
 * Campaign 5 (Signal Hunter) satellite roster.
 *
 * Two SGP4-propagated GEO birds (real az/el/range from TLEs, same physics as
 * Campaign 2's LEO fleet - not the faked figure-8 GEO of Campaign 1). Both are
 * inclined (3.0 / 4.5 deg) so their subpoints trace sizeable daily figure-8s.
 * That N-S velocity is deliberate: it rotates the FDOA gradient off the TDOA
 * gradient so the emitter's LATITUDE is observable (a near-equatorial pair
 * leaves the N-S fix ambiguous), and it makes successive FDOA measurements
 * rotate the line of position so the fix tightens over the collection.
 *
 * TLEs authored by scripts/author-tle-signal-hunter.mjs against the
 * 2027-09-01 06:00:00 UTC scenario epoch (see that script for geometry +
 * TDOA/FDOA observability validation):
 * - SENTRY-7 (victim): slot 100.2W, el 47.1 deg / az 172.5 from the station
 * - SENTRY-9 (adjacent collector): slot 98.1W, el 48.1 deg / az 168.7
 *
 * Frequency plan (C-band):
 * - Allied service carrier: downlink 3785 MHz, H-pol
 * - Hostile uplink jammer (interferenceEvents): 6013 MHz H-pol, inside the
 *   SENTRY-7 transponder passband -> relayed to 3788 MHz downlink
 * - Station LNB LO 5150 MHz: 3785 MHz -> 1365 MHz IF, jammer -> 1362 MHz IF
 */

/** Peterson Annex ground station observer (Colorado) used for relative telemetry */
export const petersonObserver: OrbitalObserver = {
  name: 'Peterson Annex',
  lat: 38.82 as Degrees,
  lon: -104.70 as Degrees,
  alt: 1.9 as Kilometers,
};

/** Victim satellite whose transponder is being jammed. */
export const sentry7Satellite = new OrbitalSatellite(
  'SENTRY-7',
  71001,
  [], // No interactive uplink traffic; the jammer is injected via interferenceEvents
  [], // Downlink carrier defined as a transponder beacon below
  {
    tle1: '1 71001U 27200A   27244.25000000  .00000010  00000-0  00000-0 0  9997' as TleLine1,
    tle2: '2 71001   3.0000 288.0000 0001000  90.0000 312.0000  1.00273791123453' as TleLine2,
    observer: petersonObserver,
    isDopplerEnabled: false, // GEO: negligible Doppler; keep the carrier stationary on the SA
  },
  {
    rotation: 0 as Degrees,
    ephemerisErrorAz: 0.02 as Degrees,
    ephemerisErrorEl: 0.02 as Degrees,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 6010e6 as RfFrequency, // passband 5990-6030 MHz
        bandwidth: 40e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // uplink 6013 -> downlink 3788 (jammer)
        polarization: 'H',
        // Allied service carrier (direct downlink, modeled as a transponder beacon)
        beacon: {
          frequency: 3785e6 as RfFrequency,
          signalId: 'SENTRY-7-SERVICE',
          serverId: 1,
          noradId: 71001,
          power: 20 as dBm,
          bandwidth: 8e6 as Hertz,
          modulation: 'QPSK' as ModulationType,
          fec: '3/4' as FECType,
          polarization: 'H',
          feed: '',
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        },
      } as TransponderConfig,
    ],
  },
);

/** Adjacent satellite used as the sidelobe collector for the correlation pair. */
export const sentry9Satellite = new OrbitalSatellite(
  'SENTRY-9',
  71002,
  [],
  [],
  {
    tle1: '1 71002U 27200A   27244.25000000  .00000010  00000-0  00000-0 0  9998' as TleLine1,
    tle2: '2 71002   4.5000 198.0000 0001000  90.0000  44.0000  1.00273791123452' as TleLine2,
    observer: petersonObserver,
    isDopplerEnabled: false,
  },
  {
    rotation: 0 as Degrees,
    ephemerisErrorAz: 0.02 as Degrees,
    ephemerisErrorEl: 0.02 as Degrees,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 6250e6 as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        beacon: {
          frequency: 4005e6 as RfFrequency,
          signalId: 'SENTRY-9-BEACON',
          serverId: 1,
          noradId: 71002,
          power: 0 as dBm,
          bandwidth: 1e3 as Hertz,
          modulation: 'CW' as ModulationType,
          fec: 'null' as FECType,
          polarization: 'H',
          feed: '',
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        },
      } as TransponderConfig,
    ],
  },
);
