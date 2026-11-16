/**
 * @file noise-sources - RFI devices and front-end overload for the ham receiver
 * @description A noisy switching supply raises the receiver noise floor and has
 * a findable bearing (with a weaker reflection lobe). Strong signals overload
 * an SDR front end when RF gain is high; lowering gain or adding a filter
 * restores reception. High gain is deliberately not "best".
 */

import type { LocalPosition } from '../ham-types';
import { bearingBetweenDeg } from './link-model';

export interface RfiDevice {
  id: string;
  position: LocalPosition;
  energized: boolean;
  /** Broadband noise PSD at 1 m, dBm/Hz; null = clean supply, contributes nothing */
  psdDbmHzAt1m: number | null;
  /** Supply (mains strip / USB hub) this device shares, for conducted coupling */
  supplyId?: string;
  /** Extra coupling when sharing the receiver supply, dB (bounded) */
  conductedBoostDb?: number;
  /** Authored reflection lobe: a weaker apparent source at another bearing */
  reflection?: { bearingOffsetDeg: number; extraLossDb: number };
}

export interface NoiseReceiver {
  position: LocalPosition;
  supplyId?: string;
  /** Antenna gain toward an absolute bearing (deg true), dBi; omni if absent */
  antennaGainDb?: (bearingDeg: number) => number;
}

export interface NoiseContribution {
  deviceId: string;
  noiseDbm: number;
  bearingDeg: number;
  conducted: boolean;
}

export interface NoiseRiseResult {
  /** Total RFI noise power in the receiver bandwidth, dBm (-Infinity if none) */
  noiseDbm: number;
  /** Rise over the given base floor, dB (0 when nothing contributes) */
  riseDb: number;
  /** Bearing the strongest contribution appears to come from (null if none) */
  strongestBearingDeg: number | null;
  contributions: NoiseContribution[];
}

export const NEAR_FIELD_MIN_DISTANCE_M = 1;
export const DEFAULT_CONDUCTED_BOOST_DB = 25;
const MAX_CONDUCTED_BOOST_DB = 40;

/** Radiated PSD at distance, dBm/Hz: -20 dB/decade from 1 m, bounded at 1 m on the near side */
export function rfiPsdAtDistance(psdAt1m: number, distanceM: number): number {
  return psdAt1m - 20 * Math.log10(Math.max(distanceM, NEAR_FIELD_MIN_DISTANCE_M));
}

const dbmToMw = (dbm: number): number => 10 ** (dbm / 10);
const mwToDbm = (mw: number): number => 10 * Math.log10(mw);

/** Lobes (direct plus reflection) a device presents to the receiver */
function lobes(dev: RfiDevice, rx: NoiseReceiver, bandwidthHz: number): NoiseContribution[] {
  if (!dev.energized || dev.psdDbmHzAt1m === null) {
    return [];
  }
  const conducted = dev.supplyId !== undefined && dev.supplyId === rx.supplyId;
  const dx = (dev.position.xKm - rx.position.xKm) * 1000;
  const dy = (dev.position.yKm - rx.position.yKm) * 1000;
  const distanceM = Math.sqrt(dx * dx + dy * dy);
  const boost = conducted ? Math.min(dev.conductedBoostDb ?? DEFAULT_CONDUCTED_BOOST_DB, MAX_CONDUCTED_BOOST_DB) : 0;
  const base = rfiPsdAtDistance(dev.psdDbmHzAt1m, distanceM) + 10 * Math.log10(bandwidthHz) + boost;
  const directBearing = bearingBetweenDeg(rx.position, dev.position);
  const gain = (b: number): number => (conducted ? 0 : (rx.antennaGainDb?.(b) ?? 0));
  const out: NoiseContribution[] = [{ deviceId: dev.id, noiseDbm: base + gain(directBearing), bearingDeg: directBearing, conducted }];
  if (dev.reflection && !conducted) {
    const rb = (directBearing + dev.reflection.bearingOffsetDeg + 360) % 360;
    out.push({ deviceId: dev.id, noiseDbm: base - dev.reflection.extraLossDb + gain(rb), bearingDeg: rb, conducted });
  }

  return out;
}

/** Noise rise a receiver sees from the devices, over its base floor (dBm in bandwidthHz) */
export function noiseRiseAtReceiver(devices: readonly RfiDevice[], rx: NoiseReceiver, bandwidthHz: number, baseFloorDbm: number): NoiseRiseResult {
  const contributions = devices.flatMap((d) => lobes(d, rx, bandwidthHz));
  if (contributions.length === 0) {
    return { noiseDbm: -Infinity, riseDb: 0, strongestBearingDeg: null, contributions };
  }
  const totalMw = contributions.reduce((s, c) => s + dbmToMw(c.noiseDbm), 0);
  const riseDb = mwToDbm(dbmToMw(baseFloorDbm) + totalMw) - baseFloorDbm;
  const strongest = contributions.reduce((a, b) => (b.noiseDbm > a.noiseDbm ? b : a));

  return { noiseDbm: mwToDbm(totalMw), riseDb, strongestBearingDeg: strongest.bearingDeg, contributions };
}

/**
 * Sweep a directional antenna around the compass: noise power seen with the
 * antenna pointed at each bearing. `receiverAt(pointingDeg)` builds the
 * receiver with an antenna pattern aimed there. The peak marks the strongest
 * lobe, which with a reflection present is not always the true location.
 */
export function scanNoiseBearings(
  devices: readonly RfiDevice[],
  receiverAt: (pointingDeg: number) => NoiseReceiver,
  bandwidthHz: number,
  stepDeg = 5
): { bearingDeg: number; noiseDbm: number }[] {
  const out: { bearingDeg: number; noiseDbm: number }[] = [];
  for (let b = 0; b < 360; b += stepDeg) {
    const rx = receiverAt(b);
    const mw = devices.flatMap((d) => lobes(d, rx, bandwidthHz)).reduce((s, c) => s + dbmToMw(c.noiseDbm), 0);
    out.push({ bearingDeg: b, noiseDbm: mw > 0 ? mwToDbm(mw) : -Infinity });
  }

  return out;
}

// ---------------------------------------------------------------- overload

export interface StrongSignal {
  rssiDbm: number;
}

export interface OverloadInput {
  /** Strong signals inside the front-end passband (e.g. a nearby FM broadcaster) */
  signals: readonly StrongSignal[];
  rfGainDb: number;
  /** Notch/band-stop filter attenuation applied to these signals, dB */
  filterAttenDb?: number;
}

/** Level after gain at which the SDR front end begins to compress, dBm */
export const FRONT_END_COMPRESSION_DBM = -25;
export const MAX_OVERLOAD_RISE_DB = 40;

/** Effective floor rise from front-end overload/desense, dB (0 inside the linear range) */
export function overloadRiseDb(input: OverloadInput): number {
  if (input.signals.length === 0) {
    return 0;
  }
  const totalMw = input.signals.reduce((s, x) => s + dbmToMw(x.rssiDbm), 0);
  const level = mwToDbm(totalMw) - (input.filterAttenDb ?? 0) + input.rfGainDb;
  const excess = level - FRONT_END_COMPRESSION_DBM;

  return excess <= 0 ? 0 : Math.min(excess, MAX_OVERLOAD_RISE_DB);
}

/** Low RF gain costs sensitivity (the converter sees receiver noise); high gain risks overload */
export function effectiveNoiseFigureDb(baseNfDb: number, rfGainDb: number): number {
  return baseNfDb + Math.max(0, 25 - rfGainDb) * 0.4;
}
