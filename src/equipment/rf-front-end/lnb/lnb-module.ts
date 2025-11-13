import { RotaryKnob } from "@app/components/rotary-knob/rotary-knob";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Hertz, IfFrequency, IfSignal, MHz, RfFrequency, RfSignal, SignalOrigin } from '@app/types';
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
  noiseTemperatureStabilizationTime: number; // seconds (time for noise temp to stabilize after power-on)
  temperature: number; // °C (physical temperature)
  thermalStabilizationTime: number; // seconds (time for physical temp to stabilize after power-on)
  frequencyError: number; // Hz (LO frequency drift)
  isExtRefLocked: boolean;
  isSpectrumInverted: boolean;
}

export class LNBModule extends RFFrontEndModule<LNBState> {
  // UI Components
  private readonly loKnob_: RotaryKnob;

  // Signals
  postLNASignals: RfSignal[] = [];
  ifSignals: IfSignal[] = [];

  // Thermal stabilization tracking
  private powerOnTimestamp_: number | null = null;

  /**
   * Get default state for LNB module
   */
  static getDefaultState(): LNBState {
    return {
      isPowered: true,
      loFrequency: 4200 as MHz, // MHz
      gain: 55, // dB
      lnaNoiseFigure: 0.6, // dB
      mixerNoiseFigure: 16.0, // dB
      noiseTemperature: 45, // K
      noiseTemperatureStabilizationTime: 150, // seconds (2.5 minutes - consumer LNB)
      temperature: 25, // °C (ambient start temperature)
      thermalStabilizationTime: 150, // seconds (2.5 minutes - matches noise temp)
      frequencyError: 0, // Hz (LO frequency drift)
      isExtRefLocked: true,
      isSpectrumInverted: true,
      noiseFloor: -140, // dBm/Hz
    };
  }

