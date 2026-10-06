import { SimClock } from '@app/simulation/sim-clock';
/**
 * @file FEC Simulator Module
 * @description Payload decoder metrics from the coded error curves (phase 19.5).
 *
 * The modem's MODCOD (`modcod.ts`) fixes the frame-error rate at the carrier's
 * Es/N0: PER from the DVB-S2 waterfall, decoded BER = PER x pre-FEC BER,
 * frames lost per second = PER x frames/s. Frame sync needs modem lock and a
 * PER below 0.1. The panel's concatenated-decoder view (an inner "Viterbi"
 * decoder and an outer RS(255,223)) is a teaching display of those numbers:
 * an RS block fails when more than 16 of its 255 symbols are wrong, and the
 * RS input symbol-error rate is the one whose binomial tail equals the PER.
 */

import { FECType, ModulationType } from '@app/types';
import { codedPer, DEGRADED_MARGIN_DB, DVB_S2_ROLL_OFF, framesPerSecond, informationRateBps, Modcod, modcodFor, uncodedBer } from './modcod';
import type { IQSignalInfo } from './receiver';

/**
 * Input parameters for FEC simulation
 */
export interface FECSimulatorInput {
  /** Carrier-to-noise ratio in dB (in the modem bandwidth) */
  cnRatio_dB: number;
  /** Effective C/N after ADC degradation */
  effectiveCnRatio_dB?: number;
  /** Es/N0 after the ADC, dB (from the receiver; derived from C/N when absent) */
  effectiveEsN0_dB?: number;
  /** Symbol rate of the carrier, Hz (sets frames per second and the data rate) */
  symbolRate_Hz?: number;
  /** Locked with less than 1 dB of margin (the receiver's hysteresis); derived when absent */
  isLowMargin?: boolean;
  /** Carrier present on spectrum */
  hasCarrier: boolean;
  /** Modem has achieved demodulation lock */
  hasLock: boolean;
  /** Modulation type */
  modulation: ModulationType;
  /** FEC code rate */
  fec: FECType;
}

/**
 * Output FEC metrics
 */
export interface FECMetrics {
  /** Frame synchronization lock status */
  frameSyncLocked: boolean;
  /** Decoded (post-FEC) bit error rate, smoothed for display */
  ber: number;
  /** Channel (pre-FEC) bit error rate at the carrier's Es/N0 */
  preFecBer: number;
  /** Frame (packet) error rate from the coded curve */
  per: number;
  /** Viterbi decoder confidence metric (0.0-1.0) */
  viterbiPathMetric: number;
  /** RS errors corrected in current frame */
  rsCorrectedErrors: number;
  /** RS errors corrected total (session cumulative) */
  rsCorrectedTotal: number;
  /** RS uncorrectable blocks in the last second (for status determination) */
  rsUncorrectableBlocks: number;
  /** RS uncorrectable blocks total (session cumulative) */
  rsUncorrectableTotal: number;
  /** Overall channel status */
  channelStatus: 'Good' | 'Degraded' | 'Critical' | 'No Lock';
  /** Data rate string for display */
  dataRate: string;
}

/**
 * Override values for fault injection
 */
export interface FECOverrides {
  frameSyncLocked?: boolean;
  ber?: number;
  viterbiPathMetric?: number;
  rsCorrectedErrors?: number;
  rsUncorrectableBlocks?: number;
  channelStatus?: 'Good' | 'Degraded' | 'Critical' | 'No Lock';
}

/**
 * The decoder input for a modem from the receiver's measurement, so every
 * reader (payload panel, objective conditions) grades the same numbers.
 */
export function fecInputFromSignal(
  info: Pick<IQSignalInfo, 'cnRatio_dB' | 'effectiveCnRatio_dB' | 'effectiveEsN0_dB' | 'symbolRate_Hz' | 'isLowMargin' | 'hasCarrier' | 'hasLock'>,
  modem: { modulation: ModulationType; fec: FECType }
): FECSimulatorInput {
  return {
    cnRatio_dB: info.cnRatio_dB,
    effectiveCnRatio_dB: info.effectiveCnRatio_dB ?? info.cnRatio_dB,
    effectiveEsN0_dB: info.effectiveEsN0_dB,
    symbolRate_Hz: info.symbolRate_Hz,
    isLowMargin: info.hasLock ? (info.isLowMargin ?? false) : undefined,
    hasCarrier: info.hasCarrier,
    hasLock: info.hasLock,
    modulation: modem.modulation,
    fec: modem.fec,
  };
}

/** RS(255,223): symbols per block and correctable symbol errors */
const RS_N = 255;
const RS_T = 16;

/** Frame sync holds while fewer than this fraction of frames fail */
const FRAME_SYNC_MAX_PER = 0.1;
/** Frame errors at or above this rate make the channel Critical (about one a second or more) */
const CRITICAL_PER = 1e-3;
/** Any frame errors at all (QEF is 1e-7) make the channel Degraded */
const QEF_PER = 1e-7;

/** Symbol rate assumed when the caller does not know the carrier's (2.048 Msps, the old display rate) */
const DEFAULT_SYMBOL_RATE_HZ = 2.048e6;

