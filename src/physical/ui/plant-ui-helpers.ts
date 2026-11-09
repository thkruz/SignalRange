/**
 * @file plant-ui-helpers - Shared read-side helpers for the physical-plant UI
 * @description Status pips, verb availability per target, time formatting and
 * the small bits of UI state the site tab, the close-up and the trainer share.
 * No DOM here: the adapters own rendering.
 */

import { FRONTLINE_STATION_ID } from '@app/campaigns/frontline/plant-config';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantFaultKind, PlantVerb, SkylinkStatus } from '@app/physical/physical-plant-types';
import { OFFERED_VERBS } from '@app/physical/plant-verb-rules';

export type PipStatus = 'ok' | 'warn' | 'bad';
export type PlantTargetType = 'connector' | 'cable' | 'part';
export type PlantTool = 'hand' | 'multimeter' | 'cable-tester';

/** Verbs a button can fire (the plant verbs a player performs) */
export type UiVerb = Exclude<PlantVerb, 'multimeter' | 'cable-tester' | 'returnInside' | 'goOutside' | 'spotted'>;

export const VERB_LABELS: Record<UiVerb, string> = {
  inspect: 'Inspect',
  wiggle: 'Wiggle',
  feel: 'Feel',
  reseat: 'Reseat',
  tighten: 'Tighten',
  seal: 'Seal',
  swap: 'Swap',
  powerCycle: 'Power cycle',
  refuel: 'Refuel',
  setMode: 'Start / stop',
  clearSnow: 'Clear snow',
  removeNet: 'Remove net',
  reroute: 'Reroute',
};

/** Shared UI state (module-level so the site tab, close-up and trainer agree) */
export const plantUiState = {
  /** Draw hidden fault state (seat depth, corrosion, damage) without observing it. Trainer and developer aid, off by default. */
  xray: false,
};

export function targetType(plant: PhysicalPlantManager, id: string): PlantTargetType | null {
  if (plant.getConnectorState(id)) {
    return 'connector';
  }
  if (plant.getCableState(id)) {
    return 'cable';
  }
  if (plant.getPartState(id)) {
    return 'part';
  }

  return null;
}

/** Verbs that apply to the target, per the rules table (the plant still decides what they do) */
export function verbsFor(plant: PhysicalPlantManager, id: string): UiVerb[] {
  const verbs = OFFERED_VERBS.filter((verb) => plant.verbApplies(verb, id)) as UiVerb[];
  // A generator with authored modes also offers its start/stop switch
  if (plant.verbApplies('setMode', id)) {
    verbs.push('setMode');
  }

  return verbs;
}

/** True when the tool can be used on the target, per the rules table. Hand always applies. */
export function toolAppliesTo(plant: PhysicalPlantManager, tool: PlantTool, id: string): boolean {
  return tool === 'hand' || plant.verbApplies(tool, id);
}

export function runVerb(plant: PhysicalPlantManager, verb: UiVerb, id: string) {
  switch (verb) {
    case 'inspect':
      return plant.inspect(id);
    case 'wiggle':
      return plant.wiggle(id);
    case 'feel':
      return plant.feel(id);
    case 'reseat':
      return plant.reseat(id);
    case 'tighten':
      return plant.tighten(id);
    case 'seal':
      return plant.seal(id);
    case 'swap':
      return plant.swap(id);
    case 'powerCycle':
      return plant.powerCycle(id);
    case 'refuel':
      return plant.refuel(id);
    case 'setMode':
      return plant.setPartMode(id, plant.getNextMode(id));
    case 'clearSnow':
      return plant.clearSnow(id);
    case 'removeNet':
      return plant.removeNet(id);
    case 'reroute':
      return plant.reroute(id);
  }
}

/** Observable status of one part: powered, rebooting or dark. Hidden faults never show here. */
export function partPip(plant: PhysicalPlantManager, partId: string): PipStatus {
  const state = plant.getPartState(partId);
  if (!state) {
    return 'ok';
  }
  if (partId === 'skylink-dish') {
    return skylinkPip(plant.skylinkStatus());
  }
  if (!state.powered) {
    return state.rebooting ? 'warn' : 'bad';
  }

  return 'ok';
}

export function skylinkPip(status: SkylinkStatus): PipStatus {
  if (status === 'online') {
    return 'ok';
  }

  return status === 'no-power' || status === 'thermal-shutdown' ? 'bad' : 'warn';
}

