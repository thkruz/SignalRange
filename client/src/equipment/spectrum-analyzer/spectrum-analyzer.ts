import { Events } from "../../events/events";
import { Hertz } from "../../types";
import { html } from '../../utils';
import { Antenna } from '../antenna/antenna';
import { Equipment } from '../equipment';
import { AnalyzerControl } from "./analyzer-control";
import './spectrum-analyzer.css';
import { SpectrumScreen } from './spectrum-screen';

export interface SpectrumAnalyzerState {
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
}

/**
 * SpectrumAnalyzer - Configuration and settings manager
 * Delegates all rendering to SpectrumScreen for separation of concerns
 */
export class SpectrumAnalyzer extends Equipment {
  protected state_: SpectrumAnalyzerState;
  get state(): SpectrumAnalyzerState {
    return this.state_;
  }

  // Screen renderer
  screen: SpectrumScreen | null = null;

  // Antenna reference
  private readonly antenna: Antenna;

  // Decibel management
  private readonly minDecibels: number = -120;
  private readonly maxDecibels: number = -80;
  private readonly noiseFloor: number = -115;

  constructor(parentId: string, unit: number, teamId: number = 1, antenna: Antenna) {
    super(parentId, unit, teamId);

    this.antenna = antenna;

    // Initialize config
    this.state_ = {
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
          <button class="btn-mode ${this.state.isRfMode ? 'active' : ''}" data-action="mode">
            ${this.state.isRfMode ? 'RF' : 'IF'}
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
    this.domCache['modeButton'] = parentDom.querySelector('.btn-mode') as HTMLElement;
    this.domCache['pauseButton'] = parentDom.querySelector('.btn-pause') as HTMLElement;

    // initialize screen
    this.initializeScreen();

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
        case 'mode':
          this.toggleMode();
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
      this.state_ = { ...this.state, ...data };

      if (data.frequency) {
        this.updateFrequency(data.frequency);
      }
    }
  }

  protected initialize(): void {
    if (this.screen) {
      this.screen.start();
    }
  }

  /**
   * Initialize the screen renderer
   */
  private initializeScreen(): void {
    if (!this.domCache['canvas']) throw new Error('Canvas element not found for Spectrum Analyzer');

    this.screen = new SpectrumScreen(this.domCache['canvas'] as HTMLCanvasElement, this.antenna, this);

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

  public sync(spectrumAnalyzerState: SpectrumAnalyzerState): void {
    this.state_ = { ...this.state, ...spectrumAnalyzerState };
    this.updateScreenState();
    this.updateDisplay();
  }

  public update(): void {
    if (this.screen && !this.state.isPaused) {
      this.screen.update();
    }
  }

  public getConfig(): SpectrumAnalyzerState {
    return { ...this.state };
  }

  public changeCenterFreq(freq: number): void {
    this.state.centerFrequency = freq as Hertz;
    this.updateScreenState();
    this.updateDisplay();
  }

  public changeBandwidth(freqSpan: number): void {
    this.state.span = freqSpan as Hertz;
    this.updateScreenState();
    this.updateDisplay();
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
    const control = new AnalyzerControl({
      spectrumAnalyzer: this,
      onClose: () => {
        console.log('Control panel closed');
      }
    });

    control.init();
    control.show();
  }

  private toggleMode(): void {
    this.state.isRfMode = !this.state.isRfMode;

    this.updateModeButton();

    this.emit(Events.SPEC_A_MODE_CHANGED, {
      unit: this.unit,
      isRfMode: this.state.isRfMode,
    });
  }

  private updateModeButton(): void {
    this.domCache['modeButton'].textContent = this.state.isRfMode ? 'RF' : 'IF';
    this.domCache['modeButton'].classList.toggle('active', this.state.isRfMode);
  }

  private togglePause(): void {
    this.state.isPaused = !this.state.isPaused;

    this.updatePauseButton();

    this.emit(Events.SPEC_A_MODE_CHANGED, {
      unit: this.unit,
      isPaused: this.state.isPaused,
    });
  }

  private updatePauseButton(): void {
    this.domCache['pauseButton'].classList.toggle('active', this.state.isPaused);
  }

  private updateFrequency(frequency: Hertz): void {
    this.state.centerFrequency = frequency;
    this.updateScreenState();
    this.updateDisplay();
  }

  private updateDisplay(): void {
    // Update header span
    this.domCache['span'].textContent = `Span: ${this.state.span / 1e6} MHz`;

    // Update info display
    this.domCache['info'].innerHTML = html`
      <div>CF: ${this.state.centerFrequency / 1e6} MHz</div>
      <div>Ant: ${this.state.antenna_id}</div>
    `;

    this.updateModeButton();
    this.updatePauseButton();
  }

  /**
   * Static Utility Methods (kept for backward compatibility)
   */

  public static getFreqBandInfo(band: string): { minFreq: number; maxFreq: number } {
    const freqBands: Record<string, { minFreq: number; maxFreq: number }> = {
      hf: { minFreq: 3e6, maxFreq: 30e6 },
      vhf: { minFreq: 30e6, maxFreq: 300e6 },
      uhf: { minFreq: 300e6, maxFreq: 3e9 },
      l: { minFreq: 1e9, maxFreq: 2e9 },
      s: { minFreq: 2e9, maxFreq: 4e9 },
      c: { minFreq: 4e9, maxFreq: 8e9 },
      x: { minFreq: 8e9, maxFreq: 12e9 },
      ku: { minFreq: 12e9, maxFreq: 18e9 },
      k: { minFreq: 18e9, maxFreq: 27e9 },
      ka: { minFreq: 27e9, maxFreq: 40e9 },
    };

    if (!freqBands[band]) {
      throw new Error(`Invalid frequency band: ${band}`);
    }

    return freqBands[band];
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    if (this.screen) {
      this.screen.dispose();
      this.screen = null;
    }
  }
}