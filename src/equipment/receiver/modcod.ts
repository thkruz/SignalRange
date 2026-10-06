/**
 * @file MODCOD thresholds and coded error curves (phase 19.5).
 *
 * One table decides when a modem can lock and how many frames it loses: the
 * DVB-S2 quasi-error-free (QEF) Es/N0 for each modulation and code rate,
 * ETSI EN 302 307-1 V1.2.1 (2009-08) Table 13 (AWGN, normal 64 800-bit
 * FECFRAME, PER 1e-7), plus the 1.0 dB implementation loss the phase 19 plan
 * adopts (Q4). The noise bandwidth is the symbol rate (a matched filter), so
 * Es/N0 = C / (k T Rs) and the carrier's occupied bandwidth is Rs (1 + roll-off).
 *
 * The engine's legacy labels map onto a DVB-S2 MODCOD: QPSK -> QPSK, 8QAM ->
 * 8PSK, 16QAM -> 16APSK, BPSK -> QPSK of the same code rate 3.01 dB lower in
 * Es/N0 (BPSK carries one bit per symbol at the same Eb/N0). Code rates the
 * table lacks (7/8 everywhere, 1/2 for 8PSK and 16APSK) are interpolated or
 * extrapolated linearly in code rate from the two nearest table entries.
 *
 * The coded packet-error curve is one representative LDPC + BCH waterfall
 * shape (PER falls from 1e-1 to 1e-7 over about 0.6 dB, as the 64 800-bit
 * curves do) anchored at each MODCOD's practical threshold; it is not a
 * per-MODCOD simulation (DEV-MODEM-06 in docs/known-deviations.md).
 */

import { FECType, ModulationType } from '@app/types';

/** DVB-S2 roll-off the engine's carriers use (the analyzer draws them with alpha 0.2 too) */
export const DVB_S2_ROLL_OFF = 0.2;

/** Implementation loss added to the ideal Table 13 threshold (plan Q4) */
export const IMPLEMENTATION_LOSS_DB = 1.0;

/** Lock acquires at threshold + this and drops at threshold - this */
export const LOCK_HYSTERESIS_DB = 0.5;

/** A locked carrier with less margin than this over its threshold reads "degraded" */
export const DEGRADED_MARGIN_DB = 1.0;

/** Margin a degraded carrier must regain before it reads "good" again */
export const DEGRADED_RECOVERY_MARGIN_DB = 1.5;

/** Bits in one DVB-S2 normal FECFRAME */
export const FECFRAME_BITS = 64_800;

export type Dvbs2Family = 'QPSK' | '8PSK' | '16APSK' | '32APSK';

/**
 * EN 302 307-1 V1.2.1 Table 13: ideal Es/N0 (dB) for QEF operation, AWGN,
 * normal FECFRAME, no pilots.
 */
export const DVB_S2_TABLE_13: Readonly<Record<Dvbs2Family, Readonly<Record<string, number>>>> = {
  QPSK: {
    '1/4': -2.35,
    '1/3': -1.24,
    '2/5': -0.3,
    '1/2': 1.0,
    '3/5': 2.23,
    '2/3': 3.1,
    '3/4': 4.03,
    '4/5': 4.68,
    '5/6': 5.18,
    '8/9': 6.2,
    '9/10': 6.42,
  },
  '8PSK': {
    '3/5': 5.5,
    '2/3': 6.62,
    '3/4': 7.91,
    '5/6': 9.35,
    '8/9': 10.69,
    '9/10': 10.98,
  },
  '16APSK': {
    '2/3': 8.97,
    '3/4': 10.21,
    '4/5': 11.03,
    '5/6': 11.61,
    '8/9': 12.89,
    '9/10': 13.13,
  },
  '32APSK': {
    '3/4': 12.73,
    '4/5': 13.64,
    '5/6': 14.28,
    '8/9': 15.69,
    '9/10': 16.05,
  },
};

/** How a MODCOD's threshold was obtained */
export type ModcodSource = 'table' | 'interpolated' | 'extrapolated';

export interface Modcod {
  /** Display name, e.g. "QPSK 3/4" (the engine's labels) */
  readonly name: string;
  /** The DVB-S2 family the threshold comes from */
  readonly family: Dvbs2Family;
  readonly modulation: ModulationType;
  readonly fec: FECType;
  readonly codeRate: number;
  readonly bitsPerSymbol: number;
  /** Ideal QEF Es/N0, dB (Table 13, or derived from it) */
  readonly idealEsN0Db: number;
  /** Practical lock threshold: ideal + implementation loss, dB */
  readonly thresholdEsN0Db: number;
  readonly source: ModcodSource;
}

