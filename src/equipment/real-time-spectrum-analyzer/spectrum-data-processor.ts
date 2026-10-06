import { Rng, RngStream } from '@app/simulation/rng';
import { Hertz } from '@app/types';
import { RealTimeSpectrumAnalyzer } from './real-time-spectrum-analyzer';

/**
 * SpectrumDataProcessor - Centralized data generation for spectrum analysis
 *
 * This class separates data generation from rendering, ensuring that:
 * 1. Noise and signal data are generated once per update cycle
 * 2. The same data is shared by all renderers (spectral density, waterfall)
 * 3. Generated data can be synced across networked environments
 */
export class SpectrumDataProcessor {
  private readonly specA: RealTimeSpectrumAnalyzer;

  // Generated data arrays
  public noiseData: Float32Array;
  public signalData: Float32Array;
  public combinedData: Float32Array;

  // Current frequency range
  private minFreq: Hertz = 0 as Hertz;
  private maxFreq: Hertz = 0 as Hertz;
  private width: number;
  /** Display-noise stream; refreshed in generateData() */
  private rng_: RngStream = Rng.stream('display:spectrum');

  constructor(specA: RealTimeSpectrumAnalyzer, width: number) {
    this.specA = specA;
    this.width = width;

    // Initialize data arrays
    this.noiseData = new Float32Array(width);
    this.signalData = new Float32Array(width);
    this.combinedData = new Float32Array(width);
  }

  /**
   * Set the frequency range for data generation
   */
  setFrequencyRange(minFreq: Hertz, maxFreq: Hertz): void {
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
  }

  /**
   * Generate all spectrum data (noise + signals)
   * This should be called once per update cycle
   */
  generateData(): void {
    // Re-read each cycle: a scenario load re-seeds and replaces the stream
    this.rng_ = Rng.stream('display:spectrum');

    // Mean (expected) power per pixel, mW: signals through the RBW filter,
    // line noise and instrument noise, with any notch dip on the line
    this.computeMeanPower_();

    // Detector and video averaging over the log-detected noise
    this.detect_();
  }

  /** Per-pixel mean signal power (mW) */
  private signalMw_ = new Float64Array(0);
  /** Per-pixel mean line noise (mW) */
  private lineNoiseMw_ = new Float64Array(0);
  /** Instrument noise referred to the line (mW), flat */
  private instrumentNoiseMw_ = 0;

  /** Raised-cosine roll-off assumed for modulated carriers */
  private static readonly ROLL_OFF = 0.2;

  /** Cap on video averages per pixel (cost; beyond ~16 the trace is already smooth) */
  private static readonly MAX_VIDEO_AVERAGES = 16;

  /**
   * Expected power in the RBW at each pixel (Phase 19.2):
   *
   * - every carrier is convolved with the Gaussian RBW filter (-3 dB width =
   *   RBW, peak-normalised so a CW reads its power); a modulated carrier's
   *   spectrum is a raised cosine (roll-off 0.2), modelled as its symbol-rate
   *   rectangle smoothed by a Gaussian, so the convolution stays closed form;
   * - the line noise is flat at k·T·ENBW (with the chain gain), the
   *   instrument's own noise is added on top (both from the analyzer);
   * - an enabled notch dips the line (carriers and line noise) in its band.
   */
  private computeMeanPower_(): void {
    const width = this.width;
    if (this.signalMw_.length !== width) {
      this.signalMw_ = new Float64Array(width);
      this.lineNoiseMw_ = new Float64Array(width);
    }
    this.signalMw_.fill(0);

    const totalMw = 10 ** (this.specA.state.noiseFloorNoGain / 10);
    const lineMw = Number.isFinite(this.specA.lineNoiseDbm) ? 10 ** (this.specA.lineNoiseDbm / 10) : 0;
    this.instrumentNoiseMw_ = Math.max(0, totalMw - lineMw);
    this.lineNoiseMw_.fill(lineMw);

    const span = this.maxFreq - this.minFreq;
    if (!(span > 0)) {
      return;
    }
    const hzPerPixel = span / width;
    const sigmaRbw = this.specA.effectiveRbwHz / (2 * Math.sqrt(2 * Math.LN2));

    for (const signal of this.specA.inputSignals) {
      const powerMw = 10 ** (signal.power / 10);
      if (!(powerMw > 0)) {
        continue;
      }
      const occupied = Math.max(0, signal.bandwidth);
      const symbolRate = occupied / (1 + SpectrumDataProcessor.ROLL_OFF);
      const sigmaShape = (SpectrumDataProcessor.ROLL_OFF * symbolRate) / 2.56;
      const sigma = Math.sqrt(sigmaRbw ** 2 + sigmaShape ** 2);
      const reach = symbolRate / 2 + 5 * sigma;
      const startX = Math.max(0, Math.floor((signal.frequency - reach - this.minFreq) / hzPerPixel));
      const endX = Math.min(width - 1, Math.ceil((signal.frequency + reach - this.minFreq) / hzPerPixel));

      for (let x = startX; x <= endX; x++) {
        const f = this.minFreq + (x + 0.5) * hzPerPixel;
        this.signalMw_[x] += SpectrumDataProcessor.rbwResponse(powerMw, signal.frequency, symbolRate, sigmaRbw, sigma, f);
      }
    }

    this.applyNotch_(hzPerPixel);
  }

