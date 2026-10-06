/**
 * @file Shared RX modem signal-quality grading (phase 19.5).
 *
 * One grading drives the Receiver Modems status bar, its card alarm badge,
 * the modem buttons and the signal badge, so the header colour, the status
 * text and the lock indicator can never disagree. It reads the receiver's own
 * lock tracker: lock needs the MODCOD's Es/N0 threshold (DVB-S2 QEF + 1 dB
 * implementation loss, `modcod.ts`), "degraded" is less than 1 dB of margin.
 */

import type { IQSignalInfo } from './receiver';

export type RxSignalQuality =
  /** Locked with at least 1 dB of margin */
  | 'good'
  /** Locked with less than 1 dB of margin */
  | 'degraded'
  /** Above threshold, waiting out the demodulator's acquisition time */
  | 'acquiring'
  /** Carrier present but its modulation/FEC labels differ from the modem's */
  | 'format-mismatch'
  /** Carrier present but the IF filter has cut it below what the FEC tolerates */
  | 'bandwidth-clipped'
  /** Carrier present, labels right, Es/N0 below what lock needs */
  | 'below-threshold';

/** Grade a modem's signal from its measurement (callers check `hasCarrier` first). */
export function classifyRxSignal(info: IQSignalInfo): RxSignalQuality {
  if (info.hasLock) {
    return info.isLowMargin ? 'degraded' : 'good';
  }
  if (info.formatMismatch) {
    return 'format-mismatch';
  }
  if (info.isBandwidthClipped) {
    return 'bandwidth-clipped';
  }
  if (info.lockState === 'acquiring') {
    return 'acquiring';
  }
  return 'below-threshold';
}

/** "Es/N0 9.3 dB, need 5.0 dB" for the status texts (or C/N when Es/N0 is unknown). */
export function describeEsN0(info: IQSignalInfo): string {
  const esN0 = info.effectiveEsN0_dB;
  const need = info.requiredEsN0_dB;
  if (esN0 === undefined || !Number.isFinite(esN0)) {
    const cn = info.effectiveCnRatio_dB ?? info.cnRatio_dB;
    return `C/N ${Number.isFinite(cn) ? cn.toFixed(1) : '--'} dB`;
  }
  if (need === undefined || !Number.isFinite(need)) {
    return `Es/N0 ${esN0.toFixed(1)} dB`;
  }
  return `Es/N0 ${esN0.toFixed(1)} dB, need ${need.toFixed(1)} dB`;
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
