import { GroundStationState } from "@app/assets/ground-station/ground-station-state";
import { AntennaState } from "@app/equipment/antenna";
import type { Character } from "@app/modal/character-enum";
import { RealTimeSpectrumAnalyzerState } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { AGCState } from "@app/equipment/rf-front-end/agc-module";
import { BUCState } from "@app/equipment/rf-front-end/buc-module";
import { CouplerState } from "@app/equipment/rf-front-end/coupler-module/coupler-module";
import { IfFilterBankState } from "@app/equipment/rf-front-end/filter-module";
import { NotchFilterState } from "@app/equipment/rf-front-end/notch-filter-module";
import { GPSDOState } from "@app/equipment/rf-front-end/gpsdo-module";
import { HPAState } from "@app/equipment/rf-front-end/hpa-module";
import { LNBState } from "@app/equipment/rf-front-end/lnb-module";
import { OMTState } from "@app/equipment/rf-front-end/omt-module/omt-module";
import { RFFrontEndState } from "@app/equipment/rf-front-end/rf-front-end-core";
import { Milliseconds } from "ootk";
import { ReceiverModemState } from "../equipment/receiver/receiver";
import { TransmitterModem } from "../equipment/transmitter/transmitter";
import { ConditionState, Objective, ObjectiveState } from "../objectives/objective-types";
import { OpsLogEntry } from "../ops-log/ops-log-types";
import { RfSignal } from "../types";

// Antenna Event specific interfaces
export interface AntennaLoopbackChangedData {
  loopback: boolean;
}

export interface AntennaHpaChangedData {
  hpa: boolean;
}

export interface AntennaTrackChangedData {
  track: boolean;
}

export interface AntennaLockedData {
  locked: boolean;
}

export interface AntennaPowerChangedData {
  operational: boolean;
}

export interface AntennaErrorData {
  message: string;
}

// TX Event specific interfaces
export interface TxConfigChangedData {
  uuid: string;
  modem: number;
  config: TransmitterModem;
}

export interface TxActiveModemChangedData {
  uuid: string;
  activeModem: number;
}

export interface TxTransmitChangedData {
  uuid: string;
  modem: number;
  transmitting: boolean;
  rfSignal: RfSignal;
}

export interface TxErrorData {
  message: string;
}

// RX Event specific interfaces
export interface RxConfigChangedData {
  uuid: string;
  modem: number;
  config: ReceiverModemState;
}

export interface RxActiveModemChangedData {
  uuid: string;
  activeModem: number;
}

export interface RxSignalFoundData {
  uuid: string;
  modem: number;
}

export interface RxSignalLostData {
  uuid: string;
  modem: number;
}

// Objectives Event specific interfaces
export interface ObjectiveActivatedData {
  objectiveId: string;
  objective: Objective;
  activatedAt: number;
}

export interface ObjectiveCompletedData {
  objectiveId: string;
  objective: Objective;
  completedAt: number;
}

export interface ObjectiveConditionChangedData {
  objectiveId: string;
  conditionIndex: number;
  isSatisfied: boolean;
  conditionState: ConditionState;
}

export interface ObjectivesAllCompletedData {
  completedObjectives: ObjectiveState[];
  totalTime: number;
}

export interface ObjectiveFailedData {
  objectiveId: string;
  objective: Objective;
  failedAt: number;
  reason: 'timeout';
}

// Quiz Event specific interfaces
export interface QuizShowData {
  objectiveId: string;
  conditionIndex: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  pointPenalty: number;
  /** Which character asks the question (default: CHARLIE_BROOKS) */
  character?: Character;
}

export interface QuizAnsweredData {
  objectiveId: string;
  conditionIndex: number;
  isCorrect: boolean;
  selectedIndex: number;
  attempts: number;
  pointsDeducted: number;
}

export interface QuizCompletedData {
  objectiveId: string;
  conditionIndex: number;
  totalAttempts: number;
  totalPointsDeducted: number;
}

export interface QuizDismissedData {
  objectiveId: string;
  conditionIndex: number;
}

export interface QuizPendingData {
  objectiveId: string;
  conditionIndex: number;
}

