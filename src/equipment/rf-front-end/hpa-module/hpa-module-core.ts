import { SignalOrigin } from "@app/SignalOrigin";
import type { dB, dBm, dBW, RfSignal } from '@app/types';
import { RFFrontEndCore } from "../rf-front-end-core";
import { RFFrontEndModule } from '../rf-front-end-module';

/**
 * High Power Amplifier module state
 */
export interface HPAState {
  gain: dB;
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

/**
 * HPA Module Core - Business Logic Layer
 * Contains amplifier physics, power calculations, signal processing
 * No UI dependencies
 */
export abstract class HPAModuleCore extends RFFrontEndModule<HPAState> {
  // HPA characteristics
  protected readonly p1db_ = 50 as dBm; // dBm (100W) output power at 1dB compression point
  protected readonly maxOutputPower_ = 53 as dBm; // dBm (200W) maximum output power
  protected readonly minBackOffDb_ = 0;
  protected readonly maxBackOffDb_ = 30;
  private readonly thermalEfficiency_ = 0.5; // 50% typical for SSPA

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
      gain: 44 as dB,
    };
  }

  constructor(state: HPAState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super(state, rfFrontEnd, 'rf-fe-hpa', unit);

    this.state = { ...HPAModuleCore.getDefaultState(), ...state };
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
    if (this.state.isPowered && this.state.isHpaEnabled) {
      // Calculate output power: P1dB - back-off
      this.state.outputPower = this.p1db_ - this.state.backOff as dBm;
    } else {
      this.state.outputPower = -90 as dBm; // dBm (effectively off)
    }
  }

  /**
   * Calculate HPA temperature based on output power
   */
  private updateTemperature_(): void {
    if (this.state.isPowered) {
      // Calculate dissipated power based on efficiency, outputPower is in dBm
      const powerWatts = Math.pow(10, (this.state.outputPower - 30) / 10); // Convert dBm to Watts
      const dissipatedPower = powerWatts * (1 - this.thermalEfficiency_);

      // Simple thermal model: ambient + thermal rise
      this.state.temperature = 25 + (dissipatedPower * 10);
    } else {
      this.state.temperature = 25; // Ambient temperature
    }
  }

  /**
   * Calculate intermodulation distortion (IMD) based on back-off
   */
  private updateIMD_(): void {
    if (this.state.isPowered) {
      // IMD improves (becomes more negative) as back-off increases
      // Typical relationship: IMD degrades ~2 dB for every dB reduction in back-off
      this.state.imdLevel = -30 - (this.state.backOff * 2); // dBc

      // Update overdrive status
      this.state.isOverdriven = this.state.backOff < 3;
    } else {
      this.state.imdLevel = -60; // dBc (very clean when off)
      this.state.isOverdriven = false;
    }
  }

  /**
   * Process RF signals through HPA
   */
  private processSignals_(): void {
    if (!this.state.isPowered || !this.state.isHpaEnabled) {
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
        power: (sig.power + gain - this.state.backOff) as dBm,
        origin: SignalOrigin.HIGH_POWER_AMPLIFIER,
      };
    });

    // Update state.gain to be the max gain applied to any input signal
    const gains = this.inputSignals.map(sig => this.calculateGain_(sig.power));
    this.state.gain = (gains.length > 0 ? Math.max(...gains) : 0) as dB;
  }

  /**
   * Calculate HPA gain for given input power
   * Includes compression effects near P1dB
   */
  private calculateGain_(inputPowerDbm: number): number {
    if (!this.state.isPowered) {
      return -120; // Effectively off
    }

    // Ideal linear gain would bring signal to P1dB - backOff
    const targetOutputDbm = this.p1db_ - this.state.backOff;
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

    if (this.state.isPowered && (!bucPowered)) {
      // Disable HPA if power conditions not met
      this.state.isPowered = false;
    }
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<HPAState>): void {
    super.sync(state);
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    // Overdrive alarm
    if (this.state.isOverdriven && this.state.isPowered) {
      alarms.push('HPA overdrive - IMD degradation');
    }

    // Temperature alarm
    if (this.state.temperature > 85) {
      alarms.push(`HPA over-temperature (${this.state.temperature.toFixed(0)}°C)`);
    }

    // Power sequencing alarm
    const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

    if (this.state.isPowered && !bucPowered) {
      alarms.push('HPA enabled without BUC power');
    }

    return alarms;
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
    if (!this.state.isPowered) {
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
    if (!this.state.isPowered) {
      return -120; // Effectively off
    }

    const gain = this.calculateGain_(inputPowerDbm);
    return inputPowerDbm + gain;
  }

  /**
   * Check if HPA is in overdrive condition
   */
  isOverdriven(): boolean {
    return this.state.isOverdriven;
  }

  /**
   * Get current temperature
   */
  getTemperature(): number {
    return this.state.temperature;
  }

  /**
   * Get IMD level
   */
  getIMDLevel(): number {
    return this.state.imdLevel;
  }

  // Protected handlers for UI layer
  handlePowerToggle(isEnabled: boolean, callback: (state: HPAState) => void): void {
    const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

    // HPA can only be enabled if BUC is powered
    if (bucPowered) {
      this.state.isPowered = isEnabled;
    } else {
      // Disable if conditions not met
      this.state.isPowered = false;
    }

    callback(this.state);
  }

  handleBackOffChange(backOff: number): void {
    this.state.backOff = backOff;
  }

  handleHpaToggle(): void {
    if (!this.state.isPowered) {
      return;
    }

    this.state.isHpaSwitchEnabled = !this.state.isHpaSwitchEnabled;

    if (this.state.isPowered) {
      this.state.isHpaEnabled = this.state.isHpaSwitchEnabled;
    }
  }

  renderPowerMeter_(powerDbW: dBW): string {
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
}
