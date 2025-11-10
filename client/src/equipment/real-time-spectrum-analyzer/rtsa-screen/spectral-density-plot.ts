import { App } from "@app/app";
import { Hertz, IfSignal, MHz, RfSignal, SignalOrigin } from "../../../types";
import { RealTimeSpectrumAnalyzer } from "../real-time-spectrum-analyzer";
import { RTSAScreen } from "./rtsa-screen";

/**
 * SpectrumScreen - Handles all canvas rendering and signal visualization
 * Separated from SpectrumAnalyzer to maintain single responsibility
 */
export class SpectralDensityPlot extends RTSAScreen {
  // Animation
  private running: boolean = false;
  private lastDrawTime: number = 0;

  // Signal processing
  private allData: Float32Array;
  private signalData: Float32Array;
  /** Highest visible noise in dBm */
  noiseData: Float32Array;
  private maxHoldData: Float32Array;
  private minHoldData: Float32Array;

  // Frequency range (set by parent)
  private minFreq: Hertz = 0 as Hertz;
  private maxFreq: Hertz = 0 as Hertz;

  // Configuration
  private range: number;
  private decibelShift: number;

  // Colors
  private readonly noiseColor: string = '#fff647ff';
  signalColorCache: Map<string, string> = new Map();

  constructor(canvas: HTMLCanvasElement, specA: RealTimeSpectrumAnalyzer) {
    super(canvas, specA);

    // Initialize typed arrays
    this.allData = new Float32Array(this.width);
    this.signalData = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);
    this.maxHoldData = new Float32Array(this.width);
    this.minHoldData = new Float32Array(this.width);

    // Calculate range
    this.range = this.specA.state.minAmplitude - this.specA.state.maxAmplitude;
    this.decibelShift = 0 - this.specA.state.minAmplitude;

    window.addEventListener('resize', this.resize.bind(this));
    this.resize();

