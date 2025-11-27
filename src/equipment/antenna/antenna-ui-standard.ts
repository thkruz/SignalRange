import { HelpButton } from "@app/components/help-btn/help-btn";
import { PolarPlot } from "@app/components/polar-plot/polar-plot";
import { PowerSwitch } from "@app/components/power-switch/power-switch";
import { RotaryKnob } from "@app/components/rotary-knob/rotary-knob";
import { ToggleSwitch } from "@app/components/toggle-switch/toggle-switch";
import { Degrees } from "ootk";
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { ANTENNA_CONFIG_KEYS } from "./antenna-configs";
import { AntennaCore, AntennaState } from "./antenna-core";
import './antenna.css';

/**
 * AntennaUIStandard - Full-featured antenna UI implementation
 * Provides complete control panel with all features:
 * - Az/El/Polarization knobs
 * - Auto-track capability
 * - Loopback control
 * - Polar plot visualization
 * - Full RF metrics display
 * - Detailed status alarms
 */
export class AntennaUIStandard extends AntennaCore {
  // UI Components
  private readonly powerSwitch_: PowerSwitch;
  private readonly polarizationKnob_: RotaryKnob;
  private readonly loopbackSwitch_: ToggleSwitch;
  private readonly autoTrackSwitch_: ToggleSwitch;
  private readonly helpBtn_: HelpButton;
  private readonly polarPlot_: PolarPlot;
  azKnob_: RotaryKnob;
  elKnob_: RotaryKnob;

  constructor(
    parentId: string,
    configId: ANTENNA_CONFIG_KEYS = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
    initialState: Partial<AntennaState> = {},
    teamId: number = 1,
    serverId: number = 1,
  ) {
    // Initialize UI components before calling super
    // These need to exist before build() is called
    const tempState = {
      uuid: '', // Will be set by super
      teamId: teamId,
      serverId: serverId,
      polarization: 0 as Degrees,
      elevation: 0 as Degrees,
      azimuth: 0 as Degrees,
      isLoopback: false,
      isLocked: false,
      isAutoTrackSwitchUp: false,
      isAutoTrackEnabled: false,
      isOperational: true,
      isPowered: true,
      rxSignalsIn: [],
      ...initialState
    };

    // Call parent constructor which will call build()
    super(parentId, configId, initialState, teamId, serverId);

    // Create UI components with temporary IDs (will be updated after super)
    const tempId = `antenna-temp`;
    this.autoTrackSwitch_ = ToggleSwitch.create(
      `${tempId}-auto-track`,
      tempState.isAutoTrackSwitchUp,
      false
    );
    this.powerSwitch_ = PowerSwitch.create(
      `${tempId}-power-switch`,
      tempState.isPowered,
      true,
      true
    );
    this.polarizationKnob_ = RotaryKnob.create(
      `${tempId}-skew-knob`,
      tempState.polarization,
      -90,
      90,
      1,
      (value) => this.handlePolarizationChange(value)
    );
    this.azKnob_ = RotaryKnob.create(
      `${tempId}-az-knob`,
      tempState.azimuth,
      -270,
      270,
      0.1,
      (value) => this.handleAzimuthChange(value)
    );
    this.elKnob_ = RotaryKnob.create(
      `${tempId}-el-knob`,
      tempState.elevation,
      -5,
      90,
      0.1,
      (value) => this.handleElevationChange(value)
    );
    this.loopbackSwitch_ = ToggleSwitch.create(
      `${tempId}-loopback`,
      tempState.isLoopback,
      false
    );
    this.helpBtn_ = HelpButton.create(
      `${tempId}-help-btn`,
      'Antenna Control Unit (ACU)',
      null,
      'https://docs.signalrange.space/equipment/antenna-control-unit?content-only=true&dark=true'
    );
    this.polarPlot_ = PolarPlot.create(
      `${tempId}-polar-plot`,
      { width: 550, height: 450, showGrid: true, showLabels: true }
    );

    super.build(parentId);

    // Update component IDs with actual UUID
    this.updateComponentIds_();
  }

  /**
   * Update component IDs after UUID is assigned
   */
  private updateComponentIds_(): void {
    // Component IDs are already created with temp IDs
    // They will be used with their current IDs in the HTML template
  }

  protected override initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
      <div class="equipment-case antenna-container">
        <!-- Antenna Control Unit Header -->
        <div class="equipment-case-header">
          <div class="equipment-case-title">
            <span>Antenna Control Unit</span>
            ${this.helpBtn_.html}
          </div>
          <div class="equipment-case-power-controls">
            <div class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div class="led ${this.state.isPowered ? 'led-green' : 'led-amber'}"></div>
            </div>
          </div>
        </div>

        <div class="antenna-body">
          <!-- Antenna Control Unit Body -->
          <div class="antenna-controls">

