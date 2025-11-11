import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { SecureToggleSwitch } from '@app/components/secure-toggle-switch/secure-toggle-switch';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Sfx } from '@app/sound/sfx-enum';
import SoundManager from '@app/sound/sound-manager';
import { dBm, dBW, RfSignal, SignalOrigin } from '@app/types';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './hpa-module.css';

/**
 * High Power Amplifier module state
 */
export interface HPAState {
  noiseFloor: number;
  isPowered: boolean;
  backOff: number; // dB from P1dB (0-30)
  outputPower: dBm; // (1-200W -> 0-53 dBm)
  isOverdriven: boolean; // true if back-off < 3 dB
  imdLevel: number; // dBc
  temperature: number; // Celsius
  /** is the High Powered Amplifier (HPA) enabled */
  isHpaEnabled: boolean;
  /** is the HPA switch enabled */
  isHpaSwitchEnabled: boolean;
}

export class HPAModule extends RFFrontEndModule<HPAState> {
  private static instance_: HPAModule;

  // HPA characteristics
  private readonly p1db_ = 50 as dBm; // dBm (100W) output power at 1dB compression point
  private readonly maxOutputPower_ = 53 as dBm; // dBm (200W) maximum output power
  private readonly minBackOffDb_ = 0;
  private readonly maxBackOffDb_ = 30;
  private readonly thermalEfficiency_ = 0.5; // 50% typical for SSPA

  // UI Components
  private readonly backOffKnob: RotaryKnob;
  private readonly hpaSwitch_: SecureToggleSwitch;
  protected readonly powerSwitch_: PowerSwitch;

  // Signals
  rfSignalsIn: RfSignal[] = [];
  outputSignals: RfSignal[] = [];

  /**
   * Get default state for HPA module
   */
  static getDefaultState(): HPAState {
    return {
      isPowered: true,
      backOff: 6, // dB
      outputPower: 50 as dBm, // dBm (100W)
      isOverdriven: false,
      imdLevel: -30, // dBc
      temperature: 45, // Celsius
      isHpaEnabled: false,
      isHpaSwitchEnabled: false,
      noiseFloor: -140, // dBm/Hz
    };
  }

  static create(state: HPAState, rfFrontEnd: RFFrontEnd, unit: number = 1): HPAModule {
    this.instance_ ??= new HPAModule(state, rfFrontEnd, unit);
    return this.instance_;
  }

  static getInstance(): HPAModule {
    return this.instance_;
  }

