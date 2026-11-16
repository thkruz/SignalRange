import { HelpButton } from '@app/components/help-btn/help-btn';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { BaseEquipment } from '@app/equipment/base-equipment';
import type { TraceMode } from '@app/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Logger } from '@app/logging/logger';
import { T0_K, thermalNoiseDbm } from '@app/simulation/noise-model';
import { Rng } from '@app/simulation/rng';
import { dB, Hertz, IfSignal, RfSignal } from '@app/types';
import { AnalyzerControlBox } from './analyzer-control-box';
import { defaultSpectrumAnalyzerState } from './defaultSpectrumAnalyzerState';
import { findPeakPlateau } from './peak-plateau';
import './real-time-spectrum-analyzer.css';
import { SpectralDensityPlot } from '@app/equipment/real-time-spectrum-analyzer/rtsa-screen/spectral-density-plot';
import { WaterfallDisplay } from '@app/equipment/real-time-spectrum-analyzer/rtsa-screen/waterfall-display';
import { SpectrumDataProcessor } from './spectrum-data-processor';

/** Seeded draws for this module (see simulation/rng.ts). */
const random = (): number => Rng.stream('display:analyzer').next();

type MarkerPoint = { x: number; y: number; signal: number };

export type SpectrumDetector = 'sample' | 'peak' | 'average';

/** Noise bandwidth of a Gaussian RBW filter relative to its -3 dB width */
export const GAUSSIAN_RBW_ENBW_FACTOR = Math.sqrt(Math.PI / (4 * Math.LN2));

/** Default instrument noise figure (no preamp), dB */
export const DEFAULT_ANALYZER_NF_DB = 22;

/** Auto VBW as a fraction of the RBW */
export const AUTO_VBW_RATIO = 0.1;

/**
 * Auto-coupled RBW for a span: about span / 300, rounded down to the 1-3-10
 * sequence, between 1 Hz and 10 MHz.
 */
export function autoRbwHz(spanHz: number): number {
  const target = Math.max(1, spanHz / 300);
  const decade = 10 ** Math.floor(Math.log10(target));
  const step = target / decade >= 3 ? 3 : 1;

  return Math.min(10e6, Math.max(1, step * decade));
}

/**
 * Most span/RBW one acquisition may resolve. An FFT analyzer's bin count caps
 * the ratio (real-time analyzers allow roughly 10,000 to 20,000), so a manual
 * RBW narrower than span / MAX_SPAN_TO_RBW is coupled up to the narrowest RBW
 * the span allows, and the instrument flags "RBW limited". The redraw pace is
 * capped separately (MAX_TRACE_INTERVAL_MS).
 */
export const MAX_SPAN_TO_RBW = 10_000;

/** The narrowest RBW a span allows: span / MAX_SPAN_TO_RBW rounded up to the 1-3-10 sequence */
export function minRbwForSpanHz(spanHz: number): number {
  const target = Math.max(1, spanHz / MAX_SPAN_TO_RBW);
  const decade = 10 ** Math.floor(Math.log10(target));
  const ratio = target / decade;
  let step = 10;
  if (ratio <= 1 + 1e-9) {
    step = 1;
  } else if (ratio <= 3 + 1e-9) {
    step = 3;
  }

  return Math.min(10e6, step * decade);
}

/**
 * Longest the display waits for a new trace, ms. An FFT (real-time) analyzer
 * needs about 2.5 / RBW of samples per trace; a swept one span / RBW^2 times
 * k. Either way the screen never sits frozen longer than this.
 */
export const MAX_TRACE_INTERVAL_MS = 2000;

/** Acquisition time of one FFT trace for a Gaussian RBW window, seconds x RBW */
const FFT_ACQUISITION_RBW_PRODUCT = 2.5;

/** A 1-2-5 step at or above `value` */
export function roundUp125(value: number): number {
  if (!(value > 0)) {
    return value;
  }
  const decade = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (step * decade >= value * (1 - 1e-9)) {
      return step * decade;
    }
  }

  return 10 * decade;
}

/** Smallest span AUTO-TUNE sets, Hz: a CW beacon then shows its line with room either side */
export const AUTO_TUNE_MIN_SPAN_HZ = 2e3;

