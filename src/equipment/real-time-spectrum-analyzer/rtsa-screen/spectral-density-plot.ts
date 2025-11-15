import { SimulationManager } from "@app/simulation/simulation-manager";
import { Hertz, IfSignal, MHz, RfSignal } from "../../../types";
import type { TraceMode } from "../analyzer-control/ac-trace-btn/ac-trace-btn";
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
  /** Highest visible noise in dBm */
  noiseData: Float32Array;
  // Per-trace data arrays (3 traces)
  private traceData: Float32Array[] = [];

  // Frequency range (set by parent)
  private minFreq: Hertz = 0 as Hertz;
  private maxFreq: Hertz = 0 as Hertz;

  // Configuration
  private range: number;

  // Colors
  private readonly noiseColor: string = '#fff647ff';
  signalColorCache: Map<string, string> = new Map();

  // Trace colors based on mode
  private readonly traceColors = {
    clearwrite: '#fff647ff', // Yellow (live data)
    maxhold: '#ff0000',      // Red
    minhold: '#0000ff',      // Blue
    average: '#ff00ff',      // Magenta
    hold: '#4eb136ff',       // Yellow (maintains color from before hold)
  };

  // Frequency label caching
  private frequencyLabelCache: Map<number, string[]> = new Map();

  // Grid + labels ImageData caching
  private cachedGridImageData: ImageData | null = null;
  private cachedMinFreq: Hertz = 0 as Hertz;
  private cachedMaxFreq: Hertz = 0 as Hertz;
  private cachedMinAmplitude: number = 0;
  private cachedMaxAmplitude: number = 0;
  cachedReferenceLevel: number;

  constructor(canvas: HTMLCanvasElement, specA: RealTimeSpectrumAnalyzer, width: number, height: number) {
    super(canvas, specA, width, height);

    // Initialize noise data
    this.noiseData = new Float32Array(this.width);

    // Initialize 3 trace data arrays
    for (let i = 0; i < 3; i++) {
      this.traceData[i] = new Float32Array(this.width);
      // Initialize with -Infinity for max hold, Infinity for min hold
      this.traceData[i].fill(-Infinity);
    }

    // Calculate range
    this.range = this.specA.state.minAmplitude - this.specA.state.maxAmplitude;

    // Start after a random delay to stagger multiple analyzers
    setTimeout(() => {
      this.running = true;
    }, Math.random() * 1000);
  }

  setFrequencyRange(minFreq: Hertz, maxFreq: Hertz): void {
    // Invalidate frequency label cache if range changed
    if (this.minFreq !== minFreq || this.maxFreq !== maxFreq) {
      this.frequencyLabelCache.clear();
      this.cachedGridImageData = null; // Invalidate grid cache
    }
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
  }

  resetMaxHold_(): void {
    // Reset trace 1 (index 0) for backward compatibility
    this.resetTraceData_(0, -Infinity);
  }

  resetMinHold_(): void {
    // Reset trace 1 (index 0) for backward compatibility
    this.resetTraceData_(0, Infinity);
  }

  /**
   * Reset a specific trace's data
   * @param traceIndex - Trace index (0-2)
   * @param fillValue - Value to fill the array with (-Infinity for max hold, Infinity for min hold)
   */
  private resetTraceData_(traceIndex: number, fillValue: number = -Infinity): void {
    if (traceIndex >= 0 && traceIndex < 3) {
      this.traceData[traceIndex] = new Float32Array(this.width);
      this.traceData[traceIndex].fill(fillValue);
    }
  }

  /**
   * Get the color for a trace based on its mode
   */
  private getTraceColor(mode: TraceMode): string {
    return this.traceColors[mode] || this.traceColors.clearwrite;
  }

  /**
   * Animation Methods
   */

  update(): void {
    if (!this.specA.state.isPaused && this.running) {
      const now = Date.now();
      const sweepTimeMs = 3000 * (this.specA.state.span / (this.specA.state.rbw ?? this.specA.state.span) ** 2);
      if (now - this.lastDrawTime > sweepTimeMs) {
        // Invalidate grid cache if amplitude range changed
        if (this.cachedMinAmplitude !== this.specA.state.minAmplitude ||
          this.cachedMaxAmplitude !== this.specA.state.maxAmplitude ||
          this.cachedReferenceLevel !== this.specA.state.referenceLevel) {
          this.cachedGridImageData = null;
        }

        // Calculate range
        this.range = this.specA.state.maxAmplitude - this.specA.state.minAmplitude;
        this.cachedReferenceLevel = this.specA.state.referenceLevel;

        // Generate noise data
        this.noiseData = this.createNoise(this.noiseData);

        // Update each trace based on its mode
        for (let traceIndex = 0; traceIndex < 3; traceIndex++) {
          const trace = this.specA.state.traces[traceIndex];

          // Skip if trace is not visible or not updating
          if (!trace.isVisible || !trace.isUpdating) {
            continue;
          }

          this.updateTrace_(traceIndex, trace.mode);
        }
      }
    }
  }

  /**
   * Update a specific trace based on its mode
   */
  private updateTrace_(traceIndex: number, mode: TraceMode): void {
    // Generate current frame data (noise + signals)
    const currentData = new Float32Array(this.width);

    // Start with noise
    currentData.set(this.noiseData);

    // Add signals if not in developer mode
    if (!SimulationManager.getInstance().isDeveloperMode) {
      this.specA.inputSignals.forEach((signal) => {
        const center = ((signal.frequency - this.minFreq) / (this.maxFreq - this.minFreq)) * this.width;
        const inBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width) / 4;
        const outOfBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width);

        this.addSignalToData_(currentData, signal, center, inBandWidth, outOfBandWidth);
      });
    }

    // Update trace based on mode
    switch (mode) {
      case 'clearwrite':
        // Update with current data
        this.traceData[traceIndex].set(currentData);
        break;

      case 'maxhold':
        // Keep maximum values
        for (let x = 0; x < this.width; x++) {
          if (currentData[x] > this.traceData[traceIndex][x]) {
            this.traceData[traceIndex][x] = currentData[x];
          }
        }
        break;

      case 'minhold':
        // Keep minimum values
        for (let x = 0; x < this.width; x++) {
          if (currentData[x] < this.traceData[traceIndex][x]) {
            this.traceData[traceIndex][x] = currentData[x];
          }
        }
        break;

      case 'average':
        // Rolling average: 20% new, 80% old
        for (let x = 0; x < this.width; x++) {
          this.traceData[traceIndex][x] = (this.traceData[traceIndex][x] * 0.8) + (currentData[x] * 0.2);
        }
        break;

      case 'hold':
        // Do nothing - keep frozen data
        break;
    }
  }

  /**
   * Add signal data to the provided Float32Array
   */
  private addSignalToData_(
    data: Float32Array,
    signal: IfSignal | RfSignal,
    center: number,
    inBandWidth: number,
    outOfBandWidth: number
  ): void {
    for (let x = 0; x < data.length; x++) {
      const signalValue = this.createRealSignal(inBandWidth, x, signal, center, outOfBandWidth);
      // Take the maximum value at each frequency point
      data[x] = Math.max(data[x], signalValue);
    }
  }

  draw(): void {
    if (!this.specA.state.isPaused && this.running) {
      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / this.specA.state.refreshRate) {
        const isDualScreenMode = this.canvas.id.endsWith('-spectral');

        // Generate cached grid+labels ImageData if needed
        if (!this.cachedGridImageData ||
          this.cachedMinFreq !== this.minFreq ||
          this.cachedMaxFreq !== this.maxFreq ||
          this.cachedMinAmplitude !== this.specA.state.minAmplitude ||
          this.cachedMaxAmplitude !== this.specA.state.maxAmplitude) {
          this.cachedGridImageData = this.generateGridImageData(isDualScreenMode);
          this.cachedMinFreq = this.minFreq;
          this.cachedMaxFreq = this.maxFreq;
          this.cachedMinAmplitude = this.specA.state.minAmplitude;
          this.cachedMaxAmplitude = this.specA.state.maxAmplitude;
        }

        // Restore cached grid+labels (replaces clearCanvas + grid + labels)
        this.ctx.putImageData(this.cachedGridImageData, 0, 0);
        this.ctx.globalAlpha = 1.0;

        // Draw noise in developer mode
        if (SimulationManager.getInstance().isDeveloperMode) {
          this.drawNoise(this.ctx);
        }

        // Draw all visible traces
        for (let traceIndex = 0; traceIndex < 3; traceIndex++) {
          const trace = this.specA.state.traces[traceIndex];

          // Skip if trace is not visible
          if (!trace.isVisible) {
            continue;
          }

          const color = this.getTraceColor(trace.mode);
          this.drawTrace_(this.ctx, traceIndex, color);
        }

        // Draw developer mode signals on top
        if (SimulationManager.getInstance().isDeveloperMode) {
          this.drawSignals();
        }

        this.updateTopMarkers();

        this.lastDrawTime = now;
      }
    }
  }

  /**
   * Draw a specific trace
   */
  private drawTrace_(ctx: CanvasRenderingContext2D, traceIndex: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.beginPath();

    for (let x = 0; x < this.width; x++) {
      const amplitude = this.traceData[traceIndex][x];
      const y = (amplitude - this.specA.state.minAmplitude) / this.range;

      if (x === 0) {
        ctx.moveTo(x, this.height * (1 - y));
      } else {
        ctx.lineTo(x, this.height * (1 - y));
      }
    }

    ctx.stroke();
  }

  private updateTopMarkers() {
    if (this.specA.state.isUpdateMarkers) {
      // Find peaks in the currently selected trace
      this.specA.state.topMarkers = [];

      const selectedTraceIndex = this.specA.state.selectedTrace - 1;
      const selectedTraceData = this.traceData[selectedTraceIndex];

      if (!selectedTraceData) {
        this.specA.state.isUpdateMarkers = false;
        return;
      }

      // Find local maxima (peaks) in the selected trace
      const peaks: { x: number; signal: number }[] = [];

      for (let x = 1; x < this.width - 1; x++) {
        const current = selectedTraceData[x];
        const prev = selectedTraceData[x - 1];
        const next = selectedTraceData[x + 1];

        // Check if this is a local maximum
        if (current > prev && current > next && current > this.specA.noiseFloorAndGain + 3) {
          peaks.push({ x, signal: current });
        }
      }

      // Sort by signal strength and take top 10
      peaks.sort((a, b) => b.signal - a.signal);
      const topPeaks = peaks.slice(0, 10);

      // Convert to marker format
      topPeaks.forEach(peak => {
        const y = (peak.signal - this.specA.state.minAmplitude) / this.range;
        if (y > 0 && y < 1) {
          this.specA.state.topMarkers.push({
            x: peak.x,
            y: 1 - y,
            signal: peak.signal
          });
        }
      });

      // If less than 10 markers, fill with remaining trace peaks
      if (this.specA.state.topMarkers.length < 10) {
        for (let x = 0; x < this.width && this.specA.state.topMarkers.length < 10; x++) {
          const signal = selectedTraceData[x];
          const y = (signal - this.specA.state.minAmplitude) / this.range;

          if (y > 0 && y < 1) {
            // Check if we already have a marker near this position
            const tooClose = this.specA.state.topMarkers.some(m => Math.abs(m.x - x) < 10);
            if (!tooClose) {
              this.specA.state.topMarkers.push({
                x,
                y: 1 - y,
                signal
              });
            }
          }
        }
      }

      // Sort markers in ascending x order for drawing
      this.specA.state.topMarkers.sort((a, b) => a.x - b.x);

      // Set this.specA.state.markerIndex to the highest signal marker
      this.specA.state.markerIndex = 0;
      let highestSignal = -Infinity;
      this.specA.state.topMarkers.forEach((marker, index) => {
        if (marker.signal > highestSignal) {
          highestSignal = marker.signal;
          this.specA.state.markerIndex = index;
        }
      });

      this.specA.state.isUpdateMarkers = false;
    }

    // Draw marker for the current selected marker
    if (this.specA.state.isMarkerOn && this.specA.state.topMarkers.length > 0) {
      const { x: maxX, y: maxY, signal: maxSignalFreq } = this.specA.state.topMarkers[this.specA.state.markerIndex];
      this.drawMarker(maxX, maxY, maxSignalFreq);
    }
  }

  /**
   * Signal Drawing
   */

  drawSignals(): void {
    this.specA.inputSignals.forEach((signal, i) => {
      let color = this.noiseColor;

      if (SimulationManager.getInstance().isDeveloperMode) {
        // Check if we have cached a color for this signal id
        color = this.signalColorCache.get(signal.signalId)!;
        if (!color) {
          color = SpectralDensityPlot.getRandomRgb(i);
          this.signalColorCache.set(signal.signalId, color);
        }
      }

      // Draw signals
      this.drawSignal(this.ctx, color, signal);
    });
  }

  private drawFrequencyLabels(ctx: CanvasRenderingContext2D, _isDualScreenMode: boolean): void {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    this.ctx.font = '14px Arial';

    const numLabels = 10;
    const maxTextWidth = 150; // px
    const padding = 6; // minimum spacing between labels
    let lastX = -Infinity;

    const formatCandidates = (freq: number): string[] => {
      if (freq >= 1e9) {
        const g = freq / 1e9;
        return [
          `${g.toFixed(3)} GHz`,
          `${g.toFixed(3)}GHz`,
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
          `${k.toFixed(3)} kHz`,
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

      // Check cache for formatted candidates
      let candidates = this.frequencyLabelCache.get(freq);
      if (!candidates) {
        candidates = formatCandidates(freq);
        this.frequencyLabelCache.set(freq, candidates);
      }
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
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    this.ctx.font = '14px Arial';

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
   * Generates cached ImageData containing grid overlay and labels
   * This is only regenerated when frequency or power range changes
   */
  private generateGridImageData(isDualScreenMode: boolean): ImageData {
    // Clear canvas to black
    this.clearCanvas(this.ctx);

    // Draw grid overlay
    this.drawGridOverlay(this.ctx, isDualScreenMode);

    // Draw labels
    this.drawFrequencyLabels(this.ctx, isDualScreenMode);
    this.drawPowerLabels(this.ctx, isDualScreenMode);

    // Capture and return ImageData
    return this.ctx.getImageData(0, 0, this.width, this.height);
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
      const currentAmplitude = this.noiseData[x];
      // calculate y position
      const y = (currentAmplitude - this.specA.state.minAmplitude) / this.range;
      if (x === 0) {
        ctx.moveTo(x, this.height * (1 - y));
      } else {
        ctx.lineTo(x, this.height * (1 - y));
      }
    }

    ctx.stroke();
  }

  private drawSignal(ctx: CanvasRenderingContext2D, color: string, signal: IfSignal): void {
    if (!SimulationManager.getInstance().isDeveloperMode) {
      return;
    }

    const center = ((signal.frequency - this.minFreq) / (this.maxFreq - this.minFreq)) * this.width;
    const inBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width) / 1.95;
    const outOfBandWidth = ((signal.bandwidth / (this.maxFreq - this.minFreq)) * this.width) / 1.6;

    // In developer mode we draw different color signals to make it easier to see what is happening
    ctx.strokeStyle = color;
    ctx.beginPath();

    for (let x = 0; x < this.width; x++) {
      const signalValue = this.createRealSignal(inBandWidth, x, signal, center, outOfBandWidth);
      const combinedValue = Math.max(signalValue, this.noiseData[x]);
      const y = (combinedValue - this.specA.state.minAmplitude) / this.range;

      if (x === 0) {
        ctx.moveTo(x, this.height * (1 - y));
      } else {
        ctx.lineTo(x, this.height * (1 - y));
      }
    }

    ctx.stroke();
  }

  private drawMarker(maxX: number, maxY: number, maxSignalFreq: number): void {
    const ctx = this.ctx;
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
      const freqMhz = (this.minFreq + (maxX * (this.maxFreq - this.minFreq)) / this.width) / 1e6 as MHz;
      ctx.fillText(`${freqMhz.toFixed(1)} MHz`, maxX - 20, this.height * maxY - 30);
      ctx.fillText(`${(maxSignalFreq).toFixed(1)} dB`, maxX - 20, this.height * maxY - 15);
    }
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
      if (!this.specA.state.isSkipLnaGainDuringDraw) {
        noise += this.specA.rfFrontEnd_.couplerModule.signalPathManager.getTotalRxGain();
      }

      data[x] = noise;
    }

    return data;
  }


  private createRealSignal(inBandWidth: number, x: number, signal: IfSignal | RfSignal, center: number, outOfBandWidth: number) {
    const distance = x - center;
    const absDist = Math.abs(distance);

    // Use outOfBandWidth as the basis for sigma to create a wider, more realistic Gaussian
    // This creates the smooth bell curve shape
    const sigma = outOfBandWidth / 3; // Adjust factor to control width
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
      // Very subtle side lobe effect (much smaller than before)
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
      y += -20 * (1 - decayFactor); // Additional -20 dB taper beyond the main signal
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

    return y;
  }

  protected resize(): void {
    // Fixed size for consistency
    return;
  }
}