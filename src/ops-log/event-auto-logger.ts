import { SimClock } from '@app/simulation/sim-clock';
/**
 * @file EventAutoLogger - Auto-logs equipment events to OpsLogManager
 * @description Singleton service that subscribes to equipment events and creates
 * human-readable log entries. Active at every difficulty: the log is the
 * station record the scenario dialog says the supervisor reads (nats-r5-s16-F2).
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
  AggregatedAlarm,
  AlarmStateChangedData,
  AntennaSlewCompleteData,
  EquipmentActionData,
  Events,
  RxConfigChangedData,
  TxConfigChangedData,
  TxTransmitChangedData,
} from '@app/events/events';
import type { AlarmStateChangedWithClears } from '@app/services/alarm-service';
import {
  formatAgcEvent,
  formatAntennaArrival,
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
  formatRxConfigEvent,
  formatTxConfigEvent,
  formatTxTransmitEvent,
} from './event-formatters';
import { OpsLogManager } from './ops-log-manager';
import type { OpsLogEntry } from './ops-log-types';
import { scenarioGroundStations, stationSource, stationTagForAntennaState, stationTagForModemUuid, stationTagForRfModule, stationTagForRfState } from './station-tag';

/** The beacon-frequency tail of an antenna line ("..., Beacon freq: 4175.50 MHz") */
const BEACON_SUFFIX_RE = /, Beacon freq: [\d.]+ MHz$/u;

/** An antenna mode/state line, as formatAntennaEvent writes it */
const ANTENNA_STATE_LINE_PREFIX = 'Tracking mode:';

/** The lock word of an antenna line (", Antenna LOCKED"); UNKNOWN (an ACU fault) is kept */
const LOCK_WORD_RE = /, Antenna (?:LOCKED|UNLOCKED)(?=,|$)/u;

/**
 * Split an antenna line into its identity (the text without the beacon tail
 * and without the lock word) and the beacon tail. A lock flip alone is not a
 * new line: weather ticks and syncs re-emit the state as the lock settles
 * (nats-r6-s03-F1, r6-s11-F1)
 */
function splitBeaconSuffix_(message: string): { base: string; beacon: string | null } {
  const match = BEACON_SUFFIX_RE.exec(message);
  const base = match ? message.slice(0, match.index) : message;
  return { base: base.replace(LOCK_WORD_RE, ''), beacon: match ? match[0] : null };
}

/** Severity rank: info alarms write nothing, warning and error write the raise */
const SEVERITY_RANK: Readonly<Record<string, number>> = { info: 0, warning: 1, error: 2 };
const WARNING_RANK = 1;
const ERROR_RANK = 2;

/**
 * A detail that is one number with an optional word before it and one unit
 * token after ("4.52 A", "fade 1.2 dB", "92°C", "IM3 -43.1 dBc"). The word may
 * carry digits after its first letter, as AlarmService's VALUE_IN_PARENS_
 * allows (Phase 33 D6, nats-r7-s12-F2)
 */
const NUMERIC_DETAIL_RE = /^(?:[A-Za-z][A-Za-z0-9/]*\s+)?(-?\d+(?:\.\d+)?)(\s*[^\s\d:,;()]+)?$/u;

/** The highest value an alarm's detail read while it was up */
interface AlarmPeak {
  value: number;
  /** The number and unit as the detail wrote it ("16.0 dB") */
  text: string;
}

/** The value of a single-number detail, or null for text and multi-value details ("Modem 1: Es/N0 ...") */
function numericDetail_(detail: string | undefined): AlarmPeak | null {
  if (!detail) return null;
  const match = NUMERIC_DETAIL_RE.exec(detail);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? { value, text: `${match[1]}${match[2] ?? ''}` } : null;
}

