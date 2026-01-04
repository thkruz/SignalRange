import { GroundStation } from '@app/assets/ground-station/ground-station';
import { BaseElement } from '@app/components/base-element';
import { FineAdjustControl } from '@app/components/fine-adjust-control/fine-adjust-control';
import { PolarPlot } from '@app/components/polar-plot/polar-plot';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { TrackingMode } from '@app/equipment/antenna/antenna-core';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { parseLocalizedNumber } from '@app/utils/parse-number';
import { WeatherManager } from '@app/weather/weather-manager';
import './acu-control-tab.css';
import { AntennaAdapter } from './antenna-adapter';
import { OMTAdapter } from './omt-adapter';

/**
 * ACUControlTab - Antenna Control Unit tab for ground station equipment
 *
 * Displays:
 * - ACU identification (model, serial number, antenna info)
 * - Tracking mode selector (Stow, Maintenance, Manual, Program Track, Step Track)
 * - Antenna controls (azimuth, elevation, polarization) with fine adjustment buttons
 * - Beacon tracking controls (frequency, search bandwidth)
 * - Environmental controls (heater, rain blower, precipitation sensor)
 * - OMT/Duplexer status
 * - RF metrics
 *
 * Uses adapters to bridge equipment Core classes to modern web controls.
 * Supports multiple instances per ground station (one per antenna) via unique ID prefixes.
 */
export class ACUControlTab extends BaseElement {
  private readonly groundStation: GroundStation;
  private readonly antennaIndex_: number;
  private readonly uniquePrefix_: string;
  private antennaAdapter: AntennaAdapter | null = null;
  private omtAdapter: OMTAdapter | null = null;
  private polarPlot_: PolarPlot | null = null;
  private antennaStateHandler_: (() => void) | null = null;
  private drawHandler_: (() => void) | null = null;
  private updateHandler_: (() => void) | null = null;

  // Fine adjustment controls
  private azFineControl_: FineAdjustControl | null = null;
  private elFineControl_: FineAdjustControl | null = null;
  private polFineControl_: FineAdjustControl | null = null;

  // Beacon display throttling (1 second interval like other adapters)
  private static readonly BEACON_UPDATE_INTERVAL_MS = 1000;
  private lastBeaconSyncTime_: number = 0;

  // Active target satellite (only updates when "Move to Target" is clicked)
  private activeTargetSatelliteId_: number | null = null;

  // Event handler cleanup tracking
  private readonly boundHandlers_: Map<string, { element: Element; event: string; handler: EventListener }> = new Map();

  // HTML template is generated dynamically to support unique IDs
  protected html_: string;

  constructor(groundStation: GroundStation, containerId: string, antennaIndex: number = 0) {
    super();
    this.groundStation = groundStation;
    this.antennaIndex_ = antennaIndex;
    this.uniquePrefix_ = `acu-${groundStation.uuid}-ant${antennaIndex}-`;

    // Generate HTML with unique prefixed IDs
    this.html_ = this.generateHtml_();

    this.init_(containerId, 'replace');
    this.dom_ = qs(`.acu-control-tab-${this.uniquePrefix_}`);

    // Call initializeEquipment if not already initialized
    if (this.groundStation.antennas.length === 0) {
      this.groundStation.initializeEquipment();
    }

    this.addEventListenersLate_();
  }

