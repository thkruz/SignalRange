/**
 * Memoryless power-amplifier models (Phase 19.6).
 *
 * Two classic AM/AM (and AM/PM) characteristics, both parameterised by the
 * small-signal gain and the saturated output power:
 *
 * - **Rapp** (SSPA; C. Rapp, "Effects of HPA-nonlinearity on a 4-DPSK/OFDM
 *   signal", 1991): Pout = G·Pin / (1 + (G·Pin/Psat)^s)^(1/s), no AM/PM. The
 *   smoothness s sets how far P1dB sits below Psat (s = 2: 2.16 dB).
 * - **Saleh** (TWTA; A. A. M. Saleh, "Frequency-independent and
 *   frequency-dependent nonlinear models of TWT amplifiers", IEEE Trans.
 *   Commun. 29(11), 1981): A(r) = α r / (1 + β r²), Φ(r) = αφ r² / (1 + βφ r²)
 *   with the normalised αφ = π/3, βφ = 1. P1dB sits 4.12 dB below Psat and the
 *   output falls again past saturation (overdrive).
 *
 * Powers are in dBm (instantaneous envelope power = amplitude², mW). The
 * two-tone intermodulation ratio is computed numerically from the model (the
 * Fourier coefficients of the output envelope for two equal tones), so it is
 * exact for the model at any drive, and reduces to the textbook third-order
 * result in the small-signal limit (see test/reference/rf-modules.reference.test.ts).
 */

export type AmplifierModelKind = 'rapp' | 'saleh';

export interface AmplifierModel {
  readonly kind: AmplifierModelKind;
  /** Small-signal power gain, dB */
  readonly gainDb: number;
  /** Saturated output power, dBm */
  readonly psatDbm: number;
  /** Rapp smoothness (ignored for Saleh) */
  readonly smoothness: number;
}

/** Saleh AM/PM coefficients (normalised, radians) */
const SALEH_ALPHA_PHI = Math.PI / 3;
const SALEH_BETA_PHI = 1;

/** P1dB below Psat for the Saleh model, dB (closed form: 1 + r² = 10^0.05, see p1dbBelowPsatDb) */
export const SALEH_P1DB_BELOW_PSAT_DB = 4.12;

const dbmToMw = (dbm: number): number => 10 ** (dbm / 10);
const mwToDbm = (mw: number): number => (mw > 0 ? 10 * Math.log10(mw) : Number.NEGATIVE_INFINITY);

/**
 * Output envelope amplitude (sqrt mW) and phase (rad) for an input envelope
 * amplitude r (sqrt mW).
 */
export function envelopeResponse(model: AmplifierModel, r: number): { amplitude: number; phase: number } {
  if (!(r > 0)) {
    return { amplitude: 0, phase: 0 };
  }
  const g = Math.sqrt(dbmToMw(model.gainDb)); // amplitude gain
  const vsat = Math.sqrt(dbmToMw(model.psatDbm));

  if (model.kind === 'rapp') {
    const s = model.smoothness;
    const linear = g * r;
    return { amplitude: linear / (1 + (linear / vsat) ** (2 * s)) ** (1 / (2 * s)), phase: 0 };
  }

  // Saleh: max of α r / (1 + β r²) is α / (2 √β) at r = 1/√β; set it to vsat
  const alpha = g;
  const beta = (alpha / (2 * vsat)) ** 2;
  const r2 = r * r;
  // Normalise the AM/PM to the saturating input, so the phase curve keeps
  // Saleh's shape relative to saturation whatever the absolute scale
  const rn2 = r2 * beta;

  return {
    amplitude: (alpha * r) / (1 + beta * r2),
    phase: (SALEH_ALPHA_PHI * rn2) / (1 + SALEH_BETA_PHI * rn2),
  };
}

/** Single-carrier (CW) output power, dBm, for an input power, dBm. */
export function outputPowerDbm(model: AmplifierModel, inputDbm: number): number {
  if (!Number.isFinite(inputDbm)) {
    return Number.NEGATIVE_INFINITY;
  }
  const { amplitude } = envelopeResponse(model, Math.sqrt(dbmToMw(inputDbm)));

  return mwToDbm(amplitude * amplitude);
}

/** Compression (small-signal gain minus actual gain) at an input power, dB. */
export function compressionDb(model: AmplifierModel, inputDbm: number): number {
  return model.gainDb - (outputPowerDbm(model, inputDbm) - inputDbm);
}

/** How far P1dB sits below Psat for a model shape, dB. */
export function p1dbBelowPsatDb(kind: AmplifierModelKind, smoothness = 2): number {
  if (kind === 'saleh') {
    // α r/(1 + β r²) = α r 10^(-1/20) → β r² = 10^0.05 - 1; out/sat = 4 β r² / (1 + β r²)²
    const x = 10 ** 0.05 - 1;
    return -10 * Math.log10((4 * x) / (1 + x) ** 2);
  }
  // Rapp: u^s = 10^(0.1 s) - 1 at 1 dB compression; Pout/Psat = u / 10^0.1
  const u = (10 ** (0.1 * smoothness) - 1) ** (1 / smoothness);

  return 1 - 10 * Math.log10(u);
}

