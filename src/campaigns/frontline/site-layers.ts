/**
 * @file site-layers - Painted fault layers and weather variants for the Frontline close-ups
 * @description ONE FILE TO EDIT when a layer sits wrong. Layers are alpha webps cropped to
 * their bounding box; `bbox` is [x, y, w, h] image-relative (0..1) in the close-up, so the
 * UI places each layer exactly where it was painted (art-review/c6/wp14-layers.json holds
 * the pixel boxes). Files live in the R2-synced physical/ folder.
 */

import type { PlantWeather } from '@app/physical/physical-plant-types';
import type { CloseupDef, CloseupId, CloseupLayer, SiteView } from '@app/physical/ui/site-types';

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
    bbox: [0.3535, 0.8301, 0.2337, 0.1611],
    present: { type: 'cable', targets: ['skylink-cable'], kinds: ['nick', 'pinch', 'crush'] },
    callout: { fact: 'damage', at: [0.47, 0.91], text: DAMAGE_TEXT },
  },
  {
    id: 'vsat-ifl-damage',
    closeup: 'vsat-ifl',
    file: layerFile('vsat-ifl-cable-damage'),
    bbox: [0.2734, 0.6104, 0.2337, 0.2803],
    present: { type: 'cable', targets: ['vsat-ifl'], kinds: ['nick', 'pinch', 'crush'] },
    callout: { fact: 'damage', at: [0.39, 0.75], text: DAMAGE_TEXT },
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

/** The painting of a site view for the given weather (inside is never weathered) */
export const siteImageFor = (view: SiteView, base: string, weather: PlantWeather): string => {
  // Forward art (base is not the camp outside painting) has no weather paintings yet
  if (view !== 'outside' || weather === 'clear' || base !== SITE_IMAGES_OUTSIDE) {
    return base;
  }

  return SITE_OUTSIDE_WEATHER[weather] ?? base;
};

/** The painting of a close-up for the given weather; falls back to the original */
export const closeupImageFor = (def: CloseupDef, weather: PlantWeather): string =>
  weather === 'clear' || def.forward ? def.image : (CLOSEUP_WEATHER[def.id]?.[weather] ?? def.image);

/** Layers are painted for the camp art only: forward close-ups have none yet */
export const layersFor = (closeup: CloseupId, forward = false): CloseupLayer[] => (forward ? [] : CLOSEUP_LAYERS.filter((l) => l.closeup === closeup));
