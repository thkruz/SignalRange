import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Logger } from "@app/logging/logger";
import { html } from "../../engine/utils/development/formatter";
import { Events } from "../../events/events";
import { Hertz, IfSignal, RfSignal } from "../../types";
import { BaseEquipment } from '../base-equipment';
import { RFFrontEnd } from "../rf-front-end/rf-front-end";
import { TapPoint } from './../rf-front-end/coupler-module/coupler-module';
import { AnalyzerControlBox } from "./analyzer-control-box";
import './real-time-spectrum-analyzer.css';
import { SpectralDensityPlot } from './rtsa-screen/spectral-density-plot';
import { WaterfallDisplay } from "./rtsa-screen/waterfall-display";

type MarkerPoint = { x: number; y: number; signal: number };

export interface RealTimeSpectrumAnalyzerState {
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
  noiseFloorNoGain: number;
  isInternalNoiseFloor: boolean;
  isMaxHold: boolean;
  isMinHold: boolean;
  isMarkerOn: boolean;
  isUpdateMarkers: boolean;
  topMarkers: MarkerPoint[];
  markerIndex: number;
  refreshRate: number; // in Hz
  centerFrequency: Hertz; // Hz - center frequency
  span: Hertz;
  rbw: Hertz; // Resolution Bandwidth
  lockedControl: 'freq' | 'span';
  hold: boolean; // Hold max amplitude
  minAmplitude: number;
  maxAmplitude: number;
  screenMode: 'spectralDensity' | 'waterfall' | 'both';
}

/**
 * SpectrumAnalyzer - Configuration and settings manager
 * Delegates all rendering to SpectrumScreen for separation of concerns
 */
export class RealTimeSpectrumAnalyzer extends BaseEquipment {
  state: RealTimeSpectrumAnalyzerState;

  // Screen renderer
  screen: SpectralDensityPlot | WaterfallDisplay | null = null;
  spectralDensity: SpectralDensityPlot | null = null;
  waterfall: WaterfallDisplay | null = null;
  // For "both" mode, we need separate instances
  spectralDensityBoth: SpectralDensityPlot | null = null;
  waterfallBoth: WaterfallDisplay | null = null;

  // RFFrontEnd reference
  readonly rfFrontEnd_: RFFrontEnd;

  configPanel: AnalyzerControlBox | null = null;
  inputSignals: IfSignal[] = [];

  constructor(parentId: string, rfFrontEnd: RFFrontEnd, teamId: number = 1) {
    super(parentId, teamId);

    this.rfFrontEnd_ = rfFrontEnd;

    // Initialize config
    this.state = {
      uuid: this.uuid,
      team_id: this.teamId,
      rfFeUuid: this.rfFrontEnd_.state.uuid, // RF is hard linked to antenna
      isPaused: false,
      isMaxHold: false,
      isMinHold: false,
      isMarkerOn: false,
      isUpdateMarkers: false,
      topMarkers: [],
      markerIndex: 0,

      referenceLevel: 0, // dBm

      minFrequency: 5e3 as Hertz, // 5 kHz
      maxFrequency: 25.5e9 as Hertz, // 25.5 GHz
      centerFrequency: 600e6 as Hertz,
      span: 100e6 as Hertz,
      lastSpan: 100e6 as Hertz,
      rbw: 1e6 as Hertz,
      lockedControl: 'freq',
      hold: false,
      minAmplitude: -100,
      maxAmplitude: -40,
      noiseFloorNoGain: -104,
      isInternalNoiseFloor: true,
      refreshRate: 10,
      screenMode: 'spectralDensity',
      inputUnit: 'MHz',
      inputValue: '',
    };
    this.state.inputValue = (this.state.centerFrequency / 1e6).toString(); // in MHz
    this.state.inputUnit = 'MHz';

    this.configPanel = new AnalyzerControlBox(this);
    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
    EventBus.getInstance().on(Events.DRAW, this.draw.bind(this));
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
        <div class="equipment-case spectrum-analyzer-box">
        <div class="equipment-case-header">
          <div class="equipment-case-title">Spectrum Analyzer ${this.uuidShort}</div>
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
          <button class="btn-config" data-action="config" title="Open Configuration Panel">
            <span class="icon-advanced">&#9881;</span>
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

    return parentDom;
  }

