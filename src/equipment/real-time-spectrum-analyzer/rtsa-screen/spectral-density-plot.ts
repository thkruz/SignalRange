import type { TraceMode } from '@app/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn';
import { findPeakPlateau, plateauAt } from '@app/equipment/real-time-spectrum-analyzer/peak-plateau';
import { RealTimeSpectrumAnalyzer } from '@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectrumDataProcessor } from '@app/equipment/real-time-spectrum-analyzer/spectrum-data-processor';
import { Rng } from '@app/simulation/rng';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { Hertz, IfSignal, RfSignal } from '@app/types';
import { RTSAScreen } from './rtsa-screen';

/** The frequency axis: one label per tick, and the unit they are in (drawn once) */
export interface FrequencyAxisLabels {
  labels: string[];
  unit: string;
}

/** Seeded draws for this module (see simulation/rng.ts). */
const random = (): number => Rng.stream('display:spectral-density').next();

/**
 * SpectralDensityPlot - Handles spectral density rendering
 * Data generation is delegated to SpectrumDataProcessor for separation of concerns
 */
export class SpectralDensityPlot extends RTSAScreen {
  // Animation
  private running: boolean = false;
  /** When the traces last took new data (ms) */
  private lastTraceTime_: number = 0;
  /** A new trace is waiting to be drawn */
  private isTraceDirty_: boolean = true;
  /** Frequency/amplitude window the traces were taken for */
  private traceWindowKey_: string = '';
  /** Frequency window the traces were taken for (a retune releases the Peak Search bin) */
  private traceFreqKey_: string = '';

  /** CSS size of the plot (drawing coordinates); the bitmap is this x devicePixelRatio */
  private plotWidth_: number;
  private plotHeight_: number;
  private dpr_: number = 1;
  /** Bitmap must be re-sized to the element before the next draw */
  private isSizeStale_: boolean = true;
  private resizeObserver_: ResizeObserver | null = null;

  /** Graticule label font: 11 CSS px, drawn at device resolution */
  static readonly LABEL_FONT = '11px Arial';
  /** Pixel size of LABEL_FONT, the height of an amplitude label's box */
  static readonly LABEL_FONT_PX = 11;
  /** Padding around an amplitude label's box */
  static readonly LABEL_BOX_PAD_PX = 2;
  /**
   * Opacity of the dark box behind an amplitude label: opaque, so no trace
   * shows through a number (phase 32 D12, r6-s01-F3)
   */
  static readonly LABEL_BOX_ALPHA = 1;

  /**
   * Label band under the trace area, CSS px (Phase 30 D21, nats-r4-s04-F4):
   * the frequency ticks and the bottom amplitude label sit here, so a floor on
   * the Min Amp line never runs through them
   */
  static readonly LABEL_BAND_PX = 16;

