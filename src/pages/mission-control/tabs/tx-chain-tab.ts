import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { BUCAdapter } from './buc-adapter';
import { HPAAdapter } from './hpa-adapter';
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
            <div class="card-header">
              <h3 class="card-title">BUC (Block Up Converter)</h3>
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
            <div class="card-header">
              <h3 class="card-title">HPA (High Power Amplifier)</h3>
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

        <!-- Modulator Placeholder Card -->
        <div class="col-lg-6">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Modulator</h3>
            </div>
            <div class="card-body text-center">
              <p class="text-muted">Modulator controls coming in future phase</p>
              <p class="text-muted small">Status: Not Implemented</p>
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

    this.bucAdapter = null;
    this.hpaAdapter = null;

    this.dom_?.remove();
  }
}
