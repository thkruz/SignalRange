import { Hertz, IfSignal, RfSignal } from "@app/types";
import { RealTimeSpectrumAnalyzer } from "./real-time-spectrum-analyzer";

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
    // Generate noise data
    this.generateNoise();

    // Generate signal data
    this.generateSignals();

    // Combine noise and signals
    this.combineData();

    // Apply notch filter visualization (visual dips at notch frequencies)
    this.applyNotchVisualization_();
  }

  /**
   * Generate noise data across the frequency range
   */
  private generateNoise(): void {
    const base = this.specA.state.noiseFloorNoGain;

    const len = this.width;
    const time = Date.now() / 1000;

    // Generate multiple noise layers
    for (let x = 0; x < len; x++) {
      // Add randomized phase offsets to prevent coherent patterns
      const randPhase1 = Math.random() * Math.PI * 2;
      const randPhase2 = Math.random() * Math.PI * 2;
      const randPhase3 = Math.random() * Math.PI * 2;
      const randAmp1 = 0.8 + Math.random() * 0.4;
      const randAmp2 = 1.2 + Math.random() * 0.6;
      const randAmp3 = 0.2 + Math.random() * 0.4;

      // Layer 1: Gaussian-distributed base noise (natural thermal noise distribution)
      // stdDev of 0.6 dB gives realistic spread - most samples within ±1.2 dB
      let noise = this.gaussianRandom_(base, 0.6);

      // Layer 2: Smooth low-frequency drift (additive, not multiplicative)
      noise += Math.sin((x / 300) + time / 8 + randPhase1) * randAmp1 * 0.15;

      // Layer 3: Very subtle high-frequency jitter (additive)
      noise += Math.sin((x * 0.5 + time * 2 + randPhase2)) * randAmp2 * 0.005;

      // Layer 4: Band-limited noise (simulate mild interference, additive)
      if (x > len * 0.4 && x < len * 0.6) {
        noise += Math.sin((x / 40) + time * 1.5 + randPhase3) * randAmp3 * 0.02;
      }

      // Layer 5: Frequent small random peaks (creates natural "grass" above baseline)
      // ~3% of samples get small bumps
      if (Math.random() < 0.03) {
        noise += 0.5 + Math.random() * 1.5;
      }

      // Layer 6: Frequent small random dips (natural variation below baseline)
      // ~3% of samples get small dips
      if (Math.random() < 0.03) {
        noise -= 0.3 + Math.random() * 1.0;
      }

      // Layer 7: Rare larger impulse spikes (fixed amplitude, not scaled by base)
      if (Math.random() < 0.0001) {
        noise += 2 + Math.random() * 3;
      }

      // Layer 8: Rare larger dropouts (fixed amplitude)
      if (Math.random() < 0.0002) {
        noise -= 1 + Math.random() * 2;
      }

      // If noise floor is external, add RF front-end gain
      if (!this.specA.state.isSkipLnaGainDuringDraw) {
        noise += this.specA.rfFrontEnd_.couplerModule.signalPathManager.getTotalRxGain();
      }

      this.noiseData[x] = noise;
    }
  }

  /**
   * Generate signal data for all input signals
   */
  private generateSignals(): void {
    // Initialize signal data with minimum amplitude
    this.signalData.fill(this.specA.state.minAmplitude);

    const rbw = this.specA.state.rbw;

    // Process each input signal
    this.specA.inputSignals.forEach((signal) => {
      const center = ((signal.frequency - this.minFreq) / (this.maxFreq - this.minFreq)) * this.width;
      const freqSpan = this.maxFreq - this.minFreq;
      const halfBandwidthPixels = (signal.bandwidth / 2 / freqSpan) * this.width;

      // Out-of-band roll-off extends 8% beyond half-bandwidth on each side
      const outOfBandExtensionHz = signal.bandwidth * 0.08;
      const outOfBandExtensionPixels = (outOfBandExtensionHz / freqSpan) * this.width;

      // In-band is the flat-top region (half-bandwidth minus roll-off extension)
      const inBandWidth = halfBandwidthPixels - outOfBandExtensionPixels;
      // Out-of-band width is the total distance from center to signal edge
      const outOfBandWidth = halfBandwidthPixels;

      // Spectral density: a signal wider than the RBW shows per-bin power
      // (total power spread across bandwidth/RBW bins), matching how a real
      // analyzer renders wideband signals. Narrow signals are unaffected, and
      // the displayed noise floor is already per-RBW, so heights stay honest.
      const psdCorrection_dB = rbw && signal.bandwidth > rbw
        ? 10 * Math.log10(signal.bandwidth / rbw)
        : 0;

      this.addSignalToData(signal, center, inBandWidth, outOfBandWidth, psdCorrection_dB);
    });
  }

  /**
   * Add a single signal to the signal data array
   * Uses a flat-top shape with steep roll-off at the band edges
   */
  private addSignalToData(
    signal: IfSignal | RfSignal,
    center: number,
    inBandWidth: number,
    outOfBandWidth: number,
    psdCorrection_dB: number = 0
  ): void {
    // inBandWidth = flat-top region (e.g., 17.5 MHz from center for 36 MHz signal)
    // outOfBandWidth = total signal edge (e.g., 18 MHz from center = half-bandwidth)
    // Roll-off region spans from inBandWidth to outOfBandWidth
    const rollOffWidth = outOfBandWidth - inBandWidth;

    // Displayed level: per-RBW-bin power for wideband signals (see generateSignals)
    const displayPower = signal.power - psdCorrection_dB;

    // Only process pixels within the signal's influence region
    const startX = Math.max(0, Math.floor(center - outOfBandWidth));
    const endX = Math.min(this.width, Math.ceil(center + outOfBandWidth));

    for (let x = startX; x < endX; x++) {
      const distance = x - center;
      const absDist = Math.abs(distance);

      let y: number;

      // Flat-top region - near peak amplitude
      if (absDist <= inBandWidth) {
        y = displayPower;

        // Add noise-like variation similar to noise floor
        // Base random variation
        y += this.gaussianRandom_(0, 0.4);

        // Occasional small bumps (like noise "grass")
        if (Math.random() < 0.05) {
          y += 0.3 + Math.random() * 0.8;
        }

        // Occasional small dips
        if (Math.random() < 0.05) {
          y -= 0.2 + Math.random() * 0.6;
        }

        // Very subtle slow variation across the flat top
        y += Math.sin((x / 50) + Date.now() / 2000) * 0.15;
      }
      // Roll-off region - steep transition at the band edges
      else if (absDist <= outOfBandWidth) {
        // rollOffProgress: 0 at in-band edge, 1 at signal edge
        const rollOffProgress = (absDist - inBandWidth) / rollOffWidth;
        // Use raised cosine for smooth but steep roll-off
        const rolloff = 0.5 * (1 + Math.cos(Math.PI * rollOffProgress));
        const rolloffDb = 20 * Math.log10(Math.max(rolloff, 1e-10));

        y = displayPower + rolloffDb;

        // Add variation that increases as we move away from center
        y += this.gaussianRandom_(0, 0.5 + rollOffProgress * 0.3);

        // Side lobe ripple effect
        y += Math.sin(rollOffProgress * Math.PI * 2) * 0.3;
      }
      // Beyond signal edge - should not reach here due to loop bounds
      else {
        y = this.specA.state.minAmplitude;
      }

      // Simulate occasional deep nulls for realism
      if (Math.random() < 0.001) {
        y -= 8 + Math.random() * 4;
      }

      // NOTE: Signals from agcModule.outputSignals already include all chain gains
      // (LNB gain, IF filter loss, AGC gain). Do NOT add gain here - that would
      // double-count the gain. Gain is only added to noise floor, not signals.

      // Take the maximum value at each frequency point
      this.signalData[x] = Math.max(this.signalData[x], y);
    }
  }

  /**
   * Combine noise and signal data into final combined data
   */
  private combineData(): void {
    for (let x = 0; x < this.width; x++) {
      this.combinedData[x] = Math.max(this.noiseData[x], this.signalData[x]);
    }
  }

  /**
   * Apply notch filter attenuation to the spectrum display.
   * Creates a visible "dip" at each enabled notch's frequency range.
   */
  private applyNotchVisualization_(): void {
    const notchFilterModule = this.specA.rfFrontEnd_.notchFilterModule;
    if (!notchFilterModule) return;

    const notchFilterState = notchFilterModule.state;
    if (!notchFilterState.isPowered) return;

    for (const notch of notchFilterState.notches) {
      if (!notch.enabled) continue;

      // Convert notch center and bandwidth from MHz to Hz
      const notchCenterHz = notch.centerFrequency * 1e6;
      const notchHalfBwHz = (notch.bandwidth * 1e6) / 2;
      const notchLowHz = notchCenterHz - notchHalfBwHz;
      const notchHighHz = notchCenterHz + notchHalfBwHz;

      for (let x = 0; x < this.width; x++) {
        const freqAtX = this.minFreq + (x / this.width) * (this.maxFreq - this.minFreq);

        if (freqAtX >= notchLowHz && freqAtX <= notchHighHz) {
          // Apply notch depth attenuation at this frequency
          this.combinedData[x] -= notch.depth;
          this.noiseData[x] -= notch.depth;
        }
      }
    }
  }

  /**
   * Generate Gaussian-distributed random number using Box-Muller transform
   */
  private gaussianRandom_(mean: number, stdDev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
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