  /**
   * Generate HTML template with prefixed IDs for multi-instance support
   */
  private generateHtml_(): string {
    const p = this.uniquePrefix_;
    const antenna = this.groundStation.antennas[this.antennaIndex_];
    const config = antenna?.config;
    const antennaInfo = config ? `${config.band}-Band ${config.diameter}m` : '';

    return html`
    <div class="acu-control-tab acu-control-tab-${p}">
      <!-- ACU Header: Identification + Tracking Mode -->
      <div class="card mb-3 acu-header-card">
        <div class="card-body py-2">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <!-- ACU Identification -->
            <div class="acu-identification">
              <span id="${p}model" class="acu-model">Kratos NGC-2200</span>
              <span id="${p}serial" class="acu-serial">(ACU-01)</span>
              <span id="${p}antenna-info" class="acu-antenna-info text-muted ms-2">| ${antennaInfo}</span>
              <span id="${p}status-led" class="led led-green ms-2"></span>
            </div>

            <!-- Tracking Mode Selector -->
            <div class="tracking-mode-selector btn-group" role="group" aria-label="Tracking mode selection">
              <button type="button" class="btn btn-tracking ${p}btn-tracking" data-mode="stow">STOW</button>
              <button type="button" class="btn btn-tracking ${p}btn-tracking" data-mode="maintenance">MAINT</button>
              <button type="button" class="btn btn-tracking ${p}btn-tracking active" data-mode="manual">MANUAL</button>
              <button type="button" class="btn btn-tracking ${p}btn-tracking" data-mode="program-track">PROGRAM</button>
              <button type="button" class="btn btn-tracking ${p}btn-tracking" data-mode="step-track">STEP</button>
            </div>

            <!-- Power & Loopback -->
            <div class="d-flex gap-3">
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" role="switch" id="${p}power-switch" checked>
                <label class="form-check-label" for="${p}power-switch">Power</label>
              </div>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" role="switch" id="${p}loopback-switch">
                <label class="form-check-label" for="${p}loopback-switch">Loopback</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-2 pb-6">
        <!-- Antenna Position Polar Plot -->
        <div class="col-xl-3">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">Antenna Position</h3>
            </div>
            <div class="card-body d-flex justify-content-center align-items-center">
              <div id="${p}polar-plot-container"></div>
            </div>
          </div>
        </div>

        <!-- Antenna Positioning Controls -->
        <div class="col-xl-5">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title mb-0">Antenna Positioning</h3>
              <div class="d-flex gap-2">
                <button id="${p}discard-changes-btn" class="btn btn-sm btn-secondary" disabled>CANCEL</button>
                <button id="${p}apply-changes-btn" class="btn btn-sm btn-apply" disabled>APPLY</button>
              </div>
            </div>
            <div class="card-body">
              <!-- Fine adjustment controls will be injected here -->
              <div id="${p}fine-adjust-container"></div>
              <!-- Fault message display -->
              <div id="${p}fault-message" class="alert alert-danger mt-2" style="display: none;"></div>
            </div>
          </div>
        </div>

        <!-- Context-Aware Panel (Beacon/Satellite) -->
        <div class="col-xl-4">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title" id="${p}context-panel-title">Tracking</h3>
            </div>
            <div class="card-body">
              <!-- Program Track: Satellite Selection -->
              <div id="${p}program-track-section" class="tracking-section" style="display: none;">
                <div class="mb-3">
                  <label class="form-label">Current Target</label>
                  <input type="text" id="${p}current-target-display" class="form-control font-monospace" value="No Target" readonly style="cursor: default;">
                </div>
                <div class="mb-3">
                  <label for="${p}satellite-select" class="form-label">Target Satellite</label>
                  <select id="${p}satellite-select" class="form-select">
                    <option value="">-- Select Satellite --</option>
                  </select>
                </div>
                <button id="${p}move-to-target-btn" class="btn btn-primary w-100" disabled>
                  Move to Target
                </button>
              </div>

              <!-- Step Track: Beacon Controls -->
              <div id="${p}step-track-section" class="tracking-section" style="display: none;">
                <div class="mb-3">
                  <label class="form-label">Beacon Frequency</label>
                  <div class="input-group">
                    <input type="number" class="form-control font-monospace" id="${p}beacon-freq"
                           value="3948" step="0.1" min="1000" max="50000">
                    <span class="input-group-text">MHz</span>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Search Bandwidth</label>
                  <div class="input-group">
                    <input type="number" class="form-control font-monospace" id="${p}beacon-search-bw"
                           value="500" step="50" min="100" max="2000">
                    <span class="input-group-text">kHz</span>
                  </div>
                </div>
                <button id="${p}step-track-toggle-btn" class="btn btn-primary w-100">
                  START TRACKING
                </button>
              </div>

              <!-- Manual/Stow/Maintenance: Status Info -->
              <div id="${p}manual-section" class="tracking-section">
                <div class="status-info">
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Mode:</span>
                    <span id="${p}tracking-mode-display" class="fw-bold font-monospace">MANUAL</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Lock Status:</span>
                    <span id="${p}lock-status-display" class="fw-bold">UNLOCKED</span>
                  </div>
                  <div class="d-flex justify-content-between">
                    <span class="text-muted">Signals:</span>
                    <span id="${p}signals-count-display" class="fw-bold font-monospace">0</span>
                  </div>
                </div>
              </div>

              <!-- Beacon C/N Display - visible in manual, program-track, step-track modes -->
              <div id="${p}beacon-display-section" class="mt-3" style="display: none;">
                <div class="beacon-strength-container">
                  <label class="form-label">Beacon C/N</label>
                  <div class="beacon-strength-bar">
                    <div class="beacon-strength-fill" id="${p}beacon-strength-fill"></div>
                    <span class="beacon-strength-value" id="${p}beacon-cn-value">-- dB</span>
                  </div>
                  <div class="d-flex justify-content-between mt-1">
                    <span class="text-muted small">Lock Status:</span>
                    <span id="${p}beacon-lock-status" class="fw-bold">--</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Row: OMT, Environmental, RF Metrics -->
      <div class="row g-2">
        <!-- OMT Display Card -->
        <div class="col-xl-3">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">OMT / Duplexer</h3>
            </div>
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">TX Polarization:</span>
                <span id="${p}omt-tx-pol" class="fw-bold font-monospace">--</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">RX Polarization:</span>
                <span id="${p}omt-rx-pol" class="fw-bold font-monospace">--</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">Cross-Pol Isolation:</span>
                <span id="${p}omt-isolation" class="fw-bold font-monospace">-- dB</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Status:</span>
                <span id="${p}omt-fault-led" class="led led-green"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Environmental Controls Card -->
        <div class="col-xl-3">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">Environmental</h3>
            </div>
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <span class="fw-bold">Feed Heater</span>
                  <div class="text-muted small">Prevents ice buildup</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span id="${p}heater-led" class="led led-off"></span>
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="${p}heater-switch">
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <span class="fw-bold">Rain Blower</span>
                  <div class="text-muted small">Clears radome</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span id="${p}blower-led" class="led led-off"></span>
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="${p}blower-switch">
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                <span class="text-muted small">Precipitation:</span>
                <span id="${p}precip-status" class="fw-bold">
                  <span class="led led-off me-1"></span>CLEAR
                </span>
              </div>
              <div class="d-flex justify-content-between align-items-center pt-2 mt-2 border-top">
                <span class="text-muted small">Ice Accumulation:</span>
                <span id="${p}ice-accumulation-display" class="fw-bold font-monospace">0.0 dB</span>
              </div>
            </div>
          </div>
        </div>

        <!-- RF Metrics Card -->
        <div class="col-xl-6">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title">RF Metrics</h3>
            </div>
            <div class="card-body">
              <div class="row g-2">
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">Frequency</div>
                    <div id="${p}rf-metric-freq" class="rf-metric-value">-- GHz</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">Gain</div>
                    <div id="${p}rf-metric-gain" class="rf-metric-value">-- dBi</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">HPBW</div>
                    <div id="${p}rf-metric-beamwidth" class="rf-metric-value">-- deg</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">G/T</div>
                    <div id="${p}rf-metric-gt" class="rf-metric-value">-- dB/K</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">Pol Loss</div>
                    <div id="${p}rf-metric-pol-loss" class="rf-metric-value">-- dB</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">Sky Temp</div>
                    <div id="${p}rf-metric-sky-temp" class="rf-metric-value">-- K</div>
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

  /**
   * Helper to query elements with the unique prefix
   */
  private qs_<T extends HTMLElement>(id: string): T | null {
    return this.dom_?.querySelector(`#${this.uniquePrefix_}${id}`) as T | null;
  }

