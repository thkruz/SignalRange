/**
 * @file glow-filters - Shared SVG filters for the hotspot hover glow
 * @description `pp-glow` turns a silhouette matte (white object on transparent) into an outer glow that hugs the
 * outline plus a faint inner tint. `pp-soft` blurs a plain shape for hotspots that have no matte. Units are the
 * 1000-wide overlay viewBox of plant-svg.ts. Defined once per stage; the CSS in plant-ui.css fades them in.
 */

export const GLOW_COLOUR = '#ffd866';

export const GLOW_FILTERS_SVG =
  '<defs>' +
  '<filter id="pp-glow" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
  '<feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="grown"/>' +
  '<feGaussianBlur in="grown" stdDeviation="4" result="blur"/>' +
  `<feFlood flood-color="${GLOW_COLOUR}" flood-opacity="0.95" result="hue"/>` +
  '<feComposite in="hue" in2="blur" operator="in" result="halo"/>' +
  '<feComposite in="halo" in2="SourceAlpha" operator="out" result="outer"/>' +
  `<feFlood flood-color="${GLOW_COLOUR}" flood-opacity="0.2" result="tintHue"/>` +
  '<feComposite in="tintHue" in2="SourceAlpha" operator="in" result="tint"/>' +
  '<feMerge><feMergeNode in="outer"/><feMergeNode in="tint"/></feMerge>' +
  '</filter>' +
  '<filter id="pp-soft" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">' +
  '<feGaussianBlur stdDeviation="3.5"/>' +
  '</filter>' +
  '</defs>';
