/**
 * @file dc-panel - DC power system: source toggle, supply/battery readouts, lead and fuse, brownout capture
 * @description Shows only what a real station would: the supply panel meter (V and A), battery
 * state of charge for battery sources, the fuse rating, and the last brownout capture once a
 * radio reset has actually happened. Lead resistance and polarity are found with the multimeter
 * or Inspect; revealed faults get Repair buttons (replace lead keeps the original fuse rating).
 *
 * Test ids (<dc> = power-supply/battery device id):
 *   ham-dc-<dc>-source (connected toggle), -volts, -amps, -soc, -wh, -fuse, -radio, -inspect,
 *   -brownout, -fault-<faultId>, -repair-<faultId>, -install-<spareId>
 */
import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, fmt, h } from '../ui-kit';
import './instruments.css';
import { kv, setText, spares, T } from './panel-util';

interface DcView {
  id: string;
  root: HTMLElement;
  source: HTMLInputElement;
  volts: HTMLElement;
  amps: HTMLElement;
  soc: HTMLElement | null;
  wh: HTMLElement | null;
  fuse: HTMLElement;
  radio: HTMLElement;
  brownout: HTMLElement;
  faults: HTMLElement;
  installs: HTMLElement;
  sig: string;
}

export class DcPanel implements StationPanel {
  readonly id = 'dc';
  readonly title = 'DC power';
  private ctx_!: PanelContext;
  private readonly views_ = new Map<string, DcView>();

  private ids_(m: HamStationManager): string[] {
    return m
      .devices()
      .filter((d) => !d.spare && !d.removed && (d.kind === 'power-supply' || d.kind === 'battery') && m.dcSystem(d.id))
      .map((d) => d.id);
  }

  isRelevant(m: HamStationManager): boolean {
    return this.ids_(m).length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    for (const id of this.ids_(ctx.manager)) this.build_(host, id);
    this.update(ctx.manager);
  }

  private build_(host: HTMLElement, id: string): void {
    const ctx = this.ctx_;
    const dc = ctx.manager.dcSystem(id);
    const isBattery = dc?.state.source === 'battery';
    const input = h('input', { type: 'checkbox', class: 'form-check-input', id: T('ham-dc', id, 'source'), 'data-testid': T('ham-dc', id, 'source') });
    input.addEventListener('change', () => {
      const r = ctx.act({ type: 'power', deviceId: id, on: input.checked });
      ctx.feedback(r.message, r.ok ? 'info' : 'warning');
    });
    const vEl = h('span', { 'data-testid': T('ham-dc', id, 'volts') });
    const aEl = h('span', { 'data-testid': T('ham-dc', id, 'amps') });
    const socEl = isBattery ? h('span', { 'data-testid': T('ham-dc', id, 'soc') }) : null;
    const whEl = isBattery ? h('span', { 'data-testid': T('ham-dc', id, 'wh') }) : null;
    const fuse = h('span', { 'data-testid': T('ham-dc', id, 'fuse') });
    const radio = h('span', { 'data-testid': T('ham-dc', id, 'radio') });
    const brownout = h('div', { class: 'alert alert-danger py-1 px-2 mt-2 small d-none', 'data-testid': T('ham-dc', id, 'brownout') });
    const faults = h('div', { class: 'mt-2' });
    const installs = h('div', { class: 'ham-row mt-2' });
    const inspect = button(T('ham-dc', id, 'inspect'), 'Inspect lead and connectors', () => {
      const r = ctx.act({ type: 'inspect', targetId: id });
      ctx.feedback(r.message, r.ok ? 'info' : 'warning');
    });
    const root = h(
      'div',
      { class: 'ham-instr mb-3', 'data-testid': T('ham-dc', id, 'panel') },
      h('label', { class: 'form-check form-switch mb-2' }, input, h('span', { class: 'form-check-label', text: isBattery ? 'Battery connected' : 'Supply connected' })),
      kv(isBattery ? 'Terminal voltage' : 'Supply meter, volts', vEl),
      kv(isBattery ? 'Load current' : 'Supply meter, amps', aEl),
      socEl ? kv('Charge', socEl) : null,
      whEl ? kv('Energy left', whEl) : null,
      kv('Inline fuse', fuse),
      kv('Radio', radio),
      brownout,
      h('div', { class: 'mt-2' }, inspect),
      faults,
      installs
    );
    host.append(root);
    this.views_.set(id, { id, root, source: input, volts: vEl, amps: aEl, soc: socEl, wh: whEl, fuse, radio, brownout, faults, installs, sig: '' });
  }

