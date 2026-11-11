/**
 * @file meter-panel - Digital multimeter face for the Station tab
 * @description A function dial (OFF, DCV, DCA, OHM, CONT; turn it, or press a printed position), red-lead
 * socket, a rotary switch for each probe (the target circuit's test points on the practice board or DC
 * system), a rotary switch for the series break-point for current readings and a Read button. Each
 * rotary switch drives a real select that reads out the position (and keeps the keyboard and test ids
 * working). Probes are placed and read in one step on Read (meter.place then meter.read).
 *
 * Test ids (<dmm> = multimeter device id):
 *   ham-meter-<dmm>-mode-{OFF|DCV|DCA|OHM|CONT}, -socket, -target, -red, -black, -series, -read,
 *   -display (value or refusal), -beep, -warning
 */
import type { MeterMode, RedSocket } from '../../dc/multimeter';
import type { HamStationManager } from '../../ham-station-manager';
import type { HamMeasurement } from '../../ham-types';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, h, select } from '../ui-kit';
import './instruments.css';
import './radio-front-panel.css';
import { inService, setText, T } from './panel-util';
import { TrxKnob } from './trx-knob';

const BOARD_POINTS: [string, string][] = [
  ['tp-supply+', 'SUP+'],
  ['tp-supply-', 'SUP−'],
  ['tp-f1-in', 'F1 IN'],
  ['tp-f1-out', 'F1 OUT'],
  ['tp-sw1-in', 'SW1 IN'],
  ['tp-sw1-out', 'SW1 OUT'],
  ['tp-r1-a', 'R1 A'],
  ['tp-r1-b', 'R1 B'],
  ['tp-q1-out', 'Q1 OUT'],
  ['tp-led-a', 'LED A'],
  ['tp-led-k', 'LED K'],
  ['tp-gnd', 'GND'],
];
const BOARD_BREAKS: [string, string][] = [
  ['r1-branch', 'R1 branch'],
  ['led-branch', 'LED branch'],
  ['supply-feed', 'Supply feed (F1)'],
];
const DC_POINTS: [string, string][] = [
  ['psu+', 'PSU +'],
  ['psu-', 'PSU −'],
  ['lead-mid', 'LEAD MID'],
  ['radio+', 'RADIO +'],
  ['radio-', 'RADIO −'],
];
const DC_BREAKS: [string, string][] = [['dc-lead', 'DC lead (inline fuse)']];
const MODES: MeterMode[] = ['OFF', 'DCV', 'DCA', 'OHM', 'CONT'];

interface Target {
  id: string;
  label: string;
  points: [string, string][];
  breaks: [string, string][];
}

const opts = (pairs: [string, string][], blank?: string): { value: string; label: string }[] => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...pairs.map(([value, label]) => ({ value, label })),
];

export class MeterPanel implements StationPanel {
  readonly id = 'meter';
  readonly title = 'Multimeter';
  private ctx_!: PanelContext;
  private dmm_ = 'dmm1';
  private targets_: Target[] = [];
  private readonly modeBtns_ = new Map<MeterMode, HTMLButtonElement>();
  private modeKnob_: TrxKnob | null = null;
  /** Rotary switches over the probe selects; rebuilt when the circuit under test changes */
  private probeKnobs_: { sel: HTMLSelectElement; knob: TrxKnob }[] = [];
  private readonly probeSlots_: { sel: HTMLSelectElement; slot: HTMLElement; legend: string }[] = [];
  private socketEl_!: HTMLSelectElement;
  private targetEl_!: HTMLSelectElement;
  private redEl_!: HTMLSelectElement;
  private blackEl_!: HTMLSelectElement;
  private seriesEl_!: HTMLSelectElement;
  private displayEl_!: HTMLElement;
  private beepEl_!: HTMLElement;
  private warnEl_!: HTMLElement;
  private socketHint_!: HTMLElement;
  private last_: { ok: boolean; text: string; m?: HamMeasurement; beep: boolean; warning: string; mode?: MeterMode; socket?: RedSocket } | null = null;
  private root_: HTMLElement | null = null;
  /** Mirror of the manager's meterState(), refreshed on every update() */
  private mode_: MeterMode = 'OFF';
  private socket_: RedSocket = 'VΩ';

