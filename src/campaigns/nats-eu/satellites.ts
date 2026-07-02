import { OrbitalObserver, OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { TransponderConfig } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { FECType, Hertz, ModulationType, RfFrequency, dBi, dBm } from '@app/types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';

/**
 * NATS Europe satellite roster.
 *
 * Unlike the GEO TIDEMARK fleet, these are SGP4-propagated LEO satellites:
 * az/el/range are computed from the TLE against the simulated scenario clock
 * relative to the Galway ground station, with Doppler applied to downlinks.
 *
 * TLE epochs are authored for the 2027-03-15 14:00:00 UTC scenario start:
 * - MERIDIAN-SAR-1: AOS T+2.0 min, max el 88.3 deg at T+8, LOS T+14.5 min
 * - MERIDIAN-SAR-2: AOS T+17.5 min, max el 83.9 deg at T+24, LOS T+31.5 min
 * Both make follow-up passes ~97 min later for multi-contact planning.
 */

/** Galway Ground Station (GW-01) observer used for relative telemetry */
export const galwayObserver: OrbitalObserver = {
  name: 'Galway Ground Station',
  lat: 53.27 as Degrees,
  lon: -9.05 as Degrees,
  alt: 0.02 as Kilometers,
};

export const meridianSar1Satellite = new OrbitalSatellite(
  'MERIDIAN-SAR-1',
  61701,
  [], // No external uplink traffic - downlinks are transmitted directly
  [], // Beacons defined in transponderConfigs
  {
    tle1: '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996' as TleLine1,
    tle2: '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451' as TleLine2,
    observer: galwayObserver,
  },
  {
    rotation: 0 as Degrees,
    ephemerisErrorAz: 0.08 as Degrees,
    ephemerisErrorEl: 0.05 as Degrees,
    transponderConfigs: [
      {
        id: 'TP-CMD',
        uplinkCenterFrequency: 14005e6 as RfFrequency, // Ku telecommand uplink
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.255e9 as Hertz, // Transponded downlink: 11750 MHz
        polarization: 'H',
        beacon: {
          frequency: 11699e6 as RfFrequency, // Ku telemetry beacon (CW)
          signalId: 'MERIDIAN-SAR-1-Beacon',
          serverId: 1,
          noradId: 61701,
          power: 0 as dBm,
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
      {
        id: 'TP-PAYLOAD',
        uplinkCenterFrequency: 14100e6 as RfFrequency, // Unused payload uplink slot
        bandwidth: 40e6 as Hertz,
        frequencyOffset: 2.4e9 as Hertz,
        polarization: 'H',
        // Direct-transmit SAR imagery downlink (modeled as a transponder beacon)
        beacon: {
          frequency: 11686e6 as RfFrequency,
          signalId: 'MERIDIAN-SAR-1-VIDEO',
          serverId: 1,
          noradId: 61701,
          power: 22 as dBm,
          bandwidth: 36e6 as Hertz,
          modulation: 'QPSK' as ModulationType,
          fec: '3/4' as FECType,
          polarization: 'V',
          feed: 'blue-1.mp4',
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        },
      } as TransponderConfig,
    ],
  },
);

export const meridianSar2Satellite = new OrbitalSatellite(
  'MERIDIAN-SAR-2',
  61702,
  [],
  [],
  {
    tle1: '1 61702U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9997' as TleLine1,
    tle2: '2 61702  98.1000  30.0000 0010000  90.0000 236.0000 14.60000000123456' as TleLine2,
    observer: galwayObserver,
  },
  {
    rotation: 0 as Degrees,
    ephemerisErrorAz: 0.06 as Degrees,
    ephemerisErrorEl: 0.07 as Degrees,
    transponderConfigs: [
      {
        id: 'TP-CMD',
        uplinkCenterFrequency: 14035e6 as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.255e9 as Hertz, // Transponded downlink: 11780 MHz
        polarization: 'H',
        beacon: {
          frequency: 11703e6 as RfFrequency,
          signalId: 'MERIDIAN-SAR-2-Beacon',
          serverId: 1,
          noradId: 61702,
          power: 0 as dBm,
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
      {
        id: 'TP-PAYLOAD',
        uplinkCenterFrequency: 14130e6 as RfFrequency,
        bandwidth: 40e6 as Hertz,
        frequencyOffset: 2.4e9 as Hertz,
        polarization: 'H',
        beacon: {
          frequency: 11730e6 as RfFrequency,
          signalId: 'MERIDIAN-SAR-2-VIDEO',
          serverId: 1,
          noradId: 61702,
          power: 22 as dBm,
          bandwidth: 36e6 as Hertz,
          modulation: 'QPSK' as ModulationType,
          fec: '3/4' as FECType,
          polarization: 'V',
          feed: 'blue-2.mp4',
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        },
      } as TransponderConfig,
    ],
  },
);
