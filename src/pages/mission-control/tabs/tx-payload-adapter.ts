import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { qs } from "@app/engine/utils/query-selector";
import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { AlarmStatus } from "@app/equipment/base-equipment";
import { CryptoModule } from "@app/equipment/crypto";
import { FaultInjector } from "@app/faults";

/**
 * TX Payload state interface
 */
export interface TxPayloadState {
  // Source Status
  dataRate: string;
  payloadType: 'Command' | 'Telemetry' | 'Bulk Data';
  channel: 'Primary' | 'Backup';
  sourceFeedStatus: 'Active' | 'Idle' | 'Error' | 'No Signal';

  // Throughput
  framesPerSec: number;
  efficiency: number;
  bufferUtilization: number;
  bufferOverflows: number;
  bufferUnderruns: number;

  // TX Encryption
  encryptionMode: 'ACTIVE' | 'DISABLED' | 'BYPASSED';
  encryptionAlgorithm: string;
  encryptionKeyId: string;
  encryptionKeyStatus: 'Valid' | 'Expired' | 'Pending Rotation' | 'Mismatch' | 'Zeroized';
  encryptionExpiresInDays: number;
  encryptionAuthTagVerified: boolean;
}

/**
 * TxPayloadAdapter - Bridges TX payload data state to DOM display
 *
 * Displays source status, encoding configuration, throughput metrics,
 * and buffer status for SATCOM operator training.
 *
 * Integrates with:
 * - CryptoModule: Provides TX encryption state
 * - FaultInjector: Applies scenario fault overrides
 */
export class TxPayloadAdapter {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly containerEl_: HTMLElement;
  private readonly groundStationId_: string;
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;

  private state_: TxPayloadState = {
    // Source Status
    dataRate: '2.048 Mbps',
    payloadType: 'Command',
    channel: 'Primary',
    sourceFeedStatus: 'Active',

    // Throughput
    framesPerSec: 1024,
    efficiency: 94.2,
    bufferUtilization: 45,
    bufferOverflows: 0,
    bufferUnderruns: 0,

    // TX Encryption
    encryptionMode: 'ACTIVE',
    encryptionAlgorithm: 'AES-256-GCM',
    encryptionKeyId: 'TANGO-2024-0847',
    encryptionKeyStatus: 'Valid',
    encryptionExpiresInDays: 47,
    encryptionAuthTagVerified: true,
  };

