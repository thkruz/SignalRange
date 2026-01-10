import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { qs } from "@app/engine/utils/query-selector";
import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { AlarmStatus } from "@app/equipment/base-equipment";
import { CryptoModule } from "@app/equipment/crypto";
import { FECSimulator, FECSimulatorInput } from "@app/equipment/receiver/fec-simulator";
import { Receiver } from "@app/equipment/receiver/receiver";
import { FaultInjector } from "@app/faults";

/**
 * RX Payload state interface with data integrity metrics
 */
export interface RxPayloadState {
  // Frame Sync + BER + CRC
  frameSyncLocked: boolean;
  frameSyncPattern: string;
  ber: number;
  berThreshold: number;
  crcValid: boolean;
  crcType: 'CRC-16' | 'CRC-32' | 'CRC-CCITT';
  crcErrorCount: number;

  // Reed-Solomon Decoder
  rsEnabled: boolean;
  rsCorrectedErrors: number;
  rsCorrectedTotal: number;
  rsUncorrectableBlocks: number;
  rsCodeRate: string;

  // Viterbi Decoder
  viterbiEnabled: boolean;
  viterbiPathMetric: number;
  viterbiTracebackDepth: number;
  viterbiConstraintLength: number;
  viterbiCodeRate: string;

  // Channel metrics
  dataRate: string;
  channelStatus: 'Good' | 'Degraded' | 'Critical' | 'No Lock';

  // RX Decryption
  decryptionMode: 'ACTIVE' | 'DISABLED' | 'BYPASSED';
  decryptionAlgorithm: string;
  decryptionKeyId: string;
  decryptionKeyStatus: 'Valid' | 'Expired' | 'Pending Rotation' | 'Mismatch' | 'Zeroized';
  decryptionExpiresInDays: number;
  decryptionAuthTagVerified: boolean;
  decryptionSuccess: boolean;
}

/**
 * RxPayloadAdapter - Bridges RX payload data integrity state to DOM display
 *
 * Displays frame synchronization, Reed-Solomon decoder, and Viterbi decoder
 * metrics for SATCOM operator training on received signal quality.
 *
 * Integrates with:
 * - FECSimulator: Calculates BER/Viterbi/RS metrics from signal quality
 * - CryptoModule: Provides RX decryption state
 * - FaultInjector: Applies scenario fault overrides
 */
export class RxPayloadAdapter {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly containerEl_: HTMLElement;
  private readonly receiver_: Receiver | null;
  private readonly groundStationId_: string;
  private readonly fecSimulator_: FECSimulator;
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;

  private state_: RxPayloadState = {
    // Frame Sync + BER + CRC
    frameSyncLocked: true,
    frameSyncPattern: '1ACFFC1D',
    ber: 1.2e-7,
    berThreshold: 1e-3,
    crcValid: true,
    crcType: 'CRC-32',
    crcErrorCount: 0,

    // Reed-Solomon Decoder
    rsEnabled: true,
    rsCorrectedErrors: 0,
    rsCorrectedTotal: 12,
    rsUncorrectableBlocks: 0,
    rsCodeRate: '223/255',

    // Viterbi Decoder
    viterbiEnabled: true,
    viterbiPathMetric: 0.92,
    viterbiTracebackDepth: 35,
    viterbiConstraintLength: 7,
    viterbiCodeRate: '1/2',

    // Channel
    dataRate: '2.048 Mbps',
    channelStatus: 'Good',

    // RX Decryption
    decryptionMode: 'ACTIVE',
    decryptionAlgorithm: 'AES-256-GCM',
    decryptionKeyId: 'FOXTROT-2024-0293',
    decryptionKeyStatus: 'Valid',
    decryptionExpiresInDays: 62,
    decryptionAuthTagVerified: true,
    decryptionSuccess: true,
  };