    // Reallocate typed arrays
    this.allData = new Float32Array(this.width);
    this.signalData = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);
    this.maxHoldData = new Float32Array(this.width);
    this.minHoldData = new Float32Array(this.width);

    // Start after a random delay to stagger multiple analyzers
    setTimeout(() => {
      this.running = true;
    }, Math.random() * 1000);
  }

  public setFrequencyRange(minFreq: Hertz, maxFreq: Hertz): void {
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
  }

  public resetMaxHold(): void {
    this.maxHoldData = new Float32Array(this.width);
  }

  public resetMinHold(): void {
    this.minHoldData = new Float32Array(this.width);
  }

  /**
   * Animation Methods
   */

  public update(): void {
    if (!this.specA.state.isPaused && this.running) {
      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / this.specA.state.refreshRate) {
        // Update min hold
        if (!this.specA.state.isMinHold) {
          this.minHoldData = new Float32Array(this.width);
        }
        // Calculate range
        this.range = this.specA.state.maxAmplitude - this.specA.state.minAmplitude;
        this.decibelShift = 0 - this.specA.state.minAmplitude;

        this.noiseData = this.createNoise(this.noiseData);
        // Initially fill allData with noise
        this.allData = this.noiseData;
      }
    }
  }

  public draw(): void {
    if (!this.specA.state.isPaused && this.running) {
      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / this.specA.state.refreshRate) {
        this.clearCanvas(this.ctx);
        this.ctx.globalAlpha = 1.0;

        // Create and draw noise
        this.drawNoise(this.ctx);

        // Draw signals
        this.drawSignals();

        // Draw max hold if enabled
        if (this.specA.state.isMaxHold) {
          this.drawMaxHold(this.ctx);
        }

        // Hide below noise floor
        this.hideBelowNoiseFloor(this.ctx);

        // Calculate min hold based on all data
        for (let x = 0; x < this.width; x++) {
          if (this.allData[x] > 0) {
            if (this.minHoldData[x] === 0 || this.allData[x] < this.minHoldData[x]) {
              this.minHoldData[x] = this.allData[x];
            }
          }
        }

        // Draw min hold if enabled
        if (this.specA.state.isMinHold) {
          this.drawMinHold(this.ctx);
        }

        const isDualScreenMode = this.canvas.id.endsWith('-spectral');

        // Draw grid overlay
        this.drawGridOverlay(this.ctx, isDualScreenMode);

        // Draw frequency and power labels
        this.drawFrequencyLabels(this.ctx, isDualScreenMode);
        this.drawPowerLabels(this.ctx, isDualScreenMode);

        this.lastDrawTime = now;
      }
    }
  }

  /**
   * Signal Drawing
   */

  drawSignals(): void {
    this.specA.inputSignals.forEach((signal, i) => {
      let color = this.noiseColor;

      if (App.getInstance().isDeveloperMode) {
        // Check if we have cached a color for this signal id
        color = this.signalColorCache.get(signal.id)!;
        if (!color) {
          color = SpectralDensityPlot.getRandomRgb(i);
          this.signalColorCache.set(signal.id, color);
        }
      }

      // Draw signals
      this.drawSignal(this.ctx, color, signal);
    });
  }

  private drawFrequencyLabels(ctx: CanvasRenderingContext2D, _isDualScreenMode: boolean): void {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const numLabels = 10;
    const maxTextWidth = 80; // px
    const padding = 6; // minimum spacing between labels
    let lastX = -Infinity;

    const formatCandidates = (freq: number): string[] => {
      if (freq >= 1e9) {
        const g = freq / 1e9;
        return [
          `${g.toFixed(1)} GHz`,
          `${g.toFixed(1)}GHz`,
          `${Math.round(g)} GHz`,
          `${Math.round(g)}GHz`,
          `${Math.round(g)}G`
        ];
      } else if (freq >= 1e6) {
        const m = freq / 1e6;
        return [
          `${Math.round(m)} MHz`,
          `${Math.round(m)}MHz`,
          `${(m >= 1000) ? `${(m / 1000).toFixed(1)} GHz` : `${Math.round(m / 10) / 100}M`}`,
          `${Math.round(m / 1000)}G`
        ].filter(Boolean);
      } else if (freq >= 1e3) {
        const k = freq / 1e3;
        return [
          `${k.toFixed(1)} kHz`,
          `${Math.round(k)} kHz`,
          `${Math.round(k)}kHz`,
          `${Math.round(freq)} Hz`
        ];
      } else {
        return [
          `${Math.round(freq)} Hz`
        ];
      }
    };

    for (let i = 1; i <= numLabels - 1; i++) {
      const x = (i / numLabels) * this.width;
      const freq = this.minFreq + ((this.maxFreq - this.minFreq) * i) / numLabels;

      const candidates = formatCandidates(freq);
      let drawn = false;

      for (const text of candidates) {
        const measured = ctx.measureText(text).width;
        // only draw if text fits the max width and does not collide with previous label
        if (measured <= maxTextWidth && x - lastX >= measured + padding) {
          const y = this.height - 20;
          ctx.fillText(text, x, y);
          lastX = x;
          drawn = true;
          break;
        }
      }

      // If no compact candidate fits but we still have plenty of room, try drawing the shortest candidate truncated
      if (!drawn) {
        const fallback = candidates[candidates.length - 1];
        const measured = ctx.measureText(fallback).width;
        if (x - lastX >= Math.min(measured, maxTextWidth) + padding) {
          const y = this.height - 20;
          // truncate long labels to maxTextWidth by progressively removing characters
          let label = fallback;
          while (ctx.measureText(label).width > maxTextWidth && label.length > 1) {
            label = label.slice(0, -1);
          }
          ctx.fillText(label, x, y);
          lastX = x;
        }
      }
    }
    ctx.restore();
  }

  private drawPowerLabels(ctx: CanvasRenderingContext2D, isDualScreenMode: boolean): void {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = isDualScreenMode ? '14px Arial' : '20px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const numLabels = isDualScreenMode ? 5 : 10;
    for (let i = 0; i <= numLabels - 1; i++) {
      const y = (i / numLabels) * this.height;
      const maxAmplitude = this.specA.state.maxAmplitude - this.specA.state.referenceLevel;
      const minAmplitude = this.specA.state.minAmplitude - this.specA.state.referenceLevel;

      const power = maxAmplitude + ((minAmplitude - maxAmplitude) * i) / numLabels;
      ctx.fillText(`${power.toFixed(0)}`, 35, y);
    }
    ctx.restore();
  }

  /**
   * Canvas Drawing Methods
   */

  private clearCanvas(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawGridOverlay(ctx: CanvasRenderingContext2D, isDualScreenMode: boolean): void {
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = 'white';

    // Vertical lines
    for (let x = 0; x < this.width; x += this.width / 10) {
      ctx.fillRect(x, 0, 1, this.height);
    }

    // Horizontal lines
    const numLines = isDualScreenMode ? 5 : 10;
    for (let i = 0; i < numLines; i++) {
      const y = (i / numLines) * this.height;
      ctx.fillRect(0, y, this.width, 1);
    }

    ctx.globalAlpha = 1.0;
  }

  drawNoise(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = this.noiseColor;
    ctx.beginPath();

    for (let x = 0, len = this.noiseData.length; x < len; x++) {
      // calculate y position
      const y = (this.noiseData[x] - this.specA.state.minAmplitude) / this.range;
      if (x === 0) {
        ctx.moveTo(x, this.height * (1 - y));
      } else {
        ctx.lineTo(x, this.height * (1 - y));
      }
    }

    ctx.stroke();
  }

  hideBelowNoiseFloor(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.fillStyle = '#000';
    ctx.moveTo(0, this.height);

    for (let x = 0; x < this.width; x++) {
      const y = (this.noiseData[x] - this.specA.state.minAmplitude) / this.range;
      ctx.lineTo(x, this.height * (1 - y));
    }

    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();
  }

  private drawSignal(ctx: CanvasRenderingContext2D, color: string, signal: RfSignal | IfSignal): void {
    const center = ((signal.frequency - this.minFreq) / (this.maxFreq - this.minFreq)) * this.width;
    const inBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width) / 2;
    const outOfBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width) / 1.8;

    this.signalData = this.createSignal(this.signalData, signal, center, inBandWidth, outOfBandWidth);

    let maxX = 0;
    let maxY = 1;
    let maxSignalFreq = -Infinity;

    ctx.strokeStyle = color;
    ctx.beginPath();

    const len = this.signalData.length;
    for (let x = 0; x < len; x++) {
      const lowestSignal = Math.max(this.signalData[x], this.noiseData[x]);
      const y = (lowestSignal - this.specA.state.minAmplitude) / this.range;

      if (lowestSignal > maxSignalFreq && y > 0 && y < 1 && x > 0 && x < this.width) {
        maxSignalFreq = lowestSignal;
        maxX = x;
        maxY = (1 - y);
      }

      if (x === 0) {
        ctx.moveTo(x, this.height * (1 - y));
      } else {
        ctx.lineTo(x, this.height * (1 - y));
      }
    }

    ctx.stroke();

    // Draw marker if enabled
    if (this.specA.state.isMarkerOn) {
      this.drawMarker(maxX, maxY, ctx, maxSignalFreq);
    }
  }

  private drawMarker(maxX: number, maxY: number, ctx: CanvasRenderingContext2D, maxSignalFreq: number): void {
    if (maxX > 0) {
      maxY -= 0.025;

      // Draw diamond marker
      ctx.beginPath();
      ctx.fillStyle = '#f00';
      ctx.moveTo(maxX, this.height * maxY);
      ctx.lineTo(maxX - 5, this.height * maxY - 5);
      ctx.lineTo(maxX, this.height * maxY - 10);
      ctx.lineTo(maxX + 5, this.height * maxY - 5);
      ctx.lineTo(maxX, this.height * maxY);
      ctx.fill();

      // Draw frequency label
      ctx.fillStyle = '#fff';
      ctx.font = '18px Arial';
      const freqMhz = (this.minFreq + (maxX * (this.maxFreq - this.minFreq)) / this.width) / 1e6 as MHz;
      ctx.fillText(`${freqMhz.toFixed(1)} MHz`, maxX - 20, this.height * maxY - 30);
      ctx.fillText(`${(maxSignalFreq + this.specA.state.minAmplitude).toFixed(1)} dB`, maxX - 20, this.height * maxY - 15);
    }
  }

  private drawMaxHold(ctx: CanvasRenderingContext2D, color: string = '#0f0'): void {
    ctx.strokeStyle = color;
    ctx.beginPath();

    const len = this.signalData.length;
    for (let x = 0; x < len; x++) {
      const y = (this.maxHoldData[x] - this.specA.state.maxAmplitude - this.decibelShift) / this.range;
      if (x === 0) {
        ctx.moveTo(x, this.height * y);
      } else {
        ctx.lineTo(x, this.height * y);
      }
    }

    ctx.stroke();
  }

  private drawMinHold(ctx: CanvasRenderingContext2D, color: string = '#0f0'): void {
    ctx.strokeStyle = color;
    ctx.beginPath();

    const len = this.signalData.length;
    for (let x = 0; x < len; x++) {
      const y = (this.minHoldData[x] - this.specA.state.maxAmplitude - this.decibelShift) / this.range;
      if (x === 0) {
        ctx.moveTo(x, this.height * y);
      } else {
        ctx.lineTo(x, this.height * y);
      }
    }

    ctx.stroke();
  }

  /**
   * Signal Processing Methods
   */

  private createNoise(data: Float32Array): Float32Array {
    let base = this.specA.state.noiseFloorNoGain;

    const len = data.length;
    const time = performance.now() / 1000;

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
      if (!this.specA.state.isInternalNoiseFloor) {
        noise += this.specA.rfFrontEnd_.getTotalRxGain();
      }

      data[x] = noise;

      // Update max hold
      if (this.maxHoldData[x] < data[x]) {
        this.maxHoldData[x] = data[x];
      }
    }

    return data;
  }

  private createSignal(
    data: Float32Array,
    signal: IfSignal | RfSignal,
    center: number,
    inBandWidth: number,
    outOfBandWidth: number
  ): Float32Array {
    for (let x = 0; x < data.length; x++) {
      // Simulate realistic signal shape using Gaussian envelope
      const y = this.createRealSignal(inBandWidth, x, signal, center, outOfBandWidth);

      // Update max hold
      if (this.maxHoldData[x] < y) {
        this.maxHoldData[x] = y;
      }

      // Update noise floor
      if (this.noiseData[x] < y) {
        this.noiseData[x] = y;
      }

      // Update all data with the largest value at that frequency
      this.allData[x] = Math.max(this.allData[x], y);

      data[x] = y;
    }

    return data;
  }

  private createRealSignal(inBandWidth: number, x: number, signal: IfSignal | RfSignal, center: number, outOfBandWidth: number) {
    const sigma = inBandWidth / 1.035;
    const distance = x - center;
    const gaussian = Math.exp(-0.5 * Math.pow(distance / sigma, 2));

    // Zero out signal far outside the band
    if (x > center + outOfBandWidth || x < center - outOfBandWidth ||
      x < center - inBandWidth || x > center + inBandWidth) {
      return -170; // Well below noise floor
    }

    // Convert gaussian attenuation to dB (20*log10(gaussian))
    // For gaussian values 0-1, this gives us 0 to -infinity dB
    const gaussianDb = 20 * Math.log10(Math.max(gaussian, 1e-10));

    let y = signal.power + gaussianDb;

    // Main lobe (signal bandwidth)
    if (Math.abs(distance) <= inBandWidth) {
      // Add some random amplitude jitter for realism (±0.3 dB)
      y += (Math.random() - 0.5) * 0.6;
    }

    // Simulate out-of-band rolloff (side lobes)
    if (Math.abs(distance) > inBandWidth && Math.abs(distance) <= outOfBandWidth) {
      // Side lobes: much lower amplitude (-15 to -20 dB below main lobe)
      const sideLobe = Math.sin((distance / inBandWidth) * Math.PI * 2) * 0.15;
      const sideLobeDb = 20 * Math.log10(Math.abs(sideLobe) + 1e-10);
      y = signal.power + gaussianDb + sideLobeDb + (Math.random() - 0.5) * 0.8;
    }

    // Add noise floor blending near edges (additional -3 to -6 dB)
    if (Math.abs(distance) > outOfBandWidth * 0.95) {
      y -= 3 + Math.random() * 3;
    }

    // Simulate deep nulls and random dropouts for realism (-10 to -14 dB drops)
    if (Math.random() < 0.001) {
      y -= 10 + Math.random() * 4;
    }

    // if filter bank bandwidth is this.specA.rfFrontEnd_.filterModule.state.bandwidth * 1e6
    // what should happen if the signal bandwidth is greater than that?

    if (signal.origin === SignalOrigin.IF_FILTER_BANK && signal.bandwidth > this.specA.rfFrontEnd_.filterModule.state.bandwidth * 1e6) {
      // Apply additional attenuation for out-of-band signals
      // Ps,out​=Ps​+10log10​(Bs​Bf​​)
      const bandwidthRatio = signal.bandwidth / ((this.specA.rfFrontEnd_.filterModule.state.bandwidth * 1e6) / 2);
      const attenuationDb = 10 * Math.log10(bandwidthRatio);
      y -= attenuationDb;
    }

    return y;
  }

  protected resize(): void {
    // Fixed size for consistency
    return;
  }
}