/**
 * @file complex - tiny complex-number helpers for reflection coefficients
 * @description JSON-safe ({re, im}) so reflection state can be stored in checkpoints.
 */

export interface Cx {
  re: number;
  im: number;
}

export const cx = (re: number, im = 0): Cx => ({ re, im });
export const cxAdd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im });
export const cxSub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im });
export const cxMul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const cxScale = (a: Cx, k: number): Cx => ({ re: a.re * k, im: a.im * k });
export const cxAbs = (a: Cx): number => Math.hypot(a.re, a.im);
export const cxPolar = (mag: number, phaseRad: number): Cx => ({ re: mag * Math.cos(phaseRad), im: mag * Math.sin(phaseRad) });
export function cxDiv(a: Cx, b: Cx): Cx {
  const d = b.re * b.re + b.im * b.im || 1e-12;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

/** Reflection coefficient of impedance r + jx against a 50 ohm reference */
export function gammaFromZ(r: number, x: number, z0 = 50): Cx {
  return cxDiv(cx(r - z0, x), cx(r + z0, x));
}

/** Impedance (ohms) for a reflection coefficient against a 50 ohm reference */
export function zFromGamma(g: Cx, z0 = 50): { r: number; x: number } {
  const gg = cxAbs(g) > 0.9999 ? cxScale(g, 0.9999 / cxAbs(g)) : g;
  const z = cxScale(cxDiv(cxAdd(cx(1), gg), cxSub(cx(1), gg)), z0);
  return { r: z.re, x: z.im };
}

/** SWR for a reflection magnitude, capped at 99 */
export function swrFromGammaMag(mag: number): number {
  const m = Math.min(Math.max(mag, 0), 0.9999);
  return Math.min(99, (1 + m) / (1 - m));
}

export const swrFromGamma = (g: Cx): number => swrFromGammaMag(cxAbs(g));
