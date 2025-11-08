import { EventBus } from "@app/events/event-bus";
import { html } from "../../engine/utils/development/formatter";
import { Events } from "../../events/events";
import { Hertz, IfSignal, RfSignal } from "../../types";
import { BaseEquipment } from '../base-equipment';
import { RFFrontEnd } from "../rf-front-end/rf-front-end";
import { AnalyzerControlBox } from "./analyzer-control-box";
import './real-time-spectrum-analyzer.css';
import { SpectralDensityPlot } from './rtsa-screen/spectral-density-plot';
import { WaterfallDisplay } from "./rtsa-screen/waterfall-display";

export interface RealTimeSpectrumAnalyzerState {
  inputUnit: 'Hz' | 'kHz' | 'MHz' | 'GHz' | 'dBm' | 'dBW' | 'W';
  inputValue: string;
  id: number; // 1-4
  team_id: number;
  rfFrontEndId: number;
  isRfMode: boolean; // true = RF mode, false = IF mode
  isPaused: boolean;
  noiseFloor: any;
  isInternalNoiseFloor: boolean;
  isMaxHold: boolean;
  isMinHold: boolean;
  isMarkerOn: boolean;
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

  constructor(parentId: string, id: number, rfFrontEnd: RFFrontEnd, teamId: number = 1) {
    super(parentId, id, teamId);

    this.rfFrontEnd_ = rfFrontEnd;

    // Initialize config
    this.state = {
      id: this.id,
      team_id: this.teamId,
      rfFrontEndId: this.rfFrontEnd_.antenna.state.id, // RF is hard linked to antenna
      isRfMode: false,
      isPaused: false,
      isMaxHold: false,
      isMinHold: false,
      isMarkerOn: false,
      centerFrequency: 600e6 as Hertz,
      span: 100e6 as Hertz,
      rbw: 1e6 as Hertz,
      lockedControl: 'freq',
      hold: false,
      minAmplitude: -100,
      maxAmplitude: -40,
      noiseFloor: -104,
      isInternalNoiseFloor: true,
      refreshRate: 10,
      screenMode: 'spectralDensity',
      inputUnit: 'MHz',
      inputValue: '',
    };
    this.state.inputValue = (this.state.centerFrequency / 1e6).toString(); // in MHz
    this.state.inputUnit = 'MHz';

    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
    EventBus.getInstance().on(Events.DRAW, this.draw.bind(this));
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
        <div class="equipment-box spectrum-analyzer-box">
        <div class="equipment-case-header">
          <div class="equipment-case-title">Spectrum Analyzer ${this.id}</div>
          <div class="equipment-case-power-controls">
            <div class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div class="led ${this.state.isPaused ? 'led-amber' : 'led-green'}"></div>
            </div>
          </div>
        </div>

        <div class="spec-a-canvas-container">
          <canvas id="specA${this.id}" width="747" height="747" class="spec-a-canvas-single"></canvas>
          <canvas id="specA${this.id}-spectral" width="747" height="200" class="spec-a-canvas-spectral"></canvas>
          <canvas id="specA${this.id}-waterfall" width="747" height="200" class="spec-a-canvas-waterfall"></canvas>
        </div>

        <div class="spec-a-info">
          <div>CF: ${this.state.centerFrequency / 1e6} MHz</div>
          <div>Input: ${this.state.inputValue} ${this.state.inputUnit}</div>
          <div>Ant: ${this.state.rfFrontEndId}</div>
        </div>

        <div class="spec-a-controls">
          <button class="btn-config" data-action="config">Config</button>
          <button class="btn-mode-if-rf ${this.state.isRfMode ? 'active' : ''}" data-action="ifRfMode">
            ${this.state.isRfMode ? 'RF' : 'IF'}
          </button>
          <button class="btn-mode-screen ${this.state.screenMode === 'spectralDensity' ? 'active' : ''}" data-action="screenMode">
            ${this.state.screenMode === 'spectralDensity' ? 'Spectral Density' : 'Waterfall'}
          </button>
          <button class="btn-pause ${this.state.isPaused ? 'active' : ''}" data-action="pause">
            Pause
          </button>
        </div>
      </div>
    `;

    // Cache all DOM references that might be needed later
    this.domCache['container'] = parentDom.querySelector('.spectrum-analyzer-box') as HTMLElement;
    this.domCache['info'] = parentDom.querySelector('.spec-a-info') as HTMLElement;
    this.domCache['controls'] = parentDom.querySelector('.spec-a-controls') as HTMLElement;
    this.domCache['canvas'] = parentDom.querySelector(`#specA${this.id}`) as HTMLCanvasElement;
    this.domCache['canvasSpectral'] = parentDom.querySelector(`#specA${this.id}-spectral`) as HTMLCanvasElement;
    this.domCache['canvasWaterfall'] = parentDom.querySelector(`#specA${this.id}-waterfall`) as HTMLCanvasElement;
    this.domCache['configButton'] = parentDom.querySelector('.btn-config') as HTMLButtonElement;
    this.domCache['ifRfModeButton'] = parentDom.querySelector('.btn-mode-if-rf') as HTMLButtonElement;
    this.domCache['screenModeButton'] = parentDom.querySelector('.btn-mode-screen') as HTMLButtonElement;
    this.domCache['pauseButton'] = parentDom.querySelector('.btn-pause') as HTMLButtonElement;

    return parentDom;
  }

