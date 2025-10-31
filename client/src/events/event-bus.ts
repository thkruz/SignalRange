import { AntennaConfig, AntennaErrorData, AntennaHpaChangedData, AntennaLockedData, AntennaLoopbackChangedData, AntennaPowerChangedData, AntennaTrackChangedData } from "../equipment/antenna/antenna";
import { RxConfigChangedData, RxSignalFoundData, RxSignalLostData } from "../equipment/receiver/receiver";
import { SpectrumAnalyzerConfig } from "../equipment/spectrum-analyzer/spectrum-analyzer";
import { TxConfigChangedData, TxErrorData, TxTransmitChangedData } from "../equipment/transmitter/transmitter";
import { Logger } from "../logging/logger";
import { Events } from "./events";

export interface EventMap {
  [Events.ANTENNA_CONFIG_CHANGED]: [AntennaConfig];
  [Events.ANTENNA_LOOPBACK_CHANGED]: [AntennaLoopbackChangedData];
  [Events.ANTENNA_HPA_CHANGED]: [AntennaHpaChangedData];
  [Events.ANTENNA_TRACK_CHANGED]: [AntennaTrackChangedData];
  [Events.ANTENNA_LOCKED]: [AntennaLockedData];
  [Events.ANTENNA_POWER_CHANGED]: [AntennaPowerChangedData];
  [Events.ANTENNA_ERROR]: [AntennaErrorData];

  [Events.TX_CONFIG_CHANGED]: [TxConfigChangedData];
  [Events.TX_TRANSMIT_CHANGED]: [TxTransmitChangedData];
  [Events.TX_ERROR]: [TxErrorData];

  [Events.RX_CONFIG_CHANGED]: [RxConfigChangedData];
  [Events.RX_SIGNAL_FOUND]: [RxSignalFoundData];
  [Events.RX_SIGNAL_LOST]: [RxSignalLostData];

  [Events.SPEC_A_CONFIG_CHANGED]: [Partial<SpectrumAnalyzerConfig>];
  [Events.SPEC_A_MODE_CHANGED]: [Partial<SpectrumAnalyzerConfig>];

  [Events.ROUTE_CHANGED]: [{ path: string }];
}

/**
 * EventBus - Simple pub/sub for cross-component communication
 * Replaces the need for prop drilling or complex state management
 */
export class EventBus {
  private static instance: EventBus;
  private readonly events: {
    [K in Events]?: Array<(...args: EventMap[K]) => void>;
  } = {};

  private constructor() { }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event
   */
  public on<T extends Events>(event: T, cb: (...args: EventMap[T]) => void) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event]!.push(cb);
  }

  /**
 * Emit an event
 */
  public emit<T extends Events>(event: T, ...args: EventMap[T]): void {
    Logger.log(`EventBus: Emitting event '${event}' with args:`, args);
    const callbacks = this.events[event];
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }
}
