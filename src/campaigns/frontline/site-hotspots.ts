/**
 * @file site-hotspots - Hotspot and probe-point coordinates for the Frontline site view
 * @description ONE FILE TO EDIT when a hotspot sits in the wrong place. Every
 * coordinate is image-relative (0..1 from the top-left of the painted image).
 * A `rect` is { x, y, w, h }; a `path` is a polyline with a stroke `width`
 * (a fraction of the image width). Images are the R2-synced webp files under
 * public/assets/campaigns/frontline/physical/.
 */

import type { CloseupDef, CloseupId, SceneLayer, SiteHotspot, SiteView } from '@app/physical/ui/site-types';

const DIR = '/assets/campaigns/frontline/physical';

/** The painted image of each site view */
export const SITE_IMAGES: Record<SiteView, string> = {
  inside: `${DIR}/site-inside.webp`,
  outside: `${DIR}/site-outside.webp`,
};
/** Width / height of each cropped site image (sets the overlay viewBox) */
export const SITE_ASPECT: Record<SiteView, number> = {
  inside: 1792 / 1034,
  outside: 1792 / 877,
};

const rect = (x: number, y: number, w: number, h: number): SiteHotspot['shapes'] => [{ kind: 'rect', x, y, w, h }];

/** Silhouette mattes for the camp scenes (SAM 3 cut-outs of site-inside / site-outside; doors and the inside flap are plain rounded rects) */
const CAMP_MASKS: Record<string, SiteHotspot['mask']> = {
  'site-in-router': { file: `${DIR}/mask-camp-in-router.webp`, bbox: [0.2076, 0.4807, 0.0709, 0.06] },
  'site-in-vsat-modem': { file: `${DIR}/mask-camp-in-vsat-modem.webp`, bbox: [0.2762, 0.4574, 0.0681, 0.0609] },
  'site-in-laptop': { file: `${DIR}/mask-camp-in-laptop.webp`, bbox: [0.3421, 0.3191, 0.144, 0.1867] },
  'site-in-power-station': { file: `${DIR}/mask-camp-in-power-station.webp`, bbox: [0.2143, 0.6412, 0.1071, 0.2698] },
  'site-in-power-strip': { file: `${DIR}/mask-camp-in-power-strip.webp`, bbox: [0.3186, 0.8975, 0.0965, 0.0832] },
  'site-in-cable-entry': { file: `${DIR}/mask-camp-in-cable-entry.webp`, bbox: [0.2958, 0.2708, 0.0469, 0.175] },
  'site-in-door': { file: `${DIR}/mask-camp-in-door.webp`, bbox: [0.7188, 0.0251, 0.2031, 0.646] },
  'site-out-skylink-dish': { file: `${DIR}/mask-camp-out-skylink-dish.webp`, bbox: [0.1295, 0.3751, 0.0692, 0.1802] },
  'site-out-vsat-dish': { file: `${DIR}/mask-camp-out-vsat-dish.webp`, bbox: [0.25, 0.2611, 0.0725, 0.2406] },
  'site-out-vsat-lnb': { file: `${DIR}/mask-camp-out-vsat-lnb.webp`, bbox: [0.3036, 0.3273, 0.0151, 0.0319] },
  'site-out-generator': { file: `${DIR}/mask-camp-out-generator.webp`, bbox: [0.2539, 0.5382, 0.106, 0.1995] },
  'site-out-cable-entry': { file: `${DIR}/mask-camp-out-cable-entry.webp`, bbox: [0.3934, 0.4914, 0.0642, 0.1254] },
  'site-out-door': { file: `${DIR}/mask-camp-out-door.webp`, bbox: [0.4637, 0.358, 0.1027, 0.3295] },
  'site-out-skylink-cable': { file: `${DIR}/mask-camp-out-skylink-cable.webp`, bbox: [0.1814, 0.5701, 0.0513, 0.041] },
  'site-out-vsat-ifl': { file: `${DIR}/mask-camp-out-vsat-ifl.webp`, bbox: [0.2734, 0.3683, 0.0318, 0.1642] },
};

