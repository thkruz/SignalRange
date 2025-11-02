import { html } from "../../engine/ui/utils/development/formatter";
import { Events } from "../../events/events";
import { Hertz } from "../../types";
import { Antenna } from '../antenna/antenna';
import { Equipment } from '../equipment';
import { AnalyzerControlBox } from "./layers-box";
import './real-time-spectrum-analyzer.css';
import { SpectralDensityPlot } from './rtsa-screen/spectral-density-plot';
import { WaterfallDisplay } from "./rtsa-screen/waterfall-display";

export interface RealTimeSpectrumAnalyzerState {
  unit: number; // 1-4
  team_id: number;
  antenna_id: number;
  isRfMode: boolean; // true = RF mode, false = IF mode
  isPaused: boolean;
  isTraceOn: boolean;
  isMarkerOn: boolean;
  isShowSignals: boolean;
  refreshRate: number; // in Hz
  centerFrequency: Hertz; // Hz - center frequency
  span: Hertz; // Hz - bandwidth
  hold: boolean; // Hold max amplitude
  minDecibels: number;
  maxDecibels: number;
  noiseFloor: number;
  screenMode: 'spectralDensity' | 'waterfall' | 'both';
}

/**
 * SpectrumAnalyzer - Configuration and settings manager
 * Delegates all rendering to SpectrumScreen for separation of concerns
 */
export class RealTimeSpectrumAnalyzer extends Equipment {
  state: RealTimeSpectrumAnalyzerState;

  // Screen renderer
  screen: SpectralDensityPlot | WaterfallDisplay | null = null;

  // Antenna reference
  private readonly antenna: Antenna;

  // Decibel management
  private readonly minDecibels: number = -120;
  private readonly maxDecibels: number = -80;
  private readonly noiseFloor: number = -115;
  spectralDensity: SpectralDensityPlot | null = null;
  waterfall: WaterfallDisplay | null = null;
  configPanel: AnalyzerControlBox | null = null;

  constructor(parentId: string, unit: number, teamId: number = 1, antenna: Antenna) {
    super(parentId, unit, teamId);

    this.antenna = antenna;

    // Initialize config
    this.state = {
      unit: this.unit,
      team_id: this.teamId,
      antenna_id: 1,
      isRfMode: false,
      isPaused: false,
      isTraceOn: false,
      isMarkerOn: false,
      centerFrequency: 4810e6 as Hertz,
      span: 100e6 as Hertz,
      hold: false,
      minDecibels: this.minDecibels,
      maxDecibels: this.maxDecibels,
      noiseFloor: this.noiseFloor,
      isShowSignals: true,
      refreshRate: 10,
      screenMode: 'spectralDensity',
    };

    this.build(parentId);
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
      <div class="spectrum-analyzer-box">
        <div class="spec-a-header">
          <div class="spec-a-title">Spectrum Analyzer ${this.unit}</div>
          <div class="spec-a-span">Span: ${this.state.span / 1e6} MHz</div>
        </div>

        <div class="spec-a-canvas-container">
          <canvas id="specA${this.unit}" width="1600" height="400"></canvas>
        </div>

        <div class="spec-a-info">
          <div>CF: ${this.state.centerFrequency / 1e6} MHz</div>
          <div>Ant: ${this.state.antenna_id}</div>
        </div>

        <div class="spec-a-controls">
          <button class="btn-config" data-action="config">Config</button>
          <button id="btn-mode-if-rf" class="btn-mode ${this.state.isRfMode ? 'active' : ''}" data-action="ifRfMode">
            ${this.state.isRfMode ? 'RF' : 'IF'}
          </button>
          <button id="btn-mode-screen" class="btn-mode ${this.state.screenMode === 'spectralDensity' ? 'active' : ''}" data-action="screenMode">
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
    this.domCache['header'] = parentDom.querySelector('.spec-a-header') as HTMLElement;
    this.domCache['info'] = parentDom.querySelector('.spec-a-info') as HTMLElement;
    this.domCache['controls'] = parentDom.querySelector('.spec-a-controls') as HTMLElement;
    this.domCache['canvas'] = parentDom.querySelector(`#specA${this.unit}`) as HTMLCanvasElement;
    this.domCache['span'] = parentDom.querySelector('.spec-a-span') as HTMLElement;
    this.domCache['ifRfModeButton'] = parentDom.querySelector(`#btn-mode-if-rf`) as HTMLCanvasElement;
    this.domCache['screenModeButton'] = parentDom.querySelector('#btn-mode-screen') as HTMLCanvasElement;
    this.domCache['pauseButton'] = parentDom.querySelector('.btn-pause') as HTMLElement;

    return parentDom;
  }

