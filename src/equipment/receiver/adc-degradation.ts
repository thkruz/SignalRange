import { dB, dBFS, dBm } from '@app/types';
import { ADCConfig, DEFAULT_ADC_CONFIG, dBmToDbfs } from './adc-constants';

/**
 * ADC status indicating where the signal level falls relative to the sweet spot.
 */
export type ADCStatus = 'optimal' | 'clipping' | 'low-level' | 'severe-clipping' | 'severe-low';

/**
 * Result of ADC degradation calculation.
 */
export interface ADCDegradationResult {
  /** Input level in dBFS relative to ADC full scale */
  inputLevel_dBFS: dBFS;
  /** Total SNR penalty from ADC impairments in dB */
  totalPenalty_dB: dB;
  /** Penalty from clipping/compression (0 when below clip threshold) */
  clipPenalty_dB: dB;
  /** Penalty from quantization noise (0 when above quantization threshold) */
  quantizationPenalty_dB: dB;
  /** Descriptive status for UI display */
  status: ADCStatus;
}

/**
 * Calculate ADC-induced signal degradation based on input level.
 *
 * Physics:
 * - Clipping: Above -2 dBFS, signal peaks are hard-limited, causing EVM degradation
 *   that increases roughly as 2^(level-threshold) for severe overdrive
 * - Quantization: Below -20 dBFS, quantization noise becomes significant
 *   Each bit of lost dynamic range costs 6.02 dB of SNR
 *
 * The "sweet spot" is where both penalties are zero - optimal ADC operation.
 *
 * @param signalLevel_dBm - Peak signal power at ADC input
 * @param config - ADC configuration (optional, uses defaults)
 * @returns Degradation result with penalties and status
 */
export function calculateADCDegradation(
  signalLevel_dBm: dBm,
  config: ADCConfig = DEFAULT_ADC_CONFIG
): ADCDegradationResult {
  const level_dBFS = dBmToDbfs(signalLevel_dBm, config);

  let clipPenalty = 0 as dB;
  let quantizationPenalty = 0 as dB;
  let status: ADCStatus = 'optimal';

  // Clipping region: above clipThreshold_dBFS (-2 dBFS default)
  if (level_dBFS > config.clipThreshold_dBFS) {
    const overdrive = level_dBFS - config.clipThreshold_dBFS;

    // Exponential degradation above clip threshold
    // Mild overdrive (0-3 dB): 1-4 dB penalty
    // Severe overdrive (>6 dB): 10+ dB penalty
    clipPenalty = ((Math.pow(2, overdrive / 3) - 1) * 3) as dB;

    status = overdrive > 6 ? 'severe-clipping' : 'clipping';
  }

  // Quantization region: below quantizationThreshold_dBFS (-20 dBFS default)
  if (level_dBFS < config.quantizationThreshold_dBFS) {
    const underdrive = config.quantizationThreshold_dBFS - level_dBFS;

    // Each 6 dB below threshold roughly loses one effective bit
    // SNR penalty = 6.02 * bits_lost
    const bitsLost = underdrive / 6.02;
    quantizationPenalty = (bitsLost * 6.02) as dB;

    // Cap at practical limit (ENOB * 6.02 dB)
    const maxQuantPenalty = config.enob * 6.02;
    quantizationPenalty = Math.min(quantizationPenalty, maxQuantPenalty) as dB;

    // Only set status if not already in clipping (clipping takes precedence)
    if (status === 'optimal') {
      status = underdrive > 12 ? 'severe-low' : 'low-level';
    }
  }

  const totalPenalty = (clipPenalty + quantizationPenalty) as dB;

  return {
    inputLevel_dBFS: level_dBFS,
    totalPenalty_dB: totalPenalty,
    clipPenalty_dB: clipPenalty,
    quantizationPenalty_dB: quantizationPenalty,
    status,
  };
}