const SITE_HOTSPOTS_BASE: SiteHotspot[] = [
  // ------------------------------------------------------------ inside
  {
    id: 'site-in-router',
    view: 'inside',
    label: 'SkyLink router',
    shapes: rect(0.205, 0.479, 0.07, 0.063),
    anchor: [0.235, 0.4689],
    closeup: 'router',
    partIds: ['skylink-router'],
  },
  {
    id: 'site-in-vsat-modem',
    view: 'inside',
    label: 'VSAT modem',
    shapes: rect(0.277, 0.4561, 0.064, 0.063),
    anchor: [0.309, 0.4876],
    closeup: 'modem',
    partIds: ['vsat-modem'],
  },
  {
    id: 'site-in-laptop',
    view: 'inside',
    label: 'Laptop',
    shapes: rect(0.343, 0.3187, 0.145, 0.1889),
    anchor: [0.4155, 0.4132],
    closeup: 'laptop',
    partIds: ['laptop'],
  },
  {
    id: 'site-in-power-station',
    view: 'inside',
    label: 'Power station',
    shapes: rect(0.195, 0.645, 0.125, 0.2634),
    anchor: [0.2575, 0.7767],
    closeup: 'power-station',
    partIds: ['power-station'],
  },
  {
    id: 'site-in-power-strip',
    view: 'inside',
    label: 'Power strip',
    shapes: rect(0.32, 0.8912, 0.1, 0.0859),
    anchor: [0.37, 0.9082],
    closeup: 'power-strip',
    partIds: ['power-strip'],
  },
  {
    id: 'site-in-cable-entry',
    view: 'inside',
    label: 'Cable entry flap',
    shapes: rect(0.297, 0.2729, 0.044, 0.17),
    anchor: [0.319, 0.3579],
    closeup: 'flap-in',
    partIds: [],
  },
  {
    id: 'site-in-door',
    view: 'inside',
    label: 'Go outside',
    shapes: rect(0.72, 0.0267, 0.2, 0.6412),
    anchor: [0.82, 0.1739],
    action: 'go-outside',
    partIds: [],
  },
  // ----------------------------------------------------------- outside
  {
    id: 'site-out-skylink-dish',
    view: 'outside',
    label: 'SkyLink dish',
    shapes: rect(0.128, 0.36, 0.074, 0.216),
    anchor: [0.165, 0.468],
    closeup: 'skylink-dish',
    partIds: ['skylink-dish'],
  },
  {
    id: 'site-out-vsat-dish',
    view: 'outside',
    label: 'VSAT dish',
    // Cut around the LNB and the IFL that hangs in front of the reflector, so no two hotspots overlap
    shapes: [...rect(0.242, 0.2587, 0.085, 0.049), ...rect(0.242, 0.309, 0.028, 0.186), ...rect(0.312, 0.372, 0.015, 0.123)],
    anchor: [0.2845, 0.3769],
    closeup: 'vsat-dish',
    partIds: ['vsat-dish'],
  },
  {
    id: 'site-out-vsat-lnb',
    view: 'outside',
    label: 'VSAT LNB',
    shapes: rect(0.29, 0.31, 0.035, 0.06),
    anchor: [0.33, 0.3],
    closeup: 'lnb',
    partIds: ['vsat-lnb'],
  },
  {
    id: 'site-out-generator',
    view: 'outside',
    label: 'Generator',
    shapes: rect(0.234, 0.5422, 0.145, 0.2565),
    anchor: [0.27, 0.636],
    closeup: 'generator',
    partIds: ['generator'],
  },
  {
    id: 'site-out-cable-entry',
    view: 'outside',
    label: 'Cable entry flap',
    shapes: rect(0.392, 0.495, 0.068, 0.1148),
    anchor: [0.426, 0.5524],
    closeup: 'flap-out',
    partIds: [],
    tentOnly: true,
  },
  {
    id: 'site-out-vsat-ifl',
    view: 'outside',
    label: 'VSAT IFL cable',
    shapes: [
      {
        kind: 'path',
        points: [
          [0.297, 0.39],
          [0.285, 0.468],
          [0.283, 0.515],
        ],
        width: 0.016,
      },
    ],
    anchor: [0.3, 0.4356],
    closeup: 'vsat-ifl',
    partIds: [],
    requires: ['vsat-ifl'],
  },
  {
    id: 'site-out-skylink-cable',
    view: 'outside',
    label: 'SkyLink cable',
    shapes: [
      {
        kind: 'path',
        points: [
          [0.18, 0.596],
          [0.22, 0.605],
        ],
        width: 0.016,
      },
    ],
    anchor: [0.2, 0.585],
    closeup: 'skylink-cable',
    partIds: [],
    requires: ['skylink-cable'],
  },
  {
    id: 'site-out-door',
    view: 'outside',
    label: 'Go inside',
    shapes: rect(0.465, 0.36, 0.1, 0.324),
    anchor: [0.515, 0.522],
    action: 'go-inside',
    partIds: [],
    tentOnly: true,
  },
];

export const SITE_HOTSPOTS: SiteHotspot[] = SITE_HOTSPOTS_BASE.map((h) => (CAMP_MASKS[h.id] ? { ...h, mask: CAMP_MASKS[h.id] } : h));

/** The hotspots of one view */
export const hotspotsForView = (view: SiteView): SiteHotspot[] => SITE_HOTSPOTS.filter((h) => h.view === view);

/**
 * Forward site (M07, FW2): ONE wide outdoor view, painted by art-review/c6/forward/master-final-noeurosat-1536.png.
 * The webp is that master cropped to x 0..1536, y 208..960 (1536x752), so it fills the site stage like the camp
 * outside painting; forward hotspot pixels below are read off the full 1536x1024 master. The EuroSat gear (dish,
 * LNB, IFL, modem) is not in the base image: it is an inventory-driven scene layer (FORWARD_SCENE_LAYERS).
 */
export const FORWARD_SITE_IMAGE = `${DIR}/site-forward.webp`;
export const FORWARD_SITE_ASPECT = 1536 / 752;

