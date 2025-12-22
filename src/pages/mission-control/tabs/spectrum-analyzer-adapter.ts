import { RealTimeSpectrumAnalyzer } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { qs } from "@app/engine/utils/query-selector";

/**
 * SpectrumAnalyzerAdapter - Manages spectrum analyzer canvas in mission control tab
 *
 * Provides:
 * - Canvas element management (moves canvas from hidden container to tab)
 * - Canvas visibility management based on screen mode
 *
 * Note: All controls are now handled by SpectrumAnalyzerAdvancedAdapter
 */
export class SpectrumAnalyzerAdapter {
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private readonly containerEl: HTMLElement;
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

    // Move the spectrum analyzer's canvas to the tab container
    this.embedCanvas_();
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

  dispose(): void {
    // Note: We don't destroy the canvas elements as they belong to the spectrum analyzer
    // We just remove them from the tab container
    if (this.canvasContainer) {
      this.canvasContainer.innerHTML = '';
    }
  }
}
