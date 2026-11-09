/**
 * @file site-types - Shapes for the site view and the part close-ups
 * @description All coordinates are image-relative, 0..1 from the top-left of
 * the painted image, so the SVG overlays scale with the picture. The data that
 * uses these types lives in campaigns/frontline/site-hotspots.ts.
 */

import type { UiVerb } from './plant-ui-helpers';

export type SiteShape = { kind: 'rect'; x: number; y: number; w: number; h: number } | { kind: 'path'; points: Array<[number, number]>; width: number };

/** One close-up per item: never group two items in one painting */
export type CloseupId =
  | 'router'
  | 'modem'
  | 'laptop'
  | 'power-station'
  | 'power-strip'
  | 'flap-in'
  | 'skylink-dish'
  | 'vsat-dish'
  | 'lnb'
  | 'generator'
  | 'flap-out'
  | 'skylink-cable'
  | 'vsat-ifl';

export type SiteView = 'inside' | 'outside';

/** One clickable object in a site view; opens a close-up (or switches view) and shows a status pip */
export interface SiteHotspot {
  id: string;
  /** Which painted view the hotspot belongs to */
  view: SiteView;
  label: string;
  shapes: SiteShape[];
  /** Pip and label anchor */
  anchor: [number, number];
  /** Close-up to open on click; absent for a door */
  closeup?: CloseupId;
  /** A door: switches to the other view (opening or closing a trip) instead of opening a close-up */
  action?: 'go-outside' | 'go-inside';
  /** Plant parts whose supply state drives the pip */
  partIds: string[];
  /** Extra plant ids (cables) that must exist on the site for the hotspot to show */
  requires?: string[];
  /** Belongs to the tent (door, flap): never shown on a forward site */
  tentOnly?: boolean;
  /** The close-up art is not painted yet: the hotspot shows (pip and label) but opens nothing */
  pendingArt?: boolean;
}

/** A transparent webp laid over a site scene, shown while every `requires` plant id exists on the site (inventory-driven) */
export interface SceneLayer {
  id: string;
  /** Path under /assets */
  file: string;
  /** Image-relative [x, y, w, h] */
  bbox: [number, number, number, number];
  requires: string[];
}

/** A part drawn as a selectable region in a close-up (snow, power cycle, swap, measure supply) */
export interface CloseupRegion {
  id: string;
  /** Plant part id */
  target: string;
  label: string;
  shape: SiteShape;
  /** Opens the SkyLink app instead of selecting (the laptop) */
  opensApp?: boolean;
  /** Verbs and tools this region offers; omitted means everything that applies to the target */
  affordances?: Array<UiVerb | 'multimeter' | 'cable-tester'>;
}

/** A connector probe point */
export interface CloseupProbe {
  id: string;
  /** Plant connector id */
  target: string;
  label: string;
  x: number;
  y: number;
}

/** A cable drawn as a polyline from its `from` end (t = 0) to its `to` end (t = 1) */
export interface CloseupCable {
  /** Plant cable id */
  target: string;
  label: string;
  points: Array<[number, number]>;
}

/** When a painted fault layer is physically present (the paint is the evidence, found or not) */
export type LayerPresence =
  | { type: 'connector'; target: string; fault: 'corrosion' | 'moisture'; min: number }
  | { type: 'cable'; targets: string[]; kinds: Array<'nick' | 'pinch' | 'crush' | 'water'> }
  | { type: 'part-fault'; target: string; fault: 'snow' | 'net' }
  | { type: 'unlit'; target: string };

/** A transparent webp laid over a close-up; `bbox` is image-relative [x, y, w, h] of the cropped layer */
export interface CloseupLayer {
  id: string;
  closeup: CloseupId;
  /** Path under /assets */
  file: string;
  /** Variant stacked on the snow base (snow-on-dish and net layers) */
  snowFile?: string;
  bbox: [number, number, number, number];
  present: LayerPresence;
  /** Evidence drawn once the matching fact is revealed; `text` is keyed by damage kind for cables */
  callout?: { fact: string; at: [number, number]; text: string | Record<string, string> };
}

export interface CloseupDef {
  id: CloseupId;
  title: string;
  /** Path under /assets */
  image: string;
  /** Image width / height */
  aspect: number;
  regions: CloseupRegion[];
  probes: CloseupProbe[];
  cables: CloseupCable[];
  /** Forward-site art: camp weather paintings and fault layers never apply */
  forward?: boolean;
}
