/**
 * @file site-layers - Painted fault layers and weather variants for the Frontline close-ups
 * @description ONE FILE TO EDIT when a layer sits wrong. Layers are alpha webps cropped to
 * their bounding box; `bbox` is [x, y, w, h] image-relative (0..1) in the close-up, so the
 * UI places each layer exactly where it was painted (art-review/c6/wp14-layers.json holds
 * the pixel boxes). Files live in the R2-synced physical/ folder.
 */

import type { PlantWeather } from '@app/physical/physical-plant-types';
import type { CloseupDef, CloseupId, CloseupLayer, SceneLayer, SiteView } from '@app/physical/ui/site-types';

const DIR = '/assets/campaigns/frontline/physical';
const layerFile = (name: string): string => `${DIR}/layer-${name}.webp`;

const connector = (id: string, closeup: CloseupId, target: string, fault: 'corrosion' | 'moisture', bbox: CloseupLayer['bbox'], text: string): CloseupLayer => ({
  id,
  closeup,
  file: layerFile(id),
  bbox,
  present: { type: 'connector', target, fault, min: 0.2 },
  callout: { fact: fault, at: [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2], text },
});

const DAMAGE_TEXT = { nick: 'Cut through the jacket', pinch: 'Jacket pinched flat', crush: 'Jacket crushed flat' };

export const CLOSEUP_LAYERS: CloseupLayer[] = [
  connector('router-corrosion', 'router', 'skylink-cable:router', 'corrosion', [0.3633, 0.4902, 0.1836, 0.2002], 'Dull crust at the pin edges'),
  connector('router-moisture', 'router', 'skylink-cable:router', 'moisture', [0.3633, 0.4902, 0.1836, 0.2002], 'Beads of water around the plug'),
  connector('modem-corrosion', 'modem', 'vsat-ifl:modem', 'corrosion', [0.6432, 0.46, 0.1641, 0.2109], 'Crusty deposit on the F connector'),
  connector('modem-moisture', 'modem', 'vsat-ifl:modem', 'moisture', [0.6432, 0.46, 0.1641, 0.2109], 'Water beaded on the F connector'),
  connector('skylink-dish-corrosion', 'skylink-dish', 'skylink-cable:dish', 'corrosion', [0.4336, 0.6299, 0.1836, 0.2207], 'Speckled crust on the collar and thread'),
  connector('skylink-dish-moisture', 'skylink-dish', 'skylink-cable:dish', 'moisture', [0.4336, 0.6299, 0.1836, 0.2207], 'Water beaded on the collar'),
  connector('lnb-corrosion', 'lnb', 'vsat-ifl:lnb', 'corrosion', [0.5534, 0.5098, 0.224, 0.3008], 'Crust on the connector under the boot'),
  connector('lnb-moisture', 'lnb', 'vsat-ifl:lnb', 'moisture', [0.5534, 0.5098, 0.224, 0.3008], 'Water pooled at the boot'),
  {
    id: 'flap-in-moisture',
    closeup: 'flap-in',
    file: layerFile('flap-in-moisture'),
    bbox: [0.3737, 0.5898, 0.2734, 0.4102],
    present: { type: 'cable', targets: ['skylink-cable', 'vsat-ifl'], kinds: ['water'] },
    callout: { fact: 'damage', at: [0.51, 0.8], text: 'Damp track along the jacket' },
  },
  {
    id: 'skylink-cable-damage',
    closeup: 'skylink-cable',
    file: layerFile('skylink-cable-cable-damage'),
    bbox: [0.3776, 0.8477, 0.1979, 0.0996],
    present: { type: 'cable', targets: ['skylink-cable'], kinds: ['nick', 'pinch', 'crush'] },
    callout: { fact: 'damage', at: [0.477, 0.884], text: DAMAGE_TEXT },
  },
  {
    id: 'vsat-ifl-damage',
    closeup: 'vsat-ifl',
    file: layerFile('vsat-ifl-cable-damage'),
    bbox: [0.2741, 0.6104, 0.0579, 0.1221],
    present: { type: 'cable', targets: ['vsat-ifl'], kinds: ['nick', 'pinch', 'crush'] },
    callout: { fact: 'damage', at: [0.301, 0.654], text: DAMAGE_TEXT },
  },
  {
    id: 'skylink-dish-snow',
    closeup: 'skylink-dish',
    file: layerFile('skylink-dish-snow'),
    snowFile: layerFile('skylink-dish-snow-on-snow'),
    bbox: [0.2135, 0.1299, 0.5833, 0.7012],
    present: { type: 'part-fault', target: 'skylink-dish', fault: 'snow' },
    callout: { fact: 'snow', at: [0.5, 0.45], text: 'Snow packed on the panel' },
  },
  {
    id: 'skylink-dish-net',
    closeup: 'skylink-dish',
    file: layerFile('skylink-dish-net-snagged'),
    snowFile: layerFile('skylink-dish-net-snagged-on-snow'),
    bbox: [0.1836, 0.1104, 0.6439, 0.7402],
    present: { type: 'part-fault', target: 'skylink-dish', fault: 'net' },
    callout: { fact: 'net', at: [0.5, 0.3], text: 'Net snagged across the panel' },
  },
  {
    id: 'vsat-dish-snow',
    closeup: 'vsat-dish',
    file: layerFile('vsat-dish-snow'),
    snowFile: layerFile('vsat-dish-snow-on-snow'),
    bbox: [0.3236, 0.04, 0.4134, 0.7402],
    present: { type: 'part-fault', target: 'vsat-dish', fault: 'snow' },
    callout: { fact: 'snow', at: [0.52, 0.35], text: 'Snow packed in the dish' },
  },
  {
    id: 'modem-leds-off',
    closeup: 'modem',
    file: layerFile('modem-leds-off'),
    bbox: [0.5234, 0.4805, 0.1536, 0.1699],
    present: { type: 'unlit', target: 'vsat-modem' },
  },
  {
    id: 'power-station-leds-off',
    closeup: 'power-station',
    file: layerFile('power-station-leds-off'),
    bbox: [0.5534, 0.4102, 0.1738, 0.2002],
    present: { type: 'unlit', target: 'power-station' },
  },
];

