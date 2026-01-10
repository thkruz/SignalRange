/**
 * @file FEC Simulator Module
 * @description Simulates Forward Error Correction (FEC) metrics based on signal quality.
 *
 * Calculates realistic BER, Viterbi decoder metrics, and Reed-Solomon decoder
 * statistics from carrier-to-noise ratio and modulation parameters.
 */

import { ModulationType, FECType } from '@app/types';

/**
 * Input parameters for FEC simulation
 */
export interface FECSimulatorInput {
  /** Carrier-to-noise ratio in dB */
  cnRatio_dB: number;
  /** Effective C/N after ADC degradation */
  effectiveCnRatio_dB?: number;
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
  /** Bit Error Rate (pre-FEC) */
  ber: number;
  /** Viterbi decoder confidence metric (0.0-1.0) */
  viterbiPathMetric: number;
  /** RS errors corrected in current frame */
  rsCorrectedErrors: number;
  /** RS errors corrected total (session cumulative) */
  rsCorrectedTotal: number;
  /** RS uncorrectable blocks in recent window (for status determination) */
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
 * FEC Simulator - Calculates realistic FEC metrics from signal quality
 *
 * Uses theoretical BER curves adjusted for modulation type and FEC coding gain
 * to produce realistic decoder statistics for training simulation.
 */
export class FECSimulator {
  // Cumulative counters (persist across updates)
  private rsCorrectedTotal_: number = 0;
  private rsUncorrectableTotal_: number = 0;

  // Recent uncorrectable blocks (decays when signal is good)
  private rsUncorrectableRecent_: number = 0;

  // Smoothing for display stability
  private smoothedBer_: number = 1e-12;
  private smoothedViterbi_: number = 0.95;

  // Timing for rate calculations
  private lastUpdateTime_: number = Date.now();
  private framesPerSecond_: number = 125; // Default frame rate

  // Fault injection overrides
  private overrides_: FECOverrides = {};

  /**
   * Modulation offsets for Eb/N0 calculation (dB)
   * Higher order modulations require higher C/N for same BER
   */
  private static readonly MODULATION_OFFSETS: Record<ModulationType, number> = {
    'BPSK': 0,      // 1 bit/symbol - most robust
    'QPSK': 3,      // 2 bits/symbol
    '8QAM': 5.5,    // 3 bits/symbol
    '16QAM': 7,     // 4 bits/symbol - least robust
    'null': 0,
  };

  /**
   * FEC coding gain (dB) - improves effective C/N
   * Lower rate codes have more redundancy and better correction
   */
  private static readonly FEC_CODING_GAIN: Record<FECType, number> = {
    '1/2': 5.0,    // 50% redundancy - best correction
    '2/3': 4.0,    // 33% redundancy
    '3/4': 3.0,    // 25% redundancy
    '5/6': 2.0,    // 17% redundancy
    '7/8': 1.5,    // 12.5% redundancy - least correction
    'null': 0,
  };

