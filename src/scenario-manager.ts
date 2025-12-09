import { scenario1Data } from './campaigns/nats/scenario1';
import { scenario2Data } from "./campaigns/nats/scenario2";
import { scenario3Data } from './campaigns/nats/scenario3';
import { AntennaState } from './equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from './equipment/antenna/antenna-configs';
import { defaultSpectrumAnalyzerState } from './equipment/real-time-spectrum-analyzer/defaultSpectrumAnalyzerState';
import { RealTimeSpectrumAnalyzerState } from './equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { BUCModule } from './equipment/rf-front-end/buc-module/buc-module';
import { CouplerModule } from './equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModule } from './equipment/rf-front-end/filter-module/filter-module';
import { defaultGpsdoState } from './equipment/rf-front-end/gpsdo-module/defaultGpsdoState';
import { HPAModule } from './equipment/rf-front-end/hpa-module/hpa-module';
import { LNBModule } from './equipment/rf-front-end/lnb/lnb-module';
import { OMTModule } from './equipment/rf-front-end/omt-module/omt-module';
import { RFFrontEndState } from './equipment/rf-front-end/rf-front-end';
import { Satellite } from './equipment/satellite/satellite';
import { Character } from './modal/character-enum';
import { ScenarioData } from './ScenarioData';
import { sandboxData } from './scenarios/sandbox';

export interface DialogClip {
  text: string;
  character: Character;
  audioUrl: string;
}

export interface SimulationSettings {
  isSync: boolean;
  antennas: ANTENNA_CONFIG_KEYS[];
  antennasState?: Partial<AntennaState>[];
  rfFrontEnds: Partial<RFFrontEndState>[];
  spectrumAnalyzers: Partial<RealTimeSpectrumAnalyzerState>[];
  transmitters: number;
  receivers: number;
  /** Optional HTML override for complex layouts */
  layout?: string;
  missionBriefUrl?: string;
  isExtraSatellitesVisible?: boolean;
  satellites: Satellite[];
}

export class ScenarioManager {
  private static instance_: ScenarioManager;

  settings: SimulationSettings = ScenarioManager.getDefaultSettings();
  data: ScenarioData;

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
      antennas: [ANTENNA_CONFIG_KEYS.C_BAND_3M_ANTESTAR, ANTENNA_CONFIG_KEYS.KU_BAND_3M_ANTESTAR], // TODO: Max 1 for now because only 1 rfFrontEnd is supported
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
      transmitters: 4,
      receivers: 4,
      satellites: [],
    };
  }

  set scenario(scenarioId: string) {
    const scenario = SCENARIOS.find(s => s.id === scenarioId);
    if (scenario) {
      this.settings = scenario.settings;
      this.data = scenario;
    } else {
      throw new Error(`Scenario ${scenarioId} not found`);
    }
  }
}

export const SCENARIOS: ScenarioData[] = [
  sandboxData,
  scenario1Data,
  scenario2Data,
  scenario3Data,
];

export function isScenarioLocked(scenario: ScenarioData, completedScenarioIds: string[]): boolean {
  if (!scenario.prerequisiteScenarioIds || scenario.prerequisiteScenarioIds.length === 0) {
    return false;
  }

  return !scenario.prerequisiteScenarioIds.every(prereqId =>
    completedScenarioIds.includes(prereqId)
  );
}

/** Function finds the next scenario the user needs to complete in order to unlock the provided scenario */
export function getNextPrerequisiteScenario(scenario: ScenarioData, completedScenarioIds: string[]): ScenarioData | null {
  if (!scenario.prerequisiteScenarioIds || scenario.prerequisiteScenarioIds.length === 0) {
    return null;
  }

  for (const prereqId of scenario.prerequisiteScenarioIds) {
    if (!completedScenarioIds.includes(prereqId)) {
      const prereqScenario = SCENARIOS.find(s => s.id === prereqId);
      return prereqScenario || null;
    }
  }

  return null;
}

export function getPrerequisiteScenarioNames(scenario: ScenarioData): string[] {
  if (!scenario.prerequisiteScenarioIds || scenario.prerequisiteScenarioIds.length === 0) {
    return [];
  }

  return scenario.prerequisiteScenarioIds
    .map(prereqId => {
      const prereqScenario = SCENARIOS.find(s => s.id === prereqId);
      return prereqScenario ? prereqScenario.title : prereqId;
    })
    .filter(Boolean);
}