  private constructor(state: HPAState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-hpa', unit);

    // Create UI components
    this.powerSwitch_ = PowerSwitch.create(
      `${this.uniqueId}-enable`,
      this.state_.isPowered,
      true,
      false,
    );

    this.hpaSwitch_ = SecureToggleSwitch.create(`hpa-switch-${this.rfFrontEnd_.state.uuid}`, this.state.isHpaSwitchEnabled, false);

    this.backOffKnob = RotaryKnob.create(
      `${this.uniqueId}-backoff-knob`,
      this.state_.backOff,
      this.minBackOffDb_,
      this.maxBackOffDb_,
      0.5,
      (value: number) => {
        this.state_.backOff = value;
      }
    );

    this.html_ = html`
      <div class="rf-fe-module hpa-module">
        <div class="module-label">High Power Amplifier</div>
        <div class="module-controls">
          <div class="led-indicators">
            <div class="led-indicator">
              <span class="indicator-label">IMD</span>
              <div class="led ${this.state_.isOverdriven ? 'led-orange' : 'led-off'}"></div>
            </div>
          </div>
          <div class="input-knobs">
            <div class="control-group">
              ${this.powerSwitch_.html}
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
                  ${this.renderPowerMeter_((this.state_.outputPower - 30) as dBW)}
                </div>
                <span class="value-readout">${this.state_.outputPower.toFixed(1)} dBW</span>
              </div>
            </div>
            <div class="status-displays">
              <div class="control-group">
                <label>IMD (dBc)</label>
                <div class="digital-display hpa-imd">${this.state_.imdLevel.toFixed(3)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: HPAState) => void): void {
    if (!this.powerSwitch_ || !this.backOffKnob) {
      console.warn('HPAModule: Cannot add event listeners - components not initialized');
      return;
    }

    // HPA switch
    this.hpaSwitch_.addEventListeners(this.toggleHpa_.bind(this));

    // Enable switch handler
    this.powerSwitch_.addEventListeners((isEnabled: boolean) => {
      const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

      // HPA can only be enabled if BUC is powered
      if (bucPowered) {
        this.state_.isPowered = isEnabled;
        this.syncDomWithState_();
        cb(this.state_);
      } else {
        // Disable if conditions not met
        this.state_.isPowered = false;
        this.powerSwitch_.sync(false);
        this.syncDomWithState_();
        cb(this.state_);
      }
    });

    // Back-off knob already has its callback set in constructor
    this.backOffKnob.attachListeners();
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Update power and thermal calculations
    this.updateOutputPower_();
    this.updateTemperature_();
    this.updateIMD_();

    // Check for alarms
    this.checkAlarms_();

    // Process RF signals
    this.processSignals_();
  }

  /**
   * Calculate HPA output power based on input and back-off
   */
  private updateOutputPower_(): void {
    if (this.state_.isPowered && this.state_.isHpaEnabled) {
      // Calculate output power: P1dB - back-off
      this.state_.outputPower = this.p1db_ - this.state_.backOff as dBm;
    } else {
      this.state_.outputPower = -90 as dBm; // dBm (effectively off)
    }
  }

  /**
   * Calculate HPA temperature based on output power
   */
  private updateTemperature_(): void {
    if (this.state_.isPowered) {
      // Calculate dissipated power based on efficiency, outputPower is in dBm
      const powerWatts = Math.pow(10, (this.state_.outputPower - 30) / 10); // Convert dBm to Watts
      const dissipatedPower = powerWatts * (1 - this.thermalEfficiency_);

      // Simple thermal model: ambient + thermal rise
      this.state_.temperature = 25 + (dissipatedPower * 10);
    } else {
      this.state_.temperature = 25; // Ambient temperature
    }
  }

  /**
   * Calculate intermodulation distortion (IMD) based on back-off
   */
  private updateIMD_(): void {
    if (this.state_.isPowered) {
      // IMD improves (becomes more negative) as back-off increases
      // Typical relationship: IMD degrades ~2 dB for every dB reduction in back-off
      this.state_.imdLevel = -30 - (this.state_.backOff * 2); // dBc

      // Update overdrive status
      this.state_.isOverdriven = this.state_.backOff < 3;
    } else {
      this.state_.imdLevel = -60; // dBc (very clean when off)
      this.state_.isOverdriven = false;
    }
  }

  /**
   * Process RF signals through HPA
   */
  private processSignals_(): void {
    if (!this.state_.isPowered || !this.state_.isHpaEnabled) {
      // HPA is off, no output signals
      this.outputSignals = [];
      return;
    }

    // Apply gain and compression to input signals
    this.outputSignals = this.inputSignals.map(sig => {
      // Apply HPA gain
      const gain = this.calculateGain_(sig.power);
      return {
        ...sig,
        power: (sig.power + gain - this.state_.backOff) as dBm,
        origin: SignalOrigin.HIGH_POWER_AMPLIFIER,
      };
    });
  }

  /**
   * Calculate HPA gain for given input power
   * Includes compression effects near P1dB
   */
  private calculateGain_(inputPowerDbm: number): number {
    if (!this.state_.isPowered) {
      return -120; // Effectively off
    }

    // Ideal linear gain would bring signal to P1dB - backOff
    const targetOutputDbm = this.p1db_ - this.state_.backOff;
    let linearGain = targetOutputDbm - inputPowerDbm;

    // Maximum gain limit (e.g., 50 dB typical for HPA)
    const maxGain = 50;
    if (linearGain > maxGain) {
      linearGain = maxGain;
    }

    // Compression: as input approaches P1dB, gain is reduced
    // Simple model: reduce gain by 1 dB for every dB input above (P1dB - backOff - 3)
    const compressionThreshold = targetOutputDbm - 3;
    if (inputPowerDbm > compressionThreshold) {
      linearGain -= (inputPowerDbm - compressionThreshold);
    }

    // Ensure gain is not negative
    if (linearGain < 0) {
      linearGain = 0;
    }

    return linearGain;
  }

  /**
   * Check for alarm conditions
   */
  private checkAlarms_(): void {
    // Power sequencing check
    const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

    if (this.state_.isPowered && (!bucPowered)) {
      // Disable HPA if power conditions not met
      this.state_.isPowered = false;
    }
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<HPAState>): void {
    super.sync(state);

    // Update UI components
    if (this.powerSwitch_ && state.isPowered !== undefined) {
      this.powerSwitch_.sync(state.isPowered);
    }
    if (this.backOffKnob && state.backOff !== undefined) {
      this.backOffKnob.sync(state.backOff);
    }
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    // Overdrive alarm
    if (this.state_.isOverdriven && this.state_.isPowered) {
      alarms.push('HPA overdrive - IMD degradation');
    }

    // Temperature alarm
    if (this.state_.temperature > 85) {
      alarms.push(`HPA over-temperature (${this.state_.temperature.toFixed(0)}°C)`);
    }

    // Power sequencing alarm
    const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

    if (this.state_.isPowered && !bucPowered) {
      alarms.push('HPA enabled without BUC power');
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

    const container = qs('.hpa-module');
    if (!container) return;

    // Update output power display
    const powerReadout = qs('.power-meter .value-readout', container);
    if (powerReadout) {
      powerReadout.textContent = `${this.state_.outputPower.toFixed(1)} dBW`;
    }

    // Update power meter LEDs
    const ledBar = qs('.led-bar', container);
    if (ledBar) {
      ledBar.innerHTML = this.renderPowerMeter_((this.state_.outputPower - 30) as dBW);
    }

    // Update IMD LED
    const imdLed = qs('.led-indicator .led', container);
    if (imdLed) {
      imdLed.className = `led ${this.state_.isOverdriven ? 'led-orange' : 'led-off'}`;
    }

    // Update IMD readout
    const imdReadout = qs('.hpa-imd', container);
    if (imdReadout) {
      imdReadout.textContent = `${this.state_.imdLevel}`;
    }

    this.hpaSwitch_.sync(this.state.isHpaSwitchEnabled);

    // Sync UI components
    this.powerSwitch_.sync(this.state_.isPowered);
    this.backOffKnob.sync(this.state_.backOff);
  }

  private toggleHpa_(): void {
    if (!this.state.isPowered) {
      EventBus.getInstance().emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    this.state.isHpaSwitchEnabled = !this.state.isHpaSwitchEnabled;

    SoundManager.getInstance().play(
      this.state.isHpaSwitchEnabled ? Sfx.TOGGLE_ON : Sfx.TOGGLE_OFF
    );

    if (this.state.isPowered) {
      this.state.isHpaEnabled = this.state.isHpaSwitchEnabled;
    }

    this.syncDomWithState_();
  }

  /**
   * Render power meter LED bar
   */
  private renderPowerMeter_(powerDbW: dBW): string {
    // Convert dBW to percentage (1W = 0 dBW, 10W = 10 dBW for scale)
    const percentage = Math.max(0, Math.min(100, (powerDbW / (this.maxOutputPower_ - 30) as dBW) * 100));

    const segments = [];
    for (let i = 0; i < 5; i++) {
      const threshold = (i + 1) * 20; // 20%, 40%, 60%, 80%, 100%
      const isLit = percentage >= threshold;

      let colorClass = 'led-off';
      if (isLit) {
        if (i < 3) colorClass = 'led-green';      // 0-60%: green
        else if (i < 4) colorClass = 'led-yellow'; // 60-80%: yellow
        else colorClass = 'led-red';                // 80-100%: red
      }

      segments.push(`<div class="led-segment ${colorClass}"></div>`);
    }

    return segments.join('');
  }

  get inputSignals(): RfSignal[] {
    if (this.rfFrontEnd_.bucModule.state.isLoopback) {
      return [];
    }

    return this.rfFrontEnd_.bucModule.outputSignals;
  }

  /**
   * Get total gain through HPA
   * @returns Gain in dB
   */
  getTotalGain(): number {
    if (!this.state_.isPowered) {
      return -120; // Effectively off
    }

    // HPA gain depends on input signal level and back-off setting
    // For now, return a simplified gain value
    const inputPower = this.rfFrontEnd_.state.buc.outputPower;
    return this.calculateGain_(inputPower);
  }

  /**
   * Get output power for given input power
   * @param inputPowerDbm Input RF power in dBm
   * @returns Output RF power in dBm
   */
  getOutputPower(inputPowerDbm: number): number {
    if (!this.state_.isPowered) {
      return -120; // Effectively off
    }

    const gain = this.calculateGain_(inputPowerDbm);
    return inputPowerDbm + gain;
  }

  /**
   * Check if HPA is in overdrive condition
   */
  isOverdriven(): boolean {
    return this.state_.isOverdriven;
  }

  /**
   * Get current temperature
   */
  getTemperature(): number {
    return this.state_.temperature;
  }

  /**
   * Get IMD level
   */
  getIMDLevel(): number {
    return this.state_.imdLevel;
  }
}