/** Forward-site layers (art-review/c6/forward/fw8, picks in PICKS-states.md); files are layer-fwd-<name>.webp. */
const fwdConnector = (
  name: string,
  closeup: CloseupId,
  target: string,
  fault: 'corrosion' | 'moisture',
  bbox: CloseupLayer['bbox'],
  text: string,
  onlyOn?: string
): CloseupLayer => ({
  ...connector(`fwd-${name}`, closeup, target, fault, bbox, text),
  ...(onlyOn ? { onlyOn } : {}),
});

/** The router close-up painting with the EuroSat modem fitted (the modem layers exist only there) */
export const FORWARD_ROUTER_EUROSAT_IMAGE = `${DIR}/cu-fwd-router-eurosat.webp`;

/**
 * One router layer serves both router paintings and one cable-damage layer both cable paintings (the art is identical
 * there). No power-station leds-off (the art is already dark) and no flap-in layer (no tent) at the forward site.
 */
export const FORWARD_CLOSEUP_LAYERS: CloseupLayer[] = [
  fwdConnector('router-corrosion', 'router', 'skylink-cable:router', 'corrosion', [0.4173, 0.5547, 0.0306, 0.04], 'Dull crust at the pin edges'),
  fwdConnector('router-moisture', 'router', 'skylink-cable:router', 'moisture', [0.3919, 0.5605, 0.0716, 0.0762], 'Beads of water around the plug'),
  fwdConnector('modem-corrosion', 'router', 'vsat-ifl:modem', 'corrosion', [0.849, 0.5605, 0.0599, 0.0586], 'Crusty deposit on the F connector', FORWARD_ROUTER_EUROSAT_IMAGE),
  fwdConnector('modem-moisture', 'router', 'vsat-ifl:modem', 'moisture', [0.8464, 0.5273, 0.0918, 0.1328], 'Water beaded on the F connector', FORWARD_ROUTER_EUROSAT_IMAGE),
  {
    id: 'fwd-modem-leds-off',
    closeup: 'router',
    file: layerFile('fwd-modem-leds-off'),
    bbox: [0.6152, 0.6123, 0.0951, 0.0752],
    present: { type: 'unlit', target: 'vsat-modem' },
    onlyOn: FORWARD_ROUTER_EUROSAT_IMAGE,
  },
  fwdConnector('dish-collar-corrosion', 'skylink-dish', 'skylink-cable:dish', 'corrosion', [0.4518, 0.5361, 0.1003, 0.1025], 'Speckled crust on the collar and thread'),
  fwdConnector('dish-collar-moisture', 'skylink-dish', 'skylink-cable:dish', 'moisture', [0.4362, 0.5322, 0.1309, 0.1523], 'Water beaded on the collar'),
  fwdConnector('lnb-corrosion', 'lnb', 'vsat-ifl:lnb', 'corrosion', [0.541, 0.6318, 0.069, 0.0977], 'Crust on the connector under the boot'),
  fwdConnector('lnb-moisture', 'lnb', 'vsat-ifl:lnb', 'moisture', [0.5267, 0.5654, 0.0996, 0.1738], 'Water pooled at the boot'),
  {
    id: 'fwd-skylink-cable-damage',
    closeup: 'skylink-cable',
    file: layerFile('fwd-skylink-cable-damage'),
    bbox: [0.235, 0.6777, 0.0618, 0.0713],
    present: { type: 'cable', targets: ['skylink-cable'], kinds: ['nick', 'pinch', 'crush'] },
    callout: { fact: 'damage', at: [0.284, 0.702], text: DAMAGE_TEXT },
  },
  {
    id: 'fwd-vsat-ifl-damage',
    closeup: 'vsat-ifl',
    file: layerFile('fwd-vsat-ifl-damage'),
    bbox: [0.2279, 0.5527, 0.0957, 0.209],
    present: { type: 'cable', targets: ['vsat-ifl'], kinds: ['nick', 'pinch', 'crush'] },
    callout: { fact: 'damage', at: [0.263, 0.63], text: DAMAGE_TEXT },
  },
  {
    id: 'fwd-skylink-dish-snow',
    closeup: 'skylink-dish',
    file: layerFile('fwd-skylink-dish-snow'),
    snowFile: layerFile('fwd-skylink-dish-snow-on-snow'),
    bbox: [0.2539, 0, 0.5117, 0.5186],
    present: { type: 'part-fault', target: 'skylink-dish', fault: 'snow' },
    callout: { fact: 'snow', at: [0.5, 0.25], text: 'Snow packed on the panel' },
  },
  {
    id: 'fwd-skylink-dish-net',
    closeup: 'skylink-dish',
    file: layerFile('fwd-skylink-dish-net'),
    snowFile: layerFile('fwd-skylink-dish-net-on-snow'),
    bbox: [0.2441, 0, 0.5312, 0.5332],
    present: { type: 'part-fault', target: 'skylink-dish', fault: 'net' },
    callout: { fact: 'net', at: [0.5, 0.2], text: 'Net snagged across the panel' },
  },
  {
    id: 'fwd-vsat-dish-snow',
    closeup: 'vsat-dish',
    file: layerFile('fwd-vsat-dish-snow'),
    snowFile: layerFile('fwd-vsat-dish-snow-on-snow'),
    bbox: [0.4004, 0, 0.4349, 0.457],
    present: { type: 'part-fault', target: 'vsat-dish', fault: 'snow' },
    callout: { fact: 'snow', at: [0.66, 0.2], text: 'Snow packed in the dish' },
  },
];

