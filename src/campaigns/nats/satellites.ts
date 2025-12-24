import { Satellite } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/SignalOrigin';
import type { FECType, Hertz, ModulationType, RfFrequency, dBi, dBm } from '@app/types';
import type { Degrees } from 'ootk';

export const tidemark1Satellite = new Satellite(
  61525,
  [
    {
      signalId: 'TIDEMARK-1-Payload',
      serverId: 1,
      noradId: 61525,
      /** Must be the uplinkl to match the antenna in simulation */
      frequency: 5943e6 as RfFrequency,
      polarization: 'H',
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
      frequency: 3902.5e6 as RfFrequency,
      signalId: 'TIDEMARK-1-Beacon',
      serverId: 1,
      noradId: 61525,
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
    az: 161.8 as Degrees,
    el: 34.2 as Degrees,
    rotation: 14 as Degrees,
    frequencyOffset: 2.225e9 as Hertz,
  }
);

export const ses10Satellite = new Satellite(
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
