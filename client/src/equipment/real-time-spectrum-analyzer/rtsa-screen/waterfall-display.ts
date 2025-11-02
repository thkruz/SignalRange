import { SATELLITES } from "../../../constants";
import { Hertz, IfFrequency, IfSignal, RfFrequency, RfSignal } from "../../../types";
import { Antenna } from "../../antenna/antenna";
import { RealTimeSpectrumAnalyzer } from "../real-time-spectrum-analyzer";
import { RTSAScreen } from "./rtsa-screen";

export class WaterfallDisplay extends RTSAScreen {
  private running: boolean = false;
  private lastDrawTime: number = 0;

  // Waterfall buffer: each row is a Float32Array of amplitudes
  private readonly buffer: Float32Array[] = [];
  private readonly bufferSize: number;

  // ImageData for efficient pixel manipulation
  private imageData: ImageData;
  private pixels: Uint8ClampedArray;

  // Signal processing
  private data: Float32Array;
  private noiseData: Float32Array;

  // Antenna reference
  private readonly upconvertOffset: number = 3350e6;
  private readonly downconvertOffset: number = 3500e6;
  minFreq: Hertz = 0 as Hertz;
  maxFreq: Hertz = 0 as Hertz;

  // Color cache for performance
  private colorCache: Map<number, [number, number, number]> = new Map();
  private readonly COLOR_CACHE_STEPS = 256;

  constructor(canvas: HTMLCanvasElement, antenna: Antenna, specA: RealTimeSpectrumAnalyzer) {
    super(canvas, antenna, specA);
    this.data = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);
    this.bufferSize = this.height;
    this.buffer = Array.from({ length: this.bufferSize }, () => {
      const row = new Float32Array(this.width);
      row.fill(this.specA.state.minDecibels);
      return row;
    });

    // Initialize ImageData
    this.imageData = this.ctx.createImageData(this.width, this.height);
    this.pixels = this.imageData.data;

    // Pre-compute color lookup table
    this.initializeColorCache();

    this.setupResizeHandler();
    this.resize();

