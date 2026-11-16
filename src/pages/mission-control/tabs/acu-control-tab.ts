import { GroundStation } from '@app/assets/ground-station/ground-station';
import { BaseElement } from '@app/components/base-element';
import { FineAdjustControl } from '@app/components/fine-adjust-control/fine-adjust-control';
import { PolarPlot } from '@app/components/polar-plot/polar-plot';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { TrackingMode } from '@app/equipment/antenna/antenna-core';
import { antennaLockLabel, trackingModeLabel } from '@app/equipment/antenna/tracking-mode-label';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { EventAutoLogger } from '@app/ops-log/event-auto-logger';
import { stationTagForAntennaState } from '@app/ops-log/station-tag';
import { AlarmService } from '@app/services/alarm-service';
import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { parseLocalizedNumber } from '@app/utils/parse-number';
import { WeatherManager } from '@app/weather/weather-manager';
import { alarmLed, applyAlarmLed } from '../alarm-led';
import { wrapAzimuthDeg } from '../az-display';
import './acu-control-tab.css';
import { SatellitePicker } from '../satellite-picker';
import { AntennaAdapter } from './antenna-adapter';
import { OMTAdapter } from './omt-adapter';

/**
 * ACUControlTab - Antenna Control Unit tab for ground station equipment
 *
 * Displays:
 * - ACU identification (model, serial number, antenna info)
 * - Tracking mode selector (Stow, Maintenance, Manual, Program Track)
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

  /** Pattern loss within which a satellite counts as inside the beam, dB (about 0.9 of the -3 dB beamwidth off axis) */
  static readonly IN_BEAM_MAX_LOSS_DB = 10;

  /**
   * Carriers the dish hears from satellites inside its main beam, locked or
   * not. Sidelobe pickup (a big dish parked at El 5 still hears GEO carriers
   * above its detection floor) is not "in view": parked off the satellite
   * this reads 0, as the Dashboard's Signals count does (nats-r5-s11-F1).
   */
  static signalsInBeam(antenna: GroundStation['antennas'][number]): number {
    const heard = antenna.state.rxSignalsIn;
    if (heard.length === 0) return 0;
    const inBeam = new Set<string>();
    for (const { signal, view } of antenna.rxSignals) {
      if (antenna.pointingLossDb(view.az, view.el, signal.frequency) <= ACUControlTab.IN_BEAM_MAX_LOSS_DB) inBeam.add(signal.signalId);
    }
    return heard.filter((s) => inBeam.has(s.signalId)).length;
  }

  /** ICE ON FEED warning / error levels, dB (AntennaCore.getStatusAlarms) */
  private static readonly ICE_ON_FEED_WARNING_DB = 2;
  private static readonly ICE_ON_FEED_ERROR_DB = 5;

  /** Falling precipitation by weather event type, as the Environmental LED titles it */
  private static readonly PRECIP_LABELS_: Readonly<Record<string, string>> = { snow: 'Snow', hail: 'Hail', ice: 'Freezing rain', rain: 'Rain' };
  /** Precipitation the feed heater mitigates (it melts what would freeze on the feed) */
  private static readonly FROZEN_PRECIP_: ReadonlySet<string> = new Set(['snow', 'hail', 'ice']);

  /**
   * Scenario second (floor(SimClock.nowMs() / 1000)) the alarm-facing readouts
   * (ACU header LED, precipitation, ice, Environmental LED) last refreshed on.
   * AlarmService samples on the same boundary (Phase 33 D7, nats-r8-s20-F1),
   * so the card, the alarm tooltip and the Ops Log raise/clear lines quote one
   * value per second. NaN until the first refresh.
   */
  private lastAlarmSyncSecond_ = Number.NaN;

  // Beacon display throttling (1 second interval like other adapters)
  private static readonly BEACON_UPDATE_INTERVAL_MS = 1000;
  private lastBeaconSyncTime_: number = 0;

  // Satellite list the target dropdown was last built from (rebuilt when it changes)
  private satellitePicker_: SatellitePicker | null = null;
  /**
   * Target picked in the dropdown but not yet commanded. Like MAINT/STOW and
   * the Az/El edits (staged until APPLY), a pick moves nothing until Move to
   * Target commits it (nats-r3-s12-F3). undefined: nothing staged.
   */
  private stagedTargetId_: number | undefined = undefined;

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
              <span id="${p}status-led" class="card-alarm-led success ms-2"></span>
            </div>

            <!-- Tracking Mode Selector -->
            <div class="tracking-mode-selector btn-group" role="group" aria-label="Tracking mode selection">
              <button type="button" class="btn btn-tracking ${p}btn-tracking" data-mode="stow">STOW</button>
              <button type="button" class="btn btn-tracking ${p}btn-tracking" data-mode="maintenance">MAINT</button>
              <button type="button" class="btn btn-tracking ${p}btn-tracking active" data-mode="manual">MANUAL</button>
              <button type="button" class="btn btn-tracking ${p}btn-tracking" data-mode="program-track">PROGRAM</button>
            </div>
            <span id="${p}staged-mode-badge" class="status-badge status-badge-amber" style="display: none;" title="Staged mode: the applied mode keeps running until APPLY"></span>

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
              <!-- Program Track: Satellite Selection + Step-Track Optimization -->
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
                <div id="${p}target-staged-hint" class="form-text text-warning mb-2" style="display: none;"></div>
                <button id="${p}move-to-target-btn" class="btn btn-primary w-100" disabled>
                  Move to Target
                </button>

                <!-- Step-Track Optimization Toggle -->
                <div class="border-top pt-3 mt-3">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                      <label for="${p}step-track-toggle" class="fw-bold mb-0" style="cursor: pointer;">Step-Track Optimization</label>
                      <div class="text-muted small">Fine beacon correction</div>
                    </div>
                    <div class="form-check form-switch mb-0">
                      <input class="form-check-input" type="checkbox" id="${p}step-track-toggle">
                    </div>
                  </div>

                  <!-- LEO Warning -->
                  <div id="${p}leo-warning" class="alert alert-warning small py-2 mb-2" style="display: none;">
                    <i class="ti ti-alert-triangle me-1"></i>Not recommended for fast-moving satellites
                  </div>

                  <!-- Beacon Controls (shown when step-track enabled) -->
                  <div id="${p}beacon-controls" style="display: none;">
                    <div class="mb-2">
                      <label class="form-label small mb-1">Beacon Frequency (RF)</label>
                      <div class="input-group input-group-sm">
                        <input type="number" class="form-control font-monospace" id="${p}beacon-freq"
                               value="3948" step="0.1" min="1000" max="50000">
                        <span class="input-group-text">MHz</span>
                      </div>
                      <div class="form-text small font-monospace" id="${p}beacon-if" title="Where the beacon lands at the LNB output: |LNB LO - RF| (what the spectrum analyzer tunes to)">IF: -- MHz</div>
                    </div>
                    <div class="mb-2">
                      <label class="form-label small mb-1">Search Bandwidth</label>
                      <div class="input-group input-group-sm">
                        <input type="number" class="form-control font-monospace" id="${p}beacon-search-bw"
                               value="500" step="50" min="100" max="2000">
                        <span class="input-group-text">kHz</span>
                      </div>
                    </div>

                    <!-- Offset Display -->
                    <div class="d-flex justify-content-between small mb-1">
                      <span class="text-muted">Az Offset:</span>
                      <span id="${p}az-offset" class="font-monospace">0.000°</span>
                    </div>
                    <div class="d-flex justify-content-between small mb-2">
                      <span class="text-muted">El Offset:</span>
                      <span id="${p}el-offset" class="font-monospace">0.000°</span>
                    </div>
                    <button id="${p}clear-offsets-btn" class="btn btn-sm btn-outline-secondary w-100">
                      Clear Offsets
                    </button>
                  </div>
                </div>
              </div>

              <!-- Manual/Stow/Maintenance: Status Info -->
              <div id="${p}manual-section" class="tracking-section">
                <div class="status-info">
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Mode:</span>
                    <span id="${p}tracking-mode-display" class="fw-bold font-monospace">MANUAL</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Pointing:</span>
                    <span id="${p}lock-status-display" class="fw-bold">UNLOCKED</span>
                  </div>
                  <div class="d-flex justify-content-between">
                    <span class="text-muted" title="RF carriers from satellites inside the dish's main beam, locked or not; sidelobe pickup is not counted. The Dashboard's Signals count is locked carriers.">RF signals in view:</span>
                    <span id="${p}signals-count-display" class="fw-bold font-monospace">0</span>
                  </div>
                </div>
              </div>

              <!-- Beacon C/N Display - visible in manual and program-track modes -->
              <div id="${p}beacon-display-section" class="mt-3" style="display: none;">
                <div class="beacon-strength-container">
                  <label class="form-label" id="${p}beacon-cn-label" title="Beacon C/N in the beacon receiver's narrow tracking bandwidth: higher than the carrier C/N on the RX modem, which is measured in the carrier's full bandwidth">Beacon C/N (1 kHz)</label>
                  <div class="beacon-strength-bar">
                    <div class="beacon-strength-fill" id="${p}beacon-strength-fill"></div>
                    <span class="beacon-strength-value" id="${p}beacon-cn-value">-- dB</span>
                  </div>
                  <div class="d-flex justify-content-between mt-1">
                    <span class="text-muted small">Beacon Lock:</span>
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
                <span id="${p}omt-status" class="status-badge status-badge-green">OK</span>
              </div>
              <!-- Engineering Mode: Polarization Reversal -->
              <div id="${p}omt-engineering-controls" class="border-top pt-2 mt-2" style="display: none;">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Reverse Polarization:</span>
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" role="switch" id="${p}omt-reverse-pol">
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Environmental Controls Card -->
        <div class="col-xl-3">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title mb-0">Environmental</h3>
              <span id="${p}env-led" class="card-alarm-led off" title="Clear - no ice, no precipitation"></span>
            </div>
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <label for="${p}heater-switch" class="fw-bold mb-0" style="cursor: pointer;">Feed Heater</label>
                  <div class="text-muted small">Prevents ice, keeps the feed dry</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span id="${p}heater-led" class="card-alarm-led off" title="Heater OFF"></span>
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="${p}heater-switch">
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <label for="${p}blower-switch" class="fw-bold mb-0" style="cursor: pointer;">Rain Blower</label>
                  <div class="text-muted small">Clears radome</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span id="${p}blower-led" class="card-alarm-led off" title="Rain blower OFF"></span>
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="${p}blower-switch">
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                <span class="text-muted small">Precipitation:</span>
                <span id="${p}precip-status" class="fw-bold">
                  <span class="card-alarm-led off me-1" title="Precipitation CLEAR"></span>CLEAR
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
                    <div class="rf-metric-label" title="The tracked beacon frequency (RF) the metrics are quoted at">Beacon Freq (RF)</div>
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
  /** A beacon's IF at the LNB output, MHz: |LO - RF| (C-band LNBs run the LO above or below the band) */
  static beaconIfMHz(rfMHz: number, loMHz: number): number {
    return Math.abs(loMHz - rfMHz);
  }

  /** A measurement bandwidth as an operator reads it: 1 kHz, 300 Hz, 2.5 MHz */
  static formatBandwidth(hz: number): string {
    if (hz >= 1e6) return `${Number((hz / 1e6).toFixed(2))} MHz`;
    if (hz >= 1e3) return `${Number((hz / 1e3).toFixed(2))} kHz`;
    return `${Math.round(hz)} Hz`;
  }

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
    this.polarPlot_ = PolarPlot.create(`polar-plot-${this.groundStation.uuid}-ant${this.antennaIndex_}`, { width: 300, height: 300, showGrid: true, showLabels: true });

    // Inject polar plot HTML into container
    const polarPlotContainer = this.qs_('polar-plot-container');
    if (polarPlotContainer) {
      polarPlotContainer.innerHTML = this.polarPlot_.html;
    }

    // Wire to antenna state changes - store handler for cleanup.
    //
    // A tab instance outlives its DOM when the operator switches station: the
    // canvas replaces the content and only disposes the instance when that
    // tab is next rendered. Until then the handlers still fire every tick, so
    // each one bails while the DOM is disconnected. Painting a detached tree
    // is wasted work, and a lookup that throws here (a fine-adjust display
    // never resolved while the tab was live) escapes the game loop and stops
    // the simulation - found by the S9 unattended pass, where Galway's pedestal
    // starts moving while the Shetland console is selected.
    this.antennaStateHandler_ = () => {
      if (this.isDetached_()) return;
      if (this.polarPlot_) {
        this.polarPlot_.draw(antenna.state.azimuth, antenna.state.elevation);
      }
      this.syncUiWithState_(antenna);
      this.syncAlarmReadouts_(antenna, false);
    };
    EventBus.getInstance().on(Events.UPDATE, this.antennaStateHandler_);

    // Wire to draw events for continuous RF metrics updates
    this.drawHandler_ = () => {
      if (this.isDetached_()) return;
      this.syncRfMetrics_(antenna);
    };
    EventBus.getInstance().on(Events.DRAW, this.drawHandler_);

    // Wire to update events for beacon C/N updates (throttled to 1Hz like other adapters)
    this.updateHandler_ = () => {
      if (this.isDetached_()) return;
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
    this.syncAlarmReadouts_(antenna, true);
  }

  /**
   * The readouts AlarmService also reports on refresh once per scenario second
   * (Phase 33 D7), or at once with `force` after an operator action (heater,
   * blower, power) so the switch and its LED answer the click even while the
   * clock is paused.
   */
  private syncAlarmReadouts_(antenna: (typeof this.groundStation.antennas)[0], force: boolean): void {
    const second = Math.floor(SimClock.nowMs() / 1000);
    if (!force && second === this.lastAlarmSyncSecond_) {
      return;
    }
    this.lastAlarmSyncSecond_ = second;
    this.syncStatusLed_(antenna);
    this.syncIceAccumulation_(antenna);
  }

  /** True once the canvas has replaced this tab's DOM (stale instance awaiting disposal). */
  private isDetached_(): boolean {
    return this.dom_ !== null && !this.dom_.isConnected;
  }

  private initFineAdjustControls_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const container = this.qs_('fine-adjust-container');
    if (!container) return;

    // Create fine adjustment controls with ACTUAL position values
    // Red display shows current position (matches polar plot)
    this.azFineControl_ = FineAdjustControl.create(`az-fine-${this.groundStation.uuid}-ant${this.antennaIndex_}`, 'Azimuth', wrapAzimuthDeg(antenna.state.azimuth), '°');

    this.elFineControl_ = FineAdjustControl.create(`el-fine-${this.groundStation.uuid}-ant${this.antennaIndex_}`, 'Elevation', antenna.state.elevation, '°');

    this.polFineControl_ = FineAdjustControl.create(`pol-fine-${this.groundStation.uuid}-ant${this.antennaIndex_}`, 'Polarization', antenna.state.polarization, '°');

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

  private initApplyCancelButtons_(antenna: (typeof this.groundStation.antennas)[0]): void {
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

  private initTrackingModeSelector_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const buttons = this.qsa_('btn-tracking');
    buttons.forEach((btn, index) => {
      const handler = () => {
        const mode = (btn as HTMLElement).dataset.mode as TrackingMode;
        // STOW/MAINT stage until APPLY; MANUAL/PROGRAM switch at once.
        // handleTrackingModeChange clears state.targetSatelliteId on any mode
        // change. A staged pick is kept: it is committed by Move to Target
        antenna.stageTrackingModeChange(mode);
      };
      this.addHandler_(`tracking-mode-${index}`, btn, 'click', handler);
    });
  }

  private initSatelliteDropdown_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const select = this.qs_<HTMLSelectElement>('satellite-select');
    const moveBtn = this.qs_<HTMLButtonElement>('move-to-target-btn');

    if (!select || !moveBtn) return;

    // If a target satellite is pre-configured, set the beacon frequency from it.
    // That re-emits the antenna state, but opening a tab is not an operator
    // action and never logs (nats-r5-s07-F2)
    const preconfiguredTarget = antenna.state.targetSatelliteId;
    if (preconfiguredTarget !== null) {
      EventAutoLogger.getInstance().runWithoutLogging(() => antenna.handleTargetSatelliteChange(preconfiguredTarget));
    }

    // Populate satellite dropdown (rebuilt by syncUiWithState_ if the list changes)
    this.syncSatelliteOptions_(select, antenna.state.targetSatelliteId);

    // Handle selection change: stage the pick; Move to Target commits it
    const selectHandler = () => {
      const noradId = Number.parseInt(select.value, 10) || null;
      // Picking the placeholder or the current target unstages
      this.stagedTargetId_ = noradId === null || noradId === antenna.state.targetSatelliteId ? undefined : noradId;
      this.syncTargetStaging_(antenna);
    };
    this.addHandler_('satellite-select', select, 'change', selectHandler);

    // Handle move button: commit a staged pick, then slew to the target
    const moveHandler = () => {
      const staged = this.stagedTargetId_;
      this.stagedTargetId_ = undefined;
      if (staged !== undefined && staged !== antenna.state.targetSatelliteId) {
        antenna.handleTargetSatelliteChange(staged);
      }
      antenna.moveToTargetSatellite();
      this.syncTargetStaging_(antenna);
      if (antenna.state.targetSatelliteId !== null) {
        const name = this.targetSatelliteName_(antenna.state.targetSatelliteId);
        EventAutoLogger.getInstance().logAction(`PROGRAM: slewing to ${name}`, 'ANT', stationTagForAntennaState(antenna.state));
      }
    };
    this.addHandler_('move-to-target', moveBtn, 'click', moveHandler);
  }

  private initBeaconControls_(antenna: (typeof this.groundStation.antennas)[0]): void {
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

    // Handle step track toggle switch (within program-track mode)
    const stepTrackToggle = this.qs_<HTMLInputElement>('step-track-toggle');
    if (stepTrackToggle) {
      const toggleHandler = () => {
        antenna.handleStepTrackToggle(stepTrackToggle.checked);
      };
      this.addHandler_('step-track-toggle', stepTrackToggle, 'change', toggleHandler);
    }

    // Handle clear offsets button
    const clearOffsetsBtn = this.qs_<HTMLButtonElement>('clear-offsets-btn');
    if (clearOffsetsBtn) {
      const clearHandler = () => {
        antenna.clearStepTrackOffsets();
      };
      this.addHandler_('clear-offsets', clearOffsetsBtn, 'click', clearHandler);
    }
  }

  private initEnvironmentalControls_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const heaterSwitch = this.qs_<HTMLInputElement>('heater-switch');
    const blowerSwitch = this.qs_<HTMLInputElement>('blower-switch');

    if (!heaterSwitch || !blowerSwitch) return;

    // The heater and blower change no line the antenna state formatter writes,
    // so each logs its own (nats-r5-s08-F2)
    const heaterHandler = () => {
      const wasOn = antenna.state.isHeaterEnabled;
      antenna.handleHeaterToggle(heaterSwitch.checked);
      if (antenna.state.isHeaterEnabled !== wasOn) {
        EventAutoLogger.getInstance().logAction(`Feed heater ${antenna.state.isHeaterEnabled ? 'ON' : 'OFF'}`, 'ANT', stationTagForAntennaState(antenna.state));
      }
      this.syncAlarmReadouts_(antenna, true);
    };
    this.addHandler_('heater-switch', heaterSwitch, 'change', heaterHandler);

    const blowerHandler = () => {
      const wasOn = antenna.state.isRainBlowerEnabled;
      antenna.handleRainBlowerToggle(blowerSwitch.checked);
      if (antenna.state.isRainBlowerEnabled !== wasOn) {
        EventAutoLogger.getInstance().logAction(`Rain blower ${antenna.state.isRainBlowerEnabled ? 'ON' : 'OFF'}`, 'ANT', stationTagForAntennaState(antenna.state));
      }
      this.syncAlarmReadouts_(antenna, true);
    };
    this.addHandler_('blower-switch', blowerSwitch, 'change', blowerHandler);
  }

  private initPowerControls_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const powerSwitch = this.qs_<HTMLInputElement>('power-switch');
    const loopbackSwitch = this.qs_<HTMLInputElement>('loopback-switch');

    if (powerSwitch) {
      const powerHandler = () => {
        antenna.handlePowerToggle(powerSwitch.checked);
        this.syncAlarmReadouts_(antenna, true);
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

  private syncUiWithState_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const state = antenna.state;

    // Sync ACU identification
    const modelEl = this.qs_('model');
    const serialEl = this.qs_('serial');
    if (modelEl) modelEl.textContent = state.acuModel;
    if (serialEl) serialEl.textContent = `(${state.acuSerialNumber})`;

    // Sync tracking mode buttons. Under an ACU automation fault the
    // program-track button is disabled - the automation processor is down;
    // servos (manual/stow/maintenance) still work.
    const acuFaulted = state.isAcuAutomationFaulted === true;
    const modeButtons = this.qsa_('btn-tracking');
    modeButtons.forEach((btn) => {
      const mode = (btn as HTMLElement).dataset.mode;
      btn.classList.toggle('active', mode === state.trackingMode);
      btn.classList.toggle('pending', mode === state.stagedTrackingMode);
      if (mode === 'program-track') {
        (btn as HTMLButtonElement).disabled = acuFaulted;
        btn.classList.toggle('disabled', acuFaulted);
      }
    });

    // Show/hide tracking sections based on mode
    const programSection = this.qs_('program-track-section');
    const manualSection = this.qs_('manual-section');
    const beaconDisplaySection = this.qs_('beacon-display-section');

    if (programSection) programSection.style.display = state.trackingMode === 'program-track' ? 'block' : 'none';
    if (manualSection) manualSection.style.display = ['manual', 'stow', 'maintenance'].includes(state.trackingMode) ? 'block' : 'none';
    // Beacon C/N display visible in active tracking modes (not stow/maintenance)
    if (beaconDisplaySection) beaconDisplaySection.style.display = ['manual', 'program-track'].includes(state.trackingMode) ? 'block' : 'none';

    // Update tracking mode display: the APPLIED mode; a staged STOW/MAINT is
    // a pending badge until APPLY (phase 29 D4, nats-r3-s11-F2)
    const modeDisplay = this.qs_('tracking-mode-display');
    if (modeDisplay) modeDisplay.textContent = trackingModeLabel(state);
    const stagedModeBadge = this.qs_<HTMLElement>('staged-mode-badge');
    if (stagedModeBadge) {
      const staged = state.stagedTrackingMode;
      stagedModeBadge.textContent = staged ? `${trackingModeLabel({ trackingMode: staged, isStepTrackEnabled: false })} pending APPLY` : '';
      stagedModeBadge.style.display = staged ? '' : 'none';
    }

    // Update lock status
    const lockDisplay = this.qs_('lock-status-display');
    if (lockDisplay) {
      const lock = antennaLockLabel(state);
      lockDisplay.textContent = lock;
      lockDisplay.classList.toggle('text-success', lock === 'LOCKED');
      lockDisplay.classList.toggle('text-warning', lock === 'UNKNOWN');
    }

    // Update signals count
    const signalsDisplay = this.qs_('signals-count-display');
    if (signalsDisplay) signalsDisplay.textContent = ACUControlTab.signalsInBeam(antenna).toString();

    // Sync fine adjustment controls with actual position and staged values
    // Red (active) = current position (matches polar plot), Amber (pending) = staged changes
    this.azFineControl_?.sync(wrapAzimuthDeg(state.azimuth), state.stagedTargetAzimuth === null ? null : wrapAzimuthDeg(state.stagedTargetAzimuth));
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

    // Update step-track toggle checkbox and beacon controls visibility
    const stepTrackToggle = this.qs_<HTMLInputElement>('step-track-toggle');
    const beaconControls = this.qs_('beacon-controls');
    const leoWarning = this.qs_('leo-warning');

    if (stepTrackToggle && document.activeElement !== stepTrackToggle) {
      stepTrackToggle.checked = state.isStepTrackEnabled;
    }

    // Show beacon controls when step-track is enabled
    if (beaconControls) {
      beaconControls.style.display = state.isStepTrackEnabled ? 'block' : 'none';
    }

    // Show LEO warning for fast-moving satellites (when step-track enabled and velocity > 0.1°/s)
    // For now, we'll show warning based on satellite type if we can determine it
    if (leoWarning && state.targetSatelliteId !== null) {
      const sat = SimulationManager.getInstance().getSatByNoradId(state.targetSatelliteId);
      // Show warning if satellite is LEO (not geostationary/geosynchronous)
      const isLeo = sat && sat.orbitType !== 'geostationary' && sat.orbitType !== 'geosynchronous';
      leoWarning.style.display = state.isStepTrackEnabled && isLeo ? 'block' : 'none';
    } else if (leoWarning) {
      leoWarning.style.display = 'none';
    }

    // Update step-track offset display
    const azOffset = this.qs_('az-offset');
    const elOffset = this.qs_('el-offset');
    if (azOffset) azOffset.textContent = `${(state.stepTrackAzOffset as number).toFixed(3)}°`;
    if (elOffset) elOffset.textContent = `${(state.stepTrackElOffset as number).toFixed(3)}°`;

    // Sync environmental controls
    const heaterLed = this.qs_('heater-led');
    const blowerLed = this.qs_('blower-led');
    const heaterSwitch = this.qs_<HTMLInputElement>('heater-switch');
    const blowerSwitch = this.qs_<HTMLInputElement>('blower-switch');

    if (heaterLed) {
      // Green while it runs, like the blower: on is the healthy state in a
      // storm, and amber belongs to the Environmental header (Phase 32 D14,
      // nats-r7-s20-F1)
      heaterLed.className = `card-alarm-led ${state.isHeaterEnabled ? 'success' : 'off'}`;
      heaterLed.title = state.isHeaterEnabled ? 'Heater ON' : 'Heater OFF';
    }
    if (blowerLed) {
      blowerLed.className = `card-alarm-led ${state.isRainBlowerEnabled ? 'success' : 'off'}`;
      blowerLed.title = state.isRainBlowerEnabled ? 'Rain blower ON' : 'Rain blower OFF';
    }
    if (heaterSwitch) heaterSwitch.checked = state.isHeaterEnabled;
    if (blowerSwitch) blowerSwitch.checked = state.isRainBlowerEnabled;

    // Sync power switch
    const powerSwitch = this.qs_<HTMLInputElement>('power-switch');
    if (powerSwitch) powerSwitch.checked = state.isPowered;

    // The ACU status LED is synced by syncStatusLed_() once per scenario second

    // Sync loopback switch
    const loopbackSwitch = this.qs_<HTMLInputElement>('loopback-switch');
    if (loopbackSwitch) loopbackSwitch.checked = state.isLoopback;

    // Precipitation status is synced by syncIceAccumulation_() using WeatherManager

    // Sync context panel title based on tracking mode
    const contextTitle = this.qs_('context-panel-title');
    if (contextTitle) {
      if (state.trackingMode === 'program-track') {
        // Show "Program Track" or "Program + Step Track" based on step-track state
        contextTitle.textContent = state.isStepTrackEnabled ? 'Program + Step Track' : 'Program Track';
      } else {
        contextTitle.textContent = 'Tracking';
      }
    }

    // Sync move-to-target button disabled state (also disabled under ACU fault)
    this.syncTargetStaging_(antenna);
    const satelliteSelectEl = this.qs_<HTMLSelectElement>('satellite-select');
    if (satelliteSelectEl) {
      satelliteSelectEl.disabled = acuFaulted;
    }
    const stepTrackToggleEl = this.qs_<HTMLInputElement>('step-track-toggle');
    if (stepTrackToggleEl) {
      stepTrackToggleEl.disabled = acuFaulted;
    }

    // Sync satellite dropdown selection (skip if user is interacting)
    const satelliteSelect = this.qs_<HTMLSelectElement>('satellite-select');
    if (satelliteSelect && document.activeElement !== satelliteSelect) {
      // A staged pick stays showing until Move to Target or a mode change
      const shown = this.stagedTargetId_ !== undefined ? this.stagedTargetId_ : state.targetSatelliteId;
      this.syncSatelliteOptions_(satelliteSelect, shown);
      satelliteSelect.value = shown?.toString() ?? '';
    }

    // Sync current target display from the antenna's own target. Program-track
    // follows state.targetSatelliteId every tick, so that is what the pedestal
    // is tracking; an adapter-local copy went blank whenever the target was
    // set anywhere but this tab's Move button (s06-F4, s10-F4, s11-F4).
    const currentTargetDisplay = this.qs_<HTMLInputElement>('current-target-display');
    if (currentTargetDisplay) {
      currentTargetDisplay.value = this.targetSatelliteName_(state.targetSatelliteId);
    }

    // Sync beacon frequency input (skip if user is typing)
    const beaconFreqInput = this.qs_<HTMLInputElement>('beacon-freq');
    if (beaconFreqInput && document.activeElement !== beaconFreqInput) {
      const freqMHz = (state.stagedBeaconFrequencyHz ?? state.beaconFrequencyHz) / 1e6;
      beaconFreqInput.value = freqMHz.toString();
    }

    // Its IF equivalent through this station's LNB (phase 27): the number the
    // analyzer is tuned to, so the operator does not have to work it out
    const beaconIfEl = this.qs_('beacon-if');
    if (beaconIfEl) {
      const rfMHz = (state.stagedBeaconFrequencyHz ?? state.beaconFrequencyHz) / 1e6;
      const loMHz = this.groundStation.rfFrontEnds[this.antennaIndex_]?.lnbModule?.state.loFrequency as number | undefined;
      beaconIfEl.textContent = loMHz && rfMHz > 0 ? `IF: ${ACUControlTab.beaconIfMHz(rfMHz, loMHz).toFixed(1)} MHz (LNB LO ${loMHz} MHz)` : 'IF: -- MHz';
    }

    // The beacon receiver's measurement bandwidth, from the antenna (phase 27)
    const beaconCnLabel = this.qs_('beacon-cn-label');
    if (beaconCnLabel) {
      beaconCnLabel.textContent = `Beacon C/N (${ACUControlTab.formatBandwidth(state.beaconTrackingBwHz)})`;
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

  /**
   * Move to Target and the staged-pick hint. Move is live in PROGRAM with a
   * target picked (staged or committed) and no ACU automation fault.
   */
  private syncTargetStaging_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const state = antenna.state;
    if (this.stagedTargetId_ !== undefined && this.stagedTargetId_ === state.targetSatelliteId) {
      this.stagedTargetId_ = undefined;
    }
    const pick = this.stagedTargetId_ !== undefined ? this.stagedTargetId_ : state.targetSatelliteId;

    const moveToTargetBtn = this.qs_<HTMLButtonElement>('move-to-target-btn');
    if (moveToTargetBtn) {
      moveToTargetBtn.disabled = state.isAcuAutomationFaulted === true || state.trackingMode !== 'program-track' || pick === null;
    }

    const hint = this.qs_('target-staged-hint');
    if (hint) {
      let text = '';
      if (this.stagedTargetId_ !== undefined) {
        const name = this.targetSatelliteName_(this.stagedTargetId_);
        text = state.trackingMode === 'program-track' ? `${name} staged: press Move to Target to slew` : `${name} staged: select PROGRAM, then Move to Target`;
      }
      hint.textContent = text;
      hint.style.display = text ? 'block' : 'none';
    }
  }

  /** Display name for the antenna's target, 'No Target' when there is none. */
  private targetSatelliteName_(noradId: number | null): string {
    if (noradId === null) return 'No Target';
    const satellite = SimulationManager.getInstance().registry.get(noradId);
    return satellite?.name ?? `NORAD ${noradId}`;
  }

  /**
   * Rebuild the target dropdown when the satellite list changes. Scenarios with constellation members get a
   * search box and list only authored, pinned and selected satellites plus `current` (P3-WP10).
   */
  private syncSatelliteOptions_(select: HTMLSelectElement, current: number | null): void {
    if (!this.satellitePicker_) {
      this.satellitePicker_ = new SatellitePicker(select, SimulationManager.getInstance(), { placeholder: '-- Select Satellite --' });
    }
    this.satellitePicker_.refresh(current, SimulationManager.getInstance());
  }

  private syncRfMetrics_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const metrics = antenna.state.rfMetrics;
    if (!metrics) return;

    const freqEl = this.qs_('rf-metric-freq');
    const gainEl = this.qs_('rf-metric-gain');
    const bwEl = this.qs_('rf-metric-beamwidth');
    const gtEl = this.qs_('rf-metric-gt');
    const polLossEl = this.qs_('rf-metric-pol-loss');
    const skyTempEl = this.qs_('rf-metric-sky-temp');

    // No target (and not a MANUAL operator entry): no beacon is tracked, so no
    // frequency, never the last target's (phase 29 D4, nats-r4-s12-F1)
    const state = antenna.state;
    const hasBeaconTarget = state.targetSatelliteId !== null || state.trackingMode === 'manual';
    if (freqEl) freqEl.textContent = hasBeaconTarget ? `${metrics.frequency_GHz.toFixed(3)} GHz` : '-- GHz';
    if (gainEl) gainEl.textContent = `${metrics.gain_dBi.toFixed(1)} dBi`;
    if (bwEl) bwEl.textContent = `${metrics.beamwidth_deg.toFixed(2)}°`;
    if (gtEl) gtEl.textContent = `${metrics.gOverT_dBK.toFixed(1)} dB/K`;
    if (polLossEl) polLossEl.textContent = `${metrics.polLoss_dB.toFixed(1)} dB`;
    if (skyTempEl) skyTempEl.textContent = `${metrics.skyTemp_K.toFixed(0)} K`;
  }

  private syncBeaconMetrics_(antenna: (typeof this.groundStation.antennas)[0]): void {
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
      // Lock status depends on whether step-track optimization is enabled
      if (state.isAcuAutomationFaulted) {
        // The tracking receiver's lock logic died with the automation (nats-s23-F5)
        beaconLockEl.textContent = 'UNKNOWN';
        beaconLockEl.classList.remove('text-success');
      } else if (state.isStepTrackEnabled) {
        // Step-track enabled: IDLE (tracking off), SEARCHING (tracking on), LOCKED
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
        // Manual/Program-track without step-track: UNLOCKED or LOCKED based on C/N
      } else if (state.isBeaconLocked) {
        beaconLockEl.textContent = 'LOCKED';
        beaconLockEl.classList.add('text-success');
      } else {
        beaconLockEl.textContent = 'UNLOCKED';
        beaconLockEl.classList.remove('text-success');
      }
    }
  }

  /**
   * ACU header LED (Phase 33 D2, nats-r8-s23-F1): this antenna's AlarmService
   * alarms, worst first, titled with the top one ("ACU AUTOMATION FAULT -
   * MANUAL CONTROL ONLY" red), plus the module's `hasFault` as an error;
   * grey "Antenna off" unpowered, green "No alarms" otherwise
   */
  private syncStatusLed_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const statusLed = this.qs_('status-led');
    if (!statusLed) {
      return;
    }
    const state = antenna.state;
    const led = alarmLed(AlarmService.getAlarms(this.groundStation), (alarm) => alarm.equipmentType === 'ANT' && alarm.equipmentIndex === this.antennaIndex_, {
      isPowered: state.isPowered,
      offTitle: 'Antenna off',
      extra: state.hasFault ? [{ severity: 'error', message: state.faultMessage ?? 'Antenna fault' }] : [],
    });
    applyAlarmLed(statusLed, led);
  }

  private syncIceAccumulation_(antenna: (typeof this.groundStation.antennas)[0]): void {
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
      const led = precipStatus.querySelector('.card-alarm-led');
      if (led) {
        led.className = `card-alarm-led ${isPrecip ? 'warning' : 'off'} me-1`;
        (led as HTMLElement).title = isPrecip ? 'Precipitation ACTIVE' : 'Precipitation CLEAR';
      }
      const textNode = precipStatus.childNodes[precipStatus.childNodes.length - 1];
      if (textNode) textNode.textContent = isPrecip ? 'ACTIVE' : 'CLEAR';
    }

    this.syncEnvironmentalLed_(antenna);
  }

  /**
   * Environmental card header LED (Phase 32 D14, Phase 33 D3, nats-r7-s20-F1):
   * the ICE ON FEED alarm's colour while ice is at its warning level or above
   * (red at its error level); below that, amber only while precipitation falls
   * unmitigated - snow, hail or freezing rain with the feed heater off, rain
   * with both the heater and the rain blower off (the heater keeps the feed
   * dry too, and the blower has no modelled effect beyond that; S14 rides out
   * its rain cell on the heater alone). Mitigated precipitation is green
   * ("Snow falling - feed heater ON, ice 0.0 dB"), no precipitation grey. The
   * title carries the ice depth either way.
   */
  private syncEnvironmentalLed_(antenna: (typeof this.groundStation.antennas)[0]): void {
    const led = this.qs_('env-led');
    if (!led) return;

    const state = antenna.state;
    const ice = antenna.state.iceAccumulation_dB;
    const iceText = `ice ${ice.toFixed(1)} dB`;
    let ledState = 'off';
    let title = `Clear - ${iceText}, no precipitation`;
    if (ice >= ACUControlTab.ICE_ON_FEED_ERROR_DB) {
      ledState = 'error';
      title = `Ice on feed ${ice.toFixed(1)} dB`;
    } else if (ice >= ACUControlTab.ICE_ON_FEED_WARNING_DB) {
      ledState = 'warning';
      title = `Ice on feed ${ice.toFixed(1)} dB`;
    } else {
      const precip = this.worstPrecipitation_(state.isHeaterEnabled, state.isRainBlowerEnabled);
      if (precip) {
        const label = ACUControlTab.PRECIP_LABELS_[precip.type] ?? 'Precipitation';
        ledState = precip.isMitigated ? 'success' : 'warning';
        title = `${label} falling - ${precip.protection}, ${iceText}`;
      }
    }
    led.className = `card-alarm-led ${ledState}`;
    led.title = title;
  }

  /**
   * The active precipitation event at this station the Environmental LED
   * reports: the first unmitigated one, else the first mitigated one, else
   * null. `protection` names the feed's state against it.
   */
  private worstPrecipitation_(isHeaterOn: boolean, isBlowerOn: boolean): { type: string; isMitigated: boolean; protection: string } | null {
    let mitigated: { type: string; isMitigated: boolean; protection: string } | null = null;
    for (const event of WeatherManager.getInstance().getActiveWeatherEvents(this.groundStation.state.id)) {
      if (!(event.type in ACUControlTab.PRECIP_LABELS_)) {
        continue;
      }
      let isMitigated: boolean;
      let protection: string;
      if (ACUControlTab.FROZEN_PRECIP_.has(event.type)) {
        isMitigated = isHeaterOn;
        protection = `feed heater ${isHeaterOn ? 'ON' : 'OFF'}`;
      } else {
        isMitigated = isHeaterOn || isBlowerOn;
        if (isHeaterOn) {
          protection = 'feed heater ON';
        } else if (isBlowerOn) {
          protection = 'rain blower ON';
        } else {
          protection = 'feed heater and rain blower OFF';
        }
      }
      if (!isMitigated) return { type: event.type, isMitigated, protection };
      mitigated ??= { type: event.type, isMitigated, protection };
    }
    return mitigated;
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
    this.satellitePicker_?.dispose();
    this.satellitePicker_ = null;
    this.antennaAdapter?.dispose();
    this.omtAdapter?.dispose();

    // Clean up polar plot
    this.polarPlot_ = null;

    // Remove DOM
    this.dom_?.remove();
  }
}