export interface RealTimeSpectrumAnalyzerState {
  /** AUTO-TUNE offered (default true); a scenario that teaches finding a signal by hand turns it off */
  isAutoTuneAvailable?: boolean;
  /** Scale in dB per division */
  scaleDbPerDiv: dB;
  isUseTapB: boolean;
  isUseTapA: boolean;
  /** This is the reference level that all dBm values are relative to */
  referenceLevel: number;
  minFrequency: Hertz;
  maxFrequency: Hertz;
  lastSpan: Hertz;
  inputUnit: 'Hz' | 'kHz' | 'MHz' | 'GHz' | 'dBm' | 'dBW' | 'W';
  inputValue: string;
  uuid: string;
  team_id: number;
  rfFeUuid: string;
  isPaused: boolean;
  /**
   * Displayed mean noise level (dBm in the RBW's noise bandwidth): the line
   * noise at the tap plus the instrument's own noise referred to the line,
   * power-summed (Phase 19.2). Gain is already included.
   */
  noiseFloorNoGain: number;
  /** Legacy flag: true when noiseFloorNoGain already carries the gain (always, since 19.2) */
  isSkipLnaGainDuringDraw: boolean;
  /**
   * Instrument noise figure, dB (no preamp: 20-25 dB typical). Its noise
   * kT0·B·F is referred to the line through the tap's coupling factor, as the
   * analyzer's amplitude offset makes the display read line power.
   */
  noiseFigureDb?: number;
  /** Video bandwidth, Hz; null = auto (RBW / 10) */
  vbw?: Hertz | null;
  /** Detector: sample (one bin per pixel), peak (max of the bins in a pixel), average (power mean) */
  detector?: SpectrumDetector;
  isMaxHold: boolean;
  isMinHold: boolean;
  isMarkerOn: boolean;
  isUpdateMarkers: boolean;
  /**
   * The bin Peak Search put the marker on (phase 33 D10, supersedes the Phase 30
   * D11 tracking): the marker stays on it and its level is re-read there every
   * sweep, so a notched-out spike reads its notched level. Cleared when the
   * marker is turned off or moved by hand, or the frequency window changes.
   */
  peakMarkerBin?: number;
  topMarkers: MarkerPoint[];
  markerIndex: number;
  refreshRate: number; // in Hz
  centerFrequency: Hertz; // Hz - center frequency
  span: Hertz;
  rbw: Hertz | null; // Resolution Bandwidth
  lockedControl: 'freq' | 'span';
  hold: boolean; // Hold max amplitude
  minAmplitude: number;
  maxAmplitude: number;
  screenMode: 'spectralDensity' | 'waterfall' | 'both';
  /** Multi-trace support - 3 independent traces */
  traces: {
    isVisible: boolean;
    isUpdating: boolean;
    mode: TraceMode;
  }[];
  /** Currently selected trace (1-3) */
  selectedTrace: number;
}

/**
 * SpectrumAnalyzer - Configuration and settings manager
 * Delegates data generation to SpectrumDataProcessor and rendering to screen components
 */
export class RealTimeSpectrumAnalyzer extends BaseEquipment {
  state: RealTimeSpectrumAnalyzerState;

  // Data processor - centralized data generation
  private dataProcessor: SpectrumDataProcessor;

  /** Shared spectrum data source (read-only view for campaign UIs like the SDR Console) */
  get spectrumDataProcessor(): SpectrumDataProcessor {
    return this.dataProcessor;
  }

  // Screen renderer
  screen: SpectralDensityPlot | WaterfallDisplay | null = null;
  spectralDensity: SpectralDensityPlot | null = null;
  waterfall: WaterfallDisplay | null = null;
  // For "both" mode, we need separate instances
  spectralDensityBoth: SpectralDensityPlot | null = null;
  waterfallBoth: WaterfallDisplay | null = null;

  // RFFrontEndCore reference
  readonly rfFrontEnd_: RFFrontEndCore;

  private readonly helpBtn_: HelpButton;
  configPanel: AnalyzerControlBox | null = null;
  inputSignals: IfSignal[] = [];
  prevState: any;

