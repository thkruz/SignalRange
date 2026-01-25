import { SignalOrigin } from "@app/signal-origin";
import { dB, dBm, Hertz, IfFrequency, IfSignal, MHz, RfFrequency, RfSignal } from '@app/types';
import { RFFrontEndCore } from "../rf-front-end-core";
import { RFFrontEndModule, RFFrontEndModuleState } from '../rf-front-end-module';

/**
 * Spurious output from mixer products
 */
export interface SpuriousOutput {
  /** Frequency of the spurious signal in Hz */
  frequency: Hertz;
  /** Level relative to carrier in dBc */
  level: number;
  /** Harmonic orders: N×LO ± M×IF */
  loHarmonic: number;
  ifHarmonic: number;
}

/**
 * Block Up Converter module state
 */
export interface BUCState extends RFFrontEndModuleState {
  // ═══ Operational State ═══
  /** Module power state */
  isPowered: boolean;
  /** Output muted for safety */
  isMuted: boolean;
  /** Indicates if the BUC is in RF loopback mode */
  isLoopback: boolean;
  /** Operating temperature in °C */
  temperature: number;
  /** Current draw in Amperes */
  currentDraw: number;

  // ═══ Frequency Translation ═══
  /** Local Oscillator frequency in MHz (typical 3700-4200 for C-band) */
  loFrequency: MHz;
  /** Phase lock to external 10MHz reference */
  isExtRefLocked: boolean;
  /** LO frequency drift when unlocked (Hz) */
  frequencyError: number;
  /** Phase lock tracking range (Hz) */
  phaseLockRange: number;

  // ═══ Output Filter ═══
  /** Bandpass filter low edge in Hz */
  filterLowHz: Hertz;
  /** Bandpass filter high edge in Hz */
  filterHighHz: Hertz;
  /** Out-of-band rejection in dB (negative value) */
  filterRejectionDb: dB;

  // ═══ Gain & Power ═══
  /** BUC gain in dB (typical 0-70 dB range) */
  gain: dB;
  /** Output power after amplification in dBm */
  outputPower: dBm;
  /** P1dB compression point (saturation power) in dBm */
  saturationPower: dBm;
  /** Gain flatness across bandwidth in dB */
  gainFlatness: dB;

  // ═══ Signal Quality ═══
  /** Group delay variation (phase distortion) in nanoseconds */
  groupDelay: number;
  /** Phase noise contribution in dBc/Hz */
  phaseNoise: number;
  /** Unwanted mixer spurious products */
  spuriousOutputs: SpuriousOutput[];
  /** Noise floor in dBm */
  noiseFloor: number;
}

/**
 * BUC Module Core - Business Logic
 * Contains RF physics, state management, signal processing, module coupling
 */
export abstract class BUCModuleCore extends RFFrontEndModule<BUCState> {
  // Signals
  outputSignals: RfSignal[] = [];

  /**
   * Get default state for BUC module
   */
  static getDefaultState(): BUCState {
    return {
      // Operational State
      isPowered: true,
      isMuted: false,
      isLoopback: false,
      temperature: 25, // °C (ambient)
      currentDraw: 0, // A

      // Frequency Translation
      loFrequency: 6425 as MHz, // MHz (C-band)
      isExtRefLocked: true,
      frequencyError: 0, // Hz (locked)
      phaseLockRange: 10000, // ±10 kHz tracking range

      // Output Filter (C-band uplink)
      filterLowHz: 5.925e9 as Hertz,   // 5.925 GHz
      filterHighHz: 6.425e9 as Hertz,  // 6.425 GHz
      filterRejectionDb: -60 as dB,    // Out-of-band rejection

      // Gain & Power
      gain: 0 as dB,
      outputPower: -10 as dBm,
      saturationPower: 15 as dBm, // P1dB point
      gainFlatness: 0.5 as dB, // ±0.5 dB across bandwidth

      // Signal Quality
      groupDelay: 3, // ns
      phaseNoise: -100, // dBc/Hz @ 10kHz offset (locked)
      spuriousOutputs: [],
      noiseFloor: -140, // dBm/Hz
    };
  }