  /**
   * Helper to query all elements with a class that includes the unique prefix
   */
  private qsa_(className: string): NodeListOf<Element> {
    return this.dom_?.querySelectorAll(`.${this.uniquePrefix_}${className}`) ?? ([] as unknown as NodeListOf<Element>);
  }

  /**
   * Register an event handler for cleanup
   */
  private addHandler_(key: string, element: Element, event: string, handler: EventListener): void {
    element.addEventListener(event, handler);
    this.boundHandlers_.set(key, { element, event, handler });
  }

  protected addEventListeners_(): void {
    // Not ready yet - deferred to addEventListenersLate_
  }

  protected addEventListenersLate_(): void {
    // Get equipment references
    const antenna = this.groundStation.antennas[this.antennaIndex_];
    const rfFrontEnd = this.groundStation.rfFrontEnds[this.antennaIndex_];

    if (!antenna || !rfFrontEnd) {
      console.error(`ACUControlTab: Equipment not found for antenna index ${this.antennaIndex_}`);
      return;
    }

    // Create adapters with prefixed element IDs
    this.antennaAdapter = new AntennaAdapter(antenna, this.dom_);
    this.omtAdapter = new OMTAdapter(rfFrontEnd.omtModule, this.dom_, this.uniquePrefix_);

    // Initialize fine adjustment controls
    this.initFineAdjustControls_(antenna);

    // Initialize Apply/Cancel buttons
    this.initApplyCancelButtons_(antenna);

    // Initialize tracking mode selector
    this.initTrackingModeSelector_(antenna);

    // Initialize satellite dropdown
    this.initSatelliteDropdown_(antenna);

    // Initialize beacon controls
    this.initBeaconControls_(antenna);

    // Initialize environmental controls
    this.initEnvironmentalControls_(antenna);

    // Initialize power and loopback controls
    this.initPowerControls_(antenna);

    // Create and initialize polar plot with unique ID
    this.polarPlot_ = PolarPlot.create(
      `polar-plot-${this.groundStation.uuid}-ant${this.antennaIndex_}`,
      { width: 300, height: 300, showGrid: true, showLabels: true }
    );

    // Inject polar plot HTML into container
    const polarPlotContainer = this.qs_('polar-plot-container');
    if (polarPlotContainer) {
      polarPlotContainer.innerHTML = this.polarPlot_.html;
    }

    // Wire to antenna state changes - store handler for cleanup
    this.antennaStateHandler_ = () => {
      if (this.polarPlot_) {
        this.polarPlot_.draw(antenna.state.azimuth, antenna.state.elevation);
      }
      this.syncUiWithState_(antenna);
      this.syncIceAccumulation_(antenna);
    };
    EventBus.getInstance().on(Events.UPDATE, this.antennaStateHandler_);

    // Wire to draw events for continuous RF metrics updates
    this.drawHandler_ = () => {
      this.syncRfMetrics_(antenna);
    };
    EventBus.getInstance().on(Events.DRAW, this.drawHandler_);

    // Wire to update events for beacon C/N updates (throttled to 1Hz like other adapters)
    this.updateHandler_ = () => {
      const now = Date.now();
      if (now - this.lastBeaconSyncTime_ < ACUControlTab.BEACON_UPDATE_INTERVAL_MS) return;
      this.lastBeaconSyncTime_ = now;
      this.syncBeaconMetrics_(antenna);
    };
    EventBus.getInstance().on(Events.UPDATE, this.updateHandler_);

    // Initial draw and sync
    this.polarPlot_.onDomReady();
    this.polarPlot_.draw(antenna.state.azimuth, antenna.state.elevation);
    this.syncUiWithState_(antenna);
  }