  constructor(parentId: string, rfFrontEnd: RFFrontEndCore, initialState: Partial<RealTimeSpectrumAnalyzerState> = {}, teamId: number = 1) {
    super(teamId);

    this.rfFrontEnd_ = rfFrontEnd;

    // Initialize config
    this.state = { ...this.state, ...defaultSpectrumAnalyzerState, ...initialState };

    this.state.inputValue = (this.state.centerFrequency / 1e6).toString(); // in MHz
    this.state.inputUnit = 'MHz';
    this.state.uuid = this.uuid;
    this.state.team_id = this.teamId;
    this.state.rfFeUuid = this.rfFrontEnd_.state.uuid; // RF is hard linked to antenna

    this.helpBtn_ = HelpButton.create(
      `rtsa-help-${this.uuid}`,
      'Real-Time Spectrum Analyzer',
      null,
      'https://docs.signalrange.space/equipment/real-time-spectrum-analyzer?content-only=true&dark=true'
    );

    this.configPanel = new AnalyzerControlBox(this);
    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.sync.bind(this));
    EventBus.getInstance().on(Events.DRAW, this.draw.bind(this));
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
        <div class="equipment-case spectrum-analyzer-box">
        <div class="equipment-case-header">
          <div class="equipment-case-title">
            <span>Spectrum Analyzer ${this.uuidShort}</span>
            ${this.helpBtn_.html}
          </div>
          <div class="equipment-case-power-controls">
            <div class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div class="led ${this.state.isPaused ? 'led-amber' : 'led-green'}"></div>
            </div>
          </div>
        </div>

        <div class="spec-a-canvas-container row g-3">
          <canvas id="specA${this.uuid}" width="747" height="747" class="spec-a-canvas-single col-lg-12"></canvas>
          <canvas id="specA${this.uuid}-spectral" width="747" height="200" class="spec-a-canvas-spectral col-lg-12"></canvas>
          <canvas id="specA${this.uuid}-waterfall" width="747" height="200" class="spec-a-canvas-waterfall col-lg-12"></canvas>
        </div>

        <div class="spec-a-info-bar">
          <button class="spec-a-btn btn-config" data-action="config" title="Open Configuration Panel">
            <span class="icon-advanced">&#9881;</span>
          </button>
          <button class="spec-a-btn btn-tap-a" data-action="config" title="Enable/Disable Tap A">
            <span class="icon-advanced">A</span>
          </button>
          <button class="spec-a-btn btn-tap-b" data-action="config" title="Enable/Disable Tap B">
            <span class="icon-advanced">B</span>
          </button>
          <div class="spec-a-info">
            <div>CF: ${this.state.centerFrequency / 1e6} MHz</div>
            <div>Input: ${this.state.inputValue} ${this.state.inputUnit}</div>
            <div>RF Front End: ${this.state.rfFeUuid.split('-')[0]}</div>
          </div>
        </div>

        <!-- Bottom Status Bar -->
        <div class="equipment-case-footer">
          <div class="bottom-status-bar">
            SYSTEM NORMAL
          </div>
        </div>
      </div>
    `;

    // Cache all DOM references that might be needed later
    this.domCache['container'] = qs('.spectrum-analyzer-box', parentDom);
    this.domCache['info'] = qs('.spec-a-info', parentDom);
    this.domCache['canvas'] = qs(`#specA${this.uuid}`, parentDom);
    this.domCache['canvasSpectral'] = qs(`#specA${this.uuid}-spectral`, parentDom);
    this.domCache['canvasWaterfall'] = qs(`#specA${this.uuid}-waterfall`, parentDom);
    this.domCache['configButton'] = qs('.btn-config', parentDom);
    this.domCache['tapAButton'] = qs('.btn-tap-a', parentDom);
    this.domCache['tapBButton'] = qs('.btn-tap-b', parentDom);

