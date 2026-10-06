import { carrierTransmission, notchPower, transmissionLossDb } from '@app/equipment/rf-front-end/filter-response';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { RFFrontEndModule, RFFrontEndModuleState } from '@app/equipment/rf-front-end/rf-front-end-module';
import { SignalOrigin } from '@app/signal-origin';
import { dB, dBm, IfSignal, MHz } from '@app/types';

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

/** Butterworth order of each notch's stop band (steep, as a tunable notch is) */
export const NOTCH_ORDER = 4;

/**
 * Default notch configuration
 */
export const DEFAULT_NOTCH: NotchConfig = {
  centerFrequency: 1500 as MHz,
  bandwidth: 1 as MHz,
  depth: 20 as dB,
  enabled: false,
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
        { ...DEFAULT_NOTCH, centerFrequency: 1800 as MHz },
      ],
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
      this.outputSignals = this.inputSignals.map((sig) => ({
        ...sig,
        origin: SignalOrigin.NOTCH_FILTER,
      }));
      return;
    }

    const active = this.state.notches.filter((notch) => notch.enabled);
    this.outputSignals = this.inputSignals.map((sig) => {
      if (active.length === 0) {
        return { ...sig, origin: SignalOrigin.NOTCH_FILTER };
      }
      const lossDb = NotchFilterModuleCore.carrierLossDb(sig.frequency, sig.bandwidth, active);

      return {
        ...sig,
        power: (sig.power - lossDb) as dBm,
        notchLossDb: (sig.notchLossDb ?? 0) + lossDb,
        origin: SignalOrigin.NOTCH_FILTER,
      };
    });
  }

  /** Power response of a set of notches at f (product of each notch's) */
  static responseAt(f: number, notches: NotchConfig[]): number {
    let h = 1;
    for (const notch of notches) {
      h *= notchPower(f, notch.centerFrequency * 1e6, notch.bandwidth * 1e6, notch.depth, NOTCH_ORDER);
    }

    return h;
  }

  /**
   * Power a set of notches takes off a carrier, dB (Phase 19.6): the overlap
   * integral of the stop bands with the carrier's spectrum. An 8 MHz, 30 dB
   * notch inside a 36 MHz carrier costs the energy in that slice (about
   * 1 dB); one centred on a 1 MHz interferer takes the full depth off it.
   * (It used to be depth × overlap fraction: about 7 dB for the same notch.)
   */
  static carrierLossDb(frequencyHz: number, bandwidthHz: number, notches: NotchConfig[]): number {
    if (notches.length === 0) {
      return 0;
    }

    return Math.min(200, transmissionLossDb(carrierTransmission(frequencyHz, bandwidthHz, (f) => NotchFilterModuleCore.responseAt(f, notches))));
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
