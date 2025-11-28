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
  private spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private containerEl: HTMLElement;
  private canvasContainer: HTMLElement | null = null;

  constructor(spectrumAnalyzer: RealTimeSpectrumAnalyzer, containerEl: HTMLElement) {
    this.spectrumAnalyzer = spectrumAnalyzer;
    this.containerEl = containerEl;

    this.initialize();
  }

  private initialize(): void {
    // Get the canvas container from the tab
    this.canvasContainer = qs('#spec-analyzer-canvas-container', this.containerEl);

    if (!this.canvasContainer) {
      console.error('Spectrum analyzer canvas container not found in tab');
      return;
    }

    // Move the spectrum analyzer's canvas to the tab container
    this.embedCanvas();

    // Setup control event listeners
    this.setupControls();
  }

  private embedCanvas(): void {
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

  private setupControls(): void {
    // Center Frequency control
    const cfInput = qs('#spec-analyzer-center-freq', this.containerEl) as HTMLInputElement;
    cfInput?.addEventListener('input', (e) => {
      const freq = parseFloat((e.target as HTMLInputElement).value) * 1e6; // Convert MHz to Hz
      this.spectrumAnalyzer.changeCenterFreq(freq);
    });

    // Span control
    const spanInput = qs('#spec-analyzer-span', this.containerEl) as HTMLInputElement;
    spanInput?.addEventListener('input', (e) => {
      const span = parseFloat((e.target as HTMLInputElement).value) * 1e6; // Convert MHz to Hz
      this.spectrumAnalyzer.changeBandwidth(span);
    });

    // Pause/Resume button
    const pauseBtn = qs('#spec-analyzer-pause-btn', this.containerEl);
    pauseBtn?.addEventListener('click', () => {
      this.spectrumAnalyzer.togglePause();
      this.updatePauseButton();
    });

    // Auto-tune button
    const autoTuneBtn = qs('#spec-analyzer-autotune-btn', this.containerEl);
    autoTuneBtn?.addEventListener('click', () => {
      this.spectrumAnalyzer.freqAutoTune();
      this.syncControlsWithState();
    });

    // Initial sync
    this.syncControlsWithState();
  }

  private syncControlsWithState(): void {
    const state = this.spectrumAnalyzer.state;

    // Update center frequency display
    const cfInput = qs('#spec-analyzer-center-freq', this.containerEl) as HTMLInputElement;
    const cfDisplay = qs('#spec-analyzer-center-freq-display', this.containerEl);
    if (cfInput) cfInput.value = (state.centerFrequency / 1e6).toFixed(3);
    if (cfDisplay) cfDisplay.textContent = `${(state.centerFrequency / 1e6).toFixed(3)} MHz`;

    // Update span display
    const spanInput = qs('#spec-analyzer-span', this.containerEl) as HTMLInputElement;
    const spanDisplay = qs('#spec-analyzer-span-display', this.containerEl);
    if (spanInput) spanInput.value = (state.span / 1e6).toFixed(3);
    if (spanDisplay) spanDisplay.textContent = `${(state.span / 1e6).toFixed(3)} MHz`;

    // Update pause button
    this.updatePauseButton();
  }

  private updatePauseButton(): void {
    const pauseBtn = qs('#spec-analyzer-pause-btn', this.containerEl);
    if (pauseBtn) {
      pauseBtn.textContent = this.spectrumAnalyzer.state.isPaused ? 'Resume' : 'Pause';
      pauseBtn.className = this.spectrumAnalyzer.state.isPaused
        ? 'btn btn-success btn-sm'
        : 'btn btn-warning btn-sm';
    }
  }

  public dispose(): void {
    // Note: We don't destroy the canvas elements as they belong to the spectrum analyzer
    // We just remove them from the tab container
    if (this.canvasContainer) {
      this.canvasContainer.innerHTML = '';
    }
  }
}
