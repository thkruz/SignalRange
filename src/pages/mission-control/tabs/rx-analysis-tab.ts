import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { FILTER_BANDWIDTH_CONFIGS } from "@app/equipment/rf-front-end/filter-module/filter-module-core";
import { FilterAdapter } from './filter-adapter';
import { LNBAdapter } from './lnb-adapter';
import './rx-analysis-tab.css';
import { SpectrumAnalyzerAdapter } from './spectrum-analyzer-adapter';

/**
 * RxAnalysisTab - Receiver chain analysis and control
 *
 * Phase 5 Implementation:
 * - LNB (Low Noise Block) control: LO frequency, gain, power
 * - IF Filter bandwidth selection
 * - Spectrum Analyzer display with real-time signals
 * - Demodulator status (placeholder for Phase 6+)
 *
 * Equipment Flow:
 * Antenna → OMT → LNB → Filter → Spectrum Analyzer → Demodulator
 */
export class RxAnalysisTab extends BaseElement {
  private readonly groundStation: GroundStation;
  private lnbAdapter: LNBAdapter | null = null;
  private filterAdapter: FilterAdapter | null = null;
  private spectrumAnalyzerAdapter: SpectrumAnalyzerAdapter | null = null;

  constructor(groundStation: GroundStation, containerId: string) {
    super();
    this.groundStation = groundStation;

    // Ensure equipment is initialized
    if (this.groundStation.antennas.length === 0) {
      this.groundStation.initializeEquipment();
    }

    this.init_(containerId, 'replace');
    this.dom_ = qs('.rx-analysis-tab');

    this.addEventListenersLate_();
  }