  protected addListeners_(): void {
    // config button listener
    this.domCache['configButton'].addEventListener('click', () => {
      this.openConfigPopupMenu();
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

    // Initialize single-mode screens
    this.spectralDensity = new SpectralDensityPlot(this.domCache['canvas'] as HTMLCanvasElement, this, 1600, 1000);
    this.waterfall = new WaterfallDisplay(this.domCache['canvas'] as HTMLCanvasElement, this, 1600, 1000);

    // Initialize "both" mode screens with their dedicated canvases
    this.spectralDensityBoth = new SpectralDensityPlot(this.domCache['canvasSpectral'] as HTMLCanvasElement, this, 1600, 500);
    this.waterfallBoth = new WaterfallDisplay(this.domCache['canvasWaterfall'] as HTMLCanvasElement, this, 1600, 500);

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
   * Public API Methods
   */

  public sync(spectrumAnalyzerState: RealTimeSpectrumAnalyzerState): void {
    this.state = { ...this.state, ...spectrumAnalyzerState };
    this.syncDomWithState();
  }

  public update(): void {
    // Determine tap point
    this.inputSignals = this.getInputSignals();

    this.updateScreenState();
    if (!this.state.isPaused) {
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
  }

  getInputSignals(): (IfSignal | RfSignal)[] {
    const tapPointA = this.rfFrontEnd_.couplerModule.state.tapPointA;
    const tapPointB = this.rfFrontEnd_.couplerModule.state.tapPointB;

    let signals: (IfSignal | RfSignal)[] = [];
    this.state.noiseFloorNoGain = -174; // Reset to default before calculation
    this.state.isInternalNoiseFloor = true;

    for (const tapPoint of [tapPointA, tapPointB]) {
      let tapPointnoiseFloor: number;
      let isInternalNoiseFloor = true;

      switch (tapPoint) {
        case TapPoint.TX_IF:
          signals.push(...this.rfFrontEnd_.bucModule.inputSignals); // IF signals from both transmitter cases
          tapPointnoiseFloor = this.rfFrontEnd_.bucModule.state.noiseFloor;
          break;
        case TapPoint.POST_BUC_PRE_HPA_TX_RF:
          signals.push(...this.rfFrontEnd_.bucModule.outputSignals);
          tapPointnoiseFloor = this.rfFrontEnd_.bucModule.state.noiseFloor;
          break;
        case TapPoint.POST_HPA_PRE_OMT_TX_RF:
          signals.push(...this.rfFrontEnd_.hpaModule.outputSignals);
          tapPointnoiseFloor = this.rfFrontEnd_.hpaModule.state.noiseFloor;
          break;
        case TapPoint.POST_OMT_PRE_ANT_TX_RF:
          signals.push(...this.rfFrontEnd_.omtModule.txSignalsOut);
          tapPointnoiseFloor = this.rfFrontEnd_.omtModule.state.noiseFloor;
          break;
        case TapPoint.PRE_OMT_POST_ANT_RX_RF:
          signals.push(...this.rfFrontEnd_.antenna.state.rxSignalsIn);
          tapPointnoiseFloor = this.rfFrontEnd_.antenna.state.noiseFloor;
          break;
        case TapPoint.POST_OMT_PRE_LNA_RX_RF:
          {
          signals.push(...this.rfFrontEnd_.omtModule.rxSignalsOut);
          tapPointnoiseFloor = this.rfFrontEnd_.omtModule.state.noiseFloor;
          break;
          }
        case TapPoint.POST_LNA_RX_RF:
          {
          signals.push(...this.rfFrontEnd_.lnbModule.postLNASignals);
          tapPointnoiseFloor = this.rfFrontEnd_.lnbModule.state.noiseFloor;
          break;
          }
        case TapPoint.RX_IF:
          {
            signals.push(...this.rfFrontEnd_.filterModule.outputSignals); // IF signals from LNB
            const noiseData = this.rfFrontEnd_.getNoiseFloor(tapPoint);

            tapPointnoiseFloor = noiseData.noiseFloor;
            isInternalNoiseFloor = noiseData.isInternalNoiseGreater;
            break;
          }
        default:
          throw new Error(`Unknown tap point: ${tapPointA}`);
      }

      if (tapPointnoiseFloor > this.state.noiseFloorNoGain) {
        this.state.noiseFloorNoGain = tapPointnoiseFloor;
        this.state.isInternalNoiseFloor = isInternalNoiseFloor;
      }
    }

    return signals;
  }

  public draw(): void {
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

  public changeCenterFreq(freq: number): void {
    this.state.centerFrequency = freq as Hertz;
    this.syncDomWithState();
  }

  public changeBandwidth(freqSpan: number): void {
    this.state.span = freqSpan as Hertz;
    this.syncDomWithState();
  }

  public resetHoldData(): void {
    if (this.state.screenMode === 'both') {
      // Reset both screens in "both" mode
      if (this.spectralDensityBoth) {
        this.spectralDensityBoth.resetMaxHold();
      }
      if (this.waterfallBoth) {
        this.waterfallBoth.resetMaxHold();
      }
    } else if (this.screen) {
      this.screen.resetMaxHold();
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
    if (!this.state.isInternalNoiseFloor) {
      noiseFloor += this.rfFrontEnd_.getTotalRxGain();
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
    // Update info display
    if (this.domCache['info']) {
      this.domCache['info'].innerHTML = html`
        <div>CF: ${(this.state.centerFrequency / 1e6).toFixed(3)} MHz</div>
        <div>Input: ${this.state.inputValue} ${this.state.inputUnit}</div>
        <div>RF Front End: ${this.state.rfFeUuid.split('-')[0]}</div>
      `;
      this.updateScreenVisibility();
    }
  }
}