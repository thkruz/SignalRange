/**
 * @file site-hotspots - Hotspot and probe-point coordinates for the Frontline site view
 * @description ONE FILE TO EDIT when a hotspot sits in the wrong place. Every
 * coordinate is image-relative (0..1 from the top-left of the painted image).
 * A `rect` is { x, y, w, h }; a `path` is a polyline with a stroke `width`
 * (a fraction of the image width). Images are the R2-synced webp files under
 * public/assets/campaigns/frontline/physical/.
 */

import type { CloseupDef, CloseupId, SiteHotspot, SiteView } from '@app/physical/ui/site-types';

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

export const SITE_HOTSPOTS: SiteHotspot[] = [
  // ------------------------------------------------------------ inside
  {
    id: 'site-in-router',
    view: 'inside',
    label: 'SpaceY router',
    shapes: rect(0.205, 0.479, 0.07, 0.063),
    anchor: [0.235, 0.4689],
    closeup: 'router',
    partIds: ['spacey-router'],
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
    id: 'site-out-spacey-dish',
    view: 'outside',
    label: 'SpaceY dish',
    shapes: rect(0.128, 0.36, 0.074, 0.216),
    anchor: [0.165, 0.468],
    closeup: 'spacey-dish',
    partIds: ['spacey-dish'],
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
  },
  {
    id: 'site-out-spacey-cable',
    view: 'outside',
    label: 'SpaceY cable',
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
    closeup: 'spacey-cable',
    partIds: [],
  },
  {
    id: 'site-out-door',
    view: 'outside',
    label: 'Go inside',
    shapes: rect(0.465, 0.36, 0.1, 0.324),
    anchor: [0.515, 0.522],
    action: 'go-inside',
    partIds: [],
  },
];

/** The hotspots of one view */
export const hotspotsForView = (view: SiteView): SiteHotspot[] => SITE_HOTSPOTS.filter((h) => h.view === view);

export const CLOSEUPS: Record<CloseupId, CloseupDef> = {
  router: {
    id: 'router',
    title: 'SpaceY router',
    image: `${DIR}/cu-router.webp`,
    aspect: 3 / 2,
    regions: [
      { id: 'cu-router', target: 'spacey-router', label: 'SpaceY router', shape: { kind: 'rect', x: 0.39, y: 0.34, w: 0.4, h: 0.15 } },
      { id: 'cu-router-dc', target: 'router:dc', label: 'DC input', shape: { kind: 'rect', x: 0.735, y: 0.5, w: 0.075, h: 0.09 } },
    ],
    probes: [{ id: 'cu-router-cable', target: 'spacey-cable:router', label: 'SpaceY cable plug at the router', x: 0.455, y: 0.6 }],
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
    regions: [{ id: 'cu-laptop', target: 'laptop', label: 'Laptop (opens the SpaceY app)', shape: { kind: 'rect', x: 0.15, y: 0.1, w: 0.68, h: 0.78 }, opensApp: true }],
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
      { id: 'cu-strip-sock-router', target: 'strip:router', label: 'Strip socket (router)', shape: { kind: 'rect', x: 0.27, y: 0.5, w: 0.15, h: 0.14 } },
      { id: 'cu-strip-sock-modem', target: 'strip:modem', label: 'Strip socket (modem)', shape: { kind: 'rect', x: 0.44, y: 0.5, w: 0.15, h: 0.14 } },
      { id: 'cu-strip-plug', target: 'strip:in', label: 'Strip input plug', shape: { kind: 'rect', x: 0.6, y: 0.6, w: 0.07, h: 0.15 } },
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
        target: 'spacey-cable',
        label: 'SpaceY cable (25 m power + data)',
        points: [
          [0.575, 1.0],
          [0.555, 0.85],
          [0.5, 0.7],
        ],
      },
    ],
  },
  'spacey-dish': {
    id: 'spacey-dish',
    title: 'SpaceY dish',
    image: `${DIR}/cu-spacey-dish.webp`,
    aspect: 3 / 2,
    regions: [{ id: 'cu-spacey-panel', target: 'spacey-dish', label: 'SpaceY panel', shape: { kind: 'rect', x: 0.25, y: 0.12, w: 0.5, h: 0.6 } }],
    probes: [{ id: 'cu-spacey-plug', target: 'spacey-cable:dish', label: 'SpaceY cable plug at the mast base', x: 0.515, y: 0.755 }],
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
      { id: 'cu-generator', target: 'generator', label: 'Generator', shape: { kind: 'rect', x: 0.2, y: 0.3, w: 0.44, h: 0.65 }, affordances: ['inspect', 'feel', 'powerCycle'] },
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
        target: 'spacey-cable',
        label: 'SpaceY cable (25 m power + data)',
        points: [
          [0.42, 0.575],
          [0.27, 0.572],
          [0.12, 0.545],
          [0.0, 0.525],
        ],
      },
    ],
  },
  'spacey-cable': {
    id: 'spacey-cable',
    title: 'SpaceY cable run',
    image: `${DIR}/cu-spacey-cable.webp`,
    aspect: 3 / 2,
    regions: [],
    probes: [],
    cables: [
      {
        target: 'spacey-cable',
        label: 'SpaceY cable (25 m power + data)',
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
