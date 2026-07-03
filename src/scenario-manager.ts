import { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { PreviousShiftLogEntry } from '@app/ops-log/ops-log-types';
import { scenario1Data } from '@app/campaigns/nats/scenario1';
import { scenario2Data } from "@app/campaigns/nats/scenario2";
import { scenario3Data } from '@app/campaigns/nats/scenario3';
import { scenario4Data } from '@app/campaigns/nats/scenario4';
import { scenario5Data } from '@app/campaigns/nats/scenario5';
import { scenario6Data } from '@app/campaigns/nats/scenario6';
import { scenario7Data } from '@app/campaigns/nats/scenario7';
import { scenario8Data } from '@app/campaigns/nats/scenario8';
import { scenario9Data } from '@app/campaigns/nats/scenario9';
import { scenario10Data } from '@app/campaigns/nats/scenario10';
import { scenario11Data } from '@app/campaigns/nats/scenario11';
import { scenario12Data } from '@app/campaigns/nats/scenario12';
import { scenario13Data } from '@app/campaigns/nats/scenario13';
import { scenario14Data } from '@app/campaigns/nats/scenario14';
import { scenario15Data } from '@app/campaigns/nats/scenario15';
import { scenario16Data } from '@app/campaigns/nats/scenario16';
import { scenario17Data } from '@app/campaigns/nats/scenario17';
import { scenario18Data } from '@app/campaigns/nats/scenario18';
import { scenario19Data } from '@app/campaigns/nats/scenario19';
import { scenario20Data } from '@app/campaigns/nats/scenario20';
import { scenario21Data } from '@app/campaigns/nats/scenario21';
import { scenario22Data } from '@app/campaigns/nats/scenario22';
import { scenario23Data } from '@app/campaigns/nats/scenario23';
import { scenario24Data } from '@app/campaigns/nats/scenario24';
import { sandboxData as natsSandboxData } from '@app/campaigns/nats/sandbox';
import { natsEuScenario1Data } from '@app/campaigns/nats-eu/scenario1';
import { hamSdrSandboxData } from '@app/campaigns/ham-sdr/sandbox';
import { signalHunterSandboxData } from '@app/campaigns/signal-hunter/sandbox';
import { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { defaultSpectrumAnalyzerState } from '@app/equipment/real-time-spectrum-analyzer/defaultSpectrumAnalyzerState';
import { RealTimeSpectrumAnalyzerState } from '@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { Receiver, ReceiverState } from '@app/equipment/receiver/receiver';
import { BUCModuleCore } from '@app/equipment/rf-front-end/buc-module';
import { CouplerModule } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModuleCore } from '@app/equipment/rf-front-end/filter-module';
import { defaultGpsdoState } from '@app/equipment/rf-front-end/gpsdo-module/gpsdo-state';
import { HPAModuleCore } from '@app/equipment/rf-front-end/hpa-module';
import { LNBModuleCore } from '@app/equipment/rf-front-end/lnb-module';
import { OMTModule } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { RFFrontEndState } from '@app/equipment/rf-front-end/rf-front-end-core';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Transmitter, TransmitterState } from '@app/equipment/transmitter/transmitter';
import { Character, Emotion } from '@app/modal/character-enum';
import { ScenarioData } from './ScenarioData';
import { sandboxData } from '@app/scenarios/sandbox';

declare global {
  interface Window {
    DEVELOPER_MODE?: boolean;
  }
}

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
  weatherEvents?: Array<{
    id: string;
    groundStationId: string;
    type: "snow" | "rain" | "fog" | "wind" | "dust" | "hail" | "ice" | "storm" | "sun-transit";
    severity: "minor" | "moderate" | "severe";
    /** Seconds since mission start */
    startTime: number;
    /** Duration in seconds */
    duration: number;
    /** dB degradation to link margin */
    linkMarginDegradation: number;
  }>;
  /** Scheduled, duty-cycled RF interference injected at a satellite's
   *  transponder (relayed to all stations - uplink interference). */
  interferenceEvents?: Array<{
    id: string;
    satelliteNoradId: number;
    /** Interferer RF center frequency (uplink, Hz) */
    frequency: number;
    bandwidth: number;
    /** Power at the transponder input (dBm) */
    power: number;
    polarization: 'H' | 'V';
    /** Seconds since mission start when the envelope opens */
    startTime: number;
    /** Envelope duration (s); on/off windows repeat inside it */
    duration: number;
    /** Window cycle period (s) */
    periodSeconds: number;
    /** Transmit-on seconds per period */
    onSeconds: number;
    /** Opt-in (Campaign 5+): emitter ground truth for geolocation gameplay */
    emitter?: {
      latitude: number;
      longitude: number;
      altitudeKm?: number;
    };
  }>;
  /**
   * Opt-in (Campaign 5+): two-satellite TDOA/FDOA geolocation console.
   * When present, the Geolocation tab is registered in Mission Control and
   * the GeolocationConsoleCore singleton is started. Absent in Campaigns 1-4.
   */
  geolocation?: {
    /** NORAD ID of the victim (primary) satellite */
    primaryNoradId: number;
    /** NORAD IDs of selectable adjacent (sidelobe-collection) satellites */
    adjacentNoradIds: number[];
    /** 1-sigma TDOA measurement noise, seconds (difficulty knob) */
    tdoaSigmaS: number;
    /** 1-sigma FDOA measurement noise, Hz (difficulty knob) */
    fdoaSigmaHz: number;
    /** Solver search area and map extent */
    areaOfInterest: { latMin: number; latMax: number; lonMin: number; lonMax: number };
    /** Correlation integration window, simulated seconds. Default: 10 */
    captureWindowS?: number;
  };
  /** Working Document panel: an in-scenario document that accumulates a line
   *  per passed quiz whose condition declares params.documentLine. */
  workingDocument?: {
    title: string;
    description?: string;
  };
  /** Traffic ownership configuration for handover scenarios */
  trafficOwnership?: Array<{
    /** Satellite NORAD ID */
    satelliteNoradId: number;
    /** Initial owner ground station ID */
    initialOwnerId: string;
  }>;
  /** Scenario start wall-clock time in HH:MM:SS format (e.g., "22:00:00" for 10 PM) */
  scenarioStartWallTime?: string;
  /** Scenario start date in YYYY-MM-DD format (e.g., "2025-03-15") */
  scenarioStartDate?: string;
  /** Previous shift maintenance/ops log entries */
  previousShiftLogs?: PreviousShiftLogEntry[];
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
  natsSandboxData,
  scenario1Data,
  scenario2Data,
  scenario3Data,
  scenario4Data,
  scenario5Data,
  scenario6Data,
  scenario7Data,
  scenario8Data,
  scenario9Data,
  scenario10Data,
  scenario11Data,
  scenario12Data,
  scenario13Data,
  scenario14Data,
  scenario15Data,
  scenario16Data,
  scenario17Data,
  scenario18Data,
  scenario19Data,
  scenario20Data,
  scenario21Data,
  scenario22Data,
  scenario23Data,
  scenario24Data,
  natsEuScenario1Data,
  hamSdrSandboxData,
  signalHunterSandboxData,
];

export function isScenarioLocked(scenario: ScenarioData, completedScenarioIds: string[]): boolean {
  if (!scenario.prerequisiteScenarioIds || scenario.prerequisiteScenarioIds.length === 0) {
    return false;
  }

  if (window.DEVELOPER_MODE) {
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