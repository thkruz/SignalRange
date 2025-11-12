import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { PerlinNoise } from "@app/simulation/perlin-noise";
import { dBi, dBm, Hertz, RfFrequency, RfSignal, SignalOrigin } from "@app/types";
import { Degrees } from "ootk";

/**
 * Represents a transponder configuration on a satellite.
 */
export interface Transponder {
  /** Transponder ID */
  id: string;
  /** Center frequency of the transponder uplink band (Hz) */
  uplinkFrequency: RfFrequency;
  /** Center frequency of the transponder downlink band (Hz) */
  downlinkFrequency: RfFrequency;
  /** Transponder bandwidth (Hz) */
  bandwidth: Hertz;
  /** Maximum output power */
  maxPower: dBm;
  /** Transponder gain */
  gain: dBi;
  /** Noise figure */
  noiseFigure: dBi;
  /** Non-linear saturation power */
  saturationPower: dBm;
  /** Whether the transponder is active */
  isActive: boolean;
}

/**
 * Configuration for signal degradation effects.
 */
export interface SignalDegradationConfig {
  /** Enable atmospheric effects (rain fade, scintillation) */
  atmosphericEffects: boolean;
  /** Enable random signal dropout simulation */
  randomDropout: boolean;
  /** Dropout probability (0-1) */
  dropoutProbability: number;
  /** Enable power variation simulation */
  powerVariation: boolean;
  /** Power variation range in dB */
  powerVariationRange: dBm;
  /** Enable interference simulation */
  interference: boolean;
  /** Interference power level */
  interferencePower: dBm;
}

export interface SatelliteState {
  az: Degrees;
  el: Degrees;
  frequencyOffset: Hertz;
  degradationConfig?: Partial<SignalDegradationConfig>;
}

/**
 * This represents a Satellite on orbit with comprehensive RF signal processing.
 * Handles signal reception, transponder operations, and transmission with realistic
 * effects for SATCOM and Electronic Warfare simulation.
 */
export class Satellite {
  /** NORAD catalog number */
  noradId: number;

  /** External signals being sent to the satellite */
  externalSignal: RfSignal[];
  /** Received signals at the satellite */
  rxSignal: RfSignal[];

  /** Transmitted signals from the satellite */
  txSignal: RfSignal[];

  /** Transponder configurations */
  transponders: Transponder[];

  /** Signal degradation configuration */
  degradationConfig: SignalDegradationConfig;

  /** Perlin noise instances for smooth signal variations (keyed by signal ID) */
  private readonly noiseGenerators: Map<string, PerlinNoise>;

  /** Current satellite health status (0-1, where 1 is healthy) */
  health: number;

  /** Uplink to downlink frequency offset (Hz) */
  private readonly frequencyOffset: number;

  private readonly randomCache_: Map<string, number> = new Map();
  el: Degrees;
  az: Degrees;

  constructor(
    norad: number,
    rxSignal: RfSignal[],
    satelliteState: SatelliteState = Satellite.getDefaultState_(),
  ) {
    this.noradId = norad;
    this.externalSignal = rxSignal;
    this.rxSignal = [];
    this.frequencyOffset = satelliteState.frequencyOffset;
    this.noiseGenerators = new Map();
    this.health = 1.0;
    this.az = satelliteState.az;
    this.el = satelliteState.el;

    // Default degradation configuration
    this.degradationConfig = {
      atmosphericEffects: true,
      randomDropout: true,
      dropoutProbability: 0.0001,
      powerVariation: true,
      powerVariationRange: 2.0 as dBm,
      interference: false,
      interferencePower: -110 as dBm,
      ...satelliteState.degradationConfig
    };

    // Initialize transponders based on received signals
    this.transponders = this.initializeTransponders(rxSignal);

    // Process received signals through transponders to generate transmitted signals
    this.txSignal = this.processSignals();

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
  }

  private static getDefaultState_(): SatelliteState {
    return {
      az: 0 as Degrees,
      el: 0 as Degrees,
      frequencyOffset: 2.225e9 as Hertz,
      degradationConfig: {}
    };
  }

  /**
   * Initialize transponders based on received signals.
   */
  private initializeTransponders(signals: RfSignal[]): Transponder[] {
    return signals.map((signal, index) => ({
      id: `tp-${this.noradId}-${index}`,
      uplinkFrequency: signal.frequency,
      downlinkFrequency: this.getDownlinkFromUplink(signal.frequency),
      bandwidth: signal.bandwidth,
      maxPower: signal.power, // Use the initial signal power as max power
      gain: 36.5 as dBi, // dB, typical transponder gain
      noiseFigure: 3.5 as dBi, // dB, typical satellite transponder noise figure
      saturationPower: 37 as dBm, // 5 W typical saturation power
      isActive: true
    }));
  }

  /**
   * Update satellite state and process signals.
   */
  update(): void {
    this.randomCache_.clear();
    this.createRandomValues_();

    // Process signals through transponders
    this.txSignal = this.processSignals();

    // Update satellite health based on conditions
    this.updateHealth();
  }

