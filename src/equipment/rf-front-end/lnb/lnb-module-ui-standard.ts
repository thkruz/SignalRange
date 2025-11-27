import { HelpButton } from "@app/components/help-btn/help-btn";
import { RotaryKnob } from "@app/components/rotary-knob/rotary-knob";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { RFFrontEnd } from '../rf-front-end';
import { LNBModuleCore, LNBState } from './lnb-module-core';
import './lnb-module.css';

/**
 * LNB Module UI Standard - Current UI Implementation
 * Contains DOM manipulation, HTML templates, component lifecycle
 */
export class LNBModuleUIStandard extends LNBModuleCore {
  // UI Components
  private readonly loKnob_: RotaryKnob;

  // Track last applied brightness level to avoid unnecessary DOM updates
  private lastNoiseTempBrightnessLevel_: number = -1;

  constructor(state: LNBState, rfFrontEnd: RFFrontEnd, unit: number, parentId: string) {
    // Create UI components BEFORE calling super
    const tempId = `rf-fe-lnb-temp-${unit}`;

    // Initialize LO knob (callback will be wired through base class event system)
    const loKnob = RotaryKnob.create(
      `${tempId}-lo-knob`,
      state.loFrequency,
      5100,
      6075,
      10,
      (value: number) => {
        // Direct state update - will be synced through event callback
        state.loFrequency = value as any;
      }
    );

    // Call parent constructor
    super(state, rfFrontEnd, unit);

    // Store components
    this.loKnob_ = loKnob;

    // Create common UI components using base class methods
    this.createPowerSwitch();
    this.createGainKnob(0, 70, 1);

    this.helpBtn_ = HelpButton.create(
      `lnb-help-${rfFrontEnd.state.uuid}`,
      "Low Noise Block",
      null,
      'https://docs.signalrange.space/equipment/low-noise-block-downconverter?content-only=true&dark=true'
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
      <div class="rf-fe-module lnb-module" id="${this.uniqueId}">
        <div class="module-label">
          <span>Low Noise Block</span>
          ${this.helpBtn_.html}
        </div>
        <div class="module-controls">
          <div class="split-top-section">
            <div class="led-indicators">
              <div class="led-indicator">
                <span class="indicator-label">LOCK</span>
                <div class="led ${this.getLockLedStatus()}"></div>
              </div>
              <div class="led-indicator">
                <span class="indicator-label">NOISE TEMP</span>
                <div class="led led-noise led-blue" style="filter: brightness(${this.getNoiseTempBrightness__()})"></div>
              </div>
            </div>
          </div>
          <div class="input-knobs">
            <div class="control-group">
                <label>LO (MHz)</label>
                ${this.loKnob_.html}
              </div>
            <div class="control-group">
              <label>GAIN (dB)</label>
              ${this.gainKnob_?.html || ''}
            </div>
            <div>
              <!-- Spacer -->
            </div>
            <div class="control-group power-switch">
              ${this.powerSwitch_?.html || ''}
            </div>
          </div>
          <div class="status-displays">
            <div class="control-group">
              <label>LO (MHz)</label>
              <div class="digital-display lnb-lo-display">${this.state_.loFrequency}</div>
            </div>
            <div class="control-group">
              <label>NOISE TEMP (K)</label>
              <div class="digital-display lnb-noise-temp-display">${this.state_.noiseTemperature.toFixed(0)}</div>
            </div>
            <div class="control-group">
              <label>TEMP (°C)</label>
              <div class="digital-display lnb-temp-display">${this.state_.temperature.toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>FREQ ERR (MHz)</label>
              <div class="digital-display lnb-freq-err-display">${(this.state_.frequencyError / 1e6).toFixed(3)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private getNoiseTempBrightness__(): number {
    // Typical noise temperature range: ~90K (bright) to 290K+ (dim)
    // To map 90K -> ~2, 290K -> ~0, use denominator ~100
    return Math.max(2 - this.state_.noiseTemperature / 100, 0);
  }

  /**
   * Get discrete brightness level to avoid frequent DOM updates
   * Uses 6 levels from 0.0 to 2.0 in steps of 0.4
   */
  private getNoiseTempBrightnessLevel__(): number {
    const continuousBrightness = this.getNoiseTempBrightness__();
    // Snap to discrete levels: 0.0, 0.4, 0.8, 1.2, 1.6, 2.0
    const levelStep = 0.4;
    return Math.round(continuousBrightness / levelStep) * levelStep;
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
  addEventListeners(cb: (state: LNBState) => void): void {
    if (!this.powerSwitch_ || !this.gainKnob_) {
      console.warn('LNBModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Power switch handler using base class method
    this.addPowerSwitchListener(cb, () => {
      this.handlePowerToggle();
      this.simulateLockAcquisition(2000, 2000, () => cb(this.state_));
    });

    // Note: LO knob callback is already set in constructor
    // RotaryKnob doesn't have addEventListeners method
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<LNBState>): void {
    super.sync(state);

    // Sync common UI components using base class method
    this.syncCommonComponents(state);

    // Sync LNB-specific UI components
    if (this.loKnob_ && state.loFrequency !== undefined) {
      this.loKnob_.sync(state.loFrequency);
    }
  }

  /**
   * Get UI components for composite layouts
   * Exposes LNB module components for parent to arrange in custom layouts
   */
  getComponents() {
    if (!this.powerSwitch_ || !this.gainKnob_) {
      throw new Error('LNB components not initialized');
    }
    return {
      powerSwitch: this.powerSwitch_,
      gainKnob: this.gainKnob_,
      loKnob: this.loKnob_,
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
      noiseTemperature: () => this.state_.noiseTemperature.toFixed(1),
      temperature: () => this.state_.temperature.toFixed(1),
      frequencyError: () => (this.state_.frequencyError / 1e6).toFixed(3)
    };
  }

  /**
   * Get LED status functions for composite layouts
   * Returns functions that compute current LED states
   */
  getLEDs() {
    return {
      lock: () => this.getLockLedStatus(),
      noiseTempBrightness: () => this.getNoiseTempBrightnessLevel__()
    };
  }

  /**
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    if (!this.hasStateChanged()) {
      return; // No changes, skip update
    }

    const container = qs('.lnb-module');
    if (!container) return;

    // Update LO frequency display
    const loDisplay = qs('.lnb-lo-display', container);
    if (loDisplay) {
      loDisplay.textContent = this.state_.loFrequency.toString();
    }

    // Update lock LED using base class method
    const lockLed = qs('.led-indicator .led', container);
    if (lockLed) {
      lockLed.className = `led ${this.state_.isPowered ? this.getLockLedStatus() : 'led-off'}`;
    }

    // Update noise temperature display and LED
    const noiseTempReadout = qs('.lnb-noise-temp-display', container);
    if (noiseTempReadout) {
      noiseTempReadout.textContent = `${this.state_.noiseTemperature.toFixed(1)}`;
    }

    const noiseTempLed = qs('.led-noise', container);
    if (noiseTempLed && this.state_.isPowered) {
      noiseTempLed.classList.remove('led-off');
      noiseTempLed.classList.add('led-blue');

      // Only update brightness if the discrete level has changed
      const brightnessLevel = this.getNoiseTempBrightnessLevel__();
      if (brightnessLevel !== this.lastNoiseTempBrightnessLevel_) {
        noiseTempLed.style.filter = `brightness(${brightnessLevel})`;
        this.lastNoiseTempBrightnessLevel_ = brightnessLevel;
      }
    } else if (noiseTempLed) {
      noiseTempLed.style.filter = '';
      noiseTempLed.classList.add('led-off');
      noiseTempLed.classList.remove('led-blue');
      this.lastNoiseTempBrightnessLevel_ = -1; // Reset tracking
    }

    // Update physical temperature display
    const tempDisplay = qs('.lnb-temp-display', container);
    if (tempDisplay) {
      tempDisplay.textContent = this.state_.temperature.toFixed(1);
    }

    // Update frequency error display
    const freqErrDisplay = qs('.lnb-freq-err-display', container);
    if (freqErrDisplay) {
      freqErrDisplay.textContent = (this.state_.frequencyError / 1e6).toFixed(3);
    }

    // Sync UI components using base class method
    this.syncCommonComponents(this.state_);

    // Sync LNB-specific components
    this.loKnob_.sync(this.state_.loFrequency);
  }
}