  constructor(state: LNBState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-lnb', unit);

    // Initialize power-on timestamp if already powered
    if (state.isPowered) {
      this.powerOnTimestamp_ = Date.now();
    }

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
      }
    );

    this.html_ = html`
      <div class="rf-fe-module lnb-module">
        <div class="module-label">Low Noise Block</div>
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
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: LNBState) => void): void {
    if (!this.powerSwitch_ || !this.gainKnob_) {
      console.warn('LNBModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Power switch handler using base class method
    this.addPowerSwitchListener(cb, () => {
      // Track power-on time for noise temperature stabilization
      if (this.state_.isPowered) {
        this.powerOnTimestamp_ = Date.now();
      } else {
        this.powerOnTimestamp_ = null;
      }

      this.simulateLockAcquisition(2000, 2000, () => cb(this.state_));
    });
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Update physical temperature based on power and elapsed time
    this.updateThermalState_();

    // Update noise temperature based on noise figure
    this.updateNoiseTemperature_();

    // Update frequency drift based on temperature and lock status
    this.updateFrequencyDrift_();

    // Update lock status based on power and reference availability
    this.updateLockStatus_();

    // Check for alarms
    this.checkAlarms_();

    // Calculate post-LNA signals (apply gain if powered)
    // NOTE: I think this is running twice per sim step? once per Spectrum Analyzer update and once per LNB update?
    this.postLNASignals = this.rxSignalsIn.map(sig => {
      const gain = this.state_.isPowered ? 0 : -300;
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
   *
   * Includes thermal stabilization: noise temperature starts higher when
   * first powered on and gradually decreases to nominal value as components
   * warm up to steady-state operating temperature.
   */
  private updateNoiseTemperature_(): void {
    if (!this.state_.isPowered) {
      this.state_.noiseTemperature = 290; // Ambient temperature when off
      return;
    }

    const nfLnaLinear = Math.pow(10, this.state_.lnaNoiseFigure / 10);
    const nfMixerLinear = Math.pow(10, this.state_.mixerNoiseFigure / 10);
    const gainLnaLinear = this.state_.gain > 0 ? Math.pow(10, this.state_.gain / 10) : 1;

    // Friis formula for cascaded stages
    const nfTotal = nfLnaLinear + (nfMixerLinear - 1) / gainLnaLinear;

    // Calculate nominal (fully stabilized) noise temperature
    const nominalNoiseTemp = 290 * (nfTotal - 1);

    // Apply thermal stabilization if power-on time is tracked
    if (this.powerOnTimestamp_ === null) {
      // No power-on tracking (shouldn't happen, but fallback)
      this.state_.noiseTemperature = nominalNoiseTemp;
      return;
    }

    const timeElapsedMs = Date.now() - this.powerOnTimestamp_;
    const timeElapsedSec = timeElapsedMs / 1000;
    const stabilizationTime = this.state_.noiseTemperatureStabilizationTime;

    if (timeElapsedSec < stabilizationTime) {
      // Components still warming up - use exponential decay
      // Time constant = stabilizationTime / 3 (so ~95% stabilized after stabilizationTime)
      const timeConstant = stabilizationTime / 3;
      const stabilizationFactor = Math.exp(-timeElapsedSec / timeConstant);

      // Start at 2x nominal (cold components have worse noise performance)
      const initialNoiseTemp = nominalNoiseTemp * 2;

      // Exponentially decay from initial to nominal
      this.state_.noiseTemperature = nominalNoiseTemp +
        (initialNoiseTemp - nominalNoiseTemp) * stabilizationFactor;
    } else {
      // Fully stabilized
      this.state_.noiseTemperature = nominalNoiseTemp;
    }
  }

  /**
   * Update physical temperature based on power state and elapsed time
   * Physical temperature affects oscillator stability and frequency drift
   */
  updateThermalState_(): void {
    const ambientTemp = 25; // °C (room temperature)
    const operatingTemp = 50; // °C (typical LNB operating temperature)

    if (!this.state_.isPowered) {
      // When powered off, temperature decays to ambient
      this.state_.temperature = ambientTemp;
      return;
    }

    if (this.powerOnTimestamp_ === null) {
      // No power-on tracking (shouldn't happen, but fallback)
      this.state_.temperature = operatingTemp;
      return;
    }

    const timeElapsedMs = Date.now() - this.powerOnTimestamp_;
    const timeElapsedSec = timeElapsedMs / 1000;
    const stabilizationTime = this.state_.thermalStabilizationTime;

    if (timeElapsedSec < stabilizationTime) {
      // Components still warming up - use exponential rise
      // Time constant = stabilizationTime / 3 (so ~95% stabilized after stabilizationTime)
      const timeConstant = stabilizationTime / 3;
      const heatingFactor = 1 - Math.exp(-timeElapsedSec / timeConstant);

      // Exponentially rise from ambient to operating temperature
      this.state_.temperature = ambientTemp + (operatingTemp - ambientTemp) * heatingFactor;
    } else {
      // Fully stabilized
      this.state_.temperature = operatingTemp;
    }
  }

  /**
   * Update frequency drift based on temperature and lock status
   * LNB oscillators drift when not locked to external reference or still warming up
   */
  updateFrequencyDrift_(): void {
    // Check if GPSDO reference is present and warmed up
    const extRefPresent = this.isExtRefPresent();
    const extRefWarmedUp = extRefPresent && this.rfFrontEnd_.gpsdoModule.get10MhzOutput().isWarmedUp;

    // When locked to external reference and reference is warmed up, no drift
    if (this.state_.isExtRefLocked && extRefWarmedUp) {
      this.state_.frequencyError = 0;
      return;
    }

    // When not locked or reference not warmed up, calculate temperature-dependent drift
    const nominalTemp = 50; // °C (operating temperature where drift is minimal)
    const tempDeviation = Math.abs(this.state_.temperature - nominalTemp);

    // Temperature coefficient: 0.5 ppm/°C (typical for LNB DRO)
    const tempCoefficientPpm = 0.5;
    const tempDriftPpm = tempDeviation * tempCoefficientPpm;

    // Add aging drift component: 1-3 ppm
    const agingDriftPpm = 1 + Math.random() * 2;

    // Total drift in ppm
    const totalDriftPpm = tempDriftPpm + agingDriftPpm;

    // Convert to Hz
    const loFrequencyHz = this.state_.loFrequency * 1e6;

    // Drift is negative when cold (frequency drops), positive when hot
    const driftDirection = this.state_.temperature < nominalTemp ? -1 : 1;

    this.state_.frequencyError = driftDirection * (loFrequencyHz * totalDriftPpm / 1e6);
  }

  /**
   * Calculate noise floor based on system noise temperature in dBm/Hz
   */
  getNoiseFloor(bandwidthHz: Hertz): number {
    // Noise floor based on actual system noise temperature
    // P_noise = k·T·B where k = Boltzmann constant (1.38e-23 J/K)
    // In dBm/Hz: P = 10·log₁₀(k·T·B) + 30 = -198.6 + 10·log₁₀(T) + 10·log₁₀(B)
    const T_sys = this.state_.noiseTemperature; // Use actual system temperature (includes thermal stabilization)

    return -198.6 + 10 * Math.log10(T_sys) + 10 * Math.log10(bandwidthHz);
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

    const extRefPresent = this.isExtRefPresent();

    // Lock alarm
    if (this.state_.isPowered && !this.state_.isExtRefLocked && extRefPresent) {
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
      noiseTempLed.style.filter = `brightness(${this.getNoiseTempBrightness__()})`;
    } else if (noiseTempLed) {
      noiseTempLed.style.filter = '';
      noiseTempLed.classList.add('led-off');
      noiseTempLed.classList.remove('led-blue');
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
  }

  /**
   * Calculate downconverted IF frequency
   * @param rfFrequency RF input frequency in Hz
   * @returns IF output frequency in Hz
   */
  calculateIfFrequency(rfFrequency: RfFrequency): IfFrequency {
    // Apply frequency error to LO (error is 0 when locked and warmed up)
    const effectiveLO = this.state_.loFrequency * 1e6 + this.state_.frequencyError;
    return Math.abs(rfFrequency - effectiveLO) as IfFrequency;
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
