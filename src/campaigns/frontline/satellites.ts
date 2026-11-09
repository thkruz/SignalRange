import { Satellite, type TransponderConfig } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import { geoLookAngles } from '@app/simulation/geo-geometry';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * Frontline Signals (Campaign 6) satellite roster.
 *
 * The training post is a fictional rural site in eastern-central Europe. The
 * authored az/el are computed with geoLookAngles (never by hand), so the
 * satellite's slot is recovered from them exactly the way the C1 roster does it.
 */

/** The training post (FL-01), the station every authored az/el here is written for */
export const FRONTLINE_LOOK_ANGLE_SITE = { latitude: 50.6, longitude: 22.9, elevationM: 220 };

/** EuroSat 9E parody slot, degrees east */
export const EUROSAT_9E_SLOT_DEG = 9;

/** Look angles from the post to the EuroSat 9E slot (geoLookAngles) */
export const EUROSAT_9E_LOOK = geoLookAngles(FRONTLINE_LOOK_ANGLE_SITE, EUROSAT_9E_SLOT_DEG);

export const EUROSAT_9E_NORAD_ID = 62009;
/** Ku beacon (CW), RF */
export const EUROSAT_9E_BEACON_RF_HZ = 11701.5e6 as RfFrequency;
/** Ku data carrier (QPSK), RF */
export const EUROSAT_9E_DATA_RF_HZ = 11850e6 as RfFrequency;
/**
 * Radiated EIRP of the data carrier toward the post, dBm (uplink-power-is-EIRP
 * convention, phase 19.3). Tuned on the real chain so a healthy 1.2 m VSAT link
 * sits a few dB over the modem lock line and a 6 dB connector fault breaks it
 * (test/physical/physical-plant-frontline.test.ts reads the margin).
 */
export const EUROSAT_9E_DATA_EIRP_DBM = 62;
export const EUROSAT_9E_BEACON_EIRP_DBM = 52.5;

export const eurosat9eSatellite = new Satellite(
  'EUROSAT-9E',
  EUROSAT_9E_NORAD_ID,
  [], // No authored uplinks: the carriers below are transmitted directly
  [], // Beacons are defined in transponderConfigs
  {
    az: Number(EUROSAT_9E_LOOK.az.toFixed(2)) as Degrees,
    el: Number(EUROSAT_9E_LOOK.el.toFixed(2)) as Degrees,
    // Polarization skew is derived from geometry (Phase 29 D8): no authored rotation
    frequencyOffset: 2.3e9 as Hertz, // Legacy fallback
    ephemerisErrorAz: 0.05 as Degrees,
    ephemerisErrorEl: 0.04 as Degrees,
    lookAnglesFrom: FRONTLINE_LOOK_ANGLE_SITE,
    transponderConfigs: [
      {
        id: 'TP-BCN',
        uplinkCenterFrequency: 14000e6 as RfFrequency, // Unused uplink slot
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.3e9 as Hertz,
        polarization: 'V',
        beacon: {
          frequency: EUROSAT_9E_BEACON_RF_HZ,
          signalId: 'EUROSAT-9E-Beacon',
          serverId: 1,
          noradId: EUROSAT_9E_NORAD_ID,
          power: EUROSAT_9E_BEACON_EIRP_DBM as dBm,
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
        id: 'TP-DATA',
        uplinkCenterFrequency: 14150e6 as RfFrequency, // Unused uplink slot
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.3e9 as Hertz,
        polarization: 'V',
        beacon: {
          frequency: EUROSAT_9E_DATA_RF_HZ,
          signalId: 'EUROSAT-9E-DATA',
          serverId: 1,
          noradId: EUROSAT_9E_NORAD_ID,
          power: EUROSAT_9E_DATA_EIRP_DBM as dBm,
          bandwidth: 4e6 as Hertz,
          modulation: 'QPSK' as ModulationType,
          fec: '3/4' as FECType,
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
