/**
 * @file bench-art - Painted equipment art for the C3 bench and close-up faceplates
 * @description Each entry names a cut-out webp under public/assets/campaigns/home-sdr/bench/ and
 * the regions of that picture that the UI draws over or makes clickable. Boxes are fractions of
 * the image (x, y, w, h in 0..1), so overlays scale with the image. The art has blank screens
 * and unlabelled keys; text, readouts, needles and hit areas are SVG/HTML drawn on top.
 */

import { getAssetUrl } from '@app/utils/asset-url';

export interface ArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EquipmentArt {
  /** URL of the cut-out picture */
  src: string;
  /** Pixel size of the picture, for the aspect ratio */
  width: number;
  height: number;
  /** Named regions: screen, knobs, keys, jacks, connectors */
  regions: Record<string, ArtBox>;
}

/** Site-relative folder of the art; the pictures are served from the assets host (R2) in production, so URLs go through getAssetUrl */
export const ART_PATH = '/assets/campaigns/home-sdr/bench/';
const ART_ROOT = getAssetUrl(ART_PATH);

const box = (x: number, y: number, w: number, h: number): ArtBox => ({ x, y, w, h });

/** Keyed by the art name; see ART_FOR_KIND for which device kinds use which picture */
export const EQUIPMENT_ART: Record<string, EquipmentArt> = {
  ht: {
    src: `${ART_ROOT}ht.webp`,
    width: 322,
    height: 720,
    regions: {
      screen: box(0.23, 0.3, 0.55, 0.183),
      keypad: box(0.18, 0.54, 0.64, 0.31),
      speaker: box(0.2, 0.86, 0.6, 0.11),
      antenna: box(0.18, 0, 0.17, 0.13),
      volumeKnob: box(0.58, 0.04, 0.16, 0.09),
      // The PTT is on the left side, out of view: drawn as a tab on the left edge
      ptt: box(0, 0.34, 0.09, 0.2),
    },
  },
  mobile: {
    src: `${ART_ROOT}mobile.webp`,
    width: 720,
    height: 274,
    regions: {
      screen: box(0.246, 0.431, 0.461, 0.252),
      mainKnob: box(0.74, 0.3, 0.18, 0.55),
      volumeKnob: box(0.05, 0.35, 0.09, 0.27),
      micJack: box(0.14, 0.68, 0.08, 0.24),
      keys: box(0.25, 0.74, 0.46, 0.13),
    },
  },
  hf: {
    src: `${ART_ROOT}hf.webp`,
    width: 720,
    height: 314,
    regions: {
      screen: box(0.128, 0.341, 0.594, 0.226),
      mainKnob: box(0.76, 0.48, 0.17, 0.46),
      smallKnobs: box(0.06, 0.72, 0.13, 0.17),
      keys: box(0.24, 0.74, 0.44, 0.14),
      topKeys: box(0.74, 0.3, 0.12, 0.16),
      jacks: box(0.58, 0.74, 0.1, 0.14),
    },
  },
  multimeter: {
    src: `${ART_ROOT}multimeter.webp`,
    width: 419,
    height: 720,
    regions: {
      screen: box(0.165, 0.111, 0.549, 0.199),
      dial: box(0.28, 0.37, 0.44, 0.24),
      jackCom: box(0.26, 0.72, 0.13, 0.08),
      jackV: box(0.46, 0.72, 0.13, 0.08),
      jackA: box(0.66, 0.7, 0.13, 0.1),
    },
  },
  swr: {
    src: `${ART_ROOT}swr.webp`,
    width: 720,
    height: 520,
    regions: {
      // Cream face; the painted needle is covered by a redrawn face with a live needle
      face: box(0.126, 0.169, 0.664, 0.454),
      pivot: box(0.43, 0.58, 0, 0),
      knob: box(0.41, 0.77, 0.11, 0.14),
      connectorTx: box(0.88, 0.36, 0.09, 0.12),
      connectorAnt: box(0.88, 0.5, 0.09, 0.12),
    },
  },
  analyzer: {
    src: `${ART_ROOT}analyzer.webp`,
    width: 396,
    height: 720,
    regions: {
      screen: box(0.217, 0.247, 0.583, 0.285),
      dpad: box(0.3, 0.6, 0.4, 0.22),
      keys: box(0.12, 0.87, 0.76, 0.08),
      connector: box(0.38, 0, 0.24, 0.1),
    },
  },
  psu: {
    src: `${ART_ROOT}psu.webp`,
    width: 720,
    height: 605,
    regions: {
      voltMeter: box(0.151, 0.413, 0.271, 0.169),
      ampMeter: box(0.569, 0.413, 0.274, 0.165),
      powerSwitch: box(0.19, 0.75, 0.08, 0.12),
      dcOutlets: box(0.38, 0.76, 0.26, 0.11),
      postNeg: box(0.67, 0.76, 0.09, 0.13),
      postPos: box(0.76, 0.75, 0.1, 0.16),
    },
  },
  sdr: {
    src: `${ART_ROOT}sdr.webp`,
    width: 720,
    height: 145,
    regions: {
      usb: box(0, 0.1, 0.17, 0.8),
      led: box(0.74, 0.42, 0.04, 0.2),
      sma: box(0.79, 0.15, 0.21, 0.7),
    },
  },
};

