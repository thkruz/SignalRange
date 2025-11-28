import { AnalyzerControl } from '../../../equipment/real-time-spectrum-analyzer/analyzer-control';
import { RealTimeSpectrumAnalyzer } from '../../../equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';

/**
 * Adapter for integrating advanced spectrum analyzer controls into the RX Analysis tab.
 * Embeds the AnalyzerControl component in an expandable card and manages expand/collapse state.
 */
export class SpectrumAnalyzerAdvancedAdapter {
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private readonly containerEl: HTMLElement;
  private analyzerControl: AnalyzerControl | null = null;
  private isExpanded: boolean = false;

  constructor(spectrumAnalyzer: RealTimeSpectrumAnalyzer, containerEl: HTMLElement) {
    this.spectrumAnalyzer = spectrumAnalyzer;
    this.containerEl = containerEl;
    this.initialize_();
  }

  private initialize_(): void {
    // Find the control container element
    const controlContainer = this.containerEl.querySelector('#spec-analyzer-advanced-controls');
    if (!controlContainer) {
      console.error('Advanced controls container not found');
      return;
    }

    // Create AnalyzerControl instance
    this.analyzerControl = new AnalyzerControl({
      element: controlContainer as HTMLElement,
      spectrumAnalyzer: this.spectrumAnalyzer,
    });

    // Initialize the control (injects HTML)
    this.analyzerControl.init_(controlContainer.id, 'replace');

    // Setup expand/collapse handler
    this.setupExpandCollapseHandler_();
  }

  private setupExpandCollapseHandler_(): void {
    const toggleBtn = this.containerEl.querySelector('#spec-analyzer-advanced-toggle');
    const collapseEl = this.containerEl.querySelector('#spec-analyzer-advanced-collapse');

    if (!toggleBtn || !collapseEl) return;

    toggleBtn.addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;

      if (this.isExpanded) {
        collapseEl.classList.add('show');
        toggleBtn.innerHTML = '<span class="icon">▼</span> Hide Advanced Controls';
      } else {
        collapseEl.classList.remove('show');
        toggleBtn.innerHTML = '<span class="icon">▶</span> Show Advanced Controls';
      }
    });
  }

  dispose(): void {
    this.analyzerControl = null;
  }
}
