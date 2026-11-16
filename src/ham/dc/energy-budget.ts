/**
 * Pure energy-budget helpers (S7 current card, S12 energy budget, handheld packs).
 */
import type { HamCapabilityProfile } from '../ham-types';

export interface LoadProfile {
  rxW: number;
  txW: number;
  /** Fraction of time transmitting, 0..1 */
  txDuty: number;
  /** Always-on accessory draw, W */
  accessoryW?: number;
}

export function averagePowerW(p: LoadProfile): number {
  const d = Math.min(1, Math.max(0, p.txDuty));
  return p.rxW * (1 - d) + p.txW * d + (p.accessoryW ?? 0);
}

export function energyUsedWh(avgW: number, minutes: number): number {
  return (avgW * minutes) / 60;
}

export function remainingWh(totalWh: number, usedWh: number): number {
  return Math.max(0, totalWh - usedWh);
}

export interface ReserveCheck {
  remainingWh: number;
  reserveWh: number;
  satisfied: boolean;
}

export function reserveCheck(totalWh: number, usedWh: number, reserveWh: number): ReserveCheck {
  const rem = totalWh - usedWh;
  return { remainingWh: Math.max(0, rem), reserveWh, satisfied: rem >= reserveWh };
}

export interface CurrentProfile {
  rxA: number;
  txA: number;
  txDuty: number;
}

export function averageCurrentA(p: CurrentProfile): number {
  const d = Math.min(1, Math.max(0, p.txDuty));
  return p.rxA * (1 - d) + p.txA * d;
}

/** Ideal endurance in hours from usable Ah (no derating). */
export function idealEnduranceH(usableAh: number, avgA: number): number {
  return avgA > 0 ? usableAh / avgA : Infinity;
}

/** Handheld pack drain over a period, Wh, from the profile's rxW/txW. */
export function handheldDrainWh(profile: HamCapabilityProfile, rxMinutes: number, txMinutes: number): number {
  const rx = profile.power.rxW ?? 0;
  const tx = profile.power.txW ?? 0;
  return (rx * rxMinutes + tx * txMinutes) / 60;
}

export function handheldPackRemainingWh(profile: HamCapabilityProfile, usedWh: number): number {
  return Math.max(0, (profile.power.packWh ?? 0) - usedWh);
}

/**
 * Guard: may this supply voltage be connected to the radio's battery contacts?
 * Returns a refusal reason, or null when the connection is acceptable.
 */
export function inputVoltageRefusal(profile: HamCapabilityProfile, volts: number): string | null {
  const power = profile.power;
  const limit = power.maxInputV ?? (power.source === 'internal-battery' && power.nominalV ? power.nominalV * 1.15 : undefined);
  if (limit !== undefined && volts > limit) {
    return `${profile.label} battery contacts accept at most ${limit} V; ${volts} V would destroy it. Use the charger or a battery eliminator, never a 13.8 V supply.`;
  }
  return null;
}
