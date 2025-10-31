import { SATELLITES } from "../../constants";
import { Hertz, IfFrequency, IfSignal, MHz, RfFrequency, RfSignal } from "../../types";
import { Antenna } from '../antenna/antenna';

export interface SpectrumScreenConfig {
  minDecibels: number;
  maxDecibels: number;
  noiseFloor: number;
  refreshRate: number;
  isShowSignals: boolean;
}

export interface SpectrumScreenState {
  isRfMode: boolean;
  isPaused: boolean;
  isTraceOn: boolean;
  isMarkerOn: boolean;
}

/**
 * SpectrumScreen - Handles all canvas rendering and signal visualization
 * Separated from SpectrumAnalyzer to maintain single responsibility
 */
export class SpectrumScreen {
  // Canvas elements
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Canvas dimensions
  private width: number = 1600;
  private height: number = 400;

  // Animation
  private animationId: number | null = null;
  private running: boolean = false;
  private lastDrawTime: number = 0;

  // Signal processing
  private data: Float32Array;
  private noiseData: Float32Array;
  private maxHoldData: Float32Array;

  // Frequency range (set by parent)
  private minFreq: Hertz = 0 as Hertz;
  private maxFreq: Hertz = 0 as Hertz;

  // Configuration
  private config: SpectrumScreenConfig;
  private range: number;
  private decibelShift: number;

  // Antenna reference
  private antenna: Antenna;
  private upconvertOffset: number = 3350e6;
  private downconvertOffset: number = 3500e6;

  // Display options
  private isRfMode: boolean = false;
  private isPaused: boolean = false;
  private isTraceOn: boolean = false;
  private isMarkerOn: boolean = false;

  // Colors
  private readonly noiseColor: string = '#0bf';

