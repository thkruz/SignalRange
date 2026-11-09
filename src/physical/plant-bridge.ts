/**
 * @file plant-bridge - Neutral read-only access to the active physical plant
 * @description The RF engine (OMT, LNB, antenna, receiver, front end) reads
 * the plant through these helpers. They import types only, so no engine module
 * pulls in the scenario, weather or simulation managers (no import cycles), and
 * every helper returns the neutral value (0 dB, powered) when no plant is set.
 * `PhysicalPlantService` sets and clears the active plant.
 */

import type { PhysicalPlantManager } from './physical-plant-manager';

/** Engine parts whose powered state the plant can cut */
export type EnginePowerRole = 'antenna' | 'lnb' | 'modem';

/** Default plant part per engine role (override with `PlantConfig.engineMap`) */
export const DEFAULT_ENGINE_MAP: Readonly<Record<EnginePowerRole, string>> = Object.freeze({
  antenna: 'vsat-dish',
  lnb: 'vsat-dish',
  modem: 'vsat-modem',
});

let active_: PhysicalPlantManager | null = null;

export function setActivePlant(plant: PhysicalPlantManager | null): void {
  active_ = plant;
}

export function getActivePlant(): PhysicalPlantManager | null {
  return active_;
}

/** Loss ahead of the LNA at a station, dB (0 without a plant) */
export function plantPreLnaLossDb(stationId: string | null): number {
  return active_ && stationId ? active_.preLnaLossDb(stationId) : 0;
}

/** Loss after the LNA at a station, dB (0 without a plant) */
export function plantPostLnaLossDb(stationId: string | null): number {
  return active_ && stationId ? active_.postLnaLossDb(stationId) : 0;
}

/** False while the plant part mapped to the engine role has no supply or is rebooting; true without a plant */
export function plantPowers(role: EnginePowerRole): boolean {
  if (!active_) {
    return true;
  }
  const partId = active_.engineMap[role];

  return active_.isPartPowered(partId);
}
