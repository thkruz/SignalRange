import { Hertz, IfSignal, RfSignal } from "../../../types";
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from "../real-time-spectrum-analyzer";
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
  minFreq: Hertz = 0 as Hertz;
  maxFreq: Hertz = 0 as Hertz;

  // Color cache for performance
  private readonly colorCache: Map<number, [number, number, number]> = new Map();
  private readonly COLOR_CACHE_STEPS = 2048;
  cacheMaxDb: number = 0;
  cacheMinDb: number = 0;
  cacheGain: number = 0;

  constructor(canvas: HTMLCanvasElement, specA: RealTimeSpectrumAnalyzer) {
    super(canvas, specA);
    this.data = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);
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
      if (
        this.cacheMaxDb !== this.specA.state.maxAmplitude ||
        this.cacheMinDb !== this.specA.state.minAmplitude ||
        this.width !== this.data.length ||
        this.cacheGain !== this.specA.rfFrontEnd_.lnbModule.getTotalGain()
      ) {
        this.initializeColorCache();
        // TODO: This causes old data to have the wrong colors - low priority but it causes a graphical glitch
        this.cacheMaxDb = this.specA.state.maxAmplitude;
        this.cacheMinDb = this.specA.state.minAmplitude;
        this.noiseData = new Float32Array(this.width);
        this.noiseCacheRow = 0;
        this.noiseCache = new Float32Array(this.height * this.width);
      }

      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / (this.specA.state.refreshRate * 2)) {
        // If we are in 'both' screen mode, reuse spectral-density-plot's noise data
        if (this.specA.state.screenMode === 'both') {
          const spectralDensityNoise = this.specA.spectralDensityBoth.noiseData;
          this.noiseData.set(spectralDensityNoise);
        } else {
          this.noiseData = this.createNoise(this.noiseData);
        }

        // Create new row of data
        this.data.fill(this.specA.state.minAmplitude);
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

  private drawSignalsToData(minFreq: Hertz, maxFreq: Hertz): void {
    this.specA.inputSignals.forEach((signal) => {
      if (!this.specA.rfFrontEnd_.antenna.state.isLocked || !this.specA.rfFrontEnd_.antenna.state.isOperational) return;

      this.addSignalToData(signal, minFreq, maxFreq);
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
        signal,
        center,
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

  noiseCacheRow: number = 0;
  noiseCache: Float32Array = new Float32Array(this.height * this.width);

  private createNoise(data: Float32Array): Float32Array {
    // Parameters for noise complexity (match spectral-density-plot)
    // Teq​=290×(10NF/10−1) | 34 Kelvin at NF=0.5dB
    const noiseFigure = 0.5; // dB
    let internalNoise = -174 + 10 * Math.log10(this.specA.state.span) + noiseFigure;
    let externalNoise = this.specA.state.noiseFloor + this.specA.rfFrontEnd_.lnbModule.getTotalGain();

    const isInternalNoise = internalNoise > externalNoise;
    let base = isInternalNoise ? internalNoise : (externalNoise - this.specA.rfFrontEnd_.lnbModule.getTotalGain());

    const len = data.length;
    const time = performance.now() / 1000;

    for (let x = 0; x < len; x++) {
      // If Noise Cache is full, reuse old noise values for stability
      if (this.noiseCacheRow >= this.height / 4) {
        // Pick a random row from the cache to reuse
        data[x] = this.noiseCache[(Math.floor(Math.random() * this.height / 4) * this.width) + x];
        continue;
      }

      // Add randomized phase offsets to prevent coherent patterns (match spectral-density-plot)
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

      if (!isInternalNoise) {
        noise += this.specA.rfFrontEnd_.lnbModule.getTotalGain();
      }

      data[x] = noise;

      this.noiseCache[this.noiseCacheRow * this.width + x] = noise;
    }

    if (this.noiseCacheRow < this.height / 4) {
      this.noiseCacheRow++;
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
    const sigma = inBandWidth / 1.75;

    for (let x = 0; x < data.length; x++) {
      const distance = x - center;
      const absDistance = Math.abs(distance);

      if (absDistance > outOfBandWidth) continue;

      let y = signal.power;
      const gaussian = Math.exp(-0.5 * Math.pow(distance / sigma, 2));

      if (absDistance <= inBandWidth) {
        y = signal.power + Math.log10(gaussian * (0.97 + Math.random() * 0.06)) * 10;
      } else if (absDistance <= outOfBandWidth) {
        const sideLobe = Math.abs(Math.sin((distance / inBandWidth) * Math.PI * 2)) * 0.15;
        y = signal.power + Math.log10(gaussian * sideLobe * (0.9 + Math.random() * 0.1)) * 10;
      }

      if (absDistance > outOfBandWidth * 0.95) {
        y -= Math.abs(Math.random() * 3);
      }

      // if filter bank bandwidth is this.specA.rfFrontEnd_.filterModule.state.bandwidth * 1e6
      // what should happen if the signal bandwidth is greater than that?

      if (signal.bandwidth > this.specA.rfFrontEnd_.filterModule.state.bandwidth * 1e6) {
        // Apply additional attenuation for out-of-band signals
        // Ps,out​=Ps​+10log10​(Bs​Bf​​)
        const bandwidthRatio = signal.bandwidth / ((this.specA.rfFrontEnd_.filterModule.state.bandwidth * 1e6) / 2);
        const attenuationDb = 10 * Math.log10(bandwidthRatio);
        y -= attenuationDb;
      }

      data[x] = Math.max(data[x], y);
    }

    return data;
  }

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

    // Set all alpha values to 255 (opaque)
    for (let i = 3; i < this.pixels.length; i += 4) {
      this.pixels[i] = 255;
    }

    // Reallocate arrays
    this.data = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);
    this.noiseCacheRow = 0;
    this.noiseCache = new Float32Array(this.height * this.width);

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