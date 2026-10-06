import { Satellite, TransponderConfig } from '@app/equipment/satellite/satellite';
import type { TransponderPhysics } from '@app/equipment/satellite/transponder-model';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * The station every authored az/el (and rotation) in this campaign is written
 * for: VT-01 (ground-stations.ts). Phase 19.4 derives each satellite's slot
 * from it, so ME-02 sees the real geometric difference (nats-s03-F2).
 */
export const VERMONT_LOOK_ANGLE_SITE = { latitude: 44.5588, longitude: -72.5778, elevationM: 2 };

/**
 * Campaign 1 C-band transponder physics (phase 19.3). SFD and G/T are the
 * same for every TIDEMARK-era bird at the New England contour; the saturated
 * EIRP toward the region is per satellite, set so each TDMA composite keeps
 * its pre-19.3 downlink (TIDEMARK 27, SES-10 30, AURORA-7 25 dBW). VT-01's
 * own carrier at its authored operating point (HPA 50 dBm, 10 dB back-off
 * from P1dB) arrives about 3 dB under single-carrier saturation, the
 * operating point the composite stand-ins are uplinked at too.
 */
export const C1_SFD_DBW_M2 = -88.5;
export function c1TransponderPhysics(satEirpDbw: number): Partial<TransponderPhysics> {
  return { sfdDbwM2: C1_SFD_DBW_M2, gOverTDbK: 0, satEirpDbw, amplifier: 'twta', gainMode: 'fgm' };
}

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
      power: 101.2 as dBm, // uplink EIRP of the hub carrier this composite stands in for (phase 19.3 migration: was 20 dBm 'at the transponder input'; keeps the 26.5 dBW downlink)
      bandwidth: 36e6 as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    },
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
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
    standIns: { 'TIDEMARK-1-TDMA-Composite': 'TIDEMARK-1-Teleport' }, // the station's own carrier replaces the stand-in (phase 19.3)
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 5943e6 as RfFrequency, // Passband: 5925-5961 MHz
        physics: c1TransponderPhysics(27),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3718 MHz
        polarization: 'H',
        beacon: {
          frequency: 4175.5e6 as RfFrequency,
          signalId: 'TIDEMARK-1-Beacon',
          serverId: 1,
          noradId: 61525,
          power: 30 as dBm,
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
        id: 'TP-2',
        uplinkCenterFrequency: 5906e6 as RfFrequency, // Passband: 5963-5999 MHz
        physics: c1TransponderPhysics(27),
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
      power: 101.2 as dBm, // uplink EIRP of the hub carrier this composite stands in for (phase 19.3 migration: was 20 dBm 'at the transponder input'; keeps the 26.5 dBW downlink)
      bandwidth: 36e6 as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    },
  ],
  [], // Beacons now defined in transponderConfigs
  {
    az: 219.7 as Degrees,
    el: 26.3 as Degrees,
    rotation: -25 as Degrees,
    frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
    // Ephemeris error: simulates TLE inaccuracy
    ephemerisErrorAz: 0.1 as Degrees,
    ephemerisErrorEl: 0.06 as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
    standIns: { 'TIDEMARK-2-TDMA-Composite': 'TIDEMARK-2-Teleport' }, // the station's own carrier replaces the stand-in
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 6017e6 as RfFrequency,
        physics: c1TransponderPhysics(27),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        beacon: {
          frequency: 4180e6 as RfFrequency,
          signalId: 'TIDEMARK-2-Beacon',
          serverId: 1,
          noradId: 61526,
          power: 31 as dBm,
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
        id: 'TP-2',
        uplinkCenterFrequency: 5980e6 as RfFrequency,
        physics: c1TransponderPhysics(27),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        // No beacon for TP-2
      } as TransponderConfig,
    ],
  }
);

/**
 * TIDEMARK-3: Newest TIDEMARK constellation bird
 *
 * Commissioned by the overnight commissioning crew post-S8. Sits at 47°W,
 * between TIDEMARK-1 (53°W) and SES-10 (67°W). Standard 36 MHz C-band
 * transponder with H-pol uplink, V-pol beacon.
 *
 * Frequency Plan:
 * - Uplink RF: 5985 MHz (TP-1 center)
 * - Downlink RF: 3760 MHz (5985 - 2225 offset)
 * - Beacon RF: 4172 MHz (CW)
 *
 * With VT-01 LNB LO at 5250 MHz:
 * - Beacon IF: 1078 MHz (5250 - 4172)
 *
 * With VT-01 BUC LO at 7000 MHz:
 * - TX IF: 1015 MHz (7000 - 5985)
 */
