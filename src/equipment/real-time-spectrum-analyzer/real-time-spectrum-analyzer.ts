import { HelpButton } from "@app/components/help-btn/help-btn";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Logger } from "@app/logging/logger";
import { html } from "../../engine/utils/development/formatter";
import { Events } from "../../events/events";
import { dB, Hertz, IfSignal, RfSignal } from "../../types";
import { BaseEquipment } from '../base-equipment';
import { RFFrontEndCore } from "../rf-front-end/rf-front-end-core";
import { TapPoint } from './../rf-front-end/coupler-module/coupler-module';
import { AnalyzerControlBox } from "./analyzer-control-box";
import type { TraceMode } from "./analyzer-control/ac-trace-btn/ac-trace-btn";
import { defaultSpectrumAnalyzerState } from "./defaultSpectrumAnalyzerState";
import './real-time-spectrum-analyzer.css';
import { SpectralDensityPlot } from './rtsa-screen/spectral-density-plot';
import { WaterfallDisplay } from "./rtsa-screen/waterfall-display";
import { SpectrumDataProcessor } from "./spectrum-data-processor";

type MarkerPoint = { x: number; y: number; signal: number };

export interface RealTimeSpectrumAnalyzerState {
  /** Scale in dB per division */
  scaleDbPerDiv: dB;
  isUseTapB: boolean;
  isUseTapA: boolean
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
  /** Noise floor in dBm/Hz without gain */
  noiseFloorNoGain: number;
  /** if true, use internal noise floor */
  isSkipLnaGainDuringDraw: boolean;
  isMaxHold: boolean;
  isMinHold: boolean;
  isMarkerOn: boolean;
  isUpdateMarkers: boolean;
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

        <div class="spec-a-canvas-container">
          <canvas id="specA${this.uuid}" width="747" height="747" class="spec-a-canvas-single"></canvas>
          <canvas id="specA${this.uuid}-spectral" width="747" height="200" class="spec-a-canvas-spectral"></canvas>
          <canvas id="specA${this.uuid}-waterfall" width="747" height="200" class="spec-a-canvas-waterfall"></canvas>
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
    this.spectralDensity = new SpectralDensityPlot(
      this.domCache['canvas'] as HTMLCanvasElement,
      this,
      this.dataProcessor,
      824,
      460
    );
    this.waterfall = new WaterfallDisplay(
      this.domCache['canvas'] as HTMLCanvasElement,
      this,
      this.dataProcessor,
      824,
      460
    );

    // Initialize "both" mode screens with their dedicated canvases and shared data processor
    this.spectralDensityBoth = new SpectralDensityPlot(
      this.domCache['canvasSpectral'] as HTMLCanvasElement,
      this,
      this.dataProcessor,
      824,
      230
    );
    this.waterfallBoth = new WaterfallDisplay(
      this.domCache['canvasWaterfall'] as HTMLCanvasElement,
      this,
      this.dataProcessor,
      824,
      230
    );

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