  /**
   * @param containerEl DOM container element
   * @param receiver Optional receiver for dynamic FEC simulation
   * @param groundStationId Ground station ID for fault injection scoping
   */
  constructor(
    containerEl: HTMLElement,
    receiver?: Receiver | null,
    groundStationId: string = 'default'
  ) {
    this.containerEl_ = containerEl;
    this.receiver_ = receiver ?? null;
    this.groundStationId_ = groundStationId;
    this.fecSimulator_ = new FECSimulator();

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('rx-payload-alarm-badge-led');
    const badgeContainer = qs('#rx-payload-alarm-badge', containerEl);
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
    if (now - this.lastSyncTime_ < RxPayloadAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;

    // Update FEC metrics from receiver signal quality
    this.updateFecFromReceiver_();

    // Update crypto state from CryptoModule
    this.updateCryptoState_();

    // Apply fault injection overrides
    this.applyFaultOverrides_();

    this.syncDomWithState_();
  }

  /**
   * Calculate FEC metrics from receiver signal quality
   */
  private updateFecFromReceiver_(): void {
    if (!this.receiver_) return;

    const modem = this.receiver_.activeModem;
    if (!modem) return;

    // Get signal info from receiver
    const signalInfo = this.receiver_.getSignalsInBandwidth();
    if (!signalInfo) return;

    // Build FEC simulator input
    const input: FECSimulatorInput = {
      cnRatio_dB: signalInfo.cnRatio_dB ?? 0,
      effectiveCnRatio_dB: signalInfo.effectiveCnRatio_dB ?? signalInfo.cnRatio_dB ?? 0,
      hasCarrier: signalInfo.hasCarrier ?? false,
      hasLock: signalInfo.hasLock ?? false,
      modulation: modem.modulation ?? 'QPSK',
      fec: modem.fec ?? '1/2',
    };

    // Calculate FEC metrics
    const fecMetrics = this.fecSimulator_.calculate(input);

    // Update state with calculated metrics
    this.state_.frameSyncLocked = fecMetrics.frameSyncLocked;
    this.state_.ber = fecMetrics.ber;
    this.state_.viterbiPathMetric = fecMetrics.viterbiPathMetric;
    this.state_.rsCorrectedErrors = fecMetrics.rsCorrectedErrors;
    this.state_.rsCorrectedTotal = fecMetrics.rsCorrectedTotal;
    this.state_.rsUncorrectableBlocks = fecMetrics.rsUncorrectableBlocks;
    this.state_.channelStatus = fecMetrics.channelStatus;
    this.state_.dataRate = fecMetrics.dataRate;

    // Derive CRC status from RS uncorrectable (RS failures pass through to CRC)
    this.state_.crcValid = fecMetrics.rsUncorrectableBlocks === 0;
    this.state_.crcErrorCount = fecMetrics.rsUncorrectableBlocks;

    // Update Viterbi code rate from modem FEC setting
    this.state_.viterbiCodeRate = modem.fec ?? '1/2';
  }

  /**
   * Update crypto state from CryptoModule singleton
   */
  private updateCryptoState_(): void {
    const cryptoState = CryptoModule.getInstance().getRxState();
    this.state_.decryptionMode = cryptoState.decryptionMode;
    this.state_.decryptionAlgorithm = cryptoState.decryptionAlgorithm;
    this.state_.decryptionKeyId = cryptoState.decryptionKeyId;
    this.state_.decryptionKeyStatus = cryptoState.decryptionKeyStatus;
    this.state_.decryptionExpiresInDays = cryptoState.decryptionExpiresInDays;
    this.state_.decryptionAuthTagVerified = cryptoState.decryptionAuthTagVerified;
    this.state_.decryptionSuccess = cryptoState.decryptionSuccess;
  }

  /**
   * Apply fault injection overrides from FaultInjector
   */
  private applyFaultOverrides_(): void {
    const overrides = FaultInjector.getInstance().getRxPayloadOverrides(this.groundStationId_);
    if (Object.keys(overrides).length > 0) {
      this.state_ = { ...this.state_, ...overrides };
    }
  }

  private setupDomCache_(): void {
    // Frame Sync section
    this.cacheElement_('rx-payload-frame-sync', 'frameSync');
    this.cacheElement_('rx-payload-sync-pattern', 'syncPattern');
    this.cacheElement_('rx-payload-ber', 'ber');
    this.cacheElement_('rx-payload-crc-status', 'crcStatus');
    this.cacheElement_('rx-payload-crc-type', 'crcType');
    this.cacheElement_('rx-payload-crc-errors', 'crcErrors');

    // Reed-Solomon section
    this.cacheElement_('rx-payload-rs-status', 'rsStatus');
    this.cacheElement_('rx-payload-rs-code-rate', 'rsCodeRate');
    this.cacheElement_('rx-payload-rs-corrected', 'rsCorrected');
    this.cacheElement_('rx-payload-rs-total', 'rsTotal');
    this.cacheElement_('rx-payload-rs-uncorrectable', 'rsUncorrectable');

    // Viterbi section
    this.cacheElement_('rx-payload-viterbi-status', 'viterbiStatus');
    this.cacheElement_('rx-payload-viterbi-code-rate', 'viterbiCodeRate');
    this.cacheElement_('rx-payload-viterbi-path-metric', 'viterbiPathMetric');
    this.cacheElement_('rx-payload-viterbi-traceback', 'viterbiTraceback');
    this.cacheElement_('rx-payload-viterbi-k', 'viterbiK');

    // Channel section
    this.cacheElement_('rx-payload-data-rate', 'dataRate');
    this.cacheElement_('rx-payload-channel-status', 'channelStatus');

    // RX Decryption section
    this.cacheElement_('rx-payload-dec-mode', 'decMode');
    this.cacheElement_('rx-payload-dec-algorithm', 'decAlgorithm');
    this.cacheElement_('rx-payload-dec-key-id', 'decKeyId');
    this.cacheElement_('rx-payload-dec-key-status', 'decKeyStatus');
    this.cacheElement_('rx-payload-dec-expires', 'decExpires');
    this.cacheElement_('rx-payload-dec-auth-tag', 'decAuthTag');
    this.cacheElement_('rx-payload-dec-success', 'decSuccess');
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

    // Frame Sync section
    const frameSyncEl = this.domCache_.get('frameSync');
    if (frameSyncEl) {
      frameSyncEl.textContent = state.frameSyncLocked ? 'Locked' : 'Unlocked';
      frameSyncEl.className = state.frameSyncLocked
        ? 'status-badge status-badge-green'
        : 'status-badge status-badge-red';
    }

    this.updateTextContent_('syncPattern', state.frameSyncPattern);
    this.updateTextContent_('ber', this.formatBer_(state.ber));
    this.updateTextContent_('crcType', state.crcType);

    const crcStatusEl = this.domCache_.get('crcStatus');
    if (crcStatusEl) {
      crcStatusEl.textContent = state.crcValid ? 'Valid' : 'Errors';
      crcStatusEl.className = state.crcValid
        ? 'status-badge status-badge-green'
        : 'status-badge status-badge-red';
    }

    this.updateTextContent_('crcErrors', state.crcErrorCount.toLocaleString());

    // Reed-Solomon section
    const rsStatusEl = this.domCache_.get('rsStatus');
    if (rsStatusEl) {
      const rsStatus = this.getRsStatus_(state);
      rsStatusEl.textContent = rsStatus.text;
      rsStatusEl.className = `status-badge ${rsStatus.class}`;
    }

    this.updateTextContent_('rsCodeRate', state.rsCodeRate);
    this.updateTextContent_('rsCorrected', state.rsCorrectedErrors.toLocaleString());
    this.updateTextContent_('rsTotal', state.rsCorrectedTotal.toLocaleString());

    const rsUncorrectableEl = this.domCache_.get('rsUncorrectable');
    if (rsUncorrectableEl) {
      rsUncorrectableEl.textContent = state.rsUncorrectableBlocks.toLocaleString();
      rsUncorrectableEl.className = state.rsUncorrectableBlocks > 0
        ? 'metric-value text-danger fw-bold'
        : 'metric-value';
    }

    // Viterbi section
    const viterbiStatusEl = this.domCache_.get('viterbiStatus');
    if (viterbiStatusEl) {
      viterbiStatusEl.textContent = state.viterbiEnabled ? 'Enabled' : 'Disabled';
      viterbiStatusEl.className = state.viterbiEnabled
        ? 'status-badge status-badge-green'
        : 'status-badge status-badge-yellow';
    }

    this.updateTextContent_('viterbiCodeRate', state.viterbiCodeRate);
    this.updateTextContent_('viterbiPathMetric', state.viterbiPathMetric.toFixed(2));
    this.updateTextContent_('viterbiTraceback', state.viterbiTracebackDepth.toString());
    this.updateTextContent_('viterbiK', `K=${state.viterbiConstraintLength}`);

    // Channel section
    this.updateTextContent_('dataRate', state.dataRate);

    const channelStatusEl = this.domCache_.get('channelStatus');
    if (channelStatusEl) {
      channelStatusEl.textContent = state.channelStatus;
      channelStatusEl.className = `status-badge ${this.getChannelStatusClass_(state.channelStatus)}`;
    }

    // RX Decryption section
    const decModeEl = this.domCache_.get('decMode');
    if (decModeEl) {
      decModeEl.textContent = state.decryptionMode;
      decModeEl.className = this.getDecryptionModeClass_(state.decryptionMode);
    }

    this.updateTextContent_('decAlgorithm', state.decryptionAlgorithm);
    this.updateTextContent_('decKeyId', state.decryptionKeyId);

    const decKeyStatusEl = this.domCache_.get('decKeyStatus');
    if (decKeyStatusEl) {
      decKeyStatusEl.textContent = state.decryptionKeyStatus;
      decKeyStatusEl.className = this.getDecKeyStatusClass_(state.decryptionKeyStatus);
    }

    this.updateTextContent_('decExpires', `${state.decryptionExpiresInDays} days`);

    const decAuthTagEl = this.domCache_.get('decAuthTag');
    if (decAuthTagEl) {
      decAuthTagEl.textContent = state.decryptionAuthTagVerified ? 'Verified' : 'Failed';
      decAuthTagEl.className = state.decryptionAuthTagVerified
        ? 'status-badge status-badge-green'
        : 'status-badge status-badge-red';
    }

    const decSuccessEl = this.domCache_.get('decSuccess');
    if (decSuccessEl) {
      decSuccessEl.textContent = state.decryptionSuccess ? 'Success' : 'Failed';
      decSuccessEl.className = state.decryptionSuccess
        ? 'status-badge status-badge-green'
        : 'status-badge status-badge-red';
    }

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

  private formatBer_(ber: number): string {
    if (ber === 0) return '0';
    if (ber < 1e-12) return '< 1e-12';
    return ber.toExponential(1);
  }

  private getRsStatus_(state: RxPayloadState): { text: string; class: string } {
    if (!state.rsEnabled) {
      return { text: 'Disabled', class: 'status-badge-yellow' };
    }
    if (state.rsUncorrectableBlocks > 0) {
      return { text: 'Overload', class: 'status-badge-red' };
    }
    if (state.rsCorrectedErrors > 0) {
      return { text: 'Active', class: 'status-badge-green' };
    }
    return { text: 'Idle', class: 'status-badge-green' };
  }

  private getChannelStatusClass_(status: RxPayloadState['channelStatus']): string {
    switch (status) {
      case 'Good':
        return 'status-badge-green';
      case 'Degraded':
        return 'status-badge-yellow';
      case 'Critical':
      case 'No Lock':
        return 'status-badge-red';
      default:
        return '';
    }
  }

  private getDecryptionModeClass_(mode: RxPayloadState['decryptionMode']): string {
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

  private getDecKeyStatusClass_(status: RxPayloadState['decryptionKeyStatus']): string {
    switch (status) {
      case 'Valid':
        return 'status-badge status-badge-green';
      case 'Expired':
      case 'Mismatch':
        return 'status-badge status-badge-red';
      case 'Pending Rotation':
        return 'status-badge status-badge-amber';
      default:
        return 'status-badge status-badge-off';
    }
  }

  private getAlarms_(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];
    const state = this.state_;

    // Frame sync lost
    if (!state.frameSyncLocked) {
      alarms.push({ severity: 'error', message: 'Frame sync lost' });
    }

    // RS uncorrectable blocks
    if (state.rsUncorrectableBlocks > 0) {
      alarms.push({ severity: 'error', message: `${state.rsUncorrectableBlocks} RS uncorrectable blocks` });
    }

    // BER above threshold
    if (state.ber > state.berThreshold) {
      alarms.push({ severity: 'error', message: 'BER above threshold' });
    } else if (state.ber > 1e-6) {
      alarms.push({ severity: 'warning', message: 'Elevated BER' });
    }

    // CRC errors
    if (state.crcErrorCount > 10) {
      alarms.push({ severity: 'error', message: 'High CRC error rate' });
    } else if (state.crcErrorCount > 0) {
      alarms.push({ severity: 'warning', message: `${state.crcErrorCount} CRC errors detected` });
    }

    // Viterbi path metric degraded
    if (state.viterbiEnabled && state.viterbiPathMetric < 0.7) {
      alarms.push({ severity: 'warning', message: `Degraded Viterbi path metric: ${state.viterbiPathMetric.toFixed(2)}` });
    }

    // High RS correction rate (warning)
    if (state.rsEnabled && state.rsCorrectedErrors > 50) {
      alarms.push({ severity: 'warning', message: 'High RS correction rate' });
    }

    // Channel status
    if (state.channelStatus === 'Critical') {
      alarms.push({ severity: 'error', message: 'Channel critical' });
    } else if (state.channelStatus === 'Degraded') {
      alarms.push({ severity: 'warning', message: 'Channel performance degraded' });
    } else if (state.channelStatus === 'No Lock') {
      alarms.push({ severity: 'error', message: 'No channel lock' });
    }

    // RX Decryption alarms
    if (state.decryptionMode === 'DISABLED') {
      alarms.push({ severity: 'error', message: 'RX decryption disabled' });
    } else if (state.decryptionMode === 'BYPASSED') {
      alarms.push({ severity: 'warning', message: 'RX decryption bypassed' });
    }

    if (state.decryptionKeyStatus === 'Expired') {
      alarms.push({ severity: 'error', message: 'RX decryption key expired' });
    } else if (state.decryptionKeyStatus === 'Mismatch') {
      alarms.push({ severity: 'error', message: 'RX key mismatch - decryption failing' });
    } else if (state.decryptionKeyStatus === 'Pending Rotation') {
      alarms.push({ severity: 'warning', message: 'RX key rotation pending' });
    }

    if (state.decryptionExpiresInDays <= 7) {
      alarms.push({ severity: 'warning', message: `RX key expires in ${state.decryptionExpiresInDays} days` });
    }

    if (!state.decryptionAuthTagVerified) {
      alarms.push({ severity: 'error', message: 'RX authentication tag verification failed' });
    }

    if (!state.decryptionSuccess) {
      alarms.push({ severity: 'error', message: 'RX decryption failed' });
    }

    return alarms;
  }

  /**
   * Update payload state (for future dynamic updates)
   */
  public updateState(newState: Partial<RxPayloadState>): void {
    this.state_ = { ...this.state_, ...newState };
    this.syncDomWithState_();
  }

  /**
   * Get current state (for testing/debugging)
   */
  public get state(): RxPayloadState {
    return { ...this.state_ };
  }

  public dispose(): void {
    this.alarmBadge_.dispose();
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.domCache_.clear();
  }
}
