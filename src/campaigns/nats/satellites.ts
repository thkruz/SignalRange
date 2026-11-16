import { Satellite, type SignalDegradationConfig, TransponderConfig } from '@app/equipment/satellite/satellite';
import type { TransponderPhysics } from '@app/equipment/satellite/transponder-model';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * The station every authored az/el in this campaign is written for: VT-01
 * (ground-stations.ts). Phase 19.4 derives each satellite's slot from it, so
 * ME-02 sees the real geometric difference (nats-s03-F2). The polarization
 * skew is derived per station from that slot (Phase 29 D8,
 * geoPolarizationSkewDeg); no satellite here authors a `rotation`.
 */
export const VERMONT_LOOK_ANGLE_SITE = { latitude: 44.5588, longitude: -72.5778, elevationM: 210 };

/**
 * Campaign 1 C-band transponder physics (phase 19.3). SFD and G/T are the
 * same for every TIDEMARK-era bird at the New England contour; the saturated
 * EIRP toward the region is per satellite, set so each TDMA composite keeps
 * its pre-19.3 downlink (TIDEMARK 27, SES-10 30, AURORA-7 25 dBW). VT-01's
 * own carrier at its authored operating point (HPA 50 dBm, 10 dB back-off
 * from P1dB) arrives about 3 dB under single-carrier saturation, the
 * operating point.
 *
 * Phase 27: the TDMA-composite stand-ins are gone. The downlink at the hub
 * carrier's frequency is only what VT-01 or ME-02 actually radiates; a bird
 * nobody is uplinking shows its beacon and third-party carriers only.
 */
export const C1_SFD_DBW_M2 = -88.5;
export function c1TransponderPhysics(satEirpDbw: number): Partial<TransponderPhysics> {
  return { sfdDbwM2: C1_SFD_DBW_M2, gOverTDbK: 0, satEirpDbw, amplifier: 'twta', gainMode: 'fgm' };
}

/**
 * TIDEMARK-1 as the roster flies it. A scenario that needs its own fade (S20's
 * marginal clear-sky link) passes a degradation override and gets a separate
 * instance; every other scenario shares `tidemark1Satellite`.
 */
export function createTidemark1Satellite(degradationConfig?: Partial<SignalDegradationConfig>): Satellite {
  return new Satellite(
    'TIDEMARK-1',
    61525,
    [], // No authored uplinks: the hub carrier is whatever VT-01 / ME-02 radiates (phase 27)
    [], // Beacons now defined in transponderConfigs
    {
      ...(degradationConfig ? { degradationConfig } : {}),
      // 53 W from VT-01 (Phase 28, D4: computed with geoLookAngles, was 161.8 / 34.2)
      az: 153.1 as Degrees,
      el: 35.1 as Degrees,
      // Polarization skew (rotation) is derived from geometry (Phase 29 D8): geoPolarizationSkewDeg
      frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
      // Ephemeris error: simulates TLE inaccuracy (~3 dB loss without step-track)
      ephemerisErrorAz: 0.12 as Degrees,
      ephemerisErrorEl: 0.08 as Degrees,
      lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
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
            bandwidth: 10 as Hertz, // CW: short-term linewidth (oscillator stability + Doppler), far under any RBW
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
          uplinkCenterFrequency: 5906e6 as RfFrequency, // Passband: 5888-5924 MHz
          physics: c1TransponderPhysics(27),
          bandwidth: 36e6 as Hertz,
          frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3681 MHz
          polarization: 'H',
          // No beacon for TP-2
        } as TransponderConfig,
      ],
    }
  );
}

export const tidemark1Satellite = createTidemark1Satellite();