  constructor(state: BUCState, rfFrontEnd: RFFrontEndCore, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-buc', unit);
    // Don't call build() here - UI subclasses will call it

    this.state = { ...BUCModuleCore.getDefaultState(), ...state };
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Update lock status based on power and reference availability
    this.updateLockStatus_();

    // Calculate output power
    this.updateOutputPower_();

    // Update signal quality parameters
    this.updateSignalQuality_();

    // Update thermal parameters
    this.updateThermalState_();

    // If the module is unpowered, the RF output chain is inactive.
    // We still update derived state above (lock, drift, thermal, etc.),
    // but no output signals should be emitted.
    if (!this.state.isPowered) {
      this.outputSignals = [];
      return;
    }

    // Check for alarms is currently handled by RFFrontEndCore

    // Calculate post-BUC signals (apply upconversion and gain if powered)
    // Bandpass filter rejects out-of-band signals entirely
    const maxOutputPower = this.state.saturationPower + 2; // Hard saturation limit
    this.outputSignals = this.inputSignals
      .map(sig => {
        const rfFreq = this.calculateRfFrequency(sig.frequency);
        const inBand = this.isInPassband_(rfFreq);
        if (!inBand) return null;  // Reject out-of-band signals

        const gain = !this.state.isMuted
          ? this.state.gain
          : -170;
        const linearPower = sig.power + gain;
        return {
          ...sig,
          frequency: rfFreq,
          power: Math.min(linearPower, maxOutputPower) as dBm,
          bandwidth: sig.bandwidth,
          origin: SignalOrigin.BUC,
        } as RfSignal;
      })
      .filter((sig): sig is RfSignal => sig !== null);
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    if (!this.state.isPowered) {
      return alarms;
    }

    const extRefPresent = this.isExtRefPresent();

    // Lock alarm
    if (!this.state.isExtRefLocked && extRefPresent) {
      alarms.push('BUC not locked to reference');
    }

    // Frequency error alarm (when unlocked)
    if (!this.state.isExtRefLocked && Math.abs(this.state.frequencyError) > 50000) {
      alarms.push(`BUC frequency error: ${(this.state.frequencyError / 1000).toFixed(1)} kHz`);
    }

    // High output power warning (approaching saturation)
    if (this.state.outputPower > this.state.saturationPower - 2) {
      alarms.push(`BUC approaching saturation (${this.state.outputPower.toFixed(1)} dBm)`);
    }

    // High temperature alarm
    if (this.state.temperature > 70) {
      alarms.push(`BUC over-temperature (${this.state.temperature.toFixed(1)} °C)`);
    }

    // High current draw alarm
    if (this.state.currentDraw > 4.5) {
      alarms.push(`BUC high current draw (${this.state.currentDraw.toFixed(2)} A)`);
    }

    // Phase noise degradation (when unlocked)
    if (this.state.phaseNoise > -85 && !this.state.isExtRefLocked) {
      alarms.push('BUC phase noise degraded (unlocked)');
    }

    if (this.state.isLoopback) {
      alarms.push('BUC in loopback mode');
    }

    return alarms;
  }

  // ═══════════════════════════════════════════════════════════════
  // Signal Processing
  // ═══════════════════════════════════════════════════════════════

  get inputSignals(): IfSignal[] {
    return this.rfFrontEnd_.transmitters
      .flatMap((tx) => tx.state.modems
        .filter((modem) => modem.isTransmitting && !modem.isFaulted && !modem.isLoopback)
        .map((modem) => modem.ifSignal));
  }