type WeatherFiles = { snow: string; wet?: string };

const variants = (name: string, wet = true): WeatherFiles => ({
  snow: `${DIR}/${name}-snow.webp`,
  ...(wet ? { wet: `${DIR}/${name}-wet.webp` } : {}),
});

const SITE_IMAGES_OUTSIDE = `${DIR}/site-outside.webp`;

export const SITE_OUTSIDE_WEATHER: WeatherFiles = variants('site-outside');

/** Outdoor close-ups with weather paintings; vsat-dish has no wet variant, so the original stays in the wet */
export const CLOSEUP_WEATHER: Partial<Record<CloseupId, WeatherFiles>> = {
  'skylink-dish': variants('cu-skylink-dish'),
  'vsat-dish': variants('cu-vsat-dish', false),
  lnb: variants('cu-lnb'),
  generator: variants('cu-generator'),
  'flap-out': variants('cu-flap-out'),
  'skylink-cable': variants('cu-skylink-cable'),
  'vsat-ifl': variants('cu-vsat-ifl'),
};

/** Forward close-up paintings with weather variants, keyed by the clear painting; the EuroSat dish has no wet one */
const FORWARD_CLOSEUP_WEATHER: Record<string, WeatherFiles> = Object.fromEntries([
  ...['skylink-dish', 'skylink-cable', 'skylink-cable-eurosat', 'generator', 'power-station', 'power-box', 'router', 'router-eurosat', 'laptop', 'lnb', 'vsat-ifl'].map(
    (n) => [`${DIR}/cu-fwd-${n}.webp`, variants(`cu-fwd-${n}`)] as const
  ),
  [`${DIR}/cu-fwd-vsat-dish.webp`, variants('cu-fwd-vsat-dish', false)] as const,
]);

