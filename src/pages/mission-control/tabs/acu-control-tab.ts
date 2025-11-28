import { GroundStation } from '@app/assets/ground-station/ground-station';
import { BaseElement } from '@app/components/base-element';
import { PolarPlot } from '@app/components/polar-plot/polar-plot';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
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
  private polarPlot_: PolarPlot | null = null;
  private antennaStateHandler_: (() => void) | null = null;

  protected html_ = html`
    <div class="acu-control-tab">
      <div class="row g-3 pb-6">
        <!-- Antenna Position Polar Plot (Full Width) -->
        <div class="col-xxl-4 fit-content">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Antenna Position</h3>
            </div>
            <div class="card-body d-flex justify-content-center align-items-center">
              <div id="polar-plot-container"></div>
            </div>
          </div>
        </div>

        <!-- Antenna Controls Card -->
        <div class="col-xxl-6 grow-1">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">Antenna Control</h3>
            </div>
            <div class="card-body">
              <div class="mb-3">
                <label for="az-slider" class="form-label d-flex justify-content-between">
                  <span>Azimuth</span>
                  <span id="az-value" class="text-primary fw-bold">0.0°</span>
                </label>
                <input type="range" class="form-range" id="az-slider"
                       min="-270" max="270" step="0.1" value="0">
              </div>

              <div class="mb-3">
                <label for="el-slider" class="form-label d-flex justify-content-between">
                  <span>Elevation</span>
                  <span id="el-value" class="text-primary fw-bold">0.0°</span>
                </label>
                <input type="range" class="form-range" id="el-slider"
                       min="-5" max="90" step="0.1" value="0">
              </div>

              <div class="mb-3">
                <label for="pol-slider" class="form-label d-flex justify-content-between">
                  <span>Polarization</span>
                  <span id="pol-value" class="text-primary fw-bold">0.0°</span>
                </label>
                <input type="range" class="form-range" id="pol-slider"
                       min="-90" max="90" step="1" value="0">
              </div>

              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" role="switch"
                       id="power-switch" checked>
                <label class="form-check-label" for="power-switch">Power</label>
              </div>
              <div class="form-check form-switch mb-2">
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
        </div>

        <!-- Right Column: OMT & RF Metrics -->
        <div class="col-xxl-3">
          <!-- OMT Display Card -->
          <div class="card mb-3">
            <div class="card-header">
              <h3 class="card-title">OMT / Duplexer</h3>
            </div>
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">TX Polarization:</span>
                <span id="omt-tx-pol" class="fw-bold font-monospace">--</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">RX Polarization:</span>
                <span id="omt-rx-pol" class="fw-bold font-monospace">--</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Cross-Pol Isolation:</span>
                <span id="omt-isolation" class="fw-bold font-monospace">-- dB</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Status:</span>
                <span id="omt-fault-led" class="led led-green"></span>
              </div>
            </div>
          </div>

          <!-- RF Metrics Card -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">RF Metrics</h3>
            </div>
            <div class="card-body">
              <div class="row g-2">
                <div class="col-6">
                  <div class="card card-sm bg-dark">
                    <div class="card-body p-2">
                      <div class="text-muted small text-uppercase mb-1">Frequency</div>
                      <div id="rf-metric-freq" class="h5 mb-0 text-primary font-monospace">-- GHz</div>
                    </div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="card card-sm bg-dark">
                    <div class="card-body p-2">
                      <div class="text-muted small text-uppercase mb-1">Gain</div>
                      <div id="rf-metric-gain" class="h5 mb-0 text-primary font-monospace">-- dBi</div>
                    </div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="card card-sm bg-dark">
                    <div class="card-body p-2">
                      <div class="text-muted small text-uppercase mb-1">HPBW</div>
                      <div id="rf-metric-beamwidth" class="h5 mb-0 text-primary font-monospace">-- deg</div>
                    </div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="card card-sm bg-dark">
                    <div class="card-body p-2">
                      <div class="text-muted small text-uppercase mb-1">G/T</div>
                      <div id="rf-metric-gt" class="h5 mb-0 text-primary font-monospace">-- dB/K</div>
                    </div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="card card-sm bg-dark">
                    <div class="card-body p-2">
                      <div class="text-muted small text-uppercase mb-1">Pol Loss</div>
                      <div id="rf-metric-pol-loss" class="h5 mb-0 text-primary font-monospace">-- dB</div>
                    </div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="card card-sm bg-dark">
                    <div class="card-body p-2">
                      <div class="text-muted small text-uppercase mb-1">Sky Temp</div>
                      <div id="rf-metric-sky-temp" class="h5 mb-0 text-primary font-monospace">-- K</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- END -->
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

    // Create and initialize polar plot
    this.polarPlot_ = PolarPlot.create(
      `polar-plot-${this.groundStation.uuid}`,
      { width: 450, height: 450, showGrid: true, showLabels: true }
    );

    // Inject polar plot HTML into container
    const polarPlotContainer = this.dom_.querySelector('#polar-plot-container');
    if (polarPlotContainer) {
      polarPlotContainer.innerHTML = this.polarPlot_.html;
    }

    // Wire to antenna state changes - store handler for cleanup
    this.antennaStateHandler_ = () => {
      if (this.polarPlot_) {
        this.polarPlot_.draw(antenna.state.azimuth, antenna.state.elevation);
      }
    };
    EventBus.getInstance().on(Events.ANTENNA_STATE_CHANGED, this.antennaStateHandler_);

    // Initial draw with current antenna position
    this.polarPlot_.onDomReady();
    this.polarPlot_.draw(antenna.state.azimuth, antenna.state.elevation);
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
  }

  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    // Remove event listeners
    if (this.antennaStateHandler_) {
      EventBus.getInstance().off(Events.ANTENNA_STATE_CHANGED, this.antennaStateHandler_);
      this.antennaStateHandler_ = null;
    }

    // Dispose adapters
    this.antennaAdapter?.dispose();
    this.omtAdapter?.dispose();

    // Clean up polar plot
    this.polarPlot_ = null;

    // Remove DOM
    this.dom_?.remove();
  }
}
