import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { BUCAdapter } from './buc-adapter';
import { HPAAdapter } from './hpa-adapter';
import { TransmitterAdapter } from './transmitter-adapter';
import './tx-chain-tab.css';

/**
 * TxChainTab - Transmitter chain control and monitoring
 *
 * Phase 6 Implementation:
 * - BUC (Block Up Converter) control: LO frequency, gain, power, mute
 * - HPA (High Power Amplifier) control: power, back-off, enable
 * - Modulator status (placeholder for future)
 * - Redundancy Controller (placeholder for future)
 *
 * Equipment Flow:
 * Modulator → BUC → HPA → OMT → Antenna
 */
export class TxChainTab extends BaseElement {
  private readonly groundStation: GroundStation;
  private bucAdapter: BUCAdapter | null = null;
  private hpaAdapter: HPAAdapter | null = null;
  private transmitterAdapter: TransmitterAdapter | null = null;

  constructor(groundStation: GroundStation, containerId: string) {
    super();
    this.groundStation = groundStation;

    // Ensure equipment is initialized
    if (this.groundStation.antennas.length === 0) {
      this.groundStation.initializeEquipment();
    }

    this.init_(containerId, 'replace');
    this.dom_ = qs('.tx-chain-tab');

    this.addEventListenersLate_();
  }