/** Master-pixel row of the game crop's top edge, and the crop height */
export const FWD_Y0 = 208;
export const FWD_H = 752;
const fx = (x: number): number => Math.round((x / 1536) * 10000) / 10000;
const fy = (y: number): number => Math.round(((y - FWD_Y0) / FWD_H) * 10000) / 10000;
type PxBox = [number, number, number, number];
/** Image-relative [x, y, w, h] of a master pixel box */
const pxBbox = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] => [fx(x0), fy(y0), fx(x1) - fx(x0), fy(y1) - fy(y0)];
/** Rect from master-image pixels (x0, y0, x1, y1) */
const frect = (x0: number, y0: number, x1: number, y1: number): SiteHotspot['shapes'] => rect(fx(x0), fy(y0), fx(x1) - fx(x0), fy(y1) - fy(y0));
/** A pixel box minus holes, as a list of rects (hotspots must not overlap, so a box with a part cut out becomes several rects) */
const frectMinus = (box: PxBox, ...holes: PxBox[]): SiteHotspot['shapes'] => {
  let pieces: PxBox[] = [box];
  for (const [hx0, hy0, hx1, hy1] of holes) {
    const next: PxBox[] = [];
    for (const [x0, y0, x1, y1] of pieces) {
      if (hx0 >= x1 || hx1 <= x0 || hy0 >= y1 || hy1 <= y0) {
        next.push([x0, y0, x1, y1]);
        continue;
      }
      const cy0 = Math.max(y0, hy0);
      const cy1 = Math.min(y1, hy1);
      if (hy0 > y0) {
        next.push([x0, y0, x1, hy0]);
      }
      if (hy1 < y1) {
        next.push([x0, hy1, x1, y1]);
      }
      if (hx0 > x0) {
        next.push([x0, cy0, hx0, cy1]);
      }
      if (hx1 < x1) {
        next.push([hx1, cy0, x1, cy1]);
      }
    }
    pieces = next;
  }

  return pieces.flatMap(([x0, y0, x1, y1]) => frect(x0, y0, x1, y1));
};
/** Polyline from master-image pixels */
const fpath = (pts: Array<[number, number]>, width = 0.012): SiteHotspot['shapes'][number] => ({
  kind: 'path',
  points: pts.map(([x, y]) => [fx(x), fy(y)] as [number, number]),
  width,
});
/** Anchor above the top-centre of a master-image pixel box */
const fanchor = (x0: number, y0: number, x1: number): [number, number] => [fx((x0 + x1) / 2), fy(y0 - 8)];

// Measured boxes (FW1, master px). Trims are made so no two hotspots overlap (see art-review/c6/fw2-result.md).
const BATTERY: PxBox = [262, 612, 482, 888];
/** The jerry can has no plant part and no hotspot: its corner is cut out of the battery box */
const JERRY_CORNER: PxBox = [262, 785, 287, 888];
const SKYLINK_DISH: PxBox = [758, 536, 914, 808];
/** Room kept for the visible SkyLink cable run down the tripod (its stroke half-width is about 9 px) */
const CABLE_A_CARVE: PxBox = [743, 610, 792, 760];
const ROUTER_CASE: PxBox = [878, 703, 1052, 892];
const LAPTOP_BOX: PxBox = [584, 671, 740, 799];
const POWER_BOX: PxBox = [562, 800, 762, 928];
const VSAT_DISH: PxBox = [1246, 662, 1422, 948];
const VSAT_LNB: PxBox = [1282, 736, 1319, 774];
/** Room kept for the visible IFL run up the dish arm to the LNB */
const IFL_ARM_CARVE: PxBox = [1280, 774, 1332, 820];

/**
 * Forward scene hotspots (pixels of master-final). The EuroSat hotspots (dish, LNB, IFL) show only when those parts
 * are in the site inventory. No hotspots for the drone, the drone ground station, the jerry can, the spares crate or
 * the table (no plant parts). The modem has no scene hotspot (it is a region of the router close-up).
 */
/** Silhouette mattes for the hover glow (SAM 3 cut-outs of site-forward.webp, bbox image-relative); cable masks cover only the visible runs the hotspot paths trace */
const FORWARD_MASKS: Record<string, SiteHotspot['mask']> = {
  'site-fwd-generator': { file: `${DIR}/mask-forward-generator.webp`, bbox: [0.1569, 0.3644, 0.1139, 0.1809] },
  'site-fwd-power-station': { file: `${DIR}/mask-forward-power-station.webp`, bbox: [0.1693, 0.5386, 0.1458, 0.363] },
  'site-fwd-laptop': { file: `${DIR}/mask-forward-laptop.webp`, bbox: [0.3796, 0.613, 0.1035, 0.1755] },
  'site-fwd-power-box': { file: `${DIR}/mask-forward-power-box.webp`, bbox: [0.3652, 0.7354, 0.1309, 0.2221] },
  'site-fwd-router': { file: `${DIR}/mask-forward-router.webp`, bbox: [0.5716, 0.6582, 0.1126, 0.2473] },
  'site-fwd-skylink-dish': { file: `${DIR}/mask-forward-skylink-dish.webp`, bbox: [0.4941, 0.4362, 0.0996, 0.1888] },
  'site-fwd-vsat-dish': { file: `${DIR}/mask-forward-vsat-dish.webp`, bbox: [0.8203, 0.6077, 0.1003, 0.1848] },
  'site-fwd-vsat-lnb': { file: `${DIR}/mask-forward-vsat-lnb.webp`, bbox: [0.8346, 0.7035, 0.0273, 0.0572] },
  'site-fwd-skylink-cable': { file: `${DIR}/mask-forward-skylink-cable.webp`, bbox: [0.4844, 0.5439, 0.0905, 0.3271] },
  'site-fwd-vsat-ifl': { file: `${DIR}/mask-forward-vsat-ifl.webp`, bbox: [0.7728, 0.7593, 0.0885, 0.0971] },
};

