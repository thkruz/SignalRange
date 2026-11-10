/**
 * @file bench-layout - Where each device and port sits in the drawn bench scene
 * @description Pure geometry, no DOM. Devices are placed in columns that follow the signal
 * (antennas, then feed line parts, then radios, then computers and audio) with power and test
 * gear along the bottom. Ports sit on the device outline: RF on the left, data/USB/audio on the
 * right, DC along the bottom. Coax, DC leads and adapters put their two ends left and right.
 * Units are scene units; the scene sets its viewBox from the returned bounds.
 */

import type { HamDeviceKind, PortDef } from '../../ham-types';

export interface DeviceBox {
  id: string;
  kind: HamDeviceKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PortSpot {
  deviceId: string;
  portId: string;
  x: number;
  y: number;
  /** Which edge of the device the port is on; cables leave in this direction */
  side: 'left' | 'right' | 'top' | 'bottom';
}

export interface BenchLayout {
  boxes: Map<string, DeviceBox>;
  ports: Map<string, PortSpot>;
  /** Content bounds with padding, for the scene viewBox */
  bounds: { x: number; y: number; w: number; h: number };
}

export const portKey = (deviceId: string, portId: string): string => `${deviceId}::${portId}`;

/** Drawn size of each kind, scene units */
const SIZE: Partial<Record<HamDeviceKind, [number, number]>> = {
  antenna: [70, 150],
  coax: [150, 46],
  'dc-lead': [130, 40],
  adapter: [64, 26],
  duplexer: [90, 54],
  sdr: [120, 40],
  handheld: [58, 130],
  'dmr-handheld': [58, 130],
  mobile: [170, 64],
  'hf-rig': [190, 84],
  laptop: [200, 140],
  'audio-interface': [100, 44],
  headphones: [70, 60],
  'power-supply': [130, 80],
  battery: [110, 70],
  charger: [90, 56],
  multimeter: [80, 116],
  'swr-meter': [100, 70],
  analyzer: [110, 80],
  'dummy-load': [100, 46],
  'cal-load': [70, 36],
  'circuit-board': [130, 80],
  'noise-source': [80, 50],
};

/** Bottom shelf kinds: power and test gear that is not part of the signal chain */
const SHELF_KINDS: readonly HamDeviceKind[] = ['power-supply', 'battery', 'charger', 'dc-lead', 'multimeter', 'circuit-board'];
/** Where the signal starts: columns count cable hops from one of these */
const SOURCE_KINDS: readonly HamDeviceKind[] = ['antenna', 'dummy-load', 'cal-load', 'noise-source'];
/** Computers and audio sit at the far right */
const SINK_KINDS: readonly HamDeviceKind[] = ['laptop', 'audio-interface', 'headphones'];
/** Fallback column for a device no configured cable links to a source */
const KIND_RANK: Partial<Record<HamDeviceKind, number>> = { coax: 1, adapter: 2, duplexer: 2, 'swr-meter': 2, analyzer: 3 };

const COL_GAP = 34;
const ROW_GAP = 34;
const SHELF_GAP = 70;

export function deviceSize(kind: HamDeviceKind): [number, number] {
  return SIZE[kind] ?? [100, 56];
}

const TWO_ENDED: readonly HamDeviceKind[] = ['coax', 'dc-lead', 'adapter', 'duplexer'];

function sideOf(kind: HamDeviceKind, port: PortDef, index: number): PortSpot['side'] {
  if (kind === 'coax' || kind === 'dc-lead' || kind === 'adapter' || kind === 'duplexer') return index === 0 ? 'left' : 'right';
  if (kind === 'antenna') return 'right';
  // Computers and audio boxes sit right of the chain, so their sockets face it
  if (kind === 'laptop' || kind === 'audio-interface') return 'left';
  if (kind === 'handheld' || kind === 'dmr-handheld') {
    if (port.role === 'rf') return 'top';
    if (port.role === 'dc-in') return 'bottom';

    return 'right';
  }
  switch (port.role) {
    case 'rf':
      return 'left';
    case 'dc-in':
    case 'dc-out':
      return 'bottom';
    case 'probe':
    case 'test-point':
      return 'bottom';
    default:
      return 'right';
  }
}

function placePorts(box: DeviceBox, ports: readonly PortDef[], out: Map<string, PortSpot>, facing: (portId: string) => 'left' | 'right' | undefined = () => undefined): void {
  const bySide = new Map<PortSpot['side'], PortDef[]>();
  const twoEnded = TWO_ENDED.includes(box.kind) && ports.length === 2;
  // A cable or adapter turns so each end faces the device it is plugged into
  const flip = twoEnded && (facing(ports[0].id) === 'right' || facing(ports[1].id) === 'left');
  ports.forEach((p, i) => {
    const s = sideOf(box.kind, p, flip ? 1 - i : i);
    bySide.set(s, [...(bySide.get(s) ?? []), p]);
  });
  for (const [side, list] of bySide) {
    list.forEach((p, i) => {
      const t = (i + 1) / (list.length + 1);
      let x = box.x;
      let y = box.y;
      if (side === 'left' || side === 'right') {
        x = side === 'left' ? box.x : box.x + box.w;
        y = box.y + box.h * t;
        if (box.kind === 'antenna') {
          // The feed connector is on the feed box at the base of the mast (see bench-shapes), so
          // the coax visibly plugs into the antenna instead of floating beside it
          x = box.x + box.w / 2 + (side === 'left' ? -9 : 9);
          y = box.y + box.h - 19 + 8 * (t - 0.5);
        }
      } else {
        x = box.x + box.w * t;
        y = side === 'top' ? box.y : box.y + box.h;
      }
      out.set(portKey(box.id, p.id), { deviceId: box.id, portId: p.id, x, y, side });
    });
  }
}

/**
 * Lay out the devices visible at this location.
 * Columns follow the configured cabling (cable hops from the antenna), so the drawing does not
 * jump around when the player unplugs something. Computers go right, power and test gear on a
 * shelf underneath. Returns the content bounds so the scene can zoom to fit.
 * @param devices visible devices in config order
 * @param portsOf the port list for a device
 * @param links the scenario's starting connections (stable across play)
 */
export function layoutBench(
  devices: readonly { id: string; kind: HamDeviceKind }[],
  portsOf: (id: string) => readonly PortDef[],
  links: readonly { a: { deviceId: string; portId: string }; b: { deviceId: string; portId: string } }[] = []
): BenchLayout {
  const boxes = new Map<string, DeviceBox>();
  const ports = new Map<string, PortSpot>();
  const main = devices.filter((d) => !SHELF_KINDS.includes(d.kind));
  const shelf = devices.filter((d) => SHELF_KINDS.includes(d.kind));
  const kindOf = new Map(main.map((d) => [d.id, d.kind]));
  const adj = new Map<string, string[]>();
  for (const l of links) {
    if (!kindOf.has(l.a.deviceId) || !kindOf.has(l.b.deviceId)) continue;
    adj.set(l.a.deviceId, [...(adj.get(l.a.deviceId) ?? []), l.b.deviceId]);
    adj.set(l.b.deviceId, [...(adj.get(l.b.deviceId) ?? []), l.a.deviceId]);
  }
  const rank = new Map<string, number>();
  const queue = main.filter((d) => SOURCE_KINDS.includes(d.kind)).map((d) => d.id);
  for (const id of queue) rank.set(id, 0);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (SINK_KINDS.includes(kindOf.get(id) ?? 'sdr')) continue;
    for (const n of adj.get(id) ?? []) {
      if (rank.has(n)) continue;
      rank.set(n, (rank.get(id) ?? 0) + 1);
      queue.push(n);
    }
  }
  for (const d of main) if (!rank.has(d.id) && !SINK_KINDS.includes(d.kind)) rank.set(d.id, KIND_RANK[d.kind] ?? 3);
  const chainMax = Math.max(0, ...main.filter((d) => !SINK_KINDS.includes(d.kind)).map((d) => rank.get(d.id) ?? 0));
  for (const d of main) if (SINK_KINDS.includes(d.kind)) rank.set(d.id, chainMax + 1);
  const ranks = [...new Set(rank.values())].sort((p, q) => p - q);
  const columns = ranks.map((r) => main.filter((d) => rank.get(d.id) === r));
  // Column widths from the widest device; each column centred on the tallest one
  const colW = columns.map((list) => Math.max(...list.map((d) => deviceSize(d.kind)[0])));
  const colH = columns.map((list) => list.reduce((t, d) => t + deviceSize(d.kind)[1], 0) + Math.max(0, list.length - 1) * ROW_GAP);
  const mainH = Math.max(0, ...colH);
  let x = 0;
  columns.forEach((list, c) => {
    let y = (mainH - colH[c]) / 2;
    for (const d of list) {
      const [w, hgt] = deviceSize(d.kind);
      boxes.set(d.id, { id: d.id, kind: d.kind, x: x + (colW[c] - w) / 2, y, w, h: hgt });
      y += hgt + ROW_GAP;
    }
    x += colW[c] + COL_GAP;
  });
  const mainW = Math.max(0, x - COL_GAP);
  // Shelf: rows under the main area, wrapping at the main width (at least 700)
  const shelfW = Math.max(mainW, 700);
  let sx = 0;
  let sy = mainH + (main.length > 0 ? SHELF_GAP : 0);
  let rowH = 0;
  for (const d of shelf) {
    const [w, hgt] = deviceSize(d.kind);
    if (sx > 0 && sx + w > shelfW) {
      sx = 0;
      sy += rowH + ROW_GAP;
      rowH = 0;
    }
    boxes.set(d.id, { id: d.id, kind: d.kind, x: sx, y: sy, w, h: hgt });
    sx += w + COL_GAP;
    rowH = Math.max(rowH, hgt);
  }
  for (const box of boxes.values()) {
    const facing = (portId: string): 'left' | 'right' | undefined => {
      const link = links.find((l) => (l.a.deviceId === box.id && l.a.portId === portId) || (l.b.deviceId === box.id && l.b.portId === portId));
      if (!link) return undefined;
      const other = boxes.get(link.a.deviceId === box.id && link.a.portId === portId ? link.b.deviceId : link.a.deviceId);
      if (!other || other.id === box.id) return undefined;
      return other.x + other.w / 2 < box.x + box.w / 2 ? 'left' : 'right';
    };
    placePorts(box, portsOf(box.id), ports, facing);
  }

