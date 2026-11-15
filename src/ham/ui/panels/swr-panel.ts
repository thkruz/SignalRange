/**
 * @file swr-panel - Inline SWR / wattmeter plus dummy-load heat
 * @description The meter only reads while the connected transmitter is keyed through it.
 *
 * Test ids (<swr> = swr-meter device id):
 *   ham-swr-<swr>-fwd, -ref, -swr, -read, -status, -flag (out-of-range text), -termination
 *   ham-swr-<load>-heat (dummy-load heat bar), -heat-warning
 */
import type { HamStationManager } from '../../ham-station-manager';
import type { HamMeasurement } from '../../ham-types';
import { dummyLoadHeat } from '../../rf/instruments';
import { FACE_ART } from '../bench/bench-art';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, fmt, h } from '../ui-kit';
import './instruments.css';
import { paintedFace } from './painted-face';
import { inService, kv, setText, T } from './panel-util';

const TERMINATION_TEXT: Record<string, string> = {
  antenna: 'antenna',
  'dummy-load': 'dummy load',
  'cal-load': 'calibration load',
  analyzer: 'antenna analyzer',
  open: 'open (nothing connected)',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));

  return e;
};
/** Needle pivot and sweep in the meter's 400 x 196 view box */
const PIVOT = { x: 200, y: 186 };
const SWEEP_DEG = 54;
const SCALE_R = 150;
const SCALE_SWRS = [1, 1.5, 2, 3, 5, 10];
/** The SWR scale is not linear: 1 is the left stop, a very high SWR the right stop */
export const swrFraction = (swr: number): number => (Number.isFinite(swr) ? Math.max(0, Math.min(1, 1 - 1 / Math.max(1, swr))) : 1);
/** Needle angle in degrees from straight up: -SWEEP_DEG at SWR 1, +SWEEP_DEG at infinity; resting at the left stop with no reading */
export const swrNeedleDeg = (swr: number | null): number => (swr === null ? -SWEEP_DEG : -SWEEP_DEG + 2 * SWEEP_DEG * swrFraction(swr));

export class SwrPanel implements StationPanel {
  readonly id = 'swr';
  readonly title = 'SWR / wattmeter';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private meterId_ = 'swr1';
  private fwd_!: HTMLElement;
  private ref_!: HTMLElement;
  private swr_!: HTMLElement;
  private status_!: HTMLElement;
  private flag_!: HTMLElement;
  private term_!: HTMLElement;
  private meter_!: SVGSVGElement;
  private needle_!: SVGElement;
  private heat_ = new Map<string, { bar: HTMLElement; fill: HTMLElement; warn: HTMLElement }>();
  private last_: HamMeasurement | null = null;
  private refusal_ = '';

  isRelevant(m: HamStationManager): boolean {
    return inService(m, 'swr-meter').length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const m = ctx.manager;
    const d = (this.meterId_ = inService(m, 'swr-meter')[0]?.id ?? 'swr1');
    this.fwd_ = h('span', { class: 'pf-val', 'data-testid': T('ham-swr', d, 'fwd'), text: '-' });
    this.ref_ = h('span', { class: 'pf-val', 'data-testid': T('ham-swr', d, 'ref'), text: '-' });
    this.swr_ = h('span', { class: 'pf-val', 'data-testid': T('ham-swr', d, 'swr'), text: '-' });
    this.term_ = h('span', { 'data-testid': T('ham-swr', d, 'termination'), text: '-' });
    this.status_ = h('div', { class: 'small text-muted', 'data-testid': T('ham-swr', d, 'status') });
    this.flag_ = h('div', { class: 'small text-warning', 'data-testid': T('ham-swr', d, 'flag') });
    // The push button on the case reads the meter; it only reads while the transmitter is keyed through it
    const read = button(T('ham-swr', d, 'read'), 'READ', () => this.read_(), 'pf-key pf-read pf-round', 'Read (while keyed)');
    const loads = h('div', { class: 'mt-2' });
    for (const l of inService(m, 'dummy-load')) {
      const fill = h('span');
      const bar = h('div', { class: 'ham-heat', 'data-testid': T('ham-swr', l.id, 'heat'), role: 'progressbar', 'aria-label': `${l.label} heat` }, fill);
      const warn = h('div', { class: 'small text-danger', 'data-testid': T('ham-swr', l.id, 'heat-warning') });
      this.heat_.set(l.id, { bar, fill, warn });
      loads.append(h('div', { class: 'small mb-1', text: `${l.label} heat` }), bar, warn);
    }
    this.needle_ = svgEl('g', { class: 'pf-needle' });
    this.meter_ = svgEl('svg', { viewBox: '0 0 400 196', role: 'img', 'aria-label': 'SWR needle: no reading' }) as SVGSVGElement;
    this.drawScale_();
    const win = (cap: string, val: HTMLElement): HTMLElement => h('div', { class: 'pf-window' }, h('span', { class: 'pf-cap', text: cap }), val);
    const face = paintedFace(FACE_ART.swr, 'swr', [
      ['face', h('div', { class: 'pf-meter' }, this.meter_)],
      ['window1', win('FWD', this.fwd_)],
      ['window2', win('REF', this.ref_)],
      ['window3', win('SWR', this.swr_)],
      ['key', read],
    ]);
    this.root_ = h(
      'div',
      { class: 'ham-instr pface-layout', 'data-testid': T('ham-swr', d, 'panel') },
      face,
      h('div', { class: 'pface-side' }, kv('Terminated in', this.term_), this.status_, this.flag_, loads)
    );
    host.append(this.root_);
    this.update(m);
  }