  isRelevant(m: HamStationManager): boolean {
    return inService(m, 'multimeter').length > 0 || this.findTargets_(m).length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const m = ctx.manager;
    this.dmm_ = inService(m, 'multimeter')[0]?.id ?? 'dmm1';
    this.targets_ = this.findTargets_(m);
    const d = this.dmm_;
    const t0 = this.targets_[0];

    this.displayEl_ = h('div', { class: 'ham-display', 'data-testid': T('ham-meter', d, 'display'), 'aria-live': 'polite', text: '----' });
    this.beepEl_ = h('span', { class: 'ham-beep', 'data-testid': T('ham-meter', d, 'beep'), title: 'Continuity beeper' });
    this.warnEl_ = h('div', { class: 'small text-warning', 'data-testid': T('ham-meter', d, 'warning') });
    this.socketHint_ = h('div', { class: 'small text-muted' });

    const modes = h('div', { class: 'ham-modes mb-2', role: 'group', 'aria-label': 'Function positions' });
    this.modeKnob_ = new TrxKnob({
      testId: T('ham-meter', d, 'dial'),
      label: 'Function dial',
      legend: 'FUNCTION',
      min: 0,
      max: MODES.length - 1,
      step: 1,
      detents: MODES.map((_, i) => i),
      size: 'mid',
      format: (v) => `Function ${MODES[v]}`,
      onTurn: (v) => this.setMode_(MODES[v]),
    });
    this.modeKnob_.show(0);
    for (const mode of MODES) {
      const b = button(T('ham-meter', d, `mode-${mode}`), mode, () => this.setMode_(mode), 'btn btn-sm btn-outline-secondary');
      this.modeBtns_.set(mode, b);
      modes.append(b);
    }
    this.socketEl_ = select(
      T('ham-meter', d, 'socket'),
      'Red lead socket',
      [
        { value: 'VΩ', label: 'VΩ socket' },
        { value: 'A', label: 'A socket (10 A)' },
      ],
      'VΩ'
    );
    this.socketEl_.addEventListener('change', () => {
      const socket = this.socketEl_.value as RedSocket;
      if (ctx.act({ type: 'meter.socket', socket }).ok) this.socket_ = socket;
      this.update(ctx.manager);
    });
    this.targetEl_ = select(
      T('ham-meter', d, 'target'),
      'Circuit under test',
      this.targets_.map((t) => ({ value: t.id, label: t.label })),
      t0?.id ?? ''
    );
    this.targetEl_.addEventListener('change', () => this.fillPoints_());
    this.redEl_ = select(T('ham-meter', d, 'red'), 'Red probe', [], '');
    this.blackEl_ = select(T('ham-meter', d, 'black'), 'Black probe', [], '');
    this.seriesEl_ = select(T('ham-meter', d, 'series'), 'Insert in series at', [], '');
    const rotary = (label: string, sel: HTMLSelectElement, legend: string): HTMLElement => {
      const slot = h('div', { class: 'meter-knob-slot' });
      this.probeSlots_.push({ sel, slot, legend });
      sel.addEventListener('change', () => this.probeKnobs_.find((k) => k.sel === sel)?.knob.show(sel.selectedIndex));

      return h('div', { class: 'col-6 mb-2 meter-rotary' }, h('label', { class: 'form-label small mb-1', text: label }), slot, sel);
    };
    this.fillPoints_();

    const field = (label: string, el: HTMLElement, cls = 'col-6 mb-2'): HTMLElement => h('div', { class: cls }, h('label', { class: 'form-label small mb-1', text: label }), el);
    const read = button(T('ham-meter', d, 'read'), 'Read', () => this.read_(), 'btn btn-primary btn-sm');
    const row = h(
      'div',
      { class: 'row g-1' },
      rotary('Red probe', this.redEl_, 'RED'),
      rotary('Black probe', this.blackEl_, 'BLACK'),
      rotary('Insert in series at (current)', this.seriesEl_, 'SERIES'),
      field('Red lead socket', this.socketEl_)
    );
    this.root_ = h(
      'div',
      { class: 'ham-instr', 'data-testid': T('ham-meter', d, 'panel') },
      this.targets_.length > 1 ? field('Circuit', this.targetEl_, 'mb-2') : null,
      h('div', { class: 'meter-dial' }, this.modeKnob_.el, modes),
      this.displayEl_,
      h('div', { class: 'my-1' }, this.beepEl_, this.warnEl_),
      row,
      this.socketHint_,
      read
    );
    host.append(this.root_);
    this.buildProbeKnobs_();
  }

  private setMode_(mode: MeterMode): void {
    if (this.ctx_.act({ type: 'meter.mode', mode }).ok) this.mode_ = mode;
    this.update(this.ctx_.manager);
  }

  private findTargets_(m: HamStationManager): Target[] {
    const out: Target[] = [];
    for (const dev of m.devices()) {
      if (dev.spare || dev.removed) continue;
      if (m.board(dev.id)) out.push({ id: dev.id, label: dev.label, points: BOARD_POINTS, breaks: BOARD_BREAKS });
      else if (m.dcSystem(dev.id)) out.push({ id: dev.id, label: dev.label, points: DC_POINTS, breaks: DC_BREAKS });
    }

    return out;
  }

