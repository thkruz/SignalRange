/**
 * @file run-power - Reading a workload run's own energy accounting (Campaign 6, package F)
 * @description Pure helpers over `RunPowerRecord`: did the reserve hold for the whole run window, what rate did the
 * battery really supply, and does a claimed rate agree with it. Charge and load are kept apart: the claim
 * is about the load the battery carried, so charging during the run cannot make the number look better.
 */

import type { RunPowerRecord } from './workload-types';

/** A claimed rate agrees with the measured one within this fraction of the measured rate... */
export const RATE_REL_TOL = 0.1;
/** ...or within this many watts, whichever is larger (a near-zero draw has no meaningful percentage) */
export const RATE_FLOOR_W = 5;
/** Energy comparisons use the same fraction with this floor in Wh */
export const ENERGY_FLOOR_WH = 0.5;
/** Slack (Wh) on reserve comparisons, below the display resolution */
const EPS_WH = 1e-6;

/** Seconds the run's window actually covers (zero when it never closed) */
export function windowSeconds(power: RunPowerRecord): number {
  const w = power.window;

  return w.endS === null ? 0 : w.endS - w.startS;
}

/** Average draw the batteries carried over the window (W), from the integrated load, never from the net change in stored energy */
export function measuredLoadW(power: RunPowerRecord): number | null {
  const seconds = windowSeconds(power);

  return seconds > 0 ? (power.window.loadWh * 3600) / seconds : null;
}

/** Average charge that entered the batteries over the window (W) */
export function measuredChargeW(power: RunPowerRecord): number | null {
  const seconds = windowSeconds(power);

  return seconds > 0 ? (power.window.chargeWh * 3600) / seconds : null;
}

/** Stored energy at the end if nothing had charged the batteries during the window */
export function batteryOnlyEndWh(power: RunPowerRecord): number {
  return power.window.startStoredWh - power.window.loadWh;
}

/** |claimed - measured| within the larger of the relative tolerance and the absolute floor */
export function rateAgrees(claimed: number, measured: number, relTol = RATE_REL_TOL, floor = RATE_FLOOR_W): boolean {
  return Number.isFinite(claimed) && Number.isFinite(measured) && Math.abs(claimed - measured) <= Math.max(relTol * Math.abs(measured), floor);
}

/** The measured battery draw agrees with what the plan forecast for the same window */
export function forecastAgrees(power: RunPowerRecord): boolean {
  if (power.forecastWh === null) {
    return false;
  }

  return Math.abs(power.window.loadWh - power.forecastWh) <= Math.max(RATE_REL_TOL * Math.abs(power.window.loadWh), ENERGY_FLOOR_WH);
}

/**
 * The reserve held across `windowS` scenario seconds of this run, and only this run:
 * the record is complete, the window spans the run, covers `windowS` and has an accounted step for each second
 * (a window that missed seconds proves nothing), stored energy never fell below the reserve, and on a battery-only
 * plan it would not have fallen below it with all charging removed.
 */
export function runHeldReserve(power: RunPowerRecord, runStartS: number, runEndS: number, windowS: number): boolean {
  const w = power.window;
  if (!power.complete || w.endS === null || power.reserveWh === null) {
    return false;
  }
  if (Math.abs(w.startS - runStartS) > 1 || runEndS - runStartS < windowS - 1e-6 || w.endS - w.startS < windowS - 1 || w.steps < windowS - 1) {
    return false;
  }
  if (w.minStoredWh + EPS_WH < power.reserveWh) {
    return false;
  }

  return power.basis !== 'battery-only' || batteryOnlyEndWh(power) + EPS_WH >= power.reserveWh;
}