  protected addListeners_(parentDom: HTMLElement): void {
    // Button clicks
    parentDom.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;

      switch (action) {
        case 'config':
          this.openConfigPopupMenu();
          break;
        case 'ifRfMode':
          this.toggleIfRfMode();
          break;
        case 'screenMode':
          this.toggleScreenMode();
          break;
        case 'pause':
          this.togglePause();
          break;
      }
    });

    // Listen for antenna changes
    this.subscribeToAntennaEvents();
  }

  private subscribeToAntennaEvents(): void {
    this.on(Events.ANTENNA_CONFIG_CHANGED, (data) => {
      this.updateConfigChange(data);
    });

    this.on(Events.ANTENNA_ERROR, (data) => {
      this.updateConfigChange(data);
    });

    this.on(Events.ANTENNA_HPA_CHANGED, (data) => {
      this.updateConfigChange(data);
    });

    this.on(Events.ANTENNA_LOCKED, (data) => {
      this.updateConfigChange(data);
    });

    this.on(Events.ANTENNA_LOOPBACK_CHANGED, (data) => {
      this.updateConfigChange(data);
    });

    this.on(Events.ANTENNA_POWER_CHANGED, (data) => {
      this.updateConfigChange(data);
    });

    this.on(Events.ANTENNA_TRACK_CHANGED, (data) => {
      this.updateConfigChange(data);
    });
  }

  private updateConfigChange(data: any): void {
    if (data.unit === this.state.id) {
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
    this.spectralDensity = new SpectralDensityPlot(this.domCache['canvas'] as HTMLCanvasElement, this);
    this.waterfall = new WaterfallDisplay(this.domCache['canvas'] as HTMLCanvasElement, this);

    // Initialize "both" mode screens with their dedicated canvases
    this.spectralDensityBoth = new SpectralDensityPlot(this.domCache['canvasSpectral'] as HTMLCanvasElement, this);
    this.waterfallBoth = new WaterfallDisplay(this.domCache['canvasWaterfall'] as HTMLCanvasElement, this);

    // Set initial screen mode
    this.updateScreenVisibility();

    // Set initial state
    this.updateScreenState();
  }

  /**
   * Update canvas visibility based on screen mode
   */
  private updateScreenVisibility(): void {
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
    this.state.noiseFloor = -174; // Reset to default before calculation
    this.state.isInternalNoiseFloor = true;

    for (const tapPoint of [tapPointA, tapPointB]) {
      let tapPointnoiseFloor = -174;
      let isInternalNoiseFloor = true;

      switch (tapPoint) {
        case 'TX IF':
          signals.push(...this.rfFrontEnd_.bucModule.inputSignals); // IF signals from both transmitter cases
          tapPointnoiseFloor = this.rfFrontEnd_.bucModule.state.noiseFloor;
          break;
        case 'POST BUC / PRE HPA TX RF':
          signals.push(...this.rfFrontEnd_.bucModule.outputSignals);
          tapPointnoiseFloor = this.rfFrontEnd_.bucModule.state.noiseFloor;
          break;
        case 'POST HPA / PRE OMT TX RF':
          signals.push(...this.rfFrontEnd_.hpaModule.outputSignals);
          tapPointnoiseFloor = this.rfFrontEnd_.hpaModule.state.noiseFloor;
          break;
        case 'POST OMT/PRE ANT TX RF':
          signals.push(...this.rfFrontEnd_.omtModule.txSignalsOut);
          tapPointnoiseFloor = this.rfFrontEnd_.omtModule.state.noiseFloor;
          break;
        case 'PRE OMT/POST ANT RX RF':
          signals.push(...this.rfFrontEnd_.antenna.state.rxSignalsIn);
          tapPointnoiseFloor = this.rfFrontEnd_.antenna.state.noiseFloor;
          break;
        case 'POST OMT/PRE LNA RX RF':
          signals.push(...this.rfFrontEnd_.omtModule.rxSignalsOut);
          tapPointnoiseFloor = this.rfFrontEnd_.omtModule.state.noiseFloor;
          break;
        case 'POST LNA RX RF':
          signals.push(...this.rfFrontEnd_.lnbModule.postLNASignals);
          tapPointnoiseFloor = this.rfFrontEnd_.lnbModule.state.noiseFloor;
          break;
        case 'RX IF':
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

      if (tapPointnoiseFloor > this.state.noiseFloor) {
        this.state.noiseFloor = tapPointnoiseFloor;
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
    this.configPanel ??= new AnalyzerControlBox(this);
    this.configPanel.open();
    this.emit(Events.SPEC_A_CONFIG_CHANGED, { id: this.id });
  }

  private toggleIfRfMode(): void {
    this.state.isRfMode = !this.state.isRfMode;

    this.emit(Events.SPEC_A_CONFIG_CHANGED, {
      id: this.id,
      isRfMode: this.state.isRfMode,
    });
    this.syncDomWithState();
  }

  private toggleScreenMode(): void {
    const currentScreenMode = this.state.screenMode;
    if (currentScreenMode === 'spectralDensity') {
      this.state.screenMode = 'waterfall';
      this.screen = this.waterfall;
    } else if (currentScreenMode === 'waterfall') {
      this.state.screenMode = 'both';
      this.screen = null; // No single screen in both mode
    } else {
      this.state.screenMode = 'spectralDensity';
      this.screen = this.spectralDensity;
    }

    this.emit(Events.SPEC_A_CONFIG_CHANGED, {
      id: this.id,
      screenMode: this.state.screenMode,
    });

    this.updateScreenVisibility();
    this.syncDomWithState();
  }

  private togglePause(): void {
    this.state.isPaused = !this.state.isPaused;

    this.emit(Events.SPEC_A_CONFIG_CHANGED, {
      id: this.id,
      isPaused: this.state.isPaused,
    });
    this.syncDomWithState();
  }

  syncDomWithState(): void {
    // Update info display
    this.domCache['info'].innerHTML = html`
      <div>CF: ${(this.state.centerFrequency / 1e6).toFixed(3)} MHz</div>
      <div>Input: ${this.state.inputValue} ${this.state.inputUnit}</div>
      <div>Ant: ${this.state.rfFrontEndId}</div>
    `;

    this.domCache['ifRfModeButton'].textContent = this.state.isRfMode ? 'RF' : 'IF';
    this.domCache['ifRfModeButton'].classList.toggle('active', this.state.isRfMode);

    switch (this.state.screenMode) {
      case 'spectralDensity':
        this.domCache['screenModeButton'].textContent = 'Spectral Density';
        break;
      case 'waterfall':
        this.domCache['screenModeButton'].textContent = 'Waterfall';
        break;
      case 'both':
        this.domCache['screenModeButton'].textContent = 'Both';
        break;
    }

    this.domCache['pauseButton'].classList.toggle('active', this.state.isPaused);
    this.updateScreenVisibility();
  }
}