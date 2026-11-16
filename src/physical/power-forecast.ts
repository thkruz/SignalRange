/**
 * Power forecast projection (M03). Pure math over a snapshot the plant manager builds:
 * no manager state, no clock, no randomness. It steps one second at a time exactly the way the
 * plant's own resource drain does, so a preview agrees with what the live plant would do.
 */

import type { PowerForecast } from './physical-plant-types';

/** One part in the supply tree (every part, including batteries and generators) */
export interface ForecastNode {
  id: string;
  parentId?: string;
  /** Draw in the target mode once started */
  steadyW: number;
  /** Draw while starting */
  startupW: number;
  /** Seconds of startup still to run from t = 0 (0 = not starting) */
  startRemainingS: number;
  /** True when the part has modes and the mode at the end of the horizon serves traffic */
  servesTraffic?: boolean;
}

export interface ForecastBattery {
  id: string;
  socWh: number;
  capacityWh: number;
  /** Watts into the battery while its source is up (0 when it has no source) */
  chargeW: number;
  /** Generator whose output gates the charge; null = always available (or never, if chargeW is 0) */
  sourceId: string | null;
}

export interface ForecastGenerator {
  id: string;
  running: boolean;
  startRemainingS: number;
  fuelL: number;
  ratedW: number;
  burnLPerHour: number;
}

export interface ForecastInput {
  nodes: ForecastNode[];
  batteries: ForecastBattery[];
  generators: ForecastGenerator[];
  basis: 'battery-only' | 'with-generator';
  horizonS: number;
  reserveWh: number | null;
  /** Longest time any changed part needs to reach its mode */
  startupCostS: number;
}

const MAX_DEPTH = 16;

function loadBelow(id: string, children: Map<string, ForecastNode[]>, k: number, depth = 0): number {
  if (depth > MAX_DEPTH) {
    return 0;
  }
  let total = 0;
  for (const child of children.get(id) ?? []) {
    total += (k < child.startRemainingS ? child.startupW : child.steadyW) + loadBelow(child.id, children, k, depth + 1);
  }

  return total;
}

/** Step the plant's resource drain over the horizon and report the end state. Never mutates the input. */
export function projectPower(input: ForecastInput): PowerForecast {
  const children = new Map<string, ForecastNode[]>();
  for (const node of input.nodes) {
    if (node.parentId !== undefined) {
      const list = children.get(node.parentId) ?? [];
      list.push(node);
      children.set(node.parentId, list);
    }
  }
  const withGenerator = input.basis === 'with-generator';
  const soc = new Map(input.batteries.map((b) => [b.id, b.socWh]));
  const fuel = new Map(input.generators.map((g) => [g.id, g.fuelL]));
  const gens = new Map(input.generators.map((g) => [g.id, g]));
  let fuelUsed = 0;
  let secondsToReserve: number | null = null;
  const total = (): number => [...soc.values()].reduce((sum, v) => sum + v, 0);
  if (input.reserveWh !== null && total() < input.reserveWh) {
    secondsToReserve = 0;
  }

  for (let k = 1; k <= input.horizonS; k++) {
    if (withGenerator) {
      for (const gen of input.generators) {
        const left = fuel.get(gen.id) ?? 0;
        if (gen.running && k >= gen.startRemainingS && left > 0) {
          const load = Math.min(1, loadBelow(gen.id, children, k) / gen.ratedW);
          const burn = Math.min(left, (gen.burnLPerHour * (0.3 + 0.7 * load)) / 3600);
          fuel.set(gen.id, left - burn);
          fuelUsed += burn;
        }
      }
    }
    for (const bat of input.batteries) {
      let charging = 0;
      if (withGenerator) {
        if (bat.sourceId === null) {
          charging = bat.chargeW;
        } else {
          // The plant solves after each drain, so the source state seen at step k is that of k - 1
          const gen = gens.get(bat.sourceId);
          if (gen?.running && k - 1 >= gen.startRemainingS && (fuel.get(gen.id) ?? 0) > 0) {
            charging = bat.chargeW;
          }
        }
      }
      const next = (soc.get(bat.id) ?? 0) + (charging - loadBelow(bat.id, children, k)) / 3600;
      soc.set(bat.id, Math.min(bat.capacityWh, Math.max(0, next)));
    }
    if (secondsToReserve === null && input.reserveWh !== null && total() < input.reserveWh) {
      secondsToReserve = k;
    }
  }

  let startupWh = 0;
  for (const node of input.nodes) {
    const seconds = Math.min(node.startRemainingS, input.horizonS);
    startupWh += (Math.max(0, node.startupW - node.steadyW) * Math.max(0, seconds - 1)) / 3600;
  }
  const projectedSocWh = total();

  return {
    horizonS: input.horizonS,
    basis: input.basis,
    projectedSocWh,
    // The reserve must hold for the whole horizon, not only at its end
    meetsReserve: input.reserveWh === null || (projectedSocWh >= input.reserveWh && secondsToReserve === null),
    secondsToReserve,
    fuelUsedL: fuelUsed,
    startupCostS: input.startupCostS,
    startupWh,
    servicesAvailable: input.nodes.filter((n) => n.servesTraffic === true).map((n) => n.id),
  };
}
