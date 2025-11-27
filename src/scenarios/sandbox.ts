import { html } from "@app/engine/utils/development/formatter";
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-configs";
import { defaultSpectrumAnalyzerState } from "@app/equipment/real-time-spectrum-analyzer/defaultSpectrumAnalyzerState";
import { BUCModuleCore } from "@app/equipment/rf-front-end/buc-module";
import { CouplerModule } from "@app/equipment/rf-front-end/coupler-module/coupler-module";
import { IfFilterBankModuleCore } from "@app/equipment/rf-front-end/filter-module/filter-module-core";
import { defaultGpsdoState } from "@app/equipment/rf-front-end/gpsdo-module/gpsdo-state";
import { HPAModuleCore } from "@app/equipment/rf-front-end/hpa-module";
import { LNBModuleCore } from "@app/equipment/rf-front-end/lnb-module";
import { OMTModule } from "@app/equipment/rf-front-end/omt-module/omt-module";
import { Satellite } from "@app/equipment/satellite/satellite";
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/SignalOrigin";
import type { FECType, Hertz, ModulationType, RfFrequency, dBi, dBm } from "@app/types";
import type { Degrees } from "ootk";

export const sandboxData: ScenarioData = {
  id: 'sandbox',
  url: 'sandbox',
  imageUrl: 'sandbox.jpg',
  number: 0,
  title: 'Free Play',
  subtitle: 'Sandbox Environment',
  duration: 'Unlimited',
  difficulty: 'beginner',
  missionType: 'Sandbox',
  description: `Explore the simulation environment freely without specific objectives. Configure equipment, test signals, and experiment with different setups at your own pace.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Transmitter',
    'Receiver',
  ],
  settings: {
    isSync: true,
    groundStations: [],
    antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
    rfFrontEnds: [{
      omt: OMTModule.getDefaultState(),
      buc: BUCModuleCore.getDefaultState(),
      hpa: HPAModuleCore.getDefaultState(),
      filter: IfFilterBankModuleCore.getDefaultState(),
      lnb: LNBModuleCore.getDefaultState(),
      coupler: CouplerModule.getDefaultState(),
      gpsdo: defaultGpsdoState,
    }],
    spectrumAnalyzers: [defaultSpectrumAnalyzerState, defaultSpectrumAnalyzerState],
    transmitters: 1,
    receivers: 1,
    layout: html`<div class="student-equipment">
      <div class="paired-equipment-container">
        <div id="antenna1-container" class="antenna-container"></div>
        <div id="specA1-container" class="spec-a-container"></div>
      </div>
      <div class="paired-equipment-container">
        <div id="specA2-container" class="spec-a-container"></div>
      </div>
      <div id="rf-front-end1-container" class="paired-equipment-container"></div>
      <div id="tx1-container" class="tx-container"></div>
      <div id="rx1-container" class="rx-container"></div>
    </div>`,
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
  }
};