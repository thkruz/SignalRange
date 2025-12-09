import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-configs";
import { defaultSpectrumAnalyzerState } from "@app/equipment/real-time-spectrum-analyzer/defaultSpectrumAnalyzerState";
import { BUCModule } from "@app/equipment/rf-front-end/buc-module/buc-module";
import { CouplerModule } from "@app/equipment/rf-front-end/coupler-module/coupler-module";
import { IfFilterBankModule } from "@app/equipment/rf-front-end/filter-module/filter-module";
import { defaultGpsdoState } from "@app/equipment/rf-front-end/gpsdo-module/defaultGpsdoState";
import { HPAModule } from "@app/equipment/rf-front-end/hpa-module/hpa-module";
import { LNBModule } from "@app/equipment/rf-front-end/lnb/lnb-module";
import { OMTModule } from "@app/equipment/rf-front-end/omt-module/omt-module";
import { Satellite } from "@app/equipment/satellite/satellite";
import type { ScenarioData } from "@app/ScenarioData";
import { SignalOrigin } from "@app/SignalOrigin";
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from "@app/types";
import { Degrees } from "ootk";

export const scenario2Data: ScenarioData = {
  id: 'first-light2',
  prerequisiteScenarioIds: ['scenario1'],
  url: 'nats/scenarios/scenario2',
  imageUrl: 'nats/2/card.png',
  number: 2,
  title: '"Signal Hunt"',
  subtitle: 'Deep Space Tracking Exercise',
  duration: '35-40 min',
  difficulty: 'intermediate',
  missionType: 'Deep Space Operations',
  description: `Track and analyze signals from a deep space probe passing through the outer solar system. You'll need to compensate for Doppler shift, manage antenna pointing, and maintain signal lock despite challenging signal conditions and atmospheric interference.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    '2× Spectrum Analyzers',
    'Receiver',
  ],
  settings: {
    isSync: false,
    antennas: [ANTENNA_CONFIG_KEYS.C_BAND_3M_ANTESTAR],
    rfFrontEnds: [{
      // Module states managed by their respective classes
      omt: OMTModule.getDefaultState(),
      buc: BUCModule.getDefaultState(),
      hpa: HPAModule.getDefaultState(),
      filter: IfFilterBankModule.getDefaultState(),
      lnb: LNBModule.getDefaultState(),
      coupler: CouplerModule.getDefaultState(),
      gpsdo: defaultGpsdoState,
    }],
    spectrumAnalyzers: [defaultSpectrumAnalyzerState],
    transmitters: 0,
    receivers: 1,
    satellites: [
      new Satellite(
        1,
        [
          {
            signalId: '1',
            serverId: 1,
            noradId: 1,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5935e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm, // 10 W
            bandwidth: 10e6 as Hertz,
            modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
            fec: '3/4' as FECType,
            feed: 'red-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
          {
            signalId: '2',
            serverId: 1,
            noradId: 1,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5945e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm, // 10 W
            bandwidth: 3e6 as Hertz,
            modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
            fec: '3/4' as FECType,
            feed: 'blue-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        [],
        {
          az: 247.3 as Degrees,
          el: 78.2 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
      new Satellite(
        2,
        [
          {
            signalId: '3',
            serverId: 1,
            noradId: 2,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5925e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm, // 10 W
            bandwidth: 3e6 as Hertz,
            modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
            fec: '3/4' as FECType,
            feed: 'blue-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        [],
        {
          az: 247.6 as Degrees,
          el: 78.2 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
      new Satellite(
        3,
        [
          {
            signalId: '4',
            serverId: 1,
            noradId: 3,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5915e6 as RfFrequency,
            polarization: 'H',
            power: 43 as dBm, // 20 W
            bandwidth: 5e6 as Hertz,
            modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
            fec: '3/4' as FECType,
            feed: 'blue-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        [],
        {
          az: 247.1 as Degrees,
          el: 78.2 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ]
  },
};