  private createRandomValues_(): void {
    // We need to create random values for each transponder to use in degradation effects
    for (const tp of this.transponders) {
      // Power Variation
      this.randomCache_.set(`${tp.id}-powerVariation`, Math.random());
      // Rain Variation
      this.randomCache_.set(`${tp.id}-rain`, Math.random());
      // Scintillation
      this.randomCache_.set(`${tp.id}-scintillation`, Math.random());
    }
  }

  /**
   * Process received signals through transponders to generate transmitted signals.
   * Applies realistic RF effects including gain, noise, saturation, and degradation.
   */
  private processSignals(): RfSignal[] {
    const processedSignals: RfSignal[] = [];
    const allRxSignals = [...this.rxSignal, ...this.externalSignal];

    for (const signal of allRxSignals) {
      const transponder = this.findTransponderByUplinkFrequency(signal.frequency);

      if (!transponder?.isActive) {
        continue;
      }

      // Apply transponder gain to received signal
      let txPower: dBm = signal.power;

      // Apply saturation effects (non-linear power limiting)
      txPower = this.applySaturation(txPower, transponder.saturationPower, transponder.maxPower);

      // Add thermal noise based on noise figure
      txPower = this.addThermalNoise(txPower, transponder.noiseFigure, signal.bandwidth);

      // Add transponder gain
      txPower = (txPower + transponder.gain) as dBm;

      // Frequency translation (uplink to downlink)
      const txFrequency = transponder.downlinkFrequency;

      // Create transmitted signal
      let txSignal: RfSignal = {
        ...signal,
        frequency: txFrequency,
        power: txPower,
        origin: SignalOrigin.SATELLITE_TX,
        // Reverse polarization for downlink
        polarization: signal.polarization === 'H' ? 'V' : 'H',
      };

      // Apply degradation effects
      txSignal = this.applyDegradationEffects(txSignal);

      processedSignals.push(txSignal);
    }

    return processedSignals;
  }

  private findTransponderByUplinkFrequency(frequency: RfFrequency): Transponder | undefined {
    return this.transponders.find(tp => tp.uplinkFrequency === frequency);
  }

  /**
   * Apply saturation effects to limit output power based on transponder characteristics.
   */
  private applySaturation(inputPower: dBm, saturationPower: dBm, maxPower: dBm): dBm {
    if (inputPower <= saturationPower) {
      return inputPower;
    }

    // Soft saturation curve (AM/PM conversion effects)
    const excessPower = inputPower - saturationPower as dBm;
    const compressionFactor = 1 / (1 + excessPower / 10);

    return Math.min(saturationPower + excessPower * compressionFactor, maxPower) as dBm;
  }

  /**
   * Add thermal noise to the signal based on noise figure and bandwidth.
   */
  private addThermalNoise(signalPower: dBm, noiseFigure: dBi, bandwidth: Hertz): dBm {
    // Thermal noise power: N = k * T * B * NF
    // k = Boltzmann constant = 1.38e-23 J/K
    // T = Temperature (assume 290K)
    // B = Bandwidth (Hz)
    // NF = Noise Figure (dB)

    const k = 1.38e-23;
    const T = 290; // Kelvin
    const noisePowerWatts = k * T * bandwidth * Math.pow(10, noiseFigure / 10);
    const noisePowerDbm = 10 * Math.log10(noisePowerWatts * 1000);

    // Combine signal and noise power (in linear scale)
    const signalLinear = Math.pow(10, signalPower / 10);
    const noiseLinear = Math.pow(10, noisePowerDbm / 10);
    const totalLinear = signalLinear + noiseLinear;

    return 10 * Math.log10(totalLinear) as dBm;
  }

  /**
   * Apply various degradation effects to the transmitted signal.
   */
  private applyDegradationEffects(signal: RfSignal): RfSignal {
    let degradedSignal = { ...signal };

    // Apply power variation (simulates attitude control variations, antenna pointing)
    if (this.degradationConfig.powerVariation) {
      degradedSignal = this.applyPowerVariation(degradedSignal);
    }

    // Apply atmospheric effects (rain fade, scintillation)
    if (this.degradationConfig.atmosphericEffects) {
      degradedSignal = this.applyAtmosphericEffects(degradedSignal);
    }

    // Apply interference
    if (this.degradationConfig.interference) {
      degradedSignal = this.applyInterference(degradedSignal);
    }

    // Apply satellite health degradation
    degradedSignal = this.applyHealthDegradation(degradedSignal);

    return degradedSignal;
  }

