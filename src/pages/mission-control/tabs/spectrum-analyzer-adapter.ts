import { RealTimeSpectrumAnalyzer } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { qs } from "@app/engine/utils/query-selector";

/**
 * SpectrumAnalyzerAdapter - Manages spectrum analyzer canvas in mission control tab
 *
 * Provides:
 * - Canvas element management (moves canvas from hidden container to tab)
 * - Control methods that call spectrum analyzer's public API
 * - Simplified interface for tab integration
 */
export class SpectrumAnalyzerAdapter {
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private readonly containerEl: HTMLElement;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private canvasContainer: HTMLElement | null = null;

  constructor(spectrumAnalyzer: RealTimeSpectrumAnalyzer, containerEl: HTMLElement) {
    this.spectrumAnalyzer = spectrumAnalyzer;
    this.containerEl = containerEl;

    this.initialize_();
  }

  private initialize_(): void {
    // Get the canvas container from the tab
    this.canvasContainer = qs('#spec-analyzer-canvas-container', this.containerEl);

    if (!this.canvasContainer) {
      console.error('Spectrum analyzer canvas container not found in tab');
      return;
    }

    // Cache DOM elements
    this.setupDomCache_();

    // Move the spectrum analyzer's canvas to the tab container
    this.embedCanvas_();

    // Setup control event listeners
    this.setupControls_();
  }

  private setupDomCache_(): void {
    this.domCache_.set('cfInput', qs('#spec-analyzer-center-freq', this.containerEl));
    this.domCache_.set('cfDisplay', qs('#spec-analyzer-center-freq-display', this.containerEl));
    this.domCache_.set('spanInput', qs('#spec-analyzer-span', this.containerEl));
    this.domCache_.set('spanDisplay', qs('#spec-analyzer-span-display', this.containerEl));
    this.domCache_.set('pauseBtn', qs('#spec-analyzer-pause-btn', this.containerEl));
    this.domCache_.set('autoTuneBtn', qs('#spec-analyzer-autotune-btn', this.containerEl));
  }

  private embedCanvas_(): void {
    if (!this.canvasContainer) return;

    // Get the canvas elements from the spectrum analyzer using public getters
    const canvas = this.spectrumAnalyzer.getCanvas();
    const canvasSpectral = this.spectrumAnalyzer.getSpectralCanvas();
    const canvasWaterfall = this.spectrumAnalyzer.getWaterfallCanvas();

    if (canvas && canvasSpectral && canvasWaterfall) {
      // Move all three canvases to the tab container
      this.canvasContainer.innerHTML = ''; // Clear any placeholder content
      this.canvasContainer.appendChild(canvas);
      this.canvasContainer.appendChild(canvasSpectral);
      this.canvasContainer.appendChild(canvasWaterfall);
    }
  }

  private setupControls_(): void {
    const cfInput = this.domCache_.get('cfInput') as HTMLInputElement;
    const spanInput = this.domCache_.get('spanInput') as HTMLInputElement;
    const pauseBtn = this.domCache_.get('pauseBtn');
    const autoTuneBtn = this.domCache_.get('autoTuneBtn');

    // Center Frequency control
    cfInput?.addEventListener('input', this.cfHandler_.bind(this));

    // Span control
    spanInput?.addEventListener('input', this.spanHandler_.bind(this));

    // Pause/Resume button
    pauseBtn?.addEventListener('click', this.pauseHandler_.bind(this));

    // Auto-tune button
    autoTuneBtn?.addEventListener('click', this.autoTuneHandler_.bind(this));

    // Initial sync
    this.syncControlsWithState_();
  }

  private cfHandler_(e: Event): void {
    const freq = parseFloat((e.target as HTMLInputElement).value) * 1e6; // Convert MHz to Hz
    this.spectrumAnalyzer.changeCenterFreq(freq);
  }

  private spanHandler_(e: Event): void {
    const span = parseFloat((e.target as HTMLInputElement).value) * 1e6; // Convert MHz to Hz
    this.spectrumAnalyzer.changeBandwidth(span);
  }

  private pauseHandler_(): void {
    this.spectrumAnalyzer.togglePause();
    this.updatePauseButton_();
  }

  private autoTuneHandler_(): void {
    this.spectrumAnalyzer.freqAutoTune();
    this.syncControlsWithState_();
  }

  private syncControlsWithState_(): void {
    const state = this.spectrumAnalyzer.state;

    // Update center frequency display
    const cfInput = this.domCache_.get('cfInput') as HTMLInputElement;
    const cfDisplay = this.domCache_.get('cfDisplay');
    if (cfInput) cfInput.value = (state.centerFrequency / 1e6).toFixed(3);
    if (cfDisplay) cfDisplay.textContent = `${(state.centerFrequency / 1e6).toFixed(3)} MHz`;

    // Update span display
    const spanInput = this.domCache_.get('spanInput') as HTMLInputElement;
    const spanDisplay = this.domCache_.get('spanDisplay');
    if (spanInput) spanInput.value = (state.span / 1e6).toFixed(3);
    if (spanDisplay) spanDisplay.textContent = `${(state.span / 1e6).toFixed(3)} MHz`;

    // Update pause button
    this.updatePauseButton_();
  }

  private updatePauseButton_(): void {
    const pauseBtn = this.domCache_.get('pauseBtn');
    if (pauseBtn) {
      pauseBtn.textContent = this.spectrumAnalyzer.state.isPaused ? 'Resume' : 'Pause';
      pauseBtn.className = this.spectrumAnalyzer.state.isPaused
        ? 'btn btn-success btn-sm'
        : 'btn btn-warning btn-sm';
    }
  }

  dispose(): void {
    // Note: We don't destroy the canvas elements as they belong to the spectrum analyzer
    // We just remove them from the tab container
    if (this.canvasContainer) {
      this.canvasContainer.innerHTML = '';
    }
  }
}