  /**
   * Calculate FEC metrics from signal parameters
   */
  calculate(input: FECSimulatorInput): FECMetrics {
    const now = Date.now();
    const deltaTime = now - this.lastUpdateTime_;
    this.lastUpdateTime_ = now;

    const effectiveCn = input.effectiveCnRatio_dB ?? input.cnRatio_dB;

    // Calculate base metrics
    const frameSyncLocked = this.calculateFrameSync_(input, effectiveCn);
    const rawBer = this.calculateRawBer_(effectiveCn, input.modulation);
    const rawViterbi = this.calculateRawViterbiMetric_(effectiveCn, input.fec);

    // Update smoothed values for display (side effect updates internal state)
    this.calculateBer_(effectiveCn, input.modulation);
    this.calculateViterbiMetric_(effectiveCn, input.fec);

    // Update RS counters (use smoothed BER for realistic accumulation)
    this.updateReedSolomon_(this.smoothedBer_, deltaTime);

    // Determine channel status using RAW metrics for responsiveness
    // (smoothed values are for display stability, not status determination)
    const channelStatus = this.determineChannelStatus_(
      frameSyncLocked,
      rawBer,
      rawViterbi,
      this.rsUncorrectableRecent_
    );

    // Calculate data rate based on modulation and FEC
    const dataRate = this.calculateDataRate_(input.modulation, input.fec);

    // Apply overrides (fault injection) and return
    return {
      frameSyncLocked: this.overrides_.frameSyncLocked ?? frameSyncLocked,
      ber: this.overrides_.ber ?? this.smoothedBer_,
      viterbiPathMetric: this.overrides_.viterbiPathMetric ?? this.smoothedViterbi_,
      rsCorrectedErrors: this.overrides_.rsCorrectedErrors ?? Math.round(this.smoothedBer_ * 255 * 8),
      rsCorrectedTotal: this.rsCorrectedTotal_,
      rsUncorrectableBlocks: this.overrides_.rsUncorrectableBlocks ?? this.rsUncorrectableRecent_,
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
    this.rsUncorrectableRecent_ = 0;
    this.smoothedBer_ = 1e-12;
    this.smoothedViterbi_ = 0.95;
    this.overrides_ = {};
  }

  /**
   * Calculate frame sync lock status
   *
   * Frame sync requires carrier, modem lock, and BER below threshold
   * for reliable sync pattern detection
   */
  private calculateFrameSync_(input: FECSimulatorInput, effectiveCn: number): boolean {
    // No carrier = no sync
    if (!input.hasCarrier) return false;

    // No modem lock = no sync
    if (!input.hasLock) return false;

    // BER too high for reliable sync pattern detection
    // At BER > 1e-3, 32-bit sync pattern has ~3% chance of bit error
    const ber = this.calculateRawBer_(effectiveCn, input.modulation);
    if (ber > 1e-3) return false;

    return true;
  }

  /**
   * Calculate Bit Error Rate from C/N ratio
   *
   * Uses complementary error function (erfc) approximation:
   * - BPSK: BER = 0.5 * erfc(sqrt(Eb/N0))
   * - QPSK: Similar for Gray-coded QPSK
   * - Higher order: Approximated with modulation offset
   *
   * Returns smoothed value for display stability
   */
  private calculateBer_(cnRatio_dB: number, modulation: ModulationType): number {
    const rawBer = this.calculateRawBer_(cnRatio_dB, modulation);

    // Exponential moving average for smooth display
    const alpha = 0.1; // Smoothing factor
    this.smoothedBer_ = alpha * rawBer + (1 - alpha) * this.smoothedBer_;

    return this.smoothedBer_;
  }

  /**
   * Calculate raw (unsmoothed) BER
   */
  private calculateRawBer_(cnRatio_dB: number, modulation: ModulationType): number {
    // Convert C/N to Eb/N0 using modulation offset
    const offset = FECSimulator.MODULATION_OFFSETS[modulation] ?? 0;
    const ebN0_dB = cnRatio_dB - offset;
    const ebN0_linear = Math.pow(10, ebN0_dB / 10);

    // BER using erfc approximation
    // erfc(x) ≈ exp(-x²) / (x * sqrt(π)) for large x
    const x = Math.sqrt(ebN0_linear);
    let ber: number;

    if (x < 0.1) {
      // Very low C/N - essentially random
      ber = 0.5;
    } else if (x > 4) {
      // High C/N - use approximation to avoid numerical issues
      ber = Math.exp(-x * x) / (x * Math.sqrt(Math.PI)) / 2;
    } else {
      // Normal range - use erfc approximation
      ber = 0.5 * this.erfc_(x);
    }

    // Clamp to realistic range
    return Math.max(1e-12, Math.min(0.5, ber));
  }

  /**
   * Complementary error function approximation
   * Abramowitz and Stegun approximation (7.1.26)
   */
  private erfc_(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign === 1 ? 1 - y : 1 + y;
  }

  /**
   * Calculate raw (unsmoothed) Viterbi metric for status determination
   */
  private calculateRawViterbiMetric_(cnRatio_dB: number, fec: FECType): number {
    const codingGain = FECSimulator.FEC_CODING_GAIN[fec] ?? 0;
    const effectiveCn = cnRatio_dB + codingGain;
    const rawMetric = 1 / (1 + Math.exp(-0.3 * (effectiveCn - 8)));
    return Math.max(0.1, Math.min(0.99, rawMetric));
  }

  /**
   * Calculate Viterbi decoder path metric
   *
   * The path metric indicates decoder confidence:
   * - 1.0: Perfect decoding, high C/N
   * - 0.8-0.95: Normal operation
   * - 0.5-0.8: Degraded, decoder working hard
   * - <0.5: Near failure
   *
   * Returns smoothed value for display stability
   */
  private calculateViterbiMetric_(cnRatio_dB: number, fec: FECType): number {
    const clampedMetric = this.calculateRawViterbiMetric_(cnRatio_dB, fec);

    // Exponential moving average
    const alpha = 0.15;
    this.smoothedViterbi_ = alpha * clampedMetric + (1 - alpha) * this.smoothedViterbi_;

    return this.smoothedViterbi_;
  }

  /**
   * Update Reed-Solomon decoder counters
   *
   * RS(255,223) can correct up to 16 symbol errors per codeword.
   * Higher BER = more corrections needed per frame.
   * When corrections exceed capacity = uncorrectable block.
   */
  private updateReedSolomon_(ber: number, deltaTime_ms: number): void {
    // Symbol error rate is roughly 8x BER for 8-bit symbols
    const symbolErrorRate = ber * 8;

    // Expected errors per codeword (255 symbols)
    const errorsPerCodeword = symbolErrorRate * 255;

    // RS(255,223) can correct up to 16 errors
    const rsCapacity = 16;

    // Calculate frames processed in this interval
    const frames = Math.max(1, (deltaTime_ms / 1000) * this.framesPerSecond_);

    if (errorsPerCodeword < rsCapacity) {
      // Normal operation: accumulate corrections
      const correctionsThisInterval = Math.round(errorsPerCodeword * frames);
      this.rsCorrectedTotal_ += correctionsThisInterval;

      // Decay recent uncorrectable counter when signal is good
      // Clear after ~3 seconds of good signal
      const decayRate = deltaTime_ms / 3000;
      this.rsUncorrectableRecent_ = Math.max(0, this.rsUncorrectableRecent_ - decayRate * this.rsUncorrectableRecent_);

      // Clear completely when very small
      if (this.rsUncorrectableRecent_ < 0.1) {
        this.rsUncorrectableRecent_ = 0;
      }
    } else {
      // Exceeds capacity: uncorrectable blocks occur
      const excessRate = Math.min(1, (errorsPerCodeword - rsCapacity) / rsCapacity);
      const uncorrectableThisInterval = Math.round(excessRate * frames);

      // Add to both recent and total counters
      this.rsUncorrectableRecent_ += uncorrectableThisInterval;
      this.rsUncorrectableTotal_ += uncorrectableThisInterval;

      // Still accumulate some corrections (up to capacity)
      this.rsCorrectedTotal_ += Math.round(rsCapacity * frames);
    }
  }

  /**
   * Determine overall channel status from metrics
   *
   * Thresholds based on typical SATCOM operational standards:
   * - Good: BER < 1e-5, strong Viterbi confidence
   * - Degraded: BER 1e-5 to 1e-3, moderate Viterbi confidence
   * - Critical: BER > 1e-3, poor Viterbi, or uncorrectable blocks
   * - No Lock: No frame synchronization
   */
  private determineChannelStatus_(
    frameSyncLocked: boolean,
    ber: number,
    viterbiMetric: number,
    rsUncorrectable: number
  ): 'Good' | 'Degraded' | 'Critical' | 'No Lock' {
    // No frame sync = No Lock
    if (!frameSyncLocked) {
      return 'No Lock';
    }

    // RS uncorrectable blocks = Critical (data corruption occurring)
    if (rsUncorrectable > 0) {
      return 'Critical';
    }

    // High BER (>0.1%) or very low Viterbi = Critical
    if (ber > 1e-3 || viterbiMetric < 0.4) {
      return 'Critical';
    }

    // Elevated BER (>0.001%) or degraded Viterbi = Degraded
    if (ber > 1e-5 || viterbiMetric < 0.6) {
      return 'Degraded';
    }

    return 'Good';
  }

  /**
   * Calculate approximate data rate from modulation and FEC
   */
  private calculateDataRate_(modulation: ModulationType, fec: FECType): string {
    // Bits per symbol
    const bitsPerSymbol: Record<ModulationType, number> = {
      'BPSK': 1,
      'QPSK': 2,
      '8QAM': 3,
      '16QAM': 4,
      'null': 0,
    };

    // FEC efficiency (data bits / total bits)
    const fecEfficiency: Record<FECType, number> = {
      '1/2': 0.5,
      '2/3': 0.667,
      '3/4': 0.75,
      '5/6': 0.833,
      '7/8': 0.875,
      'null': 1.0,
    };

    // Assume 2.048 Msps symbol rate (common SATCOM)
    const symbolRate = 2.048e6;
    const bits = bitsPerSymbol[modulation] ?? 2;
    const efficiency = fecEfficiency[fec] ?? 0.5;

    const dataRate = symbolRate * bits * efficiency;

    // Format for display
    if (dataRate >= 1e6) {
      return `${(dataRate / 1e6).toFixed(3)} Mbps`;
    } else if (dataRate >= 1e3) {
      return `${(dataRate / 1e3).toFixed(1)} kbps`;
    }
    return `${dataRate.toFixed(0)} bps`;
  }
}
