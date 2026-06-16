import { SignalOrigin } from "@app/signal-origin";
import { dB, dBm, IfSignal } from '@app/types';
import { RFFrontEndCore } from "@app/equipment/rf-front-end/rf-front-end-core";
import { RFFrontEndModule, RFFrontEndModuleState } from '@app/equipment/rf-front-end/rf-front-end-module';

/**
 * AGC module state
 */
export interface AGCState extends RFFrontEndModuleState {
  isPowered: boolean;      // Always true (tied to LNB power)
  isBypassed: boolean;     // Bypass mode - signals pass through unchanged
  targetLevel: dBm;        // Target output power
  currentGain: dB;         // Current gain applied (can be negative = attenuation)
  inputPower: dBm;         // Measured total input power
  outputPower: dBm;        // Actual output power
  attackTime: number;      // Attack time constant (ms) - how fast gain reduces
  releaseTime: number;     // Release time constant (ms) - how fast gain increases
  maxGain: dB;             // Maximum gain limit
  minGain: dB;             // Minimum gain limit
}

/**
 * AGC Module Core - Business Logic Layer
 * Automatic Gain Control - measures total power in IF passband and applies
 * uniform gain adjustment to keep output at target level.
 *
 * Key behavior:
 * - Indiscriminate: cannot distinguish wanted signals from interference
 * - When interference is present, reduces gain for ALL signals
 * - Dynamic response with attack/release time constants
 *
 * Position in signal chain: LNB → IF Filter → Notch Filter → AGC
 */
export abstract class AGCModuleCore extends RFFrontEndModule<AGCState> {
  outputSignals: IfSignal[] = [];

  /**
   * Get default state for AGC module
   */
  static getDefaultState(): AGCState {
    return {
      isPowered: true,            // Always on (tied to LNB)
      isBypassed: false,          // AGC active by default
      targetLevel: -30 as dBm,    // Typical IF level for modems
      currentGain: 0 as dB,       // Start with unity gain
      inputPower: -100 as dBm,    // Will be calculated
      outputPower: -100 as dBm,   // Will be calculated
      attackTime: 10,             // 10ms attack (fast response to overload)
      releaseTime: 100,           // 100ms release (slower recovery)
      maxGain: 30 as dB,          // +30 dB max amplification
      minGain: -30 as dB,         // -30 dB max attenuation
    };
  }

  constructor(state: AGCState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super(state, rfFrontEnd, 'rf-fe-agc', unit);
  }

  /**
   * Get input signals from Notch Filter module
   */
  get inputSignals(): IfSignal[] {
    return this.rfFrontEnd_.notchFilterModule.outputSignals;
  }

  /**
   * Update: Apply AGC to signals
   * 1. Measure total input power
   * 2. Calculate required gain to reach target
   * 3. Apply attack/release smoothing
   * 4. Apply gain uniformly to all signals
   */
  update(): void {
    const inputs = this.inputSignals;

    // Calculate total input power (sum of all signals in linear domain)
    const totalPowerLinear = inputs.reduce((sum, sig) => {
      return sum + Math.pow(10, sig.power / 10);
    }, 0);
    this.state.inputPower = (totalPowerLinear > 0
      ? 10 * Math.log10(totalPowerLinear)
      : -120) as dBm;

    // Handle bypass mode - pass signals through unchanged
    if (this.state.isBypassed) {
      this.state.currentGain = 0 as dB;
      this.state.outputPower = this.state.inputPower;
      this.outputSignals = inputs.map(sig => ({
        ...sig,
        origin: SignalOrigin.AGC
      }));
      return;
    }

    // Calculate required gain to reach target
    const targetGain = this.state.targetLevel - this.state.inputPower;

    // Apply attack/release smoothing (exponential)
    // Attack: gain is reducing (input power increased)
    // Release: gain is increasing (input power decreased)
    const isReducing = targetGain < this.state.currentGain;
    const timeConstant = isReducing ? this.state.attackTime : this.state.releaseTime;

    // Calculate alpha for exponential smoothing at ~60 FPS (16.67ms per frame)
    const alpha = 1 - Math.exp(-16.67 / timeConstant);

    this.state.currentGain = (this.state.currentGain +
      (targetGain - this.state.currentGain) * alpha) as dB;

    // Clamp to gain limits
    this.state.currentGain = Math.max(this.state.minGain,
      Math.min(this.state.maxGain, this.state.currentGain)) as dB;

    // Apply gain uniformly to all signals
    this.outputSignals = inputs.map(sig => ({
      ...sig,
      power: (sig.power + this.state.currentGain) as dBm,
      origin: SignalOrigin.AGC
    }));

    // Calculate actual output power
    const outputPowerLinear = this.outputSignals.reduce((sum, sig) => {
      return sum + Math.pow(10, sig.power / 10);
    }, 0);
    this.state.outputPower = (outputPowerLinear > 0
      ? 10 * Math.log10(outputPowerLinear)
      : -120) as dBm;
  }

  /**
   * Get alarms for this module
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    if (this.state.isBypassed) {
      // No alarms when bypassed
      return alarms;
    }

    // Warn when at gain limits
    if (this.state.currentGain >= this.state.maxGain - 0.5) {
      alarms.push(`AGC at max gain (${this.state.currentGain.toFixed(1)} dB) - weak signal`);
    }

    if (this.state.currentGain <= this.state.minGain + 0.5) {
      alarms.push(`AGC at min gain (${this.state.currentGain.toFixed(1)} dB) - possible interference`);
    }

    return alarms;
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<AGCState>): void {
    super.sync(state);
  }

  // ═══════════════════════════════════════════════════════════════
  // Public handlers for UI/Adapter layer
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle bypass toggle
   * @param isBypassed Optional explicit bypass state, otherwise toggles
   */
  public handleBypassToggle(isBypassed?: boolean): void {
    this.state.isBypassed = isBypassed ?? !this.state.isBypassed;
  }

  /**
   * Get current AGC status for display
   */
  public getStatus(): 'active' | 'bypassed' | 'at-max' | 'at-min' {
    if (this.state.isBypassed) return 'bypassed';
    if (this.state.currentGain >= this.state.maxGain - 0.5) return 'at-max';
    if (this.state.currentGain <= this.state.minGain + 0.5) return 'at-min';
    return 'active';
  }
}
