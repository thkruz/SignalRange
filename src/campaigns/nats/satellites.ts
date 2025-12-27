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
      power: 25 as dBm,
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
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 5943e6 as RfFrequency, // Passband: 5925-5961 MHz
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3718 MHz
        polarization: 'H',
        beacon: {
          frequency: 3902.5e6 as RfFrequency,
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

export const ses10Satellite = new Satellite(
  'SES-10',
  42432,
  [
    {
      signalId: 'SES-10-Payload',
      serverId: 1,
      noradId: 42432,
      /** Must be the uplinkl to match the antenna in simulation */
      frequency: 6115e6 as RfFrequency,
      polarization: 'V',
      power: 40 as dBm, // 10 W
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
  [
    {
      frequency: 3905.0e6 as RfFrequency,
      signalId: 'SES-10-Beacon',
      serverId: 1,
      noradId: 42432,
      power: 40 as dBm, // 10 W
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
  ],
  {
    az: 164.2 as Degrees,
    el: 34.1 as Degrees,
    rotation: -32 as Degrees,
    frequencyOffset: 2.225e9 as Hertz,
  }
);
