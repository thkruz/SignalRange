import { RotaryKnob } from "@app/components/rotary-knob/rotary-knob";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { IfFrequency, IfSignal, MHz, RfFrequency, RfSignal, SignalOrigin } from '@app/types';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule, RFFrontEndModuleState } from '../rf-front-end-module';
import './lnb-module.css';

/**
 * Low Noise Block converter module state
 */
export interface LNBState extends RFFrontEndModuleState {
  noiseFloor: number;
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

  postLNASignals: RfSignal[] = [];
  ifSignals: IfSignal[] = [];
  loKnob_: any;

  static create(state: LNBState, rfFrontEnd: RFFrontEnd, unit: number = 1): LNBModule {
    this.instance_ ??= new LNBModule(state, rfFrontEnd, unit);
    return this.instance_;
  }

  static getInstance(): LNBModule {
    return this.instance_;
  }

  private constructor(state: LNBState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-lnb', unit);

    // Create UI components using base class methods
    this.createPowerSwitch();
    this.createGainKnob(0, 70, 1);

    this.loKnob_ = RotaryKnob.create(
      `${this.uniqueId}-lo-knob`,
      this.state_.loFrequency,
      3700,
      4200,
      10,
      (value: number) => {
        this.state_.loFrequency = value as MHz;
        this.rfFrontEnd_.calculateSignalPath();
      }
    );

    this.html_ = html`
      <div class="rf-fe-module lnb-module">
        <div class="module-label">Low Noise Block</div>
        <div class="module-controls">
          <div class="split-top-section">
            <div class="control-group power-switch">
              ${this.powerSwitch_?.html || ''}
            </div>
            <div class="led-indicators">
              <div class="led-indicator">
                <span class="indicator-label">LOCK</span>
                <div class="led ${this.getLockLedStatus()}"></div>
              </div>
              <div class="led-indicator">
                <span class="indicator-label">NOISE TEMP</span>
                <div class="led led-blue" style="filter: brightness(${this.getNoiseTempBrightness__()})"></div>
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
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: LNBState) => void): void {
    if (!this.powerSwitch_ || !this.gainKnob_) {
      console.warn('LNBModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Power switch handler using base class method
    this.addPowerSwitchListener(cb, () => {
      this.simulateLockAcquisition(2000, 2000, () => cb(this.state_));
    });

    // LO frequency input handler
    this.loKnob_.attachListeners();

    // Gain knob already has its callback set in constructor
    this.gainKnob_?.attachListeners();
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Update noise temperature based on noise figure
    this.updateNoiseTemperature_();

    // Update lock status based on power and reference availability
    this.updateLockStatus_();

    // Check for alarms
    this.checkAlarms_();

    // Calculate post-LNA signals (apply gain if powered)
    this.postLNASignals = this.rxSignalsIn.map(sig => {
      const gain = this.state_.isPowered ? this.state_.gain : 0;
      return {
        ...sig,
        power: sig.power + gain,
        origin: SignalOrigin.LOW_NOISE_AMPLIFIER,
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
        origin: SignalOrigin.LOW_NOISE_BLOCK,
      } as IfSignal;
    });
  }

  get rxSignalsIn(): RfSignal[] {
    const omtSignals = this.rfFrontEnd_.omtModule.rxSignalsOut;
    const bucLoopback = this.rfFrontEnd_.bucModule.state.isLoopback
      ? this.rfFrontEnd_.bucModule.outputSignals
      : [];

    return [...omtSignals, ...bucLoopback];
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
   * Uses base class implementation
   */
  private updateLockStatus_(): void {
    this.updateLockStatus();
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

    // Sync common UI components using base class method
    this.syncCommonComponents(state);
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    const parentPowered = this.isParentPowered();
    const extRefPresent = this.isExtRefPresent();

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
    if (loDisplay) {
      loDisplay.textContent = this.state_.loFrequency.toString();
    }

    // Update LO frequency input
    const loInput: HTMLInputElement | null = qs('.input-lnb-lo', container);
    if (loInput) {
      loInput.value = this.state_.loFrequency.toString();
    }

    // Update lock LED using base class method
    const lockLed = qs('.led-indicator .led', container);
    if (lockLed) {
      lockLed.className = `led ${this.getLockLedStatus()}`;
    }

    // Update noise temperature display and LED
    const noiseTempReadout = qs('.lnb-noise-temp-display', container);
    if (noiseTempReadout) {
      noiseTempReadout.textContent = `${this.state_.noiseTemperature.toFixed(1)}`;
    }

    const noiseTempLed = qs('.led-blue', container);
    if (noiseTempLed) {
      noiseTempLed.style.filter = `brightness(${this.getNoiseTempBrightness__()})`;
    }

    // Sync UI components using base class method
    this.syncCommonComponents(this.state_);
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