export const tidemark2Satellite = new Satellite(
  'TIDEMARK-2',
  61526,
  [], // No authored uplinks: the hub carrier is whatever VT-01 / ME-02 radiates (phase 27)
  [], // Beacons now defined in transponderConfigs
  {
    // 45 W, south-east of VT-01 (Phase 28, D4: computed with geoLookAngles, was 219.7 / 26.3)
    az: 143.3 as Degrees,
    el: 31.8 as Degrees,
    // Polarization skew (rotation) is derived from geometry (Phase 29 D8): geoPolarizationSkewDeg
    frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
    // Ephemeris error: simulates TLE inaccuracy
    ephemerisErrorAz: 0.1 as Degrees,
    ephemerisErrorEl: 0.06 as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 6017e6 as RfFrequency, // Passband: 5999-6035 MHz
        physics: c1TransponderPhysics(27),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3792 MHz
        polarization: 'H',
        beacon: {
          frequency: 4180e6 as RfFrequency,
          signalId: 'TIDEMARK-2-Beacon',
          serverId: 1,
          noradId: 61526,
          power: 31 as dBm,
          bandwidth: 10 as Hertz, // CW: short-term linewidth (oscillator stability + Doppler), far under any RBW
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
        uplinkCenterFrequency: 5980e6 as RfFrequency, // Passband: 5962-5998 MHz
        physics: c1TransponderPhysics(27),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3755 MHz
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
 * between TIDEMARK-2 (45°W) and TIDEMARK-1 (53°W). Standard 36 MHz C-band
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
  [], // No authored uplinks: the hub carrier is whatever VT-01 / ME-02 radiates (phase 27)
  [], // Beacons defined in transponderConfigs
  {
    // 47 W from VT-01 (Phase 28, D4: computed with geoLookAngles, was 140.5 / 37.8)
    az: 145.7 as Degrees,
    el: 32.7 as Degrees,
    // Polarization skew (rotation) is derived from geometry (Phase 29 D8): geoPolarizationSkewDeg
    frequencyOffset: 2.225e9 as Hertz,
    // Ephemeris error: smallest of the constellation (newest bird, freshest TLE)
    ephemerisErrorAz: 0.1 as Degrees,
    ephemerisErrorEl: 0.07 as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
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
          bandwidth: 10 as Hertz, // CW: short-term linewidth (oscillator stability + Doppler), far under any RBW
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
    // 67 W from VT-01 (Phase 28, D4: computed with geoLookAngles, was 151.8 / 34.2, a 52 W slot)
    az: 172.1 as Degrees,
    el: 38.4 as Degrees,
    // Polarization skew (rotation) is derived from geometry (Phase 29 D8): geoPolarizationSkewDeg
    frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
    // Ephemeris error: simulates TLE inaccuracy
    ephemerisErrorAz: 0.15 as Degrees,
    ephemerisErrorEl: 0.1 as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 5869e6 as RfFrequency, // Passband: 5851-5887 MHz
        physics: c1TransponderPhysics(30),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3644 MHz
        polarization: 'H',
        beacon: {
          frequency: 4178e6 as RfFrequency,
          signalId: 'SES-10-Beacon',
          serverId: 1,
          noradId: 42432,
          power: 31 as dBm,
          bandwidth: 10 as Hertz, // CW: short-term linewidth (oscillator stability + Doppler), far under any RBW
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
        uplinkCenterFrequency: 5832e6 as RfFrequency, // Passband: 5814-5850 MHz
        physics: c1TransponderPhysics(30),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3607 MHz
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
  [], // No authored uplinks: the hub carrier is whatever VT-01 / ME-02 radiates (phase 27)
  [], // Beacons defined in transponderConfigs
  {
    az: 190 as Degrees, // Center position
    el: 32 as Degrees,
    // Polarization skew (rotation) is derived from geometry (Phase 29 D8): geoPolarizationSkewDeg
    frequencyOffset: 2.225e9 as Hertz,
    // Ephemeris error: larger for inclined orbit (TLE is harder to predict)
    ephemerisErrorAz: 0.2 as Degrees,
    ephemerisErrorEl: 0.15 as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
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
          bandwidth: 10 as Hertz, // CW: short-term linewidth (oscillator stability + Doppler), far under any RBW
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
