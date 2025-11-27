import { AntennaState } from "@app/equipment/antenna";
import { RealTimeSpectrumAnalyzerState } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { BUCState } from "@app/equipment/rf-front-end/buc-module";
import { CouplerState } from "@app/equipment/rf-front-end/coupler-module/coupler-module";
import { IfFilterBankState } from "@app/equipment/rf-front-end/filter-module";
import { GPSDOState } from "@app/equipment/rf-front-end/gpsdo-module";
import { OMTState } from "@app/equipment/rf-front-end/omt-module/omt-module";
import { RFFrontEndState } from "@app/equipment/rf-front-end/rf-front-end-core";
import { Milliseconds } from "ootk";
import { ReceiverModemState } from "../equipment/receiver/receiver";
import { TransmitterModem } from "../equipment/transmitter/transmitter";
import { ConditionState, Objective, ObjectiveState } from "../objectives/objective-types";
import { RfSignal } from "../types";
import { HPAState } from "@app/equipment/rf-front-end/hpa-module";
import { LNBState } from "@app/equipment/rf-front-end/lnb-module";

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

export enum Events {
  // Antenna events
  ANTENNA_STATE_CHANGED = 'antenna:state:changed',

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
  UPDATE = "app:update",
  DRAW = "app:draw",
  SYNC = "app:sync",
  RF_FE_POWER_CHANGED = "rf-fe:power:changed",
  RF_FE_BUC_CHANGED = "rf-fe:buc:changed",
  RF_FE_HPA_CHANGED = "rf-fe:hpa:changed",
  RF_FE_LNB_CHANGED = "rf-fe:lnb:changed",
  RF_FE_ALARM = "rf-fe:alarm",
  RF_FE_OMT_CHANGED = "rf-fe:omt:changed",
  RF_FE_COUPLER_CHANGED = "rf-fe:coupler:changed",
  RF_FE_FILTER_CHANGED = "rf-fe:filter:changed",
  RF_FE_GPSDO_CHANGED = "rf-fe:gpsdo:changed",

  // Objectives events
  OBJECTIVE_ACTIVATED = 'objective:activated',
  OBJECTIVE_COMPLETED = 'objective:completed',
  OBJECTIVE_CONDITION_CHANGED = 'objective:condition:changed',
  OBJECTIVES_ALL_COMPLETED = 'objectives:all:completed',

  // Progress Save events
  PROGRESS_SAVE_START = 'progress:save:start',
  PROGRESS_SAVE_SUCCESS = 'progress:save:success',
  PROGRESS_SAVE_ERROR = 'progress:save:error',
}

export interface EventMap {
  [Events.ANTENNA_STATE_CHANGED]: [Partial<AntennaState>];

  [Events.RF_FE_POWER_CHANGED]: [Partial<RFFrontEndState>];
  [Events.RF_FE_BUC_CHANGED]: [Partial<BUCState>];
  [Events.RF_FE_HPA_CHANGED]: [Partial<HPAState>];
  [Events.RF_FE_LNB_CHANGED]: [Partial<LNBState>];
  [Events.RF_FE_OMT_CHANGED]: [Partial<OMTState>];
  [Events.RF_FE_COUPLER_CHANGED]: [Partial<CouplerState>];
  [Events.RF_FE_FILTER_CHANGED]: [Partial<IfFilterBankState>];
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

  [Events.PROGRESS_SAVE_START]: [ProgressSaveStartData];
  [Events.PROGRESS_SAVE_SUCCESS]: [ProgressSaveSuccessData];
  [Events.PROGRESS_SAVE_ERROR]: [ProgressSaveErrorData];
}