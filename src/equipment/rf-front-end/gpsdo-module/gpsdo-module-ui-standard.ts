import { HelpButton } from '@app/components/help-btn/help-btn';
import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { ToggleSwitch } from '@app/components/toggle-switch/toggle-switch';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { GPSDOState } from '.';
import { RFFrontEndCore } from '../rf-front-end-core';
import { GPSDOModuleCore } from './gpsdo-module-core';
import './gpsdo-module.css';

/**
 * GPSDO Module UI Standard - Current UI Implementation
 * Contains DOM manipulation, HTML templates, component lifecycle
 */
export class GPSDOModuleUIStandard extends GPSDOModuleCore {
  // UI Components
  private readonly gnssSwitch_: ToggleSwitch;

  // DOM caching for performance
  private domCache_: Record<string, HTMLElement> = {};

  constructor(state: GPSDOState, rfFrontEnd: RFFrontEndCore, unit: number, parentId: string) {
    // Call parent constructor
    super(state, rfFrontEnd, unit);

    this.powerSwitch_ = PowerSwitch.create(
      `${this.uniqueId}-power`,
      this.state.isPowered,
      false,
      true,
    );

    this.gnssSwitch_ = ToggleSwitch.create(
      `${this.uniqueId}-gnss`,
      this.state.isGnssSwitchUp,
      false
    );

    this.helpBtn_ = HelpButton.create(
      `gpsdo-help-${rfFrontEnd.state.uuid}`,
      "GPS Disciplined Oscillator",
      null,
      'https://docs.signalrange.space/equipment/gps-disciplined-oscillator?content-only=true&dark=true'
    );

    // Build UI (only if parentId is provided)
    if (parentId) {
      super.build(parentId);
    } else {
      // Backward compatibility: just generate HTML without injecting
      this.generateHtml_();
    }

    EventBus.getInstance().on(Events.SYNC, this.sync.bind(this));
  }

