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
  id: number; // 1-4
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

  spectralDensity: SpectralDensityPlot | null = null;
  waterfall: WaterfallDisplay | null = null;

  // For "both" mode, we need separate instances
  spectralDensityBoth: SpectralDensityPlot | null = null;
  waterfallBoth: WaterfallDisplay | null = null;

  configPanel: AnalyzerControlBox | null = null;

  constructor(parentId: string, id: number, antenna: Antenna, teamId: number = 1) {
    super(parentId, id, teamId);

    this.antenna = antenna;

    // Initialize config
    this.state = {
      id: this.id,
      team_id: this.teamId,
      antenna_id: this.antenna.state.id,
      isRfMode: false,
      isPaused: false,
      isTraceOn: false,
      isMarkerOn: false,
      centerFrequency: 4810e6 as Hertz,
      span: 100e6 as Hertz,
      hold: false,
      minDecibels: -120,
      maxDecibels: -80,
      noiseFloor: -115,
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
          <div class="spec-a-title">Spectrum Analyzer ${this.id}</div>
          <div class="spec-a-span">Span: ${this.state.span / 1e6} MHz</div>
        </div>

        <div class="spec-a-canvas-container">
          <canvas id="specA${this.id}" width="1600" height="400" class="spec-a-canvas-single"></canvas>
          <canvas id="specA${this.id}-spectral" width="1600" height="120" class="spec-a-canvas-spectral"></canvas>
          <canvas id="specA${this.id}-waterfall" width="1600" height="280" class="spec-a-canvas-waterfall"></canvas>
        </div>

        <div class="spec-a-info">
          <div>CF: ${this.state.centerFrequency / 1e6} MHz</div>
          <div>Ant: ${this.state.antenna_id}</div>
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
    this.domCache['header'] = parentDom.querySelector('.spec-a-header') as HTMLElement;
    this.domCache['info'] = parentDom.querySelector('.spec-a-info') as HTMLElement;
    this.domCache['controls'] = parentDom.querySelector('.spec-a-controls') as HTMLElement;
    this.domCache['canvas'] = parentDom.querySelector(`#specA${this.id}`) as HTMLCanvasElement;
    this.domCache['canvasSpectral'] = parentDom.querySelector(`#specA${this.id}-spectral`) as HTMLCanvasElement;
    this.domCache['canvasWaterfall'] = parentDom.querySelector(`#specA${this.id}-waterfall`) as HTMLCanvasElement;
    this.domCache['span'] = parentDom.querySelector('.spec-a-span') as HTMLElement;
    this.domCache['configButton'] = parentDom.querySelector('.btn-config') as HTMLButtonElement;
    this.domCache['ifRfModeButton'] = parentDom.querySelector('.btn-mode-if-rf') as HTMLButtonElement;
    this.domCache['screenModeButton'] = parentDom.querySelector('.btn-mode-screen') as HTMLButtonElement;
    this.domCache['pauseButton'] = parentDom.querySelector('.btn-pause') as HTMLButtonElement;

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
    if (data.unit === this.state.id) {
      this.state = { ...this.state, ...data };

      if (data.frequency) {
        this.updateFrequency(data.frequency);
      }
    }
  }

  protected initialize(): void {
    if (!this.domCache['canvas']) throw new Error('Canvas element not found for Spectrum Analyzer');
    if (!this.domCache['canvasSpectral']) throw new Error('Spectral canvas element not found for Spectrum Analyzer');
    if (!this.domCache['canvasWaterfall']) throw new Error('Waterfall canvas element not found for Spectrum Analyzer');

    // Initialize single-mode screens
    this.spectralDensity = new SpectralDensityPlot(this.domCache['canvas'] as HTMLCanvasElement, this.antenna, this);
    this.waterfall = new WaterfallDisplay(this.domCache['canvas'] as HTMLCanvasElement, this.antenna, this);

    // Initialize "both" mode screens with their dedicated canvases
    this.spectralDensityBoth = new SpectralDensityPlot(this.domCache['canvasSpectral'] as HTMLCanvasElement, this.antenna, this);
    this.waterfallBoth = new WaterfallDisplay(this.domCache['canvasWaterfall'] as HTMLCanvasElement, this.antenna, this);

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

  private openConfig(): void {
    this.openConfigPanel();
    this.emit(Events.SPEC_A_CONFIG_CHANGED, { id: this.id });
  }

  private openConfigPanel(): void {
    this.configPanel ??= new AnalyzerControlBox(this);
    this.configPanel.open();
  }

  private toggleIfRfMode(): void {
    this.state.isRfMode = !this.state.isRfMode;

    this.updateIfRfModeButton();

    this.emit(Events.SPEC_A_CONFIG_CHANGED, {
      id: this.id,
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

    this.emit(Events.SPEC_A_CONFIG_CHANGED, {
      id: this.id,
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

  syncDomWithState(): void {
    // Update header span
    this.domCache['span'].textContent = `Span: ${this.state.span / 1e6} MHz`;

    // Update info display
    this.domCache['info'].innerHTML = html`
      <div>CF: ${this.state.centerFrequency / 1e6} MHz</div>
      <div>Ant: ${this.state.antenna_id}</div>
    `;

    this.updateIfRfModeButton();
    this.updateScreenModeButton();
    this.updatePauseButton();
    this.updateScreenVisibility();
  }
}