  /**
   * Apply smooth power variations using Perlin noise.
   */
  private applyPowerVariation(signal: RfSignal): RfSignal {
    // Get or create noise generator for this signal
    if (!this.noiseGenerators.has(signal.signalId)) {
      this.noiseGenerators.set(signal.signalId, PerlinNoise.getInstance(signal.signalId));
    }

    const noiseGen = this.noiseGenerators.get(signal.signalId);
    if (!noiseGen) return signal;

    const randomPowerFactor = this.randomCache_.get(`${signal.signalId}-powerVariation`) ?? 1;
    const time = Date.now() / 1000 + randomPowerFactor * 1000;

    // Perlin noise returns 0-1, convert to -1 to 1
    const noiseValue = noiseGen.get(time) * 2 - 1;

    // Apply variation
    const variation = noiseValue * this.degradationConfig.powerVariationRange;

    return {
      ...signal,
      power: signal.power + variation as dBm
    };
  }

  /**
   * Apply atmospheric effects like rain fade and scintillation.
   */
  private applyAtmosphericEffects(signal: RfSignal): RfSignal {
    // Rain fade is frequency dependent (worse at higher frequencies)
    const frequencyGHz = signal.frequency / 1e9;
    const randomRainFactor = this.randomCache_.get(`${signal.signalId}-rain`) ?? 1;

    // Simple rain fade model (in dB)
    const rainFadeDb = (frequencyGHz / 10) * randomRainFactor * 2; // Simplified model

    // Scintillation (rapid amplitude fluctuations)
    const randomScintillationFactor = this.randomCache_.get(`${signal.signalId}-scintillation`) ?? 1;
    const scintillationDb = (Math.random() - 0.5) * 1.5 * randomScintillationFactor;

    return {
      ...signal,
      power: signal.power - rainFadeDb + scintillationDb as dBm,
    };
  }

  /**
   * Apply interference to the signal.
   */
  private applyInterference(signal: RfSignal): RfSignal {
    // Calculate C/I (Carrier-to-Interference ratio)
    const carrierPowerLinear = Math.pow(10, signal.power / 10);
    const interferencePowerLinear = Math.pow(10, this.degradationConfig.interferencePower / 10);
    const totalPowerLinear = carrierPowerLinear + interferencePowerLinear;

    const degradedPowerDbm = 10 * Math.log10(totalPowerLinear);

    return {
      ...signal,
      power: degradedPowerDbm as dBm,
      isDegraded: true
    };
  }

  /**
   * Apply degradation based on satellite health.
   */
  private applyHealthDegradation(signal: RfSignal): RfSignal {
    // Reduce power based on health status
    const healthLossDeb = (1 - this.health) * 10; // Up to 10 dB loss when unhealthy

    return {
      ...signal,
      power: signal.power - healthLossDeb as dBm,
      isDegraded: this.health < 0.9 || signal.isDegraded
    };
  }

  /**
   * Update satellite health based on environmental conditions.
   */
  private updateHealth(): void {
    // Gradual health degradation simulation
    // In a real scenario, this could be based on radiation damage, component failures, etc.
    if (Math.random() < 0.0001) {
      this.health = Math.max(0.5, this.health - 0.01);
    }

    // Gradual recovery
    if (this.health < 1.0 && Math.random() < 0.001) {
      this.health = Math.min(1.0, this.health + 0.01);
    }
  }

  /**
   * Check if a signal should be dropped (simulates complete signal loss).
   */
  shouldDropSignal(): boolean {
    if (!this.degradationConfig.randomDropout) {
      return false;
    }

    return Math.random() < this.degradationConfig.dropoutProbability;
  }

  /**
   * Get transmitted signals with dropout simulation applied.
   */
  getTransmittedSignals(): RfSignal[] {
    return this.txSignal.filter(() => !this.shouldDropSignal());
  }

  /**
   * Calculate frequency offset for uplink to downlink conversion.
   */
  getUplinkFromDownlink(frequency: RfFrequency): RfFrequency {
    return (frequency + this.frequencyOffset) as RfFrequency;
  }

  private getDownlinkFromUplink(frequency: RfFrequency): RfFrequency {
    return (frequency - this.frequencyOffset) as RfFrequency;
  }

  /**
   * Set transponder active state.
   */
  setTransponderActive(transponderId: string, active: boolean): void {
    const transponder = this.transponders.find(tp => tp.id === transponderId);
    if (transponder) {
      transponder.isActive = active;
    }
  }

  /**
   * Configure signal degradation parameters.
   */
  configureDegradation(config: Partial<SignalDegradationConfig>): void {
    this.degradationConfig = {
      ...this.degradationConfig,
      ...config
    };
  }

  /**
   * Get carrier-to-noise ratio for a specific signal.
   */
  getCarrierToNoiseRatio(signalId: string): number | null {
    const signal = this.txSignal.find(s => s.signalId === signalId);
    if (!signal) return null;

    const transponderIndex = this.rxSignal.findIndex(s => s.signalId === signalId);
    if (transponderIndex < 0) return null;

    const transponder = this.transponders[transponderIndex];

    // Calculate noise power
    const k = 1.38e-23;
    const T = 290;
    const noisePowerWatts = k * T * signal.bandwidth * Math.pow(10, transponder.noiseFigure / 10);
    const noisePowerDbm = 10 * Math.log10(noisePowerWatts * 1000);

    return signal.power - noisePowerDbm;
  }
}