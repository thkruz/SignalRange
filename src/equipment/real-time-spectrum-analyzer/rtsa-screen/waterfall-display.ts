import { Hertz } from "../../../types";
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from "../real-time-spectrum-analyzer";
import { SpectrumDataProcessor } from "../spectrum-data-processor";
import { RTSAScreen } from "./rtsa-screen";

export class WaterfallDisplay extends RTSAScreen {
  private running: boolean = false;
  private lastDrawTime: number = 0;

  // Data processor reference (shared data source)
  private readonly dataProcessor: SpectrumDataProcessor;

  // Waterfall buffer: each row is a Float32Array of amplitudes
  private buffer: Float32Array[] = [];
  private readonly bufferSize: number;

  // ImageData for efficient pixel manipulation
  private imageData: ImageData;
  private pixels: Uint8ClampedArray;

  // Antenna reference
  minFreq: Hertz = 0 as Hertz;
  maxFreq: Hertz = 0 as Hertz;

  // Color cache for performance
  private readonly colorCache: Map<number, [number, number, number]> = new Map();
  private readonly COLOR_CACHE_STEPS = 2048;
  cacheMaxDb: number = 0;
  cacheMinDb: number = 0;
  cacheGain: number = 0;

  constructor(
    canvas: HTMLCanvasElement,
    specA: RealTimeSpectrumAnalyzer,
    dataProcessor: SpectrumDataProcessor,
    width: number,
    height: number
  ) {
    super(canvas, specA, width, height);

    // Store reference to shared data processor
    this.dataProcessor = dataProcessor;

    this.bufferSize = this.height;
    this.buffer = Array.from({ length: this.bufferSize }, () => {
      const row = new Float32Array(this.width);
      row.fill(this.specA.state.minAmplitude);
      return row;
    });

    // Initialize ImageData
    this.imageData = this.ctx.createImageData(this.width, this.height);
    this.pixels = this.imageData.data;

    // Set all alpha values to 255 (opaque)
    for (let i = 3; i < this.pixels.length; i += 4) {
      this.pixels[i] = 255;
    }

    // Pre-compute color lookup table
    this.initializeColorCache();

    window.addEventListener('resize', this.resize.bind(this));
    this.resize();

    setTimeout(() => {
      this.running = true;
    }, Math.random() * 1000);
  }

