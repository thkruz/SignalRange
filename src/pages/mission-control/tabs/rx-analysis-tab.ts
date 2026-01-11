import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { FILTER_BANDWIDTH_CONFIGS } from "@app/equipment/rf-front-end/filter-module/filter-module-core";
import { AGCAdapter } from './agc-adapter';
import { FilterAdapter } from './filter-adapter';
import { IQConstellationAdapter } from './iq-constellation-adapter';
import { LNBAdapter } from './lnb-adapter';
import { NotchFilterAdapter } from './notch-filter-adapter';
import { ReceiverAdapter } from './receiver-adapter';
import './rx-analysis-tab.css';
import { RxPayloadAdapter } from './rx-payload-adapter';
import { SpectrumAnalyzerAdapter } from './spectrum-analyzer-adapter';
import { SpectrumAnalyzerAdvancedAdapter } from './spectrum-analyzer-advanced-adapter';
import { TapPointAdapter } from './tap-point-adapter';

/**
 * RxAnalysisTab - Receiver chain analysis and control
 *
 * Phase 5 Implementation:
 * - LNB (Low Noise Block) control: LO frequency, gain, power
 * - AGC (Automatic Gain Control): automatic level control with bypass option
 * - IF Filter bandwidth selection
 * - Spectrum Analyzer display with real-time signals
 * - Demodulator status (placeholder for Phase 6+)
 *
 * Equipment Flow:
 * Antenna → OMT → LNB → AGC → Notch Filter → IF Filter → Spectrum Analyzer → Demodulator
 */
export class RxAnalysisTab extends BaseElement {
  protected html_!: string;
  private readonly groundStation: GroundStation;
  private lnbAdapter: LNBAdapter | null = null;
  private agcAdapter: AGCAdapter | null = null;
  private filterAdapter: FilterAdapter | null = null;
  private notchFilterAdapter: NotchFilterAdapter | null = null;
  private spectrumAnalyzerAdapter: SpectrumAnalyzerAdapter | null = null;
  private spectrumAnalyzerAdvancedAdapter: SpectrumAnalyzerAdvancedAdapter | null = null;
  private receiverAdapter: ReceiverAdapter | null = null;
  private iqConstellationAdapter: IQConstellationAdapter | null = null;
  private rxPayloadAdapter_: RxPayloadAdapter | null = null;
  private tapPointAdapter_: TapPointAdapter | null = null;

  constructor(groundStation: GroundStation, containerId: string) {
    super();
    this.groundStation = groundStation;

    // Ensure equipment is initialized
    if (this.groundStation.antennas.length === 0) {
      this.groundStation.initializeEquipment();
    }

    // Must set html_ here (after groundStation is set) for dynamic antenna options
    this.html_ = this.buildHtml_();

    this.init_(containerId, 'replace');
    this.dom_ = qs('.rx-analysis-tab');

    this.addEventListenersLate_();
  }