  private initFineAdjustControls_(antenna: typeof this.groundStation.antennas[0]): void {
    const container = this.qs_('fine-adjust-container');
    if (!container) return;

    // Create fine adjustment controls with ACTUAL position values
    // Red display shows current position (matches polar plot)
    this.azFineControl_ = FineAdjustControl.create(
      `az-fine-${this.groundStation.uuid}-ant${this.antennaIndex_}`,
      'Azimuth',
      antenna.state.azimuth,
      '°'
    );

    this.elFineControl_ = FineAdjustControl.create(
      `el-fine-${this.groundStation.uuid}-ant${this.antennaIndex_}`,
      'Elevation',
      antenna.state.elevation,
      '°'
    );

    this.polFineControl_ = FineAdjustControl.create(
      `pol-fine-${this.groundStation.uuid}-ant${this.antennaIndex_}`,
      'Polarization',
      antenna.state.polarization,
      '°'
    );

    // Inject HTML
    container.innerHTML = `
      ${this.azFineControl_.html}
      ${this.elFineControl_.html}
      ${this.polFineControl_.html}
    `;

    // Add event listeners - use staging methods so changes require Apply button
    this.azFineControl_.addEventListeners((delta) => {
      antenna.stageAzimuthChange(delta);
    });

    this.elFineControl_.addEventListeners((delta) => {
      antenna.stageElevationChange(delta);
    });

    this.polFineControl_.addEventListeners((delta) => {
      antenna.stagePolarizationChange(delta);
    });
  }

  private initApplyCancelButtons_(antenna: typeof this.groundStation.antennas[0]): void {
    const applyBtn = this.qs_<HTMLButtonElement>('apply-changes-btn');
    const cancelBtn = this.qs_<HTMLButtonElement>('discard-changes-btn');

    if (!applyBtn || !cancelBtn) return;

    const applyHandler = () => {
      antenna.applyChanges();
    };
    this.addHandler_('apply-btn', applyBtn, 'click', applyHandler);

    const cancelHandler = () => {
      antenna.discardChanges();
    };
    this.addHandler_('cancel-btn', cancelBtn, 'click', cancelHandler);
  }

  private initTrackingModeSelector_(antenna: typeof this.groundStation.antennas[0]): void {
    const buttons = this.qsa_('btn-tracking');
    buttons.forEach((btn, index) => {
      const handler = () => {
        const mode = (btn as HTMLElement).dataset.mode as TrackingMode;

        // Clear active target when leaving program-track mode
        if (antenna.state.trackingMode === 'program-track' && mode !== 'program-track') {
          this.activeTargetSatelliteId_ = null;
        }

        antenna.handleTrackingModeChange(mode);
      };
      this.addHandler_(`tracking-mode-${index}`, btn, 'click', handler);
    });
  }