const FORWARD_HOTSPOTS_BASE: SiteHotspot[] = [
  {
    id: 'site-fwd-generator',
    view: 'outside',
    label: 'Generator',
    shapes: frect(240, 485, 418, 600),
    anchor: fanchor(240, 485, 418),
    closeup: 'generator',
    partIds: ['generator'],
  },
  {
    id: 'site-fwd-power-station',
    view: 'outside',
    label: 'Power station',
    shapes: frectMinus(BATTERY, JERRY_CORNER),
    anchor: fanchor(262, 612, 482),
    closeup: 'power-station',
    partIds: ['power-station'],
  },
  {
    id: 'site-fwd-laptop',
    view: 'outside',
    label: 'Laptop',
    shapes: frect(...LAPTOP_BOX),
    anchor: fanchor(584, 671, 740),
    closeup: 'laptop',
    partIds: ['laptop'],
  },
  {
    id: 'site-fwd-power-box',
    view: 'outside',
    label: 'Power box',
    shapes: frect(...POWER_BOX),
    anchor: fanchor(562, 800, 762),
    closeup: 'power-strip',
    partIds: ['power-strip'],
  },
  {
    id: 'site-fwd-router',
    view: 'outside',
    label: 'SkyLink router case',
    shapes: frect(...ROUTER_CASE),
    anchor: fanchor(878, 703, 1052),
    closeup: 'router',
    partIds: ['skylink-router'],
  },
  {
    id: 'site-fwd-skylink-dish',
    view: 'outside',
    label: 'SkyLink terminal',
    shapes: frectMinus(SKYLINK_DISH, CABLE_A_CARVE, [876, ROUTER_CASE[1], ROUTER_CASE[2], ROUTER_CASE[3]], POWER_BOX),
    anchor: fanchor(758, 536, 914),
    closeup: 'skylink-dish',
    partIds: ['skylink-dish'],
  },
  {
    // Visible segments only: down the tripod, then (after the hidden stretch behind the laptop case and power box) from the box side to the router case
    id: 'site-fwd-skylink-cable',
    view: 'outside',
    label: 'SkyLink cable',
    shapes: [
      fpath([
        [778, 625],
        [780, 650],
        [770, 690],
        [756, 735],
        [752, 748],
      ]),
      fpath([
        [782, 836],
        [810, 846],
        [845, 844],
        [866, 834],
      ]),
    ],
    anchor: [fx(826), fy(862)],
    closeup: 'skylink-cable',
    partIds: [],
    requires: ['skylink-cable'],
  },
  {
    id: 'site-fwd-vsat-dish',
    view: 'outside',
    label: 'EuroSat dish',
    shapes: frectMinus(VSAT_DISH, VSAT_LNB, IFL_ARM_CARVE),
    anchor: fanchor(1246, 662, 1422),
    closeup: 'vsat-dish',
    partIds: ['vsat-dish'],
  },
  {
    id: 'site-fwd-vsat-lnb',
    view: 'outside',
    label: 'EuroSat LNB',
    shapes: frect(...VSAT_LNB),
    anchor: fanchor(1282, 736, 1319),
    closeup: 'lnb',
    partIds: ['vsat-lnb'],
  },
  {
    // Visible run only: from the crate's right edge to the tripod leg, and the arm up to the LNB (hidden behind the leg and hub between)
    id: 'site-fwd-vsat-ifl',
    view: 'outside',
    label: 'EuroSat IFL cable',
    shapes: [
      fpath([
        [1190, 820],
        [1200, 832],
        [1230, 844],
      ]),
      fpath([
        [1316, 806],
        [1306, 792],
        [1301, 785],
      ]),
    ],
    anchor: [fx(1215), fy(868)],
    closeup: 'vsat-ifl',
    partIds: [],
    requires: ['vsat-ifl'],
  },
];

export const FORWARD_HOTSPOTS: SiteHotspot[] = FORWARD_HOTSPOTS_BASE.map((h) => (FORWARD_MASKS[h.id] ? { ...h, mask: FORWARD_MASKS[h.id] } : h));

/**
 * Painted layers over the forward scene, shown by the site inventory (not by weather or faults). The base image has
 * no EuroSat gear; `requires` lists the plant ids that must exist. bbox is image-relative [x, y, w, h].
 */
export const FORWARD_SCENE_LAYERS: SceneLayer[] = [
  { id: 'eurosat', file: `${DIR}/site-forward-eurosat.webp`, bbox: pxBbox(1186, 654, 1428, 960), requires: ['vsat-dish'] },
  { id: 'eurosat-modem', file: `${DIR}/site-forward-eurosat-modem.webp`, bbox: pxBbox(970, 796, 1015, 841), requires: ['vsat-modem'] },
];

/** Scene layers whose gear is in the site inventory */
export const forwardSceneLayers = (has: (id: string) => boolean): SceneLayer[] => FORWARD_SCENE_LAYERS.filter((l) => l.requires.every(has));

/** True when every plant id the hotspot depends on exists on this site */
export const hotspotAvailable = (spot: SiteHotspot, has: (id: string) => boolean): boolean => [...spot.partIds, ...(spot.requires ?? [])].every(has);

