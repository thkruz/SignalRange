import { SignalOrigin } from "@app/signal-origin";
import { dB, dBm, IfSignal, MHz } from '@app/types';
import { RFFrontEndCore } from "../rf-front-end-core";
import { RFFrontEndModule, RFFrontEndModuleState } from '../rf-front-end-module';

/**
 * Single notch configuration
 */
export interface NotchConfig {
  /** Center frequency in MHz (950-2150 typical IF range) */
  centerFrequency: MHz;
  /** Notch bandwidth in MHz (0.1-50) */
  bandwidth: MHz;
  /** Attenuation depth in dB (1-60) */
  depth: dB;
  /** Whether this notch is active */
  enabled: boolean;
}

/**
 * Notch Filter module state
 */
export interface NotchFilterState extends RFFrontEndModuleState {
  isPowered: boolean;
  /** Fixed 3 notch slots */
  notches: [NotchConfig, NotchConfig, NotchConfig];
}

/**
 * Default notch configuration
 */
export const DEFAULT_NOTCH: NotchConfig = {
  centerFrequency: 1500 as MHz,
  bandwidth: 1 as MHz,
  depth: 20 as dB,
  enabled: false
};

/**
 * Notch Filter Module Core - Business Logic Layer
 * Applies selective frequency attenuation to IF signals
 *
 * Position in signal chain: LNB → IF Filter → Notch Filter → AGC
 */
export abstract class NotchFilterModuleCore extends RFFrontEndModule<NotchFilterState> {
  outputSignals: IfSignal[] = [];

  /**
   * Get default state for Notch Filter module
   */
  static getDefaultState(): NotchFilterState {
    return {
      isPowered: true,
      notches: [
        { ...DEFAULT_NOTCH, centerFrequency: 1200 as MHz },
        { ...DEFAULT_NOTCH, centerFrequency: 1500 as MHz },
        { ...DEFAULT_NOTCH, centerFrequency: 1800 as MHz }
      ]
    };
  }

  constructor(state: NotchFilterState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super(state, rfFrontEnd, 'rf-fe-notch-filter', unit);
  }

  /**
   * Get input signals from IF Filter module
   */
  get inputSignals(): IfSignal[] {
    return this.rfFrontEnd_.filterModule.outputSignals;
  }

  /**
   * Update: Apply notch filtering to signals
   */
  update(): void {
    if (!this.state.isPowered) {
      // Pass through unchanged when powered off
      this.outputSignals = this.inputSignals.map(sig => ({
        ...sig,
        origin: SignalOrigin.NOTCH_FILTER
      }));
      return;
    }

    this.outputSignals = this.inputSignals.map(sig => {
      let power = sig.power;

      // Check each enabled notch
      for (const notch of this.state.notches) {
        if (!notch.enabled) continue;

        const attenuation = this.calculateNotchAttenuation_(
          sig.frequency,
          sig.bandwidth,
          notch
        );

        power = (power - attenuation) as dBm;
      }

      return {
        ...sig,
        power,
        origin: SignalOrigin.NOTCH_FILTER
      };
    });
  }

  /**
   * Calculate attenuation for a signal passing through a notch
   * Uses overlap-based proportional attenuation
   *
   * @param signalFreqHz - Signal center frequency in Hz
   * @param signalBwHz - Signal bandwidth in Hz
   * @param notch - Notch configuration
   * @returns Attenuation in dB
   */
  private calculateNotchAttenuation_(
    signalFreqHz: number,
    signalBwHz: number,
    notch: NotchConfig
  ): number {
    const notchCenterHz = notch.centerFrequency * 1e6;
    const notchBwHz = notch.bandwidth * 1e6;

    const signalLow = signalFreqHz - signalBwHz / 2;
    const signalHigh = signalFreqHz + signalBwHz / 2;
    const notchLow = notchCenterHz - notchBwHz / 2;
    const notchHigh = notchCenterHz + notchBwHz / 2;

    // Calculate overlap
    const overlapLow = Math.max(signalLow, notchLow);
    const overlapHigh = Math.min(signalHigh, notchHigh);
    const overlapWidth = Math.max(0, overlapHigh - overlapLow);

    if (overlapWidth === 0) return 0;

    // Proportional attenuation based on overlap fraction
    const overlapFraction = overlapWidth / signalBwHz;
    return notch.depth * overlapFraction;
  }

  /**
   * Get alarms for this module
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    // Check for overlapping notches (potential unintended behavior)
    for (let i = 0; i < this.state.notches.length; i++) {
      for (let j = i + 1; j < this.state.notches.length; j++) {
        const n1 = this.state.notches[i];
        const n2 = this.state.notches[j];
        if (!n1.enabled || !n2.enabled) continue;

        const n1Low = n1.centerFrequency - n1.bandwidth / 2;
        const n1High = n1.centerFrequency + n1.bandwidth / 2;
        const n2Low = n2.centerFrequency - n2.bandwidth / 2;
        const n2High = n2.centerFrequency + n2.bandwidth / 2;

        if (n1High > n2Low && n1Low < n2High) {
          alarms.push(`Notch ${i + 1} and ${j + 1} overlap`);
        }
      }
    }

    return alarms;
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<NotchFilterState>): void {
    super.sync(state);
  }

  // ═══════════════════════════════════════════════════════════════
  // Public handlers for UI/Adapter layer
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle change to a specific notch configuration
   * @param index Notch index (0-2)
   * @param config Partial notch configuration to apply
   */
  public handleNotchChange(index: number, config: Partial<NotchConfig>): void {
    if (index < 0 || index > 2) return;
    this.state.notches[index] = { ...this.state.notches[index], ...config };
  }

  /**
   * Handle power toggle
   * @param isPowered Optional explicit power state, otherwise toggles
   */
  public handlePowerToggle(isPowered?: boolean): void {
    this.state.isPowered = isPowered ?? !this.state.isPowered;
  }

  /**
   * Get a specific notch configuration
   * @param index Notch index (0-2)
   */
  public getNotch(index: number): NotchConfig {
    return this.state.notches[index] ?? DEFAULT_NOTCH;
  }
}