            <div class="antenna-config">
              <div class="config-row antenna-specs" style="display: none;">
                <label>Specifications</label>
                <div class="spec-details">
                  <span>Diameter: ${this.config.diameter}m</span>
                  <span>Band: ${this.config.band}</span>
                  <span>Rx Freq: ${(this.config.minRxFrequency / 1e9).toFixed(2)}-${(this.config.maxRxFrequency / 1e9).toFixed(2)} GHz</span>
                  <span>Tx Freq: ${(this.config.minTxFrequency / 1e9).toFixed(2)}-${(this.config.maxTxFrequency / 1e9).toFixed(2)} GHz</span>
                </div>
              </div>

              <div class="config-row antenna-rf-metrics" style="display: none;">
                <label>RF Performance</label>
                <div class="spec-details">
                  <span class="rf-metric-freq">Freq: -- GHz</span>
                  <span class="rf-metric-gain">Gain: -- dBi</span>
                  <span class="rf-metric-beamwidth">HPBW: -- deg</span>
                  <span class="rf-metric-gt">G/T: -- dB/K</span>
                  <span class="rf-metric-pol-loss">Pol Loss: -- dB</span>
                  <span class="rf-metric-sky-temp">Sky: -- K</span>
                </div>
              </div>

              <div class="row">
                <div class="config-row">
                  <label>Azimuth</label>
                  ${this.azKnob_.html}
                </div>

                <div class="config-row">
                  <label>Elevation</label>
                  ${this.elKnob_.html}
                </div>
              </div>

              <div class="row">
                <div class="config-row">
                  <div class="status-indicator loopback">
                  <span id="ant-loopback-light" class="indicator-light ${this.state.isLoopback ? 'on' : 'off'}"></span>
                  <span class="indicator-label">Loopback to OMT</span>
                </div>
                ${this.loopbackSwitch_.html}
                </div>

                <div class="config-row">
                  <div class="status-indicator auto-track">
                    <span id="ant-auto-track-light" class="indicator-light ${this.state.isAutoTrackEnabled ? 'on' : 'off'}"></span>
                    <span class="indicator-label">Auto Track</span>
                  </div>
                  ${this.autoTrackSwitch_.html}
                </div>
            </div>

              <div class="row">
                <div class="config-row">
                  <label>Polarization</label>
                  ${this.polarizationKnob_.html}
                </div>
                ${this.powerSwitch_.html}
              </div>
            </div>
          </div>

          <!-- Antenna Dish -->
          <div class="antenna-dish">
            ${this.polarPlot_.html}
          </div>
        </div>

        <div class="antenna-name">
          ${this.config.name}
        </div>

        <!-- Bottom Status Bar -->
        <div class="equipment-case-footer">
          <div class="bottom-status-bar">
            SYSTEM NORMAL
          </div>
        </div>
      </div>
    `;

    this.domCache['parent'] = parentDom;
    this.domCache['status'] = qs('.equipment-case-status-label', parentDom);
    this.domCache['led'] = qs('.led', parentDom);
    this.domCache['antLoopbackLight'] = qs('#ant-loopback-light', parentDom);
    this.domCache['antAutoTrackLight'] = qs('#ant-auto-track-light', parentDom);
    this.domCache['bottomStatusBar'] = qs('.bottom-status-bar', parentDom);
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
    this.loopbackSwitch_?.addEventListeners(this.handleLoopbackToggle.bind(this));
    this.autoTrackSwitch_?.addEventListeners(this.handleAutoTrackToggle.bind(this));
    this.powerSwitch_.addEventListeners(this.handlePowerToggle.bind(this));
  }

  syncDomWithState(): void {
    // Compare state excluding rxSignalsIn to avoid unnecessary DOM updates
    const { rxSignalsIn: _, ...stateWithoutRxSignalsIn } = this.state;
    const { rxSignalsIn: __, ...lastRenderStateWithoutRxSignalsIn } = this.lastRenderState;
    if (JSON.stringify(stateWithoutRxSignalsIn) === JSON.stringify(lastRenderStateWithoutRxSignalsIn)) {
      return; // No changes, skip update
    }

    this.checkForAlarms_();

    this.powerSwitch_.sync(this.state.isPowered);
    this.loopbackSwitch_.sync(this.state.isLoopback);

    // Update inputs
    this.domCache['antLoopbackLight'].className = `indicator-light ${this.state.isLoopback && this.state.isPowered ? 'on' : 'off'}`;
    this.domCache['antAutoTrackLight'].className = `indicator-light ${this.state.isAutoTrackSwitchUp && this.state.isPowered ? 'on' : 'off'}`;

    qs('.status-indicator.auto-track').classList.toggle('fault', this.state.isAutoTrackSwitchUp && !this.state.isAutoTrackEnabled);

    // Update skew knob
    this.polarizationKnob_.sync(this.state.polarization);
    this.azKnob_.sync(this.state.azimuth);
    this.elKnob_.sync(this.state.elevation);

    this.autoTrackSwitch_.sync(this.state.isAutoTrackSwitchUp);

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
    const ledElement = this.domCache['led'];

    this.updateStatusBar(statusBarElement, statusAlarms);
    this.updateStatusLed(ledElement, statusAlarms);
  }
}