export function hotspotPip(plant: PhysicalPlantManager, partIds: string[]): PipStatus {
  let worst: PipStatus = 'ok';
  for (const id of partIds) {
    const pip = partPip(plant, id);
    if (pip === 'bad') {
      return 'bad';
    }
    if (pip === 'warn') {
      worst = 'warn';
    }
  }

  return worst;
}

/** Laptop indicator: internet is up when either path is up */
export function internetPaths(plant: PhysicalPlantManager): { skylink: boolean; vsat: boolean; up: boolean } {
  const skylinkStatus = plant.skylinkStatus();
  const skylink = skylinkStatus === 'online' || skylinkStatus === 'thermal-throttle';
  const vsat =
    plant.isPartPowered('vsat-modem') &&
    plant.isPartPowered('vsat-lnb') &&
    plant.isPartPowered('vsat-dish') &&
    !plant.isLinkDropped('vsat-ifl') &&
    plant.preLnaLossDb(FRONTLINE_STATION_ID) < VSAT_LOCK_LOSS_LIMIT_DB;

  return { skylink, vsat, up: skylink || vsat };
}

/** Pre-LNA loss above which the VSAT modem loses lock (engine: 6 dB breaks it, 2 dB does not) */
const VSAT_LOCK_LOSS_LIMIT_DB = 4;

export function formatSimTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatCost(seconds: number): string {
  if (seconds >= 120) {
    return `${Math.round(seconds / 60)} min`;
  }

  return `${Math.round(seconds)} s`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

export const SKYLINK_STATUS_TEXT: Record<SkylinkStatus, string> = {
  booting: 'Booting',
  online: 'Online',
  obstructed: 'Obstructed',
  searching: 'Searching',
  heating: 'Heating (snow melt)',
  'thermal-throttle': 'Thermal throttle',
  'thermal-shutdown': 'Thermal shutdown',
  sleeping: 'Sleeping',
  'no-location': 'Searching',
  'no-power': 'No power',
};

/** Fault kinds with the target type each applies to */
export const FAULT_KINDS: Array<{ kind: PlantFaultKind; target: PlantTargetType; label: string; partKinds?: string[]; cableMeters?: boolean }> = [
  { kind: 'partial-seat', target: 'connector', label: 'Partially seated connector' },
  { kind: 'loose-nut', target: 'connector', label: 'Loose nut' },
  { kind: 'unseated', target: 'connector', label: 'Unseated connector' },
  { kind: 'corrosion', target: 'connector', label: 'Corroded connector' },
  { kind: 'moisture', target: 'connector', label: 'Water in connector' },
  { kind: 'bent-pin', target: 'connector', label: 'Bent pin' },
  { kind: 'cable-nick', target: 'cable', label: 'Nicked cable', cableMeters: true },
  { kind: 'cable-pinch', target: 'cable', label: 'Pinched cable', cableMeters: true },
  { kind: 'cable-crush', target: 'cable', label: 'Crushed cable', cableMeters: true },
  { kind: 'cable-water', target: 'cable', label: 'Water in cable', cableMeters: true },
  { kind: 'generator-sag', target: 'part', label: 'Generator voltage sag', partKinds: ['generator'] },
  { kind: 'generator-noise', target: 'part', label: 'Generator inverter noise (RFI)', partKinds: ['generator'] },
  { kind: 'out-of-fuel', target: 'part', label: 'Out of fuel', partKinds: ['generator'] },
  { kind: 'battery-depleted', target: 'part', label: 'Battery depleted', partKinds: ['battery'] },
  { kind: 'brick-dead', target: 'part', label: 'Dead power brick', partKinds: ['router', 'modem', 'terminal', 'dish', 'client'] },
  { kind: 'snow', target: 'part', label: 'Snow on dish', partKinds: ['terminal', 'dish'] },
  { kind: 'net', target: 'part', label: 'Camouflage net over dish', partKinds: ['terminal', 'dish'] },
];

/** Valid targets for a fault kind in this plant */
export function validTargets(plant: PhysicalPlantManager, kind: PlantFaultKind): string[] {
  const def = FAULT_KINDS.find((k) => k.kind === kind);
  if (!def) {
    return [];
  }
  if (def.target === 'connector') {
    return plant.getConnectorIds().filter((id) => (kind === 'loose-nut' ? plant.verbApplies('tighten', id) : true));
  }
  if (def.target === 'cable') {
    return plant.getCableIds();
  }

  return plant
    .getPartIds()
    .filter((id) => def.partKinds?.includes(plant.getPartState(id)?.kind ?? ''))
    .filter((id) => (kind === 'snow' ? plant.verbApplies('clearSnow', id) : kind === 'net' ? plant.verbApplies('removeNet', id) : true));
}