    setTimeout(() => {
      this.running = true;
    }, Math.random() * 1000);
  }

  private initializeColorCache(): void {
    const minDb = this.specA.state.minDecibels;
    const maxDb = this.specA.state.maxDecibels;

    for (let i = 0; i < this.COLOR_CACHE_STEPS; i++) {
      const amplitude = minDb + (i / (this.COLOR_CACHE_STEPS - 1)) * (maxDb - minDb);
      this.colorCache.set(i, WaterfallDisplay.amplitudeToColorRGB(amplitude, this.specA.state));
    }
  }

  public setFrequencyRange(minFreq: Hertz, maxFreq: Hertz): void {
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
  }

  public update(): void {
    // Empty - we do everything in draw() for waterfall
  }

  public draw(): void {
    if (!this.specA.state.isPaused && this.running) {
      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / this.specA.state.refreshRate) {
        // Create new row of data
        this.noiseData = this.createNoise(this.noiseData);
        this.data.fill(this.specA.state.minDecibels);
        this.drawSignalsToData(this.minFreq, this.maxFreq);

        // Compose noise + signals into one row
        const row = new Float32Array(this.width);
        for (let x = 0; x < this.width; x++) {
          row[x] = Math.max(this.noiseData[x], this.data[x]);
        }

        // Scroll buffer up, add new row at bottom
        this.buffer.shift();
        this.buffer.push(row);

        // Draw the entire waterfall using ImageData
        this.renderWaterfallToImageData();
        this.ctx.putImageData(this.imageData, 0, 0);

        // Draw grid overlay
        this.drawGridOverlay(this.ctx);

        this.lastDrawTime = now;
      }
    }
  }

  private renderWaterfallToImageData(): void {
    const minDb = this.specA.state.minDecibels;
    const maxDb = this.specA.state.maxDecibels;
    const range = maxDb - minDb;

    for (let y = 0; y < this.bufferSize; y++) {
      const rowData = this.buffer[y];
      const rowOffset = y * this.width * 4; // 4 bytes per pixel (RGBA)

      for (let x = 0; x < this.width; x++) {
        const amplitude = rowData[x];

        // Map amplitude to color cache index
        const norm = Math.max(0, Math.min(1, (amplitude - minDb) / range));
        const cacheIndex = Math.floor(norm * (this.COLOR_CACHE_STEPS - 1));
        const color = this.colorCache.get(cacheIndex)!;

        const pixelOffset = rowOffset + x * 4;
        this.pixels[pixelOffset] = color[0];     // R
        this.pixels[pixelOffset + 1] = color[1]; // G
        this.pixels[pixelOffset + 2] = color[2]; // B
        this.pixels[pixelOffset + 3] = 255;      // A
      }
    }
  }

  private drawSignalsToData(minFreq: Hertz, maxFreq: Hertz): void {
    this.antenna.state.signals.forEach((signal) => {
      if (!this.antenna.state.isLocked || !this.antenna.state.isOperational) return;

      if (this.specA.state.isRfMode) {
        const rfUpSignal: RfSignal = {
          ...signal,
          frequency: (signal.frequency + this.upconvertOffset) as RfFrequency
        };
        const rfDownSignal: RfSignal = {
          ...signal,
          frequency: (signal.frequency + this.upconvertOffset +
            (this.antenna.state.isLoopbackEnabled
              ? this.antenna.state.offset * 1e6
              : SATELLITES[this.antenna.state.targetId].offset)) as RfFrequency
        };

        this.addSignalToData(rfUpSignal, minFreq, maxFreq);
        this.addSignalToData(rfDownSignal, minFreq, maxFreq);
      } else {
        const ifUpSignal: IfSignal = signal;
        const ifDownSignal: IfSignal = {
          ...signal,
          frequency: (signal.frequency + this.upconvertOffset - this.downconvertOffset +
            (this.antenna.state.isLoopbackEnabled
              ? this.antenna.state.offset * 1e6
              : SATELLITES[this.antenna.state.targetId].offset)) as IfFrequency
        };

        this.addSignalToData(ifUpSignal, minFreq, maxFreq);
        this.addSignalToData(ifDownSignal, minFreq, maxFreq);
      }
    });
  }

  private addSignalToData(signal: RfSignal | IfSignal, minFreq: Hertz, maxFreq: Hertz): void {
    const center = this.freqToX(signal.frequency, minFreq, maxFreq);
    const inBandWidth = this.bandwidthToW(signal.bandwidth, minFreq, maxFreq);
    const outOfBandWidth = inBandWidth * 1.1;

    // Only draw if signal is within visible range
    if (center >= -outOfBandWidth && center <= this.width + outOfBandWidth) {
      this.data = this.createSignal(
        this.data,
        center,
        signal.power,
        inBandWidth,
        outOfBandWidth
      );
    }
  }

  private freqToX(freq: number, minFreq: Hertz, maxFreq: Hertz): number {
    return ((freq - minFreq) / (maxFreq - minFreq)) * this.width;
  }

  private bandwidthToW(bw: number, minFreq: Hertz, maxFreq: Hertz): number {
    return ((bw / (maxFreq - minFreq)) * this.width) / 2;
  }

  private drawGridOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;

    // Vertical lines
    ctx.beginPath();
    for (let x = 0; x < this.width; x += this.width / 10) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    ctx.stroke();

    // Horizontal lines
    ctx.beginPath();
    for (let y = 0; y < this.height; y += this.height / 10) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();

    ctx.globalAlpha = 1.0;
  }

  private createNoise(data: Float32Array): Float32Array {
    const base = this.specA.state.noiseFloor;
    const len = data.length;
    const time = performance.now() / 1000;

    for (let x = 0; x < len; x++) {
      let noise = base + (Math.random() - 0.5) * 3;
      noise += Math.sin((x / 50) + time) * 1.0;
      noise += Math.sin((x / 400) + time / 10) * 1.5;
      noise += Math.sin((x * 2 + time * 10)) * 0.3;

      if (Math.random() > 0.999) {
        noise += 3 + Math.random() * 3;
      }

      data[x] = noise;
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
    const sigma = inBandWidth / 2.5;

    for (let x = 0; x < data.length; x++) {
      const distance = x - center;
      const absDistance = Math.abs(distance);

      if (absDistance > outOfBandWidth) continue;

      let y = amplitude;
      const gaussian = Math.exp(-0.5 * Math.pow(distance / sigma, 2));

      if (absDistance <= inBandWidth) {
        y = amplitude + Math.log10(gaussian * (0.97 + Math.random() * 0.06)) * 10;
      } else if (absDistance <= outOfBandWidth) {
        const sideLobe = Math.abs(Math.sin((distance / inBandWidth) * Math.PI * 2)) * 0.15;
        y = amplitude + Math.log10(gaussian * sideLobe * (0.9 + Math.random() * 0.1)) * 10;
      }

      if (absDistance > outOfBandWidth * 0.95) {
        y -= Math.abs(Math.random() * 3);
      }

      data[x] = Math.max(data[x], y);
    }

    return data;
  }

  // Return RGB tuple instead of string for better performance
  static amplitudeToColorRGB(amplitude: number, state: any): [number, number, number] {
    const minDb = state.minDecibels;
    const maxDb = state.maxDecibels;

    let norm = (amplitude - minDb) / (maxDb - minDb);
    norm = Math.max(0, Math.min(1, norm));
    norm = Math.pow(norm, 0.8);

    const brightness = 0.85;

    if (norm < 0.2) {
      const t = norm / 0.2;
      return [0, 0, Math.floor((20 + 80 * t) * brightness)];
    } else if (norm < 0.4) {
      const t = (norm - 0.2) / 0.2;
      return [0, Math.floor(100 * t * brightness), Math.floor((100 + 100 * t) * brightness)];
    } else if (norm < 0.6) {
      const t = (norm - 0.4) / 0.2;
      return [
        Math.floor(128 * t * brightness),
        Math.floor((100 + 155 * t) * brightness),
        Math.floor(200 * (1 - t) * brightness)
      ];
    } else if (norm < 0.8) {
      const t = (norm - 0.6) / 0.2;
      return [
        Math.floor((128 + 127 * t) * brightness),
        Math.floor(255 * brightness),
        0
      ];
    } else {
      const t = (norm - 0.8) / 0.2;
      return [
        Math.floor(255 * brightness),
        Math.floor(255 * (1 - t) * brightness),
        0
      ];
    }
  }

  // Update resize handler to recreate ImageData
  protected override resize(): boolean {
    const isResizing = super.resize();

    if (!isResizing) {
      return false;
    }

    // Recreate ImageData with new dimensions
    this.imageData = this.ctx.createImageData(this.width, this.height);
    this.pixels = this.imageData.data;

    // Reallocate arrays
    this.data = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);

    // Resize buffer
    while (this.buffer.length < this.height) {
      const row = new Float32Array(this.width);
      row.fill(this.specA.state.minDecibels);
      this.buffer.push(row);
    }
    while (this.buffer.length > this.height) {
      this.buffer.shift();
    }

    // Reinitialize color cache in case state changed
    this.initializeColorCache();
    return true;
  }
}