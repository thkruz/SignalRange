/**
 * @file Shared RX modem signal-quality grading (phase 19.5).
 *
 * One grading drives the Receiver Modems status bar, its card alarm badge,
 * the modem buttons and the signal badge, so the header colour, the status
 * text and the lock indicator can never disagree. It reads the receiver's own
 * lock tracker: lock needs the MODCOD's Es/N0 threshold (DVB-S2 QEF + 1 dB
 * implementation loss, `modcod.ts`), "degraded" is less than 1 dB of margin.
 */

import { LOCK_HYSTERESIS_DB } from './modcod';
import type { IQSignalInfo, ModemLockTransition } from './receiver';

/** Fixed label of the receiver low-margin warning (AlarmService re-exports it) */
export const DEGRADED_MARGIN_LABEL = 'Degraded margin';
/** Fixed label of the receiver lock-loss error (Phase 31 D1; AlarmService re-exports it) */
export const LOCK_LOST_LABEL = 'Carrier lock lost';

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

/**
 * "Es/N0 5.2 dB, locks at 5.5 dB" for an unlocked modem (Phase 30 D10,
 * nats-r5-s17-F2): the line it must clear to acquire is the MODCOD's required
 * Es/N0 plus the 0.5 dB acquisition hysteresis, so an unlocked modem never
 * reads "need 5.0" while sitting above 5.0. A locked modem keeps the
 * "need" form (it holds down to required - 0.5 dB).
 */
export function describeEsN0ForAcquisition(info: IQSignalInfo): string {
  const esN0 = info.effectiveEsN0_dB;
  const need = info.requiredEsN0_dB;
  if (esN0 === undefined || !Number.isFinite(esN0) || need === undefined || !Number.isFinite(need)) {
    return describeEsN0(info);
  }
  return `Es/N0 ${esN0.toFixed(1)} dB, locks at ${(need + LOCK_HYSTERESIS_DB).toFixed(1)} dB`;
}

/** One modem's lock alarm: a fixed label, its severity and the modem's live line */
export interface ModemLockAlarm {
  severity: 'error' | 'warning';
  label: string;
  /** "Modem 1: no carrier", "Modem 2: Es/N0 5.6 dB, need 5.0 dB" */
  detail: string;
}

/**
 * The per-modem lock rule (Phase 34 D5, nats-r8-s24-F1), shared by the
 * Dashboard (AlarmService) and the RX modem card so both read one verdict:
 * - "Carrier lock lost" (error) for a modem that had lock on its current
 *   tuning and has dropped it (`transition` from `Receiver.getLockTransition`,
 *   read after `getSignalsInBandwidth` advanced the tracker).
 * - "Degraded margin" (warning) for a modem locked with less than 1 dB of
 *   Es/N0 over Required (the lock tracker's own low-margin flag).
 * Null otherwise, including a modem that never had lock on this tuning.
 * Callers skip modems that are powered off.
 */
export function modemLockAlarm(modemNumber: number, info: IQSignalInfo, transition: ModemLockTransition | null): ModemLockAlarm | null {
  if (!info.hasLock && transition?.hadLock && transition.lockLostAtMs !== null) {
    return {
      severity: 'error',
      label: LOCK_LOST_LABEL,
      detail: `Modem ${modemNumber}: ${info.hasCarrier ? describeEsN0ForAcquisition(info) : 'no carrier'}`,
    };
  }
  if (info.hasCarrier && info.hasLock && info.isLowMargin) {
    return { severity: 'warning', label: DEGRADED_MARGIN_LABEL, detail: `Modem ${modemNumber}: ${describeEsN0(info)}` };
  }
  return null;
}

/**
 * A modem's live line for a lock alarm that has gone (AlarmService clear
 * line): "Modem 1: Es/N0 9.3 dB, need 5.0 dB" or "Modem 1: no carrier"
 */
export function modemLiveDetail(modemNumber: number, info: IQSignalInfo): string {
  return `Modem ${modemNumber}: ${info.hasCarrier ? describeEsN0(info) : 'no carrier'}`;
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
  // 'Degraded' is the FEC's low-margin flag, which the margin grade already
  // shows; repeating it here put "Payload degraded" beside a GOOD badge for a
  // tick after the margin recovered (Phase 33 D4, nats-r8-s21-F1)
  return null;
}

/** How loudly the modem card speaks: the status bar alert and the card LED share it */
export type RxModemSeverity = 'success' | 'info' | 'warning' | 'error';

/**
 * The RX modem card's one verdict (Phase 33 D4, nats-r8-s05-F2, nats-r8-s21-F1):
 * the Signal Quality badge, the status bar and the card LED all read this, so
 * the card can never show GOOD beside an amber LED or a payload warning.
 */
