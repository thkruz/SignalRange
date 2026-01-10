/**
 * @file CryptoModule Core
 * @description Core crypto equipment module for SATCOM ground station simulation.
 *
 * Manages shared encryption/decryption state including key lifecycle (loading,
 * expiration, rotation, zeroize) and operational modes for both TX and RX chains.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type {
  CryptoAlgorithm,
  CryptoMode,
  CryptoState,
  RxCryptoState,
  TxCryptoState,
} from './crypto-types';

/**
 * CryptoModule - Unified crypto state management for TX/RX chains
 *
 * This module models a COMSEC (Communications Security) equipment unit that
 * handles both encryption (TX) and decryption (RX) using shared key material.
 * Key features:
 *
 * - Shared key material between TX and RX (models real crypto equipment)
 * - Key lifecycle management (loading, expiration countdown, rotation)
 * - Emergency zeroize functionality
 * - Operational mode control (active, disabled, bypass)
 * - Scenario fault injection hooks
 */
export class CryptoModule {
  private static instance_: CryptoModule | null = null;

  private state_: CryptoState;
  private readonly boundUpdateHandler_: () => void;

  private static readonly KEY_EXPIRY_WARNING_DAYS = 7;
  private static readonly UPDATE_INTERVAL_MS = 1000;
  private lastUpdateTime_: number = 0;

  // Simulation time scaling (for accelerated key expiration in training)
  private timeScaleFactor_: number = 1; // 1 = real-time, higher = faster

