import { App } from "@app/app";
import { Hertz, IfSignal, MHz, RfSignal } from "../../../types";
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
  private noiseData: Float32Array;
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
        this.range = this.specA.state.minAmplitude - this.specA.state.maxAmplitude;
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

  private drawSignals(): void {
    this.specA.inputSignals.forEach((signal, i) => {
      let color = this.noiseColor;
      if (!this.specA.rfFrontEnd_.antenna.state.isLocked || !this.specA.rfFrontEnd_.antenna.state.isOperational) return;

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

  private drawFrequencyLabels(ctx: CanvasRenderingContext2D, isDualScreenMode: boolean): void {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = isDualScreenMode ? '14px Arial' : '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const numLabels = 10;
    for (let i = 1; i <= numLabels - 1; i++) {
      const x = (i / numLabels) * this.width;
      const freq = this.minFreq + ((this.maxFreq - this.minFreq) * i) / numLabels;
      const freqMHz = freq / 1e6;
      ctx.fillText(`${freqMHz.toFixed(1)}`, x, isDualScreenMode ? 5 : this.height - 20);
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
      const power = this.specA.state.maxAmplitude + ((this.specA.state.minAmplitude - this.specA.state.maxAmplitude) * i) / numLabels;
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

  private drawNoise(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = this.noiseColor;
    ctx.beginPath();

    for (let x = 0, len = this.noiseData.length; x < len; x++) {
      const y = (this.noiseData[x] - this.specA.state.maxAmplitude - this.decibelShift) / this.range;
      if (x === 0) {
        ctx.moveTo(x, this.height * y);
      } else {
        ctx.lineTo(x, this.height * y);
      }
    }

    ctx.stroke();
  }

  private hideBelowNoiseFloor(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.fillStyle = '#000';
    ctx.moveTo(0, this.height);

    for (let x = 0; x < this.width; x++) {
      const y = (this.noiseData[x] - this.specA.state.maxAmplitude - this.decibelShift) / this.range;
      ctx.lineTo(x, this.height * y);
    }

    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();
  }

  private drawSignal(ctx: CanvasRenderingContext2D, color: string, signal: RfSignal | IfSignal): void {
    const center = ((signal.frequency - this.minFreq) / (this.maxFreq - this.minFreq)) * this.width;
    const inBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width) / 2;
    const outOfBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width) / 1.8;

    this.signalData = this.createSignal(this.signalData, center, signal.power, inBandWidth, outOfBandWidth);

    let maxX = 0;
    let maxY = 1;
    let maxSignalFreq = 0;

    ctx.strokeStyle = color;
    ctx.beginPath();

    const len = this.signalData.length;
    for (let x = 0; x < len; x++) {
      const lowestSignal = this.signalData[x] >= this.noiseData[x] ? this.signalData[x] : 0;
      const y = (lowestSignal - this.specA.state.maxAmplitude - this.decibelShift) / this.range;

      maxSignalFreq = y < maxY ? lowestSignal : maxSignalFreq;
      maxX = y < maxY ? x : maxX;
      maxY = Math.min(y, maxY);

      if (x === 0) {
        ctx.moveTo(x, this.height * y);
      } else {
        ctx.lineTo(x, this.height * y);
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
    // Parameters for noise complexity
    const base = this.specA.state.noiseFloor + this.decibelShift;
    const len = data.length;
    const time = performance.now() / 1000;

    // Generate multiple noise layers
    for (let x = 0; x < len; x++) {
      // Layer 1: base random noise
      let noise = (0.5 + (5 * Math.random()) / 10) * base;

      // Layer 2: Perlin-like smooth noise (simple sine modulated)
      noise += Math.sin((x / 50) + time) * base * 0.08;

      // Layer 3: Low-frequency drift
      noise += Math.sin((x / 400) + time / 10) * base * 0.15;

      // Layer 4: High-frequency jitter
      noise += Math.sin((x * 2 + time * 10)) * base * 0.03;

      // Layer 5: Occasional impulse spikes
      if (Math.random() > 0.9995) {
        noise += base * (1 + Math.random() * 2);
      }

      // Layer 6: Dropouts (simulate sudden dips)
      if (Math.random() < 0.0005) {
        noise -= base * (0.5 + Math.random());
      }

      // Layer 7: Band-limited noise (simulate interference)
      if (x > len * 0.3 && x < len * 0.7) {
        noise += Math.sin((x / 20) + time * 2) * base * 0.12;
      }

      // Clamp to minimum 0
      data[x] = Math.max(noise, 0);

      // Update max hold
      if (this.maxHoldData[x] < data[x]) {
        this.maxHoldData[x] = data[x];
      }
    }

    return data;
  }

  private createSignal(
    data: Float32Array,
    center: number,
    amplitude: number,
    inBandWidth: number,
    outOfBandWidth: number
  ): Float32Array {
    for (let x = 0; x < data.length; x++) {
      // Simulate realistic signal shape using Gaussian envelope
      const y = this.createRealSignal(inBandWidth, x, center, amplitude, outOfBandWidth);

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

      data[x] = Math.max(y, 0);
    }

    return data;
  }

  private createRealSignal(inBandWidth: number, x: number, center: number, amplitude: number, outOfBandWidth: number) {
    let y = 0;
    const sigma = inBandWidth / 1.75; // Controls sharpness of main lobe
    const distance = x - center;
    const gaussian = Math.exp(-0.5 * Math.pow(distance / sigma, 2));

    // Main lobe (signal bandwidth)
    if (Math.abs(distance) <= inBandWidth) {
      // Add some random amplitude jitter for realism
      y = (amplitude + this.decibelShift) * gaussian * (0.97 + Math.random() * 0.06);
    }

    // Simulate out-of-band rolloff (side lobes)
    if (Math.abs(distance) > inBandWidth && Math.abs(distance) <= outOfBandWidth) {
      // Side lobes: much lower amplitude, oscillatory decay
      const sideLobe = Math.sin((distance / inBandWidth) * Math.PI * 2) * 0.15;
      y = (amplitude + this.decibelShift) * gaussian * sideLobe * (0.9 + Math.random() * 0.1);
    }

    // Add noise floor blending near edges
    if (Math.abs(distance) > outOfBandWidth * 0.95) {
      y *= 0.5 + Math.random() * 0.2;
    }

    // Simulate deep nulls and random dropouts for realism
    if (Math.random() < 0.001) {
      y *= 0.2 + Math.random() * 0.2;
    }

    // Zero out signal far outside the band and handle out-of-band regions
    if (x > center + outOfBandWidth || x < center - outOfBandWidth ||
      x < center - inBandWidth || x > center + inBandWidth) {
      y = 0;
    }
    return y;
  }

  protected resize(): void {
    // Fixed size for consistency
    return;
  }
}