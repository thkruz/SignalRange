import { carrierTransmission, transmissionLossDb } from '@app/equipment/rf-front-end/filter-response';
import { combinePhaseNoiseDbcHz, FreeRunDrift, LO_PHASE_NOISE_DBC_HZ } from '@app/equipment/rf-front-end/lo-reference';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { RFFrontEndModule, RFFrontEndModuleState } from '@app/equipment/rf-front-end/rf-front-end-module';
import { SignalOrigin } from '@app/signal-origin';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { dB, dBm, Hertz, IfFrequency, IfSignal, MHz, RfFrequency, RfSignal } from '@app/types';

/** L-band IF passband of a block downconverter, Hz */
export const LNB_IF_PASSBAND_LOW_HZ = 950e6;
export const LNB_IF_PASSBAND_HIGH_HZ = 2150e6;
/** Skirt beyond each passband edge: -3 dB this far out, falling as a 3rd-order Butterworth */
const PASSBAND_SKIRT_HZ = 25e6;
const PASSBAND_SKIRT_ORDER = 3;
/** A carrier the passband takes more than this off does not reach the IF at all, dB */
const PASSBAND_DROP_DB = 60;

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
  /**
   * Sticky fault that prevents reference lock acquisition.
   * Set to true to simulate a reference lock fault condition.
   * Clears automatically when LNB is power cycled (OFF then ON).
   */
  hasRefLockFault?: boolean;
  /**
   * Direct-sampling mode (SDR front ends): bypasses the mixer so RF passes
   * through at its original frequency, with a wide SDR passband instead of the
   * 950-2150 MHz L-band IF filter. Opt-in: when omitted/false the legacy
   * block-downconversion path is unchanged.
   */
  isDirectSampling?: boolean;
  /**
   * LO injection (Phase 19.6): 'high' = LO above RF, IF = LO − RF (spectrum
   * inverted; the default, every shipped station), 'low' = IF = RF − LO.
   */
  loInjection?: 'high' | 'low';
}