export interface RxModemVerdict {
  /** The margin grade from the lock tracker */
  grade: RxSignalQuality;
  /** `status-badge-*` class for the Signal Quality badge */
  badgeClass: string;
  /** Signal Quality badge text */
  badgeText: string;
  /** Status bar text */
  statusText: string;
  /** Status bar alert level and card LED severity ('success' = no alarm) */
  severity: RxModemSeverity;
  /** The card LED's alarm line, null when the modem has nothing to report */
  alarmMessage: string | null;
}

/** Badge class and text for each signal grade */
const QUALITY_BADGES: Record<RxSignalQuality, [string, string]> = {
  good: ['status-badge-good', 'Good'],
  degraded: ['status-badge-degraded', 'Degraded'],
  acquiring: ['status-badge-degraded', 'Acquiring'],
  'format-mismatch': ['status-badge-error', 'Mismatch'],
  'bandwidth-clipped': ['status-badge-error', 'Clipped'],
  'below-threshold': ['status-badge-error', 'No Lock'],
};

/** " - 2 interferer(s) in band", or '' with none */
function describeInterferers(info: IQSignalInfo): string {
  const count = info.interferenceCount ?? 0;
  return count > 0 ? ` - ${count} interferer(s) in band` : '';
}

/**
 * Grade a modem with a carrier (callers check `hasCarrier` first) together
 * with the payload decoder's problem from `describePayloadProblem`. A payload
 * problem at a good margin turns the whole card amber. An interferer is named
 * only while it costs margin: an in-band carrier at a good margin (a notched
 * spike still clears the -10 dB presence gate) is no alarm. The degraded
 * LED line is the Dashboard's "Degraded margin - Modem N: ..." plus the
 * interferer suffix (Phase 34 D6, nats-r9-s21-F2).
 */
export function rxModemVerdict(modemNumber: number, info: IQSignalInfo, payloadProblem: string | null): RxModemVerdict {
  const grade = classifyRxSignal(info);
  const [badgeClass, badgeText] = QUALITY_BADGES[grade];
  const esN0Text = describeEsN0(info);
  // Unlocked: quote the acquire line (required + 0.5 dB), not "need" (Phase 30 D10)
  const acquireText = describeEsN0ForAcquisition(info);
  const cn = info.effectiveCnRatio_dB ?? info.cnRatio_dB;
  const cnText = Number.isFinite(cn) ? cn.toFixed(1) : '--';

  switch (grade) {
    case 'good':
      if (payloadProblem) {
        return {
          grade,
          badgeClass: QUALITY_BADGES.degraded[0],
          badgeText: QUALITY_BADGES.degraded[1],
          statusText: `Signal locked - ${payloadProblem} (${esN0Text})`,
          severity: 'warning',
          alarmMessage: payloadProblem,
        };
      }
      return { grade, badgeClass, badgeText, statusText: `Signal locked - Good margin (${esN0Text})`, severity: 'success', alarmMessage: null };
    case 'degraded': {
      const interferers = describeInterferers(info);
      return {
        grade,
        badgeClass,
        badgeText,
        statusText: `Signal locked - ${DEGRADED_MARGIN_LABEL} (${esN0Text})${interferers}`,
        severity: 'warning',
        alarmMessage: `${DEGRADED_MARGIN_LABEL} - Modem ${modemNumber}: ${esN0Text}${interferers}`,
      };
    }
    case 'acquiring':
      return {
        grade,
        badgeClass,
        badgeText,
        statusText: `Acquiring lock (${acquireText})`,
        severity: 'info',
        alarmMessage: `Acquiring lock (${acquireText})`,
      };
    case 'format-mismatch':
      // The carrier is there; the modem's modulation/FEC labels are wrong
      return {
        grade,
        badgeClass,
        badgeText,
        statusText: `Carrier present, no lock - Format mismatch: check modulation and FEC (C/N: ${cnText} dB)`,
        severity: 'error',
        alarmMessage: 'No lock: format mismatch (modulation/FEC)',
      };
    case 'bandwidth-clipped':
      return {
        grade,
        badgeClass,
        badgeText,
        statusText: `Carrier present, no lock - Bandwidth clipped by the IF filter (C/N: ${cnText} dB)`,
        severity: 'error',
        alarmMessage: 'No lock: carrier clipped by the IF filter',
      };
    default:
      return {
        grade,
        badgeClass,
        badgeText,
        statusText: `Signal no lock - Below threshold (${acquireText})`,
        severity: 'error',
        alarmMessage: `No lock: below threshold (${acquireText})`,
      };
  }
}