  update(m: HamStationManager): void {
    for (const v of this.views_.values()) {
      const dc = m.dcSystem(v.id);
      if (!dc) continue;
      const s = dc.state;
      const me = dc.measure();
      v.source.checked = s.sourceConnected;
      setText(v.volts, s.sourceConnected ? `${fmt(me.vSource, 1)} V` : '0.0 V');
      setText(v.amps, s.sourceConnected ? `${fmt(me.currentA, 1)} A` : '0.0 A');
      if (v.soc) setText(v.soc, `${Math.round(dc.batterySoc() * 100)} %`);
      if (v.wh) setText(v.wh, `${fmt(s.battery.energyWh, 1)} Wh`);
      setText(v.fuse, s.fuseBlown ? `${s.fuseRatingA} A BLOWN` : `${s.fuseRatingA} A ok`);
      v.fuse.className = s.fuseBlown ? 'text-danger' : '';
      setText(v.radio, s.radioState === 'rebooting' ? 'rebooting' : s.sourceConnected && !s.fuseBlown && !s.polarityReversed ? 'powered' : 'no power');
      const b = s.lastBrownout;
      const happened = s.resetCount > 0 && b !== null;
      v.brownout.classList.toggle('d-none', !happened);
      if (happened && b)
        setText(
          v.brownout,
          `Radio reset during transmit. Captured: source ${fmt(b.vSource, 1)} V, at radio ${fmt(b.vRadio, 1)} V, ${fmt(b.currentA, 1)} A (t = ${Math.round(b.timeS)} s).`
        );
      this.syncActions_(m, v);
    }
  }

  private syncActions_(m: HamStationManager, v: DcView): void {
    const inspected = m.events(`inspect:${v.id}`).length > 0;
    const faults = inspected ? m.faults().filter((f) => f.target === v.id && !f.cleared) : [];
    const fuseSpares = spares(m).filter((d) => d.fuseRatingA !== undefined);
    const sig = `${faults.map((f) => f.id).join(',')}|${fuseSpares.map((d) => d.id).join(',')}`;
    if (sig === v.sig) return;
    v.sig = sig;
    const run = (a: Parameters<PanelContext['act']>[0]): void => {
      const r = this.ctx_.act(a);
      this.ctx_.feedback(r.message, r.ok ? 'success' : 'warning');
    };
    v.faults.replaceChildren(
      ...faults.map((f) =>
        h(
          'div',
          { class: 'alert alert-warning py-1 px-2 mb-1 d-flex justify-content-between align-items-center', 'data-testid': T('ham-dc', v.id, 'fault', f.id) },
          h('span', { class: 'small', text: f.inspectClue }),
          f.clearedBy.action === 'repair'
            ? button(
                T('ham-dc', v.id, 'repair', f.id),
                f.kind === 'high-resistance-lead' ? 'Replace lead (keep fuse)' : 'Fix',
                () => run({ type: 'repair', faultId: f.id }),
                'btn btn-sm btn-warning'
              )
            : null
        )
      )
    );
    v.installs.replaceChildren(
      ...fuseSpares.map((d) =>
        button(
          T('ham-dc', v.id, 'install', d.id),
          `Fit ${d.label} (${d.fuseRatingA} A)`,
          () => run({ type: 'install', spareId: d.id, replaces: v.id }),
          'btn btn-sm btn-outline-secondary'
        )
      )
    );
  }

  dispose(): void {
    for (const v of this.views_.values()) v.root.remove();
    this.views_.clear();
  }
}
