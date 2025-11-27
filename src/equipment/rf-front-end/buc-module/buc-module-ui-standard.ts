import { HelpButton } from '@app/components/help-btn/help-btn';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { ToggleSwitch } from '@app/components/toggle-switch/toggle-switch';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { RFFrontEnd } from '../rf-front-end';
import { BUCModuleCore, BUCState } from './buc-module-core';
import './buc-module.css';

/**
 * BUC Module UI Standard - Current UI Implementation
 * Contains DOM manipulation, HTML templates, component lifecycle
 */
export class BUCModuleUIStandard extends BUCModuleCore {
  // UI Components
  private readonly muteSwitch_: ToggleSwitch;
  private readonly loKnob_: RotaryKnob;
  private readonly loopbackSwitch_: ToggleSwitch;

  constructor(state: BUCState, rfFrontEnd: RFFrontEnd, unit: number, parentId: string) {
    // Create UI components BEFORE calling super
    const tempId = `rf-fe-buc-temp-${unit}`;

    // Initialize components with temp IDs
    const muteSwitch = ToggleSwitch.create(
      `${tempId}-mute`,
      state.isMuted,
      false
    );

    // Initialize LO knob (callback will be wired through base class event system)
    const loKnob = RotaryKnob.create(
      `${tempId}-lo-knob`,
      state.loFrequency,
      5850,
      6425,
      10,
      (value: number) => {
        // Direct state update - will be synced through event callback
        state.loFrequency = value as any;
      }
    );

    const loopbackSwitch = ToggleSwitch.create(
      `${tempId}-loopback`,
      state.isLoopback,
      false
    );

    // Call parent constructor
    super(state, rfFrontEnd, unit);

    // Store components
    this.muteSwitch_ = muteSwitch;
    this.loKnob_ = loKnob;
    this.loopbackSwitch_ = loopbackSwitch;

    // Create common UI components using base class methods
    this.createPowerSwitch();
    this.createGainKnob(0, 70, 1);

    this.helpBtn_ = HelpButton.create(
      `buc-help-${rfFrontEnd.state.uuid}`,
      "Block Upconverter",
      null,
      'https://docs.signalrange.space/equipment/block-upconverter?content-only=true&dark=true'
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
      <div class="rf-fe-module buc-module" id="${this.uniqueId}">
        <div class="module-label">
          <span>Block Upconverter</span>
          ${this.helpBtn_.html}
        </div>
        <div class="module-controls">
          <div class="led-indicators">
            <div class="led-indicator">
              <span class="indicator-label">LOCK</span>
              <div class="led-lock led ${this.getLockLedStatus()}"></div>
            </div>
            <div class="led-indicator">
              <span class="indicator-label">LOOPBACK</span>
              <div class="led-loopback led ${this.getLoopbackLedStatus()}"></div>
            </div>
          </div>
          <div class="input-knobs">
            <div class="control-group">
              <label>MUTE</label>
              ${this.muteSwitch_.html}
            </div>
            <div class="control-group">
              <label>LO (MHz)</label>
              ${this.loKnob_.html}
            </div>
            <div class="control-group">
              <label>GAIN (dB)</label>
              ${this.gainKnob_?.html || ''}
            </div>
            <div class="control-group">
              <label>LOOPBACK TO LNB</label>
              ${this.loopbackSwitch_.html}
            </div>
            <div class="control-group">
              ${this.powerSwitch_?.html || ''}
            </div>
          </div>
          <div class="status-displays">
            <div class="control-group">
              <label>LO (MHz)</label>
              <div class="digital-display buc-lo-display">${this.state_.loFrequency}</div>
            </div>
            <div class="control-group">
              <label>TEMP (°C)</label>
              <div class="digital-display buc-temp-display">${this.state_.temperature.toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>CURRENT (A)</label>
              <div class="digital-display buc-current-display">${this.state_.currentDraw.toFixed(2)}</div>
            </div>
            <div class="control-group">
              <label>FREQ ERR (kHz)</label>
              <div class="digital-display buc-freq-err-display">${(this.state_.frequencyError / 1000).toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>OUT PWR (dBm)</label>
              <div class="digital-display buc-out-pwr-display">${this.state_.outputPower.toFixed(1)}</div>
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
  addEventListeners(cb: (state: BUCState) => void): void {
    // Power switch handler using base class method
    this.addPowerSwitchListener(cb, () => {
      this.simulateLockAcquisition(2000, 2000, () => cb(this.state_));
    });

    // Mute switch handler
    this.muteSwitch_.addEventListeners((isMuted: boolean) => {
      this.handleMuteToggle(isMuted);
      this.syncDomWithState_();
      cb(this.state_);
    });

    // Note: LO knob callback is already set in constructor
    // RotaryKnob doesn't have addEventListeners method

    // Loopback switch handler
    this.loopbackSwitch_.addEventListeners((isLoopback: boolean) => {
      this.handleLoopbackToggle(isLoopback);
      this.syncDomWithState_();
      cb(this.state_);
    });
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<BUCState>): void {
    super.sync(state);

    // Sync common UI components using base class method
    this.syncCommonComponents(state);

    // Sync BUC-specific UI components
    if (this.loKnob_ && state.loFrequency !== undefined) {
      this.loKnob_.sync(state.loFrequency);
    }
    if (this.muteSwitch_ && state.isMuted !== undefined) {
      this.muteSwitch_.sync(state.isMuted);
    }
  }

  /**
   * Get UI components for composite layouts
   * Exposes BUC module components for parent to arrange in custom layouts
   */
  getComponents() {
    if (!this.powerSwitch_ || !this.gainKnob_) {
      throw new Error('BUC components not initialized');
    }
    return {
      powerSwitch: this.powerSwitch_,
      gainKnob: this.gainKnob_,
      muteSwitch: this.muteSwitch_,
      loKnob: this.loKnob_,
      loopbackSwitch: this.loopbackSwitch_,
      helpBtn: this.helpBtn_
    };
  }

  /**
   * Get display value functions for composite layouts
   * Returns functions that compute current display values
   */
  getDisplays() {
    return {
      loFrequency: () => this.state_.loFrequency.toString(),
      temperature: () => this.state_.temperature.toFixed(1),
      currentDraw: () => this.state_.currentDraw.toFixed(2),
      frequencyError: () => (this.state_.frequencyError / 1000).toFixed(1),
      outputPower: () => this.state_.outputPower.toFixed(1)
    };
  }

  /**
   * Get LED status functions for composite layouts
   * Returns functions that compute current LED states
   */
  getLEDs() {
    return {
      lock: () => this.getLockLedStatus(),
      loopback: () => this.getLoopbackLedStatus()
    };
  }

  /**
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    if (!this.hasStateChanged()) {
      return; // No changes, skip update
    }

    const container = qs('.buc-module');
    if (!container) return;

    // Update LO frequency display
    const loDisplay = qs('.buc-lo-display', container);
    if (loDisplay) {
      loDisplay.textContent = this.state_.loFrequency.toString();
    }

    // Update lock LED using base class method
    const lockLed = qs('.led-lock', container);
    if (lockLed) {
      lockLed.className = `led-lock led ${this.getLockLedStatus()}`;
    }

    // Update temperature display
    const tempDisplay = qs('.buc-temp-display', container);
    if (tempDisplay) {
      tempDisplay.textContent = this.state_.temperature.toFixed(1);
    }

    // Update current draw display
    const currentDisplay = qs('.buc-current-display', container);
    if (currentDisplay) {
      currentDisplay.textContent = this.state_.currentDraw.toFixed(2);
    }

    // Update frequency error display
    const freqErrDisplay = qs('.buc-freq-err-display', container);
    if (freqErrDisplay) {
      const freqErrKhz = this.state_.frequencyError / 1000;
      freqErrDisplay.textContent = freqErrKhz.toFixed(1);
      // Color code: green when locked, red when unlocked with error
      freqErrDisplay.style.color = this.state_.isExtRefLocked ? '#0f0' : '#f00';
    }

    // Update output power display
    const outPwrDisplay = qs('.buc-out-pwr-display', container);
    if (outPwrDisplay) {
      outPwrDisplay.textContent = this.state_.outputPower.toFixed(1);
      // Color code: yellow when approaching saturation
      const approachingSat = this.state_.outputPower > this.state_.saturationPower - 2;
      outPwrDisplay.style.color = approachingSat ? '#ff0' : '#0f0';
    }

    // Sync UI components using base class method for common components
    this.syncCommonComponents(this.state_);

    // Sync BUC-specific components
    this.loKnob_.sync(this.state_.loFrequency);
    this.muteSwitch_.sync(this.state_.isMuted);
    this.loopbackSwitch_.sync(this.state_.isLoopback);

    // Sync loopback LED
    const loopbackLed = qs('.led-loopback', container);
    if (loopbackLed) {
      loopbackLed.className = `led-loopback led ${this.getLoopbackLedStatus()}`;
    }
  }
}