  /** Printed scale, tick labels and the needle on the cream face */
  private drawScale_(): void {
    const pt = (deg: number, r: number): [number, number] => [PIVOT.x + r * Math.sin((deg * Math.PI) / 180), PIVOT.y - r * Math.cos((deg * Math.PI) / 180)];
    const [ax, ay] = pt(-SWEEP_DEG, SCALE_R);
    const [bx, by] = pt(SWEEP_DEG, SCALE_R);
    this.meter_.append(
      svgEl('path', { d: `M${ax.toFixed(1)} ${ay.toFixed(1)} A${SCALE_R} ${SCALE_R} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}`, fill: 'none', stroke: '#3a2d1c', 'stroke-width': 2 })
    );
    for (const v of SCALE_SWRS) {
      const deg = swrNeedleDeg(v);
      const [x1, y1] = pt(deg, SCALE_R);
      const [x2, y2] = pt(deg, SCALE_R - 14);
      const [tx, ty] = pt(deg, SCALE_R - 28);
      this.meter_.append(svgEl('line', { x1, y1, x2, y2, stroke: '#3a2d1c', 'stroke-width': 3 }));
      const t = svgEl('text', { x: tx, y: ty + 5, 'text-anchor': 'middle', fill: '#3a2d1c', 'font-size': 16, 'font-weight': 700, 'font-family': 'serif' });
      t.textContent = String(v);
      this.meter_.append(t);
    }
    const inf = pt(SWEEP_DEG, SCALE_R - 28);
    const it = svgEl('text', { x: inf[0], y: inf[1] + 6, 'text-anchor': 'middle', fill: '#3a2d1c', 'font-size': 22, 'font-family': 'serif' });
    it.textContent = '\u221e';
    this.meter_.append(it);
    const cap = svgEl('text', { x: PIVOT.x, y: 118, 'text-anchor': 'middle', fill: '#3a2d1c', 'font-size': 18, 'font-weight': 700, 'letter-spacing': 3, 'font-family': 'serif' });
    cap.textContent = 'SWR';
    this.meter_.append(cap);
    this.needle_.append(svgEl('line', { x1: PIVOT.x, y1: PIVOT.y, x2: PIVOT.x, y2: PIVOT.y - 142, stroke: '#14100a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    this.meter_.append(this.needle_, svgEl('circle', { cx: PIVOT.x, cy: PIVOT.y, r: 8, fill: '#2a2118' }));
  }

  private read_(): void {
    const r = this.ctx_.act({ type: 'swr.read', deviceId: this.meterId_ });
    this.refusal_ = r.ok ? '' : r.message;
    if (r.ok) this.last_ = (r.data?.measurement as HamMeasurement | undefined) ?? null;
    this.render_();
  }

  private render_(): void {
    const m = this.last_;
    const c = m?.context;
    setText(this.fwd_, c ? `${fmt(Number(c.forwardW), 1)} W` : '-');
    setText(this.ref_, c ? `${fmt(Number(c.reflectedW), 2)} W` : '-');
    setText(this.swr_, m ? `${fmt(m.value, 2)} : 1` : '-');
    this.needle_.setAttribute('style', `transform:rotate(${swrNeedleDeg(m ? m.value : null).toFixed(1)}deg)`);
    this.meter_.setAttribute('aria-label', m ? `SWR needle: ${fmt(m.value, 2)} to 1` : 'SWR needle: no reading');
    setText(this.term_, c ? (TERMINATION_TEXT[String(c.termination)] ?? String(c.termination)) : '-');
    setText(this.flag_, c?.unreliable ? 'Reading unreliable: frequency or power is outside the meter range.' : '');
    const keyed = this.ctx_.manager.keyed();
    setText(this.status_, this.refusal_ || (keyed ? 'Transmitter keyed: read now.' : m ? 'Last reading shown.' : 'Key the transmitter, then read.'));
  }

  update(m: HamStationManager): void {
    for (const [id, v] of this.heat_) {
      const load = m.device(id)?.dummyLoad;
      if (!load) continue;
      const heat = dummyLoadHeat(load);
      v.fill.style.width = `${Math.min(100, Math.round(heat.fraction * 100))}%`;
      v.bar.classList.toggle('warm', heat.state === 'warm' || heat.state === 'warning');
      v.bar.classList.toggle('hot', heat.state === 'overheated');
      v.bar.setAttribute('aria-valuenow', String(Math.round(heat.fraction * 100)));
      setText(v.warn, heat.warning ?? '');
    }
    this.render_();
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
    this.heat_.clear();
  }
}