/**
 * Front-on faceplates for the held instruments (Phase 47, issue 307): the painted controls are wells the live
 * DOM controls sit on (see painted-face.ts). Same cut-out format as EQUIPMENT_ART, but a flat view, with the
 * screen, windows, knobs and keys left blank for the UI to draw on. Boxes are fractions of the picture.
 */
export const FACE_ART: Record<string, EquipmentArt> = {
  analyzer: {
    src: `${ART_ROOT}analyzer-face.webp`,
    width: 745,
    height: 1094,
    regions: {
      screen: box(0.148, 0.151, 0.708, 0.428),
      entry1: box(0.152, 0.617, 0.2, 0.086),
      entry2: box(0.4, 0.617, 0.2, 0.086),
      entry3: box(0.647, 0.617, 0.2, 0.086),
      keyLeft: box(0.144, 0.754, 0.173, 0.115),
      keyRight: box(0.687, 0.754, 0.173, 0.115),
      knob: box(0.357, 0.738, 0.288, 0.196),
    },
  },
  swr: {
    src: `${ART_ROOT}swr-face.webp`,
    width: 1100,
    height: 768,
    regions: {
      face: box(0.1, 0.105, 0.77, 0.54),
      window1: box(0.082, 0.734, 0.2, 0.137),
      window2: box(0.319, 0.734, 0.2, 0.137),
      window3: box(0.563, 0.734, 0.203, 0.137),
      key: box(0.808, 0.723, 0.1, 0.144),
    },
  },
  multimeter: {
    src: `${ART_ROOT}multimeter-face.webp`,
    width: 635,
    height: 1100,
    regions: {
      screen: box(0.181, 0.083, 0.638, 0.129),
      dial: box(0.25, 0.318, 0.5, 0.287),
      // The five printed dots round the dial: the function positions
      modeOff: box(0.124, 0.534, 0.14, 0.044),
      modeDcv: box(0.136, 0.305, 0.14, 0.044),
      modeDca: box(0.426, 0.246, 0.14, 0.044),
      modeOhm: box(0.707, 0.305, 0.14, 0.044),
      modeCont: box(0.734, 0.534, 0.14, 0.044),
      knobRed: box(0.164, 0.649, 0.124, 0.072),
      knobBlack: box(0.33, 0.649, 0.124, 0.072),
      knobSeries: box(0.496, 0.649, 0.124, 0.072),
      key: box(0.697, 0.63, 0.16, 0.092),
    },
  },
};

/** Device kinds (HamDeviceKind) drawn with painted art */
export const ART_FOR_KIND: Record<string, keyof typeof EQUIPMENT_ART> = {
  handheld: 'ht',
  'dmr-handheld': 'ht',
  mobile: 'mobile',
  'hf-rig': 'hf',
  multimeter: 'multimeter',
  'swr-meter': 'swr',
  analyzer: 'analyzer',
  'power-supply': 'psu',
  sdr: 'sdr',
};

export function artForKind(kind: string): EquipmentArt | null {
  const key = ART_FOR_KIND[kind];

  return key ? EQUIPMENT_ART[key] : null;
}
