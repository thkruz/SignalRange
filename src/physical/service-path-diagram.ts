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
  /** Real connections between this lane's nodes, from the plant (supply, cables, plugs) and the authored service path; never from fault truth */
  edges: Array<[string, string]>;
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
export const ROW_GAP = 8;
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

/** Undirected plant connections as sorted-pair keys: supply links, cable ends (via their plug when one exists) and plugs */
function plantEdges(cfg: PlantConfig): Array<[string, string]> {
  const out = new Map<string, [string, string]>();
  const link = (a: string, b: string): void => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    out.set(`${x}|${y}`, [x, y]);
  };
  const connectors = cfg.connectors ?? [];
  /** A cable meets a part directly, or through the plug that terminates it at that part */
  const cableEnd = (cableId: string, partId: string): void => {
    const plugs = connectors.filter((c) => c.cableId === cableId && c.partId === partId);
    if (plugs.length === 0) link(cableId, partId);
    for (const plug of plugs) {
      link(plug.id, cableId);
      link(plug.id, partId);
    }
  };
  for (const part of cfg.parts) {
    if (!part.poweredBy) continue;
    if (part.viaCable) {
      cableEnd(part.viaCable, part.poweredBy);
      cableEnd(part.viaCable, part.id);
    } else link(part.poweredBy, part.id);
  }
  for (const cable of cfg.cables ?? []) {
    cableEnd(cable.id, cable.from);
    cableEnd(cable.id, cable.to);
  }
  for (const c of connectors) {
    if (c.feeds && c.partId) link(c.partId, c.feeds);
    if (c.cableId && !c.partId) link(c.id, c.cableId);
  }

  return [...out.values()];
}

/** Within each column, walk the connected boxes in chain order so joined boxes sit on adjacent rows (a wire never skips a box) */
function chainOrder(nodes: DiagramNode[], edges: Array<[string, string]>): DiagramNode[] {
  const out: DiagramNode[] = [];
  for (const seg of DIAGRAM_SEGMENTS) {
    const col = nodes.filter((n) => n.segment === seg);
    const inCol = new Set(col.map((n) => n.id));
    const same = (id: string): string[] => edges.flatMap(([a, b]) => (a === id && inCol.has(b) ? [b] : b === id && inCol.has(a) ? [a] : []));
    const crosses = (id: string): boolean => edges.some(([a, b]) => (a === id && !inCol.has(b)) || (b === id && !inCol.has(a)));
    const starts = [...col].sort((x, y) => Number(same(x.id).length > 1) - Number(same(y.id).length > 1) || Number(crosses(y.id)) - Number(crosses(x.id)));
    const done = new Set<string>();
    for (const start of starts) {
      let cur: DiagramNode | undefined = start;
      while (cur && !done.has(cur.id)) {
        done.add(cur.id);
        out.push(cur);
        const next: string | undefined = same(cur.id).find((id) => !done.has(id));
        cur = col.find((n) => n.id === next);
      }
    }
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
    for (const id of path.linkTargetIds ?? []) add(id, label(id), 'link');
    for (const start of [path.terminalPartId, ...path.localPartIds]) {
      for (const hop of powerChain(cfg, start)) add(hop.id, label(hop.id), 'power');
    }
    add(`account:${path.accountId}`, `Account ${path.accountId}`, 'provider');
    add(`provider:${path.providerId}`, humanize(path.providerId), 'provider');
    for (const id of path.endpointIds ?? []) add(`endpoint:${id}`, humanize(id), 'remote');
    if (path.remoteLeg) add(`remote-leg:${path.id}`, `${path.remoteLeg.kind === 'fiber' ? 'Fiber' : 'Radio'} leg`, 'remote');

    nodes.sort((a, b) => DIAGRAM_SEGMENTS.indexOf(a.segment) - DIAGRAM_SEGMENTS.indexOf(b.segment));
    const ids = new Set(nodes.map((n) => n.id));
    const edges: Array<[string, string]> = plantEdges(cfg).filter(([a, b]) => ids.has(a) && ids.has(b));
    // The authored path order: terminal, account, provider, then what the provider reaches
    const authored: Array<[string, string]> = [
      [path.terminalPartId, `account:${path.accountId}`],
      [`account:${path.accountId}`, `provider:${path.providerId}`],
      ...(path.endpointIds ?? []).map((id): [string, string] => [`provider:${path.providerId}`, `endpoint:${id}`]),
      ...(path.remoteLeg ? ([[`provider:${path.providerId}`, `remote-leg:${path.id}`]] as Array<[string, string]>) : []),
    ];
    edges.push(...authored.filter(([a, b]) => ids.has(a) && ids.has(b)));
    lanes.push({ serviceId: path.id, label: path.label, nodes: chainOrder(nodes, edges), edges });
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