  protected html_ = html`
    <div class="rx-analysis-tab">
      <!-- LNB Control Section -->
      <div class="rx-section lnb-control">
        <h3 class="rx-section-title">LNB (Low Noise Block)</h3>
        <div class="rx-section-content">
          <!-- LO Frequency Control -->
          <div class="control-group">
            <label for="lnb-lo-frequency">LO Frequency</label>
            <div class="control-with-display">
              <input
                type="range"
                id="lnb-lo-frequency"
                min="5000"
                max="7000"
                step="10"
                value="6080"
                class="form-range"
              />
              <span id="lnb-lo-frequency-display" class="control-display">6080 MHz</span>
            </div>
          </div>

          <!-- Gain Control -->
          <div class="control-group">
            <label for="lnb-gain">Gain</label>
            <div class="control-with-display">
              <input
                type="range"
                id="lnb-gain"
                min="0"
                max="65"
                step="0.5"
                value="0"
                class="form-range"
              />
              <span id="lnb-gain-display" class="control-display">0.0 dB</span>
            </div>
          </div>

          <!-- Power Switch -->
          <div class="control-group">
            <label for="lnb-power">Power</label>
            <div class="switch-control">
              <input type="checkbox" id="lnb-power" class="form-check-input" checked />
              <label for="lnb-power" class="form-check-label">Powered</label>
            </div>
          </div>

          <!-- Status Indicators -->
          <div class="status-group">
            <div class="status-item">
              <span class="status-label">Noise Temp:</span>
              <span id="lnb-noise-temp-display" class="status-value">45 K</span>
            </div>
            <div class="status-item">
              <span class="status-label">Lock Status:</span>
              <div id="lnb-lock-led" class="led led-green"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filter Control Section -->
      <div class="rx-section filter-control">
        <h3 class="rx-section-title">IF Filter</h3>
        <div class="rx-section-content">
          <!-- Bandwidth Selector -->
          <div class="control-group">
            <label for="filter-bandwidth">Bandwidth</label>
            <select id="filter-bandwidth" class="form-select">
              ${this.generateFilterOptions()}
            </select>
            <span id="filter-bandwidth-display" class="control-display">20 MHz</span>
          </div>

          <!-- Filter Metrics -->
          <div class="status-group">
            <div class="status-item">
              <span class="status-label">Insertion Loss:</span>
              <span id="filter-insertion-loss-display" class="status-value">2.0 dB</span>
            </div>
            <div class="status-item">
              <span class="status-label">Noise Floor:</span>
              <span id="filter-noise-floor-display" class="status-value">-101 dBm</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Spectrum Analyzer Section -->
      <div class="rx-section spectrum-analyzer">
        <h3 class="rx-section-title">Spectrum Analyzer</h3>
        <div class="rx-section-content">
          <!-- Spectrum Analyzer Canvas -->
          <div id="spec-analyzer-canvas-container" class="spec-analyzer-canvas">
            <!-- Canvas will be moved here by adapter -->
          </div>

          <!-- Spectrum Analyzer Controls -->
          <div class="spec-analyzer-controls">
            <div class="control-group">
              <label for="spec-analyzer-center-freq">Center Frequency (MHz)</label>
              <div class="control-with-display">
                <input
                  type="number"
                  id="spec-analyzer-center-freq"
                  class="form-control form-control-sm"
                  step="0.1"
                  value="1500"
                />
                <span id="spec-analyzer-center-freq-display" class="control-display">1500.000 MHz</span>
              </div>
            </div>

            <div class="control-group">
              <label for="spec-analyzer-span">Span (MHz)</label>
              <div class="control-with-display">
                <input
                  type="number"
                  id="spec-analyzer-span"
                  class="form-control form-control-sm"
                  step="0.1"
                  value="100"
                />
                <span id="spec-analyzer-span-display" class="control-display">100.000 MHz</span>
              </div>
            </div>

            <div class="spec-analyzer-buttons">
              <button id="spec-analyzer-pause-btn" class="btn btn-warning btn-sm">Pause</button>
              <button id="spec-analyzer-autotune-btn" class="btn btn-primary btn-sm">Auto-Tune</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Demodulator Section (Placeholder) -->
      <div class="rx-section demodulator-placeholder">
        <h3 class="rx-section-title">Demodulator</h3>
        <div class="rx-section-content">
          <div class="placeholder-message">
            <p>Demodulator controls coming in Phase 6+</p>
            <p class="text-muted">Status: Not Implemented</p>
          </div>
        </div>
      </div>
    </div>
  `;

  private generateFilterOptions(): string {
    return FILTER_BANDWIDTH_CONFIGS.map((config, index) => {
      const selected = index === 8 ? 'selected' : ''; // Default to 20 MHz (index 8)
      return `<option value="${index}" ${selected}>${config.label}</option>`;
    }).join('');
  }

  protected addEventListeners_(): void {
    // Add event listeners late
  }

  protected addEventListenersLate_(): void {
    const rfFrontEnd = this.groundStation.rfFrontEnds[0];
    const spectrumAnalyzer = this.groundStation.spectrumAnalyzers[0];

    if (!rfFrontEnd) {
      console.error('RF Front End not found in ground station');
      return;
    }

    if (!spectrumAnalyzer) {
      console.error('Spectrum Analyzer not found in ground station');
      return;
    }

    // Create adapters
    this.lnbAdapter = new LNBAdapter(rfFrontEnd.lnbModule, this.dom_!);
    this.filterAdapter = new FilterAdapter(rfFrontEnd.filterModule, this.dom_!);
    this.spectrumAnalyzerAdapter = new SpectrumAnalyzerAdapter(spectrumAnalyzer, this.dom_!);
  }

  /**
   * Show the tab
   */
  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'grid';
    }
  }

  /**
   * Hide the tab
   */
  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    this.lnbAdapter?.dispose();
    this.filterAdapter?.dispose();
    this.spectrumAnalyzerAdapter?.dispose();

    this.lnbAdapter = null;
    this.filterAdapter = null;
    this.spectrumAnalyzerAdapter = null;

    this.dom_?.remove();
  }
}
