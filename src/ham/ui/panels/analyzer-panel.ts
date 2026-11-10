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
import type { PanelContext, StationPanel } from '../station-panel';
import { button, fmt, h, select } from '../ui-kit';
import './instruments.css';
import { inService, numInput, setText, T } from './panel-util';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 400;
const H = 180;
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

    const f = (label: string, el: HTMLElement): HTMLElement => h('div', { class: 'col-4' }, h('label', { class: 'form-label small mb-1', text: label }), el);
    this.root_ = h(
      'div',
      { class: 'ham-instr', 'data-testid': T('ham-analyzer', d, 'panel') },
      h('div', { class: 'row g-1 mb-2' }, f('Start (MHz)', this.start_), f('Stop (MHz)', this.stop_), f('Points', this.points_)),
      h(
        'div',
        { class: 'ham-row' },
        button(T('ham-analyzer', d, 'sweep'), 'Sweep', () => this.sweep_run_(), 'btn btn-primary btn-sm')
      ),
      h(
        'div',
        { class: 'ham-row' },
        this.ref_,
        button(T('ham-analyzer', d, 'calibrate'), 'Calibrate', () => this.calibrate_(), 'btn btn-outline-secondary btn-sm'),
        this.calStatus_
      ),
      this.plot_,
      this.min_,
      this.flag_,
      this.status_
    );
    host.append(this.root_);
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
    const m = (r.data?.measurement as HamMeasurement | undefined) ?? null;
    this.sweep_ = {
      points: (r.data?.points as AnalyzerPoint[] | undefined) ?? [],
      minSwr: m ? { fMHz: m.value, swr: Number(m.context?.minSwr ?? 99) } : null,
      uncalibrated: Boolean(m?.context?.uncalibrated),
      flags: (r.data?.flags as string[] | undefined) ?? [],
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
    }
    const cal = m.events(`calibrate:${this.an_}`);
    const last = cal[cal.length - 1];
    setText(this.calStatus_, last ? (last.data?.referenceDeviceId ? `Calibrated (cable end)` : 'Calibrated (port)') : 'Not calibrated');
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
  }
}