  private target_(): Target | undefined {
    return this.targets_.find((t) => t.id === this.targetEl_.value) ?? this.targets_[0];
  }

  private fill_(sel: HTMLSelectElement, pairs: { value: string; label: string }[]): void {
    sel.replaceChildren(...pairs.map((p) => h('option', { value: p.value, text: p.label })));
  }

  private fillPoints_(): void {
    const t = this.target_();
    if (!t) return;
    this.fill_(this.redEl_, opts(t.points));
    this.fill_(this.blackEl_, opts(t.points));
    this.fill_(this.seriesEl_, opts(t.breaks, 'None (across two points)'));
    this.blackEl_.selectedIndex = Math.min(1, t.points.length - 1);
    this.buildProbeKnobs_();
  }

  /** One rotary switch per probe select, sized to the circuit's list of points */
  private buildProbeKnobs_(): void {
    for (const k of this.probeKnobs_) k.knob.dispose();
    this.probeKnobs_ = [];
    for (const { sel, slot, legend } of this.probeSlots_) {
      const last = Math.max(0, sel.options.length - 1);
      const knob = new TrxKnob({
        testId: `${sel.id}-knob`,
        label: `${legend.toLowerCase()} probe position`,
        legend,
        min: 0,
        max: last,
        step: 1,
        detents: Array.from({ length: last + 1 }, (_, i) => i),
        size: 'small',
        format: (v) => sel.options[v]?.textContent ?? '',
        onTurn: (v) => {
          sel.selectedIndex = v;
        },
      });
      knob.show(sel.selectedIndex);
      knob.setDisabled(sel.disabled);
      slot.replaceChildren(knob.el);
      this.probeKnobs_.push({ sel, knob });
    }
  }

  private read_(): void {
    const t = this.target_();
    if (!t) return;
    const mode = this.mode_;
    const series = mode === 'DCA' && this.seriesEl_.value ? this.seriesEl_.value : undefined;
    const placed = this.ctx_.act({ type: 'meter.place', targetId: t.id, ...(series ? { series } : { red: this.redEl_.value, black: this.blackEl_.value }) });
    if (!placed.ok) {
      this.last_ = { ok: false, text: placed.message, beep: false, warning: '' };
      this.render_();

      return;
    }
    const r = this.ctx_.act({ type: 'meter.read' });
    const m = r.data?.measurement as HamMeasurement | undefined;
    if (!r.ok) this.last_ = { ok: false, text: r.message, beep: false, warning: '' };
    else
      this.last_ = {
        ok: true,
        text: String(m?.context?.display ?? r.message),
        m,
        beep: Boolean(m?.context?.beep),
        warning: String(r.data?.warning ?? ''),
        mode: this.mode_,
        socket: this.socket_,
      };
    this.render_();
  }

  private render_(): void {
    const l = this.last_;
    const live = this.ctx_.manager.meterState();
    const stale = Boolean(l?.m && (!this.ctx_.manager.isCurrent(l.m) || l.mode !== live.mode || l.socket !== live.redSocket));
    setText(this.displayEl_, l ? l.text : '----');
    this.displayEl_.classList.toggle('is-refused', Boolean(l && !l.ok));
    this.displayEl_.classList.toggle('is-stale', stale);
    this.displayEl_.title = stale ? 'Station changed since this reading' : '';
    this.beepEl_.classList.toggle('on', Boolean(l?.beep));
    setText(this.warnEl_, l?.warning ?? '');
  }

  update(m: HamStationManager): void {
    const s = m.meterState();
    this.mode_ = s.mode;
    this.socket_ = s.redSocket;
    for (const [mode, b] of this.modeBtns_) b.classList.toggle('active', s.mode === mode);
    this.socketEl_.value = s.redSocket;
    let hint = '';
    if (s.mode === 'DCA' && s.redSocket !== 'A') hint = 'Current reading: move the red lead to the A socket.';
    else if (s.mode !== 'DCA' && s.mode !== 'OFF' && s.redSocket === 'A') hint = 'Red lead is in the A socket: voltage and resistance need the VΩ socket.';
    setText(this.socketHint_, hint);
    this.seriesEl_.disabled = s.mode !== 'DCA';
    this.modeKnob_?.show(Math.max(0, MODES.indexOf(s.mode)));
    for (const k of this.probeKnobs_) {
      k.knob.show(k.sel.selectedIndex);
      k.knob.setDisabled(k.sel.disabled);
    }
    this.render_();
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
    this.modeBtns_.clear();
    this.modeKnob_?.dispose();
    for (const k of this.probeKnobs_) k.knob.dispose();
    this.probeKnobs_ = [];
  }
}