  /**
   * @param containerEl DOM container element
   * @param groundStationId Ground station ID for fault injection scoping
   */
  constructor(containerEl: HTMLElement, groundStationId: string = 'default') {
    this.containerEl_ = containerEl;
    this.groundStationId_ = groundStationId;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('tx-payload-alarm-badge-led');
    const badgeContainer = qs('#tx-payload-alarm-badge', containerEl);
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
    if (now - this.lastSyncTime_ < TxPayloadAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;

    // Update crypto state from CryptoModule
    this.updateCryptoState_();

    // Apply fault injection overrides
    this.applyFaultOverrides_();

    this.syncDomWithState_();
  }

  /**
   * Update crypto state from CryptoModule singleton
   */
  private updateCryptoState_(): void {
    const cryptoState = CryptoModule.getInstance().getTxState();
    this.state_.encryptionMode = cryptoState.encryptionMode;
    this.state_.encryptionAlgorithm = cryptoState.encryptionAlgorithm;
    this.state_.encryptionKeyId = cryptoState.encryptionKeyId;
    this.state_.encryptionKeyStatus = cryptoState.encryptionKeyStatus;
    this.state_.encryptionExpiresInDays = cryptoState.encryptionExpiresInDays;
    this.state_.encryptionAuthTagVerified = cryptoState.encryptionAuthTagVerified;
  }

  /**
   * Apply fault injection overrides from FaultInjector
   */
  private applyFaultOverrides_(): void {
    const overrides = FaultInjector.getInstance().getTxPayloadOverrides(this.groundStationId_);
    if (Object.keys(overrides).length > 0) {
      this.state_ = { ...this.state_, ...overrides };
    }
  }

  private setupDomCache_(): void {
    // Source Status
    this.cacheElement_('tx-payload-data-rate', 'dataRate');
    this.cacheElement_('tx-payload-type', 'payloadType');
    this.cacheElement_('tx-payload-channel', 'channel');
    this.cacheElement_('tx-payload-source-feed', 'sourceFeed');

    // TX Encryption
    this.cacheElement_('tx-payload-enc-mode', 'encMode');
    this.cacheElement_('tx-payload-enc-algorithm', 'encAlgorithm');
    this.cacheElement_('tx-payload-enc-key-id', 'encKeyId');
    this.cacheElement_('tx-payload-enc-key-status', 'encKeyStatus');
    this.cacheElement_('tx-payload-enc-expires', 'encExpires');
    this.cacheElement_('tx-payload-enc-auth-tag', 'encAuthTag');

    // Throughput
    this.cacheElement_('tx-payload-frames-sec', 'framesPerSec');
    this.cacheElement_('tx-payload-efficiency', 'efficiency');
    this.cacheElement_('tx-payload-errors', 'errors');

    // Buffer Status
    this.cacheElement_('tx-payload-buffer-bar', 'bufferBar');
    this.cacheElement_('tx-payload-buffer-pct', 'bufferPct');
    this.cacheElement_('tx-payload-overflows', 'overflows');
    this.cacheElement_('tx-payload-underruns', 'underruns');
  }

  private cacheElement_(htmlId: string, cacheKey: string): void {
    try {
      this.domCache_.set(cacheKey, qs(`#${htmlId}`, this.containerEl_));
    } catch {
      // Element may not exist, which is fine
    }
  }

  private syncDomWithState_(): void {
    const state = this.state_;

    // Source Status
    this.updateTextContent_('dataRate', state.dataRate);
    this.updateTextContent_('payloadType', state.payloadType);
    this.updateTextContent_('channel', state.channel);

    const sourceFeedEl = this.domCache_.get('sourceFeed');
    if (sourceFeedEl) {
      sourceFeedEl.textContent = state.sourceFeedStatus;
      sourceFeedEl.className = this.getSourceFeedBadgeClass_(state.sourceFeedStatus);
    }

    // TX Encryption
    const encModeEl = this.domCache_.get('encMode');
    if (encModeEl) {
      encModeEl.textContent = state.encryptionMode;
      encModeEl.className = this.getEncryptionModeClass_(state.encryptionMode);
    }

    this.updateTextContent_('encAlgorithm', state.encryptionAlgorithm);
    this.updateTextContent_('encKeyId', state.encryptionKeyId);

    const encKeyStatusEl = this.domCache_.get('encKeyStatus');
    if (encKeyStatusEl) {
      encKeyStatusEl.textContent = state.encryptionKeyStatus;
      encKeyStatusEl.className = this.getKeyStatusClass_(state.encryptionKeyStatus);
    }

    this.updateTextContent_('encExpires', `${state.encryptionExpiresInDays} days`);

    const encAuthTagEl = this.domCache_.get('encAuthTag');
    if (encAuthTagEl) {
      encAuthTagEl.textContent = state.encryptionAuthTagVerified ? 'Verified' : 'Failed';
      encAuthTagEl.className = state.encryptionAuthTagVerified
        ? 'status-badge status-badge-green'
        : 'status-badge status-badge-red';
    }

    // Throughput
    this.updateTextContent_('framesPerSec', state.framesPerSec.toLocaleString());
    this.updateTextContent_('efficiency', `${state.efficiency.toFixed(1)}%`);

    // Calculate total errors (overflows + underruns for display)
    const totalErrors = state.bufferOverflows + state.bufferUnderruns;
    this.updateTextContent_('errors', totalErrors.toLocaleString());

    // Buffer Status
    const bufferBarEl = this.domCache_.get('bufferBar') as HTMLElement;
    if (bufferBarEl) {
      bufferBarEl.style.width = `${state.bufferUtilization}%`;
      bufferBarEl.className = this.getBufferBarClass_(state.bufferUtilization);
    }

    this.updateTextContent_('bufferPct', `${state.bufferUtilization}%`);
    this.updateTextContent_('overflows', state.bufferOverflows.toLocaleString());
    this.updateTextContent_('underruns', state.bufferUnderruns.toLocaleString());

    // Update alarm badge
    const alarms = this.getAlarms_();
    this.alarmBadge_.update(alarms);
  }

  private updateTextContent_(key: string, value: string): void {
    const el = this.domCache_.get(key);
    if (el) {
      el.textContent = value;
    }
  }

  private getSourceFeedBadgeClass_(status: TxPayloadState['sourceFeedStatus']): string {
    switch (status) {
      case 'Active':
        return 'status-badge status-badge-green';
      case 'Idle':
        return 'status-badge status-badge-yellow';
      case 'Error':
      case 'No Signal':
        return 'status-badge status-badge-red';
      default:
        return 'status-badge';
    }
  }

  private getEncryptionModeClass_(mode: TxPayloadState['encryptionMode']): string {
    switch (mode) {
      case 'ACTIVE':
        return 'status-badge status-badge-green';
      case 'DISABLED':
        return 'status-badge status-badge-red';
      case 'BYPASSED':
        return 'status-badge status-badge-amber';
      default:
        return 'status-badge status-badge-off';
    }
  }

  private getKeyStatusClass_(status: TxPayloadState['encryptionKeyStatus']): string {
    switch (status) {
      case 'Valid':
        return 'status-badge status-badge-green';
      case 'Expired':
        return 'status-badge status-badge-red';
      case 'Pending Rotation':
        return 'status-badge status-badge-amber';
      default:
        return 'status-badge status-badge-off';
    }
  }

  private getBufferBarClass_(utilization: number): string {
    if (utilization >= 90) {
      return 'progress-bar bg-danger';
    } else if (utilization >= 75) {
      return 'progress-bar bg-warning';
    }
    return 'progress-bar bg-primary';
  }

  private getAlarms_(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];
    const state = this.state_;

    // Source Feed Issues
    if (state.sourceFeedStatus === 'No Signal') {
      alarms.push({ severity: 'error', message: 'No source feed signal' });
    } else if (state.sourceFeedStatus === 'Error') {
      alarms.push({ severity: 'error', message: 'Source feed error' });
    } else if (state.sourceFeedStatus === 'Idle') {
      alarms.push({ severity: 'warning', message: 'Source feed idle' });
    }

    // Buffer Issues
    if (state.bufferUtilization >= 95) {
      alarms.push({ severity: 'error', message: 'Buffer near overflow' });
    } else if (state.bufferUtilization >= 80) {
      alarms.push({ severity: 'warning', message: `Buffer utilization high: ${state.bufferUtilization}%` });
    }

    if (state.bufferOverflows > 0) {
      alarms.push({ severity: 'error', message: `${state.bufferOverflows} buffer overflows` });
    }

    if (state.bufferUnderruns > 0) {
      alarms.push({ severity: 'warning', message: `${state.bufferUnderruns} buffer underruns` });
    }

    // Encryption Issues
    if (state.encryptionMode === 'DISABLED') {
      alarms.push({ severity: 'error', message: 'TX encryption disabled - data transmitted in clear' });
    } else if (state.encryptionMode === 'BYPASSED') {
      alarms.push({ severity: 'warning', message: 'TX encryption bypassed' });
    }

    if (state.encryptionKeyStatus === 'Expired') {
      alarms.push({ severity: 'error', message: 'TX encryption key expired' });
    } else if (state.encryptionKeyStatus === 'Pending Rotation') {
      alarms.push({ severity: 'warning', message: 'TX key rotation pending' });
    }

    if (state.encryptionExpiresInDays <= 7) {
      alarms.push({ severity: 'warning', message: `TX key expires in ${state.encryptionExpiresInDays} days` });
    }

    if (!state.encryptionAuthTagVerified) {
      alarms.push({ severity: 'error', message: 'TX authentication tag generation failed' });
    }

    // Efficiency Issues
    if (state.efficiency < 70) {
      alarms.push({ severity: 'error', message: `Critical efficiency: ${state.efficiency.toFixed(1)}%` });
    } else if (state.efficiency < 80) {
      alarms.push({ severity: 'warning', message: `Low efficiency: ${state.efficiency.toFixed(1)}%` });
    }

    // Channel Status
    if (state.channel === 'Backup') {
      alarms.push({ severity: 'info', message: 'Operating on backup channel' });
    }

    return alarms;
  }

  /**
   * Update payload state (for future dynamic updates)
   */
  public updateState(newState: Partial<TxPayloadState>): void {
    this.state_ = { ...this.state_, ...newState };
    this.syncDomWithState_();
  }

  /**
   * Get current state (for testing/debugging)
   */
  public get state(): TxPayloadState {
    return { ...this.state_ };
  }

  public dispose(): void {
    this.alarmBadge_.dispose();
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.domCache_.clear();
  }
}
