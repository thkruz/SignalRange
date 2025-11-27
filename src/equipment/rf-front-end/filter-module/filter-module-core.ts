import { SignalOrigin } from "@app/SignalOrigin";
import { dBm, IfSignal, MHz, RfFrequency } from '@app/types';
import { RFFrontEndCore } from "../rf-front-end-core";
import { RFFrontEndModule } from '../rf-front-end-module';

/**
 * Filter bandwidth configuration
 */
export interface FilterBandwidthConfig {
  bandwidth: MHz; // MHz (0 = Off)
  noiseFloor: number; // dBm
  insertionLoss: number; // dB
  label: string;
}

/**
 * Available filter bandwidth settings (0-12, where 0 = Off)
 */
export const FILTER_BANDWIDTH_CONFIGS: FilterBandwidthConfig[] = [
  { bandwidth: 0.03 as MHz, noiseFloor: -129, insertionLoss: 3.5, label: '30 kHz' },
  { bandwidth: 0.1 as MHz, noiseFloor: -124, insertionLoss: 3.2, label: '100 kHz' },
  { bandwidth: 0.2 as MHz, noiseFloor: -121, insertionLoss: 3.0, label: '200 kHz' },
  { bandwidth: 0.5 as MHz, noiseFloor: -117, insertionLoss: 2.9, label: '500 kHz' },
  { bandwidth: 1 as MHz, noiseFloor: -114, insertionLoss: 2.8, label: '1 MHz' },
  { bandwidth: 2 as MHz, noiseFloor: -111, insertionLoss: 2.6, label: '2 MHz' },
  { bandwidth: 5 as MHz, noiseFloor: -107, insertionLoss: 2.4, label: '5 MHz' },
  { bandwidth: 10 as MHz, noiseFloor: -104, insertionLoss: 2.2, label: '10 MHz' },
  { bandwidth: 20 as MHz, noiseFloor: -101, insertionLoss: 2.0, label: '20 MHz' },
  { bandwidth: 40 as MHz, noiseFloor: -98, insertionLoss: 1.8, label: '40 MHz' },
  { bandwidth: 80 as MHz, noiseFloor: -95, insertionLoss: 1.6, label: '80 MHz' },
  { bandwidth: 160 as MHz, noiseFloor: -92, insertionLoss: 1.5, label: '160 MHz' },
  { bandwidth: 320 as MHz, noiseFloor: -89, insertionLoss: 1.5, label: '320 MHz' },
];

/**
 * Preselector/Filter module state
 */
export interface IfFilterBankState {
  isPowered: boolean;
  bandwidthIndex: number; // Index into FILTER_BANDWIDTH_CONFIGS (0-13)
  bandwidth: MHz; // MHz
  insertionLoss: number; // dB
  centerFrequency: RfFrequency; // Hz
  noiseFloor: number; // dBm
}

/**
 * IF Filter Bank Module Core - Business Logic Layer
 * Contains filter physics, signal processing, bandwidth management
 * No UI dependencies
 */
export abstract class IfFilterBankModuleCore extends RFFrontEndModule<IfFilterBankState> {
  // Signals
  outputSignals: IfSignal[] = [];

  /**
   * Get default state for IF Filter Bank module
   */
  static getDefaultState(): IfFilterBankState {
    return {
      isPowered: true,
      bandwidthIndex: 9, // 20 MHz
      bandwidth: 20 as MHz, // MHz
      insertionLoss: 2.0, // dB
      centerFrequency: 5800 * 1e6 as RfFrequency, // 5.8 GHz
      noiseFloor: -101, // dBm
    };
  }

  constructor(state: IfFilterBankState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super(state, rfFrontEnd, 'rf-fe-filter', unit);
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    this.outputSignals = this.inputSignals.map((sig: IfSignal) => {
      if (sig.bandwidth > this.state.bandwidth * 1e6) {
        // Apply additional attenuation for out-of-band signals
        // Ps,out​=Ps​+10log10​(Bs​Bf​​)
        const bandwidthRatio = sig.bandwidth / ((this.state.bandwidth * 1e6) / 2);
        const attenuationDb = 10 * Math.log10(bandwidthRatio);
        sig.power = sig.power - attenuationDb as dBm;
      }

      return {
        ...sig,
        power: (sig.power - this.state.insertionLoss) as dBm,
        origin: SignalOrigin.IF_FILTER_BANK,
      };
    });
  }

  get inputSignals(): IfSignal[] {
    const lnbSignals = this.rfFrontEnd_.lnbModule.ifSignals;
    const txLoopbackSignals = this.rfFrontEnd_.transmitters
      .flatMap((tx) => tx.state.modems
        .filter((modem) => modem.isTransmitting && !modem.isFaulted && modem.isLoopback)
        .map((modem) => modem.ifSignal));

    return [...lnbSignals, ...txLoopbackSignals];
  }

  /**
   * Update filter characteristics based on selected bandwidth index
   */
  protected updateFilterCharacteristics_(): void {
    const config = FILTER_BANDWIDTH_CONFIGS[this.state.bandwidthIndex];
    this.state.bandwidth = config.bandwidth;
    this.state.insertionLoss = config.insertionLoss;
    this.state.noiseFloor = config.noiseFloor;
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<IfFilterBankState>): void {
    super.sync(state);
    this.updateFilterCharacteristics_();
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    // Check for excessive insertion loss
    if (this.state.insertionLoss > 3.0) {
      alarms.push(`Filter insertion loss high (${this.state.insertionLoss.toFixed(1)} dB)`);
    }

    return alarms;
  }

  // Protected handlers for UI layer
  protected handleBandwidthChange(bandwidthIndex: number): void {
    this.state.bandwidthIndex = Math.round(bandwidthIndex);
    this.updateFilterCharacteristics_();
  }

  protected getFilterConfig(): FilterBandwidthConfig {
    return FILTER_BANDWIDTH_CONFIGS[this.state.bandwidthIndex];
  }
}