/** The Rapp smoothness that puts P1dB `gapDb` below Psat (bisection; gap 0.6-15 dB). */
export function rappSmoothnessForGap(gapDb: number): number {
  let lo = 0.2;
  let hi = 30;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    // A larger smoothness gives a sharper knee: P1dB closer to Psat
    if (p1dbBelowPsatDb('rapp', mid) > gapDb) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

/** Build a model from P1dB (and optionally Psat), the way a datasheet states it. */
export function amplifierFromDatasheet(kind: AmplifierModelKind, gainDb: number, p1dbDbm: number, psatDbm?: number): AmplifierModel {
  if (kind === 'saleh') {
    return { kind, gainDb, psatDbm: p1dbDbm + SALEH_P1DB_BELOW_PSAT_DB, smoothness: 1 };
  }
  const gap = psatDbm === undefined ? p1dbBelowPsatDb('rapp', 2) : Math.max(0.7, psatDbm - p1dbDbm);
  const smoothness = psatDbm === undefined ? 2 : rappSmoothnessForGap(gap);

  return { kind, gainDb, psatDbm: p1dbDbm + gap, smoothness };
}

/** The model's own P1dB, dBm (output). */
export function p1dbDbm(model: AmplifierModel): number {
  return model.psatDbm - p1dbBelowPsatDb(model.kind, model.smoothness);
}

/**
 * Input power (dBm) that gives `targetOutputDbm` on the rising part of the
 * curve, or null if the target is above what the model can deliver.
 */
export function inputForOutputDbm(model: AmplifierModel, targetOutputDbm: number): number | null {
  // The peak of the curve: Rapp approaches Psat; Saleh peaks at Psat exactly
  if (targetOutputDbm >= model.psatDbm - 1e-6) {
    return null;
  }
  // Rising branch lies below the saturating input (Saleh) or anywhere (Rapp)
  let lo = targetOutputDbm - model.gainDb - 1;
  let hi = model.psatDbm - model.gainDb + (model.kind === 'saleh' ? 0 : 40);
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (outputPowerDbm(model, mid) < targetOutputDbm) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

/**
 * Third-order intercept of a solid-state amplifier over its P1dB, dB: the
 * datasheet rule of thumb (a pure cubic gives 9.6 dB). The Rapp AM/AM curve
 * has no third-order term, so on its own it reads unrealistically clean IM3
 * well below compression (it rises 4 dB per dB, from fifth order); SSPA
 * datasheets quote IM3 from an OIP3 near P1dB + 10 dB.
 */
export const SSPA_OIP3_OVER_P1DB_DB = 10;

/**
 * Two-tone C/IM3 (dB, positive) an amplifier shows at a composite drive: the
 * model's own two-tone result, and for a Rapp (SSPA) model never better than
 * the third-order intercept line 2 (OIP3 - Pout per tone) with
 * OIP3 = P1dB + 10 dB.
 */
export function carrierToIm3Db(model: AmplifierModel, totalInputDbm: number): number {
  const twoTone = twoToneResponse(model, totalInputDbm);
  if (model.kind !== 'rapp') {
    return twoTone.carrierToIm3Db;
  }
  const oip3 = p1dbDbm(model) + SSPA_OIP3_OVER_P1DB_DB;

  return Math.min(twoTone.carrierToIm3Db, 2 * (oip3 - twoTone.perToneOutputDbm));
}

/** Samples over one beat period for the two-tone Fourier integrals */
const TWO_TONE_SAMPLES = 512;

/**
 * Two equal tones through the model, at a total (two-tone) input power. The
 * input envelope is 2a·cos(πt) over one beat period (tones at ±½ of the
 * spacing); the output's Fourier components at ±½ and ±3/2 are the carriers
 * and the third-order products.
 *
 * @returns per-tone output power (dBm), IM3 product power (dBm, each side) and
 *   C/IM3 (dB, positive)
 */
export function twoToneResponse(model: AmplifierModel, totalInputDbm: number): { perToneOutputDbm: number; im3Dbm: number; carrierToIm3Db: number } {
  const a = Math.sqrt(dbmToMw(totalInputDbm) / 2); // per-tone amplitude
  let c1Re = 0;
  let c1Im = 0;
  let c3Re = 0;
  let c3Im = 0;
  const n = TWO_TONE_SAMPLES;
  for (let k = 0; k < n; k++) {
    const t = (2 * (k + 0.5)) / n; // [0, 2)
    const x = 2 * a * Math.cos(Math.PI * t);
    const r = Math.abs(x);
    const { amplitude, phase } = envelopeResponse(model, r);
    const sign = x >= 0 ? 1 : -1;
    // y = A(r)·sign·e^{jΦ}
    const yRe = sign * amplitude * Math.cos(phase);
    const yIm = sign * amplitude * Math.sin(phase);
    // c_m = (1/2)∫ y e^{-jmπt} dt over [0, 2) = mean of y e^{-jmπt}
    const a1 = Math.PI * t;
    const a3 = 3 * Math.PI * t;
    c1Re += yRe * Math.cos(a1) + yIm * Math.sin(a1);
    c1Im += yIm * Math.cos(a1) - yRe * Math.sin(a1);
    c3Re += yRe * Math.cos(a3) + yIm * Math.sin(a3);
    c3Im += yIm * Math.cos(a3) - yRe * Math.sin(a3);
  }
  const p1 = (c1Re / n) ** 2 + (c1Im / n) ** 2;
  const p3 = (c3Re / n) ** 2 + (c3Im / n) ** 2;
  const perToneOutputDbm = mwToDbm(p1);
  const im3Dbm = mwToDbm(p3);

  return { perToneOutputDbm, im3Dbm, carrierToIm3Db: p3 > 0 ? perToneOutputDbm - im3Dbm : Number.POSITIVE_INFINITY };
}
