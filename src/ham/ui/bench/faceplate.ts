/**
 * @file faceplate - Painted picture of the selected equipment with live readouts and click regions
 * @description Shown at the top of the Close-up for radios and instruments that have painted art.
 * The picture has blank screens and unlabelled keys; this draws the text, needles and lamps on an
 * SVG overlay sized in image pixels, and makes each region clickable. A click focuses, scrolls to
 * and flashes the matching control of the instrument panel below it (the panel keeps the real
 * controls and their test ids). Reads state only; it never acts on the station.
 *
 * Test ids: ham-faceplate-<deviceId> (wrapper), ham-face-<deviceId>-<region> (hit rect).
 */

import type { HamStationManager } from '../../ham-station-manager';
import { h } from '../ui-kit';
import { ART_FOR_KIND, type ArtBox, EQUIPMENT_ART, type EquipmentArt } from './bench-art';
import './faceplate.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_HEIGHT_PX = 220;
const UPDATE_INTERVAL_MS = 200;
const FLASH_MS = 1000;
const CREAM = '#f3e6c8';
const INK = '#2b2118';

type Attrs = Record<string, string | number>;

function svg(tag: string, attrs: Attrs = {}, text?: string): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;

  return e;
}

/** Control ids (data-testid) a region should send the player to, first match wins */
function controlsFor(artKey: string, region: string, id: string, meterMode: string): string[] {
  const radio = (key: string): string => `ham-radio-${id}-${key}`;
  switch (artKey) {
    case 'ht':
    case 'mobile':
    case 'hf':
      if (region === 'ptt') return [`ham-ptt-${id}-transmit`];
      if (region === 'keypad') return [radio('finp')];
      if (region === 'keys' || region === 'topKeys') return [`[data-testid^="${radio('mode-')}"]`, radio('dial')];
      if (region === 'volumeKnob' || region === 'smallKnobs') return [radio('volume'), radio('dial')];
      if (region === 'screen' || region === 'mainKnob') return [radio('dial')];

      return [];
    case 'multimeter':
      if (region === 'screen') return [`ham-meter-${id}-read`];
      if (region === 'dial') return [`ham-meter-${id}-mode-${meterMode === 'OFF' ? 'DCV' : meterMode}`, `ham-meter-${id}-mode-DCV`];
      if (region === 'jackV' || region === 'jackCom' || region === 'jackA') return [`ham-meter-${id}-socket`];

      return [];
    case 'swr':
      return region === 'face' || region === 'knob' ? [`ham-swr-${id}-read`] : [];
    case 'psu':
      if (region === 'powerSwitch') return [`ham-dc-${id}-source`];
      if (region === 'voltMeter') return [`ham-dc-${id}-volts`];
      if (region === 'ampMeter') return [`ham-dc-${id}-amps`];

      return [];
    case 'analyzer':
      if (region === 'screen' || region === 'dpad') return [`ham-analyzer-${id}-sweep`];
      if (region === 'keys') return [`ham-analyzer-${id}-calibrate`];

      return [];
    default:
      return [];
  }
}

const RADIO_ARTS = ['ht', 'mobile', 'hf'];

/** Everything the overlay draws, as plain data so it can be compared between updates */
interface FaceView {
  energized: boolean;
  line1?: string;
  line2?: string;
  swr?: number | null;
  volts?: number;
  amps?: number;
  psuOn?: boolean;
  meterMode?: string;
}

export class Faceplate {
  readonly el: HTMLElement;
  private readonly controlsRoot_: ParentNode;
  private deviceId_: string | null = null;
  private artKey_: string | null = null;
  private live_: SVGGElement | null = null;
  private sig_ = '';
  private lastSyncTime_ = 0;
  private meterMode_ = 'OFF';
  private readonly flashTimers_ = new Map<Element, ReturnType<typeof setTimeout>>();
  private readonly boundClicks_: Array<{ el: Element; fn: () => void }> = [];

  /** @param controlsRoot Element holding the instrument panels whose controls the regions point at */
  constructor(controlsRoot: ParentNode) {
    this.controlsRoot_ = controlsRoot;
    this.el = h('div', { class: 'ham-faceplate' });
  }

  get active(): boolean {
    return this.deviceId_ !== null;
  }

  show(deviceId: string): void {
    if (this.deviceId_ === deviceId) return;
    this.deviceId_ = deviceId;
    this.artKey_ = null;
    this.lastSyncTime_ = 0;
  }

  hide(): void {
    this.deviceId_ = null;
    this.clear_();
    this.el.remove();
  }

  dispose(): void {
    this.hide();
    for (const t of this.flashTimers_.values()) clearTimeout(t);
    this.flashTimers_.clear();
  }