/** Hotspots to draw: the forward scene has its own set; hotspots for missing equipment are hidden */
export const visibleHotspots = (scene: SiteView | 'forward', has: (id: string) => boolean): SiteHotspot[] => {
  const base = scene === 'forward' ? FORWARD_HOTSPOTS : hotspotsForView(scene);

  return base.filter((h) => hotspotAvailable(h, has));
};

export const CLOSEUPS: Record<CloseupId, CloseupDef> = {
  router: {
    id: 'router',
    title: 'SkyLink router',
    image: `${DIR}/cu-router.webp`,
    aspect: 3 / 2,
    regions: [
      { id: 'cu-router', target: 'skylink-router', label: 'SkyLink router', shape: { kind: 'rect', x: 0.39, y: 0.34, w: 0.4, h: 0.15 } },
      { id: 'cu-router-dc', target: 'router:dc', label: 'DC input', shape: { kind: 'rect', x: 0.735, y: 0.5, w: 0.075, h: 0.09 } },
    ],
    probes: [{ id: 'cu-router-cable', target: 'skylink-cable:router', label: 'SkyLink cable plug at the router', x: 0.455, y: 0.6 }],
    cables: [],
  },
  modem: {
    id: 'modem',
    title: 'VSAT modem',
    image: `${DIR}/cu-modem.webp`,
    aspect: 3 / 2,
    regions: [
      { id: 'cu-modem', target: 'vsat-modem', label: 'VSAT modem', shape: { kind: 'rect', x: 0.31, y: 0.38, w: 0.43, h: 0.16 } },
      { id: 'cu-modem-dc', target: 'modem:dc', label: 'DC input', shape: { kind: 'rect', x: 0.505, y: 0.55, w: 0.06, h: 0.11 } },
    ],
    probes: [{ id: 'cu-modem-ifl', target: 'vsat-ifl:modem', label: 'IFL F connector at the modem', x: 0.705, y: 0.575 }],
    cables: [],
  },
  laptop: {
    id: 'laptop',
    title: 'Laptop',
    image: `${DIR}/cu-laptop.webp`,
    aspect: 3 / 2,
    regions: [{ id: 'cu-laptop', target: 'laptop', label: 'Laptop (opens the SkyLink app)', shape: { kind: 'rect', x: 0.15, y: 0.1, w: 0.68, h: 0.78 }, opensApp: true }],
    probes: [],
    cables: [],
  },
  'power-station': {
    id: 'power-station',
    title: 'Power station',
    image: `${DIR}/cu-power-station.webp`,
    aspect: 3 / 2,
    regions: [
      { id: 'cu-power-station', target: 'power-station', label: 'Power station', shape: { kind: 'rect', x: 0.3, y: 0.08, w: 0.48, h: 0.35 } },
      { id: 'cu-ps-out', target: 'ps:ac-out', label: 'Output sockets', shape: { kind: 'rect', x: 0.53, y: 0.68, w: 0.2, h: 0.18 } },
      { id: 'cu-ps-dc', target: 'ps:dc-out', label: 'DC outputs', shape: { kind: 'rect', x: 0.53, y: 0.44, w: 0.21, h: 0.14 } },
      { id: 'cu-ps-in', target: 'ps:in', label: 'Input port', shape: { kind: 'rect', x: 0.6, y: 0.93, w: 0.08, h: 0.07 } },
    ],
    probes: [],
    cables: [],
  },
  'power-strip': {
    id: 'power-strip',
    title: 'Power strip',
    image: `${DIR}/cu-power-strip.webp`,
    aspect: 3 / 2,
    regions: [
      { id: 'cu-strip', target: 'power-strip', label: 'Power strip (fed by the power station)', shape: { kind: 'rect', x: 0.25, y: 0.75, w: 0.48, h: 0.09 } },
      { id: 'cu-strip-sock-router', target: 'strip:router', label: 'Router plug', shape: { kind: 'rect', x: 0.61, y: 0.53, w: 0.075, h: 0.16 } },
      { id: 'cu-strip-sock-modem', target: 'strip:modem', label: 'Modem plug', shape: { kind: 'rect', x: 0.49, y: 0.5, w: 0.065, h: 0.17 } },
      { id: 'cu-strip-plug', target: 'strip:in', label: 'Strip input cord', shape: { kind: 'rect', x: 0.02, y: 0.56, w: 0.21, h: 0.12 } },
    ],
    probes: [],
    cables: [],
  },
  'flap-in': {
    id: 'flap-in',
    title: 'Cable entry flap (inside)',
    image: `${DIR}/cu-flap-in.webp`,
    aspect: 3 / 2,
    regions: [],
    probes: [],
    cables: [
      {
        target: 'vsat-ifl',
        label: 'VSAT IFL (30 m coax)',
        points: [
          [0.505, 1.0],
          [0.495, 0.85],
          [0.47, 0.7],
        ],
      },
      {
        target: 'skylink-cable',
        label: 'SkyLink cable (25 m power + data)',
        points: [
          [0.575, 1.0],
          [0.555, 0.85],
          [0.5, 0.7],
        ],
      },
    ],
  },
  'skylink-dish': {
    id: 'skylink-dish',
    title: 'SkyLink dish',
    image: `${DIR}/cu-skylink-dish.webp`,
    aspect: 3 / 2,
    regions: [{ id: 'cu-skylink-panel', target: 'skylink-dish', label: 'SkyLink panel', shape: { kind: 'rect', x: 0.25, y: 0.12, w: 0.5, h: 0.6 } }],
    probes: [{ id: 'cu-skylink-plug', target: 'skylink-cable:dish', label: 'SkyLink cable plug at the mast base', x: 0.515, y: 0.755 }],
    cables: [],
  },
  'vsat-dish': {
    id: 'vsat-dish',
    title: 'VSAT dish',
    image: `${DIR}/cu-vsat-dish.webp`,
    aspect: 3 / 2,
    regions: [
      {
        id: 'cu-vsat-dish',
        target: 'vsat-dish',
        label: 'VSAT reflector',
        shape: { kind: 'rect', x: 0.35, y: 0.07, w: 0.36, h: 0.66 },
        affordances: ['inspect', 'clearSnow', 'removeNet'],
      },
      { id: 'cu-vsat-mount', target: 'vsat-dish', label: 'VSAT mount', shape: { kind: 'rect', x: 0.25, y: 0.74, w: 0.45, h: 0.21 }, affordances: ['inspect', 'swap'] },
    ],
    probes: [],
    cables: [],
  },
  lnb: {
    id: 'lnb',
    title: 'VSAT LNB',
    image: `${DIR}/cu-lnb.webp`,
    aspect: 3 / 2,
    regions: [{ id: 'cu-vsat-lnb', target: 'vsat-lnb', label: 'LNB', shape: { kind: 'rect', x: 0.5, y: 0.05, w: 0.35, h: 0.55 } }],
    probes: [
      { id: 'cu-feed-port', target: 'vsat-feed', label: 'Feed horn (ahead of the LNA)', x: 0.72, y: 0.22 },
      { id: 'cu-ifl-lnb', target: 'vsat-ifl:lnb', label: 'IFL connector under the boot', x: 0.655, y: 0.68 },
    ],
    cables: [],
  },
  generator: {
    id: 'generator',
    title: 'Generator',
    image: `${DIR}/cu-generator.webp`,
    aspect: 3 / 2,
    regions: [
      {
        id: 'cu-generator',
        target: 'generator',
        label: 'Generator',
        shape: { kind: 'rect', x: 0.2, y: 0.3, w: 0.44, h: 0.65 },
        affordances: ['inspect', 'feel', 'powerCycle', 'setMode'],
      },
      { id: 'cu-gen-fuel', target: 'generator', label: 'Fuel cap (refuel)', shape: { kind: 'rect', x: 0.44, y: 0.14, w: 0.1, h: 0.14 }, affordances: ['inspect', 'refuel'] },
      {
        id: 'cu-gen-sockets',
        target: 'generator:out',
        label: 'Output sockets',
        shape: { kind: 'rect', x: 0.64, y: 0.53, w: 0.06, h: 0.3 },
        affordances: ['inspect', 'multimeter', 'reseat'],
      },
    ],
    probes: [],
    cables: [],
  },
  'flap-out': {
    id: 'flap-out',
    title: 'Cable entry flap (outside)',
    image: `${DIR}/cu-flap-out.webp`,
    aspect: 3 / 2,
    regions: [],
    probes: [],
    cables: [
      {
        target: 'vsat-ifl',
        label: 'VSAT IFL (30 m coax)',
        points: [
          [0.58, 0.54],
          [0.47, 0.58],
          [0.4, 0.68],
          [0.33, 0.8],
          [0.18, 0.92],
          [0.0, 0.98],
        ],
      },
      {
        target: 'skylink-cable',
        label: 'SkyLink cable (25 m power + data)',
        points: [
          [0.42, 0.575],
          [0.27, 0.572],
          [0.12, 0.545],
          [0.0, 0.525],
        ],
      },
    ],
  },
  'skylink-cable': {
    id: 'skylink-cable',
    title: 'SkyLink cable run',
    image: `${DIR}/cu-skylink-cable.webp`,
    aspect: 3 / 2,
    regions: [],
    probes: [],
    cables: [
      {
        target: 'skylink-cable',
        label: 'SkyLink cable (25 m power + data)',
        points: [
          [0.88, 0.93],
          [0.5, 0.91],
          [0.33, 0.8],
          [0.26, 0.68],
          [0.25, 0.58],
          [0.2, 0.4],
        ],
      },
    ],
  },
  'vsat-ifl': {
    id: 'vsat-ifl',
    title: 'VSAT IFL cable run',
    image: `${DIR}/cu-vsat-ifl.webp`,
    aspect: 3 / 2,
    regions: [],
    probes: [],
    cables: [
      {
        target: 'vsat-ifl',
        label: 'VSAT IFL (30 m coax)',
        points: [
          [0.38, 1.0],
          [0.33, 0.88],
          [0.29, 0.7],
          [0.31, 0.5],
          [0.38, 0.3],
          [0.45, 0.15],
          [0.57, 0.0],
        ],
      },
    ],
  },
};

