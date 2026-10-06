/**
 * Local-oscillator frequency error and phase noise (Phase 19.6).
 *
 * The reference chain: the GPSDO's 10 MHz has a fractional frequency error y
 * (locked: parts in 10¹², holdover: grows with oscillator ageing, spoofed:
 * follows the spoofer's time ramp). A converter whose synthesiser is locked to
 * that reference puts the same fractional error on its LO: Δf = y · f_LO. A
 * converter that is not locked (no reference, or its PLL has a fault) runs on
 * its own internal oscillator, whose error is a slow random walk in ppm per
 * square-root hour, seeded and advanced on SimClock run time.
 *
 * Phase noise is a single-sideband plateau L₀ (dBc/Hz) out to a 10 kHz corner,
 * falling 20 dB/decade beyond it. The demodulator's carrier-recovery loop
 * tracks everything inside its bandwidth (Rs × 10⁻⁴, at least 100 Hz); what
 * is left between that and Rs/2 is a phase jitter σ² that limits the SNR to
 * 1/σ². Its penalty is small for a locked LO and real for a free-running one.
 */

import type { RngStream } from '@app/simulation/rng';

/** Phase-noise profile corner, Hz (plateau below, 1/f² above) */
export const PHASE_NOISE_CORNER_HZ = 10e3;
/** Carrier-recovery loop bandwidth as a fraction of the symbol rate */
export const CARRIER_LOOP_FRACTION = 1e-4;
/** Narrowest carrier-recovery loop, Hz */
export const MIN_CARRIER_LOOP_HZ = 100;

/** LO phase-noise plateaus, dBc/Hz (class values, DEV-RF-02/-03) */
export const LO_PHASE_NOISE_DBC_HZ = {
  /** Synthesiser locked to a disciplined 10 MHz reference */
  locked: -95,
  /** BUC synthesiser on its internal reference */
  bucUnlocked: -75,
  /** LNB PLL with its reference lost: the VCO free-runs and hunts */
  lnbUnlocked: -60,
} as const;

/**
 * Integrated double-sideband phase jitter (rad²) the demodulator cannot track,
 * for a plateau `plateauDbcHz` and a carrier of `symbolRateHz`.
 */
export function residualPhaseJitterRad2(plateauDbcHz: number, symbolRateHz: number): number {
  if (!Number.isFinite(plateauDbcHz) || !(symbolRateHz > 0)) {
    return 0;
  }
  const l0 = 10 ** (plateauDbcHz / 10);
  const fc = PHASE_NOISE_CORNER_HZ;
  const f1 = Math.max(MIN_CARRIER_LOOP_HZ, symbolRateHz * CARRIER_LOOP_FRACTION);
  const f2 = Math.max(f1, symbolRateHz / 2);
  // ∫ L(f) df from f1 to f2: plateau to the corner, then L0 (fc/f)²
  let integral = 0;
  if (f1 < fc) {
    integral += l0 * (Math.min(fc, f2) - f1);
  }
  if (f2 > fc) {
    const lo = Math.max(fc, f1);
    integral += l0 * fc * fc * (1 / lo - 1 / f2);
  }

  return 2 * integral;
}

/** SNR ceiling (dB) a phase-noise plateau puts on a carrier of this symbol rate. */
export function phaseNoiseSnrLimitDb(plateauDbcHz: number, symbolRateHz: number): number {
  const sigma2 = residualPhaseJitterRad2(plateauDbcHz, symbolRateHz);

  return sigma2 > 0 ? -10 * Math.log10(sigma2) : Number.POSITIVE_INFINITY;
}

/** Power sum of several phase-noise plateaus (dBc/Hz); undefined entries ignored. */
export function combinePhaseNoiseDbcHz(...plateaus: Array<number | undefined>): number | undefined {
  let sum = 0;
  for (const p of plateaus) {
    if (p !== undefined && Number.isFinite(p)) {
      sum += 10 ** (p / 10);
    }
  }

  return sum > 0 ? 10 * Math.log10(sum) : undefined;
}

/**
 * A free-running oscillator's fractional frequency error, ppm: a seeded
 * random walk (σ ppm per √hour) that starts at a seeded offset when the
 * oscillator stops being disciplined, bounded softly at ±limitPpm by a weak
 * pull back toward zero (a real DRO/TCXO stays inside its temperature spec).
 */
export class FreeRunDrift {
  private ppm_ = 0;
  private running_ = false;

  constructor(
    private readonly rng_: () => RngStream,
    private readonly randomWalkPpmPerSqrtHour: number,
    private readonly initialSpreadPpm: number,
    private readonly limitPpm: number
  ) {}

  /** Current error, ppm (0 while disciplined). */
  get ppm(): number {
    return this.running_ ? this.ppm_ : 0;
  }

  get isRunning(): boolean {
    return this.running_;
  }

  /** The oscillator lost its discipline: draw the starting offset. */
  start(): void {
    if (this.running_) {
      return;
    }
    this.running_ = true;
    this.ppm_ = this.rng_().uniform(-1, 1) * this.initialSpreadPpm;
  }

  /** Disciplined again: the error is the reference's from here on. */
  stop(): void {
    this.running_ = false;
    this.ppm_ = 0;
  }

  /** Advance by dt seconds of run time. */
  step(dtS: number): void {
    if (!this.running_ || !(dtS > 0)) {
      return;
    }
    const sigma = this.randomWalkPpmPerSqrtHour * Math.sqrt(dtS / 3600);
    // Weak restoring pull (time constant 6 h) that keeps the walk inside spec
    const pull = -this.ppm_ * (dtS / (6 * 3600));
    this.ppm_ += pull + sigma * this.rng_().gaussian();
    this.ppm_ = Math.max(-this.limitPpm, Math.min(this.limitPpm, this.ppm_));
  }
}
