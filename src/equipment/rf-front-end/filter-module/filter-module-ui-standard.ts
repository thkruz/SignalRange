import { HelpButton } from '@app/components/help-btn/help-btn';
import { RotaryKnob } from "@app/components/rotary-knob/rotary-knob";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { RFFrontEnd } from '../rf-front-end';
import { FILTER_BANDWIDTH_CONFIGS, IfFilterBankModuleCore, IfFilterBankState } from './filter-module-core';
import './filter-module.css';

/**
 * IF Filter Bank Module UI Standard - Current UI Implementation
 * Contains DOM manipulation, HTML templates, component lifecycle
 */
export class IfFilterBankModuleUIStandard extends IfFilterBankModuleCore {
  // UI Components
  private readonly bandwidthKnob_: RotaryKnob;

  constructor(state: IfFilterBankState, rfFrontEnd: RFFrontEnd, unit: number, parentId: string) {
    // Create UI components BEFORE calling super
    const config = FILTER_BANDWIDTH_CONFIGS[state.bandwidthIndex];

    // Create rotary knob for bandwidth selection (0-13)
    const bandwidthKnob = RotaryKnob.create(
      'filter-bandwidth-knob',
      state.bandwidthIndex,
      0, // min (OFF)
      FILTER_BANDWIDTH_CONFIGS.length - 1, // max (320 MHz)
      1, // step
      (value: number) => {
        this.handleBandwidthChange(value);
        this.syncDomWithState_();
        // Notify parent of state change
        this.rfFrontEnd_.update();
      },
      config.label
    );

    // Call parent constructor
    super(state, rfFrontEnd, unit);

    // Store components
    this.bandwidthKnob_ = bandwidthKnob;

    this.helpBtn_ = HelpButton.create(
      `filter-help-${rfFrontEnd.state.uuid}`,
      "IF Filter Bank",
      null,
      'https://docs.signalrange.space/equipment/if-filter-bank?content-only=true&dark=true'
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
      <div class="rf-fe-module filter-module" id="${this.uniqueId}">
        <div class="module-label">
          <span>IF FILTER BANK</span>
          ${this.helpBtn_.html}
        </div>
        <div class="module-controls">
          <div class="split-top-section">
            <div class="led-indicators">
              <div class="led-indicator">
                <span class="indicator-label">INSERTION LOSS</span>
                <div id="insertion-loss-led" class="led led-orange" style="opacity: ${this.state_.insertionLoss / 3}"></div>
              </div>
              <div class="value-display">
                <span class="display-label">NOISE FLOOR:</span>
                <div id="noise-floor-led" class="led led-orange"></div>
              </div>
            </div>
          </div>
          <div class="status-displays">
            <div class="control-group">
              <label>BANDWIDTH</label>
              <div class="knob-container">
                ${this.bandwidthKnob_.html}
              </div>
            </div>
            <div class="control-group">
              <label>INSERTION LOSS (dB)</label>
              <div class="digital-display filter-insertion-loss-display">${this.state_.insertionLoss.toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>NOISE FLOOR (dBm)</label>
              <div class="digital-display filter-noise-floor-display">${this.state_.noiseFloor.toFixed(0)}</div>
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
  addEventListeners(_cb: (state: IfFilterBankState) => void): void {
    const container = qs('.filter-module');
    if (!container) {
      console.warn('FilterModule: Cannot add event listeners - container not found');
      return;
    }

    // Note: Bandwidth knob callback is already set in constructor
    // RotaryKnob doesn't have addEventListeners method
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<IfFilterBankState>): void {
    super.sync(state);

    this.bandwidthKnob_.sync(this.state_.bandwidthIndex);
    this.syncDomWithState_();
  }

  /**
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    if (!this.hasStateChanged()) {
      return; // No changes, skip update
    }

    const container = qs('.filter-module');
    if (!container) return;

    const config = this.getFilterConfig();

    const knobLabelElement = qs('.knob-value', this.bandwidthKnob_.dom);
    // Update knob label
    if (knobLabelElement) {
      knobLabelElement.textContent = config.label;
    }

    // Update bandwidth knob value override
    this.bandwidthKnob_.valueOverride = config.label;

    // TODO: We should be using a domCache instead of querying each time

    // Update insertion loss LED
    qs('#insertion-loss-led', container)!.style.opacity = (this.state_.insertionLoss / 3.5).toString();

    // Update noise floor LED
    // Color Scale from -130 dBm (green) to -40 dBm (green)
    const noiseFloorLed = qs('#noise-floor-led', container);
    if (!noiseFloorLed) throw new Error('Noise floor LED element not found');
    const externalNoiseFloor = this.rfFrontEnd_.signalPathManager.getExternalNoise();
    if (externalNoiseFloor <= -100) {
      noiseFloorLed.className = 'led led-green';
    } else if (externalNoiseFloor > -100 && externalNoiseFloor <= -70) {
      noiseFloorLed.className = 'led led-orange';
    } else if (externalNoiseFloor > -70) {
      noiseFloorLed.className = 'led led-red';
    }

    // Update insertion loss readout
    qs('.filter-insertion-loss-display', container)!.textContent = `${this.state_.insertionLoss.toFixed(1)}`;
    // Update noise floor display
    qs('.filter-noise-floor-display', container)!.textContent = `${this.rfFrontEnd_.signalPathManager.getExternalNoise().toFixed(0)}`;
  }
}
