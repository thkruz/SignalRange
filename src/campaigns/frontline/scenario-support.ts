import type { Condition } from '@app/objectives/objective-types';
import { applySiteInventory } from '@app/physical/site-inventory';
import type { ScenarioData } from '@app/ScenarioData';
import type { SimulationSettings } from '@app/scenario-manager';
import { frontlineGroundStation } from './ground-stations';
import { frontlinePlantConfig } from './plant-config';
import { eurosat9eSatellite } from './satellites';

/** A concrete implementation gap, linked to the training objectives it prevents. */
export interface FrontlineMechanicTodo {
  id: string;
  objectiveIds: string[];
  requirement: string;
  acceptanceCriteria: string[];
}

/** Authoring metadata remains next to the scenario; the engine reads ScenarioData. */
export interface FrontlineScenarioData extends ScenarioData {
  mechanicTodos: FrontlineMechanicTodo[];
}

/**
 * An unsupported practical assessment must never award completion. Keep this
 * gate until its named TODO has a real condition evaluator and verification.
 * A knowledge quiz or the always-true service-continuity placeholder cannot
 * establish that a workload, resource reserve, or repair verification passed.
 */
/** Package F: account battery energy and fuel over each workload run's own window (opt-in per scenario) */
export function recordRunPower(plant: { workloads?: { recordPower?: boolean } }): void {
  if (plant.workloads) {
    plant.workloads.recordPower = true;
  }
}

export function pendingMechanic(todoId: string, description: string): Condition {
  return {
    id: `pending:${todoId}`,
    type: 'custom',
    description,
    params: { evaluator: () => false },
    mustMaintain: true,
  };
}

const SKYLINK_PARTS = ['generator', 'power-station', 'power-strip', 'skylink-router', 'skylink-dish', 'laptop'];
const EUROSAT_PARTS = ['vsat-modem', 'vsat-dish', 'vsat-lnb'];

/** Forward kit: S9-S10 SkyLink only; the EuroSat terminal is delivered in S11 and shown through S16 */
export function forwardInventory(scenarioNumber: number): string[] {
  return scenarioNumber >= 11 ? [...SKYLINK_PARTS, ...EUROSAT_PARTS] : [...SKYLINK_PARTS];
}

/** Independent mutable equipment per scenario; satellite roster follows existing campaigns. */
export function createFrontlineSettings(scenarioNumber: number): SimulationSettings {
  if (!Number.isInteger(scenarioNumber) || scenarioNumber < 1 || scenarioNumber > 16) {
    throw new RangeError('Frontline scenario number must be between 1 and 16.');
  }
  const forward = scenarioNumber >= 9;
  const station = structuredClone(frontlineGroundStation);
  station.name = forward ? 'Rautala Forward Post' : 'Kivilahti Training Camp';
  const physicalPlant = structuredClone(frontlinePlantConfig);
  physicalPlant.tripLimit = 3;
  physicalPlant.site = { mode: forward ? 'forward' : 'camp', ...(forward ? { inventory: forwardInventory(scenarioNumber) } : {}) };
  const sitePlant = applySiteInventory(physicalPlant);
  return {
    isSync: true,
    groundStations: [station],
    satellites: [eurosat9eSatellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: `2027-06-${String(14 + scenarioNumber).padStart(2, '0')}`,
    scenarioStartWallTime: '10:00:00',
    physicalPlant: sitePlant,
    workingDocument: {
      title: `${forward ? 'Rautala' : 'Kivilahti'} Service Record — Exercise ${scenarioNumber}`,
      description: 'Separate current observations, conclusions, actions, verification results, and unresolved limitations.',
    },
  };
}
