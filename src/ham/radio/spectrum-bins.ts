/**
 * @file spectrum-bins - One waterfall/spectrum row for an SDR display
 * @description Display span is independent of the demodulator filter. Each
 * emission is spread over its occupied bandwidth (USB above, LSB below the
 * carrier); noise is a deterministic seeded pseudo-noise around the floor.
 */

import type { HamMode } from '../ham-types';

export interface SpectrumEmission {
  freqHz: number;
  bandwidthHz: number;
  mode: HamMode;
  /** Total received power of the emission, dBm */
  rssiDbm: number;
}

export interface SpectrumRowInput {
  centerHz: number;
  /** Display span, Hz */
  spanHz: number;
  bins: number;
  emissions: readonly SpectrumEmission[];
  /** Average noise power in one bin, dBm (before the RFI rise) */
  noiseFloorDbm: number;
  /** Broadband rise from noise sources / overload, dB */
  noiseSourceRiseDb?: number;
  seed: number;
}

/** Small deterministic PRNG, [0,1) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dbmToMw = (dbm: number): number => 10 ** (dbm / 10);

/** Frequency span [lo, hi] an emission occupies, Hz */
function occupied(e: SpectrumEmission): [number, number] {
  if (e.mode === 'USB' || e.mode === 'FT8') {
    return [e.freqHz, e.freqHz + e.bandwidthHz];
  }
  if (e.mode === 'LSB') {
    return [e.freqHz - e.bandwidthHz, e.freqHz];
  }

  return [e.freqHz - e.bandwidthHz / 2, e.freqHz + e.bandwidthHz / 2];
}

export function generateSpectrumRow(input: SpectrumRowInput): Float32Array {
  const { bins, spanHz, centerHz } = input;
  const row = new Float32Array(bins);
  const binHz = spanHz / bins;
  const lo = centerHz - spanHz / 2;
  const rand = mulberry32(input.seed);
  const floorMw = dbmToMw(input.noiseFloorDbm + (input.noiseSourceRiseDb ?? 0));

  // Linear power per bin from emissions
  const sig = new Float64Array(bins);
  for (const e of input.emissions) {
    const [eLo, eHi] = occupied(e);
    const bw = Math.max(eHi - eLo, 1);
    const totalMw = dbmToMw(e.rssiDbm);
    const first = Math.max(0, Math.floor((eLo - lo) / binHz));
    const last = Math.min(bins - 1, Math.floor((eHi - lo) / binHz));
    for (let b = first; b <= last; b++) {
      const bLo = Math.max(lo + b * binHz, eLo);
      const bHi = Math.min(lo + (b + 1) * binHz, eHi);
      if (bHi <= bLo) {
        continue;
      }
      // Soft skirts: taper the outer 15 percent of the occupied band
      const mid = (bLo + bHi) / 2;
      const edge = Math.min(mid - eLo, eHi - mid) / (bw * 0.15);
      const taper = e.mode === 'CW' || e.mode === 'FT8' ? 1 : Math.min(1, Math.max(0.15, edge));
      sig[b] += totalMw * ((bHi - bLo) / bw) * taper;
    }
  }

  for (let b = 0; b < bins; b++) {
    // Pseudo-noise: roughly Gaussian +-1.5 dB around the floor (sum of three uniforms)
    const jitterDb = (rand() + rand() + rand() - 1.5) * 2;
    row[b] = 10 * Math.log10(floorMw * 10 ** (jitterDb / 10) + sig[b]);
  }

  return row;
}
