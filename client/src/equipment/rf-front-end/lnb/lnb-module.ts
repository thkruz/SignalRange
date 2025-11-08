import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { IfFrequency, IfSignal, MHz, RfFrequency, RfSignal } from '@app/types';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './lnb-module.css';

/**
 * Low Noise Block converter module state
 */
export interface LNBState {
  isPowered: boolean;
  loFrequency: MHz;
  gain: number; // dB (40-65)
  lnaNoiseFigure: number; // dB (0.3-1.2)
  mixerNoiseFigure: number; // dB (e.g., 6-10)
  noiseTemperature: number; // Kelvin
  isExtRefLocked: boolean;
  isSpectrumInverted: boolean;
}

export class LNBModule extends RFFrontEndModule<LNBState> {
  private static instance_: LNBModule;

  private readonly powerSwitch: PowerSwitch;
  private readonly gainKnob: RotaryKnob;
  preLNASignals: RfSignal[] = [];
  postLNASignals: RfSignal[] = [];
  ifSignals: IfSignal[] = [];

  static create(state: LNBState, rfFrontEnd: RFFrontEnd, unit: number = 1): LNBModule {
    this.instance_ ??= new LNBModule(state, rfFrontEnd, unit);
    return this.instance_;
  }

  static getInstance(): LNBModule {
    return this.instance_;
  }

  private constructor(state: LNBState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-lnb', unit);

    // Create UI components
    this.powerSwitch = PowerSwitch.create(
      `${this.uniqueId}-power`,
      this.state_.isPowered,
      false,
      true,
    );

    this.gainKnob = RotaryKnob.create(
      `${this.uniqueId}-gain-knob`,
      this.state_.gain,
      0, // For training purposes, allow 0 dB gain
      65,
      1,
      (value: number) => {
        this.state_.gain = value;
        this.rfFrontEnd_.calculateSignalPath();
      }
    );

    this.html_ = html`
      <div class="rf-fe-module lnb-module">
        <div class="module-label">Low Noise Block</div>
        <div class="module-controls">
          <div class="control-group">
            <label>LO (MHz)</label>
            <input type="number"
                   class="input-lnb-lo"
                   data-param="lnb.loFrequency"
                   value="${this.state_.loFrequency}"
                   min="3700" max="4200" step="10" />
            <div class="digital-display lnb-lo-display">${this.state_.loFrequency}</div>
          </div>
          <div class="control-group">
            <label>GAIN (dB)</label>
            ${this.gainKnob.html}
          </div>
          <div class="led-indicator">
            <span class="indicator-label">LOCK</span>
            <div class="led ${this.getLockLedStatus_()}"></div>
          </div>
          <div class="led-indicator">
            <span class="indicator-label">NOISE TEMP</span>
            <div class="led led-blue" style="filter: brightness(${this.getNoiseTempBrightness__()})"></div>
            <span id="noise-temp-readout" class="value-readout lnb-noise-temp">${this.state_.noiseTemperature.toFixed(0)} K</span>
          </div>
        </div>
        <div class="control-group power-switch">
          ${this.powerSwitch.html}
        </div>
      </div>
    `;
  }

  private getLockLedStatus_(): string {
    return this.state_.isExtRefLocked ? 'led-green' : 'led-red';
  }

