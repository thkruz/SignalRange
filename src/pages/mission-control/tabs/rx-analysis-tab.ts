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
      <div class="row g-3 pb-6">
        <!-- LNB Control Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">LNB (Low Noise Block)</h3>
            </div>
            <div class="card-body">
              <!-- LO Frequency Control -->
              <div class="mb-3">
                <label for="lnb-lo-frequency" class="form-label d-flex justify-content-between">
                  <span class="text-muted small text-uppercase">LO Frequency</span>
                  <span id="lnb-lo-frequency-display" class="fw-bold font-monospace">6080 MHz</span>
                </label>
                <input
                  type="range"
                  id="lnb-lo-frequency"
                  class="form-range"
                  min="5000"
                  max="7000"
                  step="10"
                  value="6080"
                />
              </div>

              <!-- Gain Control -->
              <div class="mb-3">
                <label for="lnb-gain" class="form-label d-flex justify-content-between">
                  <span class="text-muted small text-uppercase">Gain</span>
                  <span id="lnb-gain-display" class="fw-bold font-monospace">0.0 dB</span>
                </label>
                <input
                  type="range"
                  id="lnb-gain"
                  class="form-range"
                  min="0"
                  max="65"
                  step="0.5"
                  value="0"
                />
              </div>

              <!-- Power Switch -->
              <div class="form-check form-switch mb-3">
                <input type="checkbox" id="lnb-power" class="form-check-input" role="switch" checked />
                <label for="lnb-power" class="form-check-label">Power</label>
              </div>

              <!-- Status Indicators -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Noise Temp:</span>
                <span id="lnb-noise-temp-display" class="fw-bold font-monospace">45 K</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Lock Status:</span>
                <div id="lnb-lock-led" class="led led-green"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Filter Control Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">IF Filter</h3>
            </div>
            <div class="card-body">
              <!-- Bandwidth Selector -->
              <div class="mb-3">
                <label for="filter-bandwidth" class="form-label text-muted small text-uppercase">Bandwidth</label>
                <select id="filter-bandwidth" class="form-select">
                  ${this.generateFilterOptions()}
                </select>
                <span id="filter-bandwidth-display" class="fw-bold font-monospace mt-2 d-block">20 MHz</span>
              </div>

              <!-- Filter Metrics -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Insertion Loss:</span>
                <span id="filter-insertion-loss-display" class="fw-bold font-monospace">2.0 dB</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Noise Floor:</span>
                <span id="filter-noise-floor-display" class="fw-bold font-monospace">-101 dBm</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Spectrum Analyzer Card -->
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Spectrum Analyzer</h3>
            </div>
            <div class="card-body">
              <!-- Spectrum Analyzer Canvas -->
              <div id="spec-analyzer-canvas-container" class="spec-analyzer-canvas mb-3">
                <!-- Canvas will be moved here by adapter -->
              </div>

              <!-- Spectrum Analyzer Controls -->
              <div class="row g-2">
                <div class="col-md-4">
                  <label for="spec-analyzer-center-freq" class="form-label text-muted small">Center Frequency (MHz)</label>
                  <input
                    type="number"
                    id="spec-analyzer-center-freq"
                    class="form-control form-control-sm"
                    step="0.1"
                    value="1500"
                  />
                  <span id="spec-analyzer-center-freq-display" class="fw-bold font-monospace small mt-1 d-block">1500.000 MHz</span>
                </div>

                <div class="col-md-4">
                  <label for="spec-analyzer-span" class="form-label text-muted small">Span (MHz)</label>
                  <input
                    type="number"
                    id="spec-analyzer-span"
                    class="form-control form-control-sm"
                    step="0.1"
                    value="100"
                  />
                  <span id="spec-analyzer-span-display" class="fw-bold font-monospace small mt-1 d-block">100.000 MHz</span>
                </div>

                <div class="col-md-4 d-flex align-items-end gap-2">
                  <button id="spec-analyzer-pause-btn" class="btn btn-warning btn-sm">Pause</button>
                  <button id="spec-analyzer-autotune-btn" class="btn btn-primary btn-sm">Auto-Tune</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Demodulator Placeholder Card -->
        <div class="col-12 d-none">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Demodulator</h3>
            </div>
            <div class="card-body text-center">
              <p class="text-muted">Demodulator controls coming in Phase 6+</p>
              <p class="text-muted small">Status: Not Implemented</p>
            </div>
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
      this.dom_.style.display = 'block';
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
