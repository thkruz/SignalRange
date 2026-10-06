import { type AmplifierModel, amplifierFromDatasheet, compressionDb, outputPowerDbm } from '@app/equipment/rf-front-end/amplifier-models';
import { FreeRunDrift, LO_PHASE_NOISE_DBC_HZ } from '@app/equipment/rf-front-end/lo-reference';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { RFFrontEndModule, RFFrontEndModuleState } from '@app/equipment/rf-front-end/rf-front-end-module';
import { SignalOrigin } from '@app/signal-origin';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { dB, dBm, Hertz, IfFrequency, IfSignal, MHz, RfFrequency, RfSignal } from '@app/types';

/** BUC thermal time constant (an outdoor unit's finned heatsink), s */
const BUC_THERMAL_TAU_S = 600;
/** Current-draw settling time constant (bias and fan control), s */
const BUC_CURRENT_TAU_S = 2;
/** Gain applied to carriers while muted, dB */
const MUTED_GAIN_DB = -170;

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

  // ═══ Thermal / power supply (Phase 19.6) ═══
  /** Supply voltage, V (default 24) */
  supplyVoltageV?: number;
  /** Current with no RF out: synthesiser, mixers, IF stages, fan, A (default 2.6) */
  idleCurrentA?: number;
  /** Extra output-stage current at saturated output, A (default 2.4) */
  amplifierCurrentAtSatA?: number;
  /** Heatsink thermal resistance, °C per W dissipated (default 0.30) */
  thermalResistanceCPerW?: number;
  /** Ambient (cooling air) temperature, °C (default 25) */
  ambientTemperatureC?: number;
  /** Composite IF drive, dBm (−120 with none) */
  inputPower?: dBm;
  /** Gain compression at the present drive, dB */
  compression?: number;
}

/**
 * BUC Module Core - Business Logic
 * Contains RF physics, state management, signal processing, module coupling
 */
export abstract class BUCModuleCore extends RFFrontEndModule<BUCState> {
  /** Staged cooling fault, degC above the normal thermal target (0 = healthy) */
  private thermalOffsetC_ = 0;
  /** Staged cooling fault: thermal resistance multiplier (1 = healthy fan and heatsink) */
  private coolingFactor_ = 1;
  /** Staged fault: extra supply current from a failing stage, A */
  private excessCurrentA_ = 0;
  private lastThermalRunMs_: number | null = null;
  /**
   * False until the first update: a station is built already running, so the
   * case starts at its equilibrium for the configured operating point rather
   * than at the config's placeholder temperature (a scenario that stages a
   * temperature calls setTemperature first)
   */
  private thermalPrimed_ = false;
  /** Internal reference when the BUC is not locked to the station 10 MHz */
  private readonly drift_ = new FreeRunDrift(() => Rng.stream('buc'), 2, 10, 30);
  private model_: AmplifierModel | null = null;
  private modelKey_ = '';

  // Signals
  outputSignals: RfSignal[] = [];

  /** Reported output power when the BUC emits nothing (dBm). */
  static readonly OUTPUT_POWER_FLOOR_DBM = -120 as dBm;

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
      filterLowHz: 5.925e9 as Hertz, // 5.925 GHz
      filterHighHz: 6.425e9 as Hertz, // 6.425 GHz
      filterRejectionDb: -60 as dB, // Out-of-band rejection

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
    const dtS = this.advanceRunClock_();

    // Update lock status based on power and reference availability
    this.updateLockStatus_(dtS);

    // Update signal quality parameters
    this.updateSignalQuality_();

    // If the module is unpowered, the RF output chain is inactive.
    // We still update derived state (lock, drift, thermal, etc.),
    // but no output signals should be emitted.
    if (!this.state.isPowered) {
      this.outputSignals = [];
      this.state.inputPower = BUCModuleCore.OUTPUT_POWER_FLOOR_DBM;
      this.state.compression = 0;
      this.updateOutputPowerFromSignals_();
      this.updateThermalState_(dtS);
      return;
    }

    // Calculate post-BUC signals: upconversion, gain and soft compression
    // (Rapp, s = 2: P1dB = saturationPower, Psat 2.16 dB above). The
    // bandpass filter rejects out-of-band signals entirely. Every carrier gets
    // the composite gain at the composite drive.
    const inBand = this.inputSignals.map((sig) => ({ sig, rfFreq: this.calculateRfFrequency(sig.frequency) })).filter(({ rfFreq }) => this.isInPassband_(rfFreq));
    const compositeInMw = inBand.reduce((sum, { sig }) => sum + 10 ** (sig.power / 10), 0);
    const compositeIn = compositeInMw > 0 ? 10 * Math.log10(compositeInMw) : Number.NEGATIVE_INFINITY;
    this.state.inputPower = (Number.isFinite(compositeIn) ? compositeIn : BUCModuleCore.OUTPUT_POWER_FLOOR_DBM) as dBm;

