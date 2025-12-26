import { GroundStationConfig } from './assets/ground-station/ground-station-state';
import { scenario1Data } from './campaigns/nats/scenario1';
import { scenario2Data } from "./campaigns/nats/scenario2";
import { scenario3Data } from './campaigns/nats/scenario3';
import { scenario4Data } from './campaigns/nats/scenario4';
import { scenario5Data } from './campaigns/nats/scenario5';
import { scenario6Data } from './campaigns/nats/scenario6';
import { scenario7Data } from './campaigns/nats/scenario7';
import { scenario8Data } from './campaigns/nats/scenario8';
import { AntennaState } from './equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "./equipment/antenna/antenna-config-keys";
import { defaultSpectrumAnalyzerState } from './equipment/real-time-spectrum-analyzer/defaultSpectrumAnalyzerState';
import { RealTimeSpectrumAnalyzerState } from './equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { Receiver, ReceiverState } from './equipment/receiver/receiver';
import { BUCModuleCore } from './equipment/rf-front-end/buc-module';
import { CouplerModule } from './equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModuleCore } from './equipment/rf-front-end/filter-module';
import { defaultGpsdoState } from './equipment/rf-front-end/gpsdo-module/gpsdo-state';
import { HPAModuleCore } from './equipment/rf-front-end/hpa-module';
import { LNBModuleCore } from './equipment/rf-front-end/lnb-module';
import { OMTModule } from './equipment/rf-front-end/omt-module/omt-module';
import { RFFrontEndState } from './equipment/rf-front-end/rf-front-end-core';
import { Satellite } from './equipment/satellite/satellite';
import { Transmitter, TransmitterState } from './equipment/transmitter/transmitter';
import { Character, Emotion } from './modal/character-enum';
import { ScenarioData } from './ScenarioData';
import { sandboxData } from './scenarios/sandbox';

export interface DialogClip {
  text: string;
  character: Character;
  audioUrl: string;
  emotion?: Emotion;
}

export interface SimulationSettings {
  isSync: boolean;
  groundStations: GroundStationConfig[];
  antennas?: ANTENNA_CONFIG_KEYS[];
  antennasState?: Partial<AntennaState>[];
  rfFrontEnds?: Partial<RFFrontEndState>[];
  spectrumAnalyzers?: Partial<RealTimeSpectrumAnalyzerState>[];
  transmitters?: Partial<TransmitterState>[];
  receivers?: Partial<ReceiverState>[];
  /** Optional HTML override for complex layouts */
  layout?: string;
  missionBriefUrl?: string;
  isExtraSatellitesVisible?: boolean;
  satellites: Satellite[];
  missionTimeLimitSeconds?: number;
  weatherEvents?: Array<{
    id: string;
    groundStationId: string;
    type: "snow" | "rain" | "fog" | "wind" | "dust" | "hail" | "ice" | "storm";
    severity: "minor" | "moderate" | "severe";
    /** Seconds since mission start */
    startTime: number;
    /** Duration in seconds */
    duration: number;
    /** dB degradation to link margin */
    linkMarginDegradation: number;
  }>;
  /** Traffic ownership configuration for handover scenarios */
  trafficOwnership?: Array<{
    /** Satellite NORAD ID */
    satelliteNoradId: number;
    /** Initial owner ground station ID */
    initialOwnerId: string;
  }>;
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
      groundStations: [],
      antennas: [ANTENNA_CONFIG_KEYS.C_BAND_3M_ANTESTAR, ANTENNA_CONFIG_KEYS.KU_BAND_3M_ANTESTAR], // TODO: Max 1 for now because only 1 rfFrontEnd is supported
      rfFrontEnds: [{
        // Module states managed by their respective classes
        omt: OMTModule.getDefaultState(),
        buc: BUCModuleCore.getDefaultState(),
        hpa: HPAModuleCore.getDefaultState(),
        filter: IfFilterBankModuleCore.getDefaultState(),
        lnb: LNBModuleCore.getDefaultState(),
        coupler: CouplerModule.getDefaultState(),
        gpsdo: defaultGpsdoState,
      }],
      spectrumAnalyzers: [defaultSpectrumAnalyzerState],
      transmitters: [
        Transmitter.getDefaultState(),
        Transmitter.getDefaultState(),
        Transmitter.getDefaultState(),
        Transmitter.getDefaultState()
      ],
      receivers: [
        Receiver.getDefaultState(),
        Receiver.getDefaultState(),
        Receiver.getDefaultState(),
        Receiver.getDefaultState()
      ],
      satellites: [],
    };
  }

  getScenario(): SimulationSettings {
    return this.settings;
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
  scenario4Data,
  scenario5Data,
  scenario6Data,
  scenario7Data,
  scenario8Data,
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