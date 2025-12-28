import { dBFS, dBm } from '@app/types';

/**
 * ADC Sweet Spot Configuration
 *
 * The ADC has an optimal operating range (sweet spot) where signal quality is maximized.
 * - Too high: Signals clip, causing hard limiting and intermodulation distortion
 * - Too low: Quantization noise dominates, reducing effective SNR
 *
 * Reference: AGC target level (-30 dBm) maps to -8 dBFS when ADC is at optimal point.
 * ADC full scale (0 dBFS) is 8 dB above the AGC target level.
 *
 * TODO: Make scenario-configurable in the future
 */
export interface ADCConfig {
  /** Target RMS input level for optimal performance */
  targetLevel_dBFS: dBFS;
  /** Level at which ADC begins clipping */
  clipThreshold_dBFS: dBFS;
  /** Level at which quantization noise becomes significant */
  quantizationThreshold_dBFS: dBFS;
  /** Reference dBm level that equals 0 dBFS (ADC full scale) */
  fullScale_dBm: dBm;
  /** Effective number of bits (determines quantization noise floor) */
  enob: number;
}

/**
 * Default ADC configuration based on realistic receiver parameters.
 *
 * Sweet spot: -8 dBFS with headroom to -2 dBFS (clip) and floor at -20 dBFS (quantization)
 * Reference: -30 dBm (AGC target) + 8 dB headroom = -22 dBm = 0 dBFS
 */
export const DEFAULT_ADC_CONFIG: ADCConfig = {
  targetLevel_dBFS: -8 as dBFS,
  clipThreshold_dBFS: -2 as dBFS,
  quantizationThreshold_dBFS: -20 as dBFS,
  fullScale_dBm: -22 as dBm,
  enob: 12,
};

/**
 * Convert power in dBm to dBFS using ADC reference.
 *
 * dBFS = dBm - fullScale_dBm
 *
 * Example: -30 dBm input with -22 dBm full scale = -8 dBFS
 *
 * @param power_dBm - Signal power in dBm
 * @param config - ADC configuration (optional, uses defaults)
 * @returns Signal level in dBFS
 */
export function dBmToDbfs(power_dBm: dBm, config: ADCConfig = DEFAULT_ADC_CONFIG): dBFS {
  return (power_dBm - config.fullScale_dBm) as dBFS;
}

/**
 * Convert level in dBFS to power in dBm using ADC reference.
 *
 * dBm = dBFS + fullScale_dBm
 *
 * @param level_dBFS - Signal level in dBFS
 * @param config - ADC configuration (optional, uses defaults)
 * @returns Signal power in dBm
 */
export function dBfsToDbm(level_dBFS: dBFS, config: ADCConfig = DEFAULT_ADC_CONFIG): dBm {
  return (level_dBFS + config.fullScale_dBm) as dBm;
}
