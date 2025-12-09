import { Hertz, IfSignal, RfSignal } from "../../types";
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
  }

  /**
   * Generate noise data across the frequency range
   */
  private generateNoise(): void {
    let base = this.specA.state.noiseFloorNoGain;

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

      // Layer 1: base random noise (±1 dB fixed variation)
      let noise = base + (Math.random() - 0.5) * 2;

      // Layer 2: Smooth low-frequency drift (additive, not multiplicative)
      noise += Math.sin((x / 300) + time / 8 + randPhase1) * randAmp1 * 0.5;

      // Layer 3: Very subtle high-frequency jitter (additive)
      noise += Math.sin((x * 0.5 + time * 2 + randPhase2)) * randAmp2 * 0.005;

      // Layer 4: Band-limited noise (simulate mild interference, additive)
      if (x > len * 0.4 && x < len * 0.6) {
        noise += Math.sin((x / 40) + time * 1.5 + randPhase3) * randAmp3 * 0.02;
      }

      // Clamp noise to within +/-2 dB of base for realism
      noise = Math.max(base - 2, Math.min(base + 2, noise));

      // Layer 5: Occasional impulse spikes (fixed amplitude, not scaled by base)
      if (Math.random() > 0.9999) {
        noise += 2 + Math.random() * 3;
      }

      // Layer 6: Rare dropouts (fixed amplitude)
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

    // Process each input signal
    this.specA.inputSignals.forEach((signal) => {
      const center = ((signal.frequency - this.minFreq) / (this.maxFreq - this.minFreq)) * this.width;
      const inBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width) / 4;
      const outOfBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width);

      this.addSignalToData(signal, center, inBandWidth, outOfBandWidth);
    });
  }

  /**
   * Add a single signal to the signal data array
   */
  private addSignalToData(
    signal: IfSignal | RfSignal,
    center: number,
    inBandWidth: number,
    outOfBandWidth: number
  ): void {
    // Use outOfBandWidth as the basis for sigma to create a wider, more realistic Gaussian
    const sigma = outOfBandWidth / 3;

    for (let x = 0; x < this.width; x++) {
      const distance = x - center;
      const absDist = Math.abs(distance);
      const gaussian = Math.exp(-0.5 * Math.pow(distance / sigma, 2));

      // Convert gaussian to dB (this creates the smooth exponential rise/fall)
      const gaussianDb = 20 * Math.log10(Math.max(gaussian, 1e-10));

      // Start with the Gaussian shape
      let y = signal.power + gaussianDb;

      // Main lobe (center region) - add minimal jitter
      if (absDist <= inBandWidth) {
        y += (Math.random() - 0.5) * 0.4;
      }
      // Transition region - slight additional rolloff for realism
      else if (absDist <= outOfBandWidth * 0.7) {
        y += (Math.random() - 0.5) * 0.6;
        // Very subtle side lobe effect
        const sideLobeEffect = Math.sin((distance / outOfBandWidth) * Math.PI * 4) * 0.5;
        y += sideLobeEffect;
      }
      // Outer region - more pronounced side lobes and taper
      else if (absDist <= outOfBandWidth) {
        const sideLobeEffect = Math.sin((distance / outOfBandWidth) * Math.PI * 6) * 0.8;
        y += sideLobeEffect + (Math.random() - 0.5) * 1.0;
      }
      // Beyond outOfBandWidth - natural exponential decay
      else {
        const excessDistance = absDist - outOfBandWidth;
        const decayFactor = Math.exp(-excessDistance / (outOfBandWidth * 0.3));
        y += -20 * (1 - decayFactor);
        y += (Math.random() - 0.5) * 1.5;
      }

      // Simulate occasional deep nulls for realism
      if (Math.random() < 0.001) {
        y -= 10 + Math.random() * 4;
      }

      // If noise floor is external, add RF front-end gain to match noise
      if (!this.specA.state.isSkipLnaGainDuringDraw) {
        y += this.specA.rfFrontEnd_.couplerModule.signalPathManager.getTotalRxGain();
      }

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