  private buildHtml_(): string {
    return html`
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
              <div class="equip-adjust-control">
                <label class="equip-adjust-label">LO Frequency</label>
                <div class="equip-adjust-row">
                  <div class="equip-adjust-buttons equip-adjust-decrease">
                    <button id="lnb-lo-dec-coarse" class="btn-equip" title="-100 MHz">-100</button>
                    <button id="lnb-lo-dec-fine" class="btn-equip" title="-10 MHz">-10</button>
                  </div>
                  <div class="equip-adjust-display">
                    <input type="number" id="lnb-lo-frequency" class="equip-adjust-input"
                           min="5000" max="7000" step="any" value="6080" />
                  </div>
                  <div class="equip-adjust-buttons equip-adjust-increase">
                    <button id="lnb-lo-inc-fine" class="btn-equip" title="+10 MHz">+10</button>
                    <button id="lnb-lo-inc-coarse" class="btn-equip" title="+100 MHz">+100</button>
                  </div>
                  <span class="equip-adjust-unit">MHz</span>
                </div>
              </div>

              <!-- Gain Control -->
              <div class="equip-adjust-control">
                <label class="equip-adjust-label">Gain</label>
                <div class="equip-adjust-row">
                  <div class="equip-adjust-buttons equip-adjust-decrease">
                    <button id="lnb-gain-dec-coarse" class="btn-equip" title="-1 dB">-1</button>
                    <button id="lnb-gain-dec-fine" class="btn-equip" title="-0.1 dB">-.1</button>
                  </div>
                  <div class="equip-adjust-display">
                    <input type="number" id="lnb-gain" class="equip-adjust-input"
                           min="0" max="65" step="0.1" value="0" />
                  </div>
                  <div class="equip-adjust-buttons equip-adjust-increase">
                    <button id="lnb-gain-inc-fine" class="btn-equip" title="+0.1 dB">+.1</button>
                    <button id="lnb-gain-inc-coarse" class="btn-equip" title="+1 dB">+1</button>
                  </div>
                  <span class="equip-adjust-unit">dB</span>
                </div>
              </div>

              <!-- Apply Button -->
              <div class="mb-3">
                <button id="lnb-apply-btn" class="btn btn-primary btn-sm">Apply Changes</button>
              </div>

              <!-- Controls and Status Row -->
              <div class="row g-2">
                <!-- Controls Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Controls</div>
                    <div class="form-check form-switch mb-2">
                      <input type="checkbox" id="lnb-power" class="form-check-input" role="switch" checked />
                      <label for="lnb-power" class="form-check-label small">Power</label>
                    </div>
                  </div>
                </div>
                <!-- Status Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Status</div>
                    <div class="metric-row">
                      <span class="metric-label">Noise Temp:</span>
                      <span id="lnb-noise-temp-display" class="metric-value">45 K</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Lock:</span>
                      <span id="lnb-lock-status" class="status-badge status-badge-locked">Locked</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AGC Control Card -->
        <div class="col-lg-3">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">AGC</h3>
              <div id="agc-alarm-badge"></div>
            </div>
            <div class="card-body">
              <!-- Bypass Control -->
              <div class="form-check form-switch mb-3">
                <input type="checkbox" id="agc-bypass" class="form-check-input" role="switch" />
                <label for="agc-bypass" class="form-check-label small">Bypass</label>
              </div>

              <!-- Status -->
              <div class="metric-group">
                <div class="metric-group-title">Status</div>
                <div class="metric-row">
                  <span class="metric-label">Mode:</span>
                  <span id="agc-status" class="status-badge status-badge-locked">Active</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Gain:</span>
                  <span id="agc-gain-display" class="metric-value font-monospace">0.0 dB</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Input:</span>
                  <span id="agc-input-power-display" class="metric-value font-monospace">-100.0 dBm</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Output:</span>
                  <span id="agc-output-power-display" class="metric-value font-monospace">-100.0 dBm</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Filter Control Card -->
        <div class="col-lg-3">
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
              </div>

              <!-- Status Row -->
              <div class="metric-group">
                <div class="metric-group-title">Status</div>
                <div class="metric-row">
                  <span class="metric-label">Bandwidth:</span>
                  <span id="filter-bandwidth-display" class="metric-value">20 MHz</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Insertion Loss:</span>
                  <span id="filter-insertion-loss-display" class="metric-value">2.0 dB</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Noise Floor:</span>
                  <span id="filter-noise-floor-display" class="metric-value">-101 dBm</span>
                </div>
                <div class="metric-row" id="filter-signal-status-row">
                  <span class="metric-label">Signal:</span>
                  <span id="filter-signal-status" class="status-badge status-badge-none">--</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Notch Filter Control Card -->
        <div class="col-lg-9">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">Notch Filter</h3>
              <div class="form-check form-switch">
                <input type="checkbox" id="notch-power" class="form-check-input" role="switch" checked />
                <label for="notch-power" class="form-check-label small">Power</label>
              </div>
            </div>
            <div class="card-body">
              <div class="row g-2">
                ${this.generateNotchSlotHtml_(0)}
                ${this.generateNotchSlotHtml_(1)}
                ${this.generateNotchSlotHtml_(2)}
              </div>
              <div class="mt-3">
                <button id="notch-apply-btn" class="btn btn-primary btn-sm">Apply Changes</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Tap Point Selection Card -->
        <div class="col-lg-3">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">Tap Points</h3>
              <div class="form-check form-switch">
                <input type="checkbox" id="tap-engineering-mode" class="form-check-input" role="switch" />
                <label for="tap-engineering-mode" class="form-check-label small">Engineering</label>
              </div>
            </div>
            <div class="card-body" id="tap-points-body">
              <!-- Default Mode: Single Tap Point -->
              <div id="tap-default-mode">
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <label class="form-label text-muted small text-uppercase mb-0">Tap Point</label>
                  <div class="form-check form-switch">
                    <input type="checkbox" id="tap-default-enable" class="form-check-input" role="switch" checked />
                  </div>
                </div>
                <select id="tap-default-select" class="form-select mb-2">
                  <option value="TX IF">TX IF</option>
                  <option value="RX IF" selected>RX IF</option>
                </select>
                <div class="metric-group">
                  <div class="metric-row">
                    <span class="metric-label">Status:</span>
                    <span id="tap-default-status" class="text-success">Active</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-label">Coupling:</span>
                    <span id="tap-default-coupling" class="metric-value font-monospace">-20 dB</span>
                  </div>
                </div>
              </div>

              <!-- Engineering Mode: Dual Tap Points -->
              <div id="tap-engineering-mode-container" class="d-none">
                <!-- Tap A -->
                <div class="mb-3">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <label class="form-label text-muted small text-uppercase mb-0">Tap Point A</label>
                    <div class="form-check form-switch">
                      <input type="checkbox" id="tap-a-enable" class="form-check-input" role="switch" />
                    </div>
                  </div>
                  <select id="tap-a-select" class="form-select mb-2">
                    <option value="TX IF">TX IF</option>
                    <option value="RX IF">RX IF</option>
                    <option value="TX RF POST BUC">TX RF POST BUC</option>
                    <option value="TX RF POST HPA">TX RF POST HPA</option>
                    <option value="TX RF POST OMT">TX RF POST OMT</option>
                    <option value="RX RF PRE OMT">RX RF PRE OMT</option>
                    <option value="RX RF POST OMT">RX RF POST OMT</option>
                    <option value="RX RF POST LNA">RX RF POST LNA</option>
                  </select>
                  <div class="metric-group">
                    <div class="metric-row">
                      <span class="metric-label">Status:</span>
                      <span id="tap-a-status">--</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Coupling:</span>
                      <span id="tap-a-coupling" class="metric-value font-monospace">-30 dB</span>
                    </div>
                  </div>
                </div>

                <!-- Tap B -->
                <div>
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <label class="form-label text-muted small text-uppercase mb-0">Tap Point B</label>
                    <div class="form-check form-switch">
                      <input type="checkbox" id="tap-b-enable" class="form-check-input" role="switch" checked />
                    </div>
                  </div>
                  <select id="tap-b-select" class="form-select mb-2">
                    <option value="TX IF">TX IF</option>
                    <option value="RX IF" selected>RX IF</option>
                    <option value="TX RF POST BUC">TX RF POST BUC</option>
                    <option value="TX RF POST HPA">TX RF POST HPA</option>
                    <option value="TX RF POST OMT">TX RF POST OMT</option>
                    <option value="RX RF PRE OMT">RX RF PRE OMT</option>
                    <option value="RX RF POST OMT">RX RF POST OMT</option>
                    <option value="RX RF POST LNA">RX RF POST LNA</option>
                  </select>
                  <div class="metric-group">
                    <div class="metric-row">
                      <span class="metric-label">Status:</span>
                      <span id="tap-b-status" class="text-success">Active</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Coupling:</span>
                      <span id="tap-b-coupling" class="metric-value font-monospace">-20 dB</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Spectrum Analyzer Canvas Card -->
        <div class="col-8 d-flex">
          <div class="card flex-fill">
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
        <div class="col-4 d-flex">
          <div class="card flex-fill">
            <div class="card-header">
              <h3 class="card-title">Spectrum Analyzer Controls</h3>
            </div>
            <div class="card-body d-flex flex-column" id="spec-analyzer-controls">
              <!-- Primary Action: Auto-Tune -->
              <div class="sa-primary-actions mb-3">
                <button id="sa-auto-tune" class="btn btn-lg btn-danger w-100">
                  <strong>AUTO-TUNE</strong>
                </button>
              </div>

              <!-- Frequency Row -->
              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label text-muted small text-uppercase">Center Frequency</label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-center-freq" class="form-control" step="0.001">
                    <span class="input-group-text">MHz</span>
                  </div>
                </div>
                <div class="col-6">
                  <label class="form-label text-muted small text-uppercase">Span</label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-span" class="form-control" step="0.001">
                    <span class="input-group-text">MHz</span>
                  </div>
                </div>
              </div>

              <!-- Amplitude Row (always visible) -->
              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label text-muted small text-uppercase">Min Amp</label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-min-amp" class="form-control" step="1">
                    <span class="input-group-text">dBm</span>
                  </div>
                </div>
                <div class="col-6">
                  <label class="form-label text-muted small text-uppercase">Max Amp</label>
                  <div class="input-group input-group-sm">
                    <input type="number" id="sa-max-amp" class="form-control" step="1">
                    <span class="input-group-text">dBm</span>
                  </div>
                </div>
              </div>

              <!-- RBW Row (always visible) -->
              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label text-muted small text-uppercase">RBW</label>
                  <select id="sa-rbw" class="form-select form-select-sm">
                    <option value="auto">Auto</option>
                    <option value="0.0001">100 Hz</option>
                    <option value="0.001">1 kHz</option>
                    <option value="0.01">10 kHz</option>
                    <option value="0.1">100 kHz</option>
                    <option value="1">1 MHz</option>
                  </select>
                </div>
              </div>

              <!-- Engineering Controls (hidden by default, shown with ENGINEERING_MODE) -->
              <div id="sa-engineering-controls" class="sa-engineering-controls mb-2" style="display: none;">
                <div class="row g-2">
                  <div class="col-4">
                    <label class="form-label text-muted small text-uppercase">Ref Level</label>
                    <div class="input-group input-group-sm">
                      <input type="number" id="sa-ref-level" class="form-control" step="1">
                      <span class="input-group-text">dBm</span>
                    </div>
                  </div>
                  <div class="col-4">
                    <label class="form-label text-muted small text-uppercase">Scale</label>
                    <select id="sa-scale" class="form-select form-select-sm">
                      <option value="1">1 dB/div</option>
                      <option value="2">2 dB/div</option>
                      <option value="5">5 dB/div</option>
                      <option value="6" selected>6 dB/div</option>
                      <option value="10">10 dB/div</option>
                    </select>
                  </div>
                  <div class="col-4">
                    <label class="form-label text-muted small text-uppercase">Refresh</label>
                    <select id="sa-refresh" class="form-select form-select-sm">
                      <option value="1">1 Hz</option>
                      <option value="5">5 Hz</option>
                      <option value="10" selected>10 Hz</option>
                      <option value="15">15 Hz</option>
                      <option value="20">20 Hz</option>
                      <option value="30">30 Hz</option>
                    </select>
                  </div>
                  <div class="col-4">
                    <label class="form-label text-muted small text-uppercase">Markers</label>
                    <div class="form-check form-switch mb-0">
                      <input type="checkbox" id="sa-marker-enabled" class="form-check-input" role="switch">
                      <label for="sa-marker-enabled" class="form-check-label">Enable</label>
                    </div>
                  </div>
                  <div class="col-4">
                    <label class="form-label text-muted small text-uppercase">Index</label>
                    <input type="number" id="sa-marker-index" class="form-control form-control-sm" min="0">
                  </div>
                  <div class="col-4">
                    <label class="form-label text-muted small text-uppercase">Peak</label>
                    <div id="sa-marker-info" class="form-control-plaintext font-monospace small">--- MHz @ --- dBm</div>
                  </div>
                </div>
              </div>

              <!-- Display Mode & Actions -->
              <div class="sa-display-mode-actions">
                <div class="row g-2">
                  <div class="col-6 d-flex justify-content-center align-items-center">
                    <div class="btn-group btn-group-sm">
                      <button id="sa-mode-spectral" class="btn btn-outline-primary active">Spectral</button>
                      <button id="sa-mode-waterfall" class="btn btn-outline-primary">Waterfall</button>
                      <button id="sa-mode-both" class="btn btn-outline-primary">Both</button>
                    </div>
                  </div>
                  <div class="col-6 d-flex justify-content-center align-items-center">
                    <button id="sa-pause" class="btn btn-warning btn-sm">Pause</button>
                  </div>
                </div>
              </div>

              <!-- Trace Controls -->
              <div class="row g-2 mb-2 sa-trace-controls">
                <div class="col-12">
                  <label class="form-label text-muted small text-uppercase">Traces</label>
                  <div class="d-flex justify-content-between align-items-center">
                    <div class="btn-group btn-group-sm">
                      <button id="sa-trace-1" class="btn btn-outline-primary active" data-trace="1">T1</button>
                      <button id="sa-trace-2" class="btn btn-outline-primary" data-trace="2">T2</button>
                      <button id="sa-trace-3" class="btn btn-outline-primary" data-trace="3">T3</button>
                    </div>
                    <div class="form-check form-switch mb-0">
                      <input type="checkbox" id="sa-trace-visible" class="form-check-input" role="switch" checked>
                      <label for="sa-trace-visible" class="form-check-label">Visible</label>
                    </div>
                    <div class="form-check form-switch mb-0">
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
                          ${this.generateAntennaOptions_()}
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
                        <div class="video-overlay"></div>
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

                      <!-- Signal Quality Status -->
                      <div class="mb-3">
                        <div class="d-flex justify-content-between align-items-center">
                          <span class="text-muted">Signal Quality:</span>
                          <span id="signal-status" class="status-badge status-badge-none">None</span>
                        </div>
                      </div>

                      <!-- C/N Metrics -->
                      <div class="mb-2">
                        <div class="d-flex justify-content-between">
                          <span class="text-muted small">Raw C/N:</span>
                          <span id="cn-raw-display" class="fw-bold font-monospace">-- dB</span>
                        </div>
                      </div>
                      <div class="mb-2">
                        <div class="d-flex justify-content-between">
                          <span class="text-muted small">Effective C/N:</span>
                          <span id="cn-effective-display" class="fw-bold font-monospace">-- dB</span>
                        </div>
                      </div>
                      <div class="mb-2">
                        <div class="d-flex justify-content-between">
                          <span class="text-muted small">Power Level:</span>
                          <span id="power-level-display" class="fw-bold font-monospace">-- dBm</span>
                        </div>
                      </div>
                      <div class="mb-2">
                        <div class="d-flex justify-content-between">
                          <span class="text-muted small">Noise Floor:</span>
                          <span id="noise-floor-display" class="fw-bold font-monospace">-- dBm</span>
                        </div>
                      </div>

                      <!-- ADC Status Section -->
                      <hr class="my-2">
                      <div class="mb-2">
                        <div class="d-flex justify-content-between align-items-center">
                          <span class="text-muted small">ADC Level:</span>
                          <span id="adc-level-display" class="fw-bold font-monospace">-- dBFS</span>
                        </div>
                      </div>
                      <div class="mb-2">
                        <div class="d-flex justify-content-between align-items-center">
                          <span class="text-muted small">ADC Status:</span>
                          <span id="adc-status-display" class="status-badge status-badge-none">--</span>
                        </div>
                      </div>

                      <!-- Degradation Breakdown (shown when applicable) -->
                      <div id="degradation-section" class="d-none">
                        <hr class="my-2">
                        <div class="small text-muted mb-1">Degradation Factors:</div>
                        <div class="mb-1">
                          <div class="d-flex justify-content-between">
                            <span class="text-muted small">Clip Penalty:</span>
                            <span id="clip-penalty-display" class="font-monospace text-danger">0.0 dB</span>
                          </div>
                        </div>
                        <div class="mb-1">
                          <div class="d-flex justify-content-between">
                            <span class="text-muted small">Quant Penalty:</span>
                            <span id="quant-penalty-display" class="font-monospace text-info">0.0 dB</span>
                          </div>
                        </div>
                        <div class="mb-1">
                          <div class="d-flex justify-content-between">
                            <span class="text-muted small fw-bold">Total Penalty:</span>
                            <span id="total-penalty-display" class="font-monospace fw-bold">0.0 dB</span>
                          </div>
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

        <!-- RX Payload Data Integrity Card -->
        <div class="col-lg-12">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">Payload Data Integrity</h3>
              <div id="rx-payload-alarm-badge"></div>
            </div>
            <div class="card-body">
              <div class="row g-2">
                <!-- Frame Synchronization Column -->
                <div class="col-lg-3">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Frame Synchronization</div>
                    <div class="metric-row">
                      <span class="metric-label">Sync Status:</span>
                      <span id="rx-payload-frame-sync" class="status-badge status-badge-green">Locked</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Sync Pattern:</span>
                      <span id="rx-payload-sync-pattern" class="metric-value font-monospace">1ACFFC1D</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">BER:</span>
                      <span id="rx-payload-ber" class="metric-value font-monospace">1.2e-7</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">CRC Type:</span>
                      <span id="rx-payload-crc-type" class="metric-value">CRC-32</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">CRC Status:</span>
                      <span id="rx-payload-crc-status" class="status-badge status-badge-green">Valid</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">CRC Errors:</span>
                      <span id="rx-payload-crc-errors" class="metric-value">0</span>
                    </div>
                  </div>
                </div>

                <!-- Reed-Solomon Decoder Column -->
                <div class="col-lg-3">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Reed-Solomon Decoder</div>
                    <div class="metric-row">
                      <span class="metric-label">Status:</span>
                      <span id="rx-payload-rs-status" class="status-badge status-badge-green">Active</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Code Rate:</span>
                      <span id="rx-payload-rs-code-rate" class="metric-value">223/255</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Corrected (Frame):</span>
                      <span id="rx-payload-rs-corrected" class="metric-value">0</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Corrected (Total):</span>
                      <span id="rx-payload-rs-total" class="metric-value">12</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Uncorrectable:</span>
                      <span id="rx-payload-rs-uncorrectable" class="metric-value">0</span>
                    </div>
                  </div>
                </div>

                <!-- Viterbi Decoder Column -->
                <div class="col-lg-3">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Viterbi Decoder</div>
                    <div class="metric-row">
                      <span class="metric-label">Status:</span>
                      <span id="rx-payload-viterbi-status" class="status-badge status-badge-green">Enabled</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Code Rate:</span>
                      <span id="rx-payload-viterbi-code-rate" class="metric-value">1/2</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Path Metric:</span>
                      <span id="rx-payload-viterbi-path-metric" class="metric-value font-monospace">0.92</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Traceback Depth:</span>
                      <span id="rx-payload-viterbi-traceback" class="metric-value">35</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Constraint:</span>
                      <span id="rx-payload-viterbi-k" class="metric-value">K=7</span>
                    </div>
                  </div>
                </div>

                <!-- RX Decryption Column -->
                <div class="col-lg-3">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">RX Decryption</div>
                    <div class="metric-row">
                      <span class="metric-label">Mode:</span>
                      <span id="rx-payload-dec-mode" class="status-badge status-badge-green">ACTIVE</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Algorithm:</span>
                      <span id="rx-payload-dec-algorithm" class="metric-value">AES-256-GCM</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Key ID:</span>
                      <span id="rx-payload-dec-key-id" class="metric-value font-monospace">FOXTROT-2024-0293</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Key Status:</span>
                      <span id="rx-payload-dec-key-status" class="status-badge status-badge-green">Valid</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Expires:</span>
                      <span id="rx-payload-dec-expires" class="metric-value">62 days</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Auth Tag:</span>
                      <span id="rx-payload-dec-auth-tag" class="status-badge status-badge-green">Verified</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Decryption:</span>
                      <span id="rx-payload-dec-success" class="status-badge status-badge-green">Success</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Channel Summary Row -->
              <div class="row g-2 mt-2">
                <div class="col-lg-12">
                  <div class="d-flex justify-content-between align-items-center p-2 bg-dark rounded">
                    <div class="d-flex align-items-center gap-3">
                      <span class="text-muted small">Data Rate:</span>
                      <span id="rx-payload-data-rate" class="fw-bold">2.048 Mbps</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                      <span class="text-muted small">Channel Status:</span>
                      <span id="rx-payload-channel-status" class="status-badge status-badge-green">Good</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  }

  private generateFilterOptions(): string {
    return FILTER_BANDWIDTH_CONFIGS.map((config, index) => {
      const selected = index === 8 ? 'selected' : ''; // Default to 20 MHz (index 8)
      return `<option value="${index}" ${selected}>${config.label}</option>`;
    }).join('');
  }

  private generateAntennaOptions_(): string {
    return this.groundStation.antennas.map((_, index) => {
      const antennaNumber = index + 1;
      return `<option value="${antennaNumber}">Antenna ${antennaNumber}</option>`;
    }).join('');
  }

  private generateNotchSlotHtml_(index: number): string {
    const prefix = `notch-${index}`;
    return html`
      <div class="col-lg-4">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center py-2">
            <span class="small fw-bold">Notch ${index + 1}</span>
            <div class="form-check form-switch">
              <input type="checkbox" id="${prefix}-enabled" class="form-check-input" role="switch" />
              <label for="${prefix}-enabled" class="form-check-label small">Enable</label>
            </div>
          </div>
          <div class="card-body py-2">
            <!-- Center Frequency -->
            <div class="mb-2">
              <label class="form-label text-muted small text-uppercase mb-1">Center Freq (MHz)</label>
              <div class="input-group input-group-sm">
                <button id="${prefix}-freq-dec-coarse" class="btn btn-outline-secondary" type="button">-100</button>
                <button id="${prefix}-freq-dec-fine" class="btn btn-outline-secondary" type="button">-10</button>
                <input type="number" id="${prefix}-freq" class="form-control text-center"
                       min="950" max="2150" step="1" value="1500" />
                <button id="${prefix}-freq-inc-fine" class="btn btn-outline-secondary" type="button">+10</button>
                <button id="${prefix}-freq-inc-coarse" class="btn btn-outline-secondary" type="button">+100</button>
              </div>
            </div>

            <!-- Bandwidth -->
            <div class="row g-1 mb-2">
              <div class="col-6">
                <label class="form-label text-muted small text-uppercase mb-1">Width (MHz)</label>
                <div class="input-group input-group-sm">
                  <button id="${prefix}-bw-dec" class="btn btn-outline-secondary" type="button">-</button>
                  <input type="number" id="${prefix}-bw" class="form-control text-center"
                         min="0.1" max="50" step="0.1" value="1" />
                  <button id="${prefix}-bw-inc" class="btn btn-outline-secondary" type="button">+</button>
                </div>
              </div>

              <!-- Depth -->
              <div class="col-6">
                <label class="form-label text-muted small text-uppercase mb-1">Depth (dB)</label>
                <div class="input-group input-group-sm">
                  <button id="${prefix}-depth-dec" class="btn btn-outline-secondary" type="button">-</button>
                  <input type="number" id="${prefix}-depth" class="form-control text-center"
                         min="1" max="60" step="1" value="20" />
                  <button id="${prefix}-depth-inc" class="btn btn-outline-secondary" type="button">+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
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
    this.agcAdapter = new AGCAdapter(rfFrontEnd.agcModule, this.dom_!);
    this.filterAdapter = new FilterAdapter(rfFrontEnd.filterModule, this.dom_!, receiver ?? null);
    this.notchFilterAdapter = new NotchFilterAdapter(rfFrontEnd.notchFilterModule, this.dom_!);
    this.spectrumAnalyzerAdapter = new SpectrumAnalyzerAdapter(spectrumAnalyzer, this.dom_!);

    // Create advanced spectrum analyzer adapter
    if (spectrumAnalyzer && this.dom_) {
      this.spectrumAnalyzerAdvancedAdapter = new SpectrumAnalyzerAdvancedAdapter(
        spectrumAnalyzer,
        this.dom_
      );
    }

    // Create tap point adapter
    if (rfFrontEnd.couplerModule && spectrumAnalyzer && this.dom_) {
      this.tapPointAdapter_ = new TapPointAdapter(
        rfFrontEnd.couplerModule,
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

    // Create RX payload adapter for data integrity display
    if (this.dom_) {
      this.rxPayloadAdapter_ = new RxPayloadAdapter(
        this.dom_,
        receiver,
        this.groundStation.uuid
      );
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
    this.agcAdapter?.dispose();
    this.filterAdapter?.dispose();
    this.notchFilterAdapter?.dispose();
    this.spectrumAnalyzerAdapter?.dispose();
    this.spectrumAnalyzerAdvancedAdapter?.dispose();
    this.receiverAdapter?.dispose();
    this.iqConstellationAdapter?.dispose();
    this.rxPayloadAdapter_?.dispose();
    this.tapPointAdapter_?.dispose();

    this.lnbAdapter = null;
    this.agcAdapter = null;
    this.filterAdapter = null;
    this.notchFilterAdapter = null;
    this.spectrumAnalyzerAdapter = null;
    this.spectrumAnalyzerAdvancedAdapter = null;
    this.receiverAdapter = null;
    this.iqConstellationAdapter = null;
    this.rxPayloadAdapter_ = null;
    this.tapPointAdapter_ = null;

    this.dom_?.remove();
  }
}
