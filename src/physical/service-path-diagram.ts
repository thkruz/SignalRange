/**
 * M17 service-path diagram model (pure). One lane per authored service, five segment columns
 * (power, local, terminal link, provider, remote). Nodes are built from the DependencyGraph's
 * view of the plant plus the ServicePathConfig, never from fault truth. A node that appears in
 * more than one lane is a shared dependency.
 */

import type { PlantConfig } from '@app/physical/physical-plant-types';
import type { ServicePathConfig } from '@app/physical/service-types';

export type DiagramSegment = 'power' | 'local' | 'link' | 'provider' | 'remote';

export const DIAGRAM_SEGMENTS: readonly DiagramSegment[] = ['power', 'local', 'link', 'provider', 'remote'];

export const SEGMENT_LABEL: Record<DiagramSegment, string> = {
  power: 'Power chain',
  local: 'Local',
  link: 'Terminal link',
  provider: 'Provider',
  remote: 'Remote',
};

export interface DiagramNode {
  /** Plant id for parts and cables; `account:<id>`, `provider:<id>`, `endpoint:<id>`, `remote-leg:<service>` otherwise */
  id: string;
  label: string;
  segment: DiagramSegment;
  /** Service lanes this node appears in (length above one means shared) */
  serviceIds: string[];
}

export interface DiagramLane {
  serviceId: string;
  label: string;
  /** Nodes of this lane in column order, then top to bottom */
  nodes: DiagramNode[];
}

export interface ServicePathDiagram {
  lanes: DiagramLane[];
  /** Ids that appear in more than one lane */
  sharedIds: string[];
}

export interface DiagramPlacement {
  id: string;
  laneIndex: number;
  x: number;
  y: number;
}

export const NODE_W = 112;
export const NODE_H = 30;
const COL_GAP = 22;
const ROW_GAP = 8;
const LANE_HEAD = 22;
const LANE_PAD = 18;
export const COL_STEP = NODE_W + COL_GAP;

function humanize(id: string): string {
  const s = id.replace(/[-_]+/gu, ' ').trim();

  return s ? s[0].toUpperCase() + s.slice(1) : id;
}

/** Ids upstream of one part: its powered-by parts and the cables that carry power to each hop */
function powerChain(cfg: PlantConfig, startId: string): Array<{ id: string; kind: 'part' | 'cable' }> {
  const parts = new Map(cfg.parts.map((p) => [p.id, p]));
  const out: Array<{ id: string; kind: 'part' | 'cable' }> = [];
  const seen = new Set<string>();
  let current = parts.get(startId);
  for (let depth = 0; current && depth < 16; depth++) {
    if (current.viaCable && !seen.has(current.viaCable)) {
      seen.add(current.viaCable);
      out.push({ id: current.viaCable, kind: 'cable' });
    }
    const up = current.poweredBy ? parts.get(current.poweredBy) : undefined;
    if (up && !seen.has(up.id)) {
      seen.add(up.id);
      out.push({ id: up.id, kind: 'part' });
    }
    current = up;
  }

  return out;
}

/** Build the diagram for the services in `cfg.service` (empty lanes when none). `label` names plant ids. */
export function buildServicePathDiagram(cfg: PlantConfig, label: (id: string) => string = (id) => id): ServicePathDiagram {
  const paths: ServicePathConfig[] = cfg.service?.paths ?? [];
  const lanes: DiagramLane[] = [];
  for (const path of paths) {
    const nodes: DiagramNode[] = [];
    const seen = new Set<string>();
    const add = (id: string, text: string, segment: DiagramSegment): void => {
      if (seen.has(id)) return;
      seen.add(id);
      nodes.push({ id, label: text, segment, serviceIds: [path.id] });
    };
    for (const id of path.localPartIds) add(id, label(id), 'local');
    add(path.terminalPartId, label(path.terminalPartId), 'link');
    for (const start of [path.terminalPartId, ...path.localPartIds]) {
      for (const hop of powerChain(cfg, start)) add(hop.id, label(hop.id), 'power');
    }
    for (const id of path.linkTargetIds ?? []) add(id, label(id), 'link');
    add(`account:${path.accountId}`, `Account ${path.accountId}`, 'provider');
    add(`provider:${path.providerId}`, humanize(path.providerId), 'provider');
    for (const id of path.endpointIds ?? []) add(`endpoint:${id}`, humanize(id), 'remote');
    if (path.remoteLeg) add(`remote-leg:${path.id}`, `${path.remoteLeg.kind === 'fiber' ? 'Fiber' : 'Radio'} leg`, 'remote');

    nodes.sort((a, b) => DIAGRAM_SEGMENTS.indexOf(a.segment) - DIAGRAM_SEGMENTS.indexOf(b.segment));
    lanes.push({ serviceId: path.id, label: path.label, nodes });
  }

  const count = new Map<string, string[]>();
  for (const lane of lanes) {
    for (const n of lane.nodes) count.set(n.id, [...(count.get(n.id) ?? []), lane.serviceId]);
  }
  const sharedIds: string[] = [];
  for (const [id, services] of count) {
    if (services.length > 1) sharedIds.push(id);
  }
  for (const lane of lanes) {
    for (const n of lane.nodes) n.serviceIds = count.get(n.id) ?? [lane.serviceId];
  }

  return { lanes, sharedIds };
}

/** Lane height from its tallest column */
export function laneHeight(lane: DiagramLane): number {
  let tallest = 1;
  for (const seg of DIAGRAM_SEGMENTS) tallest = Math.max(tallest, lane.nodes.filter((n) => n.segment === seg).length);

  return LANE_HEAD + tallest * (NODE_H + ROW_GAP) + LANE_PAD;
}

/** Pixel placement for every node of every lane (viewBox units) */
export function layoutDiagram(diagram: ServicePathDiagram): { width: number; height: number; placements: DiagramPlacement[]; laneTops: number[] } {
  const placements: DiagramPlacement[] = [];
  const laneTops: number[] = [];
  let y = 24;
  diagram.lanes.forEach((lane, laneIndex) => {
    laneTops.push(y);
    for (const [col, seg] of DIAGRAM_SEGMENTS.entries()) {
      lane.nodes.filter((n) => n.segment === seg).forEach((n, row) => placements.push({ id: n.id, laneIndex, x: 8 + col * COL_STEP, y: y + LANE_HEAD + row * (NODE_H + ROW_GAP) }));
    }
    y += laneHeight(lane);
  });

  return { width: 16 + DIAGRAM_SEGMENTS.length * COL_STEP - COL_GAP, height: y, placements, laneTops };
}
