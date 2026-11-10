/**
 * @file bench-shapes - Geometric stand-in drawings for each kind of station equipment
 * @description Radios, instruments, the supply and the SDR use painted cut-outs (bench-art.ts); every other device is drawn from rectangles, circles and lines
 * so the player can recognise it and click it, the way C6 sites use pictures. Returns SVG markup
 * for the inside of one device group; colours come from `.ham-bench` CSS classes so both themes
 * work. No state and no DOM: the scene passes in what changes the drawing (power, screen text).
 */

import { artForKind, type EquipmentArt } from './bench-art';
import type { DeviceBox } from './bench-layout';

export interface ShapeState {
  powered: boolean;
  /** Passive devices never show a power LED */
  passive: boolean;
  /** Short text for a front-panel display, if the device has one */
  display?: string;
  /** The laptop screen shows a live waterfall strip */
  screenActive?: boolean;
}

const r = (x: number, y: number, w: number, h: number, cls: string, rx = 4): string =>
  `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}"/>`;
const c = (x: number, y: number, rad: number, cls: string): string => `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad}"/>`;
const l = (x1: number, y1: number, x2: number, y2: number, cls: string): string =>
  `<line class="${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
const esc = (s: string): string => s.replace(/[&<>"]/gu, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
const txt = (x: number, y: number, s: string, cls: string, anchor = 'middle'): string =>
  `<text class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}">${esc(s)}</text>`;

function led(x: number, y: number, st: ShapeState): string {
  if (st.passive) return '';

  return c(x, y, 4, st.powered ? 'bd-led bd-led-on' : 'bd-led');
}

function knob(x: number, y: number, rad: number): string {
  return c(x, y, rad, 'bd-knob') + l(x, y, x, y - rad + 2, 'bd-knob-mark');
}

function display(x: number, y: number, w: number, h: number, st: ShapeState): string {
  const on = st.powered && !st.passive;

  return r(x, y, w, h, on ? 'bd-display bd-display-on' : 'bd-display', 2) + (on && st.display ? txt(x + w / 2, y + h * 0.7, st.display, 'bd-display-text') : '');
}

