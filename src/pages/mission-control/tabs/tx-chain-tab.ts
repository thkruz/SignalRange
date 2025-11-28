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
      <!-- BUC Control Section -->
      <div class="tx-section buc-control">
        <h3 class="tx-section-title">BUC (Block Up Converter)</h3>
        <div class="tx-section-content">
          <!-- LO Frequency Control -->
          <div class="control-group">
            <label for="buc-lo-frequency">LO Frequency</label>
            <div class="control-with-display">
              <input
                type="range"
                id="buc-lo-frequency"
                min="6000"
                max="7000"
                step="10"
                value="6425"
                class="form-range"
              />
              <span id="buc-lo-frequency-display" class="control-display">6425 MHz</span>
            </div>
          </div>

          <!-- Gain Control -->
          <div class="control-group">
            <label for="buc-gain">Gain</label>
            <div class="control-with-display">
              <input
                type="range"
                id="buc-gain"
                min="0"
                max="70"
                step="0.5"
                value="58"
                class="form-range"
              />
              <span id="buc-gain-display" class="control-display">58.0 dB</span>
            </div>
          </div>

          <!-- Power Switch -->
          <div class="control-group">
            <label for="buc-power">Power</label>
            <div class="switch-control">
              <input type="checkbox" id="buc-power" class="form-check-input" checked />
              <label for="buc-power" class="form-check-label">Powered</label>
            </div>
          </div>

          <!-- Mute Switch -->
          <div class="control-group">
            <label for="buc-mute">Mute</label>
            <div class="switch-control">
              <input type="checkbox" id="buc-mute" class="form-check-input" />
              <label for="buc-mute" class="form-check-label">Muted</label>
            </div>
          </div>

          <!-- Status Indicators -->
          <div class="status-group">
            <div class="status-item">
              <span class="status-label">Output Power:</span>
              <span id="buc-output-power-display" class="status-value">-10.0 dBm</span>
            </div>
            <div class="status-item">
              <span class="status-label">Temperature:</span>
              <span id="buc-temperature-display" class="status-value">25.0 °C</span>
            </div>
            <div class="status-item">
              <span class="status-label">Lock Status:</span>
              <div id="buc-lock-led" class="led led-green"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- HPA Control Section -->
      <div class="tx-section hpa-control">
        <h3 class="tx-section-title">HPA (High Power Amplifier)</h3>
        <div class="tx-section-content">
          <!-- Power Switch -->
          <div class="control-group">
            <label for="hpa-power">Power</label>
            <div class="switch-control">
              <input type="checkbox" id="hpa-power" class="form-check-input" checked />
              <label for="hpa-power" class="form-check-label">Powered</label>
            </div>
          </div>

          <!-- HPA Enable Switch -->
          <div class="control-group">
            <label for="hpa-enable">HPA Enable</label>
            <div class="switch-control">
              <input type="checkbox" id="hpa-enable" class="form-check-input" />
              <label for="hpa-enable" class="form-check-label">Enabled</label>
            </div>
          </div>

          <!-- Back-off Control -->
          <div class="control-group">
            <label for="hpa-backoff">Back-off from P1dB</label>
            <div class="control-with-display">
              <input
                type="range"
                id="hpa-backoff"
                min="0"
                max="30"
                step="0.5"
                value="6"
                class="form-range"
              />
              <span id="hpa-backoff-display" class="control-display">6.0 dB</span>
            </div>
          </div>

          <!-- Status Indicators -->
          <div class="status-group">
            <div class="status-item">
              <span class="status-label">Output Power:</span>
              <span id="hpa-output-power-display" class="status-value">50.0 dBm</span>
            </div>
            <div class="status-item">
              <span class="status-label">Gain:</span>
              <span id="hpa-gain-display" class="status-value">44.0 dB</span>
            </div>
            <div class="status-item">
              <span class="status-label">Temperature:</span>
              <span id="hpa-temperature-display" class="status-value">45.0 °C</span>
            </div>
            <div class="status-item">
              <span class="status-label">IMD Level:</span>
              <span id="hpa-imd-display" class="status-value">-30.0 dBc</span>
            </div>
            <div class="status-item">
              <span class="status-label">Overdrive:</span>
              <div id="hpa-overdrive-led" class="led led-green"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modulator Section (Placeholder) -->
      <div class="tx-section modulator-placeholder">
        <h3 class="tx-section-title">Modulator</h3>
        <div class="tx-section-content">
          <div class="placeholder-message">
            <p>Modulator controls coming in future phase</p>
            <p class="text-muted">Status: Not Implemented</p>
          </div>
        </div>
      </div>

      <!-- Redundancy Controller Section (Placeholder) -->
      <div class="tx-section redundancy-placeholder">
        <h3 class="tx-section-title">Redundancy Controller</h3>
        <div class="tx-section-content">
          <div class="placeholder-message">
            <p>Redundancy controller coming in future phase</p>
            <p class="text-muted">Status: Not Implemented</p>
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
    this.bucAdapter?.dispose();
    this.hpaAdapter?.dispose();

    this.bucAdapter = null;
    this.hpaAdapter = null;

    this.dom_?.remove();
  }
}