/** Forward close-up regions are boxes read off the 1536x1024 forward close-up images */
const cr = (x0: number, y0: number, x1: number, y1: number): { kind: 'rect'; x: number; y: number; w: number; h: number } => ({
  kind: 'rect',
  x: Math.round((x0 / 1536) * 1000) / 1000,
  y: Math.round((y0 / 1024) * 1000) / 1000,
  w: Math.round(((x1 - x0) / 1536) * 1000) / 1000,
  h: Math.round(((y1 - y0) / 1024) * 1000) / 1000,
});
const cp = (x: number, y: number): { x: number; y: number } => ({ x: Math.round((x / 1536) * 1000) / 1000, y: Math.round((y / 1024) * 1000) / 1000 });

/**
 * Forward-art close-ups (FS1, FW2). Same ids and targets as the camp CLOSEUPS; `forward: true` switches off every
 * camp weather painting and fault layer (they are painted for the camp images). The power-box close-up replaces
 * the camp power-strip one (id 'power-strip'). The router has two paintings (FORWARD_ROUTER_EUROSAT, picked by the
 * site inventory), the skylink-cable close-up is forward art. The EuroSat dish, LNB and IFL have forward art too (FW6).
 * Not here: flap-in/out (no tent) and modem (a region of the router close-up).
 * Regions never overlap: a body region stops short of its sub-regions (WP9 rule).
 */
