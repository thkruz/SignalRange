import { type AmplifierModel, amplifierFromDatasheet, carrierToIm3Db, inputForOutputDbm, outputPowerDbm, p1dbDbm } from '@app/equipment/rf-front-end/amplifier-models';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { RFFrontEndModule } from '@app/equipment/rf-front-end/rf-front-end-module';
import { SignalOrigin } from '@app/signal-origin';
import { SimClock } from '@app/simulation/sim-clock';
import type { dB, dBm, dBW, Hertz, RfFrequency, RfSignal } from '@app/types';

/**
 * High Power Amplifier module state
 */
export interface HPAState {
  /** Gain the amplifier is applying now: output − input, dB (composite) */
  gain: dB;
  noiseFloor: number;
  isPowered: boolean;
  /**
   * The operator's back-off setting, dB. With ALC on it is the output
   * back-off from P1dB the loop holds (output = P1dB − backOff, whatever the
   * drive). With ALC off it sets a fixed gain: the attenuator is calibrated so
   * the rated drive (`ratedInputDbm`) comes out at P1dB − backOff, and any
   * other drive moves the output dB for dB.
   */
  backOff: number;
  /** Composite output power, dBm (−90 when not transmitting) */
  outputPower: dBm;
  /** True when the actual output back-off from P1dB is under 3 dB while carrying RF */
  isOverdriven: boolean;
  /** Two-tone third-order intermodulation at the present drive, dBc (negative) */
  imdLevel: number;
  /** Case temperature, °C (first-order lag on run time) */
  temperature: number;
  /** is the High Powered Amplifier (HPA) enabled */
  isHpaEnabled: boolean;
  /** is the HPA switch enabled */
  isHpaSwitchEnabled: boolean;
  /**
   * Saturated output power (dBm). For an SSPA it fixes the knee with P1dB
   * (Rapp smoothness); a TWTA's Saleh curve puts Psat 4.12 dB over P1dB.
   * Absent -> P1dB + the model's own gap.
   */
  maxOutputPower?: dBm;
  /** Output power at 1 dB compression (dBm). Absent -> 59 dBm. */
  p1db?: dBm;
  /** Amplifier technology: 'twta' (Saleh AM/AM + AM/PM, default) or 'sspa' (Rapp) */
  amplifierType?: 'twta' | 'sspa';
  /** Small-signal gain with the attenuator at 0 dB, dB (default 60) */
  smallSignalGain?: dB;
  /** Attenuator (gain-control) range, dB (default 40) */
  attenuatorRangeDb?: number;
  /** Automatic level control holds the output at P1dB − backOff (default true) */
  isAlcEnabled?: boolean;
  /** Rated drive for the fixed-gain (ALC off) calibration, dBm (default 0) */
  ratedInputDbm?: dBm;
  /** Attenuation the ALC (or the last manual setting) applies, dB */
  attenuationDb?: number;
  /** Composite input power, dBm (−90 with no drive) */
  inputPower?: dBm;
  /** Actual output back-off from P1dB, dB (null with no RF) */
  outputBackoffDb?: number | null;
  /** True when the ALC cannot reach its setpoint (attenuator at an end stop) */
  isAlcAtLimit?: boolean;
  /** Case temperature rise over ambient at full saturated output, °C (default 45) */
  thermalRiseAtSatC?: number;
  /** Ambient (cooling air) temperature, °C (default 25) */
  ambientTemperatureC?: number;
}

/** Thermal time constant of the amplifier's heatsink, s */
const HPA_THERMAL_TAU_S = 120;
/** DC-to-RF efficiency at saturation */
const EFFICIENCY_AT_SAT = { twta: 0.5, sspa: 0.3 } as const;
/** Idle (heater, bias, fans) as a fraction of the DC input at saturation */
const IDLE_FRACTION = 0.05;
/** Reported output when nothing is transmitted, dBm */
const NO_OUTPUT_DBM = -90 as dBm;
/** IMD shown with no RF, dBc */
const NO_IMD_DBC = -80;
/** Most carriers combined into intermodulation products (pairs grow as n²) */
const MAX_IM_CARRIERS = 4;

