import { GroundStation } from '@app/assets/ground-station/ground-station';
import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import './acu-control-tab.css';
import { AntennaAdapter } from './antenna-adapter';
import { OMTAdapter } from './omt-adapter';

/**
 * ACUControlTab - Antenna Control Unit tab for ground station equipment
 *
 * Displays:
 * - Antenna controls (azimuth, elevation, polarization)
 * - Power, auto-track, loopback switches
 * - OMT/Duplexer status (TX/RX polarization, isolation)
 * - RF metrics (gain, G/T, beamwidth, etc.)
 *
 * Uses adapters to bridge equipment Core classes to modern web controls
 */
export class ACUControlTab extends BaseElement {
  private readonly groundStation: GroundStation;
  private antennaAdapter: AntennaAdapter | null = null;
  private omtAdapter: OMTAdapter | null = null;

  protected html_ = html`
    <div class="acu-control-tab">
      <!-- Antenna Controls -->
      <div class="acu-section antenna-controls">
        <h3>Antenna Control</h3>

        <div class="control-group">
          <label for="az-slider" class="form-label">
            Azimuth: <span id="az-value">0.0</span>°
          </label>
          <input type="range" class="form-range" id="az-slider"
                 min="-270" max="270" step="0.1" value="0">
        </div>

        <div class="control-group">
          <label for="el-slider" class="form-label">
            Elevation: <span id="el-value">0.0</span>°
          </label>
          <input type="range" class="form-range" id="el-slider"
                 min="-5" max="90" step="0.1" value="0">
        </div>

        <div class="control-group">
          <label for="pol-slider" class="form-label">
            Polarization: <span id="pol-value">0.0</span>°
          </label>
          <input type="range" class="form-range" id="pol-slider"
                 min="-90" max="90" step="1" value="0">
        </div>

        <div class="switches">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch"
                   id="power-switch" checked>
            <label class="form-check-label" for="power-switch">Power</label>
          </div>
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch"
                   id="autotrack-switch">
            <label class="form-check-label" for="autotrack-switch">Auto Track</label>
          </div>
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch"
                   id="loopback-switch">
            <label class="form-check-label" for="loopback-switch">Loopback</label>
          </div>
        </div>
      </div>

      <!-- OMT Display -->
      <div class="acu-section omt-display">
        <h3>OMT / Duplexer</h3>

        <div class="omt-status">
          <div class="status-row">
            <span class="status-label">TX Polarization:</span>
            <span id="omt-tx-pol" class="status-value">--</span>
          </div>
          <div class="status-row">
            <span class="status-label">RX Polarization:</span>
            <span id="omt-rx-pol" class="status-value">--</span>
          </div>
          <div class="status-row">
            <span class="status-label">Cross-Pol Isolation:</span>
            <span id="omt-isolation" class="status-value">-- dB</span>
          </div>
          <div class="status-row">
            <span class="status-label">Status:</span>
            <span id="omt-fault-led" class="led led-green"></span>
          </div>
        </div>
      </div>

      <!-- RF Metrics -->
      <div class="acu-section rf-metrics">
        <h3>RF Metrics</h3>

        <div class="metrics-grid">
          <div class="metric-item">
            <span class="metric-label">Frequency</span>
            <span id="rf-metric-freq" class="metric-value">-- GHz</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Gain</span>
            <span id="rf-metric-gain" class="metric-value">-- dBi</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">HPBW</span>
            <span id="rf-metric-beamwidth" class="metric-value">-- deg</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">G/T</span>
            <span id="rf-metric-gt" class="metric-value">-- dB/K</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Pol Loss</span>
            <span id="rf-metric-pol-loss" class="metric-value">-- dB</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Sky Temp</span>
            <span id="rf-metric-sky-temp" class="metric-value">-- K</span>
          </div>
        </div>
      </div>
    </div>
  `;

  constructor(groundStation: GroundStation, containerId: string) {
    super();
    this.groundStation = groundStation;
    this.init_(containerId, 'replace');
    this.dom_ = qs('.acu-control-tab');

    // Call initializeEquipment if not already initialized
    if (this.groundStation.antennas.length === 0) {
      this.groundStation.initializeEquipment();
    }

    this.addEventListenersLate_();
  }

  protected addEventListeners_(): void {
    // Not ready yet
  }

  protected addEventListenersLate_(): void {
    // Get equipment references
    const antenna = this.groundStation.antennas[0];
    const rfFrontEnd = this.groundStation.rfFrontEnds[0];

    if (!antenna || !rfFrontEnd) {
      console.error('ACUControlTab: Equipment not found in ground station');
      return;
    }

    // Create adapters
    this.antennaAdapter = new AntennaAdapter(antenna, this.dom_);
    this.omtAdapter = new OMTAdapter(rfFrontEnd.omtModule, this.dom_);
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'grid';
    }
  }

  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    this.antennaAdapter?.dispose();
    this.omtAdapter?.dispose();
    this.dom_?.remove();
  }
}
