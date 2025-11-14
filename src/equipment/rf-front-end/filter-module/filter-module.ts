import { RotaryKnob } from "@app/components/rotary-knob/rotary-knob";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { dBm, IfSignal, MHz, RfFrequency, SignalOrigin } from '@app/types';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './filter-module.css';

/**
 * Filter bandwidth configuration
 */
export interface FilterBandwidthConfig {
  bandwidth: MHz; // MHz (0 = Off)
  noiseFloor: number; // dBm
  insertionLoss: number; // dB
  label: string;
}

/**
 * Available filter bandwidth settings (0-12, where 0 = Off)
 */
export const FILTER_BANDWIDTH_CONFIGS: FilterBandwidthConfig[] = [
  { bandwidth: 0.03 as MHz, noiseFloor: -129, insertionLoss: 3.5, label: '30 kHz' },
  { bandwidth: 0.1 as MHz, noiseFloor: -124, insertionLoss: 3.2, label: '100 kHz' },
  { bandwidth: 0.2 as MHz, noiseFloor: -121, insertionLoss: 3.0, label: '200 kHz' },
  { bandwidth: 0.5 as MHz, noiseFloor: -117, insertionLoss: 2.9, label: '500 kHz' },
  { bandwidth: 1 as MHz, noiseFloor: -114, insertionLoss: 2.8, label: '1 MHz' },
  { bandwidth: 2 as MHz, noiseFloor: -111, insertionLoss: 2.6, label: '2 MHz' },
  { bandwidth: 5 as MHz, noiseFloor: -107, insertionLoss: 2.4, label: '5 MHz' },
  { bandwidth: 10 as MHz, noiseFloor: -104, insertionLoss: 2.2, label: '10 MHz' },
  { bandwidth: 20 as MHz, noiseFloor: -101, insertionLoss: 2.0, label: '20 MHz' },
  { bandwidth: 40 as MHz, noiseFloor: -98, insertionLoss: 1.8, label: '40 MHz' },
  { bandwidth: 80 as MHz, noiseFloor: -95, insertionLoss: 1.6, label: '80 MHz' },
  { bandwidth: 160 as MHz, noiseFloor: -92, insertionLoss: 1.5, label: '160 MHz' },
  { bandwidth: 320 as MHz, noiseFloor: -89, insertionLoss: 1.5, label: '320 MHz' },
];

/**
 * Preselector/Filter module state
 */
export interface IfFilterBankState {
  isPowered: boolean;
  bandwidthIndex: number; // Index into FILTER_BANDWIDTH_CONFIGS (0-13)
  bandwidth: MHz; // MHz
  insertionLoss: number; // dB
  centerFrequency: RfFrequency; // Hz
  noiseFloor: number; // dBm
}

export class IfFilterBankModule extends RFFrontEndModule<IfFilterBankState> {
  // UI Components
  private readonly bandwidthKnob_: RotaryKnob;

  // Signals
  outputSignals: IfSignal[] = [];

  /**
   * Get default state for IF Filter Bank module
   */
  static getDefaultState(): IfFilterBankState {
    return {
      isPowered: true,
      bandwidthIndex: 9, // 20 MHz
      bandwidth: 20 as MHz, // MHz
      insertionLoss: 2.0, // dB
      centerFrequency: 5800 * 1e6 as RfFrequency, // 5.8 GHz
      noiseFloor: -101, // dBm
    };
  }

  constructor(state: IfFilterBankState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-filter', unit);

    const config = FILTER_BANDWIDTH_CONFIGS[state.bandwidthIndex];

    // Create rotary knob for bandwidth selection (0-13)
    this.bandwidthKnob_ = RotaryKnob.create(
      'filter-bandwidth-knob',
      state.bandwidthIndex,
      0, // min (OFF)
      FILTER_BANDWIDTH_CONFIGS.length - 1, // max (320 MHz)
      1, // step
      (value: number) => {
        this.state_.bandwidthIndex = Math.round(value);
        this.updateFilterCharacteristics_();
        this.syncDomWithState_();
        // Notify parent of state change
        this.rfFrontEnd_.update();
      },
      config.label
    );

    this.html_ = html`
      <div class="rf-fe-module filter-module">
        <div class="module-label">IF FILTER BANK</div>
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
   * Add event listeners for user interactions
   */
  addEventListeners(_cb: (state: IfFilterBankState) => void): void {
    const container = qs('.filter-module');
    if (!container) {
      console.warn('FilterModule: Cannot add event listeners - container not found');
      return;
    }
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    this.outputSignals = this.inputSignals.map((sig: IfSignal) => {

      // if filter bank bandwidth is this.specA.rfFrontEnd_.filterModule.state.bandwidth * 1e6
      // what should happen if the signal bandwidth is greater than that?

      if (sig.bandwidth > this.state.bandwidth * 1e6) {
        // Apply additional attenuation for out-of-band signals
        // Ps,out​=Ps​+10log10​(Bs​Bf​​)
        const bandwidthRatio = sig.bandwidth / ((this.state.bandwidth * 1e6) / 2);
        const attenuationDb = 10 * Math.log10(bandwidthRatio);
        sig.power = sig.power - attenuationDb as dBm;
      }

      return {
        ...sig,
        power: (sig.power - this.state_.insertionLoss) as dBm,
        origin: SignalOrigin.IF_FILTER_BANK,
      };
    });
  }

  get inputSignals(): IfSignal[] {
    const lnbSignals = this.rfFrontEnd_.lnbModule.ifSignals;
    const txLoopbackSignals = this.rfFrontEnd_.transmitters
      .flatMap((tx) => tx.state.modems
        .filter((modem) => modem.isTransmitting && !modem.isFaulted && modem.isLoopback)
        .map((modem) => modem.ifSignal));

    return [...lnbSignals, ...txLoopbackSignals];
  }

  /**
   * Update filter characteristics based on selected bandwidth index
   */
  private updateFilterCharacteristics_(): void {
    const config = FILTER_BANDWIDTH_CONFIGS[this.state_.bandwidthIndex];
    this.bandwidthKnob_.valueOverride = config.label;
    this.state_.bandwidth = config.bandwidth;
    this.state_.insertionLoss = config.insertionLoss;
    this.state_.noiseFloor = config.noiseFloor;
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<IfFilterBankState>): void {
    super.sync(state);

    this.updateFilterCharacteristics_();
    this.bandwidthKnob_.sync(this.state_.bandwidthIndex);

    this.syncDomWithState_();
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    // Check for excessive insertion loss
    if (this.state_.insertionLoss > 3.0) {
      alarms.push(`Filter insertion loss high (${this.state_.insertionLoss.toFixed(1)} dB)`);
    }

    return alarms;
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

    const config = FILTER_BANDWIDTH_CONFIGS[this.state_.bandwidthIndex];

    const knobLabelElement = qs('.knob-value', this.bandwidthKnob_.dom);
    // Update knob label
    if (knobLabelElement) {
      knobLabelElement.textContent = config.label;
    }

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
