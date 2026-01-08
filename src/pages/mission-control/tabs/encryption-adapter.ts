import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { qs } from "@app/engine/utils/query-selector";
import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { AlarmStatus } from "@app/equipment/base-equipment";

/**
 * Encryption state interface for future dynamic updates
 */
export interface EncryptionState {
  mode: 'ACTIVE' | 'DISABLED' | 'BYPASSED';
  algorithm: string;
  classification: string;
  keyId: string;
  keyStatus: 'Valid' | 'Expired' | 'Pending Rotation';
  expiresInDays: number;
  lastRotation: string;
  strength: string;
  cipherMode: string;
  authTagVerified: boolean;
}

/**
 * EncryptionAdapter - Bridges encryption module state to DOM display
 *
 * Displays encryption status, key management, and security indicators
 * for SATCOM operator training. Currently uses static state but structured
 * for future dynamic updates.
 */
export class EncryptionAdapter {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly containerEl_: HTMLElement;
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;

  // Static state - can be updated dynamically in future
  private state_: EncryptionState = {
    mode: 'ACTIVE',
    algorithm: 'AES-256-GCM',
    classification: 'UNCLASSIFIED',
    keyId: 'TANGO-2024-0847',
    keyStatus: 'Valid',
    expiresInDays: 47,
    lastRotation: '2024-11-21',
    strength: '256-bit',
    cipherMode: 'GCM',
    authTagVerified: true,
  };

  constructor(containerEl: HTMLElement) {
    this.containerEl_ = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('enc-alarm-badge-led');
    const badgeContainer = qs('#enc-alarm-badge', containerEl);
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
    if (now - this.lastSyncTime_ < EncryptionAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  private setupDomCache_(): void {
    // Encryption Status
    this.domCache_.set('mode', qs('#enc-mode', this.containerEl_));
    this.domCache_.set('algorithm', qs('#enc-algorithm', this.containerEl_));
    this.domCache_.set('classification', qs('#enc-classification', this.containerEl_));

    // Key Management
    this.domCache_.set('keyId', qs('#enc-key-id', this.containerEl_));
    this.domCache_.set('keyStatus', qs('#enc-key-status', this.containerEl_));
    this.domCache_.set('expires', qs('#enc-expires', this.containerEl_));
    this.domCache_.set('lastRotation', qs('#enc-last-rotation', this.containerEl_));

    // Security Indicators
    this.domCache_.set('strength', qs('#enc-strength', this.containerEl_));
    this.domCache_.set('cipherMode', qs('#enc-cipher-mode', this.containerEl_));
    this.domCache_.set('authTag', qs('#enc-auth-tag', this.containerEl_));
  }

  private syncDomWithState_(): void {
    const state = this.state_;

    // Encryption Status
    const modeEl = this.domCache_.get('mode');
    if (modeEl) {
      modeEl.textContent = state.mode;
      modeEl.className = this.getModeClass_(state.mode);
    }

    const algorithmEl = this.domCache_.get('algorithm');
    if (algorithmEl) {
      algorithmEl.textContent = state.algorithm;
    }

    const classificationEl = this.domCache_.get('classification');
    if (classificationEl) {
      classificationEl.textContent = state.classification;
    }

    // Key Management
    const keyIdEl = this.domCache_.get('keyId');
    if (keyIdEl) {
      keyIdEl.textContent = state.keyId;
    }

    const keyStatusEl = this.domCache_.get('keyStatus');
    if (keyStatusEl) {
      keyStatusEl.textContent = state.keyStatus;
      keyStatusEl.className = this.getKeyStatusClass_(state.keyStatus);
    }

    const expiresEl = this.domCache_.get('expires');
    if (expiresEl) {
      expiresEl.textContent = `${state.expiresInDays} days`;
    }

    const lastRotationEl = this.domCache_.get('lastRotation');
    if (lastRotationEl) {
      lastRotationEl.textContent = state.lastRotation;
    }

    // Security Indicators
    const strengthEl = this.domCache_.get('strength');
    if (strengthEl) {
      strengthEl.textContent = state.strength;
    }

    const cipherModeEl = this.domCache_.get('cipherMode');
    if (cipherModeEl) {
      cipherModeEl.textContent = state.cipherMode;
    }

    const authTagEl = this.domCache_.get('authTag');
    if (authTagEl) {
      authTagEl.textContent = state.authTagVerified ? 'Verified' : 'Failed';
      authTagEl.className = state.authTagVerified
        ? 'status-badge status-badge-green'
        : 'status-badge status-badge-red';
    }

    // Update alarm badge
    const alarms = this.getAlarms_();
    this.alarmBadge_.update(alarms);
  }

  private getModeClass_(mode: EncryptionState['mode']): string {
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

  private getKeyStatusClass_(status: EncryptionState['keyStatus']): string {
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

  private getAlarms_(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];
    const state = this.state_;

    if (state.mode === 'DISABLED') {
      alarms.push({ severity: 'error', message: 'Encryption disabled - data transmitted in clear' });
    } else if (state.mode === 'BYPASSED') {
      alarms.push({ severity: 'warning', message: 'Encryption bypassed' });
    }

    if (state.keyStatus === 'Expired') {
      alarms.push({ severity: 'error', message: 'Encryption key expired' });
    } else if (state.keyStatus === 'Pending Rotation') {
      alarms.push({ severity: 'warning', message: 'Key rotation pending' });
    }

    if (state.expiresInDays <= 7) {
      alarms.push({ severity: 'warning', message: `Key expires in ${state.expiresInDays} days` });
    }

    if (!state.authTagVerified) {
      alarms.push({ severity: 'error', message: 'Authentication tag verification failed' });
    }

    return alarms;
  }

  /**
   * Update encryption state (for future dynamic updates)
   */
  public updateState(newState: Partial<EncryptionState>): void {
    this.state_ = { ...this.state_, ...newState };
    this.syncDomWithState_();
  }

  /**
   * Get current state (for testing/debugging)
   */
  public get state(): EncryptionState {
    return { ...this.state_ };
  }

  public dispose(): void {
    this.alarmBadge_.dispose();
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.domCache_.clear();
  }
}
