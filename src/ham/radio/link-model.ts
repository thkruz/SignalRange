/**
 * @file link-model - Terrestrial link budget between two local positions
 * @description FSPL plus a radio-horizon / obstruction penalty, polarization
 * mismatch, and the receiver noise floor. Pure functions, no state.
 */

import { thermalNoiseDbm } from '@app/simulation/noise-model';
import { freeSpacePathLossDb } from '@app/simulation/rf-geometry';
import type { HamDeviceKind, LocalPosition } from '../ham-types';

export const MIN_LINK_DISTANCE_KM = 0.01;
/** Fixed diffraction penalty once the path is beyond the radio horizon, dB */
export const BEYOND_HORIZON_BASE_DB = 20;
/** Additional loss per km beyond the radio horizon, dB/km */
export const BEYOND_HORIZON_DB_PER_KM = 0.5;

export interface LinkLossInput {
  freqHz: number;
  tx: LocalPosition;
  rx: LocalPosition;
  /** Authored obstruction (hill, building), dB */
  obstructionDb?: number;
  minDistanceKm?: number;
}

export interface LinkLoss {
  pathLossDb: number;
  distanceKm: number;
  /** Bearing from the receiver toward the transmitter, deg true (0 = north, clockwise) */
  bearingDeg: number;
  horizonKm: number;
  beyondHorizon: boolean;
  diffractionDb: number;
}

/** Radio horizon between two antenna heights, km: 4.12 (sqrt(h1) + sqrt(h2)) */
export function radioHorizonKm(h1M: number, h2M: number): number {
  return 4.12 * (Math.sqrt(Math.max(h1M, 0)) + Math.sqrt(Math.max(h2M, 0)));
}

/** Bearing from one local position to another, deg true (0 = north, clockwise) */
export function bearingBetweenDeg(from: LocalPosition, to: LocalPosition): number {
  const deg = (Math.atan2(to.xKm - from.xKm, to.yKm - from.yKm) * 180) / Math.PI;

  return (deg + 360) % 360;
}

export function linkLoss(input: LinkLossInput): LinkLoss {
  const { tx, rx } = input;
  const dx = tx.xKm - rx.xKm;
  const dy = tx.yKm - rx.yKm;
  const dz = (tx.heightM - rx.heightM) / 1000;
  const distanceKm = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), input.minDistanceKm ?? MIN_LINK_DISTANCE_KM);
  const horizonKm = radioHorizonKm(tx.heightM, rx.heightM);
  const beyondHorizon = distanceKm > horizonKm;
  const diffractionDb = beyondHorizon ? BEYOND_HORIZON_BASE_DB + BEYOND_HORIZON_DB_PER_KM * (distanceKm - horizonKm) : 0;
  const pathLossDb = freeSpacePathLossDb(input.freqHz, distanceKm) + diffractionDb + (input.obstructionDb ?? 0);

  return { pathLossDb, distanceKm, bearingDeg: bearingBetweenDeg(rx, tx), horizonKm, beyondHorizon, diffractionDb };
}

export type Polarization = 'V' | 'H' | 'RHCP' | 'LHCP';

export function polarizationMismatchDb(txPol: Polarization, rxPol: Polarization): number {
  if (txPol === rxPol) {
    return 0;
  }
  const circular = (p: Polarization): boolean => p === 'RHCP' || p === 'LHCP';
  if (circular(txPol) && circular(rxPol)) {
    return 20;
  }
  if (circular(txPol) || circular(rxPol)) {
    return 3;
  }

  return 20;
}

export interface ReceivedPowerInput {
  erpDbm: number;
  pathLossDb: number;
  /** Receive antenna gain toward the source, dBi */
  rxGainDb: number;
  polarizationMismatchDb?: number;
  rxFeedLossDb?: number;
}

export function receivedPowerDbm(i: ReceivedPowerInput): number {
  return i.erpDbm - i.pathLossDb + i.rxGainDb - (i.polarizationMismatchDb ?? 0) - (i.rxFeedLossDb ?? 0);
}

/** Typical receiver noise figure by device kind, dB */
export function defaultNoiseFigureDb(kind: HamDeviceKind): number {
  return kind === 'sdr' ? 6 : 8;
}

/** Receiver noise floor in the given bandwidth: kTB + NF + external rise, dBm */
export function noiseFloorDbm(bandwidthHz: number, noiseFigureDb: number, externalRiseDb = 0): number {
  return thermalNoiseDbm(290, bandwidthHz) + noiseFigureDb + externalRiseDb;
}