  private initSatelliteDropdown_(antenna: typeof this.groundStation.antennas[0]): void {
    const select = this.qs_<HTMLSelectElement>('satellite-select');
    const moveBtn = this.qs_<HTMLButtonElement>('move-to-target-btn');

    if (!select || !moveBtn) return;

    // Initialize active target from current state
    this.activeTargetSatelliteId_ = antenna.state.targetSatelliteId;

    // Populate satellite dropdown
    const satellites = SimulationManager.getInstance().satellites;
    select.innerHTML = '<option value="">-- Select Satellite --</option>' +
      satellites.map(sat =>
        `<option value="${sat.noradId}">${sat.name}</option>`
      ).join('');

    // Handle selection change
    const selectHandler = () => {
      const noradId = parseInt(select.value) || null;
      antenna.handleTargetSatelliteChange(noradId);
      moveBtn.disabled = noradId === null;
    };
    this.addHandler_('satellite-select', select, 'change', selectHandler);

    // Handle move button
    const moveHandler = () => {
      this.activeTargetSatelliteId_ = antenna.state.targetSatelliteId;
      antenna.moveToTargetSatellite();
    };
    this.addHandler_('move-to-target', moveBtn, 'click', moveHandler);
  }

  private initBeaconControls_(antenna: typeof this.groundStation.antennas[0]): void {
    const freqInput = this.qs_<HTMLInputElement>('beacon-freq');
    const bwInput = this.qs_<HTMLInputElement>('beacon-search-bw');

    if (!freqInput || !bwInput) return;

    // Set initial values
    freqInput.value = (antenna.state.beaconFrequencyHz / 1e6).toString();
    bwInput.value = (antenna.state.beaconSearchBwHz / 1e3).toString();

    // Handle frequency change - use staging method
    const freqHandler = () => {
      const freqMHz = parseLocalizedNumber(freqInput.value);
      if (!isNaN(freqMHz)) {
        antenna.stageBeaconFrequencyChange(freqMHz * 1e6);
      }
    };
    this.addHandler_('beacon-freq', freqInput, 'change', freqHandler);

    // Handle bandwidth change - use staging method
    const bwHandler = () => {
      const bwKHz = parseLocalizedNumber(bwInput.value);
      if (!isNaN(bwKHz)) {
        antenna.stageBeaconSearchBwChange(bwKHz * 1e3);
      }
    };
    this.addHandler_('beacon-bw', bwInput, 'change', bwHandler);

    // Handle step track toggle button
    const toggleBtn = this.qs_<HTMLButtonElement>('step-track-toggle-btn');
    if (toggleBtn) {
      const toggleHandler = () => {
        if (antenna.state.isAutoTrackEnabled) {
          antenna.stopStepTrack();
        } else {
          antenna.startStepTrack();
        }
      };
      this.addHandler_('step-track-toggle', toggleBtn, 'click', toggleHandler);
    }
  }

  private initEnvironmentalControls_(antenna: typeof this.groundStation.antennas[0]): void {
    const heaterSwitch = this.qs_<HTMLInputElement>('heater-switch');
    const blowerSwitch = this.qs_<HTMLInputElement>('blower-switch');

    if (!heaterSwitch || !blowerSwitch) return;

    const heaterHandler = () => {
      antenna.handleHeaterToggle(heaterSwitch.checked);
    };
    this.addHandler_('heater-switch', heaterSwitch, 'change', heaterHandler);

    const blowerHandler = () => {
      antenna.handleRainBlowerToggle(blowerSwitch.checked);
    };
    this.addHandler_('blower-switch', blowerSwitch, 'change', blowerHandler);
  }

  private initPowerControls_(antenna: typeof this.groundStation.antennas[0]): void {
    const powerSwitch = this.qs_<HTMLInputElement>('power-switch');
    const loopbackSwitch = this.qs_<HTMLInputElement>('loopback-switch');

    if (powerSwitch) {
      const powerHandler = () => {
        antenna.handlePowerToggle(powerSwitch.checked);
      };
      this.addHandler_('power-switch', powerSwitch, 'change', powerHandler);
    }

    if (loopbackSwitch) {
      const loopbackHandler = () => {
        antenna.handleLoopbackToggle(loopbackSwitch.checked);
      };
      this.addHandler_('loopback-switch', loopbackSwitch, 'change', loopbackHandler);
    }
  }

