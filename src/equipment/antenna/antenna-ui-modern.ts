import { HelpButton } from "@app/components/help-btn/help-btn";
import { PolarPlot } from "@app/components/polar-plot/polar-plot";
import { Degrees } from "ootk";
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { ANTENNA_CONFIG_KEYS } from "./antenna-configs";
import { AntennaCore, AntennaState } from "./antenna-core";
import './antenna-ui-modern.css';

/**
 * AntennaUIModern - A modern Bootstrap/React-style UI for the antenna.
 * Replaces skeumorphic controls with modern sliders and switches.
 * - Az/El/Polarization sliders
 * - Auto-track capability
 * - Loopback control
 * - Polar plot visualization
 * - Full RF metrics display
 * - Detailed status alarms
 */
export class AntennaUIModern extends AntennaCore {
  // UI Components
  private readonly helpBtn_: HelpButton;
  private readonly polarPlot_: PolarPlot;

  constructor(
    parentId: string,
    configId: ANTENNA_CONFIG_KEYS = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
    initialState: Partial<AntennaState> = {},
    teamId: number = 1,
    serverId: number = 1,
  ) {
    // Call parent constructor which will call build()
    super(parentId, configId, initialState, teamId, serverId);

    // Create UI components
    this.helpBtn_ = HelpButton.create(
      `${this.state.uuid}-help-btn`,
      'Antenna Control Unit (ACU)',
      null,
      'https://docs.signalrange.space/equipment/antenna-control-unit?content-only=true&dark=true'
    );
    this.polarPlot_ = PolarPlot.create(
      `${this.state.uuid}-polar-plot`,
      { width: 550, height: 450, showGrid: true, showLabels: true }
    );

    super.build(parentId);
  }

  protected override initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
      <div class="equipment-case antenna-container antenna-modern">
        <div class="antenna-header">
          <div class="antenna-title">
            <h1>Antenna Control Unit</h1>
            <p>${this.config.name}</p>
          </div>
          <div class="antenna-system-controls">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" role="switch" id="power-switch" ${this.state.isPowered ? 'checked' : ''}>
              <label class="form-check-label" for="power-switch">Power</label>
            </div>
            ${this.helpBtn_.html}
          </div>
        </div>

        <div class="antenna-main-content">
          <div class="antenna-controls-row">
            <!-- Pointing Controls -->
            <div class="control-section">
              <h2>Pointing</h2>
              <div class="control-group">
                <label for="az-slider" class="form-label">Azimuth: <span id="az-value">${this.state.azimuth.toFixed(1)}</span>°</label>
                <input type="range" class="form-range" id="az-slider" min="-270" max="270" step="0.1" value="${this.state.azimuth}">
              </div>
              <div class="control-group">
                <label for="el-slider" class="form-label">Elevation: <span id="el-value">${this.state.elevation.toFixed(1)}</span>°</label>
                <input type="range" class="form-range" id="el-slider" min="-5" max="90" step="0.1" value="${this.state.elevation}">
              </div>
              <div class="control-group">
                <label for="pol-slider" class="form-label">Polarization: <span id="pol-value">${this.state.polarization.toFixed(1)}</span>°</label>
                <input type="range" class="form-range" id="pol-slider" min="-90" max="90" step="1" value="${this.state.polarization}">
              </div>
            </div>
          </div>
          <div class="antenna-controls-row">
            <div class="antenna-controls-column">

              <!-- Mode Controls -->
              <div class="control-section">
                <h2>Mode</h2>
                <div class="switches">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" id="autotrack-switch" ${this.state.isAutoTrackSwitchUp ? 'checked' : ''}>
                    <label class="form-check-label" for="autotrack-switch">Auto Track</label>
                  </div>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" id="loopback-switch" ${this.state.isLoopback ? 'checked' : ''}>
                    <label class="form-check-label" for="loopback-switch">Loopback</label>
                  </div>
                </div>
              </div>

              <!-- RF Metrics -->
              <div class="control-section rf-metrics-section">
                <h2>RF Metrics</h2>
                <div class="spec-details">
                  <span class="rf-metric-freq">Freq: -- GHz</span>
                  <span class="rf-metric-gain">Gain: -- dBi</span>
                  <span class="rf-metric-beamwidth">HPBW: -- deg</span>
                  <span class="rf-metric-gt">G/T: -- dB/K</span>
                  <span class="rf-metric-pol-loss">Pol Loss: -- dB</span>
                  <span class="rf-metric-sky-temp">Sky: -- K</span>
                </div>
              </div>
            </div>

            <div class="antenna-visualization-column">
              ${this.polarPlot_.html}
            </div>
          </div>
          </div>

