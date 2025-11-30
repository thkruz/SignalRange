import { GroundStation } from '@app/assets/ground-station/ground-station';
import { BaseElement } from '@app/components/base-element';
import { FineAdjustControl } from '@app/components/fine-adjust-control/fine-adjust-control';
import { PolarPlot } from '@app/components/polar-plot/polar-plot';
import { html } from '@app/engine/utils/development/formatter';
import { qs, qsa } from '@app/engine/utils/query-selector';
import { TrackingMode } from '@app/equipment/antenna/antenna-core';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SimulationManager } from '@app/simulation/simulation-manager';
import './acu-control-tab.css';
import { AntennaAdapter } from './antenna-adapter';
import { OMTAdapter } from './omt-adapter';

/**
 * ACUControlTab - Antenna Control Unit tab for ground station equipment
 *
 * Displays:
 * - ACU identification (model, serial number)
 * - Tracking mode selector (Stow, Maintenance, Manual, Program Track, Step Track)
 * - Antenna controls (azimuth, elevation, polarization) with fine adjustment buttons
 * - Beacon tracking controls (frequency, search bandwidth)
 * - Environmental controls (heater, rain blower, precipitation sensor)
 * - OMT/Duplexer status
 * - RF metrics
 *
 * Uses adapters to bridge equipment Core classes to modern web controls
 */
export class ACUControlTab extends BaseElement {
  private readonly groundStation: GroundStation;
  private antennaAdapter: AntennaAdapter | null = null;
  private omtAdapter: OMTAdapter | null = null;
  private polarPlot_: PolarPlot | null = null;
  private antennaStateHandler_: (() => void) | null = null;

  // Fine adjustment controls
  private azFineControl_: FineAdjustControl | null = null;
  private elFineControl_: FineAdjustControl | null = null;
  private polFineControl_: FineAdjustControl | null = null;