  private syncUiWithState_(antenna: typeof this.groundStation.antennas[0]): void {
    const state = antenna.state;

    // Sync ACU identification
    const modelEl = this.qs_('model');
    const serialEl = this.qs_('serial');
    if (modelEl) modelEl.textContent = state.acuModel;
    if (serialEl) serialEl.textContent = `(${state.acuSerialNumber})`;

    // Sync tracking mode buttons
    const modeButtons = this.qsa_('btn-tracking');
    modeButtons.forEach(btn => {
      const mode = (btn as HTMLElement).dataset.mode;
      btn.classList.toggle('active', mode === state.trackingMode);
    });

    // Show/hide tracking sections based on mode
    const programSection = this.qs_('program-track-section');
    const stepSection = this.qs_('step-track-section');
    const manualSection = this.qs_('manual-section');
    const beaconDisplaySection = this.qs_('beacon-display-section');

    if (programSection) programSection.style.display = state.trackingMode === 'program-track' ? 'block' : 'none';
    if (stepSection) stepSection.style.display = state.trackingMode === 'step-track' ? 'block' : 'none';
    if (manualSection) manualSection.style.display = ['manual', 'stow', 'maintenance'].includes(state.trackingMode) ? 'block' : 'none';
    // Beacon C/N display visible in active tracking modes (not stow/maintenance)
    if (beaconDisplaySection) beaconDisplaySection.style.display = ['manual', 'program-track', 'step-track'].includes(state.trackingMode) ? 'block' : 'none';

    // Update tracking mode display
    const modeDisplay = this.qs_('tracking-mode-display');
    if (modeDisplay) modeDisplay.textContent = state.trackingMode.toUpperCase().replace('-', ' ');

    // Update lock status
    const lockDisplay = this.qs_('lock-status-display');
    if (lockDisplay) {
      lockDisplay.textContent = state.isLocked || state.isBeaconLocked ? 'LOCKED' : 'UNLOCKED';
      lockDisplay.classList.toggle('text-success', state.isLocked || state.isBeaconLocked);
    }

    // Update signals count
    const signalsDisplay = this.qs_('signals-count-display');
    if (signalsDisplay) signalsDisplay.textContent = state.rxSignalsIn.length.toString();

    // Sync fine adjustment controls with actual position and staged values
    // Red (active) = current position (matches polar plot), Amber (pending) = staged changes
    this.azFineControl_?.sync(state.azimuth, state.stagedTargetAzimuth);
    this.elFineControl_?.sync(state.elevation, state.stagedTargetElevation);
    this.polFineControl_?.sync(state.polarization, state.stagedTargetPolarization);

    // Enable/disable fine controls based on mode
    const isManualMode = state.trackingMode === 'manual';
    this.azFineControl_?.setEnabled(isManualMode && state.isPowered);
    this.elFineControl_?.setEnabled(isManualMode && state.isPowered);
    this.polFineControl_?.setEnabled(state.isPowered);

    // Update Apply/Cancel button states
    const applyBtn = this.qs_<HTMLButtonElement>('apply-changes-btn');
    const cancelBtn = this.qs_<HTMLButtonElement>('discard-changes-btn');
    if (applyBtn) applyBtn.disabled = !state.hasStagedChanges;
    if (cancelBtn) cancelBtn.disabled = !state.hasStagedChanges;

    // Display fault message if present
    const faultEl = this.qs_('fault-message');
    if (faultEl) {
      if (state.hasFault && state.faultMessage) {
        faultEl.textContent = state.faultMessage;
        faultEl.style.display = 'block';
      } else {
        faultEl.style.display = 'none';
      }
    }

    // Beacon C/N display is updated by syncBeaconMetrics_() on each UPDATE event

    // Update step track toggle button
    const stepTrackBtn = this.qs_<HTMLButtonElement>('step-track-toggle-btn');
    if (stepTrackBtn) {
      if (state.isAutoTrackEnabled && state.trackingMode === 'step-track') {
        stepTrackBtn.textContent = 'STOP TRACKING';
        stepTrackBtn.classList.remove('btn-primary');
        stepTrackBtn.classList.add('btn-danger');
      } else {
        stepTrackBtn.textContent = 'START TRACKING';
        stepTrackBtn.classList.remove('btn-danger');
        stepTrackBtn.classList.add('btn-primary');
      }
    }

    // Sync environmental controls
    const heaterLed = this.qs_('heater-led');
    const blowerLed = this.qs_('blower-led');
    const heaterSwitch = this.qs_<HTMLInputElement>('heater-switch');
    const blowerSwitch = this.qs_<HTMLInputElement>('blower-switch');

    if (heaterLed) {
      heaterLed.className = `led ${state.isHeaterEnabled ? 'led-amber' : 'led-off'}`;
    }
    if (blowerLed) {
      blowerLed.className = `led ${state.isRainBlowerEnabled ? 'led-green' : 'led-off'}`;
    }
    if (heaterSwitch) heaterSwitch.checked = state.isHeaterEnabled;
    if (blowerSwitch) blowerSwitch.checked = state.isRainBlowerEnabled;

    // Sync power switch
    const powerSwitch = this.qs_<HTMLInputElement>('power-switch');
    if (powerSwitch) powerSwitch.checked = state.isPowered;

    // Sync ACU status LED
    const statusLed = this.qs_('status-led');
    if (statusLed) {
      if (!state.isPowered) {
        statusLed.className = 'led led-off ms-2';
      } else if (!state.isOperational) {
        statusLed.className = 'led led-amber ms-2';
      } else {
        statusLed.className = 'led led-green ms-2';
      }
    }

    // Sync loopback switch
    const loopbackSwitch = this.qs_<HTMLInputElement>('loopback-switch');
    if (loopbackSwitch) loopbackSwitch.checked = state.isLoopback;

    // Precipitation status is synced by syncIceAccumulation_() using WeatherManager

    // Sync context panel title based on tracking mode
    const contextTitle = this.qs_('context-panel-title');
    if (contextTitle) {
      switch (state.trackingMode) {
        case 'program-track':
          contextTitle.textContent = 'Program Track';
          break;
        case 'step-track':
          contextTitle.textContent = 'Step Track';
          break;
        default:
          contextTitle.textContent = 'Tracking';
      }
    }

    // Sync move-to-target button disabled state
    const moveToTargetBtn = this.qs_<HTMLButtonElement>('move-to-target-btn');
    if (moveToTargetBtn) {
      moveToTargetBtn.disabled = state.trackingMode !== 'program-track' || state.targetSatelliteId === null;
    }

    // Sync satellite dropdown selection (skip if user is interacting)
    const satelliteSelect = this.qs_<HTMLSelectElement>('satellite-select');
    if (satelliteSelect && document.activeElement !== satelliteSelect) {
      satelliteSelect.value = state.targetSatelliteId?.toString() ?? '';
    }

    // Sync current target display (only shows active target, not dropdown selection)
    const currentTargetDisplay = this.qs_<HTMLInputElement>('current-target-display');
    if (currentTargetDisplay) {
      const satellite = this.activeTargetSatelliteId_ === null
        ? null
        : SimulationManager.getInstance().satellites.find(
            sat => sat.noradId === this.activeTargetSatelliteId_
          );
      currentTargetDisplay.value = satellite?.name ?? 'No Target';
    }

    // Sync beacon frequency input (skip if user is typing)
    const beaconFreqInput = this.qs_<HTMLInputElement>('beacon-freq');
    if (beaconFreqInput && document.activeElement !== beaconFreqInput) {
      const freqMHz = (state.stagedBeaconFrequencyHz ?? state.beaconFrequencyHz) / 1e6;
      beaconFreqInput.value = freqMHz.toString();
    }

    // Sync beacon search bandwidth input (skip if user is typing)
    const beaconBwInput = this.qs_<HTMLInputElement>('beacon-search-bw');
    if (beaconBwInput && document.activeElement !== beaconBwInput) {
      const bwKHz = (state.stagedBeaconSearchBwHz ?? state.beaconSearchBwHz) / 1e3;
      beaconBwInput.value = bwKHz.toString();
    }

    // Sync RF metrics display
    this.syncRfMetrics_(antenna);
  }