export interface QuizPassedData {
  objectiveId: string;
  conditionIndex: number;
  attempts: number;
  pointsDeducted: number;
}

export interface ScenarioTimeExpiredData {
  elapsedTime: number;
  timeLimit: number;
}

export interface TimePenaltyAppliedData {
  objectiveId: string;
  objectiveTitle: string;
  pointsDeducted: number;
  message?: string;
  elapsedTime: number;
  threshold: number;
}

// Progress Save Event specific interfaces
export interface ProgressSaveStartData {
  timestamp: number;
}

export interface ProgressSaveSuccessData {
  timestamp: number;
  checkpointId: string;
}

export interface ProgressSaveErrorData {
  timestamp: number;
  error: Error;
}

// Alarm Event specific interfaces
export interface AggregatedAlarm {
  severity: 'error' | 'warning' | 'info' | 'success';
  message: string;
  assetId: string;
  equipmentType: string;
  equipmentIndex: number;
}

export interface AlarmStateChangedData {
  alarms: AggregatedAlarm[];
  highestSeverity: 'error' | 'warning' | 'info' | 'success';
}

// Weather Event specific interfaces
export interface WeatherEventData {
  id: string;
  groundStationId: string;
  type: 'snow' | 'rain' | 'fog' | 'wind' | 'dust' | 'hail' | 'ice' | 'storm';
  severity: 'minor' | 'moderate' | 'severe';
  startTime: number;
  duration: number;
  linkMarginDegradation: number;
}

export interface WeatherMissionFailureData {
  groundStationId: string;
  satelliteId: number;
  weatherEventId: string;
  currentCN: number | null;
  requiredCN: number;
}

// Handover Event specific interfaces
export interface HandoverInitiatedData {
  satelliteId: number;
  sourceStationId: string;
  targetStationId: string;
}

export interface HandoverReadyData {
  satelliteId: number;
  sourceStationId: string;
  targetStationId: string;
}

export interface HandoverCompleteData {
  satelliteId: number;
  previousOwnerId: string;
  newOwnerId: string;
}

export interface HandoverCancelledData {
  satelliteId: number;
}

export interface DualTransmissionViolationData {
  satelliteNoradId: number;
  groundStation1Id: string;
  groundStation2Id: string;
  detectedAt: number;
}

// Simulated Time Event specific interfaces
export interface SimulatedTimeTickData {
  /** Military format datetime string, e.g., "15 MAR 2025 22:05:15" */
  timeFormatted: string;
  /** Unix timestamp in milliseconds */
  timestampMs: number;
}

export enum Events {
  // Antenna events
  ANTENNA_STATE_CHANGED = 'antenna:state:changed',

  // Ground Station events
  GROUND_STATION_STATE_CHANGED = 'ground-station:state:changed',
  ASSET_SELECTED = 'asset:selected',

  // Transmitter events
  TX_CONFIG_CHANGED = 'tx:config:changed',
  TX_ACTIVE_MODEM_CHANGED = 'tx:activeModem:changed',
  TX_TRANSMIT_CHANGED = 'tx:transmit:changed',
  TX_ERROR = 'tx:error',

  // Receiver events
  RX_CONFIG_CHANGED = 'rx:config:changed',
  RX_ACTIVE_MODEM_CHANGED = "rx:activeModem:changed",
  RX_SIGNAL_FOUND = 'rx:signal:found',
  RX_SIGNAL_LOST = 'rx:signal:lost',

  // Spectrum Analyzer events
  SPEC_A_CONFIG_CHANGED = 'specA:config:changed',

  // Router events
  ROUTE_CHANGED = 'route:changed',
  STORAGE_ERROR = "STORAGE_ERROR",

