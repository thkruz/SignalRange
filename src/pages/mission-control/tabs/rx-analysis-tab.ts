import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { FILTER_BANDWIDTH_CONFIGS } from "@app/equipment/rf-front-end/filter-module/filter-module-core";
import { FilterAdapter } from './filter-adapter';
import { IQConstellationAdapter } from './iq-constellation-adapter';
import { LNBAdapter } from './lnb-adapter';
import { ReceiverAdapter } from './receiver-adapter';
import './rx-analysis-tab.css';
import { SpectrumAnalyzerAdapter } from './spectrum-analyzer-adapter';
import { SpectrumAnalyzerAdvancedAdapter } from './spectrum-analyzer-advanced-adapter';

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
  private spectrumAnalyzerAdvancedAdapter: SpectrumAnalyzerAdvancedAdapter | null = null;
  private receiverAdapter: ReceiverAdapter | null = null;
  private iqConstellationAdapter: IQConstellationAdapter | null = null;

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
      <div class="row g-2 pb-6">
        <!-- LNB Control Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">LNB (Low Noise Block)</h3>
              <div id="lnb-alarm-badge"></div>
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
                <label class="form-label text-muted small text-uppercase">Gain</label>
                <div class="d-flex align-items-center gap-2">
                  <div class="btn-group btn-group-sm">
                    <button id="lnb-gain-dec-coarse" class="btn btn-outline-secondary" title="-1 dB">-1</button>
                    <button id="lnb-gain-dec-fine" class="btn btn-outline-secondary" title="-0.1 dB">-.1</button>
                  </div>
                  <div class="input-group input-group-sm" style="width: 100px;">
                    <input type="number" id="lnb-gain" class="form-control text-center font-monospace" min="0" max="65" step="0.1" value="0" />
                  </div>
                  <div class="btn-group btn-group-sm">
                    <button id="lnb-gain-inc-fine" class="btn btn-outline-secondary" title="+0.1 dB">+.1</button>
                    <button id="lnb-gain-inc-coarse" class="btn btn-outline-secondary" title="+1 dB">+1</button>
                  </div>
                  <span class="text-muted small">dB</span>
                </div>
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

        <!-- Spectrum Analyzer Canvas Card -->
        <div class="col-7">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Spectrum Analyzer</h3>
            </div>
            <div class="card-body">
              <div id="spec-analyzer-canvas-container" class="spec-analyzer-canvas row g-2">
                <!-- Canvas will be moved here by adapter -->
              </div>
            </div>
          </div>
        </div>

        <!-- Spectrum Analyzer Controls Card -->
        <div class="col-5">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Spectrum Analyzer Controls</h3>
            </div>
            <div class="card-body" id="spec-analyzer-controls">
              <!-- Frequency & Amplitude Row -->
              <div class="row g-2 mb-2">
                <div class="col-md-3">
                  <label class="form-label d-flex justify-content-between">
                    <span class="text-muted small text-uppercase">Center Frequency</span>
                    <span id="sa-center-freq-display" class="fw-bold font-monospace">600.000 MHz</span>
                  </label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-center-freq" class="form-control" step="0.001">
                    <span class="input-group-text">MHz</span>
                  </div>
                </div>
                <div class="col-md-3">
                  <label class="form-label d-flex justify-content-between">
                    <span class="text-muted small text-uppercase">Span</span>
                    <span id="sa-span-display" class="fw-bold font-monospace">100.000 MHz</span>
                  </label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-span" class="form-control" step="0.001">
                    <span class="input-group-text">MHz</span>
                  </div>
                </div>
                <div class="col-md-3">
                  <label class="form-label d-flex justify-content-between">
                    <span class="text-muted small text-uppercase">Reference Level</span>
                    <span id="sa-ref-level-display" class="fw-bold font-monospace">0 dBm</span>
                  </label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-ref-level" class="form-control" step="1">
                    <span class="input-group-text">dBm</span>
                  </div>
                </div>
                <div class="col-md-3">
                  <label class="form-label text-muted small text-uppercase">Scale (dB/div)</label>
                  <select id="sa-scale" class="form-select form-select-sm">
                    <option value="1">1 dB</option>
                    <option value="2">2 dB</option>
                    <option value="5">5 dB</option>
                    <option value="6" selected>6 dB</option>
                    <option value="10">10 dB</option>
                  </select>
                </div>
              </div>

              <div class="row g-2 mb-2">
                <div class="col-md-3">
                  <label class="form-label text-muted small text-uppercase">Resolution BW</label>
                  <select id="sa-rbw" class="form-select form-select-sm">
                    <option value="auto">Auto</option>
                    <option value="0.0001">100 Hz</option>
                    <option value="0.001">1 kHz</option>
                    <option value="0.01">10 kHz</option>
                    <option value="0.1">100 kHz</option>
                    <option value="1">1 MHz</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label d-flex justify-content-between">
                    <span class="text-muted small text-uppercase">Min Amplitude</span>
                  </label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-min-amp" class="form-control" step="1">
                    <span class="input-group-text">dBm</span>
                  </div>
                </div>
                <div class="col-md-3">
                  <label class="form-label d-flex justify-content-between">
                    <span class="text-muted small text-uppercase">Max Amplitude</span>
                  </label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-max-amp" class="form-control" step="1">
                    <span class="input-group-text">dBm</span>
                  </div>
                </div>
                <div class="col-md-3">
                  <label class="form-label d-flex justify-content-between">
                    <span class="text-muted small text-uppercase">Refresh Rate</span>
                    <span id="sa-refresh-display" class="fw-bold font-monospace">10 Hz</span>
                  </label>
                  <input type="range" id="sa-refresh" class="form-range" min="1" max="30" step="1" value="10">
                </div>
              </div>

              <!-- Display Mode & Actions -->
              <div class="row g-2 mb-2">
                <div class="col-12">
                  <div class="d-flex flex-wrap gap-2 align-items-center">
                    <div class="btn-group btn-group-sm">
                      <button id="sa-mode-spectral" class="btn btn-outline-primary active">Spectral</button>
                      <button id="sa-mode-waterfall" class="btn btn-outline-primary">Waterfall</button>
                      <button id="sa-mode-both" class="btn btn-outline-primary">Both</button>
                    </div>
                    <button id="sa-auto-tune" class="btn btn-primary btn-sm">Auto-Tune</button>
                    <button id="sa-pause" class="btn btn-warning btn-sm">Pause</button>
                    <div class="form-check form-switch ms-2">
                      <input type="checkbox" id="sa-max-hold" class="form-check-input" role="switch">
                      <label for="sa-max-hold" class="form-check-label">Max Hold</label>
                    </div>
                    <div class="form-check form-switch">
                      <input type="checkbox" id="sa-min-hold" class="form-check-input" role="switch">
                      <label for="sa-min-hold" class="form-check-label">Min Hold</label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Trace Controls -->
              <div class="row g-2 mb-2">
                <div class="col-12">
                  <label class="form-label text-muted small text-uppercase">Traces</label>
                  <div class="d-flex flex-wrap gap-2 align-items-center">
                    <div class="btn-group btn-group-sm">
                      <button id="sa-trace-1" class="btn btn-outline-primary active" data-trace="1">T1</button>
                      <button id="sa-trace-2" class="btn btn-outline-primary" data-trace="2">T2</button>
                      <button id="sa-trace-3" class="btn btn-outline-primary" data-trace="3">T3</button>
                    </div>
                    <div class="form-check form-switch">
                      <input type="checkbox" id="sa-trace-visible" class="form-check-input" role="switch" checked>
                      <label for="sa-trace-visible" class="form-check-label">Visible</label>
                    </div>
                    <div class="form-check form-switch">
                      <input type="checkbox" id="sa-trace-updating" class="form-check-input" role="switch" checked>
                      <label for="sa-trace-updating" class="form-check-label">Updating</label>
                    </div>
                    <select id="sa-trace-mode" class="form-select form-select-sm" style="width: auto;">
                      <option value="clearwrite">Clear Write</option>
                      <option value="maxhold">Max Hold</option>
                      <option value="minhold">Min Hold</option>
                      <option value="average">Average</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Markers -->
              <div class="row g-2">
                <div class="col-12">
                  <div class="d-flex gap-3 align-items-center">
                    <div class="form-check form-switch">
                      <input type="checkbox" id="sa-marker-enabled" class="form-check-input" role="switch">
                      <label for="sa-marker-enabled" class="form-check-label">Markers</label>
                    </div>
                    <div class="input-group input-group-sm" style="width: auto;">
                      <span class="input-group-text">Index</span>
                      <input type="number" id="sa-marker-index" class="form-control" min="0" style="width: 60px;">
                    </div>
                    <span id="sa-marker-info" class="text-muted small font-monospace">Peak: --- MHz @ --- dBm</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- I&Q Constellation Card -->
        <div class="col-lg-3">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">I&Q Constellation</h3>
            </div>
            <div class="card-body d-flex align-items-center justify-content-center">
              <div id="iq-constellation-container"></div>
            </div>
          </div>
        </div>

        <!-- Receiver Modems Card -->
        <div class="col-lg-9">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">Receiver Modems</h3>
              <div id="rx-alarm-badge"></div>
            </div>
            <div class="card-body">
              <!-- Modem Selection Buttons -->
              <div class="btn-group mb-3" role="group">
                <button class="btn btn-outline-primary modem-btn" data-modem="1">RX 1</button>
                <button class="btn btn-outline-primary modem-btn" data-modem="2">RX 2</button>
                <button class="btn btn-outline-primary modem-btn" data-modem="3">RX 3</button>
                <button class="btn btn-outline-primary modem-btn" data-modem="4">RX 4</button>
              </div>

              <div class="row g-2">
                <!-- Configuration Panel -->
                <div class="col-lg-4">
                  <div class="card h-100">
                    <div class="card-header">
                      <h4 class="card-title">Configuration</h4>
                    </div>
                    <div class="card-body">
                      <!-- Antenna selector -->
                      <div class="mb-3">
                        <label for="antenna-select" class="form-label">Antenna</label>
                        <select id="antenna-select" class="form-select">
                          <option value="1">Antenna 1</option>
                          <option value="2">Antenna 2</option>
                        </select>
                        <small class="text-muted">Current: <span id="antenna-current">--</span></small>
                      </div>

                      <!-- Frequency input -->
                      <div class="mb-3">
                        <label for="frequency-input" class="form-label">Frequency (MHz)</label>
                        <input id="frequency-input" type="number" class="form-control" step="0.1" />
                        <small class="text-muted">Current: <span id="frequency-current">--</span></small>
                      </div>

                      <!-- Bandwidth input -->
                      <div class="mb-3">
                        <label for="bandwidth-input" class="form-label">Bandwidth (MHz)</label>
                        <input id="bandwidth-input" type="number" class="form-control" step="0.1" />
                        <small class="text-muted">Current: <span id="bandwidth-current">--</span></small>
                      </div>

                      <!-- Modulation selector -->
                      <div class="mb-3">
                        <label for="modulation-select" class="form-label">Modulation</label>
                        <select id="modulation-select" class="form-select">
                          <option value="BPSK">BPSK</option>
                          <option value="QPSK">QPSK</option>
                          <option value="8QAM">8QAM</option>
                          <option value="16QAM">16QAM</option>
                        </select>
                        <small class="text-muted">Current: <span id="modulation-current">--</span></small>
                      </div>

                      <!-- FEC selector -->
                      <div class="mb-3">
                        <label for="fec-select" class="form-label">FEC Rate</label>
                        <select id="fec-select" class="form-select">
                          <option value="1/2">1/2</option>
                          <option value="2/3">2/3</option>
                          <option value="3/4">3/4</option>
                          <option value="5/6">5/6</option>
                          <option value="7/8">7/8</option>
                        </select>
                        <small class="text-muted">Current: <span id="fec-current">--</span></small>
                      </div>

                      <button id="apply-btn" class="btn btn-primary w-100">Apply Changes</button>
                    </div>
                  </div>
                </div>

                <!-- Video Monitor -->
                <div class="col-lg-4">
                  <div class="card h-100">
                    <div class="card-header">
                      <h4 class="card-title">Video Monitor</h4>
                    </div>
                    <div class="card-body d-flex align-items-center justify-content-center p-0">
                      <div id="video-monitor" class="video-monitor no-signal">
                        <img id="video-feed" class="video-feed" alt="Video feed" />
                        <div class="video-overlay">NO SIGNAL</div>
                        <div class="signal-degraded-overlay"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Status & Control Panel -->
                <div class="col-lg-4">
                  <div class="card h-100">
                    <div class="card-header">
                      <h4 class="card-title">Status & Control</h4>
                    </div>
                    <div class="card-body">
                      <!-- Power Switch -->
                      <div class="mb-3">
                        <div class="form-check form-switch">
                          <input id="power-switch" type="checkbox" class="form-check-input" role="switch" checked />
                          <label for="power-switch" class="form-check-label">Power</label>
                        </div>
                      </div>

                      <!-- Signal Quality LED -->
                      <div class="mb-3">
                        <div class="d-flex justify-content-between align-items-center">
                          <span class="text-muted">Signal Quality:</span>
                          <div id="signal-led" class="led led-gray"></div>
                        </div>
                      </div>

                      <!-- Status Info -->
                      <div class="mb-2">
                        <div class="d-flex justify-content-between">
                          <span class="text-muted small">SNR:</span>
                          <span id="snr-display" class="fw-bold font-monospace">-- dB</span>
                        </div>
                      </div>
                      <div class="mb-2">
                        <div class="d-flex justify-content-between">
                          <span class="text-muted small">Power Level:</span>
                          <span id="power-level-display" class="fw-bold font-monospace">-- dBm</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Status Bar -->
              <div id="status-bar" class="alert alert-info mt-3" role="alert">
                Ready
              </div>
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
    const receiver = this.groundStation.receivers[0];

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

    // Create advanced spectrum analyzer adapter
    if (spectrumAnalyzer && this.dom_) {
      this.spectrumAnalyzerAdvancedAdapter = new SpectrumAnalyzerAdvancedAdapter(
        spectrumAnalyzer,
        this.dom_
      );
    }

    // Create receiver adapter if receiver exists
    if (receiver && this.dom_) {
      this.receiverAdapter = new ReceiverAdapter(receiver, this.dom_);
    }

    // Create I&Q constellation adapter if receiver exists
    if (receiver && this.dom_) {
      this.iqConstellationAdapter = new IQConstellationAdapter(receiver, this.dom_);
    }
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
    this.spectrumAnalyzerAdvancedAdapter?.dispose();
    this.receiverAdapter?.dispose();
    this.iqConstellationAdapter?.dispose();

    this.lnbAdapter = null;
    this.filterAdapter = null;
    this.spectrumAnalyzerAdapter = null;
    this.spectrumAnalyzerAdvancedAdapter = null;
    this.receiverAdapter = null;
    this.iqConstellationAdapter = null;

    this.dom_?.remove();
  }
}