/** Direct-sampling (SDR) passband limits, modeled on common RTL-SDR tuners */
export const DIRECT_SAMPLING_PASSBAND_LOW_HZ = 24e6;
export const DIRECT_SAMPLING_PASSBAND_HIGH_HZ = 1766e6;

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
  private lastRunMs_: number | null = null;
  /**
   * The LO's own oscillator when it is not locked to the station reference:
   * a PLL LNB whose reference is lost free-runs its VCO (±20 ppm start,
   * 5 ppm/√h random walk, ±200 ppm bound: a DRO-class ±1 MHz at C-band).
   */
  private readonly drift_ = new FreeRunDrift(() => Rng.stream('lnb'), 5, 20, 200);

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

    // An LNB powered when the station is built has been running: it starts
    // warm and stable (19.6). Warm-up runs from an operator power-on.
    this.powerOnTimestamp_ = null;
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    const now = SimClock.runMs();
    const dtS = this.lastRunMs_ !== null && now >= this.lastRunMs_ ? (now - this.lastRunMs_) / 1000 : 0;
    this.lastRunMs_ = now;

    // Update physical temperature based on power and elapsed time
    this.updateThermalState_();

    // Update noise temperature based on noise figure
    this.updateNoiseTemperature_();

    // Update lock status based on power and reference availability
    this.updateLockStatus_();

    // Update frequency drift based on temperature and lock status
    this.updateFrequencyDrift_(dtS);

    // Check for alarms
    this.checkAlarms_();

    // An unpowered LNB passes nothing: no LNA gain, no mixer, no IF output.
    if (!this.state.isPowered) {
      this.postLNASignals = [];
      this.ifSignals = [];
      return;
    }

    // Calculate post-LNA signals (apply LNA gain)
    this.postLNASignals = this.rxSignalsIn.map(
      (sig) =>
        ({
          ...sig,
          power: sig.power + this.state.gain,
          origin: SignalOrigin.LOW_NOISE_AMPLIFIER,
        }) as RfSignal
    );

    // Calculate IF signals after LNB based on LO frequency.
    // Direct sampling (SDR): RF passes through unmixed with a wide tuner
    // passband; legacy path applies the 950-2150 MHz L-band IF filter.
    const passbandLow = this.state.isDirectSampling ? DIRECT_SAMPLING_PASSBAND_LOW_HZ : LNB_IF_PASSBAND_LOW_HZ;
    const passbandHigh = this.state.isDirectSampling ? DIRECT_SAMPLING_PASSBAND_HIGH_HZ : LNB_IF_PASSBAND_HIGH_HZ;
    const loPhaseNoise = this.state.isDirectSampling ? undefined : this.loPhaseNoiseDbcHz;
    const rxIfCableLoss = this.rfFrontEnd_.cableLossDb('rxIf');

    const ifSignals: IfSignal[] = [];

    for (const sig of this.postLNASignals) {
      const ifFreq = this.calculateIfFrequency(sig.frequency);

      // Passband with skirts (Phase 19.6): flat across 950-2150 MHz, rolling
      // off beyond each edge; a carrier pays the overlap integral of the
      // response with its spectrum. One the skirts bury is not there at all.
      const transmission = carrierTransmission(ifFreq, sig.bandwidth, (f) => LNBModuleCore.passbandPower(f, passbandLow, passbandHigh));
      const lossDb = transmissionLossDb(transmission);
      if (lossDb > PASSBAND_DROP_DB) {
        continue;
      }

      ifSignals.push({
        ...sig,
        frequency: ifFreq,
        power: (sig.power - lossDb - rxIfCableLoss) as dBm,
        phaseNoiseDbcHz: combinePhaseNoiseDbcHz(sig.phaseNoiseDbcHz, loPhaseNoise),
        origin: SignalOrigin.LOW_NOISE_BLOCK,
      } as IfSignal);
    }

    this.ifSignals = ifSignals;
  }

  /** IF passband power response: 1 inside, a Butterworth skirt beyond each edge */
  static passbandPower(f: number, lowHz: number, highHz: number): number {
    const beyond = f < lowHz ? lowHz - f : f > highHz ? f - highHz : 0;
    if (beyond === 0) {
      return 1;
    }

    return 1 / (1 + (beyond / PASSBAND_SKIRT_HZ) ** (2 * PASSBAND_SKIRT_ORDER));
  }

  /** The LO's phase-noise plateau, dBc/Hz: synthesiser on the station reference, or its VCO free-running */
  get loPhaseNoiseDbcHz(): number {
    return this.isLoDisciplined_() ? LO_PHASE_NOISE_DBC_HZ.locked : LO_PHASE_NOISE_DBC_HZ.lnbUnlocked;
  }

  /** True when the LO synthesiser is locked to a warmed-up station reference */
  private isLoDisciplined_(): boolean {
    return this.state.isExtRefLocked && this.isExtRefPresent() && this.rfFrontEnd_.gpsdoModule.get10MhzOutput().isWarmedUp;
  }

  /**
   * Seconds since the LNB was last powered on (Infinity when it has been on
   * since the scenario was built with a zero stabilization time).
   */
  get secondsSincePowerOn(): number {
    if (!this.state.isPowered) return 0;
    if (this.powerOnTimestamp_ === null) return Number.POSITIVE_INFINITY;

    return Math.max(0, (SimClock.runMs() - this.powerOnTimestamp_) / 1000);
  }

  /**
   * Thermally stable: powered for at least its thermal stabilization time,
   * with the noise temperature settled (Phase 19.6: `lnb-thermally-stable`
   * used to pass at power-on, because 25 °C was inside its window).
   */
  isThermallyStable(): boolean {
    if (!this.state.isPowered) return false;
    const settleS = Math.max(this.state.thermalStabilizationTime, this.state.noiseTemperatureStabilizationTime);

    return this.secondsSincePowerOn >= settleS;
  }

  get rxSignalsIn(): RfSignal[] {
    const omtSignals = this.rfFrontEnd_.omtModule.rxSignalsOut;
    const bucLoopback = this.rfFrontEnd_.bucModule.state.isLoopback ? this.rfFrontEnd_.bucModule.outputSignals : [];

    return [...omtSignals, ...bucLoopback];
  }

  /**
   * Calculate noise temperature from noise figure
   * T_noise = T_0 * (F - 1), where T_0 = 290K
   *
   * Includes thermal stabilization: noise temperature starts higher when
   * first powered on and gradually decreases to nominal value as components
   * warm up to steady-state operating temperature.
   *
   * Also applies exponential smoothing so parameter changes (like gain)
   * cause gradual noise temperature transitions rather than instant jumps.
   */
  private updateNoiseTemperature_(): void {
    if (!this.state.isPowered) {
      this.state.noiseTemperature = 290; // Ambient temperature when off
      return;
    }

    const nfLnaLinear = 10 ** (this.state.lnaNoiseFigure / 10);
    const nfMixerLinear = 10 ** (this.state.mixerNoiseFigure / 10);
    const gainLnaLinear = this.state.gain > 0 ? 10 ** (this.state.gain / 10) : 1;

    // Friis formula for cascaded stages
    const nfTotal = nfLnaLinear + (nfMixerLinear - 1) / gainLnaLinear;

    // Calculate nominal (fully stabilized) noise temperature
    const nominalNoiseTemp = 290 * (nfTotal - 1);

    // Calculate target temperature (accounting for power-on warmup)
    let targetNoiseTemp = nominalNoiseTemp;

    if (this.powerOnTimestamp_ !== null) {
      const timeElapsedMs = SimClock.runMs() - this.powerOnTimestamp_;
      const timeElapsedSec = timeElapsedMs / 1000;
      const stabilizationTime = this.state.noiseTemperatureStabilizationTime;

      if (timeElapsedSec < stabilizationTime) {
        // Components still warming up - use exponential decay
        // Time constant = stabilizationTime / 3 (so ~95% stabilized after stabilizationTime)
        const timeConstant = stabilizationTime / 3;
        const stabilizationFactor = Math.exp(-timeElapsedSec / timeConstant);

        // Start at 2x nominal (cold components have worse noise performance)
        const initialNoiseTemp = nominalNoiseTemp * 2;

        // Target is between initial and nominal based on warmup progress
        targetNoiseTemp = nominalNoiseTemp + (initialNoiseTemp - nominalNoiseTemp) * stabilizationFactor;
      }
    }

    // Apply exponential smoothing so changes are gradual (not instant)
    // Use faster smoothing for large changes (like gain adjustments)
    // and slower smoothing for small changes (thermal drift)
    const tempDelta = Math.abs(targetNoiseTemp - this.state.noiseTemperature);
    // Fast response (0.1) for large changes, slow (0.005) for small changes
    const smoothingFactor = tempDelta > 100 ? 0.1 : 0.005;
    this.state.noiseTemperature += (targetNoiseTemp - this.state.noiseTemperature) * smoothingFactor;
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

    const timeElapsedMs = SimClock.runMs() - this.powerOnTimestamp_;
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
  updateFrequencyDrift_(dtS = 0): void {
    const loFrequencyHz = this.state.loFrequency * 1e6;

    // Locked to a warmed-up station reference: the LO carries the GPSDO's
    // fractional error (Phase 19.6 reference chain)
    if (this.isLoDisciplined_()) {
      this.drift_.stop();
      this.state.frequencyError = this.rfFrontEnd_.gpsdoModule.fractionalFrequencyError() * loFrequencyHz;
      return;
    }

    // Free-running: the oscillator's seeded random walk on run time, plus its
    // temperature coefficient while it is away from its 50 °C operating point
    // (0.5 ppm/°C, cold reads low)
    this.drift_.start();
    this.drift_.step(dtS);
    const tempDriftPpm = (this.state.temperature - 50) * 0.5;

    this.state.frequencyError = ((this.drift_.ppm + tempDriftPpm) * loFrequencyHz) / 1e6;
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
   * Checks for sticky fault condition before allowing lock acquisition
   */
  private updateLockStatus_(): void {
    // If sticky fault is active, force unlock and prevent lock acquisition
    if (this.state.hasRefLockFault) {
      this.state.isExtRefLocked = false;
      return;
    }

    // Normal lock status update via base class
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

    if (!this.state.isPowered) {
      return alarms; // No alarms when powered off
    }

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
    // Direct sampling (SDR): no mixer, RF frequency passes through unchanged
    if (this.state.isDirectSampling) {
      return rfFrequency as number as IfFrequency;
    }

    // Apply the LO's frequency error (the reference's when locked)
    const effectiveLO = this.state.loFrequency * 1e6 + this.state.frequencyError;

    // High-side injection (default): IF = LO − RF; low-side: IF = RF − LO
    return (this.state.loInjection === 'low' ? rfFrequency - effectiveLO : effectiveLO - rfFrequency) as IfFrequency;
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
    const wasPowered = this.state.isPowered;

    if (isPowered !== undefined) {
      this.state.isPowered = isPowered;
    } else {
      this.state.isPowered = !this.state.isPowered;
    }

    // Track power-on time for noise temperature stabilization
    if (this.state.isPowered) {
      this.powerOnTimestamp_ = SimClock.runMs();

      // Clear sticky fault on power-on (simulates power cycle clearing transient faults)
      if (!wasPowered && this.state.hasRefLockFault) {
        this.state.hasRefLockFault = false;
      }
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
