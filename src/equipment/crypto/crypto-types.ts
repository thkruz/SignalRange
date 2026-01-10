/**
 * @file Crypto Module Type Definitions
 * @description Type definitions for the SATCOM ground station crypto equipment simulation.
 *
 * Models encryption/decryption state including key management, algorithm selection,
 * and operational modes for both TX (encryption) and RX (decryption) chains.
 */

/**
 * Supported encryption algorithms
 */
export type CryptoAlgorithm =
  | 'AES-256-GCM'   // AES-256 with Galois/Counter Mode (authenticated)
  | 'AES-256-CBC'   // AES-256 with Cipher Block Chaining
  | 'TDES-168'      // Triple DES with 168-bit key (legacy)
  | 'NONE';         // No encryption (plaintext)

/**
 * Crypto operational modes
 */
export type CryptoMode =
  | 'ACTIVE'    // Normal operation - encryption/decryption enabled
  | 'DISABLED'  // Encryption/decryption turned off
  | 'BYPASSED'; // Crypto equipment in bypass mode (for testing)

/**
 * Key validity status
 */
export type KeyStatus =
  | 'Valid'             // Key is valid and operational
  | 'Expired'           // Key has expired and should not be used
  | 'Pending Rotation'  // Key is valid but approaching expiration
  | 'Mismatch'          // Key doesn't match far-end (decryption fails)
  | 'Zeroized';         // Key has been emergency-destroyed

/**
 * Full crypto module state
 */
export interface CryptoState {
  // ═══════════════════════════════════════════════════════════════
  // Shared Key Material (same for TX and RX)
  // ═══════════════════════════════════════════════════════════════

  /** Current key identifier (e.g., 'FOXTROT-2024-0293') */
  keyId: string;

  /** Encryption algorithm in use */
  algorithm: CryptoAlgorithm;

  /** Current key status */
  keyStatus: KeyStatus;

  /** Days until key expires */
  keyExpiresInDays: number;

  /** Simulation timestamp when key was loaded */
  keyLoadedAt: number;

  /** Total validity period in days */
  keyValidDays: number;

  // ═══════════════════════════════════════════════════════════════
  // TX Encryption State
  // ═══════════════════════════════════════════════════════════════

  /** TX encryption operational mode */
  txMode: CryptoMode;

  /** TX authentication tag generation status */
  txAuthTagValid: boolean;

  // ═══════════════════════════════════════════════════════════════
  // RX Decryption State
  // ═══════════════════════════════════════════════════════════════

  /** RX decryption operational mode */
  rxMode: CryptoMode;

  /** RX authentication tag verification status */
  rxAuthTagVerified: boolean;

  /** Overall RX decryption success */
  rxDecryptionSuccess: boolean;

  // ═══════════════════════════════════════════════════════════════
  // Operational State
  // ═══════════════════════════════════════════════════════════════

  /** Whether crypto has been zeroized */
  isZeroized: boolean;

  /** Timestamp of last zeroize (null if never) */
  lastZeroizeTime: number | null;
}

/**
 * TX-specific state for TxPayloadAdapter
 */
export interface TxCryptoState {
  encryptionMode: CryptoMode;
  encryptionAlgorithm: string;
  encryptionKeyId: string;
  encryptionKeyStatus: KeyStatus;
  encryptionExpiresInDays: number;
  encryptionAuthTagVerified: boolean;
}

/**
 * RX-specific state for RxPayloadAdapter
 */
export interface RxCryptoState {
  decryptionMode: CryptoMode;
  decryptionAlgorithm: string;
  decryptionKeyId: string;
  decryptionKeyStatus: KeyStatus;
  decryptionExpiresInDays: number;
  decryptionAuthTagVerified: boolean;
  decryptionSuccess: boolean;
}

/**
 * Event data for crypto state change
 */
export interface CryptoStateChangedData {
  keyId: string;
  algorithm: CryptoAlgorithm;
  keyStatus: KeyStatus;
  txMode: CryptoMode;
  rxMode: CryptoMode;
}

/**
 * Event data for key rotation
 */
export interface CryptoKeyRotatedData {
  keyId: string;
  previousKeyId: string;
  timestamp: number;
}

/**
 * Event data for key expiration
 */
export interface CryptoKeyExpiredData {
  keyId: string;
  timestamp: number;
}

/**
 * Event data for zeroize
 */
export interface CryptoZeroizedData {
  timestamp: number;
  reason: 'manual' | 'auto' | 'scenario';
}
