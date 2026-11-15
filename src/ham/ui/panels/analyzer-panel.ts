/**
 * @file analyzer-panel - Antenna analyzer: staged sweep settings, calibration, SWR-vs-frequency plot
 * @description Start/stop/points are staged inputs; Sweep runs analyzer.sweep with them. Calibrate
 * at the analyzer port or at the cable end (pick the reference device). The plot marks the
 * minimum SWR and flags an uncalibrated sweep.
 *
 * Test ids (<an> = analyzer device id):
 *   ham-analyzer-<an>-start, -stop, -points, -sweep, -cal-ref (select), -calibrate, -cal-status,
 *   -plot (svg), -min (min-SWR text), -flag (uncalibrated / reference warning), -status
 */
import type { HamStationManager } from '../../ham-station-manager';
import type { HamMeasurement } from '../../ham-types';
import type { AnalyzerPoint } from '../../rf/instruments';
import { FACE_ART } from '../bench/bench-art';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, fmt, h, select } from '../ui-kit';
import './instruments.css';
import { paintedFace } from './painted-face';
import { inService, numInput, setText, T } from './panel-util';
import { TrxKnob } from './trx-knob';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 400;
const H = 350;
const PAD = { l: 30, r: 8, t: 8, b: 18 };
const SWR_MAX = 10;
const REFERENCE_KINDS = ['cal-load', 'dummy-load', 'adapter', 'coax', 'antenna'];

const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));

  return e;
};

export class AnalyzerPanel implements StationPanel {
  readonly id = 'analyzer';
  readonly title = 'Antenna analyzer';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private an_ = 'an1';
  private start_!: HTMLInputElement;
  private stop_!: HTMLInputElement;
  private points_!: HTMLInputElement;
  private ref_!: HTMLSelectElement;
  private plot_!: SVGSVGElement;
  private min_!: HTMLElement;
  private flag_!: HTMLElement;
  private calStatus_!: HTMLElement;
  private status_!: HTMLElement;
  private sweep_: { points: AnalyzerPoint[]; minSwr: { fMHz: number; swr: number } | null; uncalibrated: boolean; flags: string[]; m: HamMeasurement | null } | null = null;
  private refSig_ = '';
  private refSlot_!: HTMLElement;
  private refKnob_: TrxKnob | null = null;

