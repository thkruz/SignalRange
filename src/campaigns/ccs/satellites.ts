import { Satellite, TransponderConfig } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { FECType, Hertz, ModulationType, RfFrequency, dBi, dBm } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * Campaign 4 (9th EWS / Counter Communications) satellite roster.
 *
 * COBALT-4 is the adversary X-band SATCOM bird the operator must deny. It is a
 * plain GEO Satellite (no SGP4 needed - Campaign 4 has no fast tracking). Its
 * transponder carries the adversary's own service uplink, which is relayed to
 * the co-frequency downlink; the operator's jam, once injected into the same
 * uplink passband, degrades that downlink's C/I (the denial effect).
 *
 * X-band plan (mil band: 7.25-7.75 GHz down, 7.9-8.4 GHz up):
 * - Service uplink RF: 8125 MHz (H-pol) -> transponded downlink 7475 MHz
 *   (frequencyOffset 650 MHz)
 * - Telemetry beacon: 7290 MHz (CW) for target ID on the spectrum
 * The jam must land in the 8100-8150 MHz uplink passband to be transponded onto
 * the victim downlink.
 */
export const cobalt4Satellite = new Satellite(
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
    az: 175 as Degrees,
    el: 30 as Degrees,
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