        <div class="antenna-footer">
          <div class="bottom-status-bar">SYSTEM NORMAL</div>
        </div>
      </div>
    `;

    this.domCache['parent'] = parentDom;
    this.domCache['bottomStatusBar'] = qs('.bottom-status-bar', parentDom);

    // Controls
    this.domCache['powerSwitch'] = qs('#power-switch', parentDom);
    this.domCache['azSlider'] = qs('#az-slider', parentDom);
    this.domCache['elSlider'] = qs('#el-slider', parentDom);
    this.domCache['polSlider'] = qs('#pol-slider', parentDom);
    this.domCache['azValue'] = qs('#az-value', parentDom);
    this.domCache['elValue'] = qs('#el-value', parentDom);
    this.domCache['polValue'] = qs('#pol-value', parentDom);
    this.domCache['loopbackSwitch'] = qs('#loopback-switch', parentDom);
    this.domCache['autotrackSwitch'] = qs('#autotrack-switch', parentDom);

    // RF metrics
    this.domCache['rfMetricFreq'] = qs('.rf-metric-freq', parentDom);
    this.domCache['rfMetricGain'] = qs('.rf-metric-gain', parentDom);
    this.domCache['rfMetricBeamwidth'] = qs('.rf-metric-beamwidth', parentDom);
    this.domCache['rfMetricGT'] = qs('.rf-metric-gt', parentDom);
    this.domCache['rfMetricPolLoss'] = qs('.rf-metric-pol-loss', parentDom);
    this.domCache['rfMetricSkyTemp'] = qs('.rf-metric-sky-temp', parentDom);

    return parentDom;
  }

  protected override addListeners_(): void {
    this.domCache['powerSwitch'].addEventListener('change', (e: Event) => this.handlePowerToggle((e.target as HTMLInputElement).checked));
    this.domCache['loopbackSwitch'].addEventListener('change', (e: Event) => this.handleLoopbackToggle((e.target as HTMLInputElement).checked));
    this.domCache['autotrackSwitch'].addEventListener('change', (e: Event) => this.handleAutoTrackToggle((e.target as HTMLInputElement).checked));

    this.domCache['azSlider'].addEventListener('input', (e: Event) => this.handleAzimuthChange(parseFloat((e.target as HTMLInputElement).value) as Degrees));
    this.domCache['elSlider'].addEventListener('input', (e: Event) => this.handleElevationChange(parseFloat((e.target as HTMLInputElement).value) as Degrees));
    this.domCache['polSlider'].addEventListener('input', (e: Event) => this.handlePolarizationChange(parseFloat((e.target as HTMLInputElement).value) as Degrees));
  }

  protected syncDomWithState(): void {
    // Compare state excluding rxSignalsIn to avoid unnecessary DOM updates
    const { rxSignalsIn: _, ...stateWithoutRxSignalsIn } = this.state;
    const { rxSignalsIn: __, ...lastRenderStateWithoutRxSignalsIn } = this.lastRenderState;
    if (JSON.stringify(stateWithoutRxSignalsIn) === JSON.stringify(lastRenderStateWithoutRxSignalsIn)) {
      return; // No changes, skip update
    }

    this.checkForAlarms_();

    // Sync power state
    (this.domCache['powerSwitch'] as HTMLInputElement).checked = this.state.isPowered;
    this.domCache['parent'].classList.toggle('powered-off', !this.state.isPowered);

    // Sync switches
    (this.domCache['loopbackSwitch'] as HTMLInputElement).checked = this.state.isLoopback;
    (this.domCache['autotrackSwitch'] as HTMLInputElement).checked = this.state.isAutoTrackSwitchUp;

    // Sync sliders and value displays
    (this.domCache['azSlider'] as HTMLInputElement).value = this.state.azimuth.toString();
    this.domCache['azValue'].textContent = this.state.azimuth.toFixed(1);
    (this.domCache['elSlider'] as HTMLInputElement).value = this.state.elevation.toString();
    this.domCache['elValue'].textContent = this.state.elevation.toFixed(1);
    (this.domCache['polSlider'] as HTMLInputElement).value = this.state.polarization.toString();
    this.domCache['polValue'].textContent = this.state.polarization.toFixed(1);

    // Update switch statuses
    qs('.form-check.form-switch:has(#autotrack-switch)', this.domCache['parent'] as HTMLElement).classList.toggle('fault', this.state.isAutoTrackSwitchUp && !this.state.isAutoTrackEnabled);

    // Update RF metrics display
    if (this.state.rfMetrics) {
      const m = this.state.rfMetrics;
      this.domCache['rfMetricFreq'].textContent = `Freq: ${m.frequency_GHz.toFixed(3)} GHz`;
      this.domCache['rfMetricGain'].textContent = `Gain: ${m.gain_dBi.toFixed(1)} dBi`;
      this.domCache['rfMetricBeamwidth'].textContent = `HPBW: ${m.beamwidth_deg.toFixed(2)}°`;
      this.domCache['rfMetricGT'].textContent = `G/T: ${m.gOverT_dBK.toFixed(1)} dB/K`;
      this.domCache['rfMetricPolLoss'].textContent = `Pol Loss: ${m.polLoss_dB.toFixed(1)} dB`;
      this.domCache['rfMetricSkyTemp'].textContent = `Sky: ${m.skyTemp_K.toFixed(0)} K`;
    }

    // Save last render state
    this.lastRenderState = structuredClone(this.state);
  }

  draw(): void {
    // Update polar plot
    this.polarPlot_.draw(this.normalizedAzimuth, this.state.elevation);
  }

  /**
   * Check for alarms and update status bar and LED
   */
  private checkForAlarms_(): void {
    const statusAlarms = this.getStatusAlarms();

    const statusBarElement = this.domCache['bottomStatusBar'];

    this.updateStatusBar(statusBarElement, statusAlarms);
    // The main status LED has been removed in favor of the more descriptive status bar.
  }
}