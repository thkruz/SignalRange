import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { qs } from "@app/engine/utils/query-selector";
import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { AlarmStatus } from "@app/equipment/base-equipment";

/**
 * Payload state interface for future dynamic updates
 */
export interface PayloadState {
  dataRate: string;
  payloadType: 'Command' | 'Telemetry' | 'Bulk Data';
  channel: 'Primary' | 'Backup';
  crc: string;
  frameSyncLocked: boolean;
  bitErrors: number;
  framesPerSec: number;
  efficiency: number;
  errors: number;
}

/**
 * PayloadAdapter - Bridges payload data state to DOM display
 *
 * Displays data channel, integrity, and throughput information
 * for SATCOM operator training. Currently uses static state but structured
 * for future dynamic updates.
 */
export class PayloadAdapter {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly containerEl_: HTMLElement;
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;

  // Static state - can be updated dynamically in future
  private state_: PayloadState = {
    dataRate: '2.048 Mbps',
    payloadType: 'Command',
    channel: 'Primary',
    crc: 'CRC-32',
    frameSyncLocked: true,
    bitErrors: 0,
    framesPerSec: 1024,
    efficiency: 94.2,
    errors: 0,
  };

  constructor(containerEl: HTMLElement) {
    this.containerEl_ = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('payload-alarm-badge-led');
    const badgeContainer = qs('#payload-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Bind update handler for periodic sync
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);

    this.initialize_();
  }

  private initialize_(): void {
    this.setupDomCache_();
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
    this.syncDomWithState_();
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < PayloadAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  private setupDomCache_(): void {
    // Data Channel
    this.domCache_.set('dataRate', qs('#payload-data-rate', this.containerEl_));
    this.domCache_.set('payloadType', qs('#payload-type', this.containerEl_));
    this.domCache_.set('channel', qs('#payload-channel', this.containerEl_));

    // Data Integrity
    this.domCache_.set('crc', qs('#payload-crc', this.containerEl_));
    this.domCache_.set('frameSync', qs('#payload-frame-sync', this.containerEl_));
    this.domCache_.set('bitErrors', qs('#payload-bit-errors', this.containerEl_));

    // Throughput
    this.domCache_.set('framesPerSec', qs('#payload-frames-sec', this.containerEl_));
    this.domCache_.set('efficiency', qs('#payload-efficiency', this.containerEl_));
    this.domCache_.set('errors', qs('#payload-errors', this.containerEl_));
  }

  private syncDomWithState_(): void {
    const state = this.state_;

    // Data Channel
    const dataRateEl = this.domCache_.get('dataRate');
    if (dataRateEl) {
      dataRateEl.textContent = state.dataRate;
    }

    const payloadTypeEl = this.domCache_.get('payloadType');
    if (payloadTypeEl) {
      payloadTypeEl.textContent = state.payloadType;
    }

    const channelEl = this.domCache_.get('channel');
    if (channelEl) {
      channelEl.textContent = state.channel;
    }

    // Data Integrity
    const crcEl = this.domCache_.get('crc');
    if (crcEl) {
      crcEl.textContent = state.crc;
    }

    const frameSyncEl = this.domCache_.get('frameSync');
    if (frameSyncEl) {
      frameSyncEl.textContent = state.frameSyncLocked ? 'Locked' : 'Unlocked';
      frameSyncEl.className = state.frameSyncLocked
        ? 'status-badge status-badge-green'
        : 'status-badge status-badge-red';
    }

    const bitErrorsEl = this.domCache_.get('bitErrors');
    if (bitErrorsEl) {
      bitErrorsEl.textContent = state.bitErrors.toLocaleString();
    }

    // Throughput
    const framesPerSecEl = this.domCache_.get('framesPerSec');
    if (framesPerSecEl) {
      framesPerSecEl.textContent = state.framesPerSec.toLocaleString();
    }

    const efficiencyEl = this.domCache_.get('efficiency');
    if (efficiencyEl) {
      efficiencyEl.textContent = `${state.efficiency.toFixed(1)}%`;
    }

    const errorsEl = this.domCache_.get('errors');
    if (errorsEl) {
      errorsEl.textContent = state.errors.toLocaleString();
    }

    // Update alarm badge
    const alarms = this.getAlarms_();
    this.alarmBadge_.update(alarms);
  }

  private getAlarms_(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];
    const state = this.state_;

    if (!state.frameSyncLocked) {
      alarms.push({ severity: 'error', message: 'Frame sync lost' });
    }

    if (state.bitErrors > 0) {
      alarms.push({
        severity: state.bitErrors > 100 ? 'error' : 'warning',
        message: `${state.bitErrors} bit errors detected`
      });
    }

    if (state.errors > 0) {
      alarms.push({
        severity: state.errors > 10 ? 'error' : 'warning',
        message: `${state.errors} transmission errors`
      });
    }

    if (state.efficiency < 80) {
      alarms.push({ severity: 'warning', message: `Low efficiency: ${state.efficiency.toFixed(1)}%` });
    }

    if (state.channel === 'Backup') {
      alarms.push({ severity: 'info', message: 'Operating on backup channel' });
    }

    return alarms;
  }

  /**
   * Update payload state (for future dynamic updates)
   */
  public updateState(newState: Partial<PayloadState>): void {
    this.state_ = { ...this.state_, ...newState };
    this.syncDomWithState_();
  }

  /**
   * Get current state (for testing/debugging)
   */
  public get state(): PayloadState {
    return { ...this.state_ };
  }

  public dispose(): void {
    this.alarmBadge_.dispose();
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.domCache_.clear();
  }
}
