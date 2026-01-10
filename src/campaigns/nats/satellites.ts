import { Satellite, TransponderConfig } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { FECType, Hertz, ModulationType, RfFrequency, dBi, dBm } from '@app/types';
import type { Degrees } from 'ootk';

export const tidemark1Satellite = new Satellite(
  'TIDEMARK-1',
  61525,
  [
    // Uplink signals - routed to transponders based on frequency and polarization
    {
      signalId: 'TIDEMARK-1-TDMA-Composite',
      serverId: 1,
      noradId: 61525,
      frequency: 5943e6 as RfFrequency,
      polarization: 'H',
      power: 20 as dBm,
      bandwidth: 36e6 as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    }
  ],
  [], // Beacons now defined in transponderConfigs
  {
    az: 161.8 as Degrees,
    el: 34.2 as Degrees,
    rotation: 14 as Degrees,
    frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
    // Ephemeris error: simulates TLE inaccuracy (~3 dB loss without step-track)
    ephemerisErrorAz: 0.12 as Degrees,
    ephemerisErrorEl: 0.08 as Degrees,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 5943e6 as RfFrequency, // Passband: 5925-5961 MHz
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3718 MHz
        polarization: 'H',
        beacon: {
          frequency: 4175.5e6 as RfFrequency,
          signalId: 'TIDEMARK-1-Beacon',
          serverId: 1,
          noradId: 61525,
          power: 40 as dBm,
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
      {
        id: 'TP-2',
        uplinkCenterFrequency: 5906e6 as RfFrequency, // Passband: 5963-5999 MHz
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3756 MHz
        polarization: 'H',
        // No beacon for TP-2
      } as TransponderConfig,
    ],
  }
);

export const tidemark2Satellite = new Satellite(
  'TIDEMARK-2',
  61526,
  [
    // Uplink signals - routed to transponders based on frequency and polarization
    {
      signalId: 'TIDEMARK-2-TDMA-Composite',
      serverId: 1,
      noradId: 61526,
      frequency: 6017e6 as RfFrequency,
      polarization: 'H',
      power: 20 as dBm,
      bandwidth: 36e6 as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    }
  ],
  [], // Beacons now defined in transponderConfigs
  {
    az: 219.7 as Degrees,
    el: 26.3 as Degrees,
    rotation: -25 as Degrees,
    frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
    // Ephemeris error: simulates TLE inaccuracy
    ephemerisErrorAz: 0.10 as Degrees,
    ephemerisErrorEl: 0.06 as Degrees,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 6017e6 as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        beacon: {
          frequency: 4180e6 as RfFrequency,
          signalId: 'TIDEMARK-2-Beacon',
          serverId: 1,
          noradId: 61526,
          power: 41 as dBm,
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
      {
        id: 'TP-2',
        uplinkCenterFrequency: 5980e6 as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        // No beacon for TP-2
      } as TransponderConfig,
    ],
  }
);

export const ses10Satellite = new Satellite(
  'SES-10',
  42432,
  [
    // Uplink signals - routed to transponders based on frequency and polarization
    {
      signalId: 'SES-10-TDMA-Composite',
      serverId: 1,
      noradId: 42432,
      frequency: 5869e6 as RfFrequency,
      polarization: 'H',
      power: 23 as dBm,
      bandwidth: 36e6 as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    }
  ],
  [], // Beacons now defined in transponderConfigs
  {
    az: 151.8 as Degrees,
    el: 34.2 as Degrees,
    rotation: 34 as Degrees,
    frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
    // Ephemeris error: simulates TLE inaccuracy
    ephemerisErrorAz: 0.15 as Degrees,
    ephemerisErrorEl: 0.10 as Degrees,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 5869e6 as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        beacon: {
          frequency: 4178e6 as RfFrequency,
          signalId: 'SES-10-Beacon',
          serverId: 1,
          noradId: 42432,
          power: 41 as dBm,
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
      {
        id: 'TP-2',
        uplinkCenterFrequency: 5832e6 as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        // No beacon for TP-2
      } as TransponderConfig,
    ],
  }
);

/**
 * AURORA-7: Legacy satellite with inclined (geosynchronous) orbit
 *
 * An aging C-band communications satellite that has stopped north-south
 * station-keeping to conserve fuel. The orbit is now inclined ~3°, causing
 * the satellite to trace a figure-8 pattern in azimuth/elevation as seen
 * from ground stations. Requires step-track mode for reliable tracking.
 *
 * Frequency Plan:
 * - Uplink RF: 5830 MHz (TP-1 center)
 * - Downlink RF: 3605 MHz (5830 - 2225 offset)
 * - Beacon RF: 4165 MHz (CW)
 * - Bandwidth: 24 MHz (narrower than newer satellites)
 *
 * With VT-01 LNB LO at 5250 MHz:
 * - Beacon IF: 1085 MHz (5250 - 4165)
 * - Downlink IF: 1645 MHz (5250 - 3605)
 *
 * With BUC LO at 4925 MHz:
 * - TX IF: 905 MHz (5830 - 4925)
 */
export const aurora7Satellite = new Satellite(
  'AURORA-7',
  28899, // Fictional NORAD ID
  [
    // Uplink signal - routed to transponder based on frequency and polarization
    {
      signalId: 'AURORA-7-TDMA-Composite',
      serverId: 1,
      noradId: 28899,
      frequency: 5830e6 as RfFrequency,
      polarization: 'H',
      power: 18 as dBm, // Slightly lower power for legacy bird
      bandwidth: 24e6 as Hertz, // Narrower bandwidth
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    }
  ],
  [], // Beacons defined in transponderConfigs
  {
    az: 190 as Degrees, // Center position
    el: 32 as Degrees,
    rotation: 0 as Degrees,
    frequencyOffset: 2.225e9 as Hertz,
    // Ephemeris error: larger for inclined orbit (TLE is harder to predict)
    ephemerisErrorAz: 0.20 as Degrees,
    ephemerisErrorEl: 0.15 as Degrees,
    orbitType: 'geosynchronous',
    geosyncConfig: {
      minAz: 187 as Degrees, // ±3° azimuth drift
      maxAz: 193 as Degrees,
      minEl: 29 as Degrees, // ±3° elevation drift
      maxEl: 35 as Degrees,
    },
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 5830e6 as RfFrequency,
        bandwidth: 24e6 as Hertz, // Narrower than TIDEMARK
        frequencyOffset: 2.225e9 as Hertz, // Downlink at 3605 MHz
        polarization: 'H',
        beacon: {
          frequency: 4165e6 as RfFrequency,
          signalId: 'AURORA-7-Beacon',
          serverId: 1,
          noradId: 28899,
          power: 38 as dBm, // Slightly weaker beacon (aging satellite)
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
  }
);