  /**
   * Calculate upconverted RF frequency with physics-based accuracy
   * Mixer produces both sidebands (LO+IF and LO-IF), bandpass filter selects in-band signal.
   * When unlocked, frequency drifts by ±1-100 ppm
   *
   * @param ifFrequency IF input frequency in Hz
   * @returns RF output frequency in Hz (the in-band sideband)
   */
  calculateRfFrequency(ifFrequency: IfFrequency): RfFrequency {
    const loFrequencyHz = this.state.loFrequency * 1e6;

    // Apply frequency error when not locked to external reference
    const effectiveLO = (this.state.isExtRefLocked && this.isExtRefWarmedUp())
      ? loFrequencyHz
      : loFrequencyHz + this.state.frequencyError;

    // Mixer produces both sidebands
    const upperSideband = effectiveLO + ifFrequency;  // LO + IF
    const lowerSideband = effectiveLO - ifFrequency;  // LO - IF

    // Bandpass filter selects the in-band signal
    const upperInBand = this.isInPassband_(upperSideband);
    const lowerInBand = this.isInPassband_(lowerSideband);

    if (upperInBand) {
      return upperSideband as RfFrequency;
    } else if (lowerInBand) {
      return lowerSideband as RfFrequency;
    }

    // Neither in band - return upper sideband (will be attenuated by filter)
    return upperSideband as RfFrequency;
  }

  /**
   * Check if a frequency falls within the output bandpass filter
   */
  private isInPassband_(frequencyHz: number): boolean {
    return frequencyHz >= this.state.filterLowHz
      && frequencyHz <= this.state.filterHighHz;
  }

  /**
   * Get the active LO injection mode based on which sideband is in-band
   * @returns 'low' for USB (LO+IF in band), 'high' for LSB (LO-IF in band), 'none' if neither
   */
  getActiveInjectionMode(): 'low' | 'high' | 'none' {
    if (this.inputSignals.length === 0) return 'none';

    const ifFreq = this.inputSignals[0].frequency;
    const loHz = this.state.loFrequency * 1e6;

    const upperInBand = this.isInPassband_(loHz + ifFreq);
    const lowerInBand = this.isInPassband_(loHz - ifFreq);

    if (upperInBand) return 'low';   // Low-side injection → USB
    if (lowerInBand) return 'high';  // High-side injection → LSB
    return 'none';  // Neither in band
  }

  // ═══════════════════════════════════════════════════════════════
  // Public Handler Methods (for UI)
  // ═══════════════════════════════════════════════════════════════

  handlePowerToggle(isPowered?: boolean): void {
    if (isPowered !== undefined) {
      this.state.isPowered = isPowered;
    }
  }

  handleGainChange(gain: number): void {
    this.state.gain = gain as dB;
  }

  handleMuteToggle(isMuted: boolean): void {
    this.state.isMuted = isMuted;
  }

  handleLoFrequencyChange(frequency: number): void {
    this.state.loFrequency = frequency as MHz;
  }

  handleLoopbackToggle(isLoopback: boolean): void {
    this.state.isLoopback = isLoopback;
  }

  protected getLoopbackLedStatus(): string {
    return this.state.isLoopback ? 'led-blue' : 'led-off';
  }

  // ═══════════════════════════════════════════════════════════════
  // Business Logic - Private Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate BUC output power with saturation/compression modeling
   * Models P1dB compression point where output hard-limits at saturation
   */
  private updateOutputPower_(): void {
    if (!this.state.isPowered || this.state.isMuted) {
      this.state.outputPower = -170 as dBm; // Effectively off
      return;
    }

    const inputPower = -10 as dBm; // dBm typical IF input
    const linearOutputPower = inputPower + this.state.gain;

    // Model amplifier saturation (P1dB)
    // Real amplifiers hard-limit at saturation - output cannot exceed saturation by much
    const maxOutputPower = this.state.saturationPower + 2; // Max 2 dB above P1dB (hard saturation)
    this.state.outputPower = Math.min(linearOutputPower, maxOutputPower) as dBm;
  }

  /**
   * Update lock status based on power and external reference
   * Simulates frequency drift when unlocked
   */
  private updateLockStatus_(): void {
    const extRefPresent = this.isExtRefPresent();
    const canLock = this.state.isPowered && extRefPresent;

    if (canLock) {
      // In real system, lock acquisition takes 2-5 seconds
      // Simulate lock acquisition if not already locked
      if (!this.state.isExtRefLocked) {
        this.simulateLockAcquisition();
      }
      // When locked, frequency error is minimal
      if (this.isExtRefWarmedUp()) {
        this.state.frequencyError = 0;
      } else {
        this.updateFrequencyDrift_();
      }
    } else {
      this.state.isExtRefLocked = false;
      this.updateFrequencyDrift_();
    }
  }

