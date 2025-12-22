import { HelpButton } from '@app/components/help-btn/help-btn';
import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { SecureToggleSwitch } from '@app/components/secure-toggle-switch/secure-toggle-switch';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import type { dBW } from '@app/types';
import { RFFrontEndCore } from '../rf-front-end-core';
import { HPAModuleCore, HPAState } from './hpa-module-core';
import './hpa-module.css';

/**
 * HPA Module UI Standard - Current UI Implementation
 * Contains DOM manipulation, HTML templates, component lifecycle
 */
export class HPAModuleUIStandard extends HPAModuleCore {
  // UI Components
  private readonly backOffKnob: RotaryKnob;
  private readonly hpaSwitch_: SecureToggleSwitch;

  constructor(state: HPAState, rfFrontEnd: RFFrontEndCore, unit: number, parentId: string) {
    // Create UI components BEFORE calling super
    const tempId = `rf-fe-hpa-temp-${unit}`;

    const backOffKnob = RotaryKnob.create(
      `${tempId}-backoff-knob`,
      state.backOff,
      0,
      30,
      0.5,
      (value: number) => {
        // Direct state update - will be synced through event callback
        state.backOff = value;
      }
    );

    // Call parent constructor
    super(state, rfFrontEnd, unit);

    // Store components
    this.backOffKnob = backOffKnob;

    // Create power switch with HPA-specific settings
    this.powerSwitch_ = PowerSwitch.create(
      `${this.uniqueId}-power`,
      this.state.isPowered,
      true,
      false,
    );

    // HPA switch needs special handling - create after super() call
    this.hpaSwitch_ = SecureToggleSwitch.create(
      `hpa-switch-${rfFrontEnd.state.uuid}`,
      this.toggleHpa_.bind(this),
      state.isHpaSwitchEnabled,
      false
    );

    this.helpBtn_ = HelpButton.create(
      `hpa-help-${rfFrontEnd.state.uuid}`,
      "High Power Amplifier",
      null,
      'https://docs.signalrange.space/equipment/high-power-amplifier?content-only=true&dark=true'
    );

    // Build UI (only if parentId is provided)
    if (parentId) {
      super.build(parentId);
    } else {
      // Backward compatibility: just generate HTML without injecting
      this.generateHtml_();
    }
  }

  /**
   * Generate HTML without injecting (for backward compatibility)
   */
  private generateHtml_(): void {
    this.html_ = html`
      <div class="rf-fe-module hpa-module" id="${this.uniqueId}">
        <div class="module-label">
          <span>High Power Amplifier</span>
          ${this.helpBtn_.html}
        </div>
        <div class="module-controls">
          <div class="led-indicators">
            <div class="led-indicator">
              <span class="indicator-label">IMD</span>
              <div class="led ${this.state.isOverdriven ? 'led-orange' : 'led-off'}"></div>
            </div>
          </div>
          <div class="input-knobs">
            <div class="control-group">
              ${this.powerSwitch_?.html || ''}
            </div>
            <div class="hpa-switch">
              ${this.hpaSwitch_.html}
            </div>
            <div class="control-group">
              <label>BACK-OFF (dB)</label>
              ${this.backOffKnob.html}
            </div>
            <div class="hpa-main-inputs">
            <div class="power-meter">
                <div class="meter-label">OUTPUT</div>
                <div class="led-bar">
                  ${this.renderPowerMeter_((this.state.outputPower - 30) as dBW)}
                </div>
                <span class="value-readout">${this.state.outputPower.toFixed(1)} dBW</span>
              </div>
            </div>
            <div class="status-displays">
              <div class="control-group">
                <label>IMD (dBc)</label>
                <div class="digital-display hpa-imd">${this.state.imdLevel.toFixed(3)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize DOM structure
   */
  protected initializeDom(parentId: string): HTMLElement {
    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Parent element ${parentId} not found`);

    // Generate HTML
    this.generateHtml_();

    // Inject into parent
    parent.innerHTML += this.html_;

    // Cache DOM element
    this.dom_ = document.getElementById(this.uniqueId)!;

    return parent;
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: HPAState) => void): void {
    if (!this.powerSwitch_ || !this.backOffKnob) {
      console.warn('HPAModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Enable switch handler using base class method
    this.addPowerSwitchListener(cb, () => {
      this.handlePowerToggle(this.state.isPowered, (state) => {
        // Update power switch to match actual state (may differ from requested)
        if (this.powerSwitch_) {
          this.powerSwitch_.sync(state.isPowered);
        }
        this.syncDomWithState_();
        cb(state);
      });
    });

    // Note: Back-off knob callback is already set in constructor
    // RotaryKnob doesn't have addEventListeners method
  }

  private toggleHpa_(): void {
    this.handleHpaToggle();
    this.syncDomWithState_();
  }

  /**
   * Get UI components for composite layouts
   * Exposes HPA module components for parent to arrange in custom layouts
   */
  getComponents() {
    if (!this.powerSwitch_ || !this.backOffKnob) {
      throw new Error('HPA components not initialized');
    }
    return {
      powerSwitch: this.powerSwitch_,
      backOffKnob: this.backOffKnob,
      hpaSwitch: this.hpaSwitch_,
      helpBtn: this.helpBtn_
    };
  }

  /**
   * Get display value functions for composite layouts
   * Returns functions that compute current display values
   */
  getDisplays() {
    return {
      outputPower: () => this.state.outputPower.toFixed(1),
      imdLevel: () => this.state.imdLevel.toFixed(3)
    };
  }

  /**
   * Get LED status functions for composite layouts
   * Returns functions that compute current LED states
   */
  getLEDs() {
    return {
      imd: () => this.state.isOverdriven ? 'led-orange' : 'led-off'
    };
  }

  /**
   * Get power meter HTML for composite layouts
   * Returns function that renders power meter
   */
  getPowerMeter() {
    return {
      render: () => this.renderPowerMeter_((this.state.outputPower - 30) as dBW)
    };
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<HPAState>): void {
    super.sync(state);

    // Sync common UI components using base class method
    this.syncCommonComponents(state);

    // Sync HPA-specific UI components
    if (this.backOffKnob && state.backOff !== undefined) {
      this.backOffKnob.sync(state.backOff);
    }
  }

  /**
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    if (!this.hasStateChanged()) {
      return; // No changes, skip update
    }

    const container = qs('.hpa-module');
    if (!container) return;

    // Update output power display
    const powerReadout = qs('.power-meter .value-readout', container);
    if (powerReadout) {
      powerReadout.textContent = `${this.state.outputPower.toFixed(1)} dBW`;
    }

    // Update power meter LEDs
    const ledBar = qs('.led-bar', container);
    if (ledBar) {
      ledBar.innerHTML = this.renderPowerMeter_((this.state.outputPower - 30) as dBW);
    }

    // Update IMD LED
    const imdLed = qs('.led-indicator .led', container);
    if (imdLed) {
      imdLed.className = `led ${this.state.isOverdriven ? 'led-orange' : 'led-off'}`;
    }

    // Update IMD readout
    const imdReadout = qs('.hpa-imd', container);
    if (imdReadout) {
      imdReadout.textContent = `${this.state.imdLevel}`;
    }

    this.hpaSwitch_.sync(this.state.isHpaSwitchEnabled);

    // Sync UI components using base class method
    this.syncCommonComponents(this.state);

    // Sync HPA-specific components
    this.backOffKnob.sync(this.state.backOff);
  }
}