/**
 * Binomial tail P(X > t) for n trials at probability p, summed from t + 1 up
 * (accurate for tiny tails).
 */
function binomialTail(n: number, t: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const q = 1 - p;
  // term(k) = C(n,k) p^k q^(n-k); start at k = t + 1 in log space
  let logC = 0;
  for (let i = 0; i < t + 1; i++) {
    logC += Math.log(n - i) - Math.log(i + 1);
  }
  let term = Math.exp(logC + (t + 1) * Math.log(p) + (n - t - 1) * Math.log(q));
  let sum = 0;
  for (let k = t + 1; k <= n; k++) {
    sum += term;
    if (term < sum * 1e-16) break;
    term *= ((n - k) / (k + 1)) * (p / q);
  }
  return Math.min(1, sum);
}

/** RS input symbol-error rate whose block-failure probability equals `per` (bisection in log p). */
export function rsSymbolErrorRateForPer(per: number): number {
  if (per <= 0) return 0;
  const target = Math.min(per, 0.999);
  let lo = -15;
  let hi = Math.log10(0.5);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (binomialTail(RS_N, RS_T, 10 ** mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 10 ** ((lo + hi) / 2);
}

/**
 * FEC Simulator - payload decoder metrics from the modem's MODCOD curves.
 */
export class FECSimulator {
  // Cumulative counters (persist across updates)
  private rsCorrectedTotal_: number = 0;
  private rsUncorrectableTotal_: number = 0;
  /** Fractional uncorrectable blocks carried to the next sample (deterministic counting) */
  private uncorrectableCarry_: number = 0;

  // Smoothing for display stability
  private smoothedBer_: number = 1e-12;
  private smoothedViterbi_: number = 0.95;
  /** True until the first sample seeds the smoothed values. */
  private isFirstSample_: boolean = true;
  /** Modem lock state on the previous sample, to detect lock acquisition. */
  private lastHasLock_: boolean = false;

  /**
   * Time constant (ms) of the BER / Viterbi display smoothing. Time-based so
   * the readout settles in a few seconds whatever the update rate. The
   * channel status and the frame counts use the instantaneous curve.
   */
  static readonly SMOOTHING_TAU_MS = 2500;

  private lastUpdateTime_: number = SimClock.runMs();

  // Fault injection overrides
  private overrides_: FECOverrides = {};

  /**
   * Calculate FEC metrics from signal parameters
   */
  calculate(input: FECSimulatorInput): FECMetrics {
    const now = SimClock.runMs();
    // Clamped: run time restarts at 0 each scenario
    const deltaTime = Math.max(0, now - this.lastUpdateTime_);
    this.lastUpdateTime_ = now;

    const modcod = modcodFor(input.modulation, input.fec);
    const symbolRate = input.symbolRate_Hz ?? DEFAULT_SYMBOL_RATE_HZ;
    const esN0 = FECSimulator.esN0Of_(input);
    const isDecoding = input.hasCarrier && input.hasLock && modcod !== null;

    const per = isDecoding && modcod ? codedPer(esN0, modcod) : 1;
    const preFecBer = input.hasCarrier ? uncodedBer(esN0, input.modulation) : 0.5;
    const rawBer = isDecoding ? Math.max(1e-12, per * preFecBer) : 0.5;
    const rawViterbi = modcod && input.hasCarrier ? FECSimulator.viterbiMetric_(esN0, modcod) : 0.1;

    // On the first sample, or when the modem (re)acquires lock, seed the
    // smoothed metrics from the current signal instead of easing out of a
    // stale history: a fresh lock should not inherit the outage's BER.
    const isLockAcquired = input.hasLock && !this.lastHasLock_;
    this.lastHasLock_ = input.hasLock;
    if (this.isFirstSample_ || isLockAcquired) {
      this.isFirstSample_ = false;
      this.smoothedBer_ = rawBer;
      this.smoothedViterbi_ = rawViterbi;
      this.uncorrectableCarry_ = 0;
    }

    this.smoothBer_(rawBer, deltaTime);
    const alpha = FECSimulator.smoothingAlpha_(deltaTime);
    this.smoothedViterbi_ = alpha * rawViterbi + (1 - alpha) * this.smoothedViterbi_;

    const frameSyncLocked = isDecoding && per < FRAME_SYNC_MAX_PER;

    // Frame accounting: PER x frames/s, counted deterministically (whole
    // frames, the fraction carried to the next sample)
    const fps = modcod ? framesPerSecond(symbolRate, modcod) : 0;
    const frames = (deltaTime / 1000) * fps;
    let rsUncorrectableBlocks = 0;
    let rsCorrectedErrors = 0;
    if (frameSyncLocked) {
      this.uncorrectableCarry_ += per * frames;
      const whole = Math.floor(this.uncorrectableCarry_);
      this.uncorrectableCarry_ -= whole;
      this.rsUncorrectableTotal_ += whole;
      // "Recent" = the expected count over the last second
      rsUncorrectableBlocks = Math.round(per * fps);
      const symbolErrorRate = rsSymbolErrorRateForPer(per);
      rsCorrectedErrors = Math.min(RS_T, Math.round(RS_N * symbolErrorRate));
      this.rsCorrectedTotal_ += Math.round(RS_N * symbolErrorRate * frames);
    }

    const isLowMargin = input.isLowMargin ?? (modcod ? esN0 - modcod.thresholdEsN0Db < DEGRADED_MARGIN_DB : false);
    let channelStatus: FECMetrics['channelStatus'];
    if (!frameSyncLocked) {
      channelStatus = 'No Lock';
    } else if (per >= CRITICAL_PER || rsUncorrectableBlocks > 0) {
      channelStatus = 'Critical';
    } else if (per >= QEF_PER || isLowMargin) {
      channelStatus = 'Degraded';
    } else {
      channelStatus = 'Good';
    }

    const dataRate = FECSimulator.formatRate_(modcod ? informationRateBps(symbolRate, modcod) : 0);

    // Apply overrides (fault injection) and return
    return {
      frameSyncLocked: this.overrides_.frameSyncLocked ?? frameSyncLocked,
      ber: this.overrides_.ber ?? this.smoothedBer_,
      preFecBer,
      per,
      viterbiPathMetric: this.overrides_.viterbiPathMetric ?? this.smoothedViterbi_,
      rsCorrectedErrors: this.overrides_.rsCorrectedErrors ?? rsCorrectedErrors,
      rsCorrectedTotal: this.rsCorrectedTotal_,
      rsUncorrectableBlocks: this.overrides_.rsUncorrectableBlocks ?? rsUncorrectableBlocks,
      rsUncorrectableTotal: this.rsUncorrectableTotal_,
      channelStatus: this.overrides_.channelStatus ?? channelStatus,
      dataRate,
    };
  }

  /**
   * Set fault injection overrides
   */
  setOverrides(overrides: FECOverrides): void {
    this.overrides_ = { ...this.overrides_, ...overrides };
  }

  /**
   * Clear all overrides
   */
  clearOverrides(): void {
    this.overrides_ = {};
  }

  /**
   * Clear specific override
   */
  clearOverride(key: keyof FECOverrides): void {
    delete this.overrides_[key];
  }

  /**
   * Reset cumulative counters (e.g., on scenario change)
   */
  reset(): void {
    this.rsCorrectedTotal_ = 0;
    this.rsUncorrectableTotal_ = 0;
    this.uncorrectableCarry_ = 0;
    this.smoothedBer_ = 1e-12;
    this.smoothedViterbi_ = 0.95;
    this.isFirstSample_ = true;
    this.lastHasLock_ = false;
    this.overrides_ = {};
  }

  /** Es/N0 the decoder sees: the receiver's effective value, else C/N in the carrier's bandwidth + 10 log(1 + roll-off). */
  private static esN0Of_(input: FECSimulatorInput): number {
    if (input.effectiveEsN0_dB !== undefined && Number.isFinite(input.effectiveEsN0_dB)) {
      return input.effectiveEsN0_dB;
    }
    const cn = input.effectiveCnRatio_dB ?? input.cnRatio_dB;
    return cn + 10 * Math.log10(1 + DVB_S2_ROLL_OFF);
  }

  /**
   * Decoder confidence: a logistic in the Es/N0 over the MODCOD's ideal QEF
   * point (0.69 at the practical threshold, 0.95 at 4 dB over it).
   */
  private static viterbiMetric_(esN0Db: number, modcod: Modcod): number {
    const x = esN0Db - modcod.idealEsN0Db;
    const metric = 1 / (1 + Math.exp(-0.8 * x));
    return Math.max(0.1, Math.min(0.99, metric));
  }

  /**
   * Time-based exponential moving average for smooth display.
   * Rising BER: linear EMA, so errors show within a sample or two.
   * Falling BER: EMA in the log domain, so recovery clears in a few tau; a
   * linear EMA would hold a 4e-2 history above 1e-5 for ~20 s.
   */
  private smoothBer_(rawBer: number, deltaTime_ms: number): void {
    const alpha = FECSimulator.smoothingAlpha_(deltaTime_ms);
    if (rawBer >= this.smoothedBer_) {
      this.smoothedBer_ = alpha * rawBer + (1 - alpha) * this.smoothedBer_;
    } else {
      this.smoothedBer_ = 10 ** (alpha * Math.log10(rawBer) + (1 - alpha) * Math.log10(this.smoothedBer_));
    }
  }

  /** EMA weight for a sample taken deltaTime_ms after the previous one. */
  private static smoothingAlpha_(deltaTime_ms: number): number {
    return 1 - Math.exp(-Math.max(0, deltaTime_ms) / FECSimulator.SMOOTHING_TAU_MS);
  }

  /** Format an information rate for display */
  private static formatRate_(bps: number): string {
    if (bps >= 1e6) {
      return `${(bps / 1e6).toFixed(3)} Mbps`;
    } else if (bps >= 1e3) {
      return `${(bps / 1e3).toFixed(1)} kbps`;
    }
    return `${bps.toFixed(0)} bps`;
  }
}