/**
 * HPA Module Core - Business Logic Layer (Phase 19.6)
 *
 * A memoryless amplifier (Saleh for a TWTA, Rapp for an SSPA) behind an
 * input attenuator. The composite drive goes through the AM/AM curve; every
 * carrier gets the composite gain, so input + gain = output on every readout.
 * With ALC on the attenuator is servoed so the output sits at P1dB − backOff;
 * off, the back-off sets a fixed gain (calibrated on the rated drive) and the
 * output follows the drive dB for dB. Intermodulation comes from the model: the two-tone C/IM3 at the
 * present drive is the IMD readout; with several carriers the 2f₁ − f₂
 * products, with one the spectral-regrowth shoulders, are drawn on the TX
 * analyzer (`distortionSignals`). They are not radiated: the uplink's
 * intermodulation reaches the transponder in 19.3 (DEV-RF-01).
 */
export abstract class HPAModuleCore extends RFFrontEndModule<HPAState> {
  protected readonly minBackOffDb_ = 0;
  protected readonly maxBackOffDb_ = 30;

  // Signals
  rfSignalsIn: RfSignal[] = [];
  outputSignals: RfSignal[] = [];
  /** IM3 products / regrowth shoulders at the HPA output (TX analyzer only) */
  distortionSignals: RfSignal[] = [];

  private lastThermalRunMs_: number | null = null;
  /** False until the first update: a running station starts at its thermal equilibrium */
  private thermalPrimed_ = false;
  private lastTwoToneInputDbm_ = Number.NaN;
  private lastCarrierToIm3Db_ = Number.POSITIVE_INFINITY;

  /**
   * Get default state for HPA module
   */
  static getDefaultState(): HPAState {
    return {
      isPowered: true,
      backOff: 10, // dB
      outputPower: NO_OUTPUT_DBM,
      isOverdriven: false,
      imdLevel: NO_IMD_DBC,
      temperature: 25, // Celsius
      isHpaEnabled: false,
      isHpaSwitchEnabled: false,
      noiseFloor: -140, // dBm/Hz
      gain: 0 as dB,
      isAlcEnabled: true,
    };
  }

  constructor(state: HPAState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super(state, rfFrontEnd, 'rf-fe-hpa', unit);

    this.state = { ...HPAModuleCore.getDefaultState(), ...state };
  }

  // ═══ Model ═══

  /** The amplifier's AM/AM model from its datasheet numbers */
  get model(): AmplifierModel {
    const kind = this.state.amplifierType === 'sspa' ? 'rapp' : 'saleh';
    const key = `${kind}|${this.smallSignalGainDb}|${this.p1db}|${this.state.maxOutputPower}`;
    if (key !== this.modelKey_ || !this.model_) {
      this.modelKey_ = key;
      this.model_ = amplifierFromDatasheet(kind, this.smallSignalGainDb, this.p1db, this.state.maxOutputPower);
    }

    return this.model_;
  }

  private model_: AmplifierModel | null = null;
  private modelKey_ = '';

  /** Output power at 1 dB compression, dBm */
  get p1db(): dBm {
    return (this.state.p1db ?? 59) as dBm;
  }

  /** Saturated output power, dBm (from the model) */
  get psatDbm(): dBm {
    return this.model.psatDbm as dBm;
  }

  get smallSignalGainDb(): number {
    return this.state.smallSignalGain ?? 60;
  }

  get attenuatorRangeDb(): number {
    return this.state.attenuatorRangeDb ?? 40;
  }

  get isAlcEnabled(): boolean {
    return this.state.isAlcEnabled !== false;
  }

  /** Saturated output (kept for the power meter's scale) */
  protected get maxOutputPower_(): dBm {
    return this.psatDbm;
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Check for alarms (power sequencing) before processing
    this.checkAlarms_();

    // Process RF signals (gain, compression, IMD)
    this.processSignals_();

    this.updateTemperature_();
  }

