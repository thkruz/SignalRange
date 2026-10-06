/**
 * @file Shared RX modem signal-quality thresholds.
 *
 * One table drives the Receiver Modems status bar, its card alarm badge and
 * anything else that grades modem C/N, so the header colour and the status
 * text can never disagree.
 */

/** Effective C/N thresholds (dB) for the RX modem quality bands. */
export const RX_CN_THRESHOLDS = {
  /** Locked at or above this C/N: good margin. */
  goodMargin: 8,
  /** Locked at or above this C/N (and below goodMargin): degraded margin. */
  degradedMargin: 5,
  /** At or above this C/N (and below degradedMargin, or unlocked): near threshold. */
  nearThreshold: 3,
} as const;

export type RxSignalQuality = 'good' | 'degraded' | 'near-threshold' | 'below-threshold';

/**
 * Grade the modem's signal from its lock state and effective C/N.
 * Unlocked carriers are never better than near-threshold.
 */
export function classifyRxSignal(hasLock: boolean, effectiveCn_dB: number): RxSignalQuality {
  if (hasLock && effectiveCn_dB >= RX_CN_THRESHOLDS.goodMargin) {
    return 'good';
  }
  if (hasLock && effectiveCn_dB >= RX_CN_THRESHOLDS.degradedMargin) {
    return 'degraded';
  }
  if (effectiveCn_dB >= RX_CN_THRESHOLDS.nearThreshold) {
    return 'near-threshold';
  }
  return 'below-threshold';
}

/** Summary of the payload decoder that the modem status must not contradict. */
export interface RxPayloadStatus {
  frameSyncLocked: boolean;
  rsUncorrectableBlocks: number;
  channelStatus: 'Good' | 'Degraded' | 'Critical' | 'No Lock';
}

/**
 * Describe a payload problem that should stop the modem claiming a good margin,
 * or null when the payload is healthy.
 */
export function describePayloadProblem(payload: RxPayloadStatus | null): string | null {
  if (!payload) {
    return null;
  }
  if (!payload.frameSyncLocked || payload.channelStatus === 'No Lock') {
    return 'Frame sync lost';
  }
  if (payload.rsUncorrectableBlocks > 0) {
    return 'RS overload';
  }
  if (payload.channelStatus === 'Critical') {
    return 'Payload errors';
  }
  if (payload.channelStatus === 'Degraded') {
    return 'Payload degraded';
  }
  return null;
}
