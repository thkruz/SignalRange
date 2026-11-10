/**
 * @file satellite-panel - FM satellite pass info, optional Doppler help, isolation path, access tone
 * @description Doppler-corrected frequencies stay hidden until the player has retuned a radio by
 * hand (VFO differs from its authored start) or switches on "Show computed Doppler".
 *
 * Test ids:
 *   ham-sat-pass-az, -el, -range, -horizon, -doppler-toggle, -doppler-uplink, -doppler-downlink,
 *   -isolation-path, -isolation-status, -tone, -sat-name
 */
import type { HamStationManager } from '../../ham-station-manager';
import { ISOLATION_DB } from '../../ops/satellite-link';
import type { PanelContext, StationPanel } from '../station-panel';
import { badge, fmt, h } from '../ui-kit';
import './instruments.css';
import { kv, setText, T } from './panel-util';

const RADIO_KINDS = ['handheld', 'mobile', 'dmr-handheld', 'hf-rig'];

const pathName = (db: number): string => {
  if (db >= ISOLATION_DB.duplexer - 5) return 'Duplexer (about 60 dB)';
  if (db >= ISOLATION_DB.spacedAntennas - 5) return 'Spaced antennas (about 30 dB)';
  if (db <= ISOLATION_DB.splitter + 5) return 'Splitter only (about 6 dB)';

  return `Custom (${Math.round(db)} dB)`;
};

export class SatellitePanel implements StationPanel {
  readonly id = 'satellite';
  readonly title = 'Satellite pass';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private showDoppler_ = false;
  private toggle_!: HTMLInputElement;
  private az_!: HTMLElement;
  private el_!: HTMLElement;
  private range_!: HTMLElement;
  private horizon_!: HTMLElement;
  private upRow_!: HTMLElement;
  private downRow_!: HTMLElement;
  private up_!: HTMLElement;
  private down_!: HTMLElement;
  private path_!: HTMLElement;
  private status_!: HTMLElement;

  isRelevant(m: HamStationManager): boolean {
    return m.config.satellite !== undefined && m.satelliteState() !== undefined;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const sat = ctx.manager.config.satellite;
    this.az_ = h('span', { 'data-testid': T('ham-sat', 'pass', 'az'), text: '-' });
    this.el_ = h('span', { 'data-testid': T('ham-sat', 'pass', 'el'), text: '-' });
    this.range_ = h('span', { 'data-testid': T('ham-sat', 'pass', 'range'), text: '-' });
    this.horizon_ = h('span', { 'data-testid': T('ham-sat', 'pass', 'horizon'), text: '-' });
    this.up_ = h('span', { 'data-testid': T('ham-sat', 'doppler', 'uplink') });
    this.down_ = h('span', { 'data-testid': T('ham-sat', 'doppler', 'downlink') });
    this.upRow_ = h('div', { class: 'ham-kv' }, h('span', { text: 'Transmit on (suggested)' }), this.up_);
    this.downRow_ = h('div', { class: 'ham-kv' }, h('span', { text: 'Listen on (suggested)' }), this.down_);
    this.path_ = h('span', { 'data-testid': T('ham-sat', 'isolation', 'path') });
    this.status_ = h('span', { 'data-testid': T('ham-sat', 'isolation', 'status') });
    this.toggle_ = h('input', { type: 'checkbox', class: 'form-check-input', id: 'ham-sat-doppler-toggle', 'data-testid': 'ham-sat-doppler-toggle' });
    this.toggle_.addEventListener('change', () => {
      this.showDoppler_ = this.toggle_.checked;
      this.update(this.ctx_.manager);
    });
    this.root_ = h(
      'div',
      { class: 'ham-instr', 'data-testid': 'ham-sat-panel' },
      h('div', { class: 'small fw-bold mb-1', 'data-testid': 'ham-sat-sat-name', text: sat?.name ?? 'Satellite' }),
      kv('Azimuth', this.az_),
      kv('Elevation', this.el_),
      kv('Range', this.range_),
      kv('Status', this.horizon_),
      h(
        'div',
        { class: 'form-check form-switch my-2' },
        this.toggle_,
        h('label', { class: 'form-check-label small', for: 'ham-sat-doppler-toggle', text: 'Show computed Doppler' })
      ),
      this.upRow_,
      this.downRow_,
      h('hr', { class: 'my-2' }),
      kv('Uplink isolation', this.path_),
      kv('Receiver protection', this.status_),
      h('div', { class: 'small text-muted mt-2', 'data-testid': 'ham-sat-tone', text: `Remember the access tone: ${sat?.accessToneHz ?? 67} Hz on your transmit side.` })
    );
    host.append(this.root_);
    this.update(ctx.manager);
  }

  private tunedManually_(m: HamStationManager): boolean {
    const start = new Map(m.config.devices.map((d) => [d.id, d.radio?.vfoMHz]));
    return m.devices().some((d) => RADIO_KINDS.includes(d.kind) && d.radio && start.get(d.id) !== undefined && Math.abs(d.radio.vfoMHz - (start.get(d.id) ?? 0)) > 1e-6);
  }

  update(m: HamStationManager): void {
    const st = m.satelliteState();
    const sat = m.config.satellite;
    if (!st || !sat) return;
    const g = st.geometry;
    setText(this.az_, g ? `${fmt(g.az, 0)}°` : '-');
    setText(this.el_, g ? `${fmt(g.el, 0)}°` : '-');
    setText(this.range_, g ? `${fmt(g.rangeKm, 0)} km` : '-');
    setText(this.horizon_, g ? (g.isAboveHorizon ? 'Above the horizon' : 'Below the horizon') : 'No pass data');
    this.horizon_.className = g?.isAboveHorizon ? 'text-success' : 'text-muted';

    const show = (this.showDoppler_ || this.tunedManually_(m)) && g !== null;
    this.upRow_.classList.toggle('d-none', !show);
    this.downRow_.classList.toggle('d-none', !show);
    if (show && g) {
      setText(this.up_, `${fmt(sat.uplinkMHz / g.dopplerFactor, 4)} MHz`);
      setText(this.down_, `${fmt(sat.downlinkMHz * g.dopplerFactor, 4)} MHz`);
    }
    this.toggle_.checked = this.showDoppler_;

    setText(this.path_, pathName(st.isolationDb));
    const txW = Math.max(
      0,
      ...m
        .devices()
        .filter((d) => RADIO_KINDS.includes(d.kind) && d.radio)
        .map((d) => d.radio?.txPowerW ?? 0)
    );
    const arrival = 10 * Math.log10(Math.max(txW, 1e-6) * 1000) - st.isolationDb;
    const over = sat.overloadDbm ?? -20;
    const dmg = sat.damageDbm ?? 10;
    const status = arrival >= dmg ? 'unsafe' : arrival >= over ? 'desense' : 'ok';
    this.status_.replaceChildren(
      badge(
        status === 'ok' ? 'OK' : status === 'desense' ? 'Receiver desensed' : 'UNSAFE: SDR can be damaged',
        status === 'ok' ? 'success' : status === 'desense' ? 'warning' : 'danger'
      )
    );
    this.status_.setAttribute('data-status', status);
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
  }
}