  // ═══ Signal processing ═══

  get inputSignals(): RfSignal[] {
    if (this.rfFrontEnd_.bucModule.state.isLoopback) {
      return [];
    }
    const cableLoss = this.rfFrontEnd_.cableLossDb('bucToHpa');
    const bucOut = this.rfFrontEnd_.bucModule.outputSignals;
    if (cableLoss === 0) {
      return bucOut;
    }

    return bucOut.map((sig) => ({ ...sig, power: (sig.power - cableLoss) as dBm }));
  }

  /** Composite power of the carriers driving the HPA, dBm (−Infinity: none) */
  get compositeInputDbm(): number {
    const mw = this.inputSignals.reduce((sum, sig) => sum + 10 ** (sig.power / 10), 0);

    return mw > 0 ? 10 * Math.log10(mw) : Number.NEGATIVE_INFINITY;
  }

  /**
   * Attenuation that puts the composite output at P1dB − backOff for this
   * drive, before clamping to the attenuator's range.
   */
  private attenuationForSetpoint_(compositeInDbm: number): number {
    const target = this.p1db - this.state.backOff;
    const neededIn = inputForOutputDbm(this.model, target);
    if (neededIn === null) {
      return 0;
    }

    return compositeInDbm - neededIn;
  }

  /**
   * ALC off: the attenuator that makes the rated drive come out at
   * P1dB − backOff on the linear (small-signal) gain, clamped to its range
   */
  private fixedGainAttenuationDb_(): number {
    const rated = this.state.ratedInputDbm ?? 0;
    const wanted = rated + this.smallSignalGainDb - (this.p1db - this.state.backOff);

    return Math.max(0, Math.min(this.attenuatorRangeDb, wanted));
  }

  private processSignals_(): void {
    const inputs = this.inputSignals;
    const compositeIn = this.compositeInputDbm;
    this.state.inputPower = (Number.isFinite(compositeIn) ? compositeIn : NO_OUTPUT_DBM) as dBm;

    // Gain control: the ALC servo, or the latched manual attenuator
    const range = this.attenuatorRangeDb;
    if (Number.isFinite(compositeIn)) {
      if (this.isAlcEnabled) {
        const wanted = this.attenuationForSetpoint_(compositeIn);
        this.state.attenuationDb = Math.max(0, Math.min(range, wanted));
        this.state.isAlcAtLimit = wanted < -0.05 || wanted > range + 0.05;
      } else {
        this.state.attenuationDb = this.fixedGainAttenuationDb_();
        this.state.isAlcAtLimit = false;
      }
    } else if (!this.isAlcEnabled) {
      this.state.attenuationDb = this.fixedGainAttenuationDb_();
    }
    const attenuation = this.state.attenuationDb ?? 0;

    const transmitting = this.state.isPowered && this.state.isHpaEnabled && inputs.length > 0;
    if (!transmitting) {
      this.outputSignals = [];
      this.distortionSignals = [];
      this.state.outputPower = NO_OUTPUT_DBM;
      this.state.outputBackoffDb = null;
      this.state.isOverdriven = false;
      this.state.imdLevel = NO_IMD_DBC;
      // Gain readout: what the amplifier would apply to a small signal now
      this.state.gain = (this.state.isPowered ? this.smallSignalGainDb - attenuation : 0) as dB;
      return;
    }

    const model = this.model;
    const driveDbm = compositeIn - attenuation;
    const compositeOut = outputPowerDbm(model, driveDbm);
    const compositeGain = compositeOut - compositeIn;

    this.outputSignals = inputs.map((sig) => ({
      ...sig,
      power: (sig.power + compositeGain) as dBm,
      origin: SignalOrigin.HIGH_POWER_AMPLIFIER,
    }));

    this.state.outputPower = compositeOut as dBm;
    this.state.gain = compositeGain as dB;
    this.state.outputBackoffDb = this.p1db - compositeOut;
    this.state.isOverdriven = this.state.outputBackoffDb < 3;

    // Two-tone C/IM3 at this drive (recomputed only when the drive moves)
    if (!(Math.abs(driveDbm - this.lastTwoToneInputDbm_) < 0.005)) {
      this.lastTwoToneInputDbm_ = driveDbm;
      this.lastCarrierToIm3Db_ = carrierToIm3Db(model, driveDbm);
    }
    const cToIm3 = this.lastCarrierToIm3Db_;
    this.state.imdLevel = Number.isFinite(cToIm3) ? Math.max(NO_IMD_DBC, -cToIm3) : NO_IMD_DBC;

    this.distortionSignals = this.buildDistortionSignals_(this.outputSignals, compositeOut, cToIm3);
  }

