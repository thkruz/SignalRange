import { OrbitalObserver, OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { TransponderConfig } from '@app/equipment/satellite/satellite';
import type { TransponderPhysics } from '@app/equipment/satellite/transponder-model';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';

/**
 * CUBEHOP-1's U/V-style linear transponder (phase 19.3): a 1 W SSPA into a
 * near-omni antenna (0 dBW saturated), a whip's G/T, and an SFD set so a
 * backyard uplink (about -105 dBm arriving mid-pass) leaves at roughly
 * beacon strength, a few dB under saturation.
 */
const CUBEHOP_LINEAR_TRANSPONDER: Partial<TransponderPhysics> = { sfdDbwM2: -118, gOverTDbK: -30, satEirpDbw: 0, amplifier: 'sspa', gainMode: 'fgm' };

/**
 * Campaign 3 (Backyard Operator) satellite roster.
 *
 * All receive-only from Riley's backyard: downlinks are direct-transmit
 * "beacons" on transponder configs (no uplink traffic). TLEs are authored
 * against the 2027-06-19 16:00:00 UTC sandbox start with scripts/author-tle.mjs:
 * - WXSAT-19   (137.1 MHz APT):   AOS T+3.0 min, max el 55.0 deg T+10.6, LOS T+18.2
 * - CUBEHOP-1  (435.25 MHz FM):   AOS T+18.0 min, max el 48.2 deg T+24.2, LOS T+30.5
 * - NAVSTAR-77 (1575.42 MHz L1):  MEO, el 89.3 deg at T+0, still 62.2 deg at T+60 min
 *
 * Downlink powers are calibrated from real EIRPs against the fixed-gain
 * antenna model (QFH 3 dBi / crossed yagi 12 dBi / patch 5 dBi) for mid-pass
 * C/N around 20-25 dB; validate live in-app before shipping scored scenarios.
 * NAVSTAR-77 is the exception: real L1 EIRP, ~8 dB under the noise in 2 MHz.
 */

/** Riley's backyard, Burlington VT — observer for all relative telemetry */
export const backyardObserver: OrbitalObserver = {
  name: "Riley's Backyard",
  lat: 44.48 as Degrees,
  lon: -73.21 as Degrees,
  alt: 0.05 as Kilometers,
};

/** NOAA-style polar weather satellite with a 137 MHz APT downlink (RHCP) */
export const wxsat19Satellite = new OrbitalSatellite(
  'WXSAT-19',
  63001,
  [], // receive-only campaign: no uplink traffic
  [], // downlinks defined in transponderConfigs
  {
    tle1: '1 63001U 27042A   27170.66666667  .00001000  00000-0  10000-3 0  9996' as TleLine1,
    tle2: '2 63001  98.7000 242.0000 0010000  90.0000   6.0000 14.19000000123450' as TleLine2,
    observer: backyardObserver,
  },
  {
    rotation: 0 as Degrees,
    ephemerisErrorAz: 0.1 as Degrees,
    ephemerisErrorEl: 0.1 as Degrees,
    transponderConfigs: [
      {
        id: 'APT',
        uplinkCenterFrequency: 148e6 as RfFrequency, // unused command uplink slot
        bandwidth: 34e3 as Hertz,
        frequencyOffset: 0 as Hertz,
        polarization: 'RHCP',
        beacon: {
          frequency: 137.1e6 as RfFrequency,
          signalId: 'WXSAT-19-APT',
          serverId: 1,
          noradId: 63001,
          power: 36 as dBm, // ~5 W APT transmitter + antenna gain
          bandwidth: 34e3 as Hertz,
          modulation: 'BPSK' as ModulationType,
          fec: '1/2' as FECType,
          polarization: 'RHCP',
          feed: 'blue-1.mp4', // placeholder for APT weather imagery
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        },
      } as TransponderConfig,
    ],
  }
);

export const CUBEHOP1_TLE1 = '1 63002U 27042A   27170.66666667  .00001000  00000-0  10000-3 0  9997' as TleLine1;
export const CUBEHOP1_TLE2 = '2 63002  97.5000  94.0000 0010000  90.0000 226.0000 14.90000000123456' as TleLine2;

/** Fresh options per instance - transponders/beacons must never be shared */
const makeCubehop1Options = () => ({
  rotation: 0 as Degrees,
  ephemerisErrorAz: 0.15 as Degrees,
  ephemerisErrorEl: 0.15 as Degrees,
  transponderConfigs: [
    {
      // V/U linear transponder (S8 "Callsign"): 435.90 up -> 435.29 down.
      // The 0.61 MHz offset keeps the return inside the console's 100 kHz
      // waterfall view and clear of the 435.25 beacon +/- Doppler. Gain is
      // calibrated against the real uplink budget (backyard ~42 dBm EIRP,
      // ~147 dB FSPL mid-pass -> about -105 dBm arriving here) so the
      // transponded downlink leaves at roughly beacon strength. Inert in
      // S1-S7: nothing transmits on 435.90 until S8.
      id: 'VU-XPD',
      uplinkCenterFrequency: 435.9e6 as RfFrequency,
      bandwidth: 30e3 as Hertz,
      frequencyOffset: 0.61e6 as Hertz,
      polarization: 'RHCP',
      physics: CUBEHOP_LINEAR_TRANSPONDER,
    } as TransponderConfig,
    {
      id: 'FM-DL',
      uplinkCenterFrequency: 145.9e6 as RfFrequency, // unused uplink slot
      bandwidth: 15e3 as Hertz,
      frequencyOffset: 0 as Hertz,
      polarization: 'RHCP',
      beacon: {
        frequency: 435.25e6 as RfFrequency, // ~+/-10 kHz Doppler: exceeds the 15 kHz channel, must be chased
        signalId: 'CUBEHOP-1-FM',
        serverId: 1,
        noradId: 63002,
        power: 28 as dBm, // ~0.5 W cubesat transmitter
        bandwidth: 15e3 as Hertz,
        modulation: 'QPSK' as ModulationType,
        fec: '1/2' as FECType,
        polarization: 'RHCP',
        feed: 'blue-2.mp4', // placeholder for SSTV frame imagery
        isDegraded: false,
        origin: SignalOrigin.TRANSMITTER,
        noiseFloor: null,
        gainInPath: 0 as dBi,
      },
    } as TransponderConfig,
  ],
});

/**
 * Scenario-local CUBEHOP-1 instance. S6 needs its own bird because
 * SpaceEventManager mutates the instance's TLE (initial tamper + player
 * update); sharing the roster instance would leak the tamper into S2-S4
 * within one SPA session.
 */
export const makeCubehop1Satellite = (): OrbitalSatellite =>
  new OrbitalSatellite('CUBEHOP-1', 63002, [], [], { tle1: CUBEHOP1_TLE1, tle2: CUBEHOP1_TLE2, observer: backyardObserver }, makeCubehop1Options());

/** Amateur FM cubesat with a 70cm downlink carrying SSTV frames (RHCP) */
export const cubehop1Satellite = makeCubehop1Satellite();

/** GPS Block III bird in MEO — L1 spread spectrum at its real EIRP, below the noise floor until despread */
export const navstar77Satellite = new OrbitalSatellite(
  'NAVSTAR-77',
  63003,
  [],
  [],
  {
    tle1: '1 63003U 27042A   27170.66666667  .00001000  00000-0  10000-3 0  9998' as TleLine1,
    tle2: '2 63003  55.0000  32.0000 0010000  90.0000 328.0000  2.00565000123455' as TleLine2,
    observer: backyardObserver,
  },
  {
    rotation: 0 as Degrees,
    ephemerisErrorAz: 0.05 as Degrees,
    ephemerisErrorEl: 0.05 as Degrees,
    transponderConfigs: [
      {
        id: 'L1',
        uplinkCenterFrequency: 2000e6 as RfFrequency, // unused
        bandwidth: 2.046e6 as Hertz,
        frequencyOffset: 0 as Hertz,
        polarization: 'RHCP',
        beacon: {
          frequency: 1575.42e6 as RfFrequency,
          signalId: 'NAVSTAR-77-L1',
          serverId: 1,
          noradId: 63003,
          // Real GPS L1 C/A EIRP, about 27 dBW. It arrives near -128..-130 dBm
          // at an isotropic antenna, below the thermal floor in 2 MHz; a GPS
          // receiver sees it only after despreading (~43 dB of C/A processing
          // gain). On the analyzer there is nothing to see - that is the lesson.
          power: 57 as dBm,
          bandwidth: 2.046e6 as Hertz,
          modulation: 'null' as ModulationType, // spread spectrum: never "locks", only detected
          fec: 'null' as FECType,
          polarization: 'RHCP',
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
