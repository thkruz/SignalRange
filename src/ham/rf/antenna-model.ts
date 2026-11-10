/**
 * @file antenna-model - antenna definitions, impedance, gain and polarization
 * @description Pure, deterministic, JSON state. Simple cos-power patterns and a
 * series-resonance impedance model: Z(f) = R + jX, X = R*Q*(f/f0 - f0/f).
 * Polarization angle convention: 0 deg = vertical, 90 deg = horizontal.
 */

import { type Cx, cxAbs, gammaFromZ, swrFromGamma } from './complex';

export type AntennaKind = 'rubber-duck' | 'quarter-wave-vertical' | 'adjustable-dipole' | 'ten-meter-dipole' | 'dual-band-yagi' | 'df-yagi';

export type AntennaOrientation = 'vertical' | 'horizontal';

export interface AntennaState {
  kind: AntennaKind;
  /** adjustable-dipole: the two element lengths, m (resonance f0 = 143 / sum MHz) */
  elementLengthsM: [number, number];
  orientation: AntennaOrientation;
  /** Boresight (directional) or broadside (horizontal dipole) azimuth, deg from north */
  azDeg: number;
  /** Boresight elevation, deg (directional antennas) */
  elDeg: number;
  /** Linear polarization angle of the yagis, deg (0 = V, 90 = H). Rotatable for satellite fading. */
  polAngleDeg: number;
}

export type Polarization = { kind: 'linear'; angleDeg: number } | { kind: 'rhcp' } | { kind: 'lhcp' };

export const DIPOLE_K_MHZ_M = 143;
export const CROSS_POL_CAP_DB = 20;

interface AntennaSpec {
  label: string;
  peakDbi: number;
  /** Resonant centre frequencies, MHz (nearest one is used) */
  f0sMHz: readonly number[];
  r: number;
  q: number;
}

const SPECS: Record<AntennaKind, AntennaSpec> = {
  'rubber-duck': { label: 'Rubber duck (HT stock)', peakDbi: -3, f0sMHz: [146, 446], r: 50, q: 6 },
  'quarter-wave-vertical': { label: 'Quarter-wave vertical', peakDbi: 0, f0sMHz: [146], r: 36, q: 6 },
  'adjustable-dipole': { label: 'Adjustable 2 m dipole', peakDbi: 2.1, f0sMHz: [], r: 73, q: 8 },
  'ten-meter-dipole': { label: '10 m dipole', peakDbi: 2.1, f0sMHz: [28.4], r: 73, q: 8 },
  'dual-band-yagi': { label: 'Dual-band satellite Yagi', peakDbi: 7, f0sMHz: [146, 436], r: 50, q: 3 },
  'df-yagi': { label: 'Direction-finding Yagi', peakDbi: 6, f0sMHz: [146, 446], r: 50, q: 4 },
};

export function createAntenna(kind: AntennaKind, overrides: Partial<AntennaState> = {}): AntennaState {
  const base: AntennaState = {
    kind,
    // Starting kit is slightly long: total 1.00 m -> f0 = 143 MHz, below 146.55
    elementLengthsM: [0.5, 0.5],
    orientation: kind === 'ten-meter-dipole' ? 'horizontal' : 'vertical',
    azDeg: 0,
    elDeg: 0,
    polAngleDeg: 0,
  };
  return { ...base, ...overrides, kind };
}

export const antennaLabel = (a: AntennaState): string => SPECS[a.kind].label;

export const isDirectional = (a: AntennaState): boolean => a.kind === 'dual-band-yagi' || a.kind === 'df-yagi';

export function dipoleResonanceMHz(totalLengthM: number): number {
  return DIPOLE_K_MHZ_M / Math.max(totalLengthM, 0.05);
}

/** Resonant frequency (MHz) nearest to fMHz */
export function antennaResonanceMHz(a: AntennaState, fMHz = 146.55): number {
  if (a.kind === 'adjustable-dipole') return dipoleResonanceMHz(a.elementLengthsM[0] + a.elementLengthsM[1]);
  const list = SPECS[a.kind].f0sMHz;
  return list.reduce((best, f0) => (Math.abs(f0 - fMHz) < Math.abs(best - fMHz) ? f0 : best), list[0]);
}