  private getNoiseTempBrightness__(): number {
    // Typical noise temperature range: ~90K (bright) to 290K+ (dim)
    // To map 90K -> ~2, 290K -> ~0, use denominator ~100
    return Math.max(2 - this.state_.noiseTemperature / 100, 0);
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: LNBState) => void): void {
    if (!this.powerSwitch || !this.gainKnob) {
      console.warn('LNBModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Power switch handler
    this.powerSwitch.addEventListeners((isPowered: boolean) => {
      const parentPowered = this.rfFrontEnd_.state.isPowered;
      if (parentPowered) {
        this.state_.isPowered = isPowered;

        // Simulate lock acquisition when powered on
        if (isPowered && this.rfFrontEnd_.state.isExtRefPresent) {
          setTimeout(() => {
            this.state_.isExtRefLocked = true;
            this.syncDomWithState_();
            cb(this.state_);
          }, 2000);
        } else if (!isPowered) {
          this.state_.isExtRefLocked = false;
        }

        this.syncDomWithState_();
        cb(this.state_);
      }
    });

    // LO frequency input handler
    const container = qs('.lnb-module');
    if (container) {
      const loInput = container.querySelector('.input-lnb-lo');
      if (loInput) {
        loInput.addEventListener('change', (e: Event) => {
          const target = e.target as HTMLInputElement;
          const value = parseFloat(target.value);
          if (!isNaN(value)) {
            this.state_.loFrequency = value as MHz;
            this.syncDomWithState_();
            cb(this.state_);
          }
        });
      }
    }

    // Gain knob already has its callback set in constructor
    this.gainKnob.attachListeners();
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Get RF Signals from OMT and duplicate for pre/post LNA stages
    this.preLNASignals = this.rfFrontEnd_.omtModule.outputSignals.map(sig => ({ ...sig }));

    // Update noise temperature based on noise figure
    this.updateNoiseTemperature_();

    // Update lock status based on power and reference availability
    this.updateLockStatus_();

    // Check for alarms
    this.checkAlarms_();

    // Calculate post-LNA signals (apply gain if powered)
    this.postLNASignals = this.preLNASignals.map(sig => {
      const gain = this.state_.isPowered ? this.state_.gain : 0;
      return {
        ...sig,
        power: sig.power + gain,
      } as RfSignal;
    });

    // Calculate IF signals after LNB based on LO frequency
    this.ifSignals = this.postLNASignals.map(sig => {
      const ifFreq = this.calculateIfFrequency(sig.frequency);
      const isInverted = this.isSpectrumInverted(sig.frequency);
      return {
        ...sig,
        frequency: ifFreq,
        isSpectrumInverted: isInverted,
      } as IfSignal;
    });
  }

  /**
   * Calculate noise temperature from noise figure
   * T_noise = T_0 * (F - 1), where T_0 = 290K
   */
  // 2. Update updateNoiseTemperature_() to include Mixer
  private updateNoiseTemperature_(): void {
    const nfLnaLinear = Math.pow(10, this.state_.lnaNoiseFigure / 10);
    const nfMixerLinear = Math.pow(10, this.state_.mixerNoiseFigure / 10);
    const gainLnaLinear = this.state_.gain > 0 ? Math.pow(10, this.state_.gain / 10) : 1;

    // Friis formula for cascaded stages
    const nfTotal = nfLnaLinear + (nfMixerLinear - 1) / gainLnaLinear;

    this.state_.noiseTemperature = 290 * (nfTotal - 1);
  }


  /**
   * Update lock status based on power and external reference
   */
  private updateLockStatus_(): void {
    const parentPowered = this.rfFrontEnd_.state.isPowered;
    const extRefPresent = this.rfFrontEnd_.state.isExtRefPresent;

    if (!parentPowered || !this.state_.isPowered) {
      this.state_.isExtRefLocked = false;
    } else if (!extRefPresent) {
      this.state_.isExtRefLocked = false;
    } else {
      // In real system, lock acquisition takes 2-5 seconds
      // For simulation, we'll maintain the lock if conditions are met
      if (!this.state_.isExtRefLocked) {
        this.state_.isExtRefLocked = true;
      }
    }
  }

  /**
   * Check for alarm conditions
   */
  private checkAlarms_(): void {
    // Alarms are retrieved via getAlarms() method
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<LNBState>): void {
    super.sync(state);

    // Update UI components
    if (this.powerSwitch && state.isPowered !== undefined) {
      this.powerSwitch.sync(state.isPowered);
    }
    if (this.gainKnob && state.gain !== undefined) {
      this.gainKnob.sync(state.gain);
    }
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    const parentPowered = this.rfFrontEnd_.state.isPowered;
    const extRefPresent = this.rfFrontEnd_.state.isExtRefPresent;

    // Lock alarm
    if (this.state_.isPowered && !this.state_.isExtRefLocked && extRefPresent && parentPowered) {
      alarms.push('LNB not locked to reference');
    }

    // High noise temperature alarm
    if (this.state_.noiseTemperature > 100) {
      alarms.push(`LNB noise temperature high (${this.state_.noiseTemperature.toFixed(0)}K)`);
    }

    // High noise figure alarm
    if (this.state_.lnaNoiseFigure > 1.0) {
      alarms.push(`LNB noise figure degraded (${this.state_.lnaNoiseFigure.toFixed(2)} dB)`);
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

    const container = qs('.lnb-module');
    if (!container) return;

    // Update LO frequency display
    const loDisplay = qs('.lnb-lo-display', container);
    loDisplay.textContent = this.state_.loFrequency.toString();

    // Update LO frequency input
    const loInput: HTMLInputElement = qs('.input-lnb-lo', container);
    loInput.value = this.state_.loFrequency.toString();

    // Update lock LED
    const lockLed = qs('.led-indicator .led', container);
    lockLed.className = `led ${this.getLockLedStatus_()}`;

    // Update noise temperature display and LED
    const noiseTempReadout = qs('#noise-temp-readout', container);
    noiseTempReadout.textContent = `${this.state_.noiseTemperature.toFixed(0)} K`;

    const noiseTempLed = qs('.led-blue', container);
    noiseTempLed.style.filter = `brightness(${this.getNoiseTempBrightness__()})`;

    this.powerSwitch.sync(this.state_.isPowered);
    this.gainKnob.sync(this.state_.gain);
  }

  /**
   * Calculate downconverted IF frequency
   * @param rfFrequency RF input frequency in Hz
   * @returns IF output frequency in Hz
   */
  calculateIfFrequency(rfFrequency: RfFrequency): IfFrequency {
    return Math.abs(rfFrequency - this.state_.loFrequency * 1e6) as IfFrequency;
  }

  /**
   * Check if spectrum is inverted (high-side LO injection)
   * @param rfFrequency RF input frequency in Hz
   * @returns true if spectrum is inverted
   */
  isSpectrumInverted(rfFrequency: number): boolean {
    return this.state_.loFrequency * 1e6 > rfFrequency;
  }

  /**
   * Get total gain through LNB
   * @returns Gain in dB
   */
  getTotalGain(): number {
    if (!this.state_.isPowered) {
      return -100; // Effectively off
    }
    return this.state_.gain;
  }

  /**
   * Get output power for given input power
   * @param inputPowerDbm Input RF power in dBm
   * @returns Output IF power in dBm
   */
  getOutputPower(inputPowerDbm: number): number {
    if (!this.state_.isPowered) {
      return -120; // Effectively off
    }
    return inputPowerDbm + this.state_.gain;
  }
}