  protected html_ = html`
    <div class="acu-control-tab">
      <!-- ACU Header: Identification + Tracking Mode -->
      <div class="card mb-3 acu-header-card">
        <div class="card-body py-2">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <!-- ACU Identification -->
            <div class="acu-identification">
              <span id="acu-model" class="acu-model">Kratos NGC-2200</span>
              <span id="acu-serial" class="acu-serial">(ACU-01)</span>
              <span id="acu-status-led" class="led led-green ms-2"></span>
            </div>

            <!-- Tracking Mode Selector -->
            <div class="tracking-mode-selector btn-group" role="group" aria-label="Tracking mode selection">
              <button type="button" class="btn btn-tracking" data-mode="stow">STOW</button>
              <button type="button" class="btn btn-tracking" data-mode="maintenance">MAINT</button>
              <button type="button" class="btn btn-tracking active" data-mode="manual">MANUAL</button>
              <button type="button" class="btn btn-tracking" data-mode="program-track">PROGRAM</button>
              <button type="button" class="btn btn-tracking" data-mode="step-track">STEP</button>
            </div>

            <!-- Power & Loopback -->
            <div class="d-flex gap-3">
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" role="switch" id="power-switch" checked>
                <label class="form-check-label" for="power-switch">Power</label>
              </div>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" role="switch" id="loopback-switch">
                <label class="form-check-label" for="loopback-switch">Loopback</label>
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
              <div id="polar-plot-container"></div>
            </div>
          </div>
        </div>

        <!-- Antenna Positioning Controls -->
        <div class="col-xl-5">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title mb-0">Antenna Positioning</h3>
              <div class="d-flex gap-2">
                <button id="discard-changes-btn" class="btn btn-sm btn-secondary" disabled>CANCEL</button>
                <button id="apply-changes-btn" class="btn btn-sm btn-apply" disabled>APPLY</button>
              </div>
            </div>
            <div class="card-body">
              <!-- Fine adjustment controls will be injected here -->
              <div id="fine-adjust-container"></div>
              <!-- Fault message display -->
              <div id="fault-message" class="alert alert-danger mt-2" style="display: none;"></div>
            </div>
          </div>
        </div>

        <!-- Context-Aware Panel (Beacon/Satellite) -->
        <div class="col-xl-4">
          <div class="card h-100">
            <div class="card-header">
              <h3 class="card-title" id="context-panel-title">Tracking</h3>
            </div>
            <div class="card-body">
              <!-- Program Track: Satellite Selection -->
              <div id="program-track-section" class="tracking-section" style="display: none;">
                <div class="mb-3">
                  <label for="satellite-select" class="form-label">Target Satellite</label>
                  <select id="satellite-select" class="form-select">
                    <option value="">-- Select Satellite --</option>
                  </select>
                </div>
                <button id="move-to-target-btn" class="btn btn-primary w-100" disabled>
                  Move to Target
                </button>
              </div>

              <!-- Step Track: Beacon Controls -->
              <div id="step-track-section" class="tracking-section" style="display: none;">
                <div class="mb-3">
                  <label class="form-label">Beacon Frequency</label>
                  <div class="input-group">
                    <input type="number" class="form-control font-monospace" id="beacon-freq"
                           value="3948" step="0.1" min="1000" max="50000">
                    <span class="input-group-text">MHz</span>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Search Bandwidth</label>
                  <div class="input-group">
                    <input type="number" class="form-control font-monospace" id="beacon-search-bw"
                           value="500" step="50" min="100" max="2000">
                    <span class="input-group-text">kHz</span>
                  </div>
                </div>
                <button id="step-track-toggle-btn" class="btn btn-primary w-100 mb-3">
                  START TRACKING
                </button>
                <div class="beacon-strength-container">
                  <label class="form-label">Beacon Signal</label>
                  <div class="beacon-strength-bar">
                    <div class="beacon-strength-fill" id="beacon-strength-fill"></div>
                    <span class="beacon-strength-value" id="beacon-power-value">-- dBm</span>
                  </div>
                  <div class="d-flex justify-content-between mt-1">
                    <span class="text-muted small">Lock Status:</span>
                    <span id="beacon-lock-status" class="fw-bold">--</span>
                  </div>
                </div>
              </div>

              <!-- Manual/Stow/Maintenance: Status Info -->
              <div id="manual-section" class="tracking-section">
                <div class="status-info">
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Mode:</span>
                    <span id="tracking-mode-display" class="fw-bold font-monospace">MANUAL</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Lock Status:</span>
                    <span id="lock-status-display" class="fw-bold">UNLOCKED</span>
                  </div>
                  <div class="d-flex justify-content-between">
                    <span class="text-muted">Signals:</span>
                    <span id="signals-count-display" class="fw-bold font-monospace">0</span>
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
                  <span id="heater-led" class="led led-off"></span>
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="heater-switch">
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <span class="fw-bold">Rain Blower</span>
                  <div class="text-muted small">Clears radome</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span id="blower-led" class="led led-off"></span>
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="blower-switch">
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                <span class="text-muted small">Precipitation:</span>
                <span id="precip-status" class="fw-bold">
                  <span class="led led-off me-1"></span>CLEAR
                </span>
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
                    <div id="rf-metric-freq" class="rf-metric-value">-- GHz</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">Gain</div>
                    <div id="rf-metric-gain" class="rf-metric-value">-- dBi</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">HPBW</div>
                    <div id="rf-metric-beamwidth" class="rf-metric-value">-- deg</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">G/T</div>
                    <div id="rf-metric-gt" class="rf-metric-value">-- dB/K</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">Pol Loss</div>
                    <div id="rf-metric-pol-loss" class="rf-metric-value">-- dB</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="rf-metric-box">
                    <div class="rf-metric-label">Sky Temp</div>
                    <div id="rf-metric-sky-temp" class="rf-metric-value">-- K</div>
                  </div>
                </div>
              </div>
            </div>
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

    // Create and initialize polar plot
    this.polarPlot_ = PolarPlot.create(
      `polar-plot-${this.groundStation.uuid}`,
      { width: 300, height: 300, showGrid: true, showLabels: true }
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
      this.syncUiWithState_(antenna);
    };
    EventBus.getInstance().on(Events.ANTENNA_STATE_CHANGED, this.antennaStateHandler_);

    // Initial draw and sync
    this.polarPlot_.onDomReady();
    this.polarPlot_.draw(antenna.state.azimuth, antenna.state.elevation);
    this.syncUiWithState_(antenna);
  }

  private initFineAdjustControls_(antenna: typeof this.groundStation.antennas[0]): void {
    const container = qs('#fine-adjust-container', this.dom_);
    if (!container) return;

    // Create fine adjustment controls with ACTUAL position values
    // Red display shows current position (matches polar plot)
    this.azFineControl_ = FineAdjustControl.create(
      `az-fine-${this.groundStation.uuid}`,
      'Azimuth',
      antenna.state.azimuth,
      '°'
    );

    this.elFineControl_ = FineAdjustControl.create(
      `el-fine-${this.groundStation.uuid}`,
      'Elevation',
      antenna.state.elevation,
      '°'
    );

    this.polFineControl_ = FineAdjustControl.create(
      `pol-fine-${this.groundStation.uuid}`,
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
    const applyBtn = qs('#apply-changes-btn', this.dom_) as HTMLButtonElement;
    const cancelBtn = qs('#discard-changes-btn', this.dom_) as HTMLButtonElement;

    if (!applyBtn || !cancelBtn) return;

    applyBtn.addEventListener('click', () => {
      antenna.applyChanges();
    });

    cancelBtn.addEventListener('click', () => {
      antenna.discardChanges();
    });
  }

  private initTrackingModeSelector_(antenna: typeof this.groundStation.antennas[0]): void {
    const buttons = qsa('.btn-tracking', this.dom_);
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as TrackingMode;
        antenna.handleTrackingModeChange(mode);
      });
    });
  }

  private initSatelliteDropdown_(antenna: typeof this.groundStation.antennas[0]): void {
    const select = qs('#satellite-select', this.dom_) as HTMLSelectElement;
    const moveBtn = qs('#move-to-target-btn', this.dom_) as HTMLButtonElement;

    if (!select || !moveBtn) return;

    // Populate satellite dropdown
    const satellites = SimulationManager.getInstance().satellites;
    select.innerHTML = '<option value="">-- Select Satellite --</option>' +
      satellites.map(sat =>
        `<option value="${sat.noradId}">${sat.noradId} (Az: ${sat.az.toFixed(1)}°, El: ${sat.el.toFixed(1)}°)</option>`
      ).join('');

    // Handle selection change
    select.addEventListener('change', () => {
      const noradId = parseInt(select.value) || null;
      antenna.handleTargetSatelliteChange(noradId);
      moveBtn.disabled = noradId === null;
    });

    // Handle move button
    moveBtn.addEventListener('click', () => {
      antenna.moveToTargetSatellite();
    });
  }

  private initBeaconControls_(antenna: typeof this.groundStation.antennas[0]): void {
    const freqInput = qs('#beacon-freq', this.dom_) as HTMLInputElement;
    const bwInput = qs('#beacon-search-bw', this.dom_) as HTMLInputElement;

    if (!freqInput || !bwInput) return;

    // Set initial values
    freqInput.value = (antenna.state.beaconFrequencyHz / 1e6).toString();
    bwInput.value = (antenna.state.beaconSearchBwHz / 1e3).toString();

    // Handle frequency change - use staging method
    freqInput.addEventListener('change', () => {
      const freqMHz = parseFloat(freqInput.value);
      if (!isNaN(freqMHz)) {
        antenna.stageBeaconFrequencyChange(freqMHz * 1e6);
      }
    });

    // Handle bandwidth change - use staging method
    bwInput.addEventListener('change', () => {
      const bwKHz = parseFloat(bwInput.value);
      if (!isNaN(bwKHz)) {
        antenna.stageBeaconSearchBwChange(bwKHz * 1e3);
      }
    });

    // Handle step track toggle button
    const toggleBtn = qs('#step-track-toggle-btn', this.dom_) as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (antenna.state.isAutoTrackEnabled) {
          antenna.stopStepTrack();
        } else {
          antenna.startStepTrack();
        }
      });
    }
  }

  private initEnvironmentalControls_(antenna: typeof this.groundStation.antennas[0]): void {
    const heaterSwitch = qs('#heater-switch', this.dom_) as HTMLInputElement;
    const blowerSwitch = qs('#blower-switch', this.dom_) as HTMLInputElement;

    if (!heaterSwitch || !blowerSwitch) return;

    heaterSwitch.addEventListener('change', () => {
      antenna.handleHeaterToggle(heaterSwitch.checked);
    });

    blowerSwitch.addEventListener('change', () => {
      antenna.handleRainBlowerToggle(blowerSwitch.checked);
    });
  }

  private syncUiWithState_(antenna: typeof this.groundStation.antennas[0]): void {
    const state = antenna.state;

    // Sync ACU identification
    const modelEl = qs('#acu-model', this.dom_);
    const serialEl = qs('#acu-serial', this.dom_);
    if (modelEl) modelEl.textContent = state.acuModel;
    if (serialEl) serialEl.textContent = `(${state.acuSerialNumber})`;

    // Sync tracking mode buttons
    const modeButtons = qsa('.btn-tracking', this.dom_);
    modeButtons.forEach(btn => {
      const mode = (btn as HTMLElement).dataset.mode;
      btn.classList.toggle('active', mode === state.trackingMode);
    });

    // Show/hide tracking sections based on mode
    const programSection = qs('#program-track-section', this.dom_);
    const stepSection = qs('#step-track-section', this.dom_);
    const manualSection = qs('#manual-section', this.dom_);

    if (programSection) programSection.style.display = state.trackingMode === 'program-track' ? 'block' : 'none';
    if (stepSection) stepSection.style.display = state.trackingMode === 'step-track' ? 'block' : 'none';
    if (manualSection) manualSection.style.display = ['manual', 'stow', 'maintenance'].includes(state.trackingMode) ? 'block' : 'none';

    // Update tracking mode display
    const modeDisplay = qs('#tracking-mode-display', this.dom_);
    if (modeDisplay) modeDisplay.textContent = state.trackingMode.toUpperCase().replace('-', ' ');

    // Update lock status
    const lockDisplay = qs('#lock-status-display', this.dom_);
    if (lockDisplay) {
      lockDisplay.textContent = state.isLocked || state.isBeaconLocked ? 'LOCKED' : 'UNLOCKED';
      lockDisplay.classList.toggle('text-success', state.isLocked || state.isBeaconLocked);
    }

    // Update signals count
    const signalsDisplay = qs('#signals-count-display', this.dom_);
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
    const applyBtn = qs('#apply-changes-btn', this.dom_) as HTMLButtonElement;
    const cancelBtn = qs('#discard-changes-btn', this.dom_) as HTMLButtonElement;
    if (applyBtn) applyBtn.disabled = !state.hasStagedChanges;
    if (cancelBtn) cancelBtn.disabled = !state.hasStagedChanges;

    // Display fault message if present
    const faultEl = qs('#fault-message', this.dom_);
    if (faultEl) {
      if (state.hasFault && state.faultMessage) {
        faultEl.textContent = state.faultMessage;
        faultEl.style.display = 'block';
      } else {
        faultEl.style.display = 'none';
      }
    }

    // Sync beacon power display
    const beaconPowerEl = qs('#beacon-power-value', this.dom_);
    const beaconFillEl = qs('#beacon-strength-fill', this.dom_);
    const beaconLockEl = qs('#beacon-lock-status', this.dom_);

    if (beaconPowerEl && state.beaconPower !== null) {
      beaconPowerEl.textContent = `${state.beaconPower.toFixed(1)} dBm`;
    }
    if (beaconFillEl && state.beaconPower !== null) {
      // Map -120 to -40 dBm to 0-100%
      const percent = Math.max(0, Math.min(100, ((state.beaconPower + 120) / 80) * 100));
      (beaconFillEl as HTMLElement).style.width = `${percent}%`;
    }
    if (beaconLockEl) {
      beaconLockEl.textContent = state.isBeaconLocked ? 'LOCKED' : 'SEARCHING';
      beaconLockEl.classList.toggle('text-success', state.isBeaconLocked);
    }

    // Update step track toggle button
    const stepTrackBtn = qs('#step-track-toggle-btn', this.dom_) as HTMLButtonElement;
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
    const heaterLed = qs('#heater-led', this.dom_);
    const blowerLed = qs('#blower-led', this.dom_);
    const heaterSwitch = qs('#heater-switch', this.dom_) as HTMLInputElement;
    const blowerSwitch = qs('#blower-switch', this.dom_) as HTMLInputElement;

    if (heaterLed) {
      heaterLed.className = `led ${state.isHeaterEnabled ? 'led-amber' : 'led-off'}`;
    }
    if (blowerLed) {
      blowerLed.className = `led ${state.isRainBlowerEnabled ? 'led-green' : 'led-off'}`;
    }
    if (heaterSwitch) heaterSwitch.checked = state.isHeaterEnabled;
    if (blowerSwitch) blowerSwitch.checked = state.isRainBlowerEnabled;

    // Sync power switch
    const powerSwitch = qs('#power-switch', this.dom_) as HTMLInputElement;
    if (powerSwitch) powerSwitch.checked = state.isPowered;

    // Sync ACU status LED
    const statusLed = qs('#acu-status-led', this.dom_);
    if (statusLed) {
      if (!state.isPowered) {
        statusLed.className = 'led led-off ms-2';
      } else if (!state.isOperational) {
        statusLed.className = 'led led-amber ms-2';
      } else {
        statusLed.className = 'led led-green ms-2';
      }
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
