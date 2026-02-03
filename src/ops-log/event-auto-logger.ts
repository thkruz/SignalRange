/**
 * @file EventAutoLogger - Auto-logs equipment events to OpsLogManager
 * @description Singleton service that subscribes to equipment events and creates
 * human-readable log entries. Only active for beginner/intermediate difficulty.
 */

import type { AntennaState } from '@app/equipment/antenna';
import type { AGCState } from '@app/equipment/rf-front-end/agc-module';
import type { BUCState } from '@app/equipment/rf-front-end/buc-module';
import type { CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import type { IfFilterBankState } from '@app/equipment/rf-front-end/filter-module';
import type { GPSDOState } from '@app/equipment/rf-front-end/gpsdo-module/gpsdo-state';
import type { HPAState } from '@app/equipment/rf-front-end/hpa-module';
import type { LNBState } from '@app/equipment/rf-front-end/lnb-module';
import type { NotchFilterState } from '@app/equipment/rf-front-end/notch-filter-module';
import type { OMTState } from '@app/equipment/rf-front-end/omt-module/omt-module';
import type { RFFrontEndState } from '@app/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '@app/events/event-bus';
import {
  Events,
  RxActiveModemChangedData,
  RxConfigChangedData,
  TxActiveModemChangedData,
  TxConfigChangedData,
  TxTransmitChangedData
} from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import {
  formatAgcEvent,
  formatAntennaEvent,
  formatBucEvent,
  formatCouplerEvent,
  formatFilterEvent,
  formatGpsdoEvent,
  formatHpaEvent,
  formatLnbEvent,
  formatNotchFilterEvent,
  formatOmtEvent,
  formatRfFePowerEvent,
  formatRxActiveModemEvent,
  formatRxConfigEvent,
  formatTxActiveModemEvent,
  formatTxConfigEvent,
  formatTxTransmitEvent
} from './event-formatters';
import { OpsLogManager } from './ops-log-manager';

/**
 * Auto-logs equipment events to the operations log.
 * Only active for beginner and intermediate difficulty levels.
 */
export class EventAutoLogger {
  private static instance_: EventAutoLogger | null = null;

  private readonly eventBus_: EventBus;
  private isEnabled_: boolean = false;

  // Throttling and deduplication
  private static readonly THROTTLE_MS = 500;
  private readonly lastLogTime_: Map<Events, number> = new Map();
  private readonly lastLoggedMessage_: Map<Events, string> = new Map();

  // Bound handlers for cleanup
  private readonly boundAntennaHandler_: (data: Partial<AntennaState>) => void;
  private readonly boundTxConfigHandler_: (data: TxConfigChangedData) => void;
  private readonly boundTxModemHandler_: (data: TxActiveModemChangedData) => void;
  private readonly boundTxTransmitHandler_: (data: TxTransmitChangedData) => void;
  private readonly boundRxConfigHandler_: (data: RxConfigChangedData) => void;
  private readonly boundRxModemHandler_: (data: RxActiveModemChangedData) => void;
  private readonly boundRfPowerHandler_: (data: Partial<RFFrontEndState>) => void;
  private readonly boundBucHandler_: (data: Partial<BUCState>) => void;
  private readonly boundHpaHandler_: (data: Partial<HPAState>) => void;
  private readonly boundAgcHandler_: (data: Partial<AGCState>) => void;
  private readonly boundLnbHandler_: (data: Partial<LNBState>) => void;
  private readonly boundOmtHandler_: (data: Partial<OMTState>) => void;
  private readonly boundCouplerHandler_: (data: Partial<CouplerState>) => void;
  private readonly boundFilterHandler_: (data: Partial<IfFilterBankState>) => void;
  private readonly boundNotchFilterHandler_: (data: Partial<NotchFilterState>) => void;
  private readonly boundGpsdoHandler_: (data: Partial<GPSDOState>) => void;

  private constructor() {
    this.eventBus_ = EventBus.getInstance();

    // Bind all handlers
    this.boundAntennaHandler_ = this.handleAntennaEvent_.bind(this);
    this.boundTxConfigHandler_ = this.handleTxConfigEvent_.bind(this);
    this.boundTxModemHandler_ = this.handleTxModemEvent_.bind(this);
    this.boundTxTransmitHandler_ = this.handleTxTransmitEvent_.bind(this);
    this.boundRxConfigHandler_ = this.handleRxConfigEvent_.bind(this);
    this.boundRxModemHandler_ = this.handleRxModemEvent_.bind(this);
    this.boundRfPowerHandler_ = this.handleRfPowerEvent_.bind(this);
    this.boundBucHandler_ = this.handleBucEvent_.bind(this);
    this.boundHpaHandler_ = this.handleHpaEvent_.bind(this);
    this.boundAgcHandler_ = this.handleAgcEvent_.bind(this);
    this.boundLnbHandler_ = this.handleLnbEvent_.bind(this);
    this.boundOmtHandler_ = this.handleOmtEvent_.bind(this);
    this.boundCouplerHandler_ = this.handleCouplerEvent_.bind(this);
    this.boundFilterHandler_ = this.handleFilterEvent_.bind(this);
    this.boundNotchFilterHandler_ = this.handleNotchFilterEvent_.bind(this);
    this.boundGpsdoHandler_ = this.handleGpsdoEvent_.bind(this);
  }

  static getInstance(): EventAutoLogger {
    EventAutoLogger.instance_ ??= new EventAutoLogger();
    return EventAutoLogger.instance_;
  }

  /**
   * Initialize the auto-logger. Checks difficulty and subscribes if appropriate.
   * Call this after OpsLogManager.initialize() in base-page.ts.
   */
  initialize(): void {
    try {
      const difficulty = ScenarioManager.getInstance().data?.difficulty;

      // Only enable for beginner and intermediate
      if (difficulty === 'advanced') {
        this.isEnabled_ = false;
        return;
      }

      this.isEnabled_ = true;
      this.subscribeToEvents_();
    } catch {
      // ScenarioManager not initialized - skip auto-logging
      this.isEnabled_ = false;
    }
  }

  private subscribeToEvents_(): void {
    this.eventBus_.on(Events.ANTENNA_STATE_CHANGED, this.boundAntennaHandler_);
    this.eventBus_.on(Events.TX_CONFIG_CHANGED, this.boundTxConfigHandler_);
    this.eventBus_.on(Events.TX_ACTIVE_MODEM_CHANGED, this.boundTxModemHandler_);
    this.eventBus_.on(Events.TX_TRANSMIT_CHANGED, this.boundTxTransmitHandler_);
    this.eventBus_.on(Events.RX_CONFIG_CHANGED, this.boundRxConfigHandler_);
    this.eventBus_.on(Events.RX_ACTIVE_MODEM_CHANGED, this.boundRxModemHandler_);
    this.eventBus_.on(Events.RF_FE_POWER_CHANGED, this.boundRfPowerHandler_);
    this.eventBus_.on(Events.RF_FE_BUC_CHANGED, this.boundBucHandler_);
    this.eventBus_.on(Events.RF_FE_HPA_CHANGED, this.boundHpaHandler_);
    this.eventBus_.on(Events.RF_FE_AGC_CHANGED, this.boundAgcHandler_);
    this.eventBus_.on(Events.RF_FE_LNB_CHANGED, this.boundLnbHandler_);
    this.eventBus_.on(Events.RF_FE_OMT_CHANGED, this.boundOmtHandler_);
    this.eventBus_.on(Events.RF_FE_COUPLER_CHANGED, this.boundCouplerHandler_);
    this.eventBus_.on(Events.RF_FE_FILTER_CHANGED, this.boundFilterHandler_);
    this.eventBus_.on(Events.RF_FE_NOTCH_FILTER_CHANGED, this.boundNotchFilterHandler_);
    this.eventBus_.on(Events.RF_FE_GPSDO_CHANGED, this.boundGpsdoHandler_);
  }

  /**
   * Check if this message should be skipped due to throttling or being a duplicate.
   * Returns true if the message should NOT be logged.
   */
  private shouldSkip_(event: Events, message: string | null, skipThrottle: boolean = false): boolean {
    // No message to log
    if (!message) return true;

    // Skip if same message as last logged for this event type
    if (this.lastLoggedMessage_.get(event) === message) {
      return true;
    }

    // Check time-based throttling
    if (!skipThrottle) {
      const now = Date.now();
      const lastTime = this.lastLogTime_.get(event) ?? 0;
      if (now - lastTime < EventAutoLogger.THROTTLE_MS) {
        return true;
      }
      this.lastLogTime_.set(event, now);
    }

    // Record this message as the last logged
    this.lastLoggedMessage_.set(event, message);
    return false;
  }

  /**
   * Log a message to OpsLogManager if enabled and initialized
   */
  private log_(message: string, source?: string): void {
    if (!this.isEnabled_ || !OpsLogManager.isInitialized()) return;
    OpsLogManager.getInstance().log(message, 'action', source);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Event Handlers
  // ════════════════════════════════════════════════════════════════════════════

  private handleAntennaEvent_(data: Partial<AntennaState>): void {
    const message = formatAntennaEvent(data);
    if (this.shouldSkip_(Events.ANTENNA_STATE_CHANGED, message)) return;
    this.log_(message, 'ANT');
  }

  private handleTxConfigEvent_(data: TxConfigChangedData): void {
    const message = formatTxConfigEvent(data);
    if (this.shouldSkip_(Events.TX_CONFIG_CHANGED, message)) return;
    this.log_(message, 'TX');
  }

  private handleTxModemEvent_(data: TxActiveModemChangedData): void {
    const message = formatTxActiveModemEvent(data);
    // Skip throttle for intentional user action, but still dedupe
    if (this.shouldSkip_(Events.TX_ACTIVE_MODEM_CHANGED, message, true)) return;
    this.log_(message, 'TX');
  }

  private handleTxTransmitEvent_(data: TxTransmitChangedData): void {
    const message = formatTxTransmitEvent(data);
    // Skip throttle for critical state change, but still dedupe
    if (this.shouldSkip_(Events.TX_TRANSMIT_CHANGED, message, true)) return;
    this.log_(message, 'TX');
  }

  private handleRxConfigEvent_(data: RxConfigChangedData): void {
    const message = formatRxConfigEvent(data);
    if (this.shouldSkip_(Events.RX_CONFIG_CHANGED, message)) return;
    this.log_(message, 'RX');
  }

  private handleRxModemEvent_(data: RxActiveModemChangedData): void {
    const message = formatRxActiveModemEvent(data);
    // Skip throttle for intentional user action, but still dedupe
    if (this.shouldSkip_(Events.RX_ACTIVE_MODEM_CHANGED, message, true)) return;
    this.log_(message, 'RX');
  }

  private handleRfPowerEvent_(data: Partial<RFFrontEndState>): void {
    const message = formatRfFePowerEvent(data);
    // Skip throttle for important state change, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_POWER_CHANGED, message, true)) return;
    this.log_(message, 'RF FE');
  }

  private handleBucEvent_(data: Partial<BUCState>): void {
    const message = formatBucEvent(data);
    if (this.shouldSkip_(Events.RF_FE_BUC_CHANGED, message)) return;
    this.log_(message, 'RF FE');
  }

  private handleHpaEvent_(data: Partial<HPAState>): void {
    const message = formatHpaEvent(data);
    // Skip throttle for HPA enable/disable, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_HPA_CHANGED, message, true)) return;
    this.log_(message, 'RF FE');
  }

  private handleAgcEvent_(data: Partial<AGCState>): void {
    const message = formatAgcEvent(data);
    if (this.shouldSkip_(Events.RF_FE_AGC_CHANGED, message)) return;
    this.log_(message, 'RF FE');
  }

  private handleLnbEvent_(data: Partial<LNBState>): void {
    const message = formatLnbEvent(data);
    if (this.shouldSkip_(Events.RF_FE_LNB_CHANGED, message)) return;
    this.log_(message, 'RF FE');
  }

  private handleOmtEvent_(data: Partial<OMTState>): void {
    const message = formatOmtEvent(data);
    // Skip throttle for intentional user action, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_OMT_CHANGED, message, true)) return;
    this.log_(message, 'RF FE');
  }

  private handleCouplerEvent_(data: Partial<CouplerState>): void {
    const message = formatCouplerEvent(data);
    // Skip throttle for intentional user action, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_COUPLER_CHANGED, message, true)) return;
    this.log_(message, 'RF FE');
  }

  private handleFilterEvent_(data: Partial<IfFilterBankState>): void {
    const message = formatFilterEvent(data);
    if (this.shouldSkip_(Events.RF_FE_FILTER_CHANGED, message)) return;
    this.log_(message, 'RF FE');
  }

  private handleNotchFilterEvent_(data: Partial<NotchFilterState>): void {
    const message = formatNotchFilterEvent(data);
    if (this.shouldSkip_(Events.RF_FE_NOTCH_FILTER_CHANGED, message)) return;
    this.log_(message, 'RF FE');
  }

  private handleGpsdoEvent_(data: Partial<GPSDOState>): void {
    const message = formatGpsdoEvent(data);
    // Skip throttle for important state change, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_GPSDO_CHANGED, message, true)) return;
    this.log_(message, 'RF FE');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Cleanup
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Unsubscribe from all events and reset state
   */
  dispose(): void {
    if (!this.isEnabled_) return;

    this.eventBus_.off(Events.ANTENNA_STATE_CHANGED, this.boundAntennaHandler_);
    this.eventBus_.off(Events.TX_CONFIG_CHANGED, this.boundTxConfigHandler_);
    this.eventBus_.off(Events.TX_ACTIVE_MODEM_CHANGED, this.boundTxModemHandler_);
    this.eventBus_.off(Events.TX_TRANSMIT_CHANGED, this.boundTxTransmitHandler_);
    this.eventBus_.off(Events.RX_CONFIG_CHANGED, this.boundRxConfigHandler_);
    this.eventBus_.off(Events.RX_ACTIVE_MODEM_CHANGED, this.boundRxModemHandler_);
    this.eventBus_.off(Events.RF_FE_POWER_CHANGED, this.boundRfPowerHandler_);
    this.eventBus_.off(Events.RF_FE_BUC_CHANGED, this.boundBucHandler_);
    this.eventBus_.off(Events.RF_FE_HPA_CHANGED, this.boundHpaHandler_);
    this.eventBus_.off(Events.RF_FE_AGC_CHANGED, this.boundAgcHandler_);
    this.eventBus_.off(Events.RF_FE_LNB_CHANGED, this.boundLnbHandler_);
    this.eventBus_.off(Events.RF_FE_OMT_CHANGED, this.boundOmtHandler_);
    this.eventBus_.off(Events.RF_FE_COUPLER_CHANGED, this.boundCouplerHandler_);
    this.eventBus_.off(Events.RF_FE_FILTER_CHANGED, this.boundFilterHandler_);
    this.eventBus_.off(Events.RF_FE_NOTCH_FILTER_CHANGED, this.boundNotchFilterHandler_);
    this.eventBus_.off(Events.RF_FE_GPSDO_CHANGED, this.boundGpsdoHandler_);

    this.isEnabled_ = false;
    this.lastLogTime_.clear();
    this.lastLoggedMessage_.clear();
  }

  /**
   * Destroy the singleton instance
   */
  static destroy(): void {
    if (EventAutoLogger.instance_) {
      EventAutoLogger.instance_.dispose();
      EventAutoLogger.instance_ = null;
    }
  }
}
