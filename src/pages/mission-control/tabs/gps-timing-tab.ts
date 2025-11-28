import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { GPSDOAdapter } from './gpsdo-adapter';
import './gps-timing-tab.css';

/**
 * GPSTimingTab - GPS Disciplined Oscillator timing reference display
 *
 * Phase 7 Implementation:
 * - GPSDO lock status and controls
 * - GNSS constellation tracking display
 * - 10 MHz reference output monitoring
 * - OCXO oven temperature and warmup status
 * - Frequency accuracy and stability metrics
 * - Holdover performance monitoring
 *
 * Equipment Flow:
 * GNSS Antenna → GNSS Receiver → Disciplining Algorithm → OCXO → 10 MHz Distribution
 */
export class GPSTimingTab extends BaseElement {
  private readonly groundStation: GroundStation;
  private gpsdoAdapter: GPSDOAdapter | null = null;

  constructor(groundStation: GroundStation, containerId: string) {
    super();
    this.groundStation = groundStation;

    // Ensure equipment is initialized
    if (this.groundStation.antennas.length === 0) {
      this.groundStation.initializeEquipment();
    }

    this.init_(containerId, 'replace');
    this.dom_ = qs('.gps-timing-tab');

    this.addEventListenersLate_();
  }

  protected html_ = html`
    <div class="gps-timing-tab">
      <!-- Lock Status Section -->
      <div class="gps-section lock-status">
        <h3 class="gps-section-title">Lock & Power Status</h3>
        <div class="gps-section-content">
          <!-- Power Control -->
          <div class="control-group">
            <label for="gpsdo-power">Power</label>
            <div class="switch-control">
              <input type="checkbox" id="gpsdo-power" class="form-check-input" checked />
              <label for="gpsdo-power" class="form-check-label">Powered</label>
            </div>
          </div>

          <!-- GNSS Switch Control -->
          <div class="control-group">
            <label for="gpsdo-gnss-switch">GNSS Input</label>
            <div class="switch-control">
              <input type="checkbox" id="gpsdo-gnss-switch" class="form-check-input" checked />
              <label for="gpsdo-gnss-switch" class="form-check-label">Enabled</label>
            </div>
          </div>

          <!-- Status Indicators -->
          <div class="status-group">
            <div class="status-item">
              <span class="status-label">Lock Status:</span>
              <div class="status-with-led">
                <span id="gpsdo-lock-status" class="status-value">LOCKED</span>
                <div id="gpsdo-lock-led" class="led led-green"></div>
              </div>
            </div>
            <div class="status-item">
              <span class="status-label">GNSS Signal:</span>
              <div id="gpsdo-gnss-led" class="led led-green"></div>
            </div>
            <div class="status-item">
              <span class="status-label">Warmup:</span>
              <div class="status-with-led">
                <span id="gpsdo-warmup-time" class="status-value">READY</span>
                <div id="gpsdo-warmup-led" class="led led-green"></div>
              </div>
            </div>
            <div class="status-item">
              <span class="status-label">Holdover:</span>
              <div id="gpsdo-holdover-led" class="led led-off"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- GNSS Constellation Section -->
      <div class="gps-section gnss-constellation">
        <h3 class="gps-section-title">GNSS Constellation</h3>
        <div class="gps-section-content">
          <div class="constellation-display">
            <div class="constellation-icon">🛰️</div>
            <div class="constellation-info">
              <div class="info-item">
                <span class="info-label">Satellites Tracked:</span>
                <span id="gpsdo-satellite-count" class="info-value">9</span>
              </div>
              <div class="info-item">
                <span class="info-label">Constellation:</span>
                <span id="gpsdo-constellation" class="info-value">GPS</span>
              </div>
              <div class="info-item">
                <span class="info-label">UTC Accuracy:</span>
                <span id="gpsdo-utc-accuracy" class="info-value">0 ns</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Reference Quality Section -->
      <div class="gps-section reference-quality">
        <h3 class="gps-section-title">Reference Quality Metrics</h3>
        <div class="gps-section-content">
          <div class="metrics-grid">
            <div class="metric-item">
              <span class="metric-label">Frequency Accuracy</span>
              <span id="gpsdo-freq-accuracy" class="metric-value">0.00 ×10⁻¹¹</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Allan Deviation (1s)</span>
              <span id="gpsdo-allan-deviation" class="metric-value">0.00 ×10⁻¹¹</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Phase Noise @ 10Hz</span>
              <span id="gpsdo-phase-noise" class="metric-value">0.0 dBc/Hz</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Lock Duration</span>
              <span id="gpsdo-lock-duration" class="metric-value">0h 0m 0s</span>
            </div>
          </div>
        </div>
      </div>

      <!-- OCXO Oven Section -->
      <div class="gps-section ocxo-oven">
        <h3 class="gps-section-title">OCXO Oven Control</h3>
        <div class="gps-section-content">
          <div class="oven-display">
            <div class="oven-icon">🌡️</div>
            <div class="oven-info">
              <div class="info-item">
                <span class="info-label">Oven Temperature:</span>
                <span id="gpsdo-temperature" class="info-value">70.0 °C</span>
              </div>
              <div class="info-item">
                <span class="info-label">Operating Hours:</span>
                <span id="gpsdo-operating-hours" class="info-value">0.0 hrs</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Holdover Performance Section -->
      <div class="gps-section holdover-performance">
        <h3 class="gps-section-title">Holdover Performance</h3>
        <div class="gps-section-content">
          <div class="holdover-display">
            <div class="info-item">
              <span class="info-label">Holdover Error:</span>
              <span id="gpsdo-holdover-error" class="info-value">0.00 μs</span>
            </div>
            <div class="info-note">
              Spec: &lt; 40 μs over 24 hours
            </div>
          </div>
        </div>
      </div>

      <!-- 10 MHz Distribution Section -->
      <div class="gps-section mhz-distribution">
        <h3 class="gps-section-title">10 MHz Distribution</h3>
        <div class="gps-section-content">
          <div class="distribution-display">
            <div class="info-item">
              <span class="info-label">Active Outputs:</span>
              <span id="gpsdo-10mhz-outputs" class="info-value">2/5</span>
            </div>
            <div class="info-note">
              Distributing 10 MHz reference to BUC and LNB modules
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

    // Create adapter
    this.gpsdoAdapter = new GPSDOAdapter(rfFrontEnd.gpsdoModule, this.dom_!);
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
    this.gpsdoAdapter?.dispose();
    this.gpsdoAdapter = null;
    this.dom_?.remove();
  }
}