  private constructor(initialState?: Partial<CryptoState>) {
    this.state_ = {
      ...CryptoModule.getDefaultState(),
      ...initialState,
    };

    this.boundUpdateHandler_ = this.update_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CryptoModule {
    if (!CryptoModule.instance_) {
      CryptoModule.instance_ = new CryptoModule();
    }
    return CryptoModule.instance_;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    if (CryptoModule.instance_) {
      CryptoModule.instance_.dispose();
      CryptoModule.instance_ = null;
    }
  }

  /**
   * Get default initial state
   */
  static getDefaultState(): CryptoState {
    return {
      // Shared Key Material
      keyId: 'FOXTROT-2024-0293',
      algorithm: 'AES-256-GCM',
      keyStatus: 'Valid',
      keyExpiresInDays: 62,
      keyLoadedAt: Date.now(),
      keyValidDays: 90,

      // TX Encryption
      txMode: 'ACTIVE',
      txAuthTagValid: true,

      // RX Decryption
      rxMode: 'ACTIVE',
      rxAuthTagVerified: true,
      rxDecryptionSuccess: true,

      // Operational
      isZeroized: false,
      lastZeroizeTime: null,
    };
  }

  /**
   * Get full crypto state (read-only copy)
   */
  get state(): CryptoState {
    return { ...this.state_ };
  }

  /**
   * Get TX encryption state for TxPayloadAdapter
   */
  getTxState(): TxCryptoState {
    return {
      encryptionMode: this.state_.txMode,
      encryptionAlgorithm: this.state_.algorithm,
      encryptionKeyId: this.state_.keyId,
      encryptionKeyStatus: this.state_.keyStatus,
      encryptionExpiresInDays: this.state_.keyExpiresInDays,
      encryptionAuthTagVerified: this.state_.txAuthTagValid,
    };
  }

  /**
   * Get RX decryption state for RxPayloadAdapter
   */
  getRxState(): RxCryptoState {
    return {
      decryptionMode: this.state_.rxMode,
      decryptionAlgorithm: this.state_.algorithm,
      decryptionKeyId: this.state_.keyId,
      decryptionKeyStatus: this.state_.keyStatus,
      decryptionExpiresInDays: this.state_.keyExpiresInDays,
      decryptionAuthTagVerified: this.state_.rxAuthTagVerified,
      decryptionSuccess: this.state_.rxDecryptionSuccess,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Public Handlers (for UI/scenario control)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Change TX encryption mode
   */
  handleTxModeChange(mode: CryptoMode): void {
    if (this.state_.isZeroized && mode !== 'DISABLED') {
      console.warn('[CryptoModule] Cannot enable encryption while zeroized');
      return;
    }
    this.state_.txMode = mode;
    this.updateAuthTagStatus_();
    this.emitStateChanged_();
  }

  /**
   * Change RX decryption mode
   */
  handleRxModeChange(mode: CryptoMode): void {
    if (this.state_.isZeroized && mode !== 'DISABLED') {
      console.warn('[CryptoModule] Cannot enable decryption while zeroized');
      return;
    }
    this.state_.rxMode = mode;
    this.updateAuthTagStatus_();
    this.emitStateChanged_();
  }

  /**
   * Change encryption algorithm
   */
  handleAlgorithmChange(algorithm: CryptoAlgorithm): void {
    if (this.state_.isZeroized) {
      console.warn('[CryptoModule] Cannot change algorithm while zeroized');
      return;
    }
    this.state_.algorithm = algorithm;
    this.emitStateChanged_();
  }

  /**
   * Perform key rotation
   */
  handleKeyRotation(newKeyId: string, validDays: number = 90): void {
    const previousKeyId = this.state_.keyId;

    // Re-keying clears zeroized state
    if (this.state_.isZeroized) {
      this.state_.isZeroized = false;
    }

    this.state_.keyId = newKeyId;
    this.state_.keyLoadedAt = Date.now();
    this.state_.keyValidDays = validDays;
    this.state_.keyExpiresInDays = validDays;
    this.state_.keyStatus = 'Valid';

    // Restore auth tags after re-keying
    this.updateAuthTagStatus_();

    EventBus.getInstance().emit(Events.CRYPTO_KEY_ROTATED, {
      keyId: newKeyId,
      previousKeyId,
      timestamp: Date.now(),
    });
    this.emitStateChanged_();
  }

  /**
   * Emergency key destruction (zeroize)
   *
   * This simulates the COMSEC zeroize function that destroys all key material
   * and disables crypto operations. Requires re-keying to restore operation.
   */
  zeroize(reason: 'manual' | 'auto' | 'scenario' = 'manual'): void {
    this.state_.txMode = 'DISABLED';
    this.state_.rxMode = 'DISABLED';
    this.state_.keyId = 'ZEROIZED';
    this.state_.keyStatus = 'Zeroized';
    this.state_.keyExpiresInDays = 0;
    this.state_.isZeroized = true;
    this.state_.lastZeroizeTime = Date.now();
    this.state_.txAuthTagValid = false;
    this.state_.rxAuthTagVerified = false;
    this.state_.rxDecryptionSuccess = false;

    EventBus.getInstance().emit(Events.CRYPTO_ZEROIZED, {
      timestamp: Date.now(),
      reason,
    });
    this.emitStateChanged_();
  }

  // ═══════════════════════════════════════════════════════════════
  // Scenario Fault Injection
  // ═══════════════════════════════════════════════════════════════

  /**
   * Inject key mismatch condition (for scenario training)
   *
   * Simulates a situation where the local key doesn't match the far-end,
   * causing decryption to fail.
   */
  injectKeyMismatch(): void {
    this.state_.keyStatus = 'Mismatch';
    this.state_.rxDecryptionSuccess = false;
    this.state_.rxAuthTagVerified = false;
    this.emitStateChanged_();
  }

  /**
   * Inject pending rotation warning (for scenario training)
   */
  injectPendingRotation(daysRemaining: number = 5): void {
    this.state_.keyStatus = 'Pending Rotation';
    this.state_.keyExpiresInDays = daysRemaining;
    this.emitStateChanged_();
  }

  /**
   * Inject key expiration (for scenario training)
   */
  injectKeyExpired(): void {
    this.state_.keyStatus = 'Expired';
    this.state_.keyExpiresInDays = 0;
    this.state_.txAuthTagValid = false;
    this.state_.rxAuthTagVerified = false;
    this.state_.rxDecryptionSuccess = false;
    EventBus.getInstance().emit(Events.CRYPTO_KEY_EXPIRED, {
      keyId: this.state_.keyId,
      timestamp: Date.now(),
    });
    this.emitStateChanged_();
  }

  /**
   * Inject auth tag failure (for scenario training)
   */
  injectAuthTagFailure(side: 'tx' | 'rx' | 'both' = 'rx'): void {
    if (side === 'tx' || side === 'both') {
      this.state_.txAuthTagValid = false;
    }
    if (side === 'rx' || side === 'both') {
      this.state_.rxAuthTagVerified = false;
      this.state_.rxDecryptionSuccess = false;
    }
    this.emitStateChanged_();
  }

  /**
   * Clear all injected faults and restore normal operation
   */
  clearFaults(): void {
    if (!this.state_.isZeroized) {
      this.state_.keyStatus = 'Valid';
      this.updateAuthTagStatus_();
    }
    this.emitStateChanged_();
  }

  /**
   * Set time scale factor for accelerated training
   */
  setTimeScale(factor: number): void {
    this.timeScaleFactor_ = Math.max(1, factor);
  }

  /**
   * Sync state from external source (e.g., scenario initial state)
   */
  sync(state: Partial<CryptoState>): void {
    this.state_ = { ...this.state_, ...state };
    this.emitStateChanged_();
  }

  /**
   * Get alarms for status display
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    if (this.state_.isZeroized) {
      alarms.push('CRYPTO ZEROIZED - Re-key required');
    }

    if (this.state_.keyStatus === 'Expired') {
      alarms.push('Crypto key expired');
    } else if (this.state_.keyStatus === 'Mismatch') {
      alarms.push('Crypto key mismatch - decryption failing');
    } else if (this.state_.keyStatus === 'Pending Rotation') {
      alarms.push(`Crypto key expires in ${this.state_.keyExpiresInDays} days`);
    }

    if (this.state_.txMode === 'DISABLED') {
      alarms.push('TX encryption disabled');
    } else if (this.state_.txMode === 'BYPASSED') {
      alarms.push('TX encryption bypassed');
    }

    if (this.state_.rxMode === 'DISABLED') {
      alarms.push('RX decryption disabled');
    }

    if (!this.state_.rxAuthTagVerified && this.state_.rxMode === 'ACTIVE') {
      alarms.push('RX auth tag verification failed');
    }

    return alarms;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Periodic update (called on Events.UPDATE)
   */
  private update_(): void {
    const now = Date.now();
    if (now - this.lastUpdateTime_ < CryptoModule.UPDATE_INTERVAL_MS) return;
    this.lastUpdateTime_ = now;

    this.updateKeyExpiration_();
  }

  /**
   * Update key expiration countdown
   */
  private updateKeyExpiration_(): void {
    if (this.state_.isZeroized || this.state_.keyStatus === 'Zeroized') {
      return;
    }

    // Skip if in fault-injected state
    if (this.state_.keyStatus === 'Mismatch') {
      return;
    }

    // Calculate elapsed time with scaling
    const msElapsed = (Date.now() - this.state_.keyLoadedAt) * this.timeScaleFactor_;
    const daysElapsed = msElapsed / (24 * 60 * 60 * 1000);
    const daysRemaining = this.state_.keyValidDays - daysElapsed;

    const previousDays = this.state_.keyExpiresInDays;
    this.state_.keyExpiresInDays = Math.max(0, Math.floor(daysRemaining));

    // Update status based on expiration
    if (this.state_.keyExpiresInDays <= 0 && this.state_.keyStatus !== 'Expired') {
      this.state_.keyStatus = 'Expired';
      this.state_.txAuthTagValid = false;
      this.state_.rxAuthTagVerified = false;
      this.state_.rxDecryptionSuccess = false;
      EventBus.getInstance().emit(Events.CRYPTO_KEY_EXPIRED, {
        keyId: this.state_.keyId,
        timestamp: Date.now(),
      });
      this.emitStateChanged_();
    } else if (
      this.state_.keyExpiresInDays <= CryptoModule.KEY_EXPIRY_WARNING_DAYS &&
      this.state_.keyStatus === 'Valid'
    ) {
      this.state_.keyStatus = 'Pending Rotation';
      this.emitStateChanged_();
    } else if (previousDays !== this.state_.keyExpiresInDays) {
      // Days changed, emit update
      this.emitStateChanged_();
    }
  }

  /**
   * Update auth tag status based on mode and key status
   */
  private updateAuthTagStatus_(): void {
    // Zeroized or expired = no auth
    if (this.state_.isZeroized || this.state_.keyStatus === 'Expired') {
      this.state_.txAuthTagValid = false;
      this.state_.rxAuthTagVerified = false;
      this.state_.rxDecryptionSuccess = false;
      return;
    }

    // Key mismatch = RX auth fails
    if (this.state_.keyStatus === 'Mismatch') {
      this.state_.rxAuthTagVerified = false;
      this.state_.rxDecryptionSuccess = false;
      return;
    }

    // Normal operation - auth tags valid when mode is ACTIVE
    this.state_.txAuthTagValid = this.state_.txMode === 'ACTIVE';
    this.state_.rxAuthTagVerified = this.state_.rxMode === 'ACTIVE';
    this.state_.rxDecryptionSuccess = this.state_.rxMode === 'ACTIVE';
  }

  /**
   * Emit state changed event
   */
  private emitStateChanged_(): void {
    EventBus.getInstance().emit(Events.CRYPTO_STATE_CHANGED, {
      keyId: this.state_.keyId,
      algorithm: this.state_.algorithm,
      keyStatus: this.state_.keyStatus,
      txMode: this.state_.txMode,
      rxMode: this.state_.rxMode,
    });
  }
}
