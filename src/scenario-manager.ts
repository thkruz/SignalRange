import { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import type { Degrees } from 'ootk';
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
import { natsEuSandboxData } from '@app/campaigns/nats-eu/sandbox';
import { hamSdrSandboxData } from '@app/campaigns/ham-sdr/sandbox';
import { signalHunterSandboxData } from '@app/campaigns/signal-hunter/sandbox';
import { ccsScenario1Data } from '@app/campaigns/ccs/scenario1';
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
  /**
   * Opt-in (Campaign 4): offensive electronic-attack / SATCOM denial. When
   * present, the ElectronicAttackManager is started (a player-driven interferer,
   * the counterpart of interferenceEvents) and the EA Assessment tab is
   * registered in Mission Control. Absent in Campaigns 1-3 and 5, so those
   * campaigns are unaffected.
   */
  electronicAttack?: {
    /** Ground station (by id) that mounts the jam chain */
    groundStationId: string;
    /** NORAD ID of the target (adversary) satellite being denied */
    targetNoradId: number;
    /** Antenna index that must be trained on the target to radiate the jam (default 0) */
    jamAntennaIndex?: number;
    /** Victim service carrier power at the transponder input, dBm (the "S" in J/S) */
    victimCarrierPowerDbm: number;
    /** Target transponder uplink passband the jam RF must fall within (Hz) */
    targetUplinkLowHz: number;
    /** Target transponder uplink passband upper edge (Hz) */
    targetUplinkHighHz: number;
    /** Uplink polarization the jam must match to route through the transponder */
    targetPolarization: 'H' | 'V';
    /**
     * Calibration: dB added to the jam chain HPA output power to yield the
     * jammer power at the transponder input. Folds uplink path loss + antenna
     * gain into one term so the scenario stays winnable without a full uplink
     * budget (mirrors how interferenceEvents specify power at the transponder).
     */
    jamPathGainDb: number;
    /** Pointing tolerance (deg) for the jam antenna vs the target (default 5) */
    pointingToleranceDeg?: number;
    /** J/S ratio (dB) at/above which denial is considered effective (default 6) */
    effectiveJtoSDb?: number;
  };
  /**
   * Opt-in (Campaign 4): scheduled RF-chain / transmit-string hardware faults
   * for redundancy training. Mirrors interferenceEvents' time trigger. When a
   * fault trips, the targeted transmit modem on the given ground station faults
   * (stops radiating), forcing failover to the backup transmit string. Absent
   * = no scheduled faults, so legacy campaigns are unaffected.
   */
  hardwareFaultEvents?: Array<{
    id: string;
    /** Ground station whose equipment faults */
    groundStationId: string;
    /** Transmitter case index (default 0) */
    transmitterIndex?: number;
    /** Modem number (1-4) that faults - the "primary" transmit string */
    modemNumber: number;
    /** Seconds since mission start when the fault trips */
    startTime: number;
    /** Optional label for the ops log / alarm */
    label?: string;
  }>;
  /**
   * Opt-in (Campaign 4): own-force deconfliction. Radiating a jam waveform that
   * overlaps any protected friendly range is an instant mission fail
   * (fratricide), in the spirit of the HPA / dual-transmission RF-safety
   * invariants. Only armed when electronicAttack is also present; absent = the
   * interlock never fires.
   */
  protectedFrequencies?: Array<{
    id: string;
    label: string;
    /** Protected uplink range lower edge (Hz) that must never be jammed */
    minHz: number;
    /** Protected uplink range upper edge (Hz) */
    maxHz: number;
  }>;
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

  // ── nats-eu (Campaign 2 European Operations) opt-in mechanics ───────────────
  // Each block, when present, starts a singleton manager and unlocks its
  // objective conditions. Absent = the mechanic never instantiates, so all other
  // campaigns are unaffected. Shapes mirror the config interfaces in the
  // corresponding manager modules (kept inline to avoid an import cycle).

  /** M1: link-budget / EIRP planning console. Starts LinkBudgetManager. */
  linkBudget?: {
    label?: string;
    /** Ground-truth C/N (dB) the correct worksheet must yield */
    expectedCNRDb: number;
    /** Tolerance (dB) for accepting the operator's computed C/N (default 1.0) */
    toleranceDb?: number;
    /** Demod C/N threshold (dB) the margin is measured against */
    thresholdCNRDb: number;
    /** Required margin (dB) above threshold for acceptance (default 3) */
    requiredMarginDb?: number;
  };

  /** M2/M5: LEO uplink ops + command-link key ops. Starts CommandingManager. */
  commanding?: {
    groundStationId?: string;
    targetNoradId?: number;
    /** Command window open/close, seconds since mission start (omit = always open) */
    windowStartS?: number;
    windowEndS?: number;
    /** Require a Valid key for a command to ACK (default true) */
    requireValidKey?: boolean;
    /** Require uplink Doppler compensation for a command to ACK (default true) */
    requireDopplerComp?: boolean;
    /** Canned TT&C commands the console offers as one-click sends */
    commands?: Array<{ id: string; label?: string }>;
  };

  /** M3: multi-station pass scheduling. Starts ContactScheduleManager. */
  contactSchedule?: {
    contacts: Array<{
      id: string;
      satelliteNoradId: number;
      label?: string;
      priority: number;
      windowStartS: number;
      windowEndS: number;
    }>;
    stationIds: string[];
    /** Contacts with priority <= this must all be assigned for a valid plan */
    requiredPriorityAtOrAbove?: number;
  };

  /**
   * Access/contact timeline deck along the bottom of Mission Control.
   *
   * Opt-in: when this block is absent the deck is not mounted at all, so
   * campaigns that predate it (Campaign 1's GEO work, where every link is
   * permanent and a contact timeline says nothing) keep their original layout.
   * The operator can still collapse the deck; this only controls whether it
   * exists.
   */
  contactTimeline?: {
    /** How far ahead the deck plots, in hours. Default 6. */
    horizonHours?: number;
    /** Elevation defining AOS/LOS for the contact blocks. Default 5 deg. */
    minElevation?: Degrees;
    /** Draw the sunlight/eclipse lane. Default true. */
    showLighting?: boolean;
    /** Start the deck collapsed (operator can expand). Default false. */
    startCollapsed?: boolean;
  };

  /** M4: space-domain events (maneuvers / stale TLEs). Starts SpaceEventManager. */
  spaceEvents?: Array<{
    id: string;
    satelliteNoradId: number;
    maneuverAtS: number;
    newTle: { tle1: string; tle2: string };
    label?: string;
  }>;

  /** M6: SOC-lite security console (audit log + access control). Starts SecurityConsoleCore. */
  security?: {
    accounts: Array<{
      id: string;
      name: string;
      role: string;
      status: 'active' | 'disabled' | 'expired';
    }>;
    events: Array<{
      id: string;
      timeS?: number;
      timestampLabel?: string;
      actor: string;
      action: string;
      category: 'auth' | 'config' | 'command' | 'access';
      severity: 'info' | 'warning' | 'critical';
      isAnomaly?: boolean;
    }>;
  };

  /** M7: TRANSEC anti-jam waveform. Starts TransecManager. */
  transec?: {
    groundStationId?: string;
    hopChannelsHz?: number[];
    /** Whether a hop-set key must be loaded for sync to lock (default true) */
    requireKey?: boolean;
  };

  /** M8: GNSS spoofing / timing attack. Starts GnssThreatManager. */
  gnssThreat?: {
    groundStationIds?: string[];
    spoofStartS: number;
    spoofEndS?: number;
    offsetDriftUsPerS?: number;
  };
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
  natsEuSandboxData,
  natsEuScenario1Data,
  hamSdrSandboxData,
  signalHunterSandboxData,
  ccsScenario1Data,
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