import { butterworthBandpassPower, carrierTransmission, transmissionLossDb } from '@app/equipment/rf-front-end/filter-response';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { RFFrontEndModule } from '@app/equipment/rf-front-end/rf-front-end-module';
import { SignalOrigin } from '@app/signal-origin';
import { dBm, Hertz, IfSignal, MHz } from '@app/types';

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
 * Available filter bandwidth settings (0-16)
 */
export const FILTER_BANDWIDTH_CONFIGS: FilterBandwidthConfig[] = [
  { bandwidth: 0.0001 as MHz, noiseFloor: -154, insertionLoss: 6.0, label: '100 Hz' },
  { bandwidth: 0.0005 as MHz, noiseFloor: -147, insertionLoss: 5.5, label: '500 Hz' },
  { bandwidth: 0.001 as MHz, noiseFloor: -144, insertionLoss: 5.0, label: '1 kHz' },
  { bandwidth: 0.01 as MHz, noiseFloor: -134, insertionLoss: 4.0, label: '10 kHz' },
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
  bandwidthIndex: number; // Index into FILTER_BANDWIDTH_CONFIGS (0-16)
  bandwidth: MHz; // MHz
  insertionLoss: number; // dB
  noiseFloor: number; // dBm
  /**
   * Passband centre, MHz (Phase 19.6). Absent: the filter is the channel
   * filter of whatever carrier is being examined (centred on each carrier),
   * the bank's legacy behaviour; set, carriers off-centre fall on its skirts.
   */
  centerFrequency?: MHz;
  /** Butterworth order of the passband response (default 6) */
  order?: number;
}

/** Default Butterworth order of the IF filter */
export const DEFAULT_IF_FILTER_ORDER = 6;

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
      bandwidthIndex: 12, // 20 MHz (index shifted due to narrow filter options)
      bandwidth: 20 as MHz, // MHz
      insertionLoss: 2.0, // dB
      noiseFloor: -101, // dBm
    };
  }

  constructor(state: IfFilterBankState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super(state, rfFrontEnd, 'rf-fe-filter', unit);

    // Calculate the correct insertion loss and noise floor based on bandwidth index
    this.updateFilterCharacteristics_();
  }

  /**
   * Update component state and check for faults
   *
   * Phase 19.6: each carrier pays the insertion loss plus the overlap
   * integral of the Butterworth passband with its raised-cosine spectrum (a
   * 36 MHz carrier in the 40 MHz filter loses a tenth of a dB on the skirts; a
   * carrier off a configured centre loses what falls outside). The carrier's
   * `bandwidth` is clipped to the part inside the -3 dB passband, which is
   * what the demodulator checks against its FEC's tolerance.
   */
  update(): void {
    const filterBandwidthHz = this.state.bandwidth * 1e6;
    const order = this.state.order ?? DEFAULT_IF_FILTER_ORDER;
    const fixedCentreHz = this.state.centerFrequency !== undefined ? this.state.centerFrequency * 1e6 : null;

    this.outputSignals = this.inputSignals.map((sig: IfSignal) => {
      const centreHz = fixedCentreHz ?? sig.frequency;
      const transmission = carrierTransmission(sig.frequency, sig.bandwidth, (f) => butterworthBandpassPower(f, centreHz, filterBandwidthHz, order));
      const skirtLossDb = Math.min(200, transmissionLossDb(transmission));

      // The part of the carrier inside the -3 dB passband
      const low = Math.max(sig.frequency - sig.bandwidth / 2, centreHz - filterBandwidthHz / 2);
      const high = Math.min(sig.frequency + sig.bandwidth / 2, centreHz + filterBandwidthHz / 2);
      const clippedBandwidth = Math.max(0, Math.min(sig.bandwidth, high - low)) as Hertz;

      return {
        ...sig,
        bandwidth: clippedBandwidth,
        power: (sig.power - this.state.insertionLoss - skirtLossDb) as dBm,
        origin: SignalOrigin.IF_FILTER_BANK,
      };
    });
  }

  get inputSignals(): IfSignal[] {
    // Get signals from LNB (IF Filter is first in the IF chain)
    // Signal path: LNB → IF Filter → Notch Filter → AGC
    const lnbSignals = this.rfFrontEnd_.lnbModule.ifSignals;
    const txLoopbackSignals = this.rfFrontEnd_.transmitters.flatMap((tx) =>
      tx.state.modems.filter((modem) => modem.isTransmitting && !modem.isFaulted && modem.isLoopback && !tx.isModemInIntermittentDropout(modem)).map((modem) => modem.ifSignal)
    );

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

  // Public handlers for UI layer
  public handleBandwidthChange(bandwidthIndex: number): void {
    this.state.bandwidthIndex = Math.round(bandwidthIndex);
    this.updateFilterCharacteristics_();
  }

  public getFilterConfig(): FilterBandwidthConfig {
    return FILTER_BANDWIDTH_CONFIGS[this.state.bandwidthIndex];
  }
}