  return { boxes, ports, bounds: fitBounds(boxes) };
}

/** Content bounds plus padding, never smaller than a minimum so a two-device bench is not blown up */
function fitBounds(boxes: Map<string, DeviceBox>): BenchLayout['bounds'] {
  let minX = 0;
  let minY = 0;
  let maxX = 1;
  let maxY = 1;
  for (const b of boxes.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h + 18);
  }
  const pad = 36;
  // Extra room left and right for connector labels
  const w = Math.max(maxX - minX + pad * 2 + 80, 640);
  const h = Math.max(maxY - minY + pad * 2, 300);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Cubic path between two port spots, leaving each port along its edge direction */
function cableControls(a: PortSpot, b: PortSpot): [number, number, number, number] {
  const pull = Math.max(30, Math.min(140, Math.hypot(b.x - a.x, b.y - a.y) * 0.45));
  const dir = (s: PortSpot['side']): [number, number] => (s === 'left' ? [-1, 0] : s === 'right' ? [1, 0] : s === 'top' ? [0, -1] : [0, 1]);
  const [ax, ay] = dir(a.side);
  const [bx, by] = dir(b.side);

  return [a.x + ax * pull, a.y + ay * pull, b.x + bx * pull, b.y + by * pull];
}

/** Point halfway along the cable drawn by cablePath, where its grab handle sits */
export function cableMid(a: PortSpot, b: PortSpot): { x: number; y: number } {
  const [c1x, c1y, c2x, c2y] = cableControls(a, b);

  return { x: (a.x + 3 * c1x + 3 * c2x + b.x) / 8, y: (a.y + 3 * c1y + 3 * c2y + b.y) / 8 };
}

export function cablePath(a: PortSpot, b: PortSpot): string {
  const [c1x, c1y, c2x, c2y] = cableControls(a, b);
  const c1 = `${c1x.toFixed(1)},${c1y.toFixed(1)}`;
  const c2 = `${c2x.toFixed(1)},${c2y.toFixed(1)}`;

  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${c1} ${c2} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}