  private syncRfMetrics_(antenna: typeof this.groundStation.antennas[0]): void {
    const metrics = antenna.state.rfMetrics;
    if (!metrics) return;

    const freqEl = this.qs_('rf-metric-freq');
    const gainEl = this.qs_('rf-metric-gain');
    const bwEl = this.qs_('rf-metric-beamwidth');
    const gtEl = this.qs_('rf-metric-gt');
    const polLossEl = this.qs_('rf-metric-pol-loss');
    const skyTempEl = this.qs_('rf-metric-sky-temp');

    if (freqEl) freqEl.textContent = `${metrics.frequency_GHz.toFixed(3)} GHz`;
    if (gainEl) gainEl.textContent = `${metrics.gain_dBi.toFixed(1)} dBi`;
    if (bwEl) bwEl.textContent = `${metrics.beamwidth_deg.toFixed(2)}°`;
    if (gtEl) gtEl.textContent = `${metrics.gOverT_dBK.toFixed(1)} dB/K`;
    if (polLossEl) polLossEl.textContent = `${metrics.polLoss_dB.toFixed(1)} dB`;
    if (skyTempEl) skyTempEl.textContent = `${metrics.skyTemp_K.toFixed(0)} K`;
  }

  private syncBeaconMetrics_(antenna: typeof this.groundStation.antennas[0]): void {
    const state = antenna.state;

    const beaconCnEl = this.qs_('beacon-cn-value');
    const beaconFillEl = this.qs_<HTMLElement>('beacon-strength-fill');
    const beaconLockEl = this.qs_('beacon-lock-status');

    if (beaconCnEl) {
      beaconCnEl.textContent = state.beaconCN !== null ? `${state.beaconCN.toFixed(1)} dB` : '-- dB';
    }
    if (beaconFillEl) {
      if (state.beaconCN !== null) {
        const percent = Math.max(0, Math.min(100, (state.beaconCN / 30) * 100));
        beaconFillEl.style.width = `${percent}%`;

        beaconFillEl.classList.remove('cn-red', 'cn-amber', 'cn-green');
        if (state.beaconCN < 5) {
          beaconFillEl.classList.add('cn-red');
        } else if (state.beaconCN < 10) {
          beaconFillEl.classList.add('cn-amber');
        } else {
          beaconFillEl.classList.add('cn-green');
        }
      } else {
        beaconFillEl.style.width = '0%';
        beaconFillEl.classList.remove('cn-red', 'cn-amber', 'cn-green');
      }
    }
    if (beaconLockEl) {
      // Lock status depends on tracking mode
      if (state.trackingMode === 'step-track') {
        // Step-track mode: IDLE (tracking off), SEARCHING (tracking on), LOCKED
        if (!state.isAutoTrackEnabled) {
          beaconLockEl.textContent = 'IDLE';
          beaconLockEl.classList.remove('text-success');
        } else if (state.isBeaconLocked) {
          beaconLockEl.textContent = 'LOCKED';
          beaconLockEl.classList.add('text-success');
        } else {
          beaconLockEl.textContent = 'SEARCHING';
          beaconLockEl.classList.remove('text-success');
        }
      } else {
        // Manual/Program-track mode: UNLOCKED or LOCKED based on C/N
        if (state.isBeaconLocked) {
          beaconLockEl.textContent = 'LOCKED';
          beaconLockEl.classList.add('text-success');
        } else {
          beaconLockEl.textContent = 'UNLOCKED';
          beaconLockEl.classList.remove('text-success');
        }
      }
    }
  }