  /**
   * Third-order products for the TX analyzer. Several carriers: 2fᵢ − fⱼ for
   * each pair, scaled from the equal two-tone result at the same composite
   * power (third order: 2 dB per dB of fᵢ, 1 dB per dB of fⱼ), width 2Bᵢ + Bⱼ.
   * One carrier: spectral regrowth shoulders at f ± B, each at the two-tone
   * C/IM3 below the carrier (a rule of thumb for noise-like carriers).
   */
  private buildDistortionSignals_(carriers: RfSignal[], compositeOutDbm: number, cToIm3Db: number): RfSignal[] {
    if (!Number.isFinite(cToIm3Db) || carriers.length === 0) {
      return [];
    }
    const make = (base: RfSignal, id: string, frequency: number, bandwidth: number, power: number): RfSignal => ({
      ...base,
      signalId: `${base.signalId}:${id}`,
      frequency: frequency as RfFrequency,
      bandwidth: bandwidth as Hertz,
      power: power as dBm,
      modulation: 'null',
      fec: 'null',
      feed: '',
      isDistortion: true,
      origin: SignalOrigin.HIGH_POWER_AMPLIFIER,
    });

    if (carriers.length === 1) {
      const c = carriers[0];
      const shoulder = c.power - cToIm3Db;

      return [make(c, 'regrowth-lo', c.frequency - c.bandwidth, c.bandwidth, shoulder), make(c, 'regrowth-hi', c.frequency + c.bandwidth, c.bandwidth, shoulder)];
    }

    const used = [...carriers].sort((a, b) => b.power - a.power).slice(0, MAX_IM_CARRIERS);
    const perToneEq = compositeOutDbm - 10 * Math.log10(2);
    const imEq = perToneEq - cToIm3Db;
    const products: RfSignal[] = [];
    for (const ci of used) {
      for (const cj of used) {
        if (ci === cj) continue;
        const power = imEq + 2 * (ci.power - perToneEq) + (cj.power - perToneEq);
        products.push(make(ci, `im3-${cj.signalId}`, 2 * ci.frequency - cj.frequency, 2 * ci.bandwidth + cj.bandwidth, power));
      }
    }

    return products;
  }

  // ═══ Thermal ═══

  /**
   * Case temperature: DC input = idle + (Psat / η_sat)·√(Pout / Psat) (the
   * DC current of a class-AB stage follows the output amplitude), dissipation
   * = DC − RF out, through a thermal resistance sized so full saturated output
   * runs `thermalRiseAtSatC` over ambient, with a first-order lag on run time.
   */
  private updateTemperature_(): void {
    const now = SimClock.runMs();
    const last = this.lastThermalRunMs_;
    this.lastThermalRunMs_ = now;
    const dtS = last !== null && now >= last ? (now - last) / 1000 : 0;

    const target = this.equilibriumTemperatureC();
    if (!this.thermalPrimed_) {
      this.thermalPrimed_ = true;
      this.state.temperature = target;
      return;
    }
    if (dtS > 0) {
      this.state.temperature += (target - this.state.temperature) * (1 - Math.exp(-dtS / HPA_THERMAL_TAU_S));
    }
  }

