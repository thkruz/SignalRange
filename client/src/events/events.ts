import { Milliseconds } from "@app/engine/ootk/src/main";
import { AntennaState } from "@app/equipment/antenna/antenna";
import { RealTimeSpectrumAnalyzerState } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { ReceiverModemState } from "../equipment/receiver/receiver";
import { TransmitterModem } from "../equipment/transmitter/transmitter";
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
  unit: number;
  modem: number;
  config: TransmitterModem;
}

export interface TxActiveModemChangedData {
  unit: number;
  activeModem: number;
}

export interface TxTransmitChangedData {
  unit: number;
  modem: number;
  transmitting: boolean;
  rfSignal: RfSignal;
}

export interface TxErrorData {
  message: string;
}

// RX Event specific interfaces
export interface RxConfigChangedData {
  unit: number;
  modem: number;
  config: ReceiverModemState;
}

export interface RxActiveModemChangedData {
  unit: number;
  activeModem: number;
}

export interface RxSignalFoundData {
  unit: number;
  modem: number;
}

export interface RxSignalLostData {
  unit: number;
  modem: number;
}

export enum Events {
  // Antenna events
  ANTENNA_CONFIG_CHANGED = 'antenna:config:changed',
  ANTENNA_LOOPBACK_CHANGED = 'antenna:loopback:changed',
  ANTENNA_HPA_CHANGED = 'antenna:hpa:changed',
  ANTENNA_TRACK_CHANGED = 'antenna:track:changed',
  ANTENNA_LOCKED = 'antenna:locked',
  ANTENNA_POWER_CHANGED = 'antenna:power:changed',
  ANTENNA_ERROR = 'antenna:error',

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
  UPDATE = "app:update",
  DRAW = "app:draw",
  SYNC = "app:sync",
}

export interface EventMap {
  [Events.ANTENNA_CONFIG_CHANGED]: [AntennaState];
  [Events.ANTENNA_LOOPBACK_CHANGED]: [AntennaLoopbackChangedData];
  [Events.ANTENNA_HPA_CHANGED]: [AntennaHpaChangedData];
  [Events.ANTENNA_TRACK_CHANGED]: [AntennaTrackChangedData];
  [Events.ANTENNA_LOCKED]: [AntennaLockedData];
  [Events.ANTENNA_POWER_CHANGED]: [AntennaPowerChangedData];
  [Events.ANTENNA_ERROR]: [AntennaErrorData];

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

  [Events.UPDATE]: [Milliseconds];
  [Events.DRAW]: [Milliseconds];
  [Events.SYNC]: [];
}