  /**
   * Power read in a Gaussian RBW filter (peak 1, -3 dB width = RBW) centred at
   * `f` from a carrier of total power `powerMw`: its symbol-rate rectangle
   * convolved with the filter and the roll-off smoothing (combined sigma).
   */
  static rbwResponse(powerMw: number, centre: number, symbolRate: number, sigmaRbw: number, sigma: number, f: number): number {
    const d = f - centre;
    if (symbolRate < sigma * 1e-3) {
      // A CW line: the filter's own shape
      return powerMw * (sigmaRbw / sigma) * Math.exp(-(d * d) / (2 * sigma * sigma));
    }
    const half = symbolRate / 2;
    const fraction = SpectrumDataProcessor.normalCdf_((d + half) / sigma) - SpectrumDataProcessor.normalCdf_((d - half) / sigma);

    return (powerMw / symbolRate) * sigmaRbw * Math.sqrt(2 * Math.PI) * fraction;
  }

  /** Standard normal CDF via erf (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7) */
  private static normalCdf_(z: number): number {
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);

    return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
  }

  /** An enabled notch dips the line (carriers and line noise) across its band */
  private applyNotch_(hzPerPixel: number): void {
    const notchFilterState = this.specA.rfFrontEnd_.notchFilterModule?.state;
    if (!notchFilterState?.isPowered) return;

    for (const notch of notchFilterState.notches) {
      if (!notch.enabled) continue;

      const lowHz = (notch.centerFrequency - notch.bandwidth / 2) * 1e6;
      const highHz = (notch.centerFrequency + notch.bandwidth / 2) * 1e6;
      const factor = 10 ** (-notch.depth / 10);
      for (let x = 0; x < this.width; x++) {
        const f = this.minFreq + (x + 0.5) * hzPerPixel;
        if (f >= lowHz && f <= highHz) {
          this.signalMw_[x] *= factor;
          this.lineNoiseMw_[x] *= factor;
        }
      }
    }
  }

  /**
   * Detection (Phase 19.2). Noise through a log detector is Rayleigh: its
   * power reading is exponential, which in dB has a 5.57 dB standard deviation
   * and reads 2.51 dB under the true power. Video filtering (VBW below RBW)
   * averages N = RBW / VBW such readings in the log domain; the average
   * detector averages power instead (no bias). A pixel spans
   * M = (span / width) / RBW independent bins: the sample detector shows one,
   * the peak detector the largest. Carriers add their mean power under the
   * noise before detection, so signal and noise combine as powers.
   */
  private detect_(): void {
    const state = this.specA.state;
    const detector = state.detector ?? 'sample';
    const rbw = this.specA.effectiveRbwHz;
    const span = this.maxFreq - this.minFreq;
    const binsPerPixel = Math.max(1, span / this.width / rbw);
    const videoAverages = Math.max(1, Math.min(SpectrumDataProcessor.MAX_VIDEO_AVERAGES, Math.round(rbw / this.specA.effectiveVbwHz)));
    const minDb = state.minAmplitude - 40;

    for (let x = 0; x < this.width; x++) {
      const signalMw = this.signalMw_[x] ?? 0;
      const noiseMw = (this.lineNoiseMw_[x] ?? 0) + this.instrumentNoiseMw_;

      let combined = 0;
      let noiseOnly = 0;
      if (detector === 'average') {
        // Power average over every bin and video sample: unbiased, narrow
        let sum = 0;
        for (let i = 0; i < videoAverages; i++) {
          sum += this.gammaMean_(binsPerPixel);
        }
        const y = sum / videoAverages;
        combined = 10 * Math.log10(signalMw + noiseMw * y);
        noiseOnly = 10 * Math.log10(noiseMw * y);
      } else {
        for (let i = 0; i < videoAverages; i++) {
          const y = detector === 'peak' ? this.exponentialMax_(binsPerPixel) : this.exponential_();
          combined += 10 * Math.log10(signalMw + noiseMw * y);
          noiseOnly += 10 * Math.log10(noiseMw * y);
        }
        combined /= videoAverages;
        noiseOnly /= videoAverages;
      }

      this.combinedData[x] = Number.isFinite(combined) ? Math.max(minDb, combined) : minDb;
      this.noiseData[x] = Number.isFinite(noiseOnly) ? Math.max(minDb, noiseOnly) : minDb;
      this.signalData[x] = signalMw > 0 ? 10 * Math.log10(signalMw) : state.minAmplitude;
    }
  }

  /** Exponential(1) draw: one bin's noise power relative to its mean */
  private exponential_(): number {
    return -Math.log(1 - this.rng_.next() * 0.999999);
  }

  /** Largest of `m` exponential(1) draws (inverse CDF; m may be fractional) */
  private exponentialMax_(m: number): number {
    const u = this.rng_.next() * 0.999999;

    return -Math.log(1 - u ** (1 / m));
  }

  /** Mean of `m` exponential(1) draws, approximated as normal with sigma 1/sqrt(m) */
  private gammaMean_(m: number): number {
    return Math.max(0.01, 1 + this.gaussianRandom_(0, 1 / Math.sqrt(m)));
  }

  /**
   * Generate Gaussian-distributed random number using Box-Muller transform
   */
  private gaussianRandom_(mean: number, stdDev: number): number {
    const u1 = Math.max(1e-12, this.rng_.next());
    const u2 = this.rng_.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  /**
   * Resize the data arrays when canvas size changes
   */
  resize(newWidth: number): void {
    if (newWidth !== this.width) {
      this.width = newWidth;
      this.noiseData = new Float32Array(newWidth);
      this.signalData = new Float32Array(newWidth);
      this.combinedData = new Float32Array(newWidth);
    }
  }
}
