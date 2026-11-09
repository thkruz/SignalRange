/**
 * @file closeup-evidence - What a close-up paints and what it calls out (WP14)
 * @description Fault layers show whenever the fault is physically present, found or
 * not: the paint is the evidence. A callout (ring plus a short label) is drawn only
 * after an observation revealed that fact. Seat faults on the power strip have no
 * paint, so their reveal is the callout alone.
 */

import { layersFor } from '@app/campaigns/frontline/site-layers';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantWeather } from '@app/physical/physical-plant-types';
import type { CloseupDef, CloseupLayer, SiteShape } from './site-types';

export interface ActiveLayer {
  layer: CloseupLayer;
  /** File to draw (the snow-base variant when the weather is snow) */
  src: string;
  /** Plant target the layer matched (the cable for cable layers) */
  target: string;
  /** Damage kind for cable layers */
  kind?: string;
}

export interface EvidenceCallout {
  key: string;
  /** Image-relative ring centre */
  x: number;
  y: number;
  text: string;
}

/** Layers of a close-up whose fault or state is present right now */
export function activeLayers(plant: PhysicalPlantManager, def: CloseupDef, weather: PlantWeather): ActiveLayer[] {
  const out: ActiveLayer[] = [];
  for (const layer of layersFor(def.id)) {
    const hit = matchLayer_(plant, layer);
    if (hit) {
      out.push({ layer, src: weather === 'snow' && layer.snowFile ? layer.snowFile : layer.file, ...hit });
    }
  }

  return out;
}

function matchLayer_(plant: PhysicalPlantManager, layer: CloseupLayer): { target: string; kind?: string } | null {
  const p = layer.present;
  switch (p.type) {
    case 'connector': {
      const state = plant.getConnectorState(p.target);

      return state && state[p.fault] >= p.min ? { target: p.target } : null;
    }
    case 'cable':
      for (const target of p.targets) {
        const kind = plant.getCableState(target)?.damage?.kind;
        if (kind && (p.kinds as string[]).includes(kind)) {
          return { target, kind };
        }
      }

      return null;
    case 'part-fault':
      return plant.isFaultActive(p.target, p.fault) ? { target: p.target } : null;
    case 'unlit':
      return plant.getPartState(p.target)?.lit === false ? { target: p.target } : null;
    default:
      return null;
  }
}

const centre_ = (shape: SiteShape): [number, number] => {
  if (shape.kind === 'rect') {
    return [shape.x + shape.w / 2, shape.y + shape.h / 2];
  }
  const n = shape.points.length || 1;

  return [shape.points.reduce((a, q) => a + q[0], 0) / n, shape.points.reduce((a, q) => a + q[1], 0) / n];
};

/** Callouts for every revealed fact of this close-up. `xray` (the trainer toggle) counts everything as revealed. */
export function evidenceCallouts(plant: PhysicalPlantManager, def: CloseupDef, weather: PlantWeather, xray: boolean): EvidenceCallout[] {
  const out: EvidenceCallout[] = [];
  const seen = (target: string, fact: string): boolean => xray || plant.isFactRevealed(target, fact);
  const covered = new Set<string>();

  for (const active of activeLayers(plant, def, weather)) {
    const c = active.layer.callout;
    if (!c) {
      continue;
    }
    covered.add(`${active.target}|${c.fact}`);
    if (seen(active.target, c.fact)) {
      const text = typeof c.text === 'string' ? c.text : (c.text[active.kind ?? ''] ?? '');
      if (text) {
        out.push({ key: `${active.layer.id}`, x: c.at[0], y: c.at[1], text });
      }
    }
  }

  const connectors: Array<{ id: string; target: string; at: [number, number] }> = [
    ...def.probes.map((q) => ({ id: q.id, target: q.target, at: [q.x, q.y] as [number, number] })),
    ...def.regions.filter((r) => plant.getConnectorState(r.target)).map((r) => ({ id: r.id, target: r.target, at: centre_(r.shape) })),
  ];
  for (const { id, target, at } of connectors) {
    const state = plant.getConnectorState(target);
    if (!state) {
      continue;
    }
    const add = (fact: string, text: string): void => {
      if (seen(target, fact)) {
        out.push({ key: `${id}:${fact}`, x: at[0], y: at[1], text });
      }
    };
    if (state.seated !== 'full') {
      add('seat', state.seated === 'out' ? 'Plug pulled out of its socket' : 'Plug not fully home');
    }
    if (state.bentPin) {
      add('bent-pin', 'A pin is bent over');
    }
    if (state.corrosion > 0 && !covered.has(`${target}|corrosion`)) {
      add('corrosion', 'Corrosion on the contacts');
    }
    if (state.moisture > 0 && !covered.has(`${target}|moisture`)) {
      add('moisture', 'Water at the connector');
    }
    if (state.sealed) {
      add('moisture', 'Sealed against water');
    }
  }

  return out;
}