  /**
   * Update frequency drift when LO is not locked to external reference
   * Drift is ±1-100 ppm of LO frequency
   */
  private updateFrequencyDrift_(): void {
    if (this.state.isExtRefLocked && this.isExtRefWarmedUp()) {
      this.state.frequencyError = 0;
      return;
    }

    const loFrequencyHz = this.state.loFrequency * 1e6;
    // Simulate drift: ±1-100 ppm (parts per million)
    // Use random walk model for realistic drift behavior
    const driftPpm = 10 + Math.random() * 90; // 10-100 ppm
    const driftDirection = Math.random() > 0.5 ? 1 : -1;
    this.state.frequencyError = driftDirection * (loFrequencyHz * driftPpm / 1e6);
  }

  /**
   * Update signal quality parameters (phase noise, group delay, spurious outputs)
   */
  private updateSignalQuality_(): void {
    if (!this.state.isPowered) {
      this.state.phaseNoise = 0;
      this.state.groupDelay = 0;
      this.state.spuriousOutputs = [];
      return;
    }

    // Phase noise contribution increases when unlocked
    // Typical locked: -100 dBc/Hz @ 10kHz offset
    // Unlocked: -70 to -80 dBc/Hz (degraded)
    this.state.phaseNoise = this.state.isExtRefLocked
      ? -100 - Math.random() * 5 // -100 to -105 dBc/Hz
      : -70 - Math.random() * 10; // -70 to -80 dBc/Hz

    // Group delay variation (phase distortion across bandwidth)
    // Typical: 2-10 ns, increases with temperature and at band edges
    const baseDelay = 3; // ns
    const tempVariation = (this.state.temperature - 25) * 0.1; // 0.1 ns/°C
    this.state.groupDelay = baseDelay + tempVariation + Math.random() * 2;

    // Calculate spurious mixer products (N×LO ± M×IF)
    this.state.spuriousOutputs = this.calculateSpuriousProducts_();
  }

  /**
   * Calculate spurious outputs from mixer products
   * Generates harmonics at N×LO ± M×IF
   */
  private calculateSpuriousProducts_(): SpuriousOutput[] {
    if (!this.state.isPowered || this.inputSignals.length === 0) {
      return [];
    }

    const spurious: SpuriousOutput[] = [];
    const loFreqHz = this.state.loFrequency * 1e6;

    // For each input signal, calculate primary spurious products
    this.inputSignals.forEach(signal => {
      const ifFreqHz = signal.frequency;

      spurious.push(
        // 2×LO - IF (2nd harmonic mixing)
        {
          frequency: (2 * loFreqHz - ifFreqHz) as Hertz,
          level: -30 - Math.random() * 10, // -30 to -40 dBc
          loHarmonic: 2,
          ifHarmonic: -1,
        },
        // 2×LO + IF (2nd harmonic mixing)
        {
          frequency: (2 * loFreqHz + ifFreqHz) as Hertz,
          level: -35 - Math.random() * 10, // -35 to -45 dBc
          loHarmonic: 2,
          ifHarmonic: 1,
        },
        // 3×LO - IF (3rd harmonic)
        {
          frequency: (3 * loFreqHz - ifFreqHz) as Hertz,
          level: -40 - Math.random() * 15, // -40 to -55 dBc
          loHarmonic: 3,
          ifHarmonic: -1,
        }
      );
    });

    return spurious;
  }