  // Data processor reference (shared data source)
  private readonly dataProcessor: SpectrumDataProcessor;

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
    maxhold: '#ff0000', // Red
    minhold: '#0000ff', // Blue
    average: '#ff00ff', // Magenta
    hold: '#4eb136ff', // Yellow (maintains color from before hold)
  };

  // Frequency label caching, per frequency window
  private readonly frequencyLabelCache: Map<string, FrequencyAxisLabels> = new Map();

  // Grid + labels ImageData caching
  private cachedGridImageData: ImageData | null = null;
  private cachedMinFreq: Hertz = 0 as Hertz;
  private cachedMaxFreq: Hertz = 0 as Hertz;
  private cachedMinAmplitude: number = 0;
  private cachedMaxAmplitude: number = 0;
  cachedReferenceLevel: number;

  constructor(canvas: HTMLCanvasElement, specA: RealTimeSpectrumAnalyzer, dataProcessor: SpectrumDataProcessor, width: number, height: number) {
    super(canvas, specA, width, height);

    // Store reference to shared data processor
    this.dataProcessor = dataProcessor;

    // Initialize 3 trace data arrays
    for (let i = 0; i < 3; i++) {
      this.traceData[i] = new Float32Array(this.width);
      // Initialize with -Infinity for max hold, Infinity for min hold
      this.traceData[i].fill(-Infinity);
    }

    // Calculate range
    this.range = this.specA.state.maxAmplitude - this.specA.state.minAmplitude;

    this.plotWidth_ = width;
    this.plotHeight_ = height;
    this.observeResize();

    // Start after a random delay to stagger multiple analyzers
    setTimeout(() => {
      this.running = true;
    }, random() * 1000);
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

  /**
   * Re-size the bitmap whenever the element's box changes (window resize, tab
   * layout, screen mode) so the plot is never a stretched image. Idempotent.
   */
  observeResize(): void {
    this.isSizeStale_ = true;
    if (this.resizeObserver_ || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver_ = new ResizeObserver(() => {
      this.isSizeStale_ = true;
    });
    this.resizeObserver_.observe(this.canvas);
  }

  /** Stop observing the canvas */
  dispose(): void {
    this.resizeObserver_?.disconnect();
    this.resizeObserver_ = null;
  }

  /** Key of the window a trace belongs to: a new centre, span or amplitude scale restarts the trace */
  private windowKey_(): string {
    const { minAmplitude, maxAmplitude } = this.specA.state;

    return `${this.minFreq}|${this.maxFreq}|${minAmplitude}|${maxAmplitude}`;
  }

  update(): void {
    if (!this.specA.state.isPaused && this.running) {
      const now = Date.now();
      const windowKey = this.windowKey_();
      // A changed window takes a trace at once (a real analyzer restarts its
      // sweep); otherwise a new trace every acquisition time, capped
      const isWindowChanged = windowKey !== this.traceWindowKey_;
      if (isWindowChanged || now - this.lastTraceTime_ >= this.specA.traceIntervalMs) {
        this.range = this.specA.state.maxAmplitude - this.specA.state.minAmplitude;
        this.cachedReferenceLevel = this.specA.state.referenceLevel;

        // Update each trace based on its mode
        for (let traceIndex = 0; traceIndex < 3; traceIndex++) {
          const trace = this.specA.state.traces[traceIndex];

          // Skip if trace is not visible or not updating
          if (!trace.isVisible || !trace.isUpdating) {
            continue;
          }

          this.updateTrace_(traceIndex, isWindowChanged ? 'clearwrite' : trace.mode);
        }

        // A centre or span change puts the marker's bin on another frequency:
        // release the marker completely, no re-pick on the new trace, so the
        // diamond and both readouts clear until the next Peak Search (phase 34
        // D2, r9-s03-F1). An amplitude-only change keeps it (same bin).
        const freqKey = `${this.minFreq}|${this.maxFreq}`;
        const state = this.specA.state;
        if (this.traceFreqKey_ !== '' && freqKey !== this.traceFreqKey_ && (state.peakMarkerBin !== undefined || state.isMarkerOn)) {
          state.peakMarkerBin = undefined;
          state.isMarkerOn = false;
          state.isUpdateMarkers = false;
        }
        this.traceFreqKey_ = freqKey;

        this.traceWindowKey_ = windowKey;
        this.lastTraceTime_ = now;
        this.isTraceDirty_ = true;
      }
    }
  }

  /**
   * Update a specific trace based on its mode
   */
  private updateTrace_(traceIndex: number, mode: TraceMode): void {
    // Get current frame data from the data processor
    const currentData = this.dataProcessor.combinedData;

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
          this.traceData[traceIndex][x] = this.traceData[traceIndex][x] * 0.8 + currentData[x] * 0.2;
        }
        break;

      case 'hold':
        // Do nothing - keep frozen data
        break;
    }
  }

  /**
   * Match the bitmap to the element's CSS box x devicePixelRatio and scale the
   * context so drawing stays in CSS pixels (crisp text and lines).
   */
  private syncCanvasSize_(): void {
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const cssWidth = this.canvas.clientWidth > 0 ? this.canvas.clientWidth : this.plotWidth_;
    const cssHeight = this.canvas.clientHeight > 0 ? this.canvas.clientHeight : this.plotHeight_;
    const bitmapWidth = Math.max(1, Math.round(cssWidth * dpr));
    const bitmapHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (this.canvas.width !== bitmapWidth || this.canvas.height !== bitmapHeight || dpr !== this.dpr_) {
      this.canvas.width = bitmapWidth;
      this.canvas.height = bitmapHeight;
      this.cachedGridImageData = null;
    }
    this.plotWidth_ = cssWidth;
    this.plotHeight_ = cssHeight;
    this.dpr_ = dpr;
    this.isSizeStale_ = false;
  }

  /** CSS width of the plot, px */
  get plotWidth(): number {
    return this.plotWidth_;
  }

  /** CSS height of the plot, px */
  get plotHeight(): number {
    return this.plotHeight_;
  }

  /**
   * The selected trace as drawn (any trace mode; frozen while paused): what
   * Peak Search reads (phase 33 D10, r7-s15-F1), or null with no such trace
   */
  get selectedTraceData(): Float32Array | null {
    return this.traceData[this.specA.state.selectedTrace - 1] ?? null;
  }

  /** Height (CSS px) of the trace area: the plot less the label band under it */
  private get traceHeight_(): number {
    return Math.max(1, this.plotHeight_ - SpectralDensityPlot.LABEL_BAND_PX);
  }

  /** X (CSS px) of trace point `index` */
  private xOf_(index: number): number {
    return ((index + 0.5) / this.width) * this.plotWidth_;
  }

  /** The cached grid is missing or was drawn for another frequency/amplitude window */
  private get isLayoutStale_(): boolean {
    return (
      !this.cachedGridImageData ||
      this.cachedMinFreq !== this.minFreq ||
      this.cachedMaxFreq !== this.maxFreq ||
      this.cachedMinAmplitude !== this.specA.state.minAmplitude ||
      this.cachedMaxAmplitude !== this.specA.state.maxAmplitude
    );
  }

  draw(): void {
    if (this.specA.state.isPaused || !this.running) {
      return;
    }
    // The bitmap may have been taken over by the waterfall (single-canvas
    // mode) or the element re-laid out
    if (this.isSizeStale_ || this.canvas.width !== Math.max(1, Math.round(this.plotWidth_ * this.dpr_))) {
      this.syncCanvasSize_();
    }

    // Grid and labels follow any centre/span/amplitude change at once; the
    // traces redraw when a new one is taken
    if (!this.isLayoutStale_ && !this.isTraceDirty_) {
      return;
    }

    this.paint_();
  }

  /**
   * Repaint while paused (phase 33 D10, r8-s01-F1): the cached grid, the frozen
   * traces, the amplitude labels and the markers, so a Peak Search or a marker
   * change shows on a paused screen. It never takes a trace (no `update()`).
   */
  redrawFrozen(): void {
    if (!this.running) {
      return;
    }
    if (this.isSizeStale_ || this.canvas.width !== Math.max(1, Math.round(this.plotWidth_ * this.dpr_))) {
      this.syncCanvasSize_();
    }
    this.paint_();
  }

  /** Grid (cached), traces, amplitude labels and markers, from the traces held now */
  private paint_(): void {
    const isLayoutStale = this.isLayoutStale_;
    const isDualScreenMode = this.canvas.id.endsWith('-spectral');
    this.range = this.specA.state.maxAmplitude - this.specA.state.minAmplitude;
    this.ctx.setTransform(this.dpr_, 0, 0, this.dpr_, 0, 0);

    if (isLayoutStale) {
      this.cachedGridImageData = this.generateGridImageData(isDualScreenMode);
      this.cachedMinFreq = this.minFreq;
      this.cachedMaxFreq = this.maxFreq;
      this.cachedMinAmplitude = this.specA.state.minAmplitude;
      this.cachedMaxAmplitude = this.specA.state.maxAmplitude;
    }

    // Restore cached grid + frequency labels (device pixels; putImageData ignores the transform)
    if (this.cachedGridImageData) {
      this.ctx.putImageData(this.cachedGridImageData, 0, 0);
    }
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

    // Amplitude labels go over the traces, each on its own dark box, so a
    // trace never strokes through a number (phase 31 D8, r6-s01-F3)
    this.drawPowerLabels(this.ctx, isDualScreenMode);

    this.updateTopMarkers();

    this.isTraceDirty_ = false;
  }

  /**
   * Draw a specific trace
   */
  private drawTrace_(ctx: CanvasRenderingContext2D, traceIndex: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.beginPath();

    ctx.lineWidth = 1;
    let isFirst = true;
    for (let x = 0; x < this.width; x++) {
      const amplitude = this.traceData[traceIndex][x];
      if (!Number.isFinite(amplitude)) {
        continue;
      }
      // Clamp to the graticule: a trace under Min Amp rides the bottom line
      const y = Math.max(0, Math.min(1, (amplitude - this.specA.state.minAmplitude) / this.range));

      if (isFirst) {
        ctx.moveTo(this.xOf_(x), this.traceHeight_ * (1 - y));
        isFirst = false;
      } else {
        ctx.lineTo(this.xOf_(x), this.traceHeight_ * (1 - y));
      }
    }

    ctx.stroke();
  }

  private updateTopMarkers() {
    const state = this.specA.state;
    if (!state.isMarkerOn) {
      state.peakMarkerBin = undefined;
    }
    const pinnedBin = state.peakMarkerBin;
    // The Peak Search marker stays on its bin and re-reads the level there
    // every sweep, so a notched-out spike reads its notched level (phase 33 D10)
    if (pinnedBin !== undefined) {
      state.isUpdateMarkers = true;
    }
    if (state.isUpdateMarkers) {
      // Find peaks in the currently selected trace
      state.topMarkers = [];

      const selectedTraceIndex = state.selectedTrace - 1;
      const selectedTraceData = this.traceData[selectedTraceIndex];

      if (!selectedTraceData) {
        state.isUpdateMarkers = false;
        return;
      }

      // The main pick: the Peak Search bin when one is held (it never
      // re-picks, phase 33 D10), else Peak Search's own rule: the whole trace,
      // above Max Amp too, a flat top within 0.5 dB read at its centre (phase 32 D11)
      const pick = pinnedBin !== undefined ? plateauAt(selectedTraceData, this.width, pinnedBin) : findPeakPlateau(selectedTraceData, this.width);

      // Other local maxima (peaks) for stepping the marker by hand
      const peaks: { x: number; signal: number }[] = [];

      // A flat top (a run of equal points) is one peak at its centre
      for (let x = 1; x < this.width - 1; x++) {
        const current = selectedTraceData[x];
        if (!(current > selectedTraceData[x - 1])) {
          continue;
        }
        let end = x;
        while (end + 1 < this.width && selectedTraceData[end + 1] === current) {
          end++;
        }
        const next = selectedTraceData[end + 1];
        const centre = x + Math.floor((end - x) / 2);
        const isOnPick = pick !== null && centre >= pick.start && centre <= pick.end;

        // Check if this is a local maximum
        if (!isOnPick && end + 1 < this.width && current > next && current > this.specA.noiseFloorAndGain + 3) {
          peaks.push({ x: centre, signal: current });
        }
        x = end;
      }

      // Sort by signal strength; the pick plus the top 9 others
      peaks.sort((a, b) => b.signal - a.signal);
      const topPeaks = peaks.slice(0, pick ? 9 : 10);
      if (pick) {
        topPeaks.unshift({ x: pick.bin, signal: selectedTraceData[pick.bin] });
      }

      // Convert to marker format: a peak outside the amplitude window keeps
      // its true level and sits clamped at the plot edge
      topPeaks.forEach((peak) => {
        const y = (peak.signal - state.minAmplitude) / this.range;
        state.topMarkers.push({
          x: peak.x,
          y: 1 - Math.max(0, Math.min(1, y)),
          signal: peak.signal,
        });
      });

      // If less than 10 markers, fill with remaining trace points on screen
      if (state.topMarkers.length < 10) {
        for (let x = 0; x < this.width && state.topMarkers.length < 10; x++) {
          const signal = selectedTraceData[x];
          const y = (signal - state.minAmplitude) / this.range;

          if (y > 0 && y < 1) {
            // Check if we already have a marker near this position
            const tooClose = state.topMarkers.some((m) => Math.abs(m.x - x) < 10);
            if (!tooClose) {
              state.topMarkers.push({
                x,
                y: 1 - y,
                signal,
              });
            }
          }
        }
      }

      // Sort markers in ascending x order for drawing
      state.topMarkers.sort((a, b) => a.x - b.x);

      // The marker sits on the pick (the Peak Search bin); without one, on the highest marker
      state.markerIndex = 0;
      if (pick) {
        state.markerIndex = Math.max(
          0,
          state.topMarkers.findIndex((marker) => marker.x === pick.bin)
        );
      } else {
        let highestSignal = -Infinity;
        state.topMarkers.forEach((marker, index) => {
          if (marker.signal > highestSignal) {
            highestSignal = marker.signal;
            state.markerIndex = index;
          }
        });
      }

      state.isUpdateMarkers = false;
    }

    // Draw marker for the current selected marker
    if (state.isMarkerOn && state.topMarkers.length > 0) {
      const marker = state.topMarkers[state.markerIndex] ?? state.topMarkers[0];
      this.drawMarker(marker.x, marker.y, marker.signal);
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

  /**
   * Exact frequency tick labels (phase 33 D12, r8-s15-F1): the ticks from
   * `minHz` to `maxHz` in `numTicks` steps, in whole Hz, written in the unit
   * that gives the shortest text (MHz on a tie, then fewer decimals) with the
   * fewest decimals d at which every tick is whole at 10^-d of that unit. The
   * digits come from integer arithmetic, never toFixed on a float, so 1490/75
   * reads 1452.5, 1460.0, 1467.5 ... MHz. The unit is drawn once, as a tag.
   */
  static frequencyAxisLabels(minHz: number, maxHz: number, numTicks: number = 10): FrequencyAxisLabels {
    const ticksHz: number[] = [];
    for (let i = 0; i <= numTicks; i++) {
      ticksHz.push(Math.round(minHz + ((maxHz - minHz) * i) / numTicks));
    }

    let best: FrequencyAxisLabels | null = null;
    let bestLength = Infinity;
    let bestDecimals = Infinity;
    for (const { unit, exponent } of SpectralDensityPlot.FREQUENCY_UNITS_) {
      // Smallest d whose resolution 10^(exponent - d) Hz divides every tick
      let decimals = 0;
      while (decimals < exponent && !ticksHz.every((hz) => hz % 10 ** (exponent - decimals) === 0)) {
        decimals++;
      }
      const resolutionHz = 10 ** (exponent - decimals);
      const scale = 10 ** decimals;
      const labels = ticksHz.map((hz) => {
        const steps = Math.round(Math.abs(hz) / resolutionHz);
        const whole = Math.floor(steps / scale);
        const fraction = decimals > 0 ? `.${String(steps % scale).padStart(decimals, '0')}` : '';

        return `${hz < 0 ? '-' : ''}${whole}${fraction}`;
      });
      const length = Math.max(...labels.map((label) => label.length));
      if (length < bestLength || (length === bestLength && decimals < bestDecimals && best?.unit !== 'MHz')) {
        best = { labels, unit };
        bestLength = length;
        bestDecimals = decimals;
      }
    }

    return best ?? { labels: ticksHz.map(String), unit: 'Hz' };
  }

  /** Units the frequency axis can use, MHz first so it wins a tie */
  private static readonly FREQUENCY_UNITS_: readonly { unit: string; exponent: number }[] = [
    { unit: 'MHz', exponent: 6 },
    { unit: 'GHz', exponent: 9 },
    { unit: 'kHz', exponent: 3 },
    { unit: 'Hz', exponent: 0 },
  ];

  /** Least clear space between two frequency labels' boxes, CSS px */
  static readonly TICK_GAP_PX = 2;

  /** Frequency divisions across the plot (NUM_FREQ_DIVISIONS + 1 tick labels) */
  static readonly NUM_FREQ_DIVISIONS = 10;

  /** The frequency axis for the current window, cached per window */
  private frequencyAxis_(): FrequencyAxisLabels {
    const cacheKey = `${this.minFreq}|${this.maxFreq}`;
    let axis = this.frequencyLabelCache.get(cacheKey);
    if (!axis) {
      axis = SpectralDensityPlot.frequencyAxisLabels(this.minFreq, this.maxFreq, SpectralDensityPlot.NUM_FREQ_DIVISIONS);
      this.frequencyLabelCache.set(cacheKey, axis);
    }

    return axis;
  }

  private drawFrequencyLabels(ctx: CanvasRenderingContext2D, _isDualScreenMode: boolean): void {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'bottom';
    ctx.font = SpectralDensityPlot.LABEL_FONT;

    const numLabels = SpectralDensityPlot.NUM_FREQ_DIVISIONS;
    const inset = 4;
    const y = this.plotHeight_ - inset;
    const { labels } = this.frequencyAxis_();

    // Every tick from start to stop; the band is the frequency axis's alone
    // (the Min Amp label sits above it, phase 33 D12), so tick 0 starts at the
    // inset and the end labels stay on the plot
    const ticks: { x: number; text: string; align: CanvasTextAlign; left: number; right: number }[] = [];
    for (let i = 0; i <= numLabels; i++) {
      const text = labels[i];
      const width = ctx.measureText(text).width;
      let align: CanvasTextAlign = 'center';
      let textX = (i / numLabels) * this.plotWidth_;
      let left = textX - width / 2;
      if (i === 0) {
        align = 'left';
        textX = inset;
        left = inset;
      } else if (i === numLabels) {
        align = 'right';
        textX = this.plotWidth_ - inset;
        left = textX - width;
      }
      ticks.push({ x: textX, text, align, left, right: left + width });
    }

    // Start, stop and centre go first, then the rest left to right; tick 0
    // always draws, and no label draws whose box would come within
    // TICK_GAP_PX of one already drawn, so two labels never run together
    // (a 2 kHz span at 1074.5 MHz has 9-character labels, phase 33 D12)
    const order = [0, numLabels, numLabels / 2, ...ticks.keys()];
    const gap = SpectralDensityPlot.TICK_GAP_PX;
    const drawn: { left: number; right: number }[] = [];
    const overlaps = (t: { left: number; right: number }): boolean => drawn.some((d) => t.left < d.right + gap && t.right > d.left - gap);
    for (const i of order) {
      const tick = ticks[i];
      if (drawn.includes(tick) || (i !== 0 && overlaps(tick))) {
        continue;
      }
      ctx.textAlign = tick.align;
      ctx.fillText(tick.text, tick.x, y);
      drawn.push(tick);
    }
    ctx.restore();
  }

  /**
   * Amplitude (dBm) labels, drawn after the traces each on a small translucent
   * dark box so the trace never overdraws a number (phase 31 D8). Every
   * graticule line is labelled, top (Max Amp) to bottom (Min Amp); the top
   * label sits inside the plot and the bottom one just above the bottom grid
   * line, inside the trace area, so the label band is the frequency axis's
   * (phase 33 D12). The units are tags: dBm beside the top label, the
   * frequency unit at the bottom right.
   */
  private drawPowerLabels(ctx: CanvasRenderingContext2D, isDualScreenMode: boolean): void {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.font = SpectralDensityPlot.LABEL_FONT;

    const numLabels = isDualScreenMode ? 5 : 10;
    // Boxes start at the left edge (phase 32 D12): no trace sliver beside them
    const pad = SpectralDensityPlot.LABEL_BOX_PAD_PX;
    const inset = 4;
    const { maxAmplitude, minAmplitude } = this.specA.state;
    for (let i = 0; i <= numLabels; i++) {
      const lineY = (i / numLabels) * this.traceHeight_;
      const power = maxAmplitude + ((minAmplitude - maxAmplitude) * i) / numLabels;
      let y = lineY;
      let baseline: CanvasTextBaseline = 'middle';
      if (i === 0) {
        baseline = 'top';
        y = inset;
      } else if (i === numLabels) {
        baseline = 'bottom';
        y = this.traceHeight_ - pad - 2;
      }
      const decimals = Number.isInteger(power) ? 0 : 1;
      this.drawBoxedLabel_(ctx, power.toFixed(decimals), pad, y, baseline);
    }
    this.drawBoxedLabel_(ctx, 'dBm', pad + 34, inset, 'top');
    const { unit } = this.frequencyAxis_();
    this.drawBoxedLabel_(ctx, unit, this.plotWidth_ - pad - ctx.measureText(unit).width, this.traceHeight_ - pad - 2, 'bottom');
    ctx.restore();
  }

  /** One label on an opaque dark box sized to the text (LABEL_BOX_PAD_PX padding) */
  private drawBoxedLabel_(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, baseline: CanvasTextBaseline): void {
    const pad = SpectralDensityPlot.LABEL_BOX_PAD_PX;
    const height = SpectralDensityPlot.LABEL_FONT_PX;
    const width = ctx.measureText(text).width;
    let top = y - height / 2;
    if (baseline === 'top') {
      top = y;
    } else if (baseline === 'bottom') {
      top = y - height;
    }
    ctx.globalAlpha = SpectralDensityPlot.LABEL_BOX_ALPHA;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - pad, top - pad, width + 2 * pad, height + 2 * pad);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = baseline;
    ctx.fillText(text, x, y);
  }

  /**
   * Generates cached ImageData containing the grid overlay and frequency labels
   * (the amplitude labels are drawn over the traces each frame, phase 31 D8).
   * This is only regenerated when frequency or power range changes
   */
  private generateGridImageData(isDualScreenMode: boolean): ImageData {
    // Clear canvas to black
    this.clearCanvas(this.ctx);

    // Draw grid overlay
    this.drawGridOverlay(this.ctx, isDualScreenMode);

    // Draw frequency labels
    this.drawFrequencyLabels(this.ctx, isDualScreenMode);

    // Capture the whole bitmap (device pixels)
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Canvas Drawing Methods
   */

  private clearCanvas(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.plotWidth_, this.plotHeight_);
  }

  private drawGridOverlay(ctx: CanvasRenderingContext2D, isDualScreenMode: boolean): void {
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = 'white';

    // Vertical lines (10 divisions, both edges)
    for (let i = 0; i <= 10; i++) {
      const x = Math.min(this.plotWidth_ - 1, (i / 10) * this.plotWidth_);
      ctx.fillRect(x, 0, 1, this.traceHeight_);
    }

    // Horizontal lines, both edges
    const numLines = isDualScreenMode ? 5 : 10;
    for (let i = 0; i <= numLines; i++) {
      const y = Math.min(this.traceHeight_ - 1, (i / numLines) * this.traceHeight_);
      ctx.fillRect(0, y, this.plotWidth_, 1);
    }

    ctx.globalAlpha = 1.0;
  }

  drawNoise(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = this.noiseColor;
    ctx.beginPath();

    // Use noise data from the data processor
    const noiseData = this.dataProcessor.noiseData;
    for (let x = 0, len = noiseData.length; x < len; x++) {
      const currentAmplitude = noiseData[x];
      // calculate y position
      const y = (currentAmplitude - this.specA.state.minAmplitude) / this.range;
      if (x === 0) {
        ctx.moveTo(this.xOf_(x), this.traceHeight_ * (1 - y));
      } else {
        ctx.lineTo(this.xOf_(x), this.traceHeight_ * (1 - y));
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

    // Use noise data from the data processor
    const noiseData = this.dataProcessor.noiseData;

    for (let x = 0; x < this.width; x++) {
      const signalValue = this.createRealSignal(inBandWidth, x, signal, center, outOfBandWidth);
      const combinedValue = Math.max(signalValue, noiseData[x]);
      const y = (combinedValue - this.specA.state.minAmplitude) / this.range;

      if (x === 0) {
        ctx.moveTo(this.xOf_(x), this.traceHeight_ * (1 - y));
      } else {
        ctx.lineTo(this.xOf_(x), this.traceHeight_ * (1 - y));
      }
    }

    ctx.stroke();
  }

  /**
   * Lowest y (CSS px) of the marker's tip: the diamond is 10 px tall, so a
   * marker clamped at the top edge (a peak above Max Amp) still shows whole
   */
  static readonly MARKER_MIN_TIP_PX = 10;

  /**
   * A marker frequency in MHz with six decimals, from whole Hz in integer
   * arithmetic (phase 34 D3, r9-s15-F1): the plot label, the Peak and Mkr
   * readouts and the SPEC A Peak Search line all print it, so one pick reads
   * the same everywhere. Never `toFixed` on a float (phase 33 D12).
   */
  static formatMarkerMHz(hz: number): string {
    const n = Math.round(hz);
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);

    return `${sign}${Math.trunc(abs / 1e6)}.${String(abs % 1e6).padStart(6, '0')}`;
  }

  /**
   * The marker diamond with its tip on the trace (phase 33 D11, r8-s09-F1),
   * frequency and level above it, or below it when the two lines do not fit
   * above (a peak near Max Amp). Each line sits on an opaque box like the
   * amplitude labels, so no trace runs through it (phase 34 D3, r9-s12-F1)
   */
  private drawMarker(markerIndex: number, markerY: number, levelDbm: number): void {
    const ctx = this.ctx;
    if (markerIndex > 0) {
      const x = this.xOf_(markerIndex);
      const y = Math.max(SpectralDensityPlot.MARKER_MIN_TIP_PX, this.traceHeight_ * markerY);

      // Draw diamond marker
      ctx.beginPath();
      ctx.fillStyle = '#f00';
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y - 5);
      ctx.lineTo(x, y - 10);
      ctx.lineTo(x + 5, y - 5);
      ctx.lineTo(x, y);
      ctx.fill();

      // Frequency and level, kept inside the plot
      ctx.save();
      ctx.font = SpectralDensityPlot.LABEL_FONT;
      ctx.textAlign = 'left';
      const freqHz = this.minFreq + ((markerIndex + 0.5) * (this.maxFreq - this.minFreq)) / this.width;
      const lines = [`${SpectralDensityPlot.formatMarkerMHz(freqHz)} MHz`, `${levelDbm.toFixed(1)} dBm`];
      const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const textX = Math.min(Math.max(4, x - textWidth / 2), this.plotWidth_ - textWidth - 4);
      // One boxed line is LABEL_FONT_PX + 2 pads tall; the boxes stack without
      // overlapping and the lower one ends above the diamond (y - 10 .. y)
      const pad = SpectralDensityPlot.LABEL_BOX_PAD_PX;
      const step = SpectralDensityPlot.LABEL_FONT_PX + 2 * pad;
      const nearBottom = y - 10 - pad - 1;
      const isRoomAbove = nearBottom - step - SpectralDensityPlot.LABEL_FONT_PX - pad >= 0;
      if (isRoomAbove) {
        this.drawBoxedLabel_(ctx, lines[0], textX, nearBottom - step, 'bottom');
        this.drawBoxedLabel_(ctx, lines[1], textX, nearBottom, 'bottom');
      } else {
        const nearTop = y + 4;
        this.drawBoxedLabel_(ctx, lines[0], textX, nearTop, 'top');
        this.drawBoxedLabel_(ctx, lines[1], textX, nearTop + step, 'top');
      }
      ctx.restore();
    }
  }

  /**
   * Signal Processing Methods
   * Note: Noise generation is now handled by SpectrumDataProcessor
   * This method is kept only for developer mode visualization
   */

  private createRealSignal(inBandWidth: number, x: number, signal: IfSignal | RfSignal, center: number, outOfBandWidth: number) {
    const distance = x - center;
    const absDist = Math.abs(distance);

    // Use outOfBandWidth as the basis for sigma to create a wider, more realistic Gaussian
    // This creates the smooth bell curve shape
    const sigma = outOfBandWidth / 3; // Adjust factor to control width
    const gaussian = Math.exp(-0.5 * (distance / sigma) ** 2);

    // Convert gaussian to dB (this creates the smooth exponential rise/fall)
    const gaussianDb = 20 * Math.log10(Math.max(gaussian, 1e-10));

    // Start with the Gaussian shape
    let y = signal.power + gaussianDb;

    // Main lobe (center region) - add minimal jitter
    if (absDist <= inBandWidth) {
      y += (random() - 0.5) * 0.4;
    }
    // Transition region - slight additional rolloff for realism
    else if (absDist <= outOfBandWidth * 0.7) {
      y += (random() - 0.5) * 0.6;
      // Very subtle side lobe effect (much smaller than before)
      const sideLobeEffect = Math.sin((distance / outOfBandWidth) * Math.PI * 4) * 0.5;
      y += sideLobeEffect;
    }
    // Outer region - more pronounced side lobes and taper
    else if (absDist <= outOfBandWidth) {
      const sideLobeEffect = Math.sin((distance / outOfBandWidth) * Math.PI * 6) * 0.8;
      y += sideLobeEffect + (random() - 0.5) * 1.0;
    }
    // Beyond outOfBandWidth - natural exponential decay
    else {
      const excessDistance = absDist - outOfBandWidth;
      const decayFactor = Math.exp(-excessDistance / (outOfBandWidth * 0.3));
      y += -20 * (1 - decayFactor); // Additional -20 dB taper beyond the main signal
      y += (random() - 0.5) * 1.5;
    }

    // Simulate occasional deep nulls for realism
    if (random() < 0.001) {
      y -= 10 + random() * 4;
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