  /**
   * Generate HTML without injecting (for backward compatibility)
   */
  private generateHtml_(): void {
    this.html_ = html`
      <div class="rf-fe-module gpsdo-module" id="${this.uniqueId}">
        <div class="module-label">
          <span>GPS Disciplined Oscillator</span>
          ${this.helpBtn_.html}
        </div>
        <div class="module-controls">
          <div class="split-top-section">
            <!-- Input Knobs -->
            <div class="input-knobs">
              <div class="control-group">
                <label>GNSS</label>
                ${this.gnssSwitch_.html}
              </div>
            </div>
            <!-- Status LEDs -->
            <div class="led-indicators">
              <div id="lock-led" class="led-indicator">
                <span class="indicator-label">LOCK</span>
                <div class="led ${this.getLockLedStatus_()}"></div>
              </div>
              <div id="gnss-led" class="led-indicator">
                <span class="indicator-label">GNSS</span>
                <div class="led ${this.getGnssLedStatus_()}"></div>
              </div>
              <div id="warm-led" class="led-indicator">
                <span class="indicator-label">WARM</span>
                <div class="led ${this.getWarmupLedStatus_()}"></div>
              </div>
            </div>
          </div>

          <!-- Status Displays -->
          <div class="status-displays">
            <div class="control-group">
              <label>FREQ ACCURACY (×10⁻¹¹)</label>
              <div class="digital-display gpsdo-freq-accuracy">${this.state.frequencyAccuracy.toFixed(3)}</div>
            </div>
            <div class="control-group">
              <label>STABILITY (×10⁻¹¹)</label>
              <div class="digital-display gpsdo-stability">${this.state.allanDeviation.toFixed(3)}</div>
            </div>
            <div class="control-group">
              <label>PHASE NOISE (dBc/Hz)</label>
              <div class="digital-display gpsdo-phase-noise">${this.state.phaseNoise.toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>SATELLITES</label>
              <div class="digital-display gpsdo-sats">${this.state.satelliteCount}</div>
            </div>
            <div class="control-group">
              <label>UTC (ns)</label>
              <div class="digital-display gpsdo-utc">${this.state.utcAccuracy.toFixed(0)}</div>
            </div>
            <div class="control-group">
              <label>TEMP (°C)</label>
              <div class="digital-display gpsdo-temp">${this.state.temperature.toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>WARMUP</label>
              <div class="digital-display gpsdo-warmup">${this.formatWarmupTime_()}</div>
            </div>
            <div class="control-group">
              <label>OUTPUTS</label>
              <div class="digital-display gpsdo-outputs">${this.state.active10MHzOutputs}/${this.state.max10MHzOutputs}</div>
            </div>
            <div class="control-group">
              <label>HOLDOVER (μs)</label>
              <div class="digital-display gpsdo-holdover">${this.state.holdoverError.toFixed(1)}</div>
            </div>
          </div>

          <!-- Controls -->
        </div>
        <div class="control-group power-switch">
          ${this.powerSwitch_.html}
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
  addEventListeners(cb: (state: GPSDOState) => void): void {
    if (!this.powerSwitch_ || !this.gnssSwitch_) {
      console.warn('GPSDOModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Power switch handler
    this.powerSwitch_.addEventListeners((isPowered: boolean) => {
      this.handlePowerToggle(isPowered);
      this.syncDomWithState_();
      cb(this.state);
    });

    // GNSS switch handler
    this.gnssSwitch_.addEventListeners((isGnssSwitchUp: boolean) => {
      this.handleGnssToggle(isGnssSwitchUp, (state) => {
        this.syncDomWithState_();
        cb(state);
      });
      this.syncDomWithState_();
      cb(this.state);
    });

    this.initializeDomCache_();
  }

  private initializeDomCache_() {
    const container = qs(`#${this.uniqueId}`);
    if (!container) {
      throw new Error(`GPSDOModule: Cannot initialize DOM cache - container #${this.uniqueId} not found`);
    }

    const lockLedElement = qs('#lock-led .led', container);
    const gnssLedElement = qs('#gnss-led .led', container);
    const warmLedElement = qs('#warm-led .led', container);
    const freqAccuracyElement = qs('.gpsdo-freq-accuracy', container);
    const stabilityElement = qs('.gpsdo-stability', container);
    const phaseNoiseElement = qs('.gpsdo-phase-noise', container);
    const satsElement = qs('.gpsdo-sats', container);
    const utcElement = qs('.gpsdo-utc', container);
    const tempElement = qs('.gpsdo-temp', container);
    const warmupLedElement = qs('.gpsdo-warmup', container);
    const outputsElement = qs('.gpsdo-outputs', container);
    const holdoverElement = qs('.gpsdo-holdover', container);

    if (!lockLedElement || !gnssLedElement || !warmLedElement ||
      !freqAccuracyElement || !stabilityElement || !phaseNoiseElement ||
      !satsElement || !utcElement || !tempElement || !warmupLedElement ||
      !outputsElement || !holdoverElement) {
      throw new Error('GPSDOModule: Cannot initialize DOM cache - one or more elements not found');
    }

    this.domCache_ = {
      container,
      lockLed: lockLedElement,
      gnssLed: gnssLedElement,
      warmLed: warmLedElement,
      freqAccuracy: freqAccuracyElement,
      stability: stabilityElement,
      phaseNoise: phaseNoiseElement,
      sats: satsElement,
      utc: utcElement,
      temp: tempElement,
      warmup: warmupLedElement,
      outputs: outputsElement,
      holdover: holdoverElement,
    };
  }

  /**
   * Get UI components for composite layouts
   * Exposes GPSDO module components for parent to arrange in custom layouts
   */
  getComponents() {
    if (!this.powerSwitch_ || !this.gnssSwitch_) {
      throw new Error('GPSDO components not initialized');
    }
    return {
      powerSwitch: this.powerSwitch_,
      gnssSwitch: this.gnssSwitch_,
      helpBtn: this.helpBtn_
    };
  }

