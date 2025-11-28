import { SignalOrigin } from "@app/SignalOrigin";
import { dB, Hertz, IfFrequency, IfSignal, MHz, RfFrequency, RfSignal } from '@app/types';
import { RFFrontEndCore } from "../rf-front-end-core";
import { RFFrontEndModule, RFFrontEndModuleState } from '../rf-front-end-module';

/**
 * Low Noise Block converter module state
 */
export interface LNBState extends RFFrontEndModuleState {
  noiseFloor: number;
  isPowered: boolean;
  loFrequency: MHz;
  gain: dB; // dB (40-65)
  lnaNoiseFigure: number; // dB (0.3-1.2)
  mixerNoiseFigure: number; // dB (e.g., 6-10)
  noiseTemperature: number; // Kelvin
  noiseTemperatureStabilizationTime: number; // seconds (time for noise temp to stabilize after power-on)
  temperature: number; // °C (physical temperature)
  thermalStabilizationTime: number; // seconds (time for physical temp to stabilize after power-on)
  frequencyError: number; // Hz (LO frequency drift)
  isExtRefLocked: boolean;
}

/**
 * LNB Module Core - Business Logic Layer
 * Contains RF physics, signal processing, state management
 * No UI dependencies
 */
export abstract class LNBModuleCore extends RFFrontEndModule<LNBState> {
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
      loFrequency: 6080 as MHz, // MHz
      gain: 0 as dB, // dB
      lnaNoiseFigure: 0.6, // dB
      mixerNoiseFigure: 16.0, // dB
      noiseTemperature: 45, // K
      noiseTemperatureStabilizationTime: 150, // seconds (2.5 minutes - consumer LNB)
      temperature: 25, // °C (ambient start temperature)
      thermalStabilizationTime: 150, // seconds (2.5 minutes - matches noise temp)
      frequencyError: 0, // Hz (LO frequency drift)
      isExtRefLocked: true,
      noiseFloor: -140, // dBm/Hz
    };
  }

  constructor(state: LNBState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super({ ...LNBModuleCore.getDefaultState(), ...state }, rfFrontEnd, 'rf-fe-lnb', unit);

    // Initialize power-on timestamp if already powered
    if (this.state.isPowered) {
      this.powerOnTimestamp_ = Date.now();
    }
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
    this.postLNASignals = this.rxSignalsIn.map(sig => {
      const gain = this.state.isPowered ? 0 : -300;
      return {
        ...sig,
        power: sig.power + gain,
        origin: SignalOrigin.LOW_NOISE_AMPLIFIER,
      } as RfSignal;
    });

    // Calculate IF signals after LNB based on LO frequency
    this.ifSignals = this.postLNASignals.map(sig => {
      const ifFreq = this.calculateIfFrequency(sig.frequency);

      // If frequency is outside of 950e6 or 2150e6, drop signal 40 dB to simulate the bandpass filters
      let filteredPower = (ifFreq < 950e6 || ifFreq > 2150e6) ? sig.power - 40 : sig.power;

      // If it is on the edge and the bandwidth causes it to partially roll off, apply partial attenuation
      const halfBw = sig.bandwidth / 2;
      if (ifFreq - halfBw < 950e6) {
        const overlapHz = 950e6 - (ifFreq - halfBw);
        const overlapFraction = overlapHz / sig.bandwidth;
        filteredPower -= 40 * overlapFraction;
      } else if (ifFreq + halfBw > 2150e6) {
        const overlapHz = (ifFreq + halfBw) - 2150e6;
        const overlapFraction = overlapHz / sig.bandwidth;
        filteredPower -= 40 * overlapFraction;
      }

      return {
        ...sig,
        frequency: ifFreq,
        power: filteredPower,
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
    if (!this.state.isPowered) {
      this.state.noiseTemperature = 290; // Ambient temperature when off
      return;
    }

    const nfLnaLinear = Math.pow(10, this.state.lnaNoiseFigure / 10);
    const nfMixerLinear = Math.pow(10, this.state.mixerNoiseFigure / 10);
    const gainLnaLinear = this.state.gain > 0 ? Math.pow(10, this.state.gain / 10) : 1;

    // Friis formula for cascaded stages
    const nfTotal = nfLnaLinear + (nfMixerLinear - 1) / gainLnaLinear;

    // Calculate nominal (fully stabilized) noise temperature
    const nominalNoiseTemp = 290 * (nfTotal - 1);

    // Apply thermal stabilization if power-on time is tracked
    if (this.powerOnTimestamp_ === null) {
      // No power-on tracking (shouldn't happen, but fallback)
      this.state.noiseTemperature = nominalNoiseTemp;
      return;
    }

    const timeElapsedMs = Date.now() - this.powerOnTimestamp_;
    const timeElapsedSec = timeElapsedMs / 1000;
    const stabilizationTime = this.state.noiseTemperatureStabilizationTime;

    if (timeElapsedSec < stabilizationTime) {
      // Components still warming up - use exponential decay
      // Time constant = stabilizationTime / 3 (so ~95% stabilized after stabilizationTime)
      const timeConstant = stabilizationTime / 3;
      const stabilizationFactor = Math.exp(-timeElapsedSec / timeConstant);

      // Start at 2x nominal (cold components have worse noise performance)
      const initialNoiseTemp = nominalNoiseTemp * 2;

      // Exponentially decay from initial to nominal
      this.state.noiseTemperature = nominalNoiseTemp +
        (initialNoiseTemp - nominalNoiseTemp) * stabilizationFactor;
    } else {
      // Fully stabilized
      this.state.noiseTemperature = nominalNoiseTemp;
    }
  }

  /**
   * Update physical temperature based on power state and elapsed time
   * Physical temperature affects oscillator stability and frequency drift
   */
  updateThermalState_(): void {
    const ambientTemp = 25; // °C (room temperature)
    const operatingTemp = 50; // °C (typical LNB operating temperature)

    if (!this.state.isPowered) {
      // When powered off, temperature decays to ambient
      this.state.temperature = ambientTemp;
      return;
    }

    if (this.powerOnTimestamp_ === null) {
      // No power-on tracking (shouldn't happen, but fallback)
      this.state.temperature = operatingTemp;
      return;
    }

    const timeElapsedMs = Date.now() - this.powerOnTimestamp_;
    const timeElapsedSec = timeElapsedMs / 1000;
    const stabilizationTime = this.state.thermalStabilizationTime;

    if (timeElapsedSec < stabilizationTime) {
      // Components still warming up - use exponential rise
      // Time constant = stabilizationTime / 3 (so ~95% stabilized after stabilizationTime)
      const timeConstant = stabilizationTime / 3;
      const heatingFactor = 1 - Math.exp(-timeElapsedSec / timeConstant);

      // Exponentially rise from ambient to operating temperature
      this.state.temperature = ambientTemp + (operatingTemp - ambientTemp) * heatingFactor;
    } else {
      // Fully stabilized
      this.state.temperature = operatingTemp;
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
    if (this.state.isExtRefLocked && extRefWarmedUp) {
      this.state.frequencyError = 0;
      return;
    }

    // When not locked or reference not warmed up, calculate temperature-dependent drift
    const nominalTemp = 50; // °C (operating temperature where drift is minimal)
    const tempDeviation = Math.abs(this.state.temperature - nominalTemp);

    // Temperature coefficient: 0.5 ppm/°C (typical for LNB DRO)
    const tempCoefficientPpm = 0.5;
    const tempDriftPpm = tempDeviation * tempCoefficientPpm;

    // Add aging drift component: 1-3 ppm
    const agingDriftPpm = 1 + Math.random() * 2;

    // Total drift in ppm
    const totalDriftPpm = tempDriftPpm + agingDriftPpm;

    // Convert to Hz
    const loFrequencyHz = this.state.loFrequency * 1e6;

    // Drift is negative when cold (frequency drops), positive when hot
    const driftDirection = this.state.temperature < nominalTemp ? -1 : 1;

    this.state.frequencyError = driftDirection * (loFrequencyHz * totalDriftPpm / 1e6);
  }

  /**
   * Calculate noise floor based on system noise temperature in dBm/Hz
   */
  getNoiseFloor(bandwidthHz: Hertz): number {
    // Noise floor based on actual system noise temperature
    // P_noise = k·T·B where k = Boltzmann constant (1.38e-23 J/K)
    // In dBm/Hz: P = 10·log₁₀(k·T·B) + 30 = -198.6 + 10·log₁₀(T) + 10·log₁₀(B)
    const T_sys = this.state.noiseTemperature; // Use actual system temperature (includes thermal stabilization)

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
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    const extRefPresent = this.isExtRefPresent();

    // Lock alarm
    if (this.state.isPowered && !this.state.isExtRefLocked && extRefPresent) {
      alarms.push('LNB not locked to reference');
    }

    // High noise temperature alarm
    if (this.state.noiseTemperature > 100) {
      alarms.push(`LNB noise temperature high (${this.state.noiseTemperature.toFixed(0)}K)`);
    }

    // High noise figure alarm
    if (this.state.lnaNoiseFigure > 1.0) {
      alarms.push(`LNB noise figure degraded (${this.state.lnaNoiseFigure.toFixed(2)} dB)`);
    }

    return alarms;
  }

  /**
   * Calculate downconverted IF frequency
   * @param rfFrequency RF input frequency in Hz
   * @returns IF output frequency in Hz
   */
  calculateIfFrequency(rfFrequency: RfFrequency): IfFrequency {
    // Apply frequency error to LO (error is 0 when locked and warmed up)
    const effectiveLO = this.state.loFrequency * 1e6 + this.state.frequencyError;

    // LNB should be high side injection: IF = LO - RF, TODO: rare models use low side
    return effectiveLO - rfFrequency as IfFrequency;
  }

  /**
   * Get total gain through LNB
   * @returns Gain in dB
   */
  getTotalGain(): number {
    if (!this.state.isPowered) {
      return -100; // Effectively off
    }
    return this.state.gain;
  }

  /**
   * Get output power for given input power
   * @param inputPowerDbm Input RF power in dBm
   * @returns Output IF power in dBm
   */
  getOutputPower(inputPowerDbm: number): number {
    if (!this.state.isPowered) {
      return -120; // Effectively off
    }
    return inputPowerDbm + this.state.gain;
  }

  // Public handlers for UI layer
  public handlePowerToggle(isPowered?: boolean): void {
    if (isPowered !== undefined) {
      this.state.isPowered = isPowered;
    } else {
      this.state.isPowered = !this.state.isPowered;
    }

    // Track power-on time for noise temperature stabilization
    if (this.state.isPowered) {
      this.powerOnTimestamp_ = Date.now();
    } else {
      this.powerOnTimestamp_ = null;
    }
  }

  public handleGainChange(gain: number): void {
    this.state.gain = gain as dB;
  }

  public handleLoFrequencyChange(frequency: number): void {
    this.state.loFrequency = frequency as MHz;
  }
}
