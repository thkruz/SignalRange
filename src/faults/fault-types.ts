/**
 * @file Fault Injection Type Definitions
 * @description Types for scenario-driven fault injection system.
 *
 * Allows training scenarios to inject specific fault conditions into
 * FEC and crypto equipment displays for operator training exercises.
 */

import { RxPayloadState } from '@app/pages/mission-control/tabs/rx-payload-adapter';
import { TxPayloadState } from '@app/pages/mission-control/tabs/tx-payload-adapter';

/**
 * Target equipment for fault injection
 */
export type FaultTarget = 'rx-payload' | 'tx-payload' | 'fec' | 'crypto';

/**
 * Fault definition structure
 */
export interface FaultDefinition {
  /** Unique fault identifier */
  id: string;
  /** Target equipment type */
  target: FaultTarget;
  /** Ground station ID this fault applies to */
  groundStationId: string;
  /** State overrides to apply */
  state: Partial<RxPayloadState> | Partial<TxPayloadState>;
  /** Priority (higher priority faults override lower) */
  priority: number;
  /** Optional auto-expiration timestamp */
  expiresAt?: number;
}

/**
 * Input for injecting a fault (without id field)
 */
export type FaultInput = Omit<FaultDefinition, 'id' | 'priority'> & {
  priority?: number;
};

/**
 * Pre-defined fault templates for common training scenarios
 */
export const FAULT_TEMPLATES = {
  /**
   * Key expiration warning - Key approaching expiration
   */
  KEY_EXPIRATION_WARNING: {
    target: 'rx-payload' as FaultTarget,
    state: {
      decryptionKeyStatus: 'Pending Rotation' as const,
      decryptionExpiresInDays: 5,
    },
    priority: 10,
  },

  /**
   * Authentication tag failure - Decryption auth verification failed
   */
  AUTH_TAG_FAILURE: {
    target: 'rx-payload' as FaultTarget,
    state: {
      decryptionAuthTagVerified: false,
      decryptionSuccess: false,
      channelStatus: 'Critical' as const,
    },
    priority: 20,
  },

  /**
   * Frame sync loss - No frame synchronization lock
   */
  FRAME_SYNC_LOSS: {
    target: 'rx-payload' as FaultTarget,
    state: {
      frameSyncLocked: false,
      channelStatus: 'No Lock' as const,
    },
    priority: 30,
  },

  /**
   * High BER condition - Elevated bit error rate
   */
  HIGH_BER: {
    target: 'rx-payload' as FaultTarget,
    state: {
      ber: 1e-3,
      channelStatus: 'Degraded' as const,
      viterbiPathMetric: 0.6,
    },
    priority: 15,
  },

  /**
   * RS uncorrectable blocks - Reed-Solomon decoder overflow
   */
  RS_UNCORRECTABLE: {
    target: 'rx-payload' as FaultTarget,
    state: {
      rsUncorrectableBlocks: 50,
      channelStatus: 'Critical' as const,
    },
    priority: 25,
  },

  /**
   * Crypto bypass mode - Encryption bypassed (testing mode)
   */
  CRYPTO_BYPASS: {
    target: 'rx-payload' as FaultTarget,
    state: {
      decryptionMode: 'BYPASSED' as const,
    },
    priority: 10,
  },

  /**
   * TX source feed error
   */
  TX_SOURCE_ERROR: {
    target: 'tx-payload' as FaultTarget,
    state: {
      sourceFeedStatus: 'Error' as const,
    },
    priority: 20,
  },

  /**
   * TX buffer overflow warning
   */
  TX_BUFFER_HIGH: {
    target: 'tx-payload' as FaultTarget,
    state: {
      bufferUtilization: 92,
      bufferOverflows: 3,
    },
    priority: 15,
  },

  /**
   * TX encryption disabled
   */
  TX_ENCRYPTION_DISABLED: {
    target: 'tx-payload' as FaultTarget,
    state: {
      encryptionMode: 'DISABLED' as const,
    },
    priority: 25,
  },
} as const;

/**
 * Type for fault template keys
 */
export type FaultTemplateKey = keyof typeof FAULT_TEMPLATES;
