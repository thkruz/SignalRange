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
      <div class="row g-3">
        <!-- Lock Status Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">Lock & Power Status</h3>
            </div>
            <div class="card-body">
              <!-- Power Control -->
              <div class="form-check form-switch mb-2">
                <input type="checkbox" id="gpsdo-power" class="form-check-input" role="switch" checked />
                <label for="gpsdo-power" class="form-check-label">Power</label>
              </div>

              <!-- GNSS Switch Control -->
              <div class="form-check form-switch mb-3">
                <input type="checkbox" id="gpsdo-gnss-switch" class="form-check-input" role="switch" checked />
                <label for="gpsdo-gnss-switch" class="form-check-label">GNSS Input</label>
              </div>

              <!-- Status Indicators -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Lock Status:</span>
                <div class="status-with-led">
                  <span id="gpsdo-lock-status" class="fw-bold font-monospace">LOCKED</span>
                  <div id="gpsdo-lock-led" class="led led-green"></div>
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">GNSS Signal:</span>
                <div id="gpsdo-gnss-led" class="led led-green"></div>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Warmup:</span>
                <div class="status-with-led">
                  <span id="gpsdo-warmup-time" class="fw-bold font-monospace">READY</span>
                  <div id="gpsdo-warmup-led" class="led led-green"></div>
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Holdover:</span>
                <div id="gpsdo-holdover-led" class="led led-off"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- GNSS Constellation Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">GNSS Constellation</h3>
            </div>
            <div class="card-body">
              <div class="text-center mb-3">
                <span style="font-size: 2rem;">🛰️</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Satellites Tracked:</span>
                <span id="gpsdo-satellite-count" class="fw-bold font-monospace">9</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Constellation:</span>
                <span id="gpsdo-constellation" class="fw-bold font-monospace">GPS</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">UTC Accuracy:</span>
                <span id="gpsdo-utc-accuracy" class="fw-bold font-monospace">0 ns</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Reference Quality Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">Reference Quality Metrics</h3>
            </div>
            <div class="card-body">
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
        </div>

        <!-- OCXO Oven Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">OCXO Oven Control</h3>
            </div>
            <div class="card-body">
              <div class="text-center mb-3">
                <span style="font-size: 2rem;">🌡️</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Oven Temperature:</span>
                <span id="gpsdo-temperature" class="fw-bold font-monospace">70.0 °C</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Operating Hours:</span>
                <span id="gpsdo-operating-hours" class="fw-bold font-monospace">0.0 hrs</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Holdover Performance Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">Holdover Performance</h3>
            </div>
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <span class="text-muted small">Holdover Error:</span>
                <span id="gpsdo-holdover-error" class="fw-bold font-monospace">0.00 μs</span>
              </div>
              <div class="text-muted small text-center">
                Spec: &lt; 40 μs over 24 hours
              </div>
            </div>
          </div>
        </div>

        <!-- 10 MHz Distribution Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">10 MHz Distribution</h3>
            </div>
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <span class="text-muted small">Active Outputs:</span>
                <span id="gpsdo-10mhz-outputs" class="fw-bold font-monospace">2/5</span>
              </div>
              <div class="text-muted small text-center">
                Distributing 10 MHz reference to BUC and LNB modules
              </div>
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
    this.gpsdoAdapter?.dispose();
    this.gpsdoAdapter = null;
    this.dom_?.remove();
  }
}