/** The painted picture fitted (aspect kept, centred) into the device box, with its screen text and LED on top */
function artShape(b: DeviceBox, art: EquipmentArt, st: ShapeState): string {
  const scale = Math.min(b.w / art.width, b.h / art.height);
  const iw = art.width * scale;
  const ih = art.height * scale;
  const ix = b.x + (b.w - iw) / 2;
  const iy = b.y + (b.h - ih) / 2;
  const at = (k: string) => {
    const g = art.regions[k];

    return g ? { x: ix + g.x * iw, y: iy + g.y * ih, w: g.w * iw, h: g.h * ih } : null;
  };
  let out = `<image class="bd-art" href="${art.src}" x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
  const screen = at('screen');
  if (screen && st.powered && !st.passive && st.display && screen.h >= 8) {
    out += txt(screen.x + screen.w / 2, screen.y + screen.h * 0.68, st.display, 'bd-art-screen-text');
  }
  const ledBox = at('led');
  if (ledBox) out += c(ledBox.x + ledBox.w / 2, ledBox.y + ledBox.h / 2, Math.max(2.5, ledBox.h / 2), st.powered ? 'bd-led bd-led-on' : 'bd-led');
  else out += led(ix + iw - 6, iy + ih - 6, st);

  return out;
}

/** SVG markup for the device body, in scene coordinates */
export function deviceShape(b: DeviceBox, st: ShapeState): string {
  const art = artForKind(b.kind);
  if (art) return artShape(b, art, st);
  const { x, y, w, h } = b;
  switch (b.kind) {
    case 'antenna': {
      const cx = x + w / 2;

      return (
        l(cx, y + 6, cx, y + h - 22, 'bd-element') +
        l(cx, y + h - 22, cx - 26, y + h - 4, 'bd-radial') +
        l(cx, y + h - 22, cx + 26, y + h - 4, 'bd-radial') +
        c(cx, y + 6, 4, 'bd-metal') +
        r(cx - 9, y + h - 26, 18, 14, 'bd-body', 2)
      );
    }
    case 'coax':
    case 'dc-lead': {
      const cls = b.kind === 'coax' ? 'bd-coax' : 'bd-dclead';
      const mid = y + h / 2;
      const path = `M${x + 14},${mid} C${x + w * 0.3},${y - 6} ${x + w * 0.45},${y + h + 6} ${x + w / 2},${mid} S${x + w * 0.75},${y - 6} ${x + w - 14},${mid}`;

      return `<path class="${cls}" d="${path}"/>${r(x, mid - 7, 16, 14, 'bd-plug', 3)}${r(x + w - 16, mid - 7, 16, 14, 'bd-plug', 3)}`;
    }
    case 'adapter':
      return r(x + 4, y + 4, w - 8, h - 8, 'bd-metal', 3) + l(x + w / 2, y + 4, x + w / 2, y + h - 4, 'bd-seam');
    case 'duplexer':
      return r(x, y, w, h, 'bd-metal', 6) + l(x + w / 2, y + 6, x + w / 2, y + h - 6, 'bd-seam');
    case 'sdr':
      return r(x, y + 6, w, h - 12, 'bd-body', 8) + r(x + w - 22, y + 12, 22, h - 24, 'bd-metal', 2) + led(x + 20, y + h / 2, st);
    case 'handheld':
    case 'dmr-handheld': {
      const cx = x + w / 2;

      return (
        r(x, y + 10, w, h - 10, 'bd-body', 10) +
        knob(x + 14, y + 18, 6) +
        knob(x + w - 14, y + 18, 6) +
        display(x + 8, y + 34, w - 16, 22, st) +
        r(x + 8, y + 64, w - 16, 44, 'bd-face', 4) +
        [0, 1, 2].map((i) => l(x + 14, y + 74 + i * 12, x + w - 14, y + 74 + i * 12, 'bd-seam')).join('') +
        r(x - 4, y + 40, 4, 30, 'bd-ptt', 1) +
        led(cx, y + h - 8, st)
      );
    }
    case 'mobile':
    case 'hf-rig':
      return (
        r(x, y, w, h, 'bd-body', 6) +
        display(x + 12, y + 10, w * 0.5, h * 0.36, st) +
        knob(x + w - 30, y + h / 2, Math.min(18, h * 0.28)) +
        knob(x + w * 0.62 + 10, y + h - 16, 7) +
        led(x + 14, y + h - 12, st)
      );
    case 'laptop': {
      const sh = h * 0.68;
      const screen = r(x + 10, y + 8, w - 20, sh - 14, st.powered ? 'bd-screen bd-screen-on' : 'bd-screen', 3);
      const wf = st.powered && st.screenActive ? [0, 1, 2, 3, 4].map((i) => r(x + 18, y + 18 + i * 9, w - 36, 6, `bd-wf bd-wf-${i}`, 1)).join('') : '';
      const sw = st.powered && st.display ? txt(x + w / 2, y + sh - 12, st.display, 'bd-screen-text') : '';

      return (
        r(x, y, w, sh, 'bd-body', 6) +
        screen +
        wf +
        sw +
        `<path class="bd-body" d="M${x - 10},${y + h} L${x + 6},${y + sh} L${x + w - 6},${y + sh} L${x + w + 10},${y + h} Z"/>` +
        r(x + w * 0.38, y + h - 12, w * 0.24, 7, 'bd-face', 2)
      );
    }
    case 'audio-interface':
      return r(x, y, w, h, 'bd-body', 6) + knob(x + w * 0.3, y + h / 2, 9) + knob(x + w * 0.6, y + h / 2, 9) + led(x + w - 14, y + 12, st);
    case 'headphones':
      return `<path class="bd-cable-thick" d="M${x + 12},${y + h - 14} C${x + 12},${y} ${x + w - 12},${y} ${x + w - 12},${y + h - 14}"/>${r(x, y + h - 30, 22, 28, 'bd-body', 6)}${r(x + w - 22, y + h - 30, 22, 28, 'bd-body', 6)}`;
    case 'power-supply':
      return (
        r(x, y, w, h, 'bd-body', 6) +
        display(x + 10, y + 10, w * 0.55, 24, st) +
        knob(x + w - 24, y + 22, 10) +
        c(x + w * 0.3, y + h - 16, 7, 'bd-post-red') +
        c(x + w * 0.5, y + h - 16, 7, 'bd-post-black') +
        led(x + w - 14, y + h - 12, st)
      );
    case 'battery':
      return (
        r(x, y + 10, w, h - 10, 'bd-battery', 6) +
        r(x + 14, y, 16, 12, 'bd-post-red', 2) +
        r(x + w - 30, y, 16, 12, 'bd-post-black', 2) +
        txt(x + w / 2, y + h / 2 + 10, '12 V', 'bd-label-dim')
      );
    case 'charger':
      return r(x, y, w, h, 'bd-body', 8) + led(x + 14, y + 14, st) + l(x + 20, y + h - 14, x + w - 20, y + h - 14, 'bd-seam');
    case 'multimeter':
      return (
        r(x, y, w, h, 'bd-meter', 10) +
        display(x + 10, y + 10, w - 20, 26, st) +
        c(x + w / 2, y + 66, 18, 'bd-knob') +
        l(x + w / 2, y + 66, x + w / 2 + 12, y + 54, 'bd-knob-mark') +
        c(x + w * 0.3, y + h - 14, 5, 'bd-post-black') +
        c(x + w * 0.7, y + h - 14, 5, 'bd-post-red')
      );
    case 'swr-meter':
    case 'analyzer': {
      const cx = x + w / 2;
      const cy = y + h * 0.62;

      return (
        r(x, y, w, h, 'bd-body', 6) +
        (b.kind === 'swr-meter'
          ? `<path class="bd-dial" d="M${cx - 30},${cy} A30,30 0 0 1 ${cx + 30},${cy}"/>${l(cx, cy, cx + 14, cy - 24, 'bd-needle')}`
          : display(x + 10, y + 10, w - 20, h * 0.5, st)) +
        led(x + w - 12, y + h - 10, st)
      );
    }
    case 'dummy-load':
    case 'cal-load':
      return r(x, y + 6, w, h - 12, 'bd-metal', 4) + [0.2, 0.35, 0.5, 0.65, 0.8].map((t) => l(x + w * t, y + 2, x + w * t, y + h - 2, 'bd-fin')).join('');
    case 'circuit-board':
      return (
        r(x, y, w, h, 'bd-pcb', 4) +
        l(x + 12, y + 20, x + w - 20, y + 20, 'bd-trace') +
        l(x + 12, y + h - 20, x + w - 30, y + h - 20, 'bd-trace') +
        r(x + w * 0.4, y + h * 0.35, 30, 22, 'bd-chip', 2)
      );
    case 'noise-source':
      return r(x, y, w, h, 'bd-body', 6) + `<path class="bd-zigzag" d="M${x + 10},${y + h / 2} l8,-10 l8,20 l8,-20 l8,20 l8,-10"/>` + led(x + w - 12, y + 12, st);
    default:
      return r(x, y, w, h, 'bd-body', 6) + led(x + w - 12, y + 12, st);
  }
}
