import { ANTENNA_CONFIG_KEYS } from './equipment/antenna/antenna-configs';
import { BUCModule } from './equipment/rf-front-end/buc-module/buc-module';
import { CouplerModule } from './equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModule } from './equipment/rf-front-end/filter-module/filter-module';
import { GPSDOModule } from './equipment/rf-front-end/gpsdo-module/gpsdo-module';
import { HPAModule } from './equipment/rf-front-end/hpa-module/hpa-module';
import { LNBModule } from './equipment/rf-front-end/lnb/lnb-module';
import { OMTModule } from './equipment/rf-front-end/omt-module/omt-module';
import { RFFrontEndState } from './equipment/rf-front-end/rf-front-end';
import { Satellite } from './equipment/satellite/satellite';
import { scenario1Data } from './scenarios/scenario1';
import { scenario2Data } from "./scenarios/scenario2";
import { scenario3Data } from './scenarios/scenario3';

export interface SimulationSettings {
  isSync: boolean;
  antennas: ANTENNA_CONFIG_KEYS[];
  rfFrontEnds: Partial<RFFrontEndState>[];
  spectrumAnalyzers: number;
  transmitters: number;
  receivers: number;
  /** Optional HTML override for complex layouts */
  layout?: string;
  missionBriefUrl?: string;
  satellites: Satellite[];
}

export class ScenarioManager {
  private static instance_: ScenarioManager;

  settings: SimulationSettings = ScenarioManager.getDefaultSettings();

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  static getInstance(): ScenarioManager {
    this.instance_ ??= new ScenarioManager();
    return this.instance_;
  }

  static getDefaultSettings(): SimulationSettings {
    return {
      isSync: false,
      antennas: [ANTENNA_CONFIG_KEYS.C_BAND_3M_ANTESTAR], // TODO: Max 1 for now because only 1 rfFrontEnd is supported
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
      spectrumAnalyzers: 2,
      transmitters: 2,
      receivers: 2,
      satellites: [],
    };
  }

  static getScenarioSettings(scenarioId: string): SimulationSettings {
    switch (scenarioId) {
      case 'scenario1':
        return SCENARIOS[0].settings;
      case 'scenario2':
        return SCENARIOS[1].settings;
      case 'scenario3':
        return SCENARIOS[2].settings;
      default:
        return this.getDefaultSettings();
    }
  }
}

export interface ScenarioData {
  id: string;
  isDisabled?: boolean;
  url: string;
  imageUrl: string;
  number: number;
  title: string;
  subtitle: string;
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  missionType: string;
  description: string;
  equipment: string[];
  settings: SimulationSettings;
}

export const SCENARIOS: ScenarioData[] = [
  scenario1Data,
  scenario2Data,
  scenario3Data,
];