  private syncIceAccumulation_(antenna: typeof this.groundStation.antennas[0]): void {
    const iceDisplay = this.qs_('ice-accumulation-display');
    if (iceDisplay) {
      const ice = antenna.state.iceAccumulation_dB;
      iceDisplay.textContent = `${ice.toFixed(1)} dB`;

      // Color code based on severity
      iceDisplay.classList.remove('text-success', 'text-warning', 'text-danger');
      if (ice >= 5) {
        iceDisplay.classList.add('text-danger');
      } else if (ice >= 2) {
        iceDisplay.classList.add('text-warning');
      } else if (ice > 0) {
        iceDisplay.classList.add('text-success');
      }
    }

    // Update precipitation status based on weather manager
    const precipStatus = this.qs_('precip-status');
    if (precipStatus) {
      const gsId = this.groundStation.state.id;
      const isPrecip = WeatherManager.getInstance().isPrecipitationActive(gsId);
      const led = precipStatus.querySelector('.led');
      if (led) led.className = `led ${isPrecip ? 'led-amber' : 'led-off'} me-1`;
      const textNode = precipStatus.childNodes[precipStatus.childNodes.length - 1];
      if (textNode) textNode.textContent = isPrecip ? 'ACTIVE' : 'CLEAR';
    }
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
    // Remove all tracked event listeners
    this.boundHandlers_.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.boundHandlers_.clear();

    // Remove EventBus listeners
    if (this.antennaStateHandler_) {
      EventBus.getInstance().off(Events.UPDATE, this.antennaStateHandler_);
      this.antennaStateHandler_ = null;
    }
    if (this.drawHandler_) {
      EventBus.getInstance().off(Events.DRAW, this.drawHandler_);
      this.drawHandler_ = null;
    }
    if (this.updateHandler_) {
      EventBus.getInstance().off(Events.UPDATE, this.updateHandler_);
      this.updateHandler_ = null;
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