const ROUTER_BASE_REGIONS: CloseupDef['regions'] = [
  { id: 'cu-router', target: 'skylink-router', label: 'SkyLink router', shape: cr(330, 285, 824, 560) },
  { id: 'cu-router-dc', target: 'router:dc', label: 'DC input', shape: cr(588, 565, 695, 630) },
];
const ROUTER_BASE_PROBES: CloseupDef['probes'] = [{ id: 'cu-router-cable', target: 'skylink-cable:router', label: 'SkyLink cable plug at the router wall', ...cp(217, 516) }];

/** Router case with the modem bay empty (S9, S10) */
const FORWARD_ROUTER: CloseupDef = {
  id: 'router',
  title: 'SkyLink router case',
  image: `${DIR}/cu-fwd-router.webp`,
  aspect: 3 / 2,
  forward: true,
  regions: ROUTER_BASE_REGIONS,
  probes: ROUTER_BASE_PROBES,
  cables: [],
};

/** Router case with the EuroSat modem fitted (S11 on): adds the modem, its DC lead and the IFL probe at the right wall bulkhead */
export const FORWARD_ROUTER_EUROSAT: CloseupDef = {
  ...FORWARD_ROUTER,
  title: 'SkyLink router and EuroSat modem case',
  image: `${DIR}/cu-fwd-router-eurosat.webp`,
  regions: [
    ...ROUTER_BASE_REGIONS,
    { id: 'cu-modem', target: 'vsat-modem', label: 'VSAT modem', shape: cr(920, 413, 1320, 635) },
    { id: 'cu-modem-dc', target: 'modem:dc', label: 'DC input', shape: cr(1105, 640, 1200, 735) },
  ],
  probes: [...ROUTER_BASE_PROBES, { id: 'cu-modem-ifl', target: 'vsat-ifl:modem', label: 'IFL F connector at the case wall', ...cp(1359, 598) }],
};

/** Cable run at the router case wall (router in the front pocket, modem pocket empty). The thin lead in the painting has no plant model, so it has no hotspot. */
const FORWARD_CABLE: CloseupDef = {
  id: 'skylink-cable',
  title: 'SkyLink cable run',
  image: `${DIR}/cu-fwd-skylink-cable.webp`,
  aspect: 3 / 2,
  forward: true,
  regions: [{ id: 'cu-skylink-cable', target: 'skylink-cable', label: 'SkyLink cable (25 m power + data)', shape: cr(0, 340, 760, 1024) }],
  probes: [
    { id: 'cu-cable-dish', target: 'skylink-cable:dish', label: 'Cable at the terminal end (leaves the frame)', ...cp(22, 938) },
    { id: 'cu-cable-router', target: 'skylink-cable:router', label: 'Cable connector at the case end', ...cp(692, 384) },
  ],
  cables: [],
};

/** Same wall with the EuroSat modem in the back pocket (S11 on); regions and probes are identical */
export const FORWARD_CABLE_EUROSAT: CloseupDef = { ...FORWARD_CABLE, image: `${DIR}/cu-fwd-skylink-cable-eurosat.webp` };

