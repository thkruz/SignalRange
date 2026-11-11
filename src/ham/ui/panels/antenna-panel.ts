/**
 * @file antenna-panel - Adjustable dipole elements and directional antenna pointing
 * @description Held as an instrument (bench/instrument-face.ts). Dipoles: telescoping elements, so the
 * lengths in cm take effect the moment a field is committed (Enter or leaving it); the shorten keys act
 * at once; orientation is immediate. Directional antennas (DF yagi, satellite yagi): azimuth, elevation,
 * polarization turn the antenna the moment the field is committed, as turning a real rotator would. The
 * fields always show where the antenna is (a refused or abandoned entry snaps back). There is no Apply.
 * Shows the SNR of the receiver the antenna feeds.
 *
 * Test ids (<a> = antenna device id):
 *   ham-antenna-<a>-len-a, -len-b, -shorten-1 (both -1 cm), -shorten-05 (both -0.5 cm),
 *   -orientation, -az, -el, -pol, -rssi
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
    i.addEventListener('change', () =>
      key === 'len-a' || key === 'len-b' ? this.setLengths_(v, Number(v.inputs['len-a'].value), Number(v.inputs['len-b'].value)) : this.turn_(v)
    );
    v.inputs[key] = i;

    return h('div', { class: 'col-4' }, h('label', { class: 'form-label small mb-1', text: label }), i);
  }

  /** Turn a directional antenna to the three fields now */
  private turn_(v: AntView): void {
    const r = this.ctx_.act({
      type: 'antenna.adjust',
      deviceId: v.id,
      azDeg: Number(v.inputs.az.value),
      elDeg: Number(v.inputs.el.value),
      polAngleDeg: Number(v.inputs.pol.value),
    });
    this.ctx_.feedback(r.message, r.ok ? 'success' : 'warning');
    if (!r.ok) this.syncFields_(this.ctx_.manager, v);
  }

  /** Set both dipole element lengths (cm) now */
  private setLengths_(v: AntView, aCm: number, bCm: number): void {
    const r = this.ctx_.act({ type: 'antenna.adjust', deviceId: v.id, elementLengthsM: [aCm / 100, bCm / 100] });
    this.ctx_.feedback(r.message, r.ok ? 'success' : 'warning');
    this.syncFields_(this.ctx_.manager, v);
  }

  private syncFields_(m: HamStationManager, v: AntView): void {
    const a = m.device(v.id)?.antenna;
    if (!a) return;
    if (v.kind === 'dipole') {
      setIfIdle(v.inputs['len-a'], cm(a.elementLengthsM[0]));
      setIfIdle(v.inputs['len-b'], cm(a.elementLengthsM[1]));
    } else {
      setIfIdle(v.inputs.az, String(a.azDeg));
      setIfIdle(v.inputs.el, String(a.elDeg));
      setIfIdle(v.inputs.pol, String(a.polAngleDeg));
    }
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
    };
    const apply = (a: Parameters<PanelContext['act']>[0]): void => {
      const r = ctx.act(a);
      ctx.feedback(r.message, r.ok ? 'success' : 'warning');
    };
    let body: HTMLElement;
    if (dipole) {
      const shorten = (cmBy: number): void => {
        const next = ['len-a', 'len-b'].map((k) => Math.max(0, Math.round((Number(v.inputs[k].value) - cmBy) * 10) / 10));
        this.setLengths_(v, next[0], next[1]);
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
          button(T('ham-antenna', d.id, 'shorten-05'), 'Both −0.5 cm', () => shorten(0.5), 'btn btn-sm btn-outline-secondary')
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
        h('div', { class: 'small text-muted', text: 'The antenna turns as soon as you set a number (Enter, or leave the field).' })
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
      this.syncFields_(m, v);
      if (v.orient && document.activeElement !== v.orient) v.orient.value = a.orientation;
      setText(v.rssi, this.feedSnr_(m, v.id));
    }
  }

  dispose(): void {
    for (const v of this.views_.values()) v.root.remove();
    this.views_.clear();
  }
}
