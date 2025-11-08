import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { RfSignal } from '@app/types';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './hpa-module.css';

/**
 * High Power Amplifier module state
 */
export interface HPAState {
  isEnabled: boolean;
  backOff: number; // dB from P1dB (0-10)
  outputPower: number; // dBW (1-200W -> 0-53 dBW)
  isOverdriven: boolean; // true if back-off < 3 dB
  imdLevel: number; // dBc
  temperature: number; // Celsius
}

export class HPAModule extends RFFrontEndModule<HPAState> {
  private static instance_: HPAModule;

  private readonly enableSwitch: PowerSwitch;
  private readonly backOffKnob: RotaryKnob;
  rfSignalsIn: RfSignal[] = [];
  rfSignalsOut: RfSignal[] = [];

  // HPA characteristics
  private readonly p1db = 50; // dBm (100W) typical P1dB compression point
  private readonly maxOutputPowerDbW = 53; // 200W = 53 dBW
  private readonly minBackOffDb = 0;
  private readonly maxBackOffDb = 10;
  private readonly thermalEfficiency = 0.5; // 50% typical for SSPA

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
    this.enableSwitch = PowerSwitch.create(
      `${this.uniqueId}-enable`,
      this.state_.isEnabled,
      false,
      true,
    );

    this.backOffKnob = RotaryKnob.create(
      `${this.uniqueId}-backoff-knob`,
      this.state_.backOff,
      this.minBackOffDb,
      this.maxBackOffDb,
      0.5,
      (value: number) => {
        this.state_.backOff = value;
        this.rfFrontEnd_.calculateSignalPath();
      }
    );

    this.html_ = html`
      <div class="rf-fe-module hpa-module">
        <div class="module-label">High Power Amplifier</div>
        <div class="module-controls">
          <div class="control-group">
            <label>ENABLE</label>
            ${this.enableSwitch.html}
          </div>
          <div class="control-group">
            <label>BACK-OFF (dB)</label>
            ${this.backOffKnob.html}
          </div>
          <div class="power-meter">
            <div class="meter-label">OUTPUT</div>
            <div class="led-bar">
              ${this.renderPowerMeter_(this.state_.outputPower)}
            </div>
            <span class="value-readout">${this.state_.outputPower.toFixed(1)} dBW</span>
          </div>
          <div class="led-indicator">
            <span class="indicator-label">IMD</span>
            <div class="led ${this.state_.isOverdriven ? 'led-orange' : 'led-off'}"></div>
            <span class="value-readout">${this.state_.imdLevel} dBc</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: HPAState) => void): void {
    if (!this.enableSwitch || !this.backOffKnob) {
      console.warn('HPAModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Enable switch handler
    this.enableSwitch.addEventListeners((isEnabled: boolean) => {
      const parentPowered = this.rfFrontEnd_.state.isPowered;
      const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

      // HPA can only be enabled if both parent and BUC are powered
      if (parentPowered && bucPowered) {
        this.state_.isEnabled = isEnabled;
        this.syncDomWithState_();
        cb(this.state_);
      } else {
        // Disable if conditions not met
        this.state_.isEnabled = false;
        this.enableSwitch.sync(false);
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
    if (this.state_.isEnabled) {
      // Calculate output power: P1dB - back-off, then convert to dBW
      const outputPowerDbm = this.p1db - this.state_.backOff;
      this.state_.outputPower = (outputPowerDbm - 30) / 10; // Convert dBm to dBW (approximate)

      // More accurate conversion: dBW = dBm - 30
      this.state_.outputPower = outputPowerDbm - 30;
    } else {
      this.state_.outputPower = -90; // dBW (effectively off)
    }
  }

  /**
   * Calculate HPA temperature based on output power
   */
  private updateTemperature_(): void {
    if (this.state_.isEnabled) {
      // Calculate dissipated power based on efficiency
      const powerWatts = Math.pow(10, this.state_.outputPower / 10);
      const dissipatedPower = powerWatts * (1 - this.thermalEfficiency);

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
    if (this.state_.isEnabled) {
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
    this.rfSignalsOut = this.rfSignalsIn.map(sig => {
      if (!this.state_.isEnabled) {
        // Pass through with no gain when disabled
        return {
          ...sig,
          power: sig.power - 120, // Effectively blocked
        };
      }

      // Apply HPA gain
      const gain = this.calculateGain_(sig.power);
      return {
        ...sig,
        power: sig.power + gain,
      };
    });
  }

  /**
   * Calculate HPA gain for given input power
   * Includes compression effects near P1dB
   */
  private calculateGain_(inputPowerDbm: number): number {
    if (!this.state_.isEnabled) {
      return -120; // Effectively off
    }

    // Ideal linear gain would bring signal to P1dB - backOff
    const targetOutputDbm = this.p1db - this.state_.backOff;
    const linearGain = targetOutputDbm - inputPowerDbm;

    // Apply compression if getting close to P1dB
    // This is a simplified model
    return linearGain;
  }

  /**
   * Check for alarm conditions
   */
  private checkAlarms_(): void {
    // Power sequencing check
    const parentPowered = this.rfFrontEnd_.state.isPowered;
    const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

    if (this.state_.isEnabled && (!parentPowered || !bucPowered)) {
      // Disable HPA if power conditions not met
      this.state_.isEnabled = false;
    }
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<HPAState>): void {
    super.sync(state);

    // Update UI components
    if (this.enableSwitch && state.isEnabled !== undefined) {
      this.enableSwitch.sync(state.isEnabled);
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
    if (this.state_.isOverdriven && this.state_.isEnabled) {
      alarms.push('HPA overdrive - IMD degradation');
    }

    // Temperature alarm
    if (this.state_.temperature > 85) {
      alarms.push(`HPA over-temperature (${this.state_.temperature.toFixed(0)}°C)`);
    }

    // Power sequencing alarm
    const parentPowered = this.rfFrontEnd_.state.isPowered;
    const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

    if (this.state_.isEnabled && !bucPowered && parentPowered) {
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
      ledBar.innerHTML = this.renderPowerMeter_(this.state_.outputPower);
    }

    // Update IMD LED
    const imdLed = qs('.led-indicator .led', container);
    if (imdLed) {
      imdLed.className = `led ${this.state_.isOverdriven ? 'led-orange' : 'led-off'}`;
    }

    // Update IMD readout
    const imdReadout = qs('.led-indicator .value-readout', container);
    if (imdReadout) {
      imdReadout.textContent = `${this.state_.imdLevel} dBc`;
    }

    // Sync UI components
    this.enableSwitch.sync(this.state_.isEnabled);
    this.backOffKnob.sync(this.state_.backOff);
  }

  /**
   * Render power meter LED bar
   */
  private renderPowerMeter_(powerDbW: number): string {
    // Convert dBW to percentage (0 dBW = 1W, 53 dBW = 200W for scale)
    const percentage = Math.max(0, Math.min(100, (powerDbW / this.maxOutputPowerDbW) * 100));

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

  /**
   * Get total gain through HPA
   * @returns Gain in dB
   */
  getTotalGain(): number {
    if (!this.state_.isEnabled) {
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
    if (!this.state_.isEnabled) {
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
