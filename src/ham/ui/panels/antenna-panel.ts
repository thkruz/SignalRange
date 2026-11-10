/**
 * @file antenna-panel - Adjustable dipole elements and directional antenna pointing
 * @description Staged inputs plus an Apply button (nothing changes until Apply). Dipoles: element
 * lengths in cm, equal-shorten helpers, orientation. Directional antennas (DF yagi, satellite
 * yagi): azimuth, elevation, polarization angle. Shows the SNR of the receiver the antenna feeds.
 *
 * Test ids (<a> = antenna device id):
 *   ham-antenna-<a>-len-a, -len-b, -shorten-1 (both -1 cm), -shorten-05 (both -0.5 cm), -apply,
 *   -orientation, -az, -el, -pol, -apply-dir, -rssi
 */
import type { HamStationManager } from '../../ham-station-manager';
import type { AntennaState } from '../../rf/antenna-model';
import type { DeviceRuntime } from '../../station/station-devices';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, fmt, h, select } from '../ui-kit';
import './instruments.css';
import { numInput, setIfIdle, setText, T } from './panel-util';

const DIRECTIONAL = ['dual-band-yagi', 'df-yagi'];

interface AntView {
  id: string;
  root: HTMLElement;
  kind: 'dipole' | 'directional';
  inputs: Record<string, HTMLInputElement>;
  orient?: HTMLSelectElement;
  rssi: HTMLElement;
  dirty: boolean;
}

const cm = (m: number): string => (Math.round(m * 1000) / 10).toString();

export class AntennaPanel implements StationPanel {
  readonly id = 'antenna';
  readonly title = 'Antenna';
  private ctx_!: PanelContext;
  private readonly views_ = new Map<string, AntView>();

  private list_(m: HamStationManager): Readonly<DeviceRuntime>[] {
    return m
      .devices()
      .filter((d) => d.kind === 'antenna' && !d.spare && !d.removed && d.antenna && (d.antenna.kind === 'adjustable-dipole' || DIRECTIONAL.includes(d.antenna.kind)));
  }

  isRelevant(m: HamStationManager): boolean {
    return this.list_(m).length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    for (const d of this.list_(ctx.manager)) this.build_(host, d);
    this.update(ctx.manager);
  }

  private field_(v: AntView, key: string, label: string, step: number, min?: number, max?: number): HTMLElement {
    const i = numInput(T('ham-antenna', v.id, key), label, 0, step, min, max);
    i.addEventListener('input', () => (v.dirty = true));
    v.inputs[key] = i;

    return h('div', { class: 'col-4' }, h('label', { class: 'form-label small mb-1', text: label }), i);
  }

