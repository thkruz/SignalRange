/**
 * @file tx-protection - transmitter SWR foldback and delivered power
 * @description Full power up to SWR 2, falling linearly to 25 percent at SWR 3 and beyond.
 */

import { cxAbs } from './complex';
import type { RfPath } from './rf-path';

export const FOLDBACK_START_SWR = 2;
export const FOLDBACK_END_SWR = 3;
export const FOLDBACK_FLOOR = 0.25;

/** Fraction of the set power the transmitter allows at this SWR (0.25..1) */
export function foldbackFactor(swr: number): number {
  if (swr <= FOLDBACK_START_SWR) return 1;
  if (swr >= FOLDBACK_END_SWR) return FOLDBACK_FLOOR;
  const t = (swr - FOLDBACK_START_SWR) / (FOLDBACK_END_SWR - FOLDBACK_START_SWR);
  return 1 - t * (1 - FOLDBACK_FLOOR);
}

/** Transmitter output power, W, after foldback for the SWR at its antenna port */
export const txOutputPowerW = (setPowerW: number, swrAtRadio: number): number => setPowerW * foldbackFactor(swrAtRadio);

export interface TxPowerResult {
  /** Foldback-limited output at the radio, W */
  outputW: number;
  /** Fraction of the set power allowed */
  foldback: number;
  /** Power absorbed or radiated beyond the cable: output minus reflection at the radio, minus feedline loss, W */
  deliveredToLoadW: number;
  /** True when the radio is folding back */
  foldedBack: boolean;
}

/** Output and load-delivered power for a resolved path (used by the reception/link side) */
export function txPowerThroughPath(setPowerW: number, path: RfPath): TxPowerResult {
  const foldback = foldbackFactor(path.swrAtStart);
  const outputW = setPowerW * foldback;
  const g = cxAbs(path.gammaAtStart);
  const accepted = outputW * (1 - g * g);
  // Accepted power is the net power into the cable; the line loss comes off before the load.
  const deliveredToLoadW = accepted * 10 ** (-path.totalLossDb / 10);
  return { outputW, foldback, deliveredToLoadW, foldedBack: foldback < 1 };
}