  getInputSignals(): (IfSignal | RfSignal)[] {
    const tapPointA = this.rfFrontEnd_.couplerModule.state.tapPointA;
    const tapPointB = this.rfFrontEnd_.couplerModule.state.tapPointB;
    // If rbw is null we are in auto mode so use span as bandwidth
    const bandwidth = this.state.rbw ?? this.state.span;

    let signals: (IfSignal | RfSignal)[] = [];

    const tapPoints = [];
    if (this.state.isUseTapA) {
      tapPoints.push(tapPointA);
    }
    if (this.state.isUseTapB) {
      tapPoints.push(tapPointB);
    }

    // Track the maximum noise floor across all tap points
    let maxNoiseFloorNoGain = this.rfFrontEnd_.couplerModule.signalPathManager.getNoiseFloorAt(TapPoint.RX_IF, bandwidth).noiseFloorNoGain;
    let maxShouldApplyGain = false;

    // Process both tap points
    for (const tapPoint of tapPoints) {
      // Get signals at this tap point
      signals.push(...this.getSignalsAtTapPoint(tapPoint));

      // Get noise floor using SignalPathManager
      const { noiseFloorNoGain, shouldApplyGain } =
        this.rfFrontEnd_.couplerModule.signalPathManager.getNoiseFloorAt(tapPoint, bandwidth);
      const noiseFloorWithGain = noiseFloorNoGain + this.rfFrontEnd_.couplerModule.signalPathManager.getTotalGainTo(tapPoint)

      // Keep the highest noise floor from both tap points
      if (noiseFloorWithGain > maxNoiseFloorNoGain) {
        maxNoiseFloorNoGain = noiseFloorNoGain;
        maxShouldApplyGain = shouldApplyGain;
      }
    }

    for (const sig of signals) {
      if (sig.bandwidth > bandwidth) {
        sig.bandwidth = bandwidth;
      }
    }

    // Update state with the maximum noise floor found
    this.state.noiseFloorNoGain = maxNoiseFloorNoGain;
    this.state.isSkipLnaGainDuringDraw = !maxShouldApplyGain;

    return signals;
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
        return this.rfFrontEnd_.hpaModule.outputSignals;
      case TapPoint.TX_RF_POST_OMT:
        return this.rfFrontEnd_.omtModule.txSignalsOut;
      case TapPoint.RX_RF_PRE_OMT:
        return this.rfFrontEnd_.antenna.state.rxSignalsIn;
      case TapPoint.RX_RF_POST_OMT:
        return this.rfFrontEnd_.omtModule.rxSignalsOut;
      case TapPoint.RX_RF_POST_LNA:
        return this.rfFrontEnd_.lnbModule.postLNASignals;
      case TapPoint.RX_IF:
        return this.rfFrontEnd_.filterModule.outputSignals;
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

  freqAutoTune() {
    // Find the signal with the highest amplitude within the current frequency span
    let strongestSignal: IfSignal | RfSignal | null = null;

    for (const signal of this.inputSignals) {
      if (
        this.state.span < 320e6 && // 320 MHz minimum span
        signal.frequency >= (this.state.centerFrequency - this.state.span / 2) &&
        signal.frequency <= (this.state.centerFrequency + this.state.span / 2)
      ) {
        if (!strongestSignal || signal.power > strongestSignal.power) {
          strongestSignal = signal;
        }
      }
    }

    // If strongest signal is below the noise floor replace it with a fake signal at noise floor
    if (!strongestSignal || (strongestSignal && strongestSignal.power < this.noiseFloorAndGain)) {
      strongestSignal = {
        frequency: Math.random() * this.state.span + (this.state.centerFrequency - this.state.span / 2),
        power: this.noiseFloorAndGain,
        bandwidth: Math.min(this.state.span, 320e6),
      } as IfSignal | RfSignal;

      Logger.warn('No real signals found within the current frequency span for auto-tuning, using noise floor instead.');
    }

    // Center the spectrum analyzer on the strongest signal found
    this.state.centerFrequency = strongestSignal.frequency;
    Logger.info(`Auto-tuned to frequency: ${(strongestSignal.frequency / 1e6).toFixed(3)} MHz with power: ${strongestSignal.power} dBm`);

    // Adjust the span to be 10% wider than the signal's bandwidth
    const newSpan = strongestSignal.bandwidth * 1.1;
    this.state.span = newSpan as Hertz;
    Logger.info(`Adjusted span to: ${(newSpan / 1e6).toFixed(3)} MHz for better visibility.`);

    // If that puts the start or stop frequency out of bounds, adjust accordingly
    const minFreq = this.state.centerFrequency - this.state.span / 2;
    const maxFreq = this.state.centerFrequency + this.state.span / 2;

    if (minFreq < this.state.minFrequency) {
      this.state.centerFrequency = (this.state.span / 2) as Hertz;
      Logger.info(`Adjusted center frequency to ${(this.state.centerFrequency / 1e6).toFixed(3)} MHz to avoid negative start frequency.`);
    }

    if (maxFreq > this.state.maxFrequency) {
      this.state.centerFrequency = (this.state.maxFrequency - this.state.span / 2) as Hertz;
      Logger.info(`Adjusted center frequency to ${(this.state.centerFrequency / 1e6).toFixed(3)} MHz to stay within max frequency limit.`);
    }

    // Adjust the amplitude range to fit the signal's power
    this.state.maxAmplitude = Math.ceil(strongestSignal.power / 10) * 10; // Round up to nearest 10 dB
    this.state.minAmplitude = this.state.maxAmplitude - 60; // 60 dB range
    Logger.info(`Set amplitude range: ${this.state.minAmplitude} dBm to ${this.state.maxAmplitude} dBm.`);

    // Adjust the min amplitude to the noise floor if necessary
    this.state.minAmplitude = this.noiseFloorAndGain - 6; // 6 dB below noise floor
    Logger.info(`Adjusted min amplitude to noise floor: ${this.noiseFloorAndGain} dBm.`);

    // Ensure max is at least 12 dB above min
    if (this.state.maxAmplitude < this.state.minAmplitude + 12) {
      this.state.maxAmplitude = this.state.minAmplitude + 12;
      Logger.info(`Adjusted max amplitude to maintain at least 12 dB above min: ${this.state.maxAmplitude} dBm.`);
    }

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
}