  protected addListeners(parentDom: HTMLElement): void {
    // Button clicks
    parentDom.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;

      switch (action) {
        case 'config':
          this.openConfig();
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
    if (data.unit === this.state.unit) {
      this.state = { ...this.state, ...data };

      if (data.frequency) {
        this.updateFrequency(data.frequency);
      }
    }
  }

  protected initialize(): void {
    if (!this.domCache['canvas']) throw new Error('Canvas element not found for Spectrum Analyzer');

    this.spectralDensity = new SpectralDensityPlot(this.domCache['canvas'] as HTMLCanvasElement, this.antenna, this);
    this.waterfall = new WaterfallDisplay(this.domCache['canvas'] as HTMLCanvasElement, this.antenna, this);

    switch (this.state.screenMode) {
      case 'spectralDensity':
        this.screen = this.spectralDensity;
        break;
      case 'waterfall':
        this.screen = this.waterfall;
        break;
      case 'both':
        // For simplicity, default to spectralDensity if both is selected
        this.screen = this.spectralDensity;
        break;
    }

    // Set initial state
    this.updateScreenState();
  }

  /**
   * Update screen with current configuration
   */
  private updateScreenState(): void {
    if (!this.screen) return;

    // Update frequency range
    const minFreq = (this.state.centerFrequency - this.state.span / 2) as Hertz;
    const maxFreq = (this.state.centerFrequency + this.state.span / 2) as Hertz;
    this.screen.setFrequencyRange(minFreq, maxFreq);
  }

  /**
   * Public API Methods
   */

  public sync(spectrumAnalyzerState: RealTimeSpectrumAnalyzerState): void {
    this.state = { ...this.state, ...spectrumAnalyzerState };
    this.syncDomWithState();
  }

  public update(): void {
    this.updateScreenState();
    if (!this.state.isPaused) {
      this.screen!.update();
    }
  }

  public draw(): void {
    if (!this.state.isPaused) {
      this.screen!.draw();
    }
  }

  public getConfig(): RealTimeSpectrumAnalyzerState {
    return { ...this.state };
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
    if (this.screen) {
      this.screen.resetMaxHold();
    }
  }

  /**
   * Control Methods
   */

  private openConfig(): void {
    this.openConfigPanel();
    this.emit(Events.SPEC_A_CONFIG_CHANGED, { unit: this.unit });
  }

  private openConfigPanel(): void {
    this.configPanel ??= new AnalyzerControlBox(this);
    this.configPanel.open();
  }

  private toggleIfRfMode(): void {
    this.state.isRfMode = !this.state.isRfMode;

    this.updateIfRfModeButton();

    this.emit(Events.SPEC_A_IF_RF_MODE_CHANGED, {
      unit: this.unit,
      isRfMode: this.state.isRfMode,
    });
  }

  private updateIfRfModeButton(): void {
    this.domCache['ifRfModeButton'].textContent = this.state.isRfMode ? 'RF' : 'IF';
    this.domCache['ifRfModeButton'].classList.toggle('active', this.state.isRfMode);
  }

  private toggleScreenMode(): void {
    const currentScreenMode = this.state.screenMode;
    if (currentScreenMode === 'spectralDensity') {
      this.state.screenMode = 'waterfall';
      this.screen = this.waterfall;
    } else if (currentScreenMode === 'waterfall') {
      this.state.screenMode = 'both';
      this.screen = this.spectralDensity; // Default to spectralDensity for simplicity
    } else {
      this.state.screenMode = 'spectralDensity';
      this.screen = this.spectralDensity;
    }

    this.updateScreenModeButton();
  }

  private updateScreenModeButton(): void {
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
  }

  private togglePause(): void {
    this.state.isPaused = !this.state.isPaused;

    this.updatePauseButton();

    this.emit(Events.SPEC_A_IF_RF_MODE_CHANGED, {
      unit: this.unit,
      isPaused: this.state.isPaused,
    });
  }

  private updatePauseButton(): void {
    this.domCache['pauseButton'].classList.toggle('active', this.state.isPaused);
  }

  private updateFrequency(frequency: Hertz): void {
    this.state.centerFrequency = frequency;
    this.syncDomWithState();
  }

  private syncDomWithState(): void {
    // Update header span
    this.domCache['span'].textContent = `Span: ${this.state.span / 1e6} MHz`;

    // Update info display
    this.domCache['info'].innerHTML = html`
      <div>CF: ${this.state.centerFrequency / 1e6} MHz</div>
      <div>Ant: ${this.state.antenna_id}</div>
    `;

    this.updateIfRfModeButton();
    this.updatePauseButton();
  }
}