export const tidemark3Satellite = new Satellite(
  'TIDEMARK-3',
  61527,
  [
    // Uplink signals - routed to transponders based on frequency and polarization
    {
      signalId: 'TIDEMARK-3-TDMA-Composite',
      serverId: 1,
      noradId: 61527,
      frequency: 5985e6 as RfFrequency,
      polarization: 'H',
      power: 101.2 as dBm, // uplink EIRP of the hub carrier this composite stands in for (phase 19.3 migration: was 20 dBm 'at the transponder input'; keeps the 26.5 dBW downlink)
      bandwidth: 36e6 as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    },
  ],
  [], // Beacons defined in transponderConfigs
  {
    az: 140.5 as Degrees,
    el: 37.8 as Degrees,
    rotation: 8 as Degrees,
    frequencyOffset: 2.225e9 as Hertz,
    // Ephemeris error: smallest of the constellation (newest bird, freshest TLE)
    ephemerisErrorAz: 0.1 as Degrees,
    ephemerisErrorEl: 0.07 as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
    standIns: { 'TIDEMARK-3-TDMA-Composite': 'TIDEMARK-3-Teleport' }, // the station's own carrier replaces the stand-in
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 5985e6 as RfFrequency,
        physics: c1TransponderPhysics(27),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3760 MHz
        polarization: 'H',
        beacon: {
          frequency: 4172e6 as RfFrequency,
          signalId: 'TIDEMARK-3-Beacon',
          serverId: 1,
          noradId: 61527,
          power: 30 as dBm,
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
      power: 101.2 as dBm, // uplink EIRP (phase 19.3 migration: was 23 dBm at the transponder input; keeps the 29.5 dBW downlink)
      bandwidth: 36e6 as Hertz,
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    },
  ],
  [], // Beacons now defined in transponderConfigs
  {
    az: 151.8 as Degrees,
    el: 34.2 as Degrees,
    rotation: 34 as Degrees,
    frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
    // Ephemeris error: simulates TLE inaccuracy
    ephemerisErrorAz: 0.15 as Degrees,
    ephemerisErrorEl: 0.1 as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 5869e6 as RfFrequency,
        physics: c1TransponderPhysics(30),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
        beacon: {
          frequency: 4178e6 as RfFrequency,
          signalId: 'SES-10-Beacon',
          serverId: 1,
          noradId: 42432,
          power: 31 as dBm,
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
        id: 'TP-2',
        uplinkCenterFrequency: 5832e6 as RfFrequency,
        physics: c1TransponderPhysics(30),
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
 * - Uplink RF: 6053 MHz (TP-1 center)
 * - Downlink RF: 3828 MHz (6053 - 2225 offset)
 * - Beacon RF: 4165 MHz (CW)
 * - Bandwidth: 24 MHz (narrower than newer satellites)
 *
 * With VT-01 LNB LO at 5250 MHz:
 * - Beacon IF: 1085 MHz (5250 - 4165)
 * - Downlink IF: 1422 MHz (5250 - 3828)
 *
 * With BUC LO at 7500 MHz:
 * - TX IF: 1447 MHz (7500 - 6053)
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
      frequency: 6053e6 as RfFrequency,
      polarization: 'H',
      power: 101.2 as dBm, // uplink EIRP of the hub carrier (phase 19.3 migration: was 18 dBm at the transponder input; keeps the 24.5 dBW downlink of this legacy bird)
      bandwidth: 24e6 as Hertz, // Narrower bandwidth
      modulation: 'QPSK' as ModulationType,
      fec: '3/4' as FECType,
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.SATELLITE_RX,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    },
  ],
  [], // Beacons defined in transponderConfigs
  {
    az: 190 as Degrees, // Center position
    el: 32 as Degrees,
    rotation: 0 as Degrees,
    frequencyOffset: 2.225e9 as Hertz,
    // Ephemeris error: larger for inclined orbit (TLE is harder to predict)
    ephemerisErrorAz: 0.2 as Degrees,
    ephemerisErrorEl: 0.15 as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
    standIns: { 'AURORA-7-TDMA-Composite': 'AURORA-7-Uplink' }, // the station's own carrier replaces the stand-in
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
        uplinkCenterFrequency: 6053e6 as RfFrequency,
        physics: c1TransponderPhysics(25),
        bandwidth: 24e6 as Hertz, // Narrower than TIDEMARK
        frequencyOffset: 2.225e9 as Hertz, // Downlink at 3828 MHz
        polarization: 'H',
        beacon: {
          frequency: 4165e6 as RfFrequency,
          signalId: 'AURORA-7-Beacon',
          serverId: 1,
          noradId: 28899,
          power: 6 as dBm, // Slightly weaker beacon (aging satellite)
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
  }
);
