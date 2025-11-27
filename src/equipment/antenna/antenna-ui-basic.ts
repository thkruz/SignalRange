import { PowerSwitch } from "@app/components/power-switch/power-switch";
import { RotaryKnob } from "@app/components/rotary-knob/rotary-knob";
import { Degrees } from "ootk";
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { ANTENNA_CONFIG_KEYS } from "./antenna-configs";
import { AntennaCore, AntennaState } from "./antenna-core";
import './antenna.css';

/**
 * AntennaUIBasic - Simplified antenna UI implementation
 * Provides minimal control panel for training scenarios:
 * - Az/El knobs (manual pointing only)
 * - Power switch
 * - Basic status LED (green/red)
 *
 * Missing features (not available in basic UI):
 * - Auto-track
 * - Loopback
 * - Polarization control (locked at 0°)
 * - Polar plot visualization
 * - RF metrics display
 */
export class AntennaUIBasic extends AntennaCore {
  // UI Components - Only 3 components for basic UI
  private readonly powerSwitch_: PowerSwitch;
  azKnob_: RotaryKnob;
  elKnob_: RotaryKnob;

  constructor(
    parentId: string,
    configId: ANTENNA_CONFIG_KEYS = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
    initialState: Partial<AntennaState> = {},
    teamId: number = 1,
    serverId: number = 1,
  ) {
    // Create minimal UI components
    const tempState = {
      uuid: '',
      teamId: teamId,
      serverId: serverId,
      polarization: 0 as Degrees, // Locked at 0
      elevation: 0 as Degrees,
      azimuth: 0 as Degrees,
      isLoopback: false, // Always false in basic UI
      isLocked: false,
      isAutoTrackSwitchUp: false,
      isAutoTrackEnabled: false,
      isOperational: true,
      isPowered: true,
      rxSignalsIn: [],
      ...initialState
    };

    // Call parent constructor
    super(parentId, configId, initialState, teamId, serverId);

    const tempId = `antenna-basic-temp`;
    this.powerSwitch_ = PowerSwitch.create(
      `${tempId}-power-switch`,
      tempState.isPowered,
      true,
      true
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

    super.build(parentId);
  }

  protected override initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
      <div class="equipment-case antenna-container antenna-basic">
        <!-- Antenna Control Unit Header -->
        <div class="equipment-case-header">
          <div class="equipment-case-title">
            <span>Antenna Control Unit (Basic)</span>
          </div>
          <div class="equipment-case-power-controls">
            <div class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div class="led ${this.state.isPowered ? 'led-green' : 'led-red'}"></div>
            </div>
          </div>
        </div>

        <div class="antenna-body">
          <div class="antenna-controls">
            <div class="antenna-config">
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
                ${this.powerSwitch_.html}
              </div>
            </div>
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
    this.domCache['bottomStatusBar'] = qs('.bottom-status-bar', parentDom);

    return parentDom;
  }

  protected override addListeners_(): void {
    this.powerSwitch_.addEventListeners(this.handlePowerToggle.bind(this));
  }

  protected syncDomWithState(): void {
    // Compare state excluding rxSignalsIn to avoid unnecessary DOM updates
    const { rxSignalsIn: _, ...stateWithoutRxSignalsIn } = this.state;
    const { rxSignalsIn: __, ...lastRenderStateWithoutRxSignalsIn } = this.lastRenderState;
    if (JSON.stringify(stateWithoutRxSignalsIn) === JSON.stringify(lastRenderStateWithoutRxSignalsIn)) {
      return; // No changes, skip update
    }

    this.checkForAlarms_();

    this.powerSwitch_.sync(this.state.isPowered);
    this.azKnob_.sync(this.state.azimuth);
    this.elKnob_.sync(this.state.elevation);

    // Save last render state
    this.lastRenderState = structuredClone(this.state);
  }

  draw(): void {
    // No polar plot in basic UI - do nothing
  }

  /**
   * Override: Loopback not available in basic UI
   */
  protected override handleLoopbackToggle(_isSwitchUp: boolean): void {
    // Feature not available in basic UI
    console.warn('Loopback control not available in basic antenna UI');
  }

  /**
   * Override: Auto-track not available in basic UI
   */
  protected override handleAutoTrackToggle(_isSwitchUp: boolean): void {
    // Feature not available in basic UI
    console.warn('Auto-track not available in basic antenna UI');
  }

  /**
   * Override: Polarization control not available in basic UI (locked at 0°)
   */
  protected override handlePolarizationChange(_value: number): void {
    // Feature not available in basic UI - polarization locked at 0°
    console.warn('Polarization control not available in basic antenna UI');
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