  update(m: HamStationManager, force = false): void {
    const id = this.deviceId_;
    if (!id) return;
    const dev = m.device(id);
    const artKey = dev ? ART_FOR_KIND[dev.kind] : undefined;
    if (!dev || !artKey) {
      this.clear_();

      return;
    }
    if (artKey !== this.artKey_) {
      this.build_(id, artKey, EQUIPMENT_ART[artKey]);
      force = true;
    }
    const now = Date.now();
    if (!force && now - this.lastSyncTime_ < UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    const view = this.read_(m, id, artKey);
    this.meterMode_ = view.meterMode ?? 'OFF';
    const sig = JSON.stringify(view);
    if (sig === this.sig_) return;
    this.sig_ = sig;
    this.draw_(artKey, EQUIPMENT_ART[artKey], view);
  }

  // ---- state -------------------------------------------------------------------------------

  private read_(m: HamStationManager, id: string, artKey: string): FaceView {
    const energized = m.energized(id);
    if (RADIO_ARTS.includes(artKey)) {
      const r = m.radio(id);
      if (!r) return { energized: false };
      const keyed = m.keyed()?.deviceId === id;
      const open = !keyed && m.liveReception(id).some((x) => x.squelchOpen);
      const power = typeof r.txPowerW === 'number' ? `${r.txPowerW} W` : '';

      return { energized, line1: r.vfoMHz.toFixed(3), line2: `${String(r.mode).toUpperCase()} ${keyed ? 'TX' : open ? 'BUSY' : power}`.trim() };
    }
    switch (artKey) {
      case 'multimeter': {
        const mode = m.meterState().mode;
        const last = m.lastMeasurement({ instrument: 'multimeter' });
        const display = last?.context?.display;

        return { energized: mode !== 'OFF', meterMode: mode, line1: typeof display === 'string' ? display : '----', line2: mode };
      }
      case 'swr': {
        const last = m.lastMeasurement({ instrument: 'swr-meter', quantity: 'SWR' });

        return { energized: true, swr: last ? last.value : null };
      }
      case 'psu': {
        const dc = m.dcSystem(id);
        const connected = Boolean(dc?.state.sourceConnected);
        const me = dc && connected ? dc.measure() : null;

        return { energized, psuOn: energized, volts: me ? Number(me.vSource) : 0, amps: me ? Number(me.currentA) : 0 };
      }
      case 'analyzer': {
        const sweep = m.lastSweep();
        const swr = sweep ? Number(sweep.measurement.context?.minSwr ?? NaN) : NaN;

        return {
          energized,
          line1: sweep && Number.isFinite(swr) ? `SWR ${swr.toFixed(2)}` : 'READY',
          line2: sweep && Number.isFinite(swr) ? `${sweep.measurement.value.toFixed(3)} MHz` : '',
        };
      }
      default:
        return { energized };
    }
  }

  // ---- build -------------------------------------------------------------------------------

  private clear_(): void {
    for (const { el, fn } of this.boundClicks_) el.removeEventListener('click', fn);
    this.boundClicks_.length = 0;
    this.el.replaceChildren();
    this.live_ = null;
    this.artKey_ = null;
    this.sig_ = '';
  }

  private build_(id: string, artKey: string, art: EquipmentArt): void {
    this.clear_();
    this.artKey_ = artKey;
    this.el.setAttribute('data-testid', `ham-faceplate-${id}`);
    this.el.style.aspectRatio = `${art.width} / ${art.height}`;
    this.el.style.width = `min(100%, ${Math.round((MAX_HEIGHT_PX * art.width) / art.height)}px)`;
    const img = document.createElement('img');
    img.className = 'ham-faceplate-img';
    img.src = art.src;
    img.alt = '';
    img.draggable = false;
    const root = svg('svg', {
      class: 'ham-faceplate-svg',
      viewBox: `0 0 ${art.width} ${art.height}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'group',
      'aria-label': 'Equipment faceplate',
    });
    this.live_ = svg('g', { class: 'ham-faceplate-live' }) as SVGGElement;
    root.append(this.live_);
    const hits = svg('g', { class: 'ham-faceplate-hits' });
    for (const [region, b] of Object.entries(art.regions)) {
      if (b.w <= 0 || b.h <= 0) continue;
      const rect = svg('rect', {
        class: 'ham-face-hit',
        x: b.x * art.width,
        y: b.y * art.height,
        width: b.w * art.width,
        height: b.h * art.height,
        rx: 4,
        tabindex: 0,
        role: 'button',
        'aria-label': this.regionLabel_(region),
        'data-testid': `ham-face-${id}-${region}`,
      });
      rect.append(svg('title', {}, this.regionLabel_(region)));
      const fn = (): void => this.activate_(artKey, region, id);
      rect.addEventListener('click', fn);
      rect.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') fn();
      });
      this.boundClicks_.push({ el: rect, fn });
      hits.append(rect);
    }
    root.append(hits);
    this.el.append(img, root);
  }

  private regionLabel_(region: string): string {
    return region
      .replace(/([A-Z])/gu, ' $1')
      .toLowerCase()
      .replace(/^./u, (c) => c.toUpperCase());
  }

  // ---- click -------------------------------------------------------------------------------

  private activate_(artKey: string, region: string, id: string): void {
    // A radio's controls are on its front panel: sit down at it first, then go to the control there
    const operate = this.controlsRoot_.querySelector<HTMLElement>(`[data-testid="ham-radio-${id}-operate"]`);
    if (operate && RADIO_ARTS.includes(artKey)) operate.click();
    for (const testId of controlsFor(artKey, region, id, this.meterMode_)) {
      const sel = testId.startsWith('[') ? testId : `[data-testid="${testId}"]`;
      const target = this.controlsRoot_.querySelector<HTMLElement>(sel) ?? (operate ? document.querySelector<HTMLElement>(`.immersive-transceiver ${sel}`) : null);
      if (!target) continue;
      target.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      target.focus?.({ preventScroll: true });
      this.flash_(target);

      return;
    }
  }

  private flash_(target: Element): void {
    const prev = this.flashTimers_.get(target);
    if (prev) clearTimeout(prev);
    target.classList.remove('ham-face-flash');
    // Restart the animation when flashed twice in a row
    void (target as HTMLElement).offsetWidth;
    target.classList.add('ham-face-flash');
    this.flashTimers_.set(
      target,
      setTimeout(() => {
        target.classList.remove('ham-face-flash');
        this.flashTimers_.delete(target);
      }, FLASH_MS)
    );
  }

  // ---- drawing -----------------------------------------------------------------------------

  private draw_(artKey: string, art: EquipmentArt, v: FaceView): void {
    const g = this.live_;
    if (!g) return;
    g.replaceChildren();
    const px = (b: ArtBox): ArtBox => ({ x: b.x * art.width, y: b.y * art.height, w: b.w * art.width, h: b.h * art.height });
    const r = art.regions;
    if (RADIO_ARTS.includes(artKey) || artKey === 'analyzer') {
      if (v.energized) this.lcd_(g, px(r.screen), v.line1 ?? '', v.line2 ?? '');
    } else if (artKey === 'multimeter') {
      if (v.energized) this.lcd_(g, px(r.screen), v.line1 ?? '', v.line2 ?? '');
      this.dialLabel_(g, px(r.dial), v.meterMode ?? 'OFF');
    } else if (artKey === 'swr') {
      this.drawSwr_(g, px(r.face), px(r.pivot), v.swr ?? null);
    } else if (artKey === 'psu') {
      this.drawPsu_(g, px(r.voltMeter), px(r.ampMeter), px(r.powerSwitch), v);
    } else if (artKey === 'sdr') {
      this.drawLed_(g, px(r.led), v.energized);
    }
  }

  private lcd_(g: SVGElement, b: ArtBox, line1: string, line2: string): void {
    const cx = b.x + b.w / 2;
    const two = line2.length > 0;
    const size1 = Math.min(b.h * (two ? 0.46 : 0.62), (b.w * 0.92) / Math.max(line1.length, 1) / 0.62);
    g.append(
      svg(
        'text',
        { class: 'ham-faceplate-lcd', x: cx, y: b.y + b.h * (two ? 0.4 : 0.52), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': size1.toFixed(1) },
        line1
      )
    );
    if (two) {
      const size2 = Math.min(b.h * 0.24, (b.w * 0.92) / Math.max(line2.length, 1) / 0.62);
      g.append(
        svg('text', { class: 'ham-faceplate-lcd-dim', x: cx, y: b.y + b.h * 0.8, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': size2.toFixed(1) }, line2)
      );
    }
  }

  private dialLabel_(g: SVGElement, b: ArtBox, mode: string): void {
    const w = Math.min(b.w * 0.6, 70);
    const h = Math.min(b.h * 0.3, 28);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    g.append(svg('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 5, fill: '#14171c', 'fill-opacity': 0.85 }));
    g.append(svg('text', { class: 'ham-faceplate-lcd', x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': (h * 0.62).toFixed(1) }, mode));
  }

  /** Needle drawn from (cx, cy) at an angle in degrees measured clockwise from straight up */
  private needle_(g: SVGElement, cx: number, cy: number, len: number, deg: number, color = '#b3261e'): void {
    const a = (deg * Math.PI) / 180;
    g.append(
      svg('line', { x1: cx, y1: cy, x2: (cx + Math.sin(a) * len).toFixed(1), y2: (cy - Math.cos(a) * len).toFixed(1), stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round' })
    );
    g.append(svg('circle', { cx, cy, r: 6, fill: INK }));
  }

  private drawSwr_(g: SVGElement, face: ArtBox, pivot: ArtBox, swr: number | null): void {
    g.append(svg('rect', { x: face.x, y: face.y, width: face.w, height: face.h, rx: 14, fill: CREAM, stroke: '#a89873', 'stroke-width': 2 }));
    const cx = pivot.x;
    const cy = pivot.y;
    const radius = (cy - face.y) * 0.8;
    const stops: Array<[string, number, number]> = [
      ['1', 1, 0],
      ['1.5', 1.5, 0.25],
      ['2', 2, 0.5],
      ['3', 3, 0.75],
      ['∞', Infinity, 1],
    ];
    const SPAN = 110;
    const angleOf = (f: number): number => -SPAN / 2 + f * SPAN;
    for (const [label, , f] of stops) {
      const a = (angleOf(f) * Math.PI) / 180;
      const x1 = cx + Math.sin(a) * radius;
      const y1 = cy - Math.cos(a) * radius;
      const x2 = cx + Math.sin(a) * (radius + 14);
      const y2 = cy - Math.cos(a) * (radius + 14);
      g.append(svg('line', { x1, y1, x2, y2, stroke: INK, 'stroke-width': 2.5 }));
      g.append(
        svg(
          'text',
          { x: cx + Math.sin(a) * (radius + 30), y: cy - Math.cos(a) * (radius + 30), fill: INK, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 18 },
          label
        )
      );
    }
    g.append(svg('text', { x: cx, y: face.y + face.h * 0.62, fill: INK, 'text-anchor': 'middle', 'font-size': 20 }, 'SWR'));
    let f = -0.12;
    if (swr !== null && Number.isFinite(swr)) {
      const s = Math.max(1, swr);
      f = 1;
      if (s >= 3) f = Math.min(1, 0.75 + ((s - 3) / 7) * 0.25);
      else {
        for (let i = 0; i < 3; i++) {
          if (s <= stops[i + 1][1]) {
            f = stops[i][2] + ((s - stops[i][1]) / (stops[i + 1][1] - stops[i][1])) * (stops[i + 1][2] - stops[i][2]);
            break;
          }
        }
      }
    }
    this.needle_(g, cx, cy, radius * 0.95, angleOf(f));
  }

  private drawPsu_(g: SVGElement, volt: ArtBox, amp: ArtBox, sw: ArtBox, v: FaceView): void {
    const meter = (b: ArtBox, max: number, ticks: number[], value: number, label: string): void => {
      g.append(svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6, fill: CREAM, stroke: '#a89873', 'stroke-width': 1.5 }));
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h * 0.92;
      const radius = b.h * 0.7;
      const angleOf = (x: number): number => -50 + (Math.min(Math.max(x, 0), max) / max) * 100;
      for (const t of ticks) {
        const a = (angleOf(t) * Math.PI) / 180;
        g.append(
          svg('line', {
            x1: cx + Math.sin(a) * radius,
            y1: cy - Math.cos(a) * radius,
            x2: cx + Math.sin(a) * (radius + 7),
            y2: cy - Math.cos(a) * (radius + 7),
            stroke: INK,
            'stroke-width': 1.5,
          })
        );
        g.append(
          svg(
            'text',
            { x: cx + Math.sin(a) * (radius + 15), y: cy - Math.cos(a) * (radius + 15), fill: INK, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 10 },
            String(t)
          )
        );
      }
      g.append(svg('text', { x: cx, y: b.y + b.h * 0.5, fill: INK, 'text-anchor': 'middle', 'font-size': 12 }, label));
      this.needle_(g, cx, cy, radius * 0.92, angleOf(value));
    };
    meter(volt, 15, [0, 5, 10, 15], v.volts ?? 0, 'VOLTS');
    meter(amp, 25, [0, 5, 10, 15, 20, 25], v.amps ?? 0, 'AMPS');
    const on = Boolean(v.psuOn);
    const cx = sw.x + sw.w / 2;
    g.append(svg('rect', { x: sw.x, y: sw.y + sw.h * 0.62, width: sw.w, height: sw.h * 0.36, rx: 4, fill: on ? '#1f8a4c' : '#3a3f47' }));
    g.append(
      svg('text', { x: cx, y: sw.y + sw.h * 0.8, fill: '#fff', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': Math.max(9, sw.h * 0.24) }, on ? 'ON' : 'OFF')
    );
  }

  private drawLed_(g: SVGElement, b: ArtBox, on: boolean): void {
    if (!on) return;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    g.append(svg('circle', { cx, cy, r: Math.max(b.w, b.h) * 1.1, fill: '#3ddc84', 'fill-opacity': 0.3 }));
    g.append(svg('circle', { cx, cy, r: Math.max(b.w, b.h) * 0.5, fill: '#3ddc84' }));
  }
}
