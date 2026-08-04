import { OrbitalObserver, OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { TransponderConfig } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { FECType, Hertz, ModulationType, RfFrequency, dBi, dBm } from '@app/types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';

/**
 * Campaign 4 (9th EWS / Counter Communications) satellite roster.
 *
 * COBALT-4 is the adversary X-band SATCOM bird the operator must deny. Its
 * transponder carries the adversary's own service uplink, which is relayed to
 * the co-frequency downlink; the operator's jam, once injected into the same
 * uplink passband, degrades that downlink's C/I (the denial effect).
 *
 * SGP4-propagated from a real GEO slot, like Campaign 5's SENTRY birds. It was
 * a fixed-geometry Satellite with authored az 175 / el 30 until phase 9; those
 * two angles cannot both hold for a geostationary bird seen from 34 deg N
 * (azimuth 175 fixes the slot 2.8 deg east of the site meridian, which is 50.4
 * deg of elevation, not 30). A satellite with no ephemeris also cannot appear
 * on the world map or ground track. Authoring the orbit fixed both: azimuth was
 * kept and elevation follows the geometry.
 *
 * TLE authored by scripts/author-tle-ccs.mjs against the 2027-11-05 02:00:00
 * UTC scenario epoch:
 * - slot 115.1W, inclination 0.05 deg -> az 174.9 / el 50.4 from SANDSTORM,
 *   holding to within 0.05 deg across the 3-hour scenario window, so the
 *   authored pointing objectives stay satisfiable at a fixed look angle.
 *
 * X-band plan (mil band: 7.25-7.75 GHz down, 7.9-8.4 GHz up):
 * - Service uplink RF: 8125 MHz (H-pol) -> transponded downlink 7475 MHz
 *   (frequencyOffset 650 MHz)
 * - Telemetry beacon: 7290 MHz (CW) for target ID on the spectrum
 * The jam must land in the 8100-8150 MHz uplink passband to be transponded onto
 * the victim downlink.
 */

/** SANDSTORM transportable EA site (southern California desert) */
export const sandstormObserver: OrbitalObserver = {
  name: 'SANDSTORM Field Site',
  lat: 34.0 as Degrees,
  lon: -118.0 as Degrees,
  alt: 0.4 as Kilometers,
};

export const cobalt4Satellite = new OrbitalSatellite(
  'COBALT-4',
  90042, // Fictional NORAD ID (adversary)
  [
    // Adversary service uplink - the "victim" carrier the jam must overpower.
    // Routed to TP-X1 by frequency + H polarization, then transponded to 7475 MHz.
    {
      signalId: 'COBALT-4-SVC-Uplink',
      serverId: 1,
      noradId: 90042,
      frequency: 8125e6 as RfFrequency,
      polarization: 'H',
      power: 6 as dBm, // At the transponder input (the "S" in J/S)
      bandwidth: 5e6 as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    },
  ],
  [], // Beacon defined on the transponder config
  {
    tle1: '1 90042U 27300A   27309.08333333  .00000010  00000-0  00000-0 0  9995' as TleLine1,
    tle2: '2 90042   0.0500 318.0000 0001000  90.0000 271.0000  1.00273791123459' as TleLine2,
    observer: sandstormObserver,
    isDopplerEnabled: false, // GEO: negligible Doppler; keep the carrier stationary on the SA
  },
  {
    rotation: 0 as Degrees,
    frequencyOffset: 0.65e9 as Hertz, // Legacy fallback
    ephemerisErrorAz: 0.05 as Degrees,
    ephemerisErrorEl: 0.04 as Degrees,
    transponderConfigs: [
      {
        id: 'TP-X1',
        uplinkCenterFrequency: 8125e6 as RfFrequency, // Passband 8100-8150 MHz
        bandwidth: 50e6 as Hertz,
        frequencyOffset: 0.65e9 as Hertz, // Downlink center: 7475 MHz
        polarization: 'H',
        beacon: {
          frequency: 7290e6 as RfFrequency, // X-band telemetry beacon (CW)
          signalId: 'COBALT-4-Beacon',
          serverId: 1,
          noradId: 90042,
          power: 4 as dBm,
          bandwidth: 1e3 as Hertz,
          modulation: 'CW' as ModulationType,
          fec: 'null' as FECType,
          polarization: 'V',
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
