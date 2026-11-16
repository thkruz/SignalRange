import { dBFS, dBm } from '@app/types';

/**
 * ADC configuration for the demodulator front end (phase 19.5).
 *
 * The ADC samples the AGC output: the composite of every carrier and the
 * receive noise in the IF filter. Two real impairments come from where that
 * composite sits against full scale:
 * - too high: peaks clip, adding distortion (Bussgang: the clipped part is
 *   uncorrelated noise),
 * - too low: the fixed quantization noise (6.02 N + 1.76 dB below a
 *   full-scale sine, spread over the Nyquist band) eats into the carrier.
 *
 * Reference: the AGC target (-30 dBm) maps to -8 dBFS, so full scale
 * (0 dBFS, a full-scale sine) is -22 dBm.
 */
export interface ADCConfig {
  /** Target RMS composite level for optimal performance */
  targetLevel_dBFS: dBFS;
  /** Composite level above which the clip indicator lights (peaks reach full scale) */
  clipThreshold_dBFS: dBFS;
  /** Composite level below which the level reads low (an advisory; the penalty is computed) */
  quantizationThreshold_dBFS: dBFS;
  /** Reference dBm level that equals 0 dBFS (ADC full scale) */
  fullScale_dBm: dBm;
  /** Effective number of bits (sets the quantization noise floor) */
  enob: number;
  /** Sample rate, Hz: quantization noise spreads over fs/2 */
  sampleRate_Hz: number;
}

/**
 * Default ADC: an 8-bit-ENOB converter at 200 Msps, the class of ADC in an
 * L-band satellite demodulator. With the AGC holding -8 dBFS the impairments
 * are negligible; they appear when the drive is ~30 dB low or within a few
 * dB of full scale (DEV-MODEM-07: class values, not a datasheet).
 */
export const DEFAULT_ADC_CONFIG: ADCConfig = {
  targetLevel_dBFS: -8 as dBFS,
  clipThreshold_dBFS: -2 as dBFS,
  quantizationThreshold_dBFS: -20 as dBFS,
  fullScale_dBm: -22 as dBm,
  enob: 8,
  sampleRate_Hz: 200e6,
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
