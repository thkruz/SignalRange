import { ANTENNA_CONFIG_KEYS } from './equipment/antenna/antenna-configs';
import { Satellite } from './equipment/satellite/satellite';
import { scenario1Data } from './scenarios/scenario1';
import { scenario2Data } from "./scenarios/scenario2";
import { scenario3Data } from './scenarios/scenario3';

export interface SimulationSettings {
  isSync: boolean;
  antennas: ANTENNA_CONFIG_KEYS[];
  rfFrontEnds: number;
  spectrumAnalyzers: number;
  transmitters: number;
  receivers: number;
  /** Optional HTML override for complex layouts */
  layout?: string;
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
      antennas: [ANTENNA_CONFIG_KEYS.C_BAND_3M_ANTESKY], // TODO: Max 1 for now because only 1 rfFrontEnd is supported
      rfFrontEnds: 1,
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