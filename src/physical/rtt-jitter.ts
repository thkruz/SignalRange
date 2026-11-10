/**
 * @file rtt-jitter - Delay variation from a documented RTT sample window (Campaign 6, package E)
 * @description Jitter is not meter noise and not one RTT value. A path with an authored `rttSpreadMs` has a
 * deterministic one-second RTT series: the RTT of scenario second k is `rttMs + spread * (2u - 1)` where u is a
 * seeded hash of k. The reported jitter at scenario time t is the MEAN ABSOLUTE DIFFERENCE between consecutive
 * one-second RTT samples over the trailing window (t - 60 s, t], clamped at scenario second 0. Because the series
 * is a pure function of the integer second and the seed, the value depends only on t: a clock jump, a coarse
 * time skip and one-second stepping all give the same number, and a restore reproduces it.
 * For two uniform samples on +/- spread the expected jitter is 2/3 of the spread.
 * A remote leg with its own authored jitter combines in quadrature (independent variances add); a leg without
 * one is treated as fixed delay and adds nothing.
 */

export const JITTER_WINDOW_S = 60;
/** Fewer one-second samples than this (early in a scenario) read as no jitter measurement, never as zero */
export const JITTER_MIN_SAMPLES = 10;

/** Deterministic u in [0, 1) for second k of a series */
function unit(seed: number, k: number): number {
  let h = (Math.imul(k | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;

  return h / 4294967296;
}

/** The RTT of one scenario second */
export function rttAtSecond(rttMs: number, spreadMs: number, seed: number, k: number): number {
  return rttMs + spreadMs * (2 * unit(seed, k) - 1);
}

/** Stable seed for a service id (authored seeds win) */
export function seedFor(serviceId: string): number {
  let h = 2166136261;
  for (let i = 0; i < serviceId.length; i++) {
    h = Math.imul(h ^ serviceId.charCodeAt(i), 16777619) >>> 0;
  }

  return h;
}

export interface JitterMeasurement {
  jitterMs: number;
  /** Seconds of scenario time the window actually covers (<= JITTER_WINDOW_S) */
  windowS: number;
  samples: number;
}

/** Jitter over the trailing window ending at scenario second `tS`, or null while too little time has passed */
export function windowJitter(rttMs: number, spreadMs: number, seed: number, tS: number, windowS = JITTER_WINDOW_S): JitterMeasurement | null {
  const end = Math.floor(tS);
  const start = Math.max(0, end - windowS);
  const samples = end - start + 1;
  if (samples < JITTER_MIN_SAMPLES) {
    return null;
  }
  let sum = 0;
  let prev = rttAtSecond(rttMs, spreadMs, seed, start);
  for (let k = start + 1; k <= end; k++) {
    const cur = rttAtSecond(rttMs, spreadMs, seed, k);
    sum += Math.abs(cur - prev);
    prev = cur;
  }

  return { jitterMs: sum / (samples - 1), windowS: end - start, samples };
}