  /**
   * Get display value functions for composite layouts
   * Returns functions that compute current display values
   */
  getDisplays() {
    return {
      frequencyAccuracy: () => this.state.frequencyAccuracy.toFixed(3),
      allanDeviation: () => this.state.allanDeviation.toFixed(3),
      phaseNoise: () => this.state.phaseNoise.toFixed(1),
      satelliteCount: () => this.state.satelliteCount.toString(),
      utcAccuracy: () => this.state.utcAccuracy.toFixed(0),
      temperature: () => this.state.temperature.toFixed(1),
      warmupTime: () => this.formatWarmupTime_(),
      outputs: () => `${this.state.active10MHzOutputs}/${this.state.max10MHzOutputs}`,
      holdoverError: () => this.state.holdoverError.toFixed(1)
    };
  }

  /**
   * Get LED status functions for composite layouts
   * Returns functions that compute current LED states
   */
  getLEDs() {
    return {
      lock: () => this.getLockLedStatus_(),
      gnss: () => this.getGnssLedStatus_(),
      warm: () => this.getWarmupLedStatus_()
    };
  }

  /**
   * Sync state from external source
   */
  sync(state?: Partial<GPSDOState>): void {
    super.sync(state);

    // Update UI components
    if (this.powerSwitch_ && state?.isPowered !== undefined) {
      this.powerSwitch_.sync(state.isPowered);
    }
    if (this.gnssSwitch_ && state?.gnssSignalPresent !== undefined) {
      this.gnssSwitch_.sync(state.gnssSignalPresent);
    }
  }

  /**
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    if (!this.hasStateChanged()) {
      return; // No changes, skip update
    }

    if (this.state.isPowered && !this.stabilityInterval_) {
      this.startStabilityMonitor_();
    }

    // Update LEDs
    this.domCache_.lockLed.className = `led ${this.getLockLedStatus_()}`;
    this.domCache_.gnssLed.className = `led ${this.getGnssLedStatus_()}`;
    this.domCache_.warmLed.className = `led ${this.getWarmupLedStatus_()}`;

    if (!this.state.isPowered) {
      // If powered off, make all screens blank and greyed out using a CSS class
      const statusDisplays = this.domCache_.container.querySelector('.status-displays');
      if (statusDisplays) {
        statusDisplays.classList.add('status-displays-off');
      }
      this.domCache_.freqAccuracy.textContent = '---.--';
      this.domCache_.stability.textContent = '---.--';
      this.domCache_.phaseNoise.textContent = '---.-';
      this.domCache_.sats.textContent = '--';
      this.domCache_.utc.textContent = '---';
      this.domCache_.temp.textContent = '--.-';
      this.domCache_.warmup.textContent = '----';
      this.domCache_.outputs.textContent = '--/--';
      this.domCache_.holdover.textContent = '---.-';
    } else {
      // Remove powered-off class
      const statusDisplays = this.domCache_.container.querySelector('.status-displays');
      if (statusDisplays) {
        statusDisplays.classList.remove('status-displays-off');
      }
      // Update displays
      this.domCache_.freqAccuracy.textContent = this.state.frequencyAccuracy.toFixed(3);
      this.domCache_.stability.textContent = this.state.allanDeviation.toFixed(3);
      this.domCache_.phaseNoise.textContent = this.state.phaseNoise.toFixed(1);
      this.domCache_.sats.textContent = this.state.satelliteCount.toString();
      this.domCache_.utc.textContent = this.state.utcAccuracy.toFixed(0);
      this.domCache_.temp.textContent = this.state.temperature.toFixed(1);
      this.domCache_.warmup.textContent = this.formatWarmupTime_();
      this.domCache_.outputs.textContent = `${this.state.active10MHzOutputs}/${this.state.max10MHzOutputs}`;

      this.domCache_.holdover.textContent = (this.state.holdoverError).toFixed(3);
    }

    // Sync UI components
    this.powerSwitch_.sync(this.state.isPowered);
    this.gnssSwitch_.sync(this.state.isGnssSwitchUp);
  }

  // Override hooks to trigger DOM updates
  protected onWarmupTick(): void {
    this.syncDomWithState_();
  }

  protected onStabilityTick(): void {
    this.syncDomWithState_();
  }

  protected onHoldoverTick(): void {
    this.syncDomWithState_();
  }
}