  private initializeColorCache(): void {
    this.colorCache.clear();
    const minDb = this.specA.state.minAmplitude;
    const maxDb = this.specA.state.maxAmplitude;

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
      row.fill(this.specA.state.noiseFloorNoGain);
      this.buffer.push(row);
    }
  }

  public setFrequencyRange(minFreq: Hertz, maxFreq: Hertz): void {
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
  }

  public update(): void {
    if (!this.specA.state.isPaused && this.running) {
      if (
        this.cacheMaxDb !== this.specA.state.maxAmplitude ||
        this.cacheMinDb !== this.specA.state.minAmplitude ||
        this.cacheGain !== this.specA.rfFrontEnd_.lnbModule.getTotalGain()
      ) {
        this.initializeColorCache();
        // TODO: This causes old data to have the wrong colors - low priority but it causes a graphical glitch
        this.cacheMaxDb = this.specA.state.maxAmplitude;
        this.cacheMinDb = this.specA.state.minAmplitude;
      }

      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / (this.specA.state.refreshRate * 2)) {
        // Get the combined data (noise + signals) from the data processor
        const row = new Float32Array(this.width);
        row.set(this.dataProcessor.combinedData);

        // Scroll buffer DOWN: remove oldest (bottom), add newest (top)
        this.buffer.pop();      // Remove oldest from bottom
        this.buffer.unshift(row); // Add newest to top
      }
    }
  }

  public draw(): void {
    if (!this.specA.state.isPaused && this.running) {
      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / (this.specA.state.refreshRate)) {
        // Draw the entire waterfall using ImageData
        this.renderWaterfallToImageData(Math.floor((this.height * 3) / 4), this.height);
        this.ctx.putImageData(this.imageData, 0, 0);

        this.lastDrawTime = now;

        // Schedule update of each quarter in sequence for smoother updates
        const quarters = [
          [0, Math.floor(this.height / 4)],
          [Math.floor(this.height / 4), Math.floor(this.height / 2)],
          [Math.floor(this.height / 2), Math.floor((this.height * 3) / 4)]
        ];

        const renderQuarter = (index: number) => {
          if (index < quarters.length) {
            const [start, end] = quarters[index];
            this.renderWaterfallToImageData(start, end);
            requestAnimationFrame(() => renderQuarter(index + 1));
          }
        };

        requestAnimationFrame(() => renderQuarter(0));
      }
    }

  }

  private renderWaterfallToImageData(start: number = 0, end: number = this.height): void {
    const minDb = this.specA.state.minAmplitude;
    const maxDb = this.specA.state.maxAmplitude;
    const range = maxDb - minDb;

    // Clamp start and end to valid range
    start = Math.max(0, Math.min(start, this.height));
    end = Math.max(start, Math.min(end, this.height));

    // Make sure we're rendering exactly height rows
    const rowsToRender = Math.min(this.buffer.length, this.height);

    for (let y = start; y < end && y < rowsToRender; y++) {
      const rowData = this.buffer[y];
      const rowOffset = y * this.width * 4; // 4 bytes per pixel (RGBA)

      for (let x = 0; x < this.width; x++) {
        // Map amplitude to color cache index
        const norm = Math.max(0, Math.min(1, (rowData[x] - minDb) / range));
        let cacheIndex = Math.floor(norm * (this.COLOR_CACHE_STEPS - 1));
        const color = this.colorCache.get(cacheIndex) || [0, 0, 0];

        const pixelOffset = rowOffset + x * 4;
        this.pixels[pixelOffset] = color[0];
        this.pixels[pixelOffset + 1] = color[1];
        this.pixels[pixelOffset + 2] = color[2];
        // Alpha channel is already set to 255 in constructor/resize
      }
    }
  }

  /**
   * Note: Data generation (noise and signals) is now handled by SpectrumDataProcessor
   * This eliminates duplicate code and ensures consistency between spectral density and waterfall displays
   */

  // Return RGB tuple instead of string for better performance
  static amplitudeToColorRGB(amplitude: number, state: RealTimeSpectrumAnalyzerState): [number, number, number] {
    const minDb = state.minAmplitude;
    const maxDb = state.maxAmplitude;

    let norm = (amplitude - minDb) / (maxDb - minDb);
    norm = Math.max(0, Math.min(1, norm));

    const brightness = 1;

    // Smooth linear gradient: dark blue -> blue -> cyan -> green -> yellow -> red
    if (norm < 0.2) {
      // Dark Blue to Bright Blue
      const t = norm / 0.2;
      return [0, 0, Math.floor((100 + 155 * t) * brightness)];
    } else if (norm < 0.4) {
      // Blue to Cyan
      const t = (norm - 0.2) / 0.2;
      return [0, Math.floor(255 * t * brightness), Math.floor(255 * brightness)];
    } else if (norm < 0.6) {
      // Cyan to Green
      const t = (norm - 0.4) / 0.2;
      return [
        0,
        Math.floor(255 * brightness),
        Math.floor(255 * (1 - t) * brightness)
      ];
    } else if (norm < 0.8) {
      // Green to Yellow
      const t = (norm - 0.6) / 0.2;
      return [
        Math.floor(255 * t * brightness),
        Math.floor(255 * brightness),
        0
      ];
    } else {
      // Yellow to Red
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
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    const oldWidth = this.width;
    const oldHeight = this.height;
    const oldBuffer = this.buffer;

    // Recreate ImageData with new dimensions
    this.imageData = this.ctx.createImageData(this.width, this.height);
    this.pixels = this.imageData.data;

    // Set all alpha values to 255 (opaque)
    for (let i = 3; i < this.pixels.length; i += 4) {
      this.pixels[i] = 255;
    }

    // Note: Data arrays are managed by SpectrumDataProcessor, not here

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
          newRow.fill(this.specA.state.noiseFloorNoGain);
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