    return parentDom;
  }

  protected addListeners_(): void {
    // config button listener
    this.domCache['configButton'].addEventListener('click', () => {
      this.openConfigPopupMenu();
    });

    // Tap A button listener
    this.domCache['tapAButton'].addEventListener('click', () => {
      this.state.isUseTapA = !this.state.isUseTapA;
      this.syncDomWithState();
    });

    // Tap B button listener
    this.domCache['tapBButton'].addEventListener('click', () => {
      this.state.isUseTapB = !this.state.isUseTapB;
      this.syncDomWithState();
    });

    // Listen for antenna changes
    this.subscribeToAntennaEvents();
  }

  private subscribeToAntennaEvents(): void {
    this.on(Events.ANTENNA_STATE_CHANGED, (data) => {
      this.updateConfigChange(data);
    });
  }

  private updateConfigChange(data: any): void {
    if (data.unit === this.state.uuid) {
      this.state = { ...this.state, ...data };

      if (data.frequency) {
        this.state.centerFrequency = data.frequency;
      }
    }

    this.syncDomWithState();
  }

  protected initialize_(): void {
    if (!this.domCache['canvas']) throw new Error('Canvas element not found for Spectrum Analyzer');
    if (!this.domCache['canvasSpectral']) throw new Error('Spectral canvas element not found for Spectrum Analyzer');
    if (!this.domCache['canvasWaterfall']) throw new Error('Waterfall canvas element not found for Spectrum Analyzer');

    // Initialize data processor - centralized data generation
    this.dataProcessor = new SpectrumDataProcessor(this, 824);

    // Initialize single-mode screens with shared data processor
    this.spectralDensity = new SpectralDensityPlot(this.domCache['canvas'] as HTMLCanvasElement, this, this.dataProcessor, 824, 460);
    this.waterfall = new WaterfallDisplay(this.domCache['canvas'] as HTMLCanvasElement, this, this.dataProcessor, 824, 460);

    // Initialize "both" mode screens with their dedicated canvases and shared data processor
    this.spectralDensityBoth = new SpectralDensityPlot(this.domCache['canvasSpectral'] as HTMLCanvasElement, this, this.dataProcessor, 824, 230);
    this.waterfallBoth = new WaterfallDisplay(this.domCache['canvasWaterfall'] as HTMLCanvasElement, this, this.dataProcessor, 824, 230);

    // Set initial screen mode
    this.updateScreenVisibility();

    // Set initial state
    this.updateScreenState();
  }

  /**
   * Update canvas visibility based on screen mode
   */
  updateScreenVisibility(): void {
    const singleCanvas = this.domCache['canvas'] as HTMLCanvasElement;
    const spectralCanvas = this.domCache['canvasSpectral'] as HTMLCanvasElement;
    const waterfallCanvas = this.domCache['canvasWaterfall'] as HTMLCanvasElement;

    if (this.state.screenMode === 'both') {
      // Hide single canvas, show both canvases
      singleCanvas.style.display = 'none';
      spectralCanvas.style.display = 'block';
      waterfallCanvas.style.display = 'block';
    } else {
      // Show single canvas, hide both canvases
      singleCanvas.style.display = 'block';
      spectralCanvas.style.display = 'none';
      waterfallCanvas.style.display = 'none';
    }
  }

  /**
   * Update screen with current configuration
   */
  private updateScreenState(): void {
    // Update frequency range
    const minFreq = (this.state.centerFrequency - this.state.span / 2) as Hertz;
    const maxFreq = (this.state.centerFrequency + this.state.span / 2) as Hertz;

    // Update data processor frequency range (shared by all screens)
    this.dataProcessor.setFrequencyRange(minFreq, maxFreq);

    switch (this.state.screenMode) {
      case 'spectralDensity':
        this.screen = this.spectralDensity!;
        this.screen.setFrequencyRange(minFreq, maxFreq);
        break;
      case 'waterfall':
        this.screen = this.waterfall!;
        this.screen.setFrequencyRange(minFreq, maxFreq);
        break;
      case 'both':
        // In both mode, we'll handle updates differently
        this.screen = null;
        if (this.spectralDensityBoth) {
          this.spectralDensityBoth.setFrequencyRange(minFreq, maxFreq);
        }
        if (this.waterfallBoth) {
          this.waterfallBoth.setFrequencyRange(minFreq, maxFreq);
        }
        break;
    }
  }

  /**
   * API Methods
   */

  sync(spectrumAnalyzerState: RealTimeSpectrumAnalyzerState): void {
    this.state = { ...this.state, ...spectrumAnalyzerState };
    this.syncDomWithState();
  }

  update(): void {
    // Determine tap point and get input signals
    this.inputSignals = this.getInputSignals();

    this.updateScreenState();

    if (!this.state.isPaused) {
      // Generate spectrum data once (shared by all screens)
      this.dataProcessor.generateData();

      // Update screens with the generated data
      if (this.state.screenMode === 'both') {
        // Update both screens in "both" mode
        if (this.spectralDensityBoth) {
          this.spectralDensityBoth.update();
        }
        if (this.waterfallBoth) {
          this.waterfallBoth.update();
        }
      } else if (this.screen) {
        this.screen.update();
      }
    }

    this.syncDomWithState();
  }

  /**
   * The RBW in use: the auto-coupled one for the span, or the set value
   * coupled up to the narrowest the span allows (see MAX_SPAN_TO_RBW)
   */
  get effectiveRbwHz(): number {
    if (this.state.rbw === null || this.state.rbw === undefined) {
      return autoRbwHz(this.state.span);
    }

    return Math.max(this.state.rbw, minRbwForSpanHz(this.state.span));
  }

  /** True when a manual RBW is too narrow for the span and the instrument is using a wider one */
  get isRbwLimited(): boolean {
    return this.state.rbw !== null && this.state.rbw !== undefined && this.state.rbw < minRbwForSpanHz(this.state.span);
  }

  /**
   * Time between traces, ms: the FFT acquisition time for the RBW (about
   * 2.5 / RBW), no faster than the refresh rate, never longer than
   * MAX_TRACE_INTERVAL_MS.
   */
  get traceIntervalMs(): number {
    const acquisitionMs = (FFT_ACQUISITION_RBW_PRODUCT / this.effectiveRbwHz) * 1000;
    const refreshMs = 1000 / Math.max(0.1, this.state.refreshRate || 10);

    return Math.min(MAX_TRACE_INTERVAL_MS, Math.max(acquisitionMs, refreshMs));
  }

  /**
   * The spectral plot on screen: the full-size one, the upper half in "both"
   * mode, or null in waterfall-only mode
   */
  get visibleSpectralPlot(): SpectralDensityPlot | null {
    switch (this.state.screenMode) {
      case 'spectralDensity':
        return this.spectralDensity;
      case 'both':
        return this.spectralDensityBoth;
      default:
        return null;
    }
  }

  /**
   * Peak Search, one shot (phase 33 D10): the highest point of the trace on
   * screen (the visible plot's selected trace, whatever its mode: what the
   * operator sees, paused or live; the live data only in waterfall-only mode)
   * as frequency (Hz), level (dBm) at the picked bin, the bin and the trace
   * maximum, or null before the first trace. It searches the whole trace,
   * above Max Amp too, and reads a flat top (every bin within PEAK_PLATEAU_DB
   * of the maximum) at its centre (phase 32 D11).
   */
  peakSearch(): { frequencyHz: number; levelDbm: number; bin: number; maxDbm: number } | null {
    const plot = this.visibleSpectralPlot;
    const data = plot ? plot.selectedTraceData : this.dataProcessor?.combinedData;
    if (!data || data.length === 0) {
      return null;
    }
    const pick = findPeakPlateau(data);
    if (!pick) {
      return null;
    }
    const start = this.state.centerFrequency - this.state.span / 2;

    return {
      frequencyHz: start + ((pick.bin + 0.5) / data.length) * this.state.span,
      levelDbm: data[pick.bin],
      bin: pick.bin,
      maxDbm: pick.maxDbm,
    };
  }

  /**
   * Repaint the visible plot's frozen trace with the grid, amplitude labels and
   * markers while paused, without taking a new trace (phase 33 D10, r8-s01-F1),
   * so a Peak Search or marker change shows on a paused screen
   */
  redrawFrozen(): void {
    this.visibleSpectralPlot?.redrawFrozen();
  }

  /** The VBW in use: the set value, or RBW x AUTO_VBW_RATIO */
  get effectiveVbwHz(): number {
    return this.state.vbw ?? this.effectiveRbwHz * AUTO_VBW_RATIO;
  }

  /** Noise bandwidth of the (Gaussian) RBW filter, Hz */
  get noiseBandwidthHz(): number {
    return this.effectiveRbwHz * GAUSSIAN_RBW_ENBW_FACTOR;
  }

  getInputSignals(): (IfSignal | RfSignal)[] {
    const coupler = this.rfFrontEnd_.couplerModule;
    const spm = coupler.signalPathManager;
    const enbw = this.noiseBandwidthHz as Hertz;
    this.lastEnbwHz_ = enbw;

    const signals: (IfSignal | RfSignal)[] = [];
    const taps: TapPoint[] = [];
    if (this.state.isUseTapA) {
      taps.push(coupler.state.tapPointA);
    }
    if (this.state.isUseTapB) {
      taps.push(coupler.state.tapPointB);
    }

    // Displayed noise (Phase 19.2, Phase 30 D7): the line noise at each tap
    // (k·T·B in the RBW's noise bandwidth, with the gain up to the tap) plus
    // the instrument's own kT0·B·F, power-summed once. The instrument floor is
    // NOT referred through the coupling factor: with no gain ahead of the tap
    // (LNB off) the trace sits at the analyzer's own floor, about -92 dBm at
    // 1 MHz RBW, scaling 10 log(RBW) (nats-r5-s03-F4)
    const nf = this.state.noiseFigureDb ?? DEFAULT_ANALYZER_NF_DB;
    const instrumentDbm = thermalNoiseDbm(T0_K, enbw) + nf;
    let lineMw = 0;
    for (const tapPoint of taps) {
      signals.push(...this.getSignalsAtTapPoint(tapPoint));

      const { noiseFloorNoGain } = spm.getNoiseFloorAt(tapPoint, enbw);
      const line = noiseFloorNoGain + spm.getTotalGainTo(tapPoint);
      if (Number.isFinite(line)) {
        lineMw += 10 ** (line / 10);
      }
    }
    const totalMw = 10 ** (instrumentDbm / 10) + lineMw;

    // NOTE: signals are deliberately NOT clamped to the RBW. RBW sets the
    // display resolution and noise floor, not a signal's occupied bandwidth —
    // a 2 MHz signal viewed with a 30 kHz RBW still spans 2 MHz on screen.
    // (The data processor convolves each signal with the RBW filter.)

    this.state.noiseFloorNoGain = 10 * Math.log10(totalMw);
    this.lineNoiseDbm = lineMw > 0 ? 10 * Math.log10(lineMw) : Number.NEGATIVE_INFINITY;
    this.state.isSkipLnaGainDuringDraw = true;

    return signals;
  }

  /** Line noise alone at the enabled taps (dBm in the noise bandwidth), for the notch dip */
  lineNoiseDbm: number = Number.NEGATIVE_INFINITY;

  /** True when an enabled tap is downstream of the notch filter (RX IF), so its dip is on screen */
  get isNotchInView(): boolean {
    const coupler = this.rfFrontEnd_.couplerModule.state;

    return (this.state.isUseTapA && coupler.tapPointA === TapPoint.RX_IF) || (this.state.isUseTapB && coupler.tapPointB === TapPoint.RX_IF);
  }

  /**
   * Get signals at a specific tap point in the signal chain
   * @param tapPoint - The tap point location
   * @returns Array of signals at that tap point
   */
  private getSignalsAtTapPoint(tapPoint: TapPoint): (IfSignal | RfSignal)[] {
    switch (tapPoint) {
      case TapPoint.TX_IF:
        return this.rfFrontEnd_.bucModule.inputSignals;
      case TapPoint.TX_RF_POST_BUC:
        return this.rfFrontEnd_.bucModule.outputSignals;
      case TapPoint.TX_RF_POST_HPA:
        // Carriers plus the amplifier's IM3 products / regrowth (Phase 19.6)
        return [...this.rfFrontEnd_.hpaModule.outputSignals, ...this.rfFrontEnd_.hpaModule.distortionSignals];
      case TapPoint.TX_RF_POST_OMT:
        return [...this.rfFrontEnd_.omtModule.txSignalsOut, ...this.rfFrontEnd_.omtModule.txDistortionOut];
      case TapPoint.RX_RF_PRE_OMT:
        return this.rfFrontEnd_.antenna.state.rxSignalsIn;
      case TapPoint.RX_RF_POST_OMT:
        return this.rfFrontEnd_.omtModule.rxSignalsOut;
      case TapPoint.RX_RF_POST_LNA:
        return this.rfFrontEnd_.lnbModule.postLNASignals;
      case TapPoint.RX_IF:
        // Signal path: LNB → IF Filter → Notch Filter → AGC
        return this.rfFrontEnd_.agcModule.outputSignals;
      default:
        throw new Error(`Unknown tap point: ${tapPoint}`);
    }
  }

  draw(): void {
    if (!this.state.isPaused) {
      if (this.state.screenMode === 'both') {
        // Draw both screens in "both" mode
        if (this.spectralDensityBoth) {
          this.spectralDensityBoth.draw();
        }
        if (this.waterfallBoth) {
          this.waterfallBoth.draw();
        }
      } else if (this.screen) {
        this.screen.draw();
      }
    }
  }

  changeCenterFreq(freq: number): void {
    this.state.centerFrequency = freq as Hertz;
    this.syncDomWithState();
  }

  changeBandwidth(freqSpan: number): void {
    this.state.span = freqSpan as Hertz;
    this.syncDomWithState();
  }

  resetMaxHoldData(): void {
    if (this.state.screenMode === 'both') {
      // Reset both screens in "both" mode
      if (this.spectralDensityBoth) {
        this.spectralDensityBoth.resetMaxHold_();
      }
      if (this.waterfallBoth) {
        this.waterfallBoth.resetMaxHold();
      }
    } else if (this.screen) {
      this.screen.resetMaxHold();
    }
  }

  resetMinHoldData(): void {
    if (this.state.screenMode === 'both') {
      // Reset both screens in "both" mode
      if (this.spectralDensityBoth) {
        this.spectralDensityBoth.resetMinHold_();
      }
      if (this.waterfallBoth) {
        this.waterfallBoth.resetMinHold();
      }
    } else if (this.screen) {
      this.screen.resetMinHold();
    }
  }

  /**
   * Control Methods
   */

  private openConfigPopupMenu(): void {
    this.configPanel.open();
    this.emit(Events.SPEC_A_CONFIG_CHANGED, { uuid: this.uuid });
  }

  togglePause(): void {
    this.state.isPaused = !this.state.isPaused;

    this.emit(Events.SPEC_A_CONFIG_CHANGED, {
      uuid: this.uuid,
      isPaused: this.state.isPaused,
    });
    this.syncDomWithState();
  }

  /**
   * Get the noise floor adjusted for RF front end gain
   */
  get noiseFloorAndGain(): number {
    let noiseFloor = this.state.noiseFloorNoGain;
    if (!this.state.isSkipLnaGainDuringDraw) {
      noiseFloor += this.rfFrontEnd_.couplerModule.signalPathManager.getTotalRxGain();
    }
    return noiseFloor;
  }

  /**
   * The displayed noise floor (dBm) in the RBW now in use: the floor last
   * computed scaled from its noise bandwidth to the current one.
   */
  private displayedNoiseFloorDbm_(): number {
    const lastEnbw = this.lastEnbwHz_ > 0 ? this.lastEnbwHz_ : this.noiseBandwidthHz;

    return this.noiseFloorAndGain + 10 * Math.log10(this.noiseBandwidthHz / lastEnbw);
  }

  /** Noise bandwidth the last noise floor was computed in, Hz */
  private lastEnbwHz_ = 0;

  freqAutoTune() {
    if (this.state.isAutoTuneAvailable === false) {
      return;
    }
    // Find the signal with the highest amplitude within the current frequency span
    let strongestSignal: IfSignal | RfSignal | null = null;

    for (const signal of this.inputSignals) {
      if (
        this.state.span < 320e6 && // 320 MHz minimum span
        signal.frequency >= this.state.centerFrequency - this.state.span / 2 &&
        signal.frequency <= this.state.centerFrequency + this.state.span / 2
      ) {
        if (!strongestSignal || signal.power > strongestSignal.power) {
          strongestSignal = signal;
        }
      }
    }

    // If strongest signal is below the noise floor replace it with a fake signal at noise floor
    if (!strongestSignal || (strongestSignal && strongestSignal.power < this.noiseFloorAndGain)) {
      strongestSignal = {
        frequency: random() * this.state.span + (this.state.centerFrequency - this.state.span / 2),
        power: this.noiseFloorAndGain,
        bandwidth: Math.min(this.state.span, 320e6),
      } as IfSignal | RfSignal;

      Logger.warn('No real signals found within the current frequency span for auto-tuning, using noise floor instead.');
    }

    // Center the spectrum analyzer on the strongest signal found
    this.state.centerFrequency = strongestSignal.frequency;
    Logger.info(`Auto-tuned to frequency: ${(strongestSignal.frequency / 1e6).toFixed(3)} MHz with power: ${strongestSignal.power} dBm`);

    // Span: the occupied bandwidth plus 10 %, up to a 1-2-5 step, never under
    // 2 kHz (a CW beacon's line needs room either side). RBW back to auto so
    // it couples to the new span, as on a real instrument.
    const newSpan = roundUp125(Math.max(AUTO_TUNE_MIN_SPAN_HZ, strongestSignal.bandwidth * 1.1));
    this.state.span = newSpan as Hertz;
    this.state.rbw = null;
    Logger.info(`Adjusted span to: ${newSpan} Hz, RBW auto.`);

    // If that puts the start or stop frequency out of bounds, adjust accordingly
    const minFreq = this.state.centerFrequency - this.state.span / 2;
    const maxFreq = this.state.centerFrequency + this.state.span / 2;

    if (minFreq < this.state.minFrequency) {
      this.state.centerFrequency = (this.state.minFrequency + this.state.span / 2) as Hertz;
      Logger.info(`Adjusted center frequency to ${(this.state.centerFrequency / 1e6).toFixed(3)} MHz to avoid negative start frequency.`);
    }

    if (maxFreq > this.state.maxFrequency) {
      this.state.centerFrequency = (this.state.maxFrequency - this.state.span / 2) as Hertz;
      Logger.info(`Adjusted center frequency to ${(this.state.centerFrequency / 1e6).toFixed(3)} MHz to stay within max frequency limit.`);
    }

    // Amplitude window: the displayed floor in the new (auto) RBW and the
    // signal, with a 10 dB margin above the peak and the floor a division
    // above the bottom, on 10 dB steps
    const floorDbm = this.displayedNoiseFloorDbm_();
    const peakDbm = Math.max(strongestSignal.power, floorDbm);
    this.state.maxAmplitude = Math.ceil((peakDbm + 10) / 10) * 10;
    this.state.minAmplitude = Math.floor((floorDbm - 10) / 10) * 10;
    if (this.state.maxAmplitude < this.state.minAmplitude + 30) {
      this.state.maxAmplitude = this.state.minAmplitude + 30;
    }
    Logger.info(`Set amplitude range: ${this.state.minAmplitude} dBm to ${this.state.maxAmplitude} dBm.`);

    this.syncDomWithState();
  }

  syncDomWithState(): void {
    if (JSON.stringify(this.prevState) === JSON.stringify(this.state)) {
      return; // No changes detected
    }

    // Update info display
    if (this.domCache['info']) {
      this.domCache['info'].innerHTML = html`
        <div>CF: ${(this.state.centerFrequency / 1e6).toFixed(3)} MHz</div>
        <div>Input: ${this.state.inputValue} ${this.state.inputUnit}</div>
        <div>RF Front End: ${this.state.rfFeUuid.split('-')[0]}</div>
      `;
      this.updateScreenVisibility();
    }
    // Update Taps buttons
    if (this.domCache['tapAButton']) {
      this.domCache['tapAButton'].className = `spec-a-btn btn-tap-a ${this.state.isUseTapA ? 'btn-active' : ''}`;
    }
    if (this.domCache['tapBButton']) {
      this.domCache['tapBButton'].className = `spec-a-btn btn-tap-b ${this.state.isUseTapB ? 'btn-active' : ''}`;
    }

    this.prevState = structuredClone(this.state);
  }

  /** (Re)start sizing the plots' bitmaps to their elements (after the canvases are embedded in a page) */
  observeCanvasResize(): void {
    this.spectralDensity?.observeResize();
    this.spectralDensityBoth?.observeResize();
  }

  /** Stop the plots' resize observers (the page that showed the canvases is going away) */
  dispose(): void {
    this.spectralDensity?.dispose();
    this.spectralDensityBoth?.dispose();
  }

  /**
   * Public getters for canvas elements (for adapter access)
   */
  public getCanvas(): HTMLCanvasElement | null {
    return (this.domCache['canvas'] as HTMLCanvasElement) || null;
  }

  public getSpectralCanvas(): HTMLCanvasElement | null {
    return (this.domCache['canvasSpectral'] as HTMLCanvasElement) || null;
  }

  public getWaterfallCanvas(): HTMLCanvasElement | null {
    return (this.domCache['canvasWaterfall'] as HTMLCanvasElement) || null;
  }
}
