import { html } from "@app/engine/utils/development/formatter";
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-configs";
import { RealTimeSpectrumAnalyzer } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { BUCModule } from "@app/equipment/rf-front-end/buc-module/buc-module";
import { CouplerModule } from "@app/equipment/rf-front-end/coupler-module/coupler-module";
import { IfFilterBankModule } from "@app/equipment/rf-front-end/filter-module/filter-module";
import { GPSDOModule } from "@app/equipment/rf-front-end/gpsdo-module/gpsdo-module";
import { HPAModule } from "@app/equipment/rf-front-end/hpa-module/hpa-module";
import { LNBModule } from "@app/equipment/rf-front-end/lnb/lnb-module";
import { OMTModule } from "@app/equipment/rf-front-end/omt-module/omt-module";
import { Satellite } from "@app/equipment/satellite/satellite";
import { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency, SignalOrigin } from "@app/types";
import { Degrees } from "ootk";
import { ScenarioData } from "../scenario-manager";

export const scenario3Data: ScenarioData = {
  id: 'first-light3',
  prerequisiteScenarioIds: ['first-light2'],
  url: 'scenarios/3',
  imageUrl: 'scenario3.jpg',
  number: 3,
  title: '"Full Stack"',
  subtitle: 'Complete Link Budget Analysis',
  duration: '45-60 min',
  difficulty: 'advanced',
  missionType: 'Research & Development',
  description: `Conduct a comprehensive RF link analysis using the complete ground station suite. You'll establish both uplink and downlink connections, analyze signal quality, measure system performance parameters, and optimize the complete communications chain from transmitter to receiver.`,
  equipment: [
    '2× 9-meter C-band Antennas',
    '2× RF Front Ends',
    '4× Spectrum Analyzers',
    'Transmitter',
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
      gpsdo: GPSDOModule.getDefaultState(),
    }],
    spectrumAnalyzers: [RealTimeSpectrumAnalyzer.getDefaultState()],
    transmitters: 1,
    receivers: 1,
    layout: html`
      <div class="student-equipment">
        <!-- Antennas, Front Ends, and Spec Analyzers Grid -->
          <div id="antenna-spec-a-grid1" class="antenna-spec-a-grid">
            <div class="paired-equipment-container">
              <div id="antenna1-container" class="antenna-container"></div>
              <div id="antenna2-container" class="antenna-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="rf-front-end1-container" class="rf-front-end-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="rf-front-end2-container" class="rf-front-end-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="specA1-container" class="spec-a-container"></div>
              <div id="specA2-container" class="spec-a-container"></div>
            </div>
          </div>

        <!-- Spectrum Analyzers Grid -->
          <div id="antenna-spec-a-grid2" class="antenna-spec-a-grid">
            <div class="paired-equipment-container">
              <div id="specA3-container" class="spec-a-container"></div>
              <div id="specA4-container" class="spec-a-container"></div>
            </div>
          </div>

        <!-- Transmitter And Receivers -->
          <div class="tx-grid">
            <div class="paired-equipment-container">
              <div id="tx1-container" class="tx-container"></div>
              <div id="rx1-container" class="rx-container"></div>
            </div>
          </div>
      </div>
    `,
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