  // Resize handler
  private resizeHandler: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, antenna: Antenna, config: SpectrumScreenConfig) {
    this.canvas = canvas;
    this.antenna = antenna;
    this.config = config;

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas 2D context');
    }
    this.ctx = context;

    // Initialize typed arrays
    this.data = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);
    this.maxHoldData = new Float32Array(this.width);

    // Calculate range
    this.range = this.config.minDecibels - this.config.maxDecibels;
    this.decibelShift = 0 - this.config.minDecibels;

    this.setupResizeHandler();
    this.resize();
  }

  /**
   * Public API Methods
   */

  public start(): void {
    if (this.running) return;
    this.running = true;

    // Start after a random delay to stagger multiple analyzers
    setTimeout(() => {
      this.draw();
    }, Math.random() * 1000);
  }

  public stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.running = false;
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public setFrequencyRange(minFreq: Hertz, maxFreq: Hertz): void {
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
  }

  public setMode(isRfMode: boolean): void {
    this.isRfMode = isRfMode;
  }

  public setTraceEnabled(enabled: boolean): void {
    this.isTraceOn = enabled;
  }

  public setMarkerEnabled(enabled: boolean): void {
    this.isMarkerOn = enabled;
  }

  public resetMaxHold(): void {
    this.maxHoldData = new Float32Array(this.width);
  }

  public dispose(): void {
    this.stop();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
  }

  /**
   * Animation Methods
   */

  private draw(): void {
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  private animate(): void {
    if (!this.isPaused && this.running) {
      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / this.config.refreshRate) {
        this.clearCanvas(this.ctx);
        this.ctx.globalAlpha = 1.0;

        // Create and draw noise
        this.noiseData = this.createNoise(this.noiseData);
        this.drawNoise(this.ctx);

        // Draw signals
        this.drawSignals();

        // Draw max hold if enabled
        if (this.isTraceOn) {
          this.drawMaxHold(this.ctx);
        }

        // Hide below noise floor
        this.hideBelowNoiseFloor(this.ctx);

        // Draw grid overlay
        this.drawGridOverlay(this.ctx);

        this.lastDrawTime = now;
      }
    }

    // Continue animation loop
    this.draw();
  }

  /**
   * Signal Drawing
   */

  private drawSignals(): void {
    this.antenna.signals.forEach((signal, i) => {
      let color = this.noiseColor;
      if (!this.antenna.config.isLocked || !this.antenna.config.isOperational) return;

      if (this.config.isShowSignals) {
        color = SpectrumScreen.getRandomRgb(i);
      }

      if (this.isRfMode) {
        // Draw RF signals
        const rfUpSignal: RfSignal = {
          ...signal,
          frequency: (signal.frequency + this.upconvertOffset) as RfFrequency
        };
        const rfDownSignal: RfSignal = {
          ...signal,
          frequency: (signal.frequency + this.upconvertOffset) as RfFrequency
        };
        rfDownSignal.frequency = (rfDownSignal.frequency +
          (this.antenna.config.isLoopbackEnabled
            ? this.antenna.config.offset * 1e6
            : SATELLITES[this.antenna.config.targetId].offset)) as RfFrequency;
        rfDownSignal.power = !this.antenna.config.isLoopbackEnabled && !this.antenna.config.isHpaEnabled
          ? -1000
          : rfDownSignal.power;

        this.drawSignal(this.ctx, color, rfUpSignal);
        this.drawSignal(this.ctx, color, rfDownSignal);
      } else {
        // Draw IF signals
        const ifUpSignal: IfSignal = signal;
        const ifDownSignal: IfSignal = {
          ...signal,
          frequency: (signal.frequency + this.upconvertOffset - this.downconvertOffset) as IfFrequency
        };
        ifDownSignal.frequency = (ifDownSignal.frequency +
          (this.antenna.config.isLoopbackEnabled
            ? this.antenna.config.offset * 1e6
            : SATELLITES[this.antenna.config.targetId].offset)) as IfFrequency;
        ifDownSignal.power = !this.antenna.config.isLoopbackEnabled && !this.antenna.config.isHpaEnabled
          ? -1000
          : ifDownSignal.power;

        this.drawSignal(this.ctx, color, ifUpSignal);
        this.drawSignal(this.ctx, color, ifDownSignal);
      }
    });
  }

  /**
   * Canvas Drawing Methods
   */

  private clearCanvas(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawGridOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = 'white';

    // Vertical lines
    for (let x = 0; x < this.width; x += this.width / 10) {
      ctx.fillRect(x, 0, 1, this.height);
    }

    // Horizontal lines
    for (let y = 0; y < this.height; y += this.height / 10) {
      ctx.fillRect(0, y, this.width, 1);
    }

    ctx.globalAlpha = 1.0;
  }

  private drawNoise(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = this.noiseColor;
    ctx.beginPath();

    for (let x = 0, len = this.noiseData.length; x < len; x++) {
      const y = (this.noiseData[x] - this.config.maxDecibels - this.decibelShift) / this.range;
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
      const y = (this.noiseData[x] - this.config.maxDecibels - this.decibelShift) / this.range;
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

    this.data = this.createSignal(this.data, center, signal.power, inBandWidth, outOfBandWidth);

    let maxX = 0;
    let maxY = 1;
    let maxSignalFreq = 0;

    ctx.strokeStyle = color;
    ctx.beginPath();

    const len = this.data.length;
    for (let x = 0; x < len; x++) {
      const lowestSignal = this.data[x] >= this.noiseData[x] ? this.data[x] : 0;
      const y = (lowestSignal - this.config.maxDecibels - this.decibelShift) / this.range;

      maxSignalFreq = y < maxY ? lowestSignal : maxSignalFreq;
      maxX = y < maxY ? x : maxX;
      maxY = y < maxY ? y : maxY;

      if (x === 0) {
        ctx.moveTo(x, this.height * y);
      } else {
        ctx.lineTo(x, this.height * y);
      }
    }

    ctx.stroke();

    // Draw marker if enabled
    if (this.isMarkerOn) {
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
      ctx.font = '10px Arial';
      const freqMhz = (this.minFreq + (maxX * (this.maxFreq - this.minFreq)) / this.width) / 1e6 as MHz;
      ctx.fillText(`${freqMhz.toFixed(1)} MHz`, maxX - 20, this.height * maxY - 30);
      ctx.fillText(`${(maxSignalFreq + this.config.minDecibels).toFixed(1)} dB`, maxX - 20, this.height * maxY - 20);
    }
  }

  private drawMaxHold(ctx: CanvasRenderingContext2D, color: string = '#ff0'): void {
    ctx.strokeStyle = color;
    ctx.beginPath();

    const len = this.data.length;
    for (let x = 0; x < len; x++) {
      const y = (this.maxHoldData[x] - this.config.maxDecibels - this.decibelShift) / this.range;
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
    const base = this.config.noiseFloor + this.decibelShift;
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

      data[x] = Math.max(y, 0);
    }

    return data;
  }

  private createRealSignal(inBandWidth: number, x: number, center: number, amplitude: number, outOfBandWidth: number) {
    let y = 0;
    const sigma = inBandWidth / 2.5; // Controls sharpness of main lobe
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

  /**
   * Canvas Management
   */

  private setupResizeHandler(): void {
    this.resizeHandler = () => {
      if (this.canvas.parentElement) {
        const newWidth = this.canvas.parentElement.offsetWidth - 6;
        if (newWidth !== this.canvas.width) {
          this.resize();
        }
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  private resize(): void {
    if (!this.canvas.parentElement) return;

    const newWidth = Math.max(this.canvas.parentElement.offsetWidth - 6, 10);
    const newHeight = Math.max(newWidth, 10); // Square aspect ratio

    if (newWidth !== this.width || newHeight !== this.height) {
      this.width = newWidth;
      this.height = newHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;

      // Reallocate typed arrays
      this.data = new Float32Array(this.width);
      this.noiseData = new Float32Array(this.width);
      this.maxHoldData = new Float32Array(this.width);
    }
  }

  /**
   * Static Utility Methods
   */

  public static rgb2hex(rgb: number[]): string {
    return '#' + rgb.map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  public static getRandomRgb(i: number): string {
    let rgb = [255, 0, 0];
    if (i % 3 === 0) {
      rgb[0] = 255;
      rgb[1] = (i * 32) % 255;
      rgb[2] = (i * 64) % 255;
    } else if (i % 3 === 1) {
      rgb[0] = (i * 64) % 255;
      rgb[1] = (i * 32) % 255;
      rgb[2] = 255;
    } else if (i % 3 === 2) {
      rgb[0] = (i * 32) % 255;
      rgb[1] = 255;
      rgb[2] = (i * 64) % 255;
    } else {
      rgb[0] = 255;
      rgb[1] = 255;
      rgb[2] = 255;
    }
    return SpectrumScreen.rgb2hex(rgb);
  }
}