/** Feed-point impedance at fMHz */
export function antennaImpedance(a: AntennaState, fMHz: number): { r: number; x: number } {
  const spec = SPECS[a.kind];
  const f0 = antennaResonanceMHz(a, fMHz);
  return { r: spec.r, x: spec.r * spec.q * (fMHz / f0 - f0 / fMHz) };
}

export function antennaGamma(a: AntennaState, fMHz: number): Cx {
  const z = antennaImpedance(a, fMHz);
  return gammaFromZ(z.r, z.x);
}

export const antennaSwr = (a: AntennaState, fMHz: number): number => swrFromGamma(antennaGamma(a, fMHz));

/** Loss from reflection: -10 log10(1 - |G|^2), dB */
export function mismatchLossDb(gammaMag: number): number {
  const m = Math.min(Math.max(gammaMag, 0), 0.99);
  return -10 * Math.log10(1 - m * m);
}

export const antennaMismatchLossDb = (a: AntennaState, fMHz: number): number => mismatchLossDb(cxAbs(antennaGamma(a, fMHz)));

type Vec = readonly [number, number, number];
const dot = (u: Vec, v: Vec): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const rad = (d: number): number => (d * Math.PI) / 180;
const dirVec = (azDeg: number, elDeg: number): Vec => [Math.sin(rad(azDeg)) * Math.cos(rad(elDeg)), Math.cos(rad(azDeg)) * Math.cos(rad(elDeg)), Math.sin(rad(elDeg))];

/**
 * Gain toward (azDeg, elDeg), dBi. Includes antenna efficiency (the rubber duck's peak is already -3 dBi).
 * Omni/dipole: sin(theta) to the element axis. Yagis: -12 (theta/BW)^2 down to the front-to-back floor.
 */
export function antennaGainDbi(a: AntennaState, fMHz: number, azDeg: number, elDeg: number): number {
  const spec = SPECS[a.kind];
  const d = dirVec(azDeg, elDeg);
  if (isDirectional(a)) {
    const sat = a.kind === 'dual-band-yagi';
    const vhf = fMHz < 300;
    const peak = sat ? (vhf ? 7 : 10) : 6;
    const bw = sat ? (vhf ? 60 : 45) : 70;
    const fb = sat ? 15 : 20;
    const cosT = Math.min(1, Math.max(-1, dot(d, dirVec(a.azDeg, a.elDeg))));
    const theta = (Math.acos(cosT) * 180) / Math.PI;
    return peak - Math.min(12 * (theta / bw) ** 2, fb);
  }
  const axis: Vec = a.orientation === 'vertical' ? [0, 0, 1] : [Math.cos(rad(a.azDeg)), -Math.sin(rad(a.azDeg)), 0];
  const sinT = Math.sqrt(Math.max(1 - dot(d, axis) ** 2, 0));
  return spec.peakDbi + 20 * Math.log10(Math.max(sinT, 0.03));
}

export function antennaPolarization(a: AntennaState): Polarization {
  if (isDirectional(a)) return { kind: 'linear', angleDeg: a.polAngleDeg };
  return { kind: 'linear', angleDeg: a.orientation === 'vertical' ? 0 : 90 };
}

/** Map the on-air label of OnAirEmission.polarization to a Polarization */
export function polarizationFromLabel(label: 'V' | 'H' | 'RHCP' | 'LHCP'): Polarization {
  if (label === 'V') return { kind: 'linear', angleDeg: 0 };
  if (label === 'H') return { kind: 'linear', angleDeg: 90 };
  return { kind: label === 'RHCP' ? 'rhcp' : 'lhcp' };
}

/**
 * Polarization mismatch loss, dB. Linear vs linear: -20 log10|cos(delta)| capped at 20 dB
 * (V vs H hits the cap); circular vs linear 3 dB; opposite circular 20 dB.
 */
export function polarizationLossDb(tx: Polarization, rx: Polarization): number {
  if (tx.kind === 'linear' && rx.kind === 'linear') {
    const c = Math.abs(Math.cos(rad(tx.angleDeg - rx.angleDeg)));
    return Math.min(CROSS_POL_CAP_DB, -20 * Math.log10(Math.max(c, 1e-6)));
  }
  if (tx.kind === 'linear' || rx.kind === 'linear') return 3;
  return tx.kind === rx.kind ? 0 : CROSS_POL_CAP_DB;
}