/** Station-clock hh:mm:ss, as the log stamps its lines */
function clockText_(ms: number): string {
  const date = new Date(ms);
  return [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map((n) => n.toString().padStart(2, '0')).join(':');
}

/** An alarm as the log writes it: "<label> (<detail>)", or the label alone */
function alarmText_(label: string, detail: string | undefined): string {
  return `${label}${detail ? ` (${detail})` : ''}`;
}

/** The live value AlarmService splits out of an alarm's label, if any */
function alarmDetail_(alarm: AggregatedAlarm): string | undefined {
  const detail = (alarm as AggregatedAlarm & { detail?: unknown }).detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : undefined;
}

/** One alarm as the logger last saw it */
interface SeenAlarm {
  label: string;
  source: string;
  severity: number;
  detail: string | undefined;
  /** Highest single-number detail seen while it has been up, if its detail is a number */
  peak: AlarmPeak | null;
}

/**
 * Auto-logs equipment events to the operations log, at every difficulty.
 */
export class EventAutoLogger {
  private static instance_: EventAutoLogger | null = null;

  private readonly eventBus_: EventBus;
  private isEnabled_: boolean = false;

  // Throttling and deduplication
  private static readonly THROTTLE_MS = 500;
  /** Keyed by event and station, so two stations' identical lines both log */
  private readonly lastLogTime_: Map<string, number> = new Map();
  private readonly lastLoggedMessage_: Map<string, string> = new Map();
  /** Last antenna mode/staging seen per station, to spot a mode command */
  private readonly lastAntennaModeKey_: Map<string, string> = new Map();
  /** Nesting depth of runWithoutLogging(): above 0 nothing is logged */
  private suppressDepth_ = 0;

  /**
   * Per-warning quiet time after a raise is logged, so a flapping warning logs
   * once. Error alarms are exempt: every Carrier lock lost dropout is the
   * record (Phase 32 D4, nats-r7-s08-F1)
   */
  private static readonly ALARM_RELOG_MS = 30_000;
  /** Alarms whose raise is in the log and whose clear is not yet, by alarmKey_: the severity last written */
  private readonly loggedAlarms_: Map<string, number> = new Map();
  /**
   * Warnings re-raised inside the relog window, by alarmKey_: the station-clock
   * time they came up. Written when the window closes if still up, as "up since"
   */
  private readonly pendingRaises_: Map<string, number> = new Map();
  /** The antenna state per source before its first line is written: the start-up baseline */
  private readonly antennaBaseline_: Map<string, string> = new Map();
  /** Antenna state objects already taken as a baseline */
  private seededAntennaStates_: WeakSet<object> = new WeakSet();
  /** Every active alarm (info included) as last seen, by alarmKey_: severity and live detail */
  private readonly seenAlarms_: Map<string, SeenAlarm> = new Map();
  /** Run time each alarm's raise was last logged, by alarmKey_ */
  private readonly alarmRaiseLoggedMs_: Map<string, number> = new Map();

  // Bound handlers for cleanup
  private readonly boundAntennaHandler_: (data: Partial<AntennaState>) => void;
  private readonly boundSlewCompleteHandler_: (data: AntennaSlewCompleteData) => void;
  private readonly boundTxConfigHandler_: (data: TxConfigChangedData) => void;
  private readonly boundTxTransmitHandler_: (data: TxTransmitChangedData) => void;
  private readonly boundRxConfigHandler_: (data: RxConfigChangedData) => void;
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
  private readonly boundEquipmentActionHandler_: (data: EquipmentActionData) => void;
  private readonly boundAlarmStateHandler_: (data: AlarmStateChangedData) => void;
  private readonly boundUpdateHandler_: () => void;

  private constructor() {
    this.eventBus_ = EventBus.getInstance();

    // Bind all handlers
    this.boundAntennaHandler_ = this.handleAntennaEvent_.bind(this);
    this.boundSlewCompleteHandler_ = this.handleSlewComplete_.bind(this);
    this.boundTxConfigHandler_ = this.handleTxConfigEvent_.bind(this);
    this.boundTxTransmitHandler_ = this.handleTxTransmitEvent_.bind(this);
    this.boundRxConfigHandler_ = this.handleRxConfigEvent_.bind(this);
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
    this.boundEquipmentActionHandler_ = this.handleEquipmentAction_.bind(this);
    this.boundAlarmStateHandler_ = this.handleAlarmState_.bind(this);
    this.boundUpdateHandler_ = this.onUpdate_.bind(this);
  }

  static getInstance(): EventAutoLogger {
    EventAutoLogger.instance_ ??= new EventAutoLogger();
    return EventAutoLogger.instance_;
  }

  /**
   * Initialize the auto-logger and subscribe to equipment events. Every
   * difficulty logs: an advanced scenario used to get an empty log although
   * its dialog says the supervisor reads it (nats-r5-s16-F2).
   * Call this after OpsLogManager.initialize() in base-page.ts.
   */
  initialize(): void {
    // A second initialize without dispose would subscribe every handler twice
    if (this.isEnabled_) return;
    this.isEnabled_ = true;
    this.subscribeToEvents_();
  }

  /**
   * Run `action` with logging off: what it emits is not an operator action.
   * Opening the ACU tab re-applies the configured target to the antenna, which
   * re-emits its state; a tab open never logs (nats-r5-s07-F2).
   * @param action the code whose events are not logged
   */
  runWithoutLogging(action: () => void): void {
    this.suppressDepth_++;
    try {
      action();
    } finally {
      this.suppressDepth_--;
    }
  }

  private subscribeToEvents_(): void {
    this.eventBus_.on(Events.ANTENNA_STATE_CHANGED, this.boundAntennaHandler_);
    this.eventBus_.on(Events.ANTENNA_SLEW_COMPLETE, this.boundSlewCompleteHandler_);
    this.eventBus_.on(Events.TX_CONFIG_CHANGED, this.boundTxConfigHandler_);
    this.eventBus_.on(Events.TX_TRANSMIT_CHANGED, this.boundTxTransmitHandler_);
    this.eventBus_.on(Events.RX_CONFIG_CHANGED, this.boundRxConfigHandler_);
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
    this.eventBus_.on(Events.EQUIPMENT_ACTION, this.boundEquipmentActionHandler_);
    this.eventBus_.on(Events.ALARM_STATE_CHANGED, this.boundAlarmStateHandler_);
    this.eventBus_.on(Events.UPDATE, this.boundUpdateHandler_);
  }

  /**
   * Check if this message should be skipped due to throttling or being a duplicate.
   * Returns true if the message should NOT be logged.
   */
  private shouldSkip_(event: Events, message: string | null, skipThrottle: boolean = false, station: string = ''): boolean {
    const key = `${event}|${station}`;

    // No message to log
    if (!message) return true;

    // Skip if same message as last logged for this event type
    if (this.lastLoggedMessage_.get(key) === message) {
      return true;
    }

    // Check time-based throttling
    if (!skipThrottle) {
      const now = SimClock.runMs();
      const lastTime = this.lastLogTime_.get(key) ?? -Infinity;
      if (now >= lastTime && now - lastTime < EventAutoLogger.THROTTLE_MS) {
        return true;
      }
      this.lastLogTime_.set(key, now);
    }

    // Record this message as the last logged
    this.lastLoggedMessage_.set(key, message);
    return false;
  }

  /**
   * Log a message to OpsLogManager if enabled and initialized
   */
  private log_(message: string, source?: string, category: OpsLogEntry['category'] = 'action'): void {
    if (!this.isEnabled_ || this.suppressDepth_ > 0 || !OpsLogManager.isInitialized()) return;
    OpsLogManager.getInstance().log(message, category, source);
  }

  /**
   * Log an equipment action that no EventBus event reports: a panel toggle
   * (HPA enable, BUC mute) or an automatic action (handover safing). Logged
   * like the event-driven lines: station-tagged source.
   * @param message the log line
   * @param system the equipment tag, e.g. "RF FE", "TX", "HANDOVER"
   * @param stationId the station's id in a multi-station scenario, else undefined
   */
  logAction(message: string, system: string, stationId?: string): void {
    this.log_(message, stationSource(system, stationId));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Event Handlers
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Mode, staging, step-track and target of an antenna state: a change in it
   * is an operator command (a Move to Target included)
   */
  private static antennaModeKey_(data: Partial<AntennaState>): string {
    const isStaged = data.hasStagedChanges === true && data.stagedTargetElevation != null;
    return `${data.trackingMode}|${isStaged}|${data.isStepTrackEnabled === true}|${data.targetSatelliteId ?? ''}`;
  }

  /**
   * Take each scenario antenna's state as its start-up baseline (Phase 32 D2)
   * the first time the logger sees that antenna and before it has a line, so
   * the operator's first command (a power toggle, a mode pick) compares
   * against where the dish started rather than being the baseline itself
   */
  private seedAntennaBaselines_(): void {
    for (const gs of scenarioGroundStations()) {
      for (const antenna of gs.antennas ?? []) {
        const state = antenna?.state;
        if (!state || this.seededAntennaStates_.has(state)) continue;
        this.seededAntennaStates_.add(state);
        const message = formatAntennaEvent(state);
        const station = gs.state?.id;
        const source = stationSource('ANT', station);
        if (!message || this.lastAntennaLine_(source)) continue;
        this.antennaBaseline_.set(source, message);
        this.lastAntennaModeKey_.set(station ?? '', EventAutoLogger.antennaModeKey_(state));
      }
    }
  }

  private handleAntennaEvent_(data: Partial<AntennaState>): void {
    const message = formatAntennaEvent(data);
    if (!message) return;
    const station = stationTagForAntennaState(data);
    const source = stationSource('ANT', station);
    // A mode command (staged or applied) is an operator action: never throttle
    // it away, so an APPLY right after MAINT still logs (nats-r3-s11-F2), nor
    // the step-track switch (nats-r4-s10-F1)
    const isStaged = data.hasStagedChanges === true && data.stagedTargetElevation != null;
    const modeKey = EventAutoLogger.antennaModeKey_(data);
    const previousModeKey = this.lastAntennaModeKey_.get(station ?? '');
    const modeChanged = previousModeKey !== modeKey;
    this.lastAntennaModeKey_.set(station ?? '', modeKey);
    // A state emitted with logging off (a tab open) is seen, not logged: it
    // still sets the baseline and the mode a later command compares against
    if (this.suppressDepth_ > 0) {
      if (!this.lastAntennaLine_(source)) this.antennaBaseline_.set(source, message);
      return;
    }
    // A command: a staged park, or a mode or target change against a state already seen
    const isCommand = isStaged || (previousModeKey !== undefined && modeChanged);

    // Compare against the station's last antenna line in the log itself, not
    // only this logger's memory, so a rebuilt logger does not write the
    // start-of-shift state again (nats-r5-s10-F1). Only mode, power and beacon
    // make the identity: a lock flip writes nothing (nats-r6-s03-F1, s11-F1),
    // and a mode command emits once without the beacon tail and once with the
    // target's, and the second completes the first line (nats-r5-s02-F1)
    const previous = this.lastAntennaLine_(source);
    if (!previous && !isCommand) {
      // No line for this antenna yet: the first state is the start-up
      // baseline and writes nothing, and a later state that differs from it
      // only by the lock word or the beacon tail is the start-up state
      // settling, not an operator action (Phase 32 D2, nats-r7-s04-F1). A
      // power change or a mode command still writes.
      const baseline = this.antennaBaseline_.get(source);
      this.antennaBaseline_.set(source, message);
      if (baseline === undefined || splitBeaconSuffix_(baseline).base === splitBeaconSuffix_(message).base) return;
    }
    if (previous) {
      const prev = splitBeaconSuffix_(previous.message);
      const next = splitBeaconSuffix_(message);
      if (prev.base === next.base) {
        if (next.beacon === null || next.beacon === prev.beacon) return;
        if (prev.beacon === null) {
          // Keep the line's lock word as written; add only the beacon
          const amended = `${previous.message}${next.beacon}`;
          if (this.isEnabled_) OpsLogManager.getInstance().amend(previous, amended);
          this.lastLoggedMessage_.set(`${Events.ANTENNA_STATE_CHANGED}|${station}`, amended);
          return;
        }
        // A new beacon frequency on the same mode (MANUAL entry, new target) is a change: log it
      }
    }

    if (this.shouldSkip_(Events.ANTENNA_STATE_CHANGED, message, modeChanged, station)) return;
    this.log_(message, source);
  }

  /**
   * One arrival line per commanded move, e.g. "STOW: parked (El 90.0)"
   * (nats-r6-s11-F1): the command-time line says where the dish is going,
   * this one that it got there
   */
  private handleSlewComplete_(data: AntennaSlewCompleteData): void {
    if (this.suppressDepth_ > 0) return;
    const station = stationTagForAntennaState(data.state);
    this.log_(formatAntennaArrival(data), stationSource('ANT', station));
  }

  /** The newest antenna state line of this source in the log (not the previous shift's) */
  private lastAntennaLine_(source: string): OpsLogEntry | null {
    if (!OpsLogManager.isInitialized()) return null;
    const entries = OpsLogManager.getInstance().getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.category === 'previous-shift' || entry.source !== source) continue;
      if (entry.message.startsWith(ANTENNA_STATE_LINE_PREFIX)) return entry;
    }
    return null;
  }

  private handleTxConfigEvent_(data: TxConfigChangedData): void {
    const message = formatTxConfigEvent(data);
    const station = stationTagForModemUuid(data.uuid, data.config);
    // Every logged TX line is a discrete action (config, transmit, power):
    // skip the throttle so two modems stopped in one tick both log; still dedupe
    if (this.shouldSkip_(Events.TX_CONFIG_CHANGED, message, true, station)) return;
    this.log_(message, stationSource('TX', station));
  }

  private handleTxTransmitEvent_(data: TxTransmitChangedData): void {
    const message = formatTxTransmitEvent(data);
    const station = stationTagForModemUuid(data.uuid);
    // Skip throttle for critical state change, but still dedupe
    if (this.shouldSkip_(Events.TX_TRANSMIT_CHANGED, message, true, station)) return;
    this.log_(message, stationSource('TX', station));
  }

  private handleRxConfigEvent_(data: RxConfigChangedData): void {
    const message = formatRxConfigEvent(data);
    const station = stationTagForModemUuid(data.uuid);
    if (this.shouldSkip_(Events.RX_CONFIG_CHANGED, message, false, station)) return;
    this.log_(message, stationSource('RX', station));
  }

  private handleRfPowerEvent_(data: Partial<RFFrontEndState>): void {
    const message = formatRfFePowerEvent(data);
    // The whole front-end state carries its uuid; the LNB state is the older match
    const station = stationTagForRfState(data.uuid ? data : data.lnb);
    // Skip throttle for important state change, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_POWER_CHANGED, message, true, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleBucEvent_(data: Partial<BUCState>): void {
    const message = formatBucEvent(data);
    const station = stationTagForRfState(data);
    if (this.shouldSkip_(Events.RF_FE_BUC_CHANGED, message, false, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleHpaEvent_(data: Partial<HPAState>): void {
    const message = formatHpaEvent(data);
    const station = stationTagForRfState(data);
    // Skip throttle for HPA enable/disable, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_HPA_CHANGED, message, true, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleAgcEvent_(data: Partial<AGCState>): void {
    const message = formatAgcEvent(data);
    const station = stationTagForRfState(data);
    if (this.shouldSkip_(Events.RF_FE_AGC_CHANGED, message, false, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleLnbEvent_(data: Partial<LNBState>): void {
    const message = formatLnbEvent(data);
    const station = stationTagForRfState(data);
    if (this.shouldSkip_(Events.RF_FE_LNB_CHANGED, message, false, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleOmtEvent_(data: Partial<OMTState>): void {
    const message = formatOmtEvent(data);
    const station = stationTagForRfState(data);
    // Skip throttle for intentional user action, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_OMT_CHANGED, message, true, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleCouplerEvent_(data: Partial<CouplerState>): void {
    const message = formatCouplerEvent(data);
    const station = stationTagForRfState(data);
    // Skip throttle for intentional user action, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_COUPLER_CHANGED, message, true, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleFilterEvent_(data: Partial<IfFilterBankState>): void {
    const message = formatFilterEvent(data);
    const station = stationTagForRfState(data);
    if (this.shouldSkip_(Events.RF_FE_FILTER_CHANGED, message, false, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleNotchFilterEvent_(data: Partial<NotchFilterState>): void {
    const message = formatNotchFilterEvent(data);
    const station = stationTagForRfState(data);
    if (this.shouldSkip_(Events.RF_FE_NOTCH_FILTER_CHANGED, message, false, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  private handleGpsdoEvent_(data: Partial<GPSDOState>): void {
    const message = formatGpsdoEvent(data);
    const station = stationTagForRfState(data);
    // Skip throttle for important state change, but still dedupe
    if (this.shouldSkip_(Events.RF_FE_GPSDO_CHANGED, message, true, station)) return;
    this.log_(message, stationSource('RF FE', station));
  }

  /**
   * An operator action an equipment core reports itself (BUC gain, HPA
   * back-off, LNB / HPA power: nats-r4-s07-F1, s12-F2). Each is a discrete
   * action: never throttled or deduped, so setting the same gain twice logs twice.
   */
  private handleEquipmentAction_(data: EquipmentActionData): void {
    this.log_(data.message, stationSource(data.system, stationTagForRfModule(data.module)));
  }

  /**
   * One SYSTEM line when an alarm is raised and one when it clears, so a
   * transient the operator rode out (S17's sun transit) is in the record
   * (nats-r5-s17-F1). Warnings and errors only: the info "Signal(s) Detected"
   * follows the modem's carrier and would log every lock loss and relock.
   *
   * - Raise: "ALARM raised: <label> (<live detail>)", written when the alarm
   *   first reaches warning or error, so an alarm that starts at info writes
   *   "raised", never "escalated" (Phase 32 D6, nats-r7-s03-F2).
   * - Escalation: "ALARM escalated: ..." only for a logged warning becoming
   *   an error; a fall writes nothing.
   * - Relog window: a warning that clears and comes back within
   *   ALARM_RELOG_MS of its last logged raise is held; if still up when the
   *   window closes it is written as "ALARM raised: <label> (<detail>, up
   *   since hh:mm:ss)", never with a late stamp alone. Errors are exempt:
   *   every dropout writes its pair (Phase 32 D4, nats-r7-s08-F1).
   * - Clear: "ALARM cleared: <label> (<value at the clear>)", the live value
   *   AlarmService re-read when the alarm went (`cleared[].detail`), or no
   *   value when there is none, never the value of the poll before
   *   (Phase 32 D5, nats-r7-s05-F1). A single-number detail adds the peak it
   *   reached while up when that is above the clear value: "(0.5 dB, peak
   *   16.0 dB)" (Phase 32 D9, nats-r7-s17-F1).
   */
  private handleAlarmState_(data: AlarmStateChangedData): void {
    const now = SimClock.runMs();
    const current = new Map<string, SeenAlarm>();
    for (const alarm of data.alarms) {
      const severity = SEVERITY_RANK[alarm.severity];
      if (severity === undefined) continue;
      const key = EventAutoLogger.alarmKey_(alarm);
      const seen = current.get(key);
      // The same alarm twice in one poll: keep the more severe
      if (seen && seen.severity >= severity) continue;
      const detail = alarmDetail_(alarm);
      current.set(key, {
        label: alarm.message,
        source: `${alarm.assetId}(${alarm.equipmentType}${alarm.equipmentIndex + 1})`,
        severity,
        detail,
        peak: numericDetail_(detail),
      });
    }

    if (data.restored) {
      this.seenAlarms_.clear();
      this.loggedAlarms_.clear();
      this.pendingRaises_.clear();
      this.alarmRaiseLoggedMs_.clear();
      for (const [key, alarm] of current) {
        this.seenAlarms_.set(key, alarm);
        if (alarm.severity >= WARNING_RANK) this.loggedAlarms_.set(key, alarm.severity);
      }
      return;
    }

    for (const [key, alarm] of current) {
      const previous = this.seenAlarms_.get(key);
      if (previous?.peak && (!alarm.peak || previous.peak.value > alarm.peak.value)) alarm.peak = previous.peak;
      this.seenAlarms_.set(key, alarm);
      if (alarm.severity < WARNING_RANK) continue;

      const logged = this.loggedAlarms_.get(key);
      if (logged !== undefined) {
        if (logged === WARNING_RANK && alarm.severity === ERROR_RANK) {
          this.loggedAlarms_.set(key, ERROR_RANK);
          this.log_(`ALARM escalated: ${alarmText_(alarm.label, alarm.detail)}`, alarm.source, 'system');
        }
        continue;
      }

      const upSinceMs = this.pendingRaises_.get(key);
      if (upSinceMs !== undefined) {
        // Held in the window: an error is news at once
        if (alarm.severity === ERROR_RANK) this.writeRaise_(key, alarm, now, upSinceMs);
        continue;
      }
      const lastRaise = this.alarmRaiseLoggedMs_.get(key);
      // Run time restarts each scenario, so a later stamp is from an earlier run
      const inWindow = lastRaise !== undefined && now >= lastRaise && now - lastRaise < EventAutoLogger.ALARM_RELOG_MS;
      if (inWindow && alarm.severity < ERROR_RANK) {
        this.pendingRaises_.set(key, SimClock.nowMs());
        continue;
      }
      this.writeRaise_(key, alarm, now);
    }

    const clearedDetail = new Map<string, string | undefined>();
    for (const alarm of (data as AlarmStateChangedWithClears).cleared ?? []) {
      clearedDetail.set(EventAutoLogger.alarmKey_(alarm), alarmDetail_(alarm));
    }
    for (const [key, last] of [...this.seenAlarms_]) {
      if (current.has(key)) continue;
      this.seenAlarms_.delete(key);
      this.pendingRaises_.delete(key);
      if (!this.loggedAlarms_.delete(key)) continue;
      this.log_(`ALARM cleared: ${alarmText_(last.label, EventAutoLogger.clearDetail_(clearedDetail.get(key), last.peak))}`, last.source, 'system');
    }

    this.flushPendingRaises_();
  }

  /** The clear line's value: the live value at the clear, plus the peak while up when it was higher */
  private static clearDetail_(detail: string | undefined, peak: AlarmPeak | null): string | undefined {
    if (!peak) return detail;
    const atClear = numericDetail_(detail);
    if (detail && (!atClear || peak.value <= atClear.value)) return detail;
    return detail ? `${detail}, peak ${peak.text}` : `peak ${peak.text}`;
  }

  /** Write an alarm's raise line and start its relog window */
  private writeRaise_(key: string, alarm: SeenAlarm, nowRunMs: number, upSinceMs?: number): void {
    this.pendingRaises_.delete(key);
    this.alarmRaiseLoggedMs_.set(key, nowRunMs);
    this.loggedAlarms_.set(key, alarm.severity);
    const upSince = upSinceMs === undefined ? undefined : `up since ${clockText_(upSinceMs)}`;
    const detail = upSince ? [alarm.detail, upSince].filter(Boolean).join(', ') : alarm.detail;
    this.log_(`ALARM raised: ${alarmText_(alarm.label, detail)}`, alarm.source, 'system');
  }

  /** Per step: take new antennas' baselines, write held warnings whose window closed */
  private onUpdate_(): void {
    if (this.suppressDepth_ === 0) this.seedAntennaBaselines_();
    this.flushPendingRaises_();
  }

  /** Write each held warning whose relog window has closed and that is still up */
  private flushPendingRaises_(): void {
    if (this.pendingRaises_.size === 0) return;
    const now = SimClock.runMs();
    for (const [key, upSinceMs] of [...this.pendingRaises_]) {
      const lastRaise = this.alarmRaiseLoggedMs_.get(key);
      if (lastRaise !== undefined && now >= lastRaise && now - lastRaise < EventAutoLogger.ALARM_RELOG_MS) continue;
      const alarm = this.seenAlarms_.get(key);
      if (!alarm || alarm.severity < WARNING_RANK) {
        this.pendingRaises_.delete(key);
        continue;
      }
      this.writeRaise_(key, alarm, now, upSinceMs);
    }
  }

  /** One alarm across polls: station, equipment and its text with live numbers masked */
  private static alarmKey_(alarm: AggregatedAlarm): string {
    return `${alarm.assetId}|${alarm.equipmentType}|${alarm.equipmentIndex}|${alarm.message.replace(/-?\d+(?:\.\d+)?/gu, '#')}`;
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
    this.eventBus_.off(Events.ANTENNA_SLEW_COMPLETE, this.boundSlewCompleteHandler_);
    this.eventBus_.off(Events.TX_CONFIG_CHANGED, this.boundTxConfigHandler_);
    this.eventBus_.off(Events.TX_TRANSMIT_CHANGED, this.boundTxTransmitHandler_);
    this.eventBus_.off(Events.RX_CONFIG_CHANGED, this.boundRxConfigHandler_);
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
    this.eventBus_.off(Events.EQUIPMENT_ACTION, this.boundEquipmentActionHandler_);
    this.eventBus_.off(Events.ALARM_STATE_CHANGED, this.boundAlarmStateHandler_);
    this.eventBus_.off(Events.UPDATE, this.boundUpdateHandler_);

    this.isEnabled_ = false;
    this.lastLogTime_.clear();
    this.lastLoggedMessage_.clear();
    this.lastAntennaModeKey_.clear();
    this.loggedAlarms_.clear();
    this.seenAlarms_.clear();
    this.alarmRaiseLoggedMs_.clear();
    this.pendingRaises_.clear();
    this.antennaBaseline_.clear();
    this.seededAntennaStates_ = new WeakSet();
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