const SITE_FORWARD = `${DIR}/site-forward.webp`;
export const SITE_FORWARD_WEATHER: WeatherFiles = variants('site-forward');

/** Weather variants of the forward scene layers (EuroSat gear), keyed by scene layer id */
export const FORWARD_SCENE_LAYER_WEATHER: Record<string, WeatherFiles> = {
  eurosat: variants('site-forward-eurosat'),
  'eurosat-modem': variants('site-forward-eurosat-modem'),
};

/** Every webp the forward weather and layer tables reference (tests check they exist on disk) */
export const forwardArtFiles = (): string[] => [
  ...Object.values(SITE_FORWARD_WEATHER),
  ...Object.values(FORWARD_SCENE_LAYER_WEATHER).flatMap((w) => Object.values(w)),
  ...Object.values(FORWARD_CLOSEUP_WEATHER).flatMap((w) => Object.values(w)),
  ...FORWARD_CLOSEUP_LAYERS.flatMap((l) => [l.file, ...(l.snowFile ? [l.snowFile] : [])]),
];

/** The painting of a site view for the given weather (inside is never weathered) */
export const siteImageFor = (view: SiteView, base: string, weather: PlantWeather): string => {
  if (view !== 'outside' || weather === 'clear') {
    return base;
  }
  if (base === SITE_FORWARD) {
    return SITE_FORWARD_WEATHER[weather] ?? base;
  }
  if (base !== SITE_IMAGES_OUTSIDE) {
    return base;
  }

  return SITE_OUTSIDE_WEATHER[weather] ?? base;
};

/** The file of a forward scene layer for the given weather (painted over the weathered scene) */
export const sceneLayerImageFor = (layer: SceneLayer, weather: PlantWeather): string =>
  weather === 'clear' ? layer.file : (FORWARD_SCENE_LAYER_WEATHER[layer.id]?.[weather] ?? layer.file);

/** The painting of a close-up for the given weather; falls back to the original */
export const closeupImageFor = (def: CloseupDef, weather: PlantWeather): string => {
  if (weather === 'clear') {
    return def.image;
  }

  return (def.forward ? FORWARD_CLOSEUP_WEATHER[def.image] : CLOSEUP_WEATHER[def.id])?.[weather] ?? def.image;
};

/** Layers of a close-up; forward close-ups use their own table. `image` is the painting shown (modem layers exist on the EuroSat router only). */
export const layersFor = (closeup: CloseupId, forward = false, image?: string): CloseupLayer[] =>
  (forward ? FORWARD_CLOSEUP_LAYERS : CLOSEUP_LAYERS).filter((l) => l.closeup === closeup && (!l.onlyOn || l.onlyOn === image));