const BITS_PER_SYMBOL: Partial<Record<ModulationType, number>> = { BPSK: 1, QPSK: 2, '8QAM': 3, '16QAM': 4 };
const FAMILY_OF: Partial<Record<ModulationType, Dvbs2Family>> = { BPSK: 'QPSK', QPSK: 'QPSK', '8QAM': '8PSK', '16QAM': '16APSK' };

function parseRate(rate: string): number {
  const [num, den] = rate.split('/').map(Number);
  return num / den;
}

/** Ideal Es/N0 for a code rate in a family: the table entry, or linear in code rate between/beyond the nearest two. */
function idealEsN0For(family: Dvbs2Family, codeRate: number, fecLabel: string): { esN0: number; source: ModcodSource } {
  const table = DVB_S2_TABLE_13[family];
  if (table[fecLabel] !== undefined) {
    return { esN0: table[fecLabel], source: 'table' };
  }
  const points = Object.entries(table)
    .map(([r, v]) => ({ r: parseRate(r), v }))
    .sort((a, b) => a.r - b.r);
  let lo = points[0];
  let hi = points[1];
  let source: ModcodSource = 'extrapolated';
  if (codeRate > points[points.length - 1].r) {
    lo = points[points.length - 2];
    hi = points[points.length - 1];
  } else if (codeRate >= points[0].r) {
    for (let i = 0; i < points.length - 1; i++) {
      if (codeRate >= points[i].r && codeRate <= points[i + 1].r) {
        lo = points[i];
        hi = points[i + 1];
        source = 'interpolated';
        break;
      }
    }
  }
  const esN0 = lo.v + ((codeRate - lo.r) / (hi.r - lo.r)) * (hi.v - lo.v);
  return { esN0, source };
}

const cache_ = new Map<string, Modcod | null>();

/**
 * The MODCOD for a modem's (or carrier's) modulation and FEC labels, or null
 * for a label pair no demodulator locks to (CW, 'null', unknown).
 */
export function modcodFor(modulation: ModulationType | string, fec: FECType | string): Modcod | null {
  const key = `${modulation}|${fec}`;
  const hit = cache_.get(key);
  if (hit !== undefined) return hit;

  const family = FAMILY_OF[modulation as ModulationType];
  const bits = BITS_PER_SYMBOL[modulation as ModulationType];
  let result: Modcod | null = null;
  if (family && bits && /^\d+\/\d+$/u.test(String(fec))) {
    const codeRate = parseRate(String(fec));
    const { esN0, source } = idealEsN0For(family, codeRate, String(fec));
    // BPSK: one bit per symbol at the QPSK code's Eb/N0, so 3.01 dB less Es/N0
    const idealEsN0Db = modulation === 'BPSK' ? esN0 - 10 * Math.log10(2) : esN0;
    result = {
      name: `${modulation} ${fec}`,
      family,
      modulation: modulation as ModulationType,
      fec: fec as FECType,
      codeRate,
      bitsPerSymbol: bits,
      idealEsN0Db,
      thresholdEsN0Db: idealEsN0Db + IMPLEMENTATION_LOSS_DB,
      source,
    };
  }
  cache_.set(key, result);
  return result;
}

/** Symbol rate (Hz) of a carrier occupying `occupiedBandwidthHz` with the DVB-S2 roll-off. */
export function symbolRateHz(occupiedBandwidthHz: number, rollOff = DVB_S2_ROLL_OFF): number {
  return occupiedBandwidthHz / (1 + rollOff);
}

/** Es/N0 (dB) from C/N (dB) measured in `noiseBandwidthHz`, for a carrier at `symbolRate`. */
export function esN0FromCnDb(cnDb: number, noiseBandwidthHz: number, symbolRate: number): number {
  return cnDb + 10 * Math.log10(noiseBandwidthHz / symbolRate);
}

/** Required C/N (dB) in `noiseBandwidthHz` for a MODCOD's lock threshold. Content quotes this figure. */
export function requiredCnDb(modcod: Modcod, noiseBandwidthHz: number, symbolRate: number): number {
  return modcod.thresholdEsN0Db - 10 * Math.log10(noiseBandwidthHz / symbolRate);
}

/**
 * Complementary error function, Numerical Recipes `erfcc` (Chebyshev fit,
 * fractional error below 1.2e-7 everywhere), so tail probabilities stay
 * accurate down to the 1e-12 the curves use.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

/** Gaussian tail Q(x) */
export function qFunction(x: number): number {
  return 0.5 * erfc(x / Math.SQRT2);
}

