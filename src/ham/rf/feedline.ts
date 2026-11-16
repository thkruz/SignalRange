/**
 * @file feedline - coax types, loss versus frequency, faults and DC tests
 * @description Attenuation is kept separate from mismatch: `coaxLossDb` is one-way
 * loss only. Faults expose a local discontinuity (reflection) for rf-path to use.
 */

import { type Cx, cx } from './complex';

export type CoaxTypeId = 'rg58' | 'rg8x' | 'lmr400';

export interface CoaxType {
  id: CoaxTypeId;
  label: string;
  /** dB per 100 ft */
  lossAt150: number;
  lossAt450: number;
  velocityFactor: number;
  /** DC resistance, ohm per ft */
  centreOhmPerFt: number;
  shieldOhmPerFt: number;
}

export const COAX_TYPES: Readonly<Record<CoaxTypeId, CoaxType>> = {
  rg58: { id: 'rg58', label: 'RG-58', lossAt150: 6.1, lossAt450: 10.5, velocityFactor: 0.66, centreOhmPerFt: 0.0108, shieldOhmPerFt: 0.0035 },
  rg8x: { id: 'rg8x', label: 'RG-8X', lossAt150: 4.5, lossAt450: 8.0, velocityFactor: 0.78, centreOhmPerFt: 0.0075, shieldOhmPerFt: 0.003 },
  lmr400: { id: 'lmr400', label: 'LMR-400', lossAt150: 1.5, lossAt450: 2.7, velocityFactor: 0.85, centreOhmPerFt: 0.0016, shieldOhmPerFt: 0.0012 },
};

export type CoaxFaultKind = 'crushed-coax' | 'wet-connector' | 'open-centre' | 'short';

export interface CoaxFault {
  kind: CoaxFaultKind;
  /** Override reflection magnitude of the discontinuity */
  gammaMag?: number;
  /** Override extra attenuation, dB */
  extraLossDb?: number;
  /** DC centre-to-shield resistance when the fault shorted it (crush or short) */
  dcShortOhm?: number;
}

export interface CoaxState {
  type: CoaxTypeId;
  lengthFt: number;
  fault: CoaxFault | null;
}

export const M_PER_FT = 0.3048;
export const ftFromM = (m: number): number => m / M_PER_FT;

export function createCoax(type: CoaxTypeId, length: number, unit: 'ft' | 'm' = 'ft', fault: CoaxFault | null = null): CoaxState {
  return { type, lengthFt: unit === 'ft' ? length : ftFromM(length), fault };
}

/** Matched-line loss per 100 ft at fMHz (power law through the 150 and 450 MHz points, about sqrt(f)) */
export function coaxLossPer100ftDb(type: CoaxTypeId, fMHz: number): number {
  const t = COAX_TYPES[type];
  const p = Math.log(t.lossAt450 / t.lossAt150) / Math.log(3);
  return t.lossAt150 * (Math.max(fMHz, 0.1) / 150) ** p;
}

/** One-way attenuation of the healthy cable, dB (no mismatch, no fault) */
export const coaxBaseLossDb = (c: CoaxState, fMHz: number): number => (coaxLossPer100ftDb(c.type, fMHz) * c.lengthFt) / 100;

function faultDefaults(f: CoaxFault): { gammaMag: number; extraLossDb: number } {
  switch (f.kind) {
    case 'crushed-coax':
      return { gammaMag: 0.55, extraLossDb: 1.5 };
    case 'wet-connector':
      return { gammaMag: 0.2, extraLossDb: 3 };
    case 'open-centre':
    case 'short':
      return { gammaMag: 1, extraLossDb: 0 };
  }
}

/** One-way attenuation including fault, dB */
export function coaxLossDb(c: CoaxState, fMHz: number): number {
  const base = coaxBaseLossDb(c, fMHz);
  if (!c.fault) return base;
  return base + (c.fault.extraLossDb ?? faultDefaults(c.fault).extraLossDb);
}

export interface CoaxDiscontinuity {
  /** Position along the cable 0..1 from end A */
  pos: number;
  gamma: Cx;
  /** open/short: nothing beyond is seen */
  blocking: boolean;
}

export function coaxDiscontinuity(c: CoaxState): CoaxDiscontinuity | null {
  const f = c.fault;
  if (!f) return null;
  const mag = f.gammaMag ?? faultDefaults(f).gammaMag;
  switch (f.kind) {
    case 'crushed-coax':
      return { pos: 0.5, gamma: cx(mag), blocking: false };
    case 'wet-connector':
      return { pos: 1, gamma: cx(mag), blocking: false };
    case 'open-centre':
      return { pos: 0.5, gamma: cx(1), blocking: true };
    case 'short':
      return { pos: 0.5, gamma: cx(-1), blocking: true };
  }
}

/** Physical length divided by velocity factor, m (drives the reflection phase) */
export const coaxElectricalLengthM = (c: CoaxState): number => (c.lengthFt * M_PER_FT) / COAX_TYPES[c.type].velocityFactor;

export interface CoaxDcTest {
  /** Centre conductor end-to-end, ohm; null = open */
  centreOhm: number | null;
  /** Shield end-to-end, ohm; null = open */
  shieldOhm: number | null;
  /** Centre to shield, ohm; null = open circuit (healthy) */
  centreShieldOhm: number | null;
}

/** DC tests with both ends disconnected */
export function coaxDcTest(c: CoaxState): CoaxDcTest {
  const t = COAX_TYPES[c.type];
  const out: CoaxDcTest = { centreOhm: t.centreOhmPerFt * c.lengthFt + 0.1, shieldOhm: t.shieldOhmPerFt * c.lengthFt + 0.1, centreShieldOhm: null };
  if (c.fault?.kind === 'open-centre') out.centreOhm = null;
  if (c.fault?.kind === 'short') out.centreShieldOhm = c.fault.dcShortOhm ?? 0.3;
  if (c.fault?.kind === 'crushed-coax' && c.fault.dcShortOhm !== undefined) out.centreShieldOhm = c.fault.dcShortOhm;
  if (c.fault?.kind === 'wet-connector') out.centreShieldOhm = c.fault.dcShortOhm ?? 250_000;
  return out;
}
