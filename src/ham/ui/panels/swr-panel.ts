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
import type { PanelContext, StationPanel } from '../station-panel';
import { button, fmt, h } from '../ui-kit';
import './instruments.css';
import { inService, kv, setText, T } from './panel-util';

const TERMINATION_TEXT: Record<string, string> = {
  antenna: 'antenna',
  'dummy-load': 'dummy load',
  'cal-load': 'calibration load',
  analyzer: 'antenna analyzer',
  open: 'open (nothing connected)',
};

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
    this.fwd_ = h('span', { 'data-testid': T('ham-swr', d, 'fwd'), text: '-' });
    this.ref_ = h('span', { 'data-testid': T('ham-swr', d, 'ref'), text: '-' });
    this.swr_ = h('span', { 'data-testid': T('ham-swr', d, 'swr'), text: '-' });
    this.term_ = h('span', { 'data-testid': T('ham-swr', d, 'termination'), text: '-' });
    this.status_ = h('div', { class: 'small text-muted', 'data-testid': T('ham-swr', d, 'status') });
    this.flag_ = h('div', { class: 'small text-warning', 'data-testid': T('ham-swr', d, 'flag') });
    const read = button(T('ham-swr', d, 'read'), 'Read (while keyed)', () => this.read_(), 'btn btn-primary btn-sm');
    const loads = h('div', { class: 'mt-3' });
    for (const l of inService(m, 'dummy-load')) {
      const fill = h('span');
      const bar = h('div', { class: 'ham-heat', 'data-testid': T('ham-swr', l.id, 'heat'), role: 'progressbar', 'aria-label': `${l.label} heat` }, fill);
      const warn = h('div', { class: 'small text-danger', 'data-testid': T('ham-swr', l.id, 'heat-warning') });
      this.heat_.set(l.id, { bar, fill, warn });
      loads.append(h('div', { class: 'small mb-1', text: `${l.label} heat` }), bar, warn);
    }
    this.root_ = h(
      'div',
      { class: 'ham-instr', 'data-testid': T('ham-swr', d, 'panel') },
      kv('Forward', this.fwd_),
      kv('Reflected', this.ref_),
      kv('SWR', this.swr_),
      kv('Terminated in', this.term_),
      h('div', { class: 'mt-2' }, read),
      this.status_,
      this.flag_,
      loads
    );
    host.append(this.root_);
    this.update(m);
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