/**
 * Uncoded (pre-FEC) bit-error rate at a given Es/N0 (dB), Gray coding, AWGN:
 * BPSK Q(sqrt(2 Es/N0)); QPSK Q(sqrt(Es/N0)) per bit; 8PSK (2/3) Q(sqrt(2 Es/N0) sin(pi/8));
 * 16-ary as square 16QAM, (3/4) Q(sqrt(Es / 5 N0)). Clamped to [1e-15, 0.5].
 */
export function uncodedBer(esN0Db: number, modulation: ModulationType | string): number {
  const esN0 = 10 ** (esN0Db / 10);
  let ber: number;
  switch (modulation) {
    case 'BPSK':
      ber = qFunction(Math.sqrt(2 * esN0));
      break;
    case '8QAM':
      ber = (2 / 3) * qFunction(Math.sqrt(2 * esN0) * Math.sin(Math.PI / 8));
      break;
    case '16QAM':
      ber = (3 / 4) * qFunction(Math.sqrt(esN0 / 5));
      break;
    default:
      ber = qFunction(Math.sqrt(esN0));
      break;
  }
  return Math.max(1e-15, Math.min(0.5, ber));
}

/**
 * The coded waterfall: log10(PER) against Es/N0 relative to the practical
 * threshold (dB). PER 1e-7 (QEF) at the threshold, 1e-1 about 0.6 dB below it,
 * every frame lost 1.2 dB below it; above the threshold the curve keeps
 * falling so a strong carrier decodes with no residual errors at all.
 */
export const CODED_PER_CURVE: ReadonlyArray<{ marginDb: number; log10Per: number }> = [
  { marginDb: -1.2, log10Per: 0 },
  { marginDb: -0.9, log10Per: -0.3 },
  { marginDb: -0.6, log10Per: -1 },
  { marginDb: -0.4, log10Per: -2 },
  { marginDb: -0.2, log10Per: -4 },
  { marginDb: 0, log10Per: -7 },
  { marginDb: 0.5, log10Per: -12 },
  { marginDb: 1.5, log10Per: -20 },
  { marginDb: 3, log10Per: -30 },
];

/** Packet (FECFRAME) error rate at `esN0Db` for a MODCOD, by interpolating the waterfall in log10(PER). */
export function codedPer(esN0Db: number, modcod: Modcod): number {
  const margin = esN0Db - modcod.thresholdEsN0Db;
  const curve = CODED_PER_CURVE;
  if (!Number.isFinite(margin) || margin <= curve[0].marginDb) return 1;
  const last = curve[curve.length - 1];
  if (margin >= last.marginDb) return 10 ** last.log10Per;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (margin <= b.marginDb) {
      const f = (margin - a.marginDb) / (b.marginDb - a.marginDb);
      return 10 ** (a.log10Per + f * (b.log10Per - a.log10Per));
    }
  }
  return 10 ** last.log10Per;
}

/**
 * Post-decoder bit-error rate: a frame the decoder fails comes out with about
 * the channel's raw errors, a decoded frame with none, so BER = PER x pre-FEC BER.
 */
export function decodedBer(esN0Db: number, modcod: Modcod): number {
  return codedPer(esN0Db, modcod) * uncodedBer(esN0Db, modcod.modulation);
}

/** Information bit rate (bit/s) of a carrier: Rs x bits/symbol x code rate. */
export function informationRateBps(symbolRate: number, modcod: Modcod): number {
  return symbolRate * modcod.bitsPerSymbol * modcod.codeRate;
}

/** FECFRAMEs per second at a symbol rate (coded bits / 64 800). */
export function framesPerSecond(symbolRate: number, modcod: Modcod): number {
  return (symbolRate * modcod.bitsPerSymbol) / FECFRAME_BITS;
}

/** Shortest and longest demodulator acquisition, s */
const ACQUISITION_MIN_S = 0.5;
const ACQUISITION_MAX_S = 10;

/**
 * Time a demodulator needs to acquire a carrier, s: carrier and timing
 * recovery scale with symbols, so 0.5 s + 2e6 symbols' worth, clamped to
 * 0.5-10 s, spread +/-20 % by `uniform` (a seeded draw in [0, 1)).
 * 30 Msps: ~0.6 s; 1 Msps: ~2.5 s; 100 ksps and slower: 10 s.
 */
export function acquisitionTimeS(symbolRate: number, uniform: number): number {
  const base = symbolRate > 0 ? ACQUISITION_MIN_S + 2e6 / symbolRate : ACQUISITION_MAX_S;
  return Math.min(ACQUISITION_MAX_S, Math.max(ACQUISITION_MIN_S, base)) * (0.8 + 0.4 * uniform);
}