  protected html_ = html`
    <div class="tx-chain-tab">
      <div class="row g-2 pb-6">
        <!-- BUC Control Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">BUC (Block Up Converter)</h3>
              <div id="buc-alarm-badge"></div>
            </div>
            <div class="card-body">
              <!-- LO Frequency Control -->
              <div class="equip-adjust-control">
                <label class="equip-adjust-label">LO Frequency</label>
                <div class="equip-adjust-row">
                  <div class="equip-adjust-buttons equip-adjust-decrease">
                    <button id="buc-lo-dec-coarse" class="btn-equip" title="-100 MHz">-100</button>
                    <button id="buc-lo-dec-fine" class="btn-equip" title="-10 MHz">-10</button>
                  </div>
                  <div class="equip-adjust-display">
                    <input type="number" id="buc-lo-frequency" class="equip-adjust-input"
                           min="6000" max="7000" step="10" value="6425" />
                  </div>
                  <div class="equip-adjust-buttons equip-adjust-increase">
                    <button id="buc-lo-inc-fine" class="btn-equip" title="+10 MHz">+10</button>
                    <button id="buc-lo-inc-coarse" class="btn-equip" title="+100 MHz">+100</button>
                  </div>
                  <span class="equip-adjust-unit">MHz</span>
                </div>
              </div>

              <!-- Gain Control -->
              <div class="equip-adjust-control">
                <label class="equip-adjust-label">Gain</label>
                <div class="equip-adjust-row">
                  <div class="equip-adjust-buttons equip-adjust-decrease">
                    <button id="buc-gain-dec-coarse" class="btn-equip" title="-1 dB">-1</button>
                    <button id="buc-gain-dec-fine" class="btn-equip" title="-0.5 dB">-.5</button>
                  </div>
                  <div class="equip-adjust-display">
                    <input type="number" id="buc-gain" class="equip-adjust-input"
                           min="0" max="70" step="0.5" value="58" />
                  </div>
                  <div class="equip-adjust-buttons equip-adjust-increase">
                    <button id="buc-gain-inc-fine" class="btn-equip" title="+0.5 dB">+.5</button>
                    <button id="buc-gain-inc-coarse" class="btn-equip" title="+1 dB">+1</button>
                  </div>
                  <span class="equip-adjust-unit">dB</span>
                </div>
              </div>

              <!-- Apply Button -->
              <div class="mb-3">
                <button id="buc-apply-btn" class="btn btn-primary btn-sm">Apply Changes</button>
              </div>

              <!-- Controls and Status Row -->
              <div class="row g-2 mb-2">
                <!-- Controls Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Controls</div>
                    <div class="form-check form-switch mb-2">
                      <input type="checkbox" id="buc-power" class="form-check-input" role="switch" checked />
                      <label for="buc-power" class="form-check-label small">Power</label>
                    </div>
                    <div class="form-check form-switch">
                      <input type="checkbox" id="buc-mute" class="form-check-input" role="switch" />
                      <label for="buc-mute" class="form-check-label small">Mute</label>
                    </div>
                  </div>
                </div>
                <!-- RF Status Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">RF Status</div>
                    <div class="metric-row">
                      <span class="metric-label">Output:</span>
                      <span id="buc-output-power-display" class="metric-value">-10.0 dBm</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">P1dB Margin:</span>
                      <span id="buc-p1db-margin-display" class="metric-value">25.0 dB</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Lock:</span>
                      <span id="buc-lock-status" class="status-badge status-badge-locked">Locked</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Thermal and Signal Quality Row -->
              <div class="row g-2">
                <!-- Thermal Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Thermal</div>
                    <div class="metric-row">
                      <span class="metric-label">Temp:</span>
                      <span id="buc-temperature-display" class="metric-value">25.0 °C</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Current:</span>
                      <span id="buc-current-display" class="metric-value">0.00 A</span>
                    </div>
                  </div>
                </div>
                <!-- Signal Quality Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Signal Quality</div>
                    <div class="metric-row">
                      <span class="metric-label">Phase Noise:</span>
                      <span id="buc-phase-noise-display" class="metric-value">-100 dBc/Hz</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Freq Error:</span>
                      <span id="buc-freq-error-display" class="metric-value">0 Hz</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- HPA Control Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">HPA (High Power Amplifier)</h3>
              <div id="hpa-alarm-badge"></div>
            </div>
            <div class="card-body">
              <!-- Back-off Control -->
              <div class="equip-adjust-control">
                <label class="equip-adjust-label">Back-off from P1dB</label>
                <div class="equip-adjust-row">
                  <div class="equip-adjust-buttons equip-adjust-decrease">
                    <button id="hpa-backoff-dec-coarse" class="btn-equip" title="-5 dB">-5</button>
                    <button id="hpa-backoff-dec-fine" class="btn-equip" title="-1 dB">-1</button>
                  </div>
                  <div class="equip-adjust-display">
                    <input type="number" id="hpa-backoff" class="equip-adjust-input"
                           min="0" max="30" step="0.5" value="6" />
                  </div>
                  <div class="equip-adjust-buttons equip-adjust-increase">
                    <button id="hpa-backoff-inc-fine" class="btn-equip" title="+1 dB">+1</button>
                    <button id="hpa-backoff-inc-coarse" class="btn-equip" title="+5 dB">+5</button>
                  </div>
                  <span class="equip-adjust-unit">dB</span>
                </div>
              </div>

              <!-- Apply Button -->
              <div class="mb-3">
                <button id="hpa-apply-btn" class="btn btn-primary btn-sm">Apply Changes</button>
              </div>

              <!-- Controls and Power Output Row -->
              <div class="row g-2 mb-2">
                <!-- Controls Column -->
                <div class="col-5">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Controls</div>
                    <div class="form-check form-switch mb-2">
                      <input type="checkbox" id="hpa-power" class="form-check-input" role="switch" checked />
                      <label for="hpa-power" class="form-check-label small">Power</label>
                    </div>
                    <div class="form-check form-switch">
                      <input type="checkbox" id="hpa-enable" class="form-check-input" role="switch" />
                      <label for="hpa-enable" class="form-check-label small">HPA Enable</label>
                    </div>
                  </div>
                </div>
                <!-- Power Output Column -->
                <div class="col-7">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Power Output</div>
                    <div class="metric-row">
                      <span class="metric-label">Output:</span>
                      <span id="hpa-output-power-display" class="metric-value">50.0 dBm</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Power:</span>
                      <div class="power-meter-container">
                        <div id="hpa-power-meter" class="power-meter">
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                        </div>
                        <span id="hpa-power-watts" class="power-meter-label">0W</span>
                      </div>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">P1dB:</span>
                      <span id="hpa-p1db-display" class="metric-value">50.0 dBm</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Amplifier Status and Signal Quality Row -->
              <div class="row g-2">
                <!-- Amplifier Status Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Amplifier Status</div>
                    <div class="metric-row">
                      <span class="metric-label">Gain:</span>
                      <span id="hpa-gain-display" class="metric-value">44.0 dB</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Temp:</span>
                      <span id="hpa-temperature-display" class="metric-value">45.0 °C</span>
                    </div>
                  </div>
                </div>
                <!-- Signal Quality Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Signal Quality</div>
                    <div class="metric-row">
                      <span class="metric-label">IMD Level:</span>
                      <span id="hpa-imd-display" class="metric-value">-30.0 dBc</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Overdrive:</span>
                      <span id="hpa-overdrive-status" class="status-badge status-badge-good">Normal</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Transmitter Modem Control Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">Transmitter Modems</h3>
              <div id="tx-alarm-badge"></div>
            </div>
            <div class="card-body">
              <!-- Modem Selection Buttons -->
              <div class="btn-group mb-3" role="group">
                <button class="btn btn-outline-primary modem-btn" data-modem="1">TX 1</button>
                <button class="btn btn-outline-primary modem-btn" data-modem="2">TX 2</button>
                <button class="btn btn-outline-primary modem-btn" data-modem="3">TX 3</button>
                <button class="btn btn-outline-primary modem-btn" data-modem="4">TX 4</button>
              </div>

              <div class="row g-2">
                <!-- Configuration Panel -->
                <div class="col-lg-6">
                  <div class="card h-100">
                    <div class="card-header">
                      <h4 class="card-title">Configuration</h4>
                    </div>
                    <div class="card-body">
                      <!-- Antenna selector -->
                      <div class="mb-2">
                        <label class="form-label small">Antenna</label>
                        <select id="tx-antenna-select" class="form-select form-select-sm">
                          <option value="1">Antenna 1</option>
                          <option value="2">Antenna 2</option>
                        </select>
                      </div>

                      <!-- Frequency input -->
                      <div class="mb-2">
                        <label class="form-label small">Frequency (MHz)</label>
                        <input id="tx-frequency-input" type="number" class="form-control form-control-sm" step="0.1" />
                        <small class="text-muted">Current: <span id="tx-frequency-current">--</span></small>
                      </div>

                      <!-- Bandwidth input -->
                      <div class="mb-2">
                        <label class="form-label small">Bandwidth (MHz)</label>
                        <input id="tx-bandwidth-input" type="number" class="form-control form-control-sm" step="0.1" />
                        <small class="text-muted">Current: <span id="tx-bandwidth-current">--</span></small>
                      </div>

                      <!-- Power input -->
                      <div class="mb-2">
                        <label class="form-label small">Power (dBm)</label>
                        <input id="tx-power-input" type="number" class="form-control form-control-sm" step="0.5" />
                        <small class="text-muted">Current: <span id="tx-power-current">--</span></small>
                      </div>

                      <button id="tx-apply-btn" class="btn btn-primary btn-sm w-100">Apply Changes</button>
                    </div>
                  </div>
                </div>

                <!-- Status & Control Panel -->
                <div class="col-lg-6">
                  <div class="card h-100">
                    <div class="card-header">
                      <h4 class="card-title">Status & Control</h4>
                    </div>
                    <div class="card-body">
                      <!-- Power Budget Bar -->
                      <div class="mb-2">
                        <label class="form-label small d-flex justify-content-between">
                          <span>Power Budget</span>
                          <span id="tx-power-percentage" class="fw-bold">0%</span>
                        </label>
                        <div class="progress" style="height: 6px;">
                          <div id="tx-power-bar" class="progress-bar" style="width: 0%"></div>
                        </div>
                      </div>

                      <!-- Switches -->
                      <div class="mb-2">
                        <div class="form-check form-switch mb-1">
                          <input id="tx-transmit-switch" type="checkbox" class="form-check-input" role="switch" />
                          <label class="form-check-label small">Transmit</label>
                        </div>
                        <div class="form-check form-switch mb-1">
                          <input id="tx-loopback-switch" type="checkbox" class="form-check-input" role="switch" />
                          <label class="form-check-label small">Loopback</label>
                        </div>
                        <div class="form-check form-switch mb-1">
                          <input id="tx-power-switch" type="checkbox" class="form-check-input" role="switch" />
                          <label class="form-check-label small">Power</label>
                        </div>
                      </div>

                      <!-- Status LEDs -->
                      <div class="mb-2">
                        <div class="d-flex justify-content-around">
                          <div class="text-center">
                            <div id="tx-transmit-led" class="led led-gray mb-1"></div>
                            <small class="text-muted" style="font-size: 0.65rem;">TX</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-fault-led" class="led led-gray mb-1"></div>
                            <small class="text-muted" style="font-size: 0.65rem;">Fault</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-loopback-led" class="led led-gray mb-1"></div>
                            <small class="text-muted" style="font-size: 0.65rem;">Loop</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-online-led" class="led led-gray mb-1"></div>
                            <small class="text-muted" style="font-size: 0.65rem;">Online</small>
                          </div>
                        </div>
                      </div>

                      <!-- Fault Reset Button -->
                      <button id="tx-fault-reset-btn" class="btn btn-warning btn-sm w-100">Reset Fault</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Status Bar -->
              <div id="tx-status-bar" class="small text-muted mt-2 py-1 border-top" style="font-size: 0.75rem;">
                Ready
              </div>
            </div>
          </div>
        </div>

        <!-- Redundancy Controller Placeholder Card -->
        <div class="col-lg-4">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">Redundancy Controller</h3>
            </div>
            <div class="card-body text-center d-flex flex-column justify-content-center">
              <p class="text-muted mb-2">Redundancy controller coming in future phase</p>
              <p class="text-muted small mb-0">Status: Not Implemented</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  protected addEventListeners_(): void {
    // Add event listeners late
  }

  protected addEventListenersLate_(): void {
    const rfFrontEnd = this.groundStation.rfFrontEnds[0];

    if (!rfFrontEnd) {
      console.error('RF Front End not found in ground station');
      return;
    }

    // Create adapters
    this.bucAdapter = new BUCAdapter(rfFrontEnd.bucModule, this.dom_!);
    this.hpaAdapter = new HPAAdapter(rfFrontEnd.hpaModule, this.dom_!);

    // Setup transmitter adapter
    const transmitter = this.groundStation.transmitters[0];
    if (transmitter && this.dom_) {
      this.transmitterAdapter = new TransmitterAdapter(transmitter, this.dom_);
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
    this.bucAdapter?.dispose();
    this.hpaAdapter?.dispose();
    this.transmitterAdapter?.dispose();

    this.bucAdapter = null;
    this.hpaAdapter = null;
    this.transmitterAdapter = null;

    this.dom_?.remove();
  }
}