  // Game loop events
  DOM_READY = "app:dom-ready",
  /** This event is called every simulation update tick */
  UPDATE = "app:update",
  /** This event is used for canvas rendering */
  DRAW = "app:draw",
  SYNC = "app:sync",
  RF_FE_POWER_CHANGED = "rf-fe:power:changed",
  RF_FE_BUC_CHANGED = "rf-fe:buc:changed",
  RF_FE_HPA_CHANGED = "rf-fe:hpa:changed",
  RF_FE_AGC_CHANGED = "rf-fe:agc:changed",
  RF_FE_LNB_CHANGED = "rf-fe:lnb:changed",
  RF_FE_ALARM = "rf-fe:alarm",
  RF_FE_OMT_CHANGED = "rf-fe:omt:changed",
  RF_FE_COUPLER_CHANGED = "rf-fe:coupler:changed",
  RF_FE_FILTER_CHANGED = "rf-fe:filter:changed",
  RF_FE_NOTCH_FILTER_CHANGED = "rf-fe:notch-filter:changed",
  RF_FE_GPSDO_CHANGED = "rf-fe:gpsdo:changed",

  // Objectives events
  OBJECTIVE_ACTIVATED = 'objective:activated',
  OBJECTIVE_COMPLETED = 'objective:completed',
  OBJECTIVE_CONDITION_CHANGED = 'objective:condition:changed',
  OBJECTIVES_ALL_COMPLETED = 'objectives:all:completed',
  OBJECTIVE_FAILED = 'objective:failed',
  SCENARIO_TIME_EXPIRED = 'scenario:time:expired',
  TIME_PENALTY_APPLIED = 'time:penalty:applied',
  SCENARIO_UNLOCKED = 'scenario:unlocked',

  // Quiz events (for status-check conditions)
  QUIZ_SHOW = 'quiz:show',
  QUIZ_ANSWERED = 'quiz:answered',
  QUIZ_COMPLETED = 'quiz:completed',
  QUIZ_DISMISSED = 'quiz:dismissed',
  QUIZ_PENDING = 'quiz:pending',
  QUIZ_PASSED = 'quiz:passed',

  // Progress Save events
  PROGRESS_SAVE_START = 'progress:save:start',
  PROGRESS_SAVE_SUCCESS = 'progress:save:success',
  PROGRESS_SAVE_ERROR = 'progress:save:error',

  // Global Alarm events
  ALARM_STATE_CHANGED = 'alarm:state:changed',

  // Navigation events
  SWITCH_TAB = 'navigation:switch:tab',
  MISSION_OVERVIEW_SELECTED = 'navigation:mission-overview',

  // Weather events
  WEATHER_EVENT_STARTED = 'weather:event:started',
  WEATHER_EVENT_ENDED = 'weather:event:ended',
  WEATHER_MISSION_FAILURE = 'weather:mission:failure',

  // Dialog events
  DIALOG_HISTORY_CHANGED = 'dialog:history:changed',
  DIALOG_DISMISSED = 'dialog:dismissed',

  // Traffic Control / Handover events
  HANDOVER_INITIATED = 'handover:initiated',
  HANDOVER_READY = 'handover:ready',
  HANDOVER_COMPLETE = 'handover:complete',
  HANDOVER_CANCELLED = 'handover:cancelled',
  DUAL_TRANSMISSION_VIOLATION = 'handover:dual-transmission-violation',

  // Ops Log events
  OPS_LOG_ENTRY_ADDED = 'ops-log:entry:added',

  // Simulated Time events
  SIMULATED_TIME_TICK = 'simulated-time:tick',
}

export interface EventMap {
  [Events.ANTENNA_STATE_CHANGED]: [Partial<AntennaState>];

  [Events.GROUND_STATION_STATE_CHANGED]: [Partial<GroundStationState>];
  [Events.ASSET_SELECTED]: [{ type: 'ground-station' | 'satellite', id: string }];

  [Events.RF_FE_POWER_CHANGED]: [Partial<RFFrontEndState>];
  [Events.RF_FE_BUC_CHANGED]: [Partial<BUCState>];
  [Events.RF_FE_HPA_CHANGED]: [Partial<HPAState>];
  [Events.RF_FE_AGC_CHANGED]: [Partial<AGCState>];
  [Events.RF_FE_LNB_CHANGED]: [Partial<LNBState>];
  [Events.RF_FE_OMT_CHANGED]: [Partial<OMTState>];
  [Events.RF_FE_COUPLER_CHANGED]: [Partial<CouplerState>];
  [Events.RF_FE_FILTER_CHANGED]: [Partial<IfFilterBankState>];
  [Events.RF_FE_NOTCH_FILTER_CHANGED]: [Partial<NotchFilterState>];
  [Events.RF_FE_GPSDO_CHANGED]: [Partial<GPSDOState>];
  [Events.RF_FE_ALARM]: [{
    unit: number;
    alarms: string[];
  }];