export const FORWARD_CLOSEUPS: Partial<Record<CloseupId, CloseupDef>> = {
  router: FORWARD_ROUTER,
  laptop: {
    id: 'laptop',
    title: 'Laptop',
    image: `${DIR}/cu-fwd-laptop.webp`,
    aspect: 3 / 2,
    forward: true,
    regions: [{ id: 'cu-laptop', target: 'laptop', label: 'Laptop (opens the SkyLink app)', shape: cr(395, 0, 1145, 700), opensApp: true }],
    probes: [],
    cables: [],
  },
  'power-strip': {
    id: 'power-strip',
    title: 'Power box',
    image: `${DIR}/cu-fwd-power-box.webp`,
    aspect: 3 / 2,
    forward: true,
    regions: [
      { id: 'cu-strip', target: 'power-strip', label: 'Power box (fed by the battery)', shape: cr(370, 160, 1160, 495) },
      { id: 'cu-strip-sock-router', target: 'strip:router', label: 'Router plug', shape: cr(545, 290, 655, 410) },
      { id: 'cu-strip-sock-modem', target: 'strip:modem', label: 'Free socket', shape: cr(835, 265, 950, 415) },
      { id: 'cu-strip-plug', target: 'strip:in', label: 'Box input cord', shape: cr(1225, 300, 1395, 480) },
    ],
    probes: [],
    cables: [],
  },
  'power-station': {
    id: 'power-station',
    title: 'Battery',
    image: `${DIR}/cu-fwd-power-station.webp`,
    aspect: 3 / 2,
    forward: true,
    regions: [
      { id: 'cu-power-station', target: 'power-station', label: 'Battery', shape: cr(230, 160, 1320, 580) },
      { id: 'cu-ps-out', target: 'ps:ac-out', label: 'Output sockets', shape: cr(600, 255, 890, 345) },
      { id: 'cu-ps-dc', target: 'ps:dc-out', label: 'DC outputs', shape: cr(915, 270, 1090, 345) },
      { id: 'cu-ps-in', target: 'ps:in', label: 'Input port', shape: cr(1125, 250, 1190, 320) },
    ],
    probes: [],
    cables: [],
  },
  generator: {
    id: 'generator',
    title: 'Generator',
    image: `${DIR}/cu-fwd-generator.webp`,
    aspect: 3 / 2,
    forward: true,
    regions: [
      { id: 'cu-generator', target: 'generator', label: 'Generator', shape: cr(150, 195, 1150, 930), affordances: ['inspect', 'feel', 'powerCycle', 'setMode'] },
      { id: 'cu-gen-fuel', target: 'generator', label: 'Fuel cap (refuel)', shape: cr(340, 215, 505, 290), affordances: ['inspect', 'refuel'] },
      { id: 'cu-gen-sockets', target: 'generator:out', label: 'Output sockets', shape: cr(395, 455, 660, 620), affordances: ['inspect', 'multimeter', 'reseat'] },
    ],
    probes: [],
    cables: [],
  },
  'skylink-dish': {
    id: 'skylink-dish',
    title: 'SkyLink terminal',
    image: `${DIR}/cu-fwd-skylink-dish.webp`,
    aspect: 3 / 2,
    forward: true,
    regions: [{ id: 'cu-skylink-panel', target: 'skylink-dish', label: 'SkyLink panel', shape: cr(400, 0, 1165, 520) }],
    probes: [{ id: 'cu-skylink-plug', target: 'skylink-cable:dish', label: 'SkyLink cable plug at the panel back edge', ...cp(452, 335) }],
    cables: [],
  },
  'vsat-dish': {
    id: 'vsat-dish',
    title: 'EuroSat dish',
    image: `${DIR}/cu-fwd-vsat-dish.webp`,
    aspect: 3 / 2,
    forward: true,
    regions: [
      { id: 'cu-vsat-dish', target: 'vsat-dish', label: 'VSAT reflector', shape: cr(615, 0, 1275, 490), affordances: ['inspect', 'clearSnow', 'removeNet'] },
      { id: 'cu-vsat-mount', target: 'vsat-dish', label: 'VSAT mount', shape: cr(560, 515, 1300, 900), affordances: ['inspect', 'swap'] },
    ],
    probes: [],
    cables: [],
  },
  lnb: {
    id: 'lnb',
    title: 'EuroSat LNB',
    image: `${DIR}/cu-fwd-lnb.webp`,
    aspect: 3 / 2,
    forward: true,
    regions: [{ id: 'cu-vsat-lnb', target: 'vsat-lnb', label: 'LNB', shape: cr(715, 110, 1080, 560) }],
    probes: [
      { id: 'cu-feed-port', target: 'vsat-feed', label: 'Feed horn (ahead of the LNA)', ...cp(890, 250) },
      { id: 'cu-ifl-lnb', target: 'vsat-ifl:lnb', label: 'IFL connector under the boot', ...cp(897, 655) },
    ],
    cables: [],
  },
  'vsat-ifl': {
    id: 'vsat-ifl',
    title: 'EuroSat IFL cable run',
    image: `${DIR}/cu-fwd-vsat-ifl.webp`,
    aspect: 3 / 2,
    forward: true,
    regions: [],
    probes: [],
    /** From the case wall bulkhead (t = 0) across the ground and up the tripod arm to the LNB (t = 1); the stretch up behind the hub follows the cable's loop */
    cables: [
      {
        target: 'vsat-ifl',
        label: 'VSAT IFL (30 m coax)',
        points: [
          [0.1, 0.41],
          [0.17, 0.47],
          [0.25, 0.64],
          [0.31, 0.75],
          [0.39, 0.79],
          [0.49, 0.78],
          [0.56, 0.72],
          [0.58, 0.59],
          [0.57, 0.47],
          [0.54, 0.35],
          [0.51, 0.25],
          [0.49, 0.14],
        ],
      },
    ],
  },
  'skylink-cable': FORWARD_CABLE,
};

/**
 * The close-up to show: forward art on a forward site where it exists, the camp one otherwise. `has` (plant ids on the
 * site) picks the router painting: with the EuroSat modem in the inventory the case shows the modem.
 */
export const closeupFor = (id: CloseupId, siteMode: 'camp' | 'forward', has: (id: string) => boolean = () => false): CloseupDef => {
  if (siteMode !== 'forward') {
    return CLOSEUPS[id];
  }
  if (id === 'router' && has('vsat-modem')) {
    return FORWARD_ROUTER_EUROSAT;
  }
  if (id === 'skylink-cable' && has('vsat-modem')) {
    return FORWARD_CABLE_EUROSAT;
  }

  return FORWARD_CLOSEUPS[id] ?? CLOSEUPS[id];
};