  /**
   * Update thermal and operational state
   */
  private updateThermalState_(): void {
    if (!this.state.isPowered) {
      // Cooling down gradually toward ambient (25°C)
      const ambientTemp = 25;
      const coolRate = 0.00001; // Slow cooling per update
      this.state.temperature = this.state.temperature +
        (ambientTemp - this.state.temperature) * coolRate;
      this.state.currentDraw = 0;
      return;
    }

    // Calculate target temperature based on output power
    const ambientTemp = 25; // °C
    const powerDissipation = Math.max(0, this.state.outputPower - (-10));
    const thermalRise = powerDissipation * 0.8; // °C per dBm above reference
    const targetTemp = ambientTemp + thermalRise;

    // Simulate gradual heating (thermal inertia)
    const heatRate = 0.00005; // Slow heating per update
    this.state.temperature = this.state.temperature +
      (targetTemp - this.state.temperature) * heatRate;

    // Current draw trends gradually toward target value
    const idleCurrent = 0.5;
    const powerCurrent = (this.state.gain / 70) * 2.5; // 0-2.5A based on gain
    const outputCurrent = Math.max(0, (this.state.outputPower + 10) / 20) * 1.5;
    const targetCurrent = idleCurrent + powerCurrent + outputCurrent;
    const currentRate = 0.1; // Slow current change per update
    this.state.currentDraw = this.state.currentDraw +
      (targetCurrent - this.state.currentDraw) * currentRate;
  }

  // ═══════════════════════════════════════════════════════════════
  // Public Utility Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get total gain through BUC
   * @returns Gain in dB
   */
  getTotalGain(): number {
    if (!this.state.isPowered || this.state.isMuted) {
      return -120; // Effectively off
    }
    return this.state.gain;
  }

  /**
   * Get output power for given input power with saturation modeling
   * @param inputPowerDbm Input IF power in dBm
   * @returns Output RF power in dBm (clamped at saturation)
   */
  getOutputPower(inputPowerDbm: number): number {
    if (!this.state.isPowered || this.state.isMuted) {
      return -120; // Effectively off
    }

    const linearOutputPower = inputPowerDbm + this.state.gain;

    // Hard-limit at saturation (max 2 dB above P1dB)
    const maxOutputPower = this.state.saturationPower + 2;
    return Math.min(linearOutputPower, maxOutputPower);
  }

  /**
   * Get current compression amount in dB
   * @returns Compression in dB (0 if in linear region)
   */
  getCompressionDb(): number {
    if (!this.state.isPowered || this.state.isMuted) {
      return 0;
    }

    const inputPower = -10; // Typical IF input
    const linearOutputPower = inputPower + this.state.gain;
    const maxOutputPower = this.state.saturationPower + 2;

    if (linearOutputPower > maxOutputPower) {
      // Compression = how much we're clipping
      return linearOutputPower - maxOutputPower;
    }

    return 0;
  }

  /**
   * Get frequency stability status
   * @returns Frequency stability in ppm
   */
  getFrequencyStabilityPpm(): number {
    const loFrequencyHz = this.state.loFrequency * 1e6;
    if (loFrequencyHz === 0) return 0;
    return (this.state.frequencyError / loFrequencyHz) * 1e6;
  }

  /**
   * Check if BUC is operating in saturation region
   * @returns True if in saturation
   */
  isInSaturation(): boolean {
    return this.state.outputPower >= this.state.saturationPower;
  }

  /**
   * Get signal quality metrics
   * @returns Object with quality metrics
   */
  getSignalQualityMetrics(): {
    phaseNoise: number;
    groupDelay: number;
    frequencyError: number;
    isLocked: boolean;
    spuriousCount: number;
  } {
    return {
      phaseNoise: this.state.phaseNoise,
      groupDelay: this.state.groupDelay,
      frequencyError: this.state.frequencyError,
      isLocked: this.state.isExtRefLocked,
      spuriousCount: this.state.spuriousOutputs.length,
    };
  }

  /**
   * Get thermal state
   * @returns Object with thermal parameters
   */
  getThermalState(): {
    temperature: number;
    currentDraw: number;
    powerDissipation: number;
  } {
    const powerOut = Math.pow(10, this.state.outputPower / 10);
    const powerDissipation = this.state.currentDraw * 28 - powerOut; // Assuming 28V supply

    return {
      temperature: this.state.temperature,
      currentDraw: this.state.currentDraw,
      powerDissipation: powerDissipation, // mW
    };
  }
}