  [Events.TX_CONFIG_CHANGED]: [TxConfigChangedData];
  [Events.TX_ACTIVE_MODEM_CHANGED]: [TxActiveModemChangedData];
  [Events.TX_TRANSMIT_CHANGED]: [TxTransmitChangedData];
  [Events.TX_ERROR]: [TxErrorData];

  [Events.RX_CONFIG_CHANGED]: [RxConfigChangedData];
  [Events.RX_SIGNAL_FOUND]: [RxSignalFoundData];
  [Events.RX_SIGNAL_LOST]: [RxSignalLostData];
  [Events.RX_ACTIVE_MODEM_CHANGED]: [RxActiveModemChangedData];

  [Events.SPEC_A_CONFIG_CHANGED]: [Partial<RealTimeSpectrumAnalyzerState>];

  [Events.ROUTE_CHANGED]: [{ path: string }];

  [Events.STORAGE_ERROR]: [Error];

  [Events.DOM_READY]: [];
  [Events.UPDATE]: [Milliseconds];
  [Events.DRAW]: [Milliseconds];
  [Events.SYNC]: [];

  [Events.OBJECTIVE_ACTIVATED]: [ObjectiveActivatedData];
  [Events.OBJECTIVE_COMPLETED]: [ObjectiveCompletedData];
  [Events.OBJECTIVE_CONDITION_CHANGED]: [ObjectiveConditionChangedData];
  [Events.OBJECTIVES_ALL_COMPLETED]: [ObjectivesAllCompletedData];
  [Events.OBJECTIVE_FAILED]: [ObjectiveFailedData];
  [Events.SCENARIO_TIME_EXPIRED]: [ScenarioTimeExpiredData];
  [Events.TIME_PENALTY_APPLIED]: [TimePenaltyAppliedData];
  [Events.SCENARIO_UNLOCKED]: [];

  [Events.QUIZ_SHOW]: [QuizShowData];
  [Events.QUIZ_ANSWERED]: [QuizAnsweredData];
  [Events.QUIZ_COMPLETED]: [QuizCompletedData];
  [Events.QUIZ_DISMISSED]: [QuizDismissedData];
  [Events.QUIZ_PENDING]: [QuizPendingData];
  [Events.QUIZ_PASSED]: [QuizPassedData];

  [Events.PROGRESS_SAVE_START]: [ProgressSaveStartData];
  [Events.PROGRESS_SAVE_SUCCESS]: [ProgressSaveSuccessData];
  [Events.PROGRESS_SAVE_ERROR]: [ProgressSaveErrorData];

  [Events.ALARM_STATE_CHANGED]: [AlarmStateChangedData];

  [Events.SWITCH_TAB]: [{ tabId: string }];
  [Events.MISSION_OVERVIEW_SELECTED]: [];

  // Weather events
  [Events.WEATHER_EVENT_STARTED]: [WeatherEventData];
  [Events.WEATHER_EVENT_ENDED]: [WeatherEventData];
  [Events.WEATHER_MISSION_FAILURE]: [WeatherMissionFailureData];

  // Dialog events
  [Events.DIALOG_HISTORY_CHANGED]: [];
  [Events.DIALOG_DISMISSED]: [];

  // Handover events
  [Events.HANDOVER_INITIATED]: [HandoverInitiatedData];
  [Events.HANDOVER_READY]: [HandoverReadyData];
  [Events.HANDOVER_COMPLETE]: [HandoverCompleteData];
  [Events.HANDOVER_CANCELLED]: [HandoverCancelledData];
  [Events.DUAL_TRANSMISSION_VIOLATION]: [DualTransmissionViolationData];

  // Ops Log events
  [Events.OPS_LOG_ENTRY_ADDED]: [OpsLogEntry];

  // Simulated Time events
  [Events.SIMULATED_TIME_TICK]: [SimulatedTimeTickData];
}