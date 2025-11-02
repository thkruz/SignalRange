import { SATELLITES } from "../../../constants";
import { Hertz, IfFrequency, IfSignal, RfFrequency, RfSignal } from "../../../types";
import { Antenna } from "../../antenna/antenna";
import { RealTimeSpectrumAnalyzer } from "../real-time-spectrum-analyzer";
import { RTSAScreen } from "./rtsa-screen";

export class WaterfallDisplay extends RTSAScreen {
  private running: boolean = false;
  private lastDrawTime: number = 0;

  // Waterfall buffer: each row is a Float32Array of amplitudes
  private buffer: Float32Array[] = [];
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
  private readonly colorCache: Map<number, [number, number, number]> = new Map();
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

    window.addEventListener('resize', this.resize.bind(this));
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

  private initializeBuffer(): void {
    // Create buffer with exact height rows
    this.buffer = [];
    for (let i = 0; i < this.height; i++) {
      const row = new Float32Array(this.width);
      // Initialize with noise floor instead of min decibels so it shows something
      row.fill(this.specA.state.noiseFloor);
      this.buffer.push(row);
    }
  }

  public setFrequencyRange(minFreq: Hertz, maxFreq: Hertz): void {
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
  }

  public update(): void {
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

        // Scroll buffer DOWN: remove oldest (bottom), add newest (top)
        this.buffer.pop();      // Remove oldest from bottom
        this.buffer.unshift(row); // Add newest to top
      }
    }
  }

  public draw(): void {
    if (!this.specA.state.isPaused && this.running) {
      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / this.specA.state.refreshRate) {
        // Draw the entire waterfall using ImageData
        this.renderWaterfallToImageData();
        this.ctx.putImageData(this.imageData, 0, 0);

        this.lastDrawTime = now;
      }
    }
  }

  private renderWaterfallToImageData(): void {
    const minDb = this.specA.state.minDecibels;
    const maxDb = this.specA.state.maxDecibels;
    const range = maxDb - minDb;

    // Make sure we're rendering exactly height rows
    const rowsToRender = Math.min(this.buffer.length, this.height);

    for (let y = 0; y < rowsToRender; y++) {
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

    // Fill any remaining rows (shouldn't happen, but just in case)
    for (let y = rowsToRender; y < this.height; y++) {
      const rowOffset = y * this.width * 4;
      for (let x = 0; x < this.width; x++) {
        const pixelOffset = rowOffset + x * 4;
        this.pixels[pixelOffset] = 0;     // R
        this.pixels[pixelOffset + 1] = 0; // G
        this.pixels[pixelOffset + 2] = 0; // B
        this.pixels[pixelOffset + 3] = 255; // A
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

  private createNoise(data: Float32Array): Float32Array {
    const base = this.specA.state.noiseFloor;
    const len = data.length;
    const time = performance.now() / 1000;

    for (let x = 0; x < len; x++) {
      // Add more randomness to phase and amplitude for each iteration
      const randPhase1 = Math.random() * Math.PI * 2;
      const randPhase2 = Math.random() * Math.PI * 2;
      const randPhase3 = Math.random() * Math.PI * 2;
      const randAmp1 = 0.8 + Math.random() * 0.4;
      const randAmp2 = 1.2 + Math.random() * 0.6;
      const randAmp3 = 0.2 + Math.random() * 0.4;

      let noise = base + (Math.random() - 0.5) * 3;
      noise += Math.sin((x / 50) + time + randPhase1) * randAmp1;
      noise += Math.sin((x / 400) + time / 10 + randPhase2) * randAmp2;
      noise += Math.sin((x * 2 + time * 10 + randPhase3)) * randAmp3;

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

    const brightness = 1;

    if (norm < 0.1) {
      const t = norm / 0.2;
      return [0, 0, Math.floor((20 + 80 * t) * brightness)];
    } else if (norm < 0.4) {
      const t = (norm - 0.2) / 0.2;
      return [0, Math.floor(100 * t * brightness), Math.floor((100 + 100 * t) * brightness)];
    } else if (norm < 0.3) {
      const t = (norm - 0.4) / 0.2;
      return [
        Math.floor(128 * t * brightness),
        Math.floor((100 + 155 * t) * brightness),
        Math.floor(200 * (1 - t) * brightness)
      ];
    } else if (norm < 0.6) {
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

  protected override resize(): boolean {
    if (!this.canvas.parentElement) return false;

    const newWidth = Math.max(this.canvas.parentElement.offsetWidth - 6, 10);
    const newHeight = Math.max(newWidth, 10); // Square aspect ratio

    if (newWidth !== this.width || newHeight !== this.height) {
      this.width = newWidth;
      this.height = newHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    const oldWidth = this.width;
    const oldHeight = this.height;
    const oldBuffer = this.buffer;

    // Recreate ImageData with new dimensions
    this.imageData = this.ctx.createImageData(this.width, this.height);
    this.pixels = this.imageData.data;

    // Reallocate arrays
    this.data = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);

    // Handle buffer resize intelligently
    if (oldWidth !== this.width || oldHeight !== this.height) {
      this.buffer = [];

      // Copy and resize existing rows
      for (let y = 0; y < this.height; y++) {
        const newRow = new Float32Array(this.width);

        if (y < oldBuffer.length && oldBuffer[y]) {
          const oldRow = oldBuffer[y];

          // If width changed, interpolate or sample the old data
          if (oldWidth === this.width) {
            // Same width, just copy
            newRow.set(oldRow);
          } else {
            // Width changed, resample the data
            for (let x = 0; x < this.width; x++) {
              const oldX = (x / this.width) * oldWidth;
              const oldXFloor = Math.floor(oldX);
              const oldXCeil = Math.min(oldXFloor + 1, oldWidth - 1);
              const t = oldX - oldXFloor;

              // Linear interpolation between adjacent pixels
              newRow[x] = oldRow[oldXFloor] * (1 - t) + oldRow[oldXCeil] * t;
            }
          }
        } else {
          // New row beyond old buffer, fill with noise floor
          newRow.fill(this.specA.state.noiseFloor);
        }

        this.buffer.push(newRow);
      }
    } else {
      // Dimensions unchanged, keep buffer as-is
      this.initializeBuffer();
    }

    // Reinitialize color cache in case state changed
    this.initializeColorCache();

    return true;
  }
}