  private build_(host: HTMLElement, d: Readonly<DeviceRuntime>): void {
    const ctx = this.ctx_;
    const dipole = d.antenna?.kind === 'adjustable-dipole';
    const v: AntView = {
      id: d.id,
      root: h('div'),
      kind: dipole ? 'dipole' : 'directional',
      inputs: {},
      rssi: h('span', { 'data-testid': T('ham-antenna', d.id, 'rssi'), text: '-' }),
      dirty: false,
    };
    const apply = (a: Parameters<PanelContext['act']>[0]): void => {
      const r = ctx.act(a);
      v.dirty = !r.ok;
      ctx.feedback(r.message, r.ok ? 'success' : 'warning');
    };
    let body: HTMLElement;
    if (dipole) {
      const shorten = (cmBy: number): void => {
        for (const k of ['len-a', 'len-b']) v.inputs[k].value = String(Math.max(0, Math.round((Number(v.inputs[k].value) - cmBy) * 10) / 10));
        v.dirty = true;
      };
      const orient = select(
        T('ham-antenna', d.id, 'orientation'),
        'Orientation',
        [
          { value: 'vertical', label: 'Vertical' },
          { value: 'horizontal', label: 'Horizontal' },
        ],
        'vertical'
      );
      orient.addEventListener('change', () => apply({ type: 'antenna.adjust', deviceId: d.id, orientation: orient.value as AntennaState['orientation'] }));
      v.orient = orient;
      body = h(
        'div',
        {},
        h(
          'div',
          { class: 'row g-1 mb-2' },
          this.field_(v, 'len-a', 'Element A (cm)', 0.5, 5, 200),
          this.field_(v, 'len-b', 'Element B (cm)', 0.5, 5, 200),
          h('div', { class: 'col-4' }, h('label', { class: 'form-label small mb-1', text: 'Orientation' }), orient)
        ),
        h(
          'div',
          { class: 'ham-row' },
          button(T('ham-antenna', d.id, 'shorten-1'), 'Both −1 cm', () => shorten(1), 'btn btn-sm btn-outline-secondary'),
          button(T('ham-antenna', d.id, 'shorten-05'), 'Both −0.5 cm', () => shorten(0.5), 'btn btn-sm btn-outline-secondary'),
          button(
            T('ham-antenna', d.id, 'apply'),
            'Apply',
            () => apply({ type: 'antenna.adjust', deviceId: d.id, elementLengthsM: [Number(v.inputs['len-a'].value) / 100, Number(v.inputs['len-b'].value) / 100] }),
            'btn btn-sm btn-primary'
          )
        )
      );
    } else {
      body = h(
        'div',
        {},
        h(
          'div',
          { class: 'row g-1 mb-2' },
          this.field_(v, 'az', 'Azimuth (°)', 1, 0, 360),
          this.field_(v, 'el', 'Elevation (°)', 1, 0, 90),
          this.field_(v, 'pol', 'Polarization (°)', 5, 0, 90)
        ),
        h(
          'div',
          { class: 'ham-row' },
          button(
            T('ham-antenna', d.id, 'apply-dir'),
            'Apply',
            () => apply({ type: 'antenna.adjust', deviceId: d.id, azDeg: Number(v.inputs.az.value), elDeg: Number(v.inputs.el.value), polAngleDeg: Number(v.inputs.pol.value) }),
            'btn btn-sm btn-primary'
          )
        )
      );
    }
    v.root = h(
      'div',
      { class: 'ham-instr mb-3', 'data-testid': T('ham-antenna', d.id, 'panel') },
      h('div', { class: 'small fw-bold mb-1', text: d.label }),
      body,
      h('div', { class: 'ham-kv mt-2' }, h('span', { text: 'Receiver signal (SNR)' }), v.rssi)
    );
    host.append(v.root);
    this.views_.set(d.id, v);
  }

  private feedSnr_(m: HamStationManager, antennaId: string): string {
    for (const rx of m.devices()) {
      const f = rx.radio?.vfoMHz;
      if (!f || rx.spare || rx.removed) continue;
      if (m.rfPath(rx.id, f).antennaDeviceId !== antennaId) continue;
      const live = m.liveReception(rx.id);
      if (live.length === 0) return `no signal on ${rx.label}`;
      return `${fmt(Math.max(...live.map((e) => e.snrDb)), 1)} dB (${rx.label})`;
    }

    return 'no receiver connected';
  }

  update(m: HamStationManager): void {
    for (const v of this.views_.values()) {
      const a = m.device(v.id)?.antenna;
      if (!a) continue;
      if (!v.dirty) {
        if (v.kind === 'dipole') {
          setIfIdle(v.inputs['len-a'], cm(a.elementLengthsM[0]));
          setIfIdle(v.inputs['len-b'], cm(a.elementLengthsM[1]));
        } else {
          setIfIdle(v.inputs.az, String(a.azDeg));
          setIfIdle(v.inputs.el, String(a.elDeg));
          setIfIdle(v.inputs.pol, String(a.polAngleDeg));
        }
      }
      if (v.orient && document.activeElement !== v.orient) v.orient.value = a.orientation;
      setText(v.rssi, this.feedSnr_(m, v.id));
    }
  }

  dispose(): void {
    for (const v of this.views_.values()) v.root.remove();
    this.views_.clear();
  }
}
