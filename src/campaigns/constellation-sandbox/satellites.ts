import { OrbitalObserver, OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { TransponderConfig } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';

/**
 * Constellation Sandbox - authored Ku GEO satellite.
 *
 * KU-SAT 1 is a fictional GEO satellite (NORAD 90001) parked at 98 W. The TLE was
 * authored by scripts/author-tle-constellation-demos.mjs against the sandbox start time
 * (2026-11-09 18:00 UTC): from Cedar Mesa it sits at az 168.1 deg, el 47.5 deg, range
 * 37,234 km, and stays there for the whole session.
 *
 * Four V-pol Ku carriers. With the station LNB LO at 13100 MHz (IF = LO - RF):
 *   11740 MHz -> 1360 MHz IF (36 MHz, the one the receiver modem is tuned to)
 *   11820 MHz -> 1280 MHz IF (27 MHz)
 *   11900 MHz -> 1200 MHz IF (36 MHz)
 *   11980 MHz -> 1120 MHz IF (18 MHz)
 */

export const cedarMesaObserver: OrbitalObserver = {
  name: 'Cedar Mesa Teleport',
  lat: 36.0 as Degrees,
  lon: -105.0 as Degrees,
  alt: 2.1 as Kilometers,
};

export const KU_SAT_NORAD = 90001;

const carrier = (index: number, rfMHz: number, bandwidthMHz: number, powerDbm: number, modulation: ModulationType, fec: FECType): TransponderConfig =>
  ({
    id: `TP-${index}`,
    uplinkCenterFrequency: ((rfMHz + 2225) * 1e6) as RfFrequency,
    bandwidth: (bandwidthMHz * 1e6) as Hertz,
    frequencyOffset: 2225e6 as Hertz,
    polarization: 'V',
    beacon: {
      frequency: (rfMHz * 1e6) as RfFrequency,
      signalId: `KUSAT1-C${index}`,
      serverId: 1,
      noradId: KU_SAT_NORAD,
      power: powerDbm as dBm,
      bandwidth: (bandwidthMHz * 1e6) as Hertz,
      modulation,
      fec,
      polarization: 'V',
      feed: '',
      isDegraded: false,
      origin: SignalOrigin.TRANSMITTER,
      noiseFloor: null,
      gainInPath: 0 as dBi,
    },
  }) as TransponderConfig;

export const kuSat1 = new OrbitalSatellite(
  'KU-SAT 1',
  KU_SAT_NORAD,
  [],
  [],
  {
    tle1: '1 90001U 26200A   26313.50000000  .00000010  00000-0  00000-0 0  9991' as TleLine1,
    tle2: '2 90001   0.0500   0.0000 0001000  90.0000  40.7500  1.00273791123458' as TleLine2,
    observer: cedarMesaObserver,
    isDopplerEnabled: false,
  },
  {
    rotation: 0 as Degrees,
    ephemerisErrorAz: 0.02 as Degrees,
    ephemerisErrorEl: 0.02 as Degrees,
    transponderConfigs: [
      carrier(1, 11740, 36, 78, 'QPSK' as ModulationType, '3/4' as FECType),
      carrier(2, 11820, 27, 78, '8QAM' as ModulationType, '2/3' as FECType),
      carrier(3, 11900, 36, 78, 'QPSK' as ModulationType, '3/4' as FECType),
      carrier(4, 11980, 18, 77, 'QPSK' as ModulationType, '1/2' as FECType),
    ],
  }
);