  /** Where the case temperature is heading for the present operating point, °C */
  equilibriumTemperatureC(): number {
    const ambient = this.state.ambientTemperatureC ?? 25;
    if (!this.state.isPowered) {
      return ambient;
    }
    const efficiency = EFFICIENCY_AT_SAT[this.state.amplifierType === 'sspa' ? 'sspa' : 'twta'];
    const psatW = 10 ** ((this.psatDbm - 30) / 10);
    const dcAtSatW = psatW / efficiency;
    const idleW = IDLE_FRACTION * dcAtSatW;
    const thermalResistance = (this.state.thermalRiseAtSatC ?? 45) / (idleW + dcAtSatW - psatW);
    const outW = this.outputSignals.length > 0 ? 10 ** ((this.state.outputPower - 30) / 10) : 0;
    const dcW = idleW + dcAtSatW * Math.sqrt(Math.min(1, outW / psatW));

    return ambient + thermalResistance * Math.max(0, dcW - outW);
  }

  /**
   * Check for alarm conditions
   */
  private checkAlarms_(): void {
    // Power sequencing check
    const bucPowered = this.rfFrontEnd_.state.buc.isPowered;

    if (this.state.isPowered && !bucPowered) {
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

    // ALC end stop: the setpoint cannot be held
    if (this.state.isPowered && this.state.isHpaEnabled && this.isAlcEnabled && this.state.isAlcAtLimit && this.outputSignals.length > 0) {
      const short = (this.state.outputBackoffDb ?? 0) > this.state.backOff;
      alarms.push(short ? 'HPA ALC at maximum gain - drive too low for the setpoint' : 'HPA ALC at minimum gain - drive too high');
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

  /**
   * Get total gain through HPA
   * @returns Gain in dB
   */
  getTotalGain(): number {
    if (!this.state.isPowered) {
      return -120; // Effectively off
    }

    return this.state.gain;
  }

  /**
   * Output power for a given composite input power, with the attenuator where
   * it is now (no ALC action).
   */
  getOutputPower(inputPowerDbm: number): number {
    if (!this.state.isPowered) {
      return -120; // Effectively off
    }

    return outputPowerDbm(this.model, inputPowerDbm - (this.state.attenuationDb ?? 0));
  }

  /** The model's P1dB, dBm (equals `p1db` up to rounding) */
  get modelP1dbDbm(): number {
    return p1dbDbm(this.model);
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
    this.state.backOff = Math.max(this.minBackOffDb_, Math.min(this.maxBackOffDb_, backOff));

    // Immediately recalculate derived values so UI updates instantly
    this.processSignals_();
  }

  /** ALC on: the loop holds P1dB − backOff. Off: the back-off sets a fixed gain from the rated drive. */
  handleAlcToggle(isEnabled: boolean): void {
    this.state.isAlcEnabled = isEnabled;
    this.processSignals_();
  }

  handleHpaToggle(): void {
    if (!this.state.isPowered) {
      return;
    }

    this.state.isHpaSwitchEnabled = !this.state.isHpaSwitchEnabled;

    if (this.state.isPowered) {
      this.state.isHpaEnabled = this.state.isHpaSwitchEnabled;
    }

    // Immediately recalculate derived values so UI updates instantly
    this.processSignals_();
  }

  renderPowerMeter_(powerDbW: dBW): string {
    // Convert dBW to percentage (1W = 0 dBW, 10W = 10 dBW for scale)
    const percentage = Math.max(0, Math.min(100, ((powerDbW / (this.maxOutputPower_ - 30)) as dBW) * 100));

    const segments = [];
    for (let i = 0; i < 5; i++) {
      const threshold = (i + 1) * 20; // 20%, 40%, 60%, 80%, 100%
      const isLit = percentage >= threshold;

      let colorClass = 'led-off';
      if (isLit) {
        if (i < 3)
          colorClass = 'led-green'; // 0-60%: green
        else if (i < 4)
          colorClass = 'led-yellow'; // 60-80%: yellow
        else colorClass = 'led-red'; // 80-100%: red
      }

      segments.push(`<div class="led-segment ${colorClass}"></div>`);
    }

    return segments.join('');
  }
}
