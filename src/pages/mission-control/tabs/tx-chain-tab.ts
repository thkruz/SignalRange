import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { BUCAdapter } from './buc-adapter';
import { HPAAdapter } from './hpa-adapter';
import { TransmitterAdapter } from './transmitter-adapter';
import './tx-chain-tab.css';
import { TxPayloadAdapter } from './tx-payload-adapter';

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
  protected html_!: string;
  private readonly groundStation: GroundStation;
  private bucAdapter: BUCAdapter | null = null;
  private hpaAdapter: HPAAdapter | null = null;
  private transmitterAdapter: TransmitterAdapter | null = null;
  private payloadAdapter_: TxPayloadAdapter | null = null;

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
    this.dom_ = qs('.tx-chain-tab');

    this.addEventListenersLate_();
  }

  private buildHtml_(): string {
    return html`
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
                           min="6000" max="7500" step="1" value="6425" />
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
                    <div class="form-check form-switch">
                      <input type="checkbox" id="buc-loopback" class="form-check-input" role="switch" />
                      <label for="buc-loopback" class="form-check-label small">Loopback</label>
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
                      <span class="metric-label">RF Freq:</span>
                      <span id="buc-rf-frequency-display" class="metric-value">-- MHz</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">P1dB Margin:</span>
                      <span id="buc-p1db-margin-display" class="metric-value">25.0 dB</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Lock:</span>
                      <span id="buc-lock-status" class="status-badge status-badge-locked">Locked</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Sideband:</span>
                      <span id="buc-sideband-status" class="status-badge">--</span>
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
                    <div class="metric-group-title">Power</div>
                    <div class="metric-row">
                      <span class="metric-label">Input:</span>
                      <span id="hpa-input-power-display" class="metric-value">-- dBm</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Output:</span>
                      <span id="hpa-output-power-display" class="metric-value">50.0 dBm</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Power:</span>
                      <div class="power-meter-container">
                        <div id="hpa-power-meter" class="power-meter power-meter-10">
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                          <div class="power-segment led-off"></div>
                        </div>
                        <span id="hpa-power-watts" class="power-meter-label">0 W</span>
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
                          ${this.generateAntennaOptions_()}
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

                      <!-- Modulation selector -->
                      <div class="mb-2">
                        <label class="form-label small">Modulation</label>
                        <select id="tx-modulation-select" class="form-select form-select-sm">
                          <option value="BPSK">BPSK</option>
                          <option value="QPSK">QPSK</option>
                          <option value="8QAM">8QAM</option>
                          <option value="16QAM">16QAM</option>
                        </select>
                        <small class="text-muted">Current: <span id="tx-modulation-current">--</span></small>
                      </div>

                      <!-- FEC selector -->
                      <div class="mb-2">
                        <label class="form-label small">FEC</label>
                        <select id="tx-fec-select" class="form-select form-select-sm">
                          <option value="1/2">1/2</option>
                          <option value="2/3">2/3</option>
                          <option value="3/4">3/4</option>
                          <option value="5/6">5/6</option>
                          <option value="7/8">7/8</option>
                        </select>
                        <small class="text-muted">Current: <span id="tx-fec-current">--</span></small>
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
                            <div id="tx-transmit-led" class="card-alarm-led off mb-1"></div>
                            <small class="text-muted" style="font-size: 0.65rem;">TX</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-fault-led" class="card-alarm-led off mb-1"></div>
                            <small class="text-muted" style="font-size: 0.65rem;">Fault</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-loopback-led" class="card-alarm-led off mb-1"></div>
                            <small class="text-muted" style="font-size: 0.65rem;">Loop</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-online-led" class="card-alarm-led off mb-1"></div>
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

        <!-- TX Payload Data Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">TX Payload Data</h3>
              <div id="tx-payload-alarm-badge"></div>
            </div>
            <div class="card-body">
              <!-- Source Status and TX Encryption Row -->
              <div class="row g-2 mb-2">
                <!-- Source Status Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Source Status</div>
                    <div class="metric-row">
                      <span class="metric-label">Data Rate:</span>
                      <span id="tx-payload-data-rate" class="metric-value">2.048 Mbps</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Payload Type:</span>
                      <span id="tx-payload-type" class="metric-value">Command</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Channel:</span>
                      <span id="tx-payload-channel" class="metric-value">Primary</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Source Feed:</span>
                      <span id="tx-payload-source-feed" class="status-badge status-badge-green">Active</span>
                    </div>
                  </div>
                </div>
                <!-- TX Encryption Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">TX Encryption</div>
                    <div class="metric-row">
                      <span class="metric-label">Mode:</span>
                      <span id="tx-payload-enc-mode" class="status-badge status-badge-green">ACTIVE</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Algorithm:</span>
                      <span id="tx-payload-enc-algorithm" class="metric-value">AES-256-GCM</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Key ID:</span>
                      <span id="tx-payload-enc-key-id" class="metric-value font-monospace">TANGO-2024-0847</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Key Status:</span>
                      <span id="tx-payload-enc-key-status" class="status-badge status-badge-green">Valid</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Expires:</span>
                      <span id="tx-payload-enc-expires" class="metric-value">47 days</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Auth Tag:</span>
                      <span id="tx-payload-enc-auth-tag" class="status-badge status-badge-green">Verified</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Throughput and Buffer Status Row -->
              <div class="row g-2">
                <!-- Throughput Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title">Throughput</div>
                    <div class="metric-row">
                      <span class="metric-label">Frames/sec:</span>
                      <span id="tx-payload-frames-sec" class="metric-value font-monospace">1,024</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Efficiency:</span>
                      <span id="tx-payload-efficiency" class="metric-value">94.2%</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Errors:</span>
                      <span id="tx-payload-errors" class="metric-value">0</span>
                    </div>
                  </div>
                </div>
                <!-- Buffer Status Column -->
                <div class="col-6">
                  <div class="metric-group h-100">
                    <div class="metric-group-title d-flex justify-content-between align-items-center">
                      <span>Buffer Status</span>
                      <span id="tx-payload-buffer-status" class="status-badge status-badge-good">Healthy</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Utilization:</span>
                      <div class="d-flex align-items-center gap-2">
                        <div class="progress flex-grow-1" style="height: 6px;">
                          <div id="tx-payload-buffer-bar" class="progress-bar" style="width: 45%"></div>
                        </div>
                        <span id="tx-payload-buffer-pct" class="metric-value" style="min-width: 32px;">45%</span>
                      </div>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Overflows:</span>
                      <span id="tx-payload-overflows" class="metric-value">0</span>
                    </div>
                    <div class="metric-row">
                      <span class="metric-label">Underruns:</span>
                      <span id="tx-payload-underruns" class="metric-value">0</span>
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

  private generateAntennaOptions_(): string {
    return this.groundStation.antennas.map((_, index) => {
      const antennaNumber = index + 1;
      return `<option value="${antennaNumber}">Antenna ${antennaNumber}</option>`;
    }).join('');
  }

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

    // Setup payload adapter (static display for training)
    if (this.dom_) {
      this.payloadAdapter_ = new TxPayloadAdapter(this.dom_, this.groundStation.uuid);
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
    this.payloadAdapter_?.dispose();

    this.bucAdapter = null;
    this.hpaAdapter = null;
    this.transmitterAdapter = null;
    this.payloadAdapter_ = null;

    this.dom_?.remove();
  }
}