    let gain: number = this.state.isMuted ? MUTED_GAIN_DB : this.state.gain;
    this.state.compression = 0;
    if (!this.state.isMuted && Number.isFinite(compositeIn)) {
      const compressed = outputPowerDbm(this.model, compositeIn) - compositeIn;
      this.state.compression = this.state.gain - compressed;
      gain = compressed;
    }
    const phaseNoise = this.state.isExtRefLocked && this.isExtRefWarmedUp() ? LO_PHASE_NOISE_DBC_HZ.locked : LO_PHASE_NOISE_DBC_HZ.bucUnlocked;

    this.outputSignals = inBand.map(
      ({ sig, rfFreq }) =>
        ({
          ...sig,
          frequency: rfFreq,
          power: (sig.power + gain) as dBm,
          bandwidth: sig.bandwidth,
          phaseNoiseDbcHz: phaseNoise,
          origin: SignalOrigin.BUC,
        }) as RfSignal
    );

    this.updateOutputPowerFromSignals_();
    this.updateThermalState_(dtS);
  }

  /** Seconds of run time since the last update (0 on the first, or after a clock reset) */
  private advanceRunClock_(): number {
    const now = SimClock.runMs();
    const last = this.lastThermalRunMs_;
    this.lastThermalRunMs_ = now;

    return last !== null && now >= last ? (now - last) / 1000 : 0;
  }

  /** The output stage's AM/AM model: Rapp s = 2 with P1dB at `saturationPower` */
  get model(): AmplifierModel {
    const key = `${this.state.gain}|${this.state.saturationPower}`;
    if (key !== this.modelKey_ || !this.model_) {
      this.modelKey_ = key;
      this.model_ = amplifierFromDatasheet('rapp', this.state.gain, this.state.saturationPower);
    }

    return this.model_;
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

    // High output power warning (approaching saturation); only with real RF output
    if (this.outputSignals.length > 0 && this.state.outputPower > this.state.saturationPower - 2) {
      alarms.push(`BUC approaching saturation (${this.state.outputPower.toFixed(1)} dBm)`);
    }

    // High temperature alarm
    if (this.state.temperature > 70) {
      alarms.push(`BUC over-temperature (${this.state.temperature.toFixed(1)} °C)`);
    }

    // Cooling fault staged by a scenario (HardwareFaultManager buc-overtemp)
    if (this.thermalOffsetC_ > 0 || this.coolingFactor_ > 1) {
      alarms.push('BUC cooling fault - fan/heatsink degraded');
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
    const cableLoss = this.rfFrontEnd_.cableLossDb('txIf');
    const signals = this.rfFrontEnd_.transmitters.flatMap((tx) =>
      tx.state.modems.filter((modem) => modem.isTransmitting && !modem.isFaulted && !modem.isLoopback && !tx.isModemInIntermittentDropout(modem)).map((modem) => modem.ifSignal)
    );
    if (cableLoss === 0) {
      return signals;
    }

    return signals.map((sig) => ({ ...sig, power: (sig.power - cableLoss) as dBm }));
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
    const effectiveLO = this.state.isExtRefLocked && this.isExtRefWarmedUp() ? loFrequencyHz : loFrequencyHz + this.state.frequencyError;

    // Mixer produces both sidebands
    const upperSideband = effectiveLO + ifFrequency; // LO + IF
    const lowerSideband = effectiveLO - ifFrequency; // LO - IF

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
    return frequencyHz >= this.state.filterLowHz && frequencyHz <= this.state.filterHighHz;
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

    if (upperInBand) return 'low'; // Low-side injection → USB
    if (lowerInBand) return 'high'; // High-side injection → LSB
    return 'none'; // Neither in band
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
   * Report `state.outputPower` as the total power of the actual RF output
   * signals, so alarms, the Dashboard and the BUC panel all read the same
   * figure. No output (unpowered, nothing in band) or a muted output reads
   * the floor.
   */
  private updateOutputPowerFromSignals_(): void {
    const totalLinear = this.outputSignals.reduce((sum, sig) => sum + 10 ** (sig.power / 10), 0);
    const totalDbm = totalLinear > 0 ? 10 * Math.log10(totalLinear) : -Infinity;

    this.state.outputPower = Math.max(BUCModuleCore.OUTPUT_POWER_FLOOR_DBM, totalDbm) as dBm;
  }

  /** True when the BUC is putting real RF on its output (powered, unmuted, carriers in band). */
  hasRfOutput(): boolean {
    return this.state.isPowered && !this.state.isMuted && this.outputSignals.length > 0;
  }

  /**
   * Update lock status based on power and external reference, and the LO
   * error that follows from it (Phase 19.6 reference chain)
   */
  private updateLockStatus_(dtS: number): void {
    const extRefPresent = this.isExtRefPresent();
    const canLock = this.state.isPowered && extRefPresent;

    if (canLock) {
      // In real system, lock acquisition takes 2-5 seconds
      // Simulate lock acquisition if not already locked
      if (!this.state.isExtRefLocked) {
        this.simulateLockAcquisition();
      }
    } else {
      this.state.isExtRefLocked = false;
    }
    this.updateFrequencyDrift_(dtS);
  }

  /**
   * LO error. Locked to a warmed-up station reference, the synthesiser carries
   * the GPSDO's fractional error (parts in 10^12 locked, growing in holdover,
   * the spoofer's ramp when GNSS is spoofed). Otherwise it runs on its own
   * TCXO: a seeded random walk (±10 ppm start, 2 ppm/√h, ±30 ppm bound) on
   * run time, not a fresh draw each frame.
   */
  private updateFrequencyDrift_(dtS: number): void {
    const loFrequencyHz = this.state.loFrequency * 1e6;

    if (this.state.isExtRefLocked && this.isExtRefWarmedUp()) {
      this.drift_.stop();
      this.state.frequencyError = this.rfFrontEnd_.gpsdoModule.fractionalFrequencyError() * loFrequencyHz;
      return;
    }

    this.drift_.start();
    this.drift_.step(dtS);
    this.state.frequencyError = (this.drift_.ppm * loFrequencyHz) / 1e6;
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

    // Phase-noise plateau of the LO (dBc/Hz to the 10 kHz corner): the
    // synthesiser's on the station reference, its TCXO's when unlocked. The
    // same value rides on the output carriers (lo-reference.ts).
    this.state.phaseNoise = this.state.isExtRefLocked && this.isExtRefWarmedUp() ? LO_PHASE_NOISE_DBC_HZ.locked : LO_PHASE_NOISE_DBC_HZ.bucUnlocked;

    // Group delay variation (phase distortion across bandwidth)
    // Typical: 2-10 ns, increases with temperature
    const baseDelay = 3; // ns
    const tempVariation = (this.state.temperature - 25) * 0.1; // 0.1 ns/°C
    this.state.groupDelay = baseDelay + tempVariation;

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
    this.inputSignals.forEach((signal) => {
      const ifFreqHz = signal.frequency;

      spurious.push(
        // 2×LO - IF (2nd harmonic mixing)
        {
          frequency: (2 * loFreqHz - ifFreqHz) as Hertz,
          level: -35, // dBc
          loHarmonic: 2,
          ifHarmonic: -1,
        },
        // 2×LO + IF (2nd harmonic mixing)
        {
          frequency: (2 * loFreqHz + ifFreqHz) as Hertz,
          level: -40, // dBc
          loHarmonic: 2,
          ifHarmonic: 1,
        },
        // 3×LO - IF (3rd harmonic)
        {
          frequency: (3 * loFreqHz - ifFreqHz) as Hertz,
          level: -47, // dBc
          loHarmonic: 3,
          ifHarmonic: -1,
        }
      );
    });

    return spurious;
  }

  /**
   * Extra degC the BUC settles above its normal thermal target - a degraded fan
   * or heatsink staged by a scenario (HardwareFaultManager `buc-overtemp`).
   * Additive: the same offset whatever the drive. See setCoolingFactor for a
   * fault that scales with the heat the unit makes.
   */
  setThermalOffset(deltaC: number): void {
    this.thermalOffsetC_ = Math.max(0, deltaC);
  }

  get thermalOffsetC(): number {
    return this.thermalOffsetC_;
  }

  /** Set the case temperature now (a scenario staging a hot unit); it then follows its equilibrium */
  setTemperature(celsius: number): void {
    this.thermalPrimed_ = true;
    this.state.temperature = celsius;
  }

  /**
   * Degraded cooling as a thermal-resistance multiplier (a fan running slow,
   * a clogged heatsink): every watt dissipated now lifts the case by
   * factor × R_th, so less drive is the fix (HardwareFaultManager `buc-overtemp`
   * `coolingFactor`). 1 = healthy.
   */
  setCoolingFactor(factor: number): void {
    this.coolingFactor_ = Math.max(1, factor);
  }

  get coolingFactor(): number {
    return this.coolingFactor_;
  }

  /**
   * Extra supply current from a failing output stage (bias runaway), A. It is
   * drawn from the supply, so it heats the unit too; muting removes the
   * stage's bias, so a muted BUC idles (HardwareFaultManager `buc-overtemp`
   * `excessCurrentA`).
   */
  setExcessCurrent(amps: number): void {
    this.excessCurrentA_ = Math.max(0, amps);
  }

  get excessCurrentA(): number {
    return this.excessCurrentA_;
  }

  /** True while a staged cooling or current fault is in effect */
  get hasStagedThermalFault(): boolean {
    return this.thermalOffsetC_ > 0 || this.coolingFactor_ > 1 || this.excessCurrentA_ > 0;
  }

  /**
   * Supply current for the present operating point, A: idle (synthesiser,
   * mixers, IF stages, fan) plus the output stage, whose DC current follows
   * the output amplitude (class AB: √(Pout / Psat) of its saturated draw),
   * plus any staged excess. 0 when unpowered.
   */
  equilibriumCurrentA(): number {
    if (!this.state.isPowered) {
      return 0;
    }
    const idle = this.state.idleCurrentA ?? 2.6;
    const ampAtSat = this.state.amplifierCurrentAtSatA ?? 2.4;
    const psatMw = 10 ** (this.model.psatDbm / 10);
    const outMw = this.hasRfOutput() ? 10 ** (this.state.outputPower / 10) : 0;

    return idle + ampAtSat * Math.sqrt(Math.min(1, outMw / psatMw)) + (this.state.isMuted ? 0 : this.excessCurrentA_);
  }

  /**
   * Where the case temperature is heading, °C: ambient + R_th × cooling factor ×
   * (DC in − RF out) + any additive offset; ambient when unpowered.
   */
  equilibriumTemperatureC(): number {
    const ambient = this.state.ambientTemperatureC ?? 25;
    if (!this.state.isPowered) {
      return ambient;
    }
    const dcW = (this.state.supplyVoltageV ?? 24) * this.equilibriumCurrentA();
    const rfOutW = this.hasRfOutput() ? 10 ** ((this.state.outputPower - 30) / 10) : 0;
    const resistance = (this.state.thermalResistanceCPerW ?? 0.3) * this.coolingFactor_;

    return ambient + resistance * Math.max(0, dcW - rfOutW) + this.thermalOffsetC_;
  }

  /**
   * Thermal state: the case follows its equilibrium with a 10 min time
   * constant (heating and cooling alike), the supply current with a 2 s one,
   * both on SimClock run time. Everything is in watts (19.6 fixed a mW/W mix).
   */
  private updateThermalState_(dtS: number): void {
    if (!this.thermalPrimed_) {
      this.thermalPrimed_ = true;
      this.state.temperature = this.equilibriumTemperatureC();
      this.state.currentDraw = this.equilibriumCurrentA();
      return;
    }
    if (!(dtS > 0)) {
      return;
    }
    const temperatureTarget = this.equilibriumTemperatureC();
    this.state.temperature += (temperatureTarget - this.state.temperature) * (1 - Math.exp(-dtS / BUC_THERMAL_TAU_S));

    const currentTarget = this.equilibriumCurrentA();
    this.state.currentDraw += (currentTarget - this.state.currentDraw) * (1 - Math.exp(-dtS / BUC_CURRENT_TAU_S));
    if (!this.state.isPowered) {
      this.state.currentDraw = 0;
    }
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

    // Soft compression (Rapp): P1dB at saturationPower, Psat 2.16 dB above
    return outputPowerDbm(this.model, inputPowerDbm);
  }

  /**
   * Gain compression at the present drive, dB (0 in the linear region)
   */
  getCompressionDb(): number {
    if (!this.state.isPowered || this.state.isMuted || !Number.isFinite(this.state.inputPower ?? Number.NaN)) {
      return 0;
    }

    return Math.max(0, compressionDb(this.model, this.state.inputPower as number));
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
    const powerOutW = this.hasRfOutput() ? 10 ** ((this.state.outputPower - 30) / 10) : 0;
    const powerDissipation = this.state.currentDraw * (this.state.supplyVoltageV ?? 24) - powerOutW;

    return {
      temperature: this.state.temperature,
      currentDraw: this.state.currentDraw,
      powerDissipation, // W
    };
  }
}
