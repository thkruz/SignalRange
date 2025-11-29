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
      <div class="row g-3 pb-6">
        <!-- BUC Control Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title">BUC (Block Up Converter)</h3>
              <div id="buc-alarm-badge"></div>
            </div>
            <div class="card-body">
              <!-- LO Frequency Control -->
              <div class="mb-3">
                <label for="buc-lo-frequency" class="form-label d-flex justify-content-between">
                  <span class="text-muted small text-uppercase">LO Frequency</span>
                  <span id="buc-lo-frequency-display" class="fw-bold font-monospace">6425 MHz</span>
                </label>
                <input
                  type="range"
                  id="buc-lo-frequency"
                  class="form-range"
                  min="6000"
                  max="7000"
                  step="10"
                  value="6425"
                />
              </div>

              <!-- Gain Control -->
              <div class="mb-3">
                <label for="buc-gain" class="form-label d-flex justify-content-between">
                  <span class="text-muted small text-uppercase">Gain</span>
                  <span id="buc-gain-display" class="fw-bold font-monospace">58.0 dB</span>
                </label>
                <input
                  type="range"
                  id="buc-gain"
                  class="form-range"
                  min="0"
                  max="70"
                  step="0.5"
                  value="58"
                />
              </div>

              <!-- Power Switch -->
              <div class="form-check form-switch mb-2">
                <input type="checkbox" id="buc-power" class="form-check-input" role="switch" checked />
                <label for="buc-power" class="form-check-label">Power</label>
              </div>

              <!-- Mute Switch -->
              <div class="form-check form-switch mb-3">
                <input type="checkbox" id="buc-mute" class="form-check-input" role="switch" />
                <label for="buc-mute" class="form-check-label">Mute</label>
              </div>

              <!-- Status Indicators -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Output Power:</span>
                <span id="buc-output-power-display" class="fw-bold font-monospace">-10.0 dBm</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Temperature:</span>
                <span id="buc-temperature-display" class="fw-bold font-monospace">25.0 °C</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Lock Status:</span>
                <div id="buc-lock-led" class="led led-green"></div>
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
              <!-- Power Switch -->
              <div class="form-check form-switch mb-2">
                <input type="checkbox" id="hpa-power" class="form-check-input" role="switch" checked />
                <label for="hpa-power" class="form-check-label">Power</label>
              </div>

              <!-- HPA Enable Switch -->
              <div class="form-check form-switch mb-3">
                <input type="checkbox" id="hpa-enable" class="form-check-input" role="switch" />
                <label for="hpa-enable" class="form-check-label">HPA Enable</label>
              </div>

              <!-- Back-off Control -->
              <div class="mb-3">
                <label for="hpa-backoff" class="form-label d-flex justify-content-between">
                  <span class="text-muted small text-uppercase">Back-off from P1dB</span>
                  <span id="hpa-backoff-display" class="fw-bold font-monospace">6.0 dB</span>
                </label>
                <input
                  type="range"
                  id="hpa-backoff"
                  class="form-range"
                  min="0"
                  max="30"
                  step="0.5"
                  value="6"
                />
              </div>

              <!-- Status Indicators -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Output Power:</span>
                <span id="hpa-output-power-display" class="fw-bold font-monospace">50.0 dBm</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Gain:</span>
                <span id="hpa-gain-display" class="fw-bold font-monospace">44.0 dB</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Temperature:</span>
                <span id="hpa-temperature-display" class="fw-bold font-monospace">45.0 °C</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">IMD Level:</span>
                <span id="hpa-imd-display" class="fw-bold font-monospace">-30.0 dBc</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Overdrive:</span>
                <div id="hpa-overdrive-led" class="led led-green"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Transmitter Modem Control Card (Full Width) -->
        <div class="col-12">
          <div class="card">
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

              <div class="row g-3">
                <!-- Configuration Panel -->
                <div class="col-lg-6">
                  <div class="card h-100">
                    <div class="card-header">
                      <h4 class="card-title">Configuration</h4>
                    </div>
                    <div class="card-body">
                      <!-- Antenna selector -->
                      <div class="mb-3">
                        <label class="form-label">Antenna</label>
                        <select id="tx-antenna-select" class="form-select">
                          <option value="1">Antenna 1</option>
                          <option value="2">Antenna 2</option>
                        </select>
                      </div>

                      <!-- Frequency input -->
                      <div class="mb-3">
                        <label class="form-label">Frequency (MHz)</label>
                        <input id="tx-frequency-input" type="number" class="form-control" step="0.1" />
                        <small class="text-muted">Current: <span id="tx-frequency-current">--</span> MHz</small>
                      </div>

                      <!-- Bandwidth input -->
                      <div class="mb-3">
                        <label class="form-label">Bandwidth (MHz)</label>
                        <input id="tx-bandwidth-input" type="number" class="form-control" step="0.1" />
                        <small class="text-muted">Current: <span id="tx-bandwidth-current">--</span> MHz</small>
                      </div>

                      <!-- Power input -->
                      <div class="mb-3">
                        <label class="form-label">Power (dBm)</label>
                        <input id="tx-power-input" type="number" class="form-control" step="0.5" />
                        <small class="text-muted">Current: <span id="tx-power-current">--</span> dBm</small>
                      </div>

                      <button id="tx-apply-btn" class="btn btn-primary w-100">Apply Changes</button>
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
                      <div class="mb-3">
                        <label class="form-label d-flex justify-content-between">
                          <span>Power Budget</span>
                          <span id="tx-power-percentage" class="fw-bold">0%</span>
                        </label>
                        <div class="progress">
                          <div id="tx-power-bar" class="progress-bar" style="width: 0%"></div>
                        </div>
                      </div>

                      <!-- Switches -->
                      <div class="mb-3">
                        <div class="form-check form-switch mb-2">
                          <input id="tx-transmit-switch" type="checkbox" class="form-check-input" role="switch" />
                          <label class="form-check-label">Transmit</label>
                        </div>
                        <div class="form-check form-switch mb-2">
                          <input id="tx-loopback-switch" type="checkbox" class="form-check-input" role="switch" />
                          <label class="form-check-label">Loopback</label>
                        </div>
                        <div class="form-check form-switch mb-2">
                          <input id="tx-power-switch" type="checkbox" class="form-check-input" role="switch" />
                          <label class="form-check-label">Power</label>
                        </div>
                      </div>

                      <!-- Status LEDs -->
                      <div class="mb-3">
                        <div class="d-flex justify-content-around">
                          <div class="text-center">
                            <div id="tx-transmit-led" class="led led-gray mb-1"></div>
                            <small class="text-muted">TX</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-fault-led" class="led led-gray mb-1"></div>
                            <small class="text-muted">Fault</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-loopback-led" class="led led-gray mb-1"></div>
                            <small class="text-muted">Loopback</small>
                          </div>
                          <div class="text-center">
                            <div id="tx-online-led" class="led led-gray mb-1"></div>
                            <small class="text-muted">Online</small>
                          </div>
                        </div>
                      </div>

                      <!-- Fault Reset Button -->
                      <button id="tx-fault-reset-btn" class="btn btn-warning w-100 mb-2">Reset Fault</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Status Bar -->
              <div id="tx-status-bar" class="alert alert-info mt-3" role="alert">
                Ready
              </div>
            </div>
          </div>
        </div>

        <!-- Redundancy Controller Placeholder Card -->
        <div class="col-lg-6">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Redundancy Controller</h3>
            </div>
            <div class="card-body text-center">
              <p class="text-muted">Redundancy controller coming in future phase</p>
              <p class="text-muted small">Status: Not Implemented</p>
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
