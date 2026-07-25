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
 * TLE epochs are authored for the 2027-03-15 14:00:00 UTC scenario start
 * (via scripts/author-passes.mjs):
 * - MERIDIAN-SAR-1: AOS T+2.0 min, max el 28.0 deg at T+6.7, LOS T+11.5 min
 * - MERIDIAN-SAR-2: AOS T+17.5 min, max el 25.0 deg at T+22.2, LOS T+26.9 min
 * Both make follow-up passes ~93+ min later for multi-contact planning.
 *
 * The geometry pairs a low, strong orbit (mean motion 15.6, ~360 km -> ~760 km
 * slant range at max el, ample C/N margin) with a modest max elevation
 * (~25-28 deg). At the LEO tracker's realistic 20 deg/s slew (see
 * KU_BAND_4M_LEO_TRACKER) the pedestal holds the narrow (~0.45 deg) Ku beam on
 * the bird within the ephemeris-error floor (~0.1 deg) through the whole pass,
 * so C/N peaks at max elevation as expected. A higher or near-zenith pass grows
 * a pointing lag (and ultimately an azimuth keyhole, rate -> infinity at the
 * zenith) that craters C/N at culmination; that steep-pass case is verified as
 * a regression in test/campaigns/nats-eu-rf-validation.test.ts and reserved as
 * a dedicated later-scenario lesson (see the campaign design plan).
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
    tle2: '2 61701  97.2000 176.0000 0010000  90.0000   8.0000 15.60000000123454' as TleLine2,
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
          // Ku telemetry beacon (CW). Must stay OUTSIDE the video carrier's
          // occupied band (11686 +/- 18 MHz): a CW tone inside a ~23 dB
          // stronger co-channel carrier is blocked by the antenna's
          // adjacency filter (Phase A RF validation finding).
          frequency: 11711e6 as RfFrequency,
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
        // Direct-transmit SAR imagery downlink (modeled as a transponder beacon).
        // 28 dBm EIRP closes the link at C/N >= 8 dB from ~20 deg elevation
        // (peak ~14 dB at max el) on the GW-01 4m Ku tracker; the original
        // 22 dBm peaked at 8.1 dB with zero margin (Phase A RF validation).
        beacon: {
          frequency: 11686e6 as RfFrequency,
          signalId: 'MERIDIAN-SAR-1-VIDEO',
          serverId: 1,
          noradId: 61701,
          power: 28 as dBm,
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
    tle2: '2 61702  98.4000  42.0000 0010000  90.0000 240.0000 15.60000000123458' as TleLine2,
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
        // 28 dBm EIRP for the same link-closure reason as SAR-1 (SAR-2 flies
        // ~100 km higher, so it peaked at only 6.8 dB C/N at 22 dBm).
        beacon: {
          frequency: 11730e6 as RfFrequency,
          signalId: 'MERIDIAN-SAR-2-VIDEO',
          serverId: 1,
          noradId: 61702,
          power: 28 as dBm,
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
