import { GroundStation } from "@app/assets/ground-station/ground-station";
import activityPng from '@app/assets/icons/activity.png';
import heartRateMonitorPng from '@app/assets/icons/heart-rate-monitor.png';
import powerPng from '@app/assets/icons/power.png';
import satellitePng from '@app/assets/icons/satellite.png';
import sharePng from '@app/assets/icons/share.png';
import temperaturePng from '@app/assets/icons/temperature.png';
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import './gps-timing-tab.css';
import { GPSDOAdapter } from './gpsdo-adapter';

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
      <div class="row g-2 pb-6">
        <!-- Lock Status Card -->
        <div class="col-lg-3">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">
                <img src="${powerPng}" alt="Power" style="width: 1.25rem; height: 1.25rem; filter: invert(1);" />
                <span>Lock & Power Status</span>
              </h3>
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
                <span id="gpsdo-lock-badge" class="status-badge status-badge-green">LOCKED</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">GNSS Signal:</span>
                <span id="gpsdo-gnss-badge" class="status-badge status-badge-green">GOOD</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Warmup:</span>
                <span id="gpsdo-warmup-badge" class="status-badge status-badge-green">READY</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Holdover:</span>
                <span id="gpsdo-holdover-badge" class="status-badge status-badge-off">INACTIVE</span>
              </div>
            </div>
          </div>
        </div>

        <!-- GNSS Constellation Card -->
        <div class="col-lg-3">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">
                <img src="${satellitePng}" alt="GNSS Constellation" style="width: 1.25rem; height: 1.25rem; filter: invert(1);" />
                <span>GNSS Constellation</span>
              </h3>
            </div>
            <div class="card-body">
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

        <!-- OCXO Oven Card -->
        <div class="col-lg-3">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">
                <img src="${temperaturePng}" alt="OCXO Oven Control" style="width: 1.25rem; height: 1.25rem; filter: invert(1);" />
                <span>OCXO Oven Control</span>
              </h3>
            </div>
            <div class="card-body">
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

        <!-- 10 MHz Distribution Card -->
        <div class="col-lg-3">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">
                <img src="${sharePng}" alt="10 MHz Distribution" style="width: 1.25rem; height: 1.25rem; filter: invert(1);" />
                <span>10 MHz Distribution</span>
              </h3>
            </div>
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <span class="text-muted small">Active Outputs:</span>
                <span id="gpsdo-10mhz-outputs" class="fw-bold font-monospace">2/5</span>
              </div>
              <div class="text-muted text-center">
                <p>
                  BUC Module
                </p>
                <p>
                  LNB Module
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Reference Quality Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">
                <img src="${heartRateMonitorPng}" alt="Reference Quality Metrics" style="width: 1.25rem; height: 1.25rem; filter: invert(1);" />
                <span>Reference Quality Metrics</span>
              </h3>
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

        <!-- Holdover Performance Card -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">
                <img src="${activityPng}" alt="Holdover Performance" style="width: 1.25rem; height: 1.25rem; filter: invert(1);" />
                <span>Holdover Performance</span>
              </h3>
            </div>
            <div class="card-body">
              <!-- Status Row -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Status:</span>
                <span id="gpsdo-holdover-badge" class="status-badge status-badge-off">INACTIVE</span>
              </div>

              <!-- Duration Row -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Duration:</span>
                <span id="gpsdo-holdover-duration" class="fw-bold font-monospace">0h 0m 0s</span>
              </div>

              <!-- Error with Progress Bar -->
              <div class="mb-2">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Error:</span>
                  <span id="gpsdo-holdover-error" class="fw-bold font-monospace">0.00 μs</span>
                </div>
                <div class="progress mt-1" style="height: 6px;">
                  <div id="gpsdo-holdover-progress" class="progress-bar bg-success"
                       role="progressbar" style="width: 0%"></div>
                </div>
                <div class="d-flex justify-content-between mt-1">
                  <span class="text-muted small">0 μs</span>
                  <span class="text-muted small">40 μs (spec limit)</span>
                </div>
              </div>

              <!-- Time to Limit -->
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Time to Limit:</span>
                <span id="gpsdo-holdover-ttl" class="fw-bold font-monospace">--</span>
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
