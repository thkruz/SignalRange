import { dB, dBFS, dBm } from '@app/types';
import { ADCConfig, DEFAULT_ADC_CONFIG, dBmToDbfs } from './adc-constants';
import { erfc } from './modcod';

/**
 * ADC status indicating where the signal level falls relative to the sweet spot.
 */
export type ADCStatus = 'optimal' | 'clipping' | 'low-level' | 'severe-clipping' | 'severe-low';

/**
 * Result of ADC degradation calculation.
 */
export interface ADCDegradationResult {
  /** Composite input level in dBFS relative to ADC full scale */
  inputLevel_dBFS: dBFS;
  /** Total Es/N0 penalty from ADC impairments in dB */
  totalPenalty_dB: dB;
  /** Penalty from clipping distortion */
  clipPenalty_dB: dB;
  /** Penalty from quantization noise */
  quantizationPenalty_dB: dB;
  /** Carrier to quantization noise in the carrier's symbol-rate bandwidth, dB */
  quantizationSnr_dB: dB;
  /** Signal to clipping distortion of the composite, dB */
  clipSdr_dB: dB;
  /** Descriptive status for UI display */
  status: ADCStatus;
}

/** The carrier the modem demodulates, for the in-band share of quantization noise. */
export interface ADCCarrier {
  /** Carrier power at the ADC (dBm, same reference as the composite) */
  power_dBm: number;
  /** Es/N0 of the carrier before the ADC, dB */
  esN0_dB: number;
  /** Symbol rate, Hz */
  symbolRate_Hz: number;
}

/** Penalty (dB) at which a status turns amber, and red */
const PENALTY_WARN_DB = 0.5;
const PENALTY_SEVERE_DB = 3;

/**
 * Signal-to-distortion ratio (linear) of a zero-mean Gaussian composite at
 * `level_dBFS` hard-clipped at full scale (Bussgang: y = a x + d with
 * a = erf(g / sqrt 2), g = clip level / RMS). 0 dBFS is a full-scale sine, so
 * g^2 = 2 / 10^(level / 10).
 */
export function clippingSdrLinear(level_dBFS: number): number {
  const g = Math.sqrt(2 * 10 ** (-level_dBFS / 10));
  const tail = erfc(g / Math.SQRT2); // P(|x| > A)
  const a = 1 - tail; // erf(g / sqrt 2)
  // E[y^2] / sigma^2 for a clipped Gaussian
  const outPower = a - g * Math.sqrt(2 / Math.PI) * Math.exp((-g * g) / 2) + g * g * tail;
  const distortion = outPower - a * a;
  if (distortion <= 1e-300) return Number.POSITIVE_INFINITY;
  return (a * a) / distortion;
}

/**
 * Carrier-to-quantization-noise ratio (linear) in the carrier's symbol-rate
 * bandwidth: quantization noise is 6.02 N + 1.76 dB below a full-scale sine,
 * white over fs/2.
 */
export function quantizationSnrLinear(carrierLevel_dBFS: number, symbolRate_Hz: number, config: ADCConfig = DEFAULT_ADC_CONFIG): number {
  const sqnrFullScaleDb = 6.02 * config.enob + 1.76;
  const inBandFraction = Math.min(1, symbolRate_Hz / (config.sampleRate_Hz / 2));
  return 10 ** ((carrierLevel_dBFS + sqnrFullScaleDb) / 10) / inBandFraction;
}

const toDb = (x: number): number => (Number.isFinite(x) ? 10 * Math.log10(x) : Number.POSITIVE_INFINITY);

/**
 * ADC impairments for a carrier inside a composite at the ADC input. The
 * quantization noise and the clipping distortion add to the carrier's own
 * noise: 1/SNR_eff = 1/SNR + 1/SNR_q + 1/SDR. Each penalty is the Es/N0 the
 * carrier loses to that term alone.
 *
 * Without `carrier`, the carrier is taken as the whole composite at 15 dB Es/N0
 * and 30 Msps (a typical C-band carrier), for level-only readouts.
 *
 * @param compositeLevel_dBm - RMS composite power at the ADC input (AGC output)
 */
export function calculateADCDegradation(compositeLevel_dBm: dBm, carrier?: ADCCarrier, config: ADCConfig = DEFAULT_ADC_CONFIG): ADCDegradationResult {
  const level_dBFS = dBmToDbfs(compositeLevel_dBm, config);
  const carrierPower = carrier?.power_dBm ?? compositeLevel_dBm;
  const esN0Db = carrier?.esN0_dB ?? 15;
  const symbolRate = carrier?.symbolRate_Hz ?? 30e6;

  const carrierLevel_dBFS = level_dBFS + (carrierPower - compositeLevel_dBm);
  const snrq = quantizationSnrLinear(carrierLevel_dBFS, symbolRate, config);
  const sdr = clippingSdrLinear(level_dBFS);
  const snr = 10 ** (esN0Db / 10);

  const withQ = 1 / (1 / snr + 1 / snrq);
  const withClip = 1 / (1 / snr + 1 / sdr);
  const withBoth = 1 / (1 / snr + 1 / snrq + 1 / sdr);

  const quantizationPenalty = Math.max(0, esN0Db - toDb(withQ)) as dB;
  const clipPenalty = Math.max(0, esN0Db - toDb(withClip)) as dB;
  const totalPenalty = Math.max(0, esN0Db - toDb(withBoth)) as dB;

  let status: ADCStatus = 'optimal';
  if (clipPenalty >= PENALTY_SEVERE_DB) {
    status = 'severe-clipping';
  } else if (clipPenalty >= PENALTY_WARN_DB || level_dBFS > config.clipThreshold_dBFS) {
    status = 'clipping';
  } else if (quantizationPenalty >= PENALTY_SEVERE_DB) {
    status = 'severe-low';
  } else if (quantizationPenalty >= PENALTY_WARN_DB) {
    status = 'low-level';
  }

  return {
    inputLevel_dBFS: level_dBFS,
    totalPenalty_dB: totalPenalty,
    clipPenalty_dB: clipPenalty,
    quantizationPenalty_dB: quantizationPenalty,
    quantizationSnr_dB: toDb(snrq) as dB,
    clipSdr_dB: toDb(sdr) as dB,
    status,
  };
}