  isRelevant(m: HamStationManager): boolean {
    return inService(m, 'analyzer').length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const d = (this.an_ = inService(ctx.manager, 'analyzer')[0]?.id ?? 'an1');
    this.start_ = numInput(T('ham-analyzer', d, 'start'), 'Start MHz', 140, 0.5, 0.1, 1000);
    this.stop_ = numInput(T('ham-analyzer', d, 'stop'), 'Stop MHz', 150, 0.5, 0.1, 1000);
    this.points_ = numInput(T('ham-analyzer', d, 'points'), 'Points', 41, 1, 2, 401);
    this.ref_ = select(T('ham-analyzer', d, 'cal-ref'), 'Calibration reference', [{ value: '', label: 'At analyzer port' }], '');
    this.ref_.addEventListener('change', () => this.refKnob_?.show(this.ref_.selectedIndex));
    this.plot_ = svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      class: 'ham-plot',
      role: 'img',
      'aria-label': 'SWR versus frequency',
      'data-testid': T('ham-analyzer', d, 'plot'),
    }) as SVGSVGElement;
    this.min_ = h('div', { class: 'small', 'data-testid': T('ham-analyzer', d, 'min') });
    this.flag_ = h('div', { class: 'small text-warning', 'data-testid': T('ham-analyzer', d, 'flag') });
    this.calStatus_ = h('span', { class: 'small text-muted', 'data-testid': T('ham-analyzer', d, 'cal-status') });
    this.status_ = h('div', { class: 'small text-muted', 'data-testid': T('ham-analyzer', d, 'status') });

    // Painted face (issue 307): the plot is the screen, the three entry windows hold the start, stop and
    // point count, the keys sweep and calibrate, and the rotary picks the calibration reference
    const entry = (cap: string, input: HTMLInputElement): HTMLElement => {
      input.classList.remove('form-control', 'form-control-sm');

      return h('div', { class: 'pf-window' }, h('span', { class: 'pf-cap', text: cap }), input);
    };
    const sweepKey = button(T('ham-analyzer', d, 'sweep'), 'SWEEP', () => this.sweep_run_(), 'pf-key', 'Sweep');
    const calKey = button(T('ham-analyzer', d, 'calibrate'), 'CAL', () => this.calibrate_(), 'pf-key', 'Calibrate');
    this.refSlot_ = h('div', { class: 'analyzer-knob-slot' });
    const face = paintedFace(FACE_ART.analyzer, 'analyzer', [
      ['screen', h('div', { class: 'pf-screen' }, this.plot_)],
      ['entry1', entry('START MHz', this.start_)],
      ['entry2', entry('STOP MHz', this.stop_)],
      ['entry3', entry('POINTS', this.points_)],
      ['keyLeft', sweepKey],
      ['keyRight', calKey],
      ['knob', this.refSlot_],
    ]);
    this.ref_.id = T('ham-analyzer', d, 'cal-ref');
    this.root_ = h(
      'div',
      { class: 'ham-instr pface-layout', 'data-testid': T('ham-analyzer', d, 'panel') },
      face,
      h(
        'div',
        { class: 'pface-side' },
        h('div', {}, h('label', { class: 'form-label', for: this.ref_.id, text: 'Calibration reference' }), this.ref_),
        this.calStatus_,
        this.min_,
        this.flag_,
        this.status_
      )
    );
    host.append(this.root_);
    this.buildRefKnob_();
    const last = ctx.manager.lastSweep();
    if (last) this.setSweep_(last.points, last.flags, last.measurement);
    this.update(ctx.manager);
  }

  private sweep_run_(): void {
    const r = this.ctx_.act({
      type: 'analyzer.sweep',
      deviceId: this.an_,
      start: Number(this.start_.value),
      stop: Number(this.stop_.value),
      points: Math.round(Number(this.points_.value)),
    });
    setText(this.status_, r.message);
    if (!r.ok) {
      this.ctx_.feedback(r.message, 'warning');

      return;
    }
    this.setSweep_(
      (r.data?.points as AnalyzerPoint[] | undefined) ?? [],
      (r.data?.flags as string[] | undefined) ?? [],
      (r.data?.measurement as HamMeasurement | undefined) ?? null
    );
  }

  private setSweep_(points: AnalyzerPoint[], flags: string[], m: HamMeasurement | null): void {
    this.sweep_ = {
      points,
      minSwr: m ? { fMHz: m.value, swr: Number(m.context?.minSwr ?? 99) } : null,
      uncalibrated: Boolean(m?.context?.uncalibrated),
      flags,
      m,
    };
    this.draw_();
  }

  private calibrate_(): void {
    const ref = this.ref_.value || null;
    const r = this.ctx_.act({ type: 'analyzer.calibrate', deviceId: this.an_, referenceDeviceId: ref });
    this.ctx_.feedback(r.message, r.ok ? 'success' : 'warning');
  }

  private draw_(): void {
    const s = this.sweep_;
    this.plot_.replaceChildren();
    if (!s || s.points.length === 0) {
      setText(this.min_, '');
      setText(this.flag_, '');

      return;
    }
    const f0 = s.points[0].fMHz;
    const f1 = s.points[s.points.length - 1].fMHz;
    const x = (f: number): number => PAD.l + ((f - f0) / Math.max(f1 - f0, 1e-9)) * (W - PAD.l - PAD.r);
    const y = (v: number): number => H - PAD.b - ((Math.min(Math.max(v, 1), SWR_MAX) - 1) / (SWR_MAX - 1)) * (H - PAD.t - PAD.b);
    for (const v of [1, 2, 3, 5, 10]) {
      this.plot_.append(svgEl('line', { class: 'grid', x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v) }));
      const t = svgEl('text', { x: 2, y: y(v) + 3 });
      t.textContent = String(v);
      this.plot_.append(t);
    }
    for (const f of [f0, (f0 + f1) / 2, f1]) {
      const t = svgEl('text', { x: x(f) - 12, y: H - 4 });
      t.textContent = fmt(f, 1);
      this.plot_.append(t);
    }
    this.plot_.append(svgEl('polyline', { class: 'trace', points: s.points.map((p) => `${x(p.fMHz).toFixed(1)},${y(p.swr).toFixed(1)}`).join(' ') }));
    if (s.minSwr) {
      this.plot_.append(svgEl('circle', { class: 'min', cx: x(s.minSwr.fMHz), cy: y(s.minSwr.swr), r: 4 }));
    }
    this.plot_.setAttribute('data-points', String(s.points.length));
    setText(this.min_, s.minSwr ? `Minimum SWR ${fmt(s.minSwr.swr, 2)} at ${fmt(s.minSwr.fMHz, 3)} MHz` : 'No dip found in this range.');
    const notes: string[] = [];
    if (s.uncalibrated || s.flags.includes('uncalibrated')) notes.push('Uncalibrated sweep: readings carry an error.');
    if (s.flags.includes('cal-reference-not-in-path')) notes.push('Calibration reference is not in the measured path.');
    setText(this.flag_, notes.join(' '));
  }

  update(m: HamStationManager): void {
    const refs = m.devices().filter((d) => !d.spare && !d.removed && REFERENCE_KINDS.includes(d.kind));
    const sig = refs.map((d) => d.id).join(',');
    if (sig !== this.refSig_) {
      this.refSig_ = sig;
      const cur = this.ref_.value;
      this.ref_.replaceChildren(h('option', { value: '', text: 'At analyzer port' }), ...refs.map((d) => h('option', { value: d.id, text: `At end of ${d.label}` })));
      this.ref_.value = cur;
      this.buildRefKnob_();
    }
    this.refKnob_?.show(this.ref_.selectedIndex);
    const cal = m.events(`calibrate:${this.an_}`);
    const last = cal[cal.length - 1];
    setText(this.calStatus_, last ? (last.data?.referenceDeviceId ? `Calibrated (cable end)` : 'Calibrated (port)') : 'Not calibrated');
  }

  /** The rotary switch over the calibration-reference select: one position per reference, sized to the list */
  private buildRefKnob_(): void {
    this.refKnob_?.dispose();
    const last = Math.max(0, this.ref_.options.length - 1);
    const knob = new TrxKnob({
      testId: `${this.ref_.id}-knob`,
      label: 'Calibration reference position',
      legend: 'CAL REF',
      min: 0,
      max: last,
      step: 1,
      detents: Array.from({ length: last + 1 }, (_, i) => i),
      size: 'mid',
      format: (v) => this.ref_.options[v]?.textContent ?? '',
      onTurn: (v) => {
        this.ref_.selectedIndex = v;
      },
    });
    knob.show(this.ref_.selectedIndex);
    this.refKnob_ = knob;
    this.refSlot_.replaceChildren(knob.el);
  }

  dispose(): void {
    this.refKnob_?.dispose();
    this.refKnob_ = null;
    this.root_?.remove();
    this.root_ = null;
  }
}
