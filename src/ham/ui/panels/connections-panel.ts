/**
 * @file connections-panel - Devices, ports, cabling and repairs at the current location
 * @description Lists every device here with its ports and what each port connects to, with
 * per-connection Inspect / Seat / Disconnect, a Connect form (refusals shown inline), device
 * Inspect / Power / Move, Repair for revealed faults, Install spare, and a signal path diagram.
 * Test ids: ham-conn-<id>-<inspect|seat|disconnect|power|move|move-to|repair|install|replaces>,
 * ham-conn-new-<a|b>-<device|port>, ham-conn-new-connect, ham-conn-path-radio, ham-conn-path-text.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { DeviceRuntime } from '../../station/station-devices';
import type { PanelContext, StationPanel } from '../station-panel';
import { badge, button, card, h, PASSIVE_KINDS, PORTABLE_KINDS, RADIO_KINDS, Rebuilder, select, tid } from '../ui-kit';

type Dev = Readonly<DeviceRuntime>;

export function visibleDevices(m: HamStationManager): Dev[] {
  return m.devices().filter((d) => !d.removed && !d.spare && (d.location === m.location || PORTABLE_KINDS.includes(d.kind)));
}

/** Text diagram: antenna -> coax -> ... -> radio -> audio destination */
export function signalPath(m: HamStationManager, radioId: string): string {
  const radio = m.device(radioId);
  if (!radio) return '';
  const chain: string[] = [];
  let devId = radioId;
  const seen = new Set<string>();
  let out = m.ports(radioId).find((p) => p.role === 'rf')?.id ?? '';
  while (out && !seen.has(devId)) {
    seen.add(devId);
    const c = m.connectionAt(devId, out);
    if (!c) {
      chain.push('(open port)');
      break;
    }
    const other = c.a.deviceId === devId && c.a.portId === out ? c.b : c.a;
    chain.push(`${m.device(other.deviceId)?.label ?? other.deviceId}${c.seated ? '' : ' [loose]'}`);
    devId = other.deviceId;
    const enter = other.portId;
    out = m.ports(devId).find((p) => p.role === 'rf' && p.id !== enter)?.id ?? '';
  }
  const audio = m.ports(radioId).find((p) => p.role === 'usb-device');
  let dest = `${radio.label} speaker`;
  if (audio) {
    const c = m.connectionAt(radioId, audio.id);
    const other = c ? (c.a.deviceId === radioId ? c.b : c.a) : null;
    dest = other ? `${m.device(other.deviceId)?.label ?? other.deviceId} (USB audio)` : 'no audio destination (USB unplugged)';
  }

  return [...chain.reverse(), radio.label, dest].join(' -> ');
}

export class ConnectionsPanel implements StationPanel {
  readonly id = 'connections';
  readonly title = 'Connections & repairs';
  private ctx_!: PanelContext;
  private listHost_!: HTMLElement;
  private pathHost_!: HTMLElement;
  private formHost_!: HTMLElement;
  private readonly list_ = new Rebuilder();
  private readonly form_ = new Rebuilder();
  private readonly path_ = new Rebuilder();
  private readonly clues_ = new Map<string, string>();
  private pathRadio_ = '';
  private root_: HTMLElement | null = null;
  private pathText_: HTMLElement | null = null;

  isRelevant(m: HamStationManager): boolean {
    return m.devices().length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const c = card('ham-conn-card', this.title);
    this.root_ = c.root;
    this.listHost_ = h('div', { class: 'ham-conn-list' });
    this.formHost_ = h('div', { class: 'ham-conn-form border-top pt-2 mt-2' });
    this.pathHost_ = h('div', { class: 'ham-conn-path border-top pt-2 mt-2' });
    c.body.append(this.listHost_, this.formHost_, this.pathHost_);
    host.append(c.root);
    this.update(ctx.manager);
  }

  update(m: HamStationManager): void {
    const devs = visibleDevices(m);
    const conns = m.connections();
    const spares = m.devices().filter((d) => d.spare && !d.removed);
    const sig = JSON.stringify([
      m.location,
      devs.map((d) => [d.id, d.powered, d.location]),
      conns.map((c) => [c.id, c.seated, c.a, c.b]),
      m.faults().map((f) => [f.id, f.cleared, m.events(`inspect:${f.target}`).length > 0]),
      spares.map((d) => d.id),
      [...this.clues_.entries()],
    ]);
    this.list_.run(this.listHost_, sig, () => this.buildList_(m, devs, spares));
    this.form_.run(this.formHost_, JSON.stringify([devs.map((d) => d.id), conns.length]), () => this.buildForm_(m, devs));
    const radios = devs.filter((d) => RADIO_KINDS.includes(d.kind) || d.kind === 'sdr');
    this.path_.run(this.pathHost_, JSON.stringify([radios.map((d) => d.id), conns.map((c) => [c.id, c.seated])]), () => this.buildPath_(m, radios));
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
    this.pathText_ = null;
    this.clues_.clear();
  }

  private act_(a: Parameters<PanelContext['act']>[0], clueFor?: string): void {
    const r = this.ctx_.act(a);
    if (clueFor && r.ok) {
      this.clues_.set(clueFor, r.message);
      this.update(this.ctx_.manager);
    }
  }

  private buildList_(m: HamStationManager, devs: Dev[], spares: Dev[]): void {
    const host = this.listHost_;
    for (const d of devs) {
      const head = h('div', { class: 'd-flex flex-wrap align-items-center gap-1 mb-1' }, h('strong', { text: d.label }), badge(d.kind));
      const passive = PASSIVE_KINDS.includes(d.kind);
      if (!passive) head.append(badge(d.powered ? 'ON' : 'OFF', d.powered ? 'success' : 'secondary'));
      head.append(
        button(tid('ham-conn', d.id, 'inspect'), 'Inspect', () => this.act_({ type: 'inspect', targetId: d.id }, d.id), 'btn btn-sm btn-outline-secondary', `Inspect ${d.label}`)
      );
      if (d.kind === 'coax') {
        head.append(
          button(
            tid('ham-conn', d.id, 'dctest'),
            'DC test',
            () => this.act_({ type: 'coax.dcTest', deviceId: d.id }, d.id),
            'btn btn-sm btn-outline-secondary',
            `DC test ${d.label}`
          )
        );
      }
      if (!passive) {
        const board = d.kind === 'circuit-board';
        head.append(
          button(
            tid('ham-conn', d.id, 'power'),
            d.powered ? 'Power off' : 'Power on',
            () => this.act_(board ? { type: 'board.switch', deviceId: d.id, on: !d.powered } : { type: 'power', deviceId: d.id, on: !d.powered }),
            'btn btn-sm btn-outline-warning',
            `${d.powered ? 'Power off' : 'Power on'} ${d.label}`
          )
        );
      }
      const dest = select(
        tid('ham-conn', d.id, 'move-to'),
        `Move ${d.label} to`,
        m.config.locations.map((l) => ({ value: l.id, label: l.label })),
        d.location
      );
      dest.classList.add('w-auto');
      head.append(
        dest,
        button(
          tid('ham-conn', d.id, 'move'),
          'Move',
          () => this.act_({ type: 'move', deviceId: d.id, location: dest.value as typeof d.location }),
          'btn btn-sm btn-outline-secondary',
          `Move ${d.label}`
        )
      );
      const ports = h('ul', { class: 'list-unstyled small ms-2 mb-1' });
      for (const p of m.ports(d.id)) {
        const c = m.connectionAt(d.id, p.id);
        const other = c ? (c.a.deviceId === d.id && c.a.portId === p.id ? c.b : c.a) : null;
        const to = other ? `${m.device(other.deviceId)?.label ?? other.deviceId}.${other.portId}${c && !c.seated ? ' (loose)' : ''}` : 'open';
        ports.append(h('li', { 'data-testid': tid('ham-conn', d.id, 'port', p.id), text: `${p.label} (${p.family} ${p.gender}): ${to}` }));
      }
      host.append(h('div', { class: 'mb-2', 'data-testid': tid('ham-conn', d.id, 'device') }, head, ports));
      const clue = this.clues_.get(d.id);
      if (clue) host.append(h('div', { class: 'alert alert-info py-1 small', role: 'note', 'data-testid': tid('ham-conn', d.id, 'clue'), text: clue }));
    }
    const ids = new Set(devs.map((d) => d.id));
    const rows = m.connections().filter((c) => ids.has(c.a.deviceId) || ids.has(c.b.deviceId));
    if (rows.length > 0) host.append(h('h5', { class: 'mt-2', text: 'Connections' }));
    for (const c of rows) {
      const name = `${m.device(c.a.deviceId)?.label ?? c.a.deviceId}.${c.a.portId} to ${m.device(c.b.deviceId)?.label ?? c.b.deviceId}.${c.b.portId}`;
      host.append(
        h(
          'div',
          { class: 'd-flex flex-wrap align-items-center gap-1 mb-1', 'data-testid': tid('ham-conn', c.id, 'row') },
          h('span', { class: 'small', text: name }),
          badge(c.seated ? 'seated' : 'loose', c.seated ? 'success' : 'warning'),
          button(
            tid('ham-conn', c.id, 'inspect'),
            'Inspect',
            () => this.act_({ type: 'inspect', targetId: c.id }, c.id),
            'btn btn-sm btn-outline-secondary',
            `Inspect connection ${name}`
          ),
          button(tid('ham-conn', c.id, 'seat'), 'Seat', () => this.act_({ type: 'seat', connectionId: c.id }), 'btn btn-sm btn-outline-primary', `Seat connection ${name}`),
          button(
            tid('ham-conn', c.id, 'disconnect'),
            'Disconnect',
            () => this.act_({ type: 'disconnect', connectionId: c.id }),
            'btn btn-sm btn-outline-danger',
            `Disconnect ${name}`
          )
        )
      );
      const clue = this.clues_.get(c.id);
      if (clue) host.append(h('div', { class: 'alert alert-info py-1 small', role: 'note', 'data-testid': tid('ham-conn', c.id, 'clue'), text: clue }));
    }
    const revealed = m.faults().filter((f) => !f.cleared && m.events(`inspect:${f.target}`).length > 0);
    if (revealed.length > 0) host.append(h('h5', { class: 'mt-2', text: 'Faults found' }));
    for (const f of revealed) {
      host.append(
        h(
          'div',
          { class: 'd-flex flex-wrap align-items-center gap-1 mb-1', 'data-testid': tid('ham-conn', f.id, 'fault') },
          h('span', { class: 'small', text: f.inspectClue }),
          f.clearedBy.action === 'repair'
            ? button(tid('ham-conn', f.id, 'repair'), 'Repair', () => this.act_({ type: 'repair', faultId: f.id }), 'btn btn-sm btn-outline-success', `Repair ${f.target}`)
            : null
        )
      );
    }
    if (spares.length > 0) host.append(h('h5', { class: 'mt-2', text: 'Spares shelf' }));
    for (const s of spares) {
      const targets = m.devices().filter((d) => !d.spare && !d.removed && d.kind === s.kind);
      const sel = select(
        tid('ham-conn', s.id, 'replaces'),
        `Replace which ${s.kind}`,
        targets.map((d) => ({ value: d.id, label: d.label })),
        targets[0]?.id ?? ''
      );
      sel.classList.add('w-auto');
      host.append(
        h(
          'div',
          { class: 'd-flex flex-wrap align-items-center gap-1 mb-1', 'data-testid': tid('ham-conn', s.id, 'spare') },
          h('span', { class: 'small', text: `${s.label} replaces` }),
          sel,
          button(
            tid('ham-conn', s.id, 'install'),
            'Install spare',
            () => this.act_({ type: 'install', spareId: s.id, replaces: sel.value }),
            'btn btn-sm btn-outline-success',
            `Install ${s.label}`
          )
        )
      );
    }
  }

  private buildForm_(m: HamStationManager, devs: Dev[]): void {
    const opts = devs.map((d) => ({ value: d.id, label: d.label }));
    const side = (which: 'a' | 'b'): { dev: HTMLSelectElement; port: HTMLSelectElement } => {
      const dev = select(tid('ham-conn-new', which, 'device'), `Device ${which.toUpperCase()}`, opts, opts[0]?.value ?? '');
      const port = select(tid('ham-conn-new', which, 'port'), `Port ${which.toUpperCase()}`, [], '');
      const fill = (): void => {
        port.replaceChildren(...m.ports(dev.value).map((p) => h('option', { value: p.id, text: `${p.label} (${p.family} ${p.gender})` })));
      };
      dev.addEventListener('change', fill);
      fill();

      return { dev, port };
    };
    const a = side('a');
    const b = side('b');
    if (opts.length > 1) {
      b.dev.value = opts[1].value;
      b.dev.dispatchEvent(new Event('change'));
    }
    const go = button(
      tid('ham-conn-new', 'connect'),
      'Connect',
      () => this.act_({ type: 'connect', a: { deviceId: a.dev.value, portId: a.port.value }, b: { deviceId: b.dev.value, portId: b.port.value } }),
      'btn btn-sm btn-primary'
    );
    const col = (e: HTMLElement): HTMLElement => h('div', { class: 'col-6 col-md-3' }, e);
    this.formHost_.append(
      h('h5', { text: 'Connect two ports' }),
      h('div', { class: 'row g-1' }, col(a.dev), col(a.port), col(b.dev), col(b.port)),
      h('div', { class: 'mt-1' }, go)
    );
  }

  private buildPath_(m: HamStationManager, radios: Dev[]): void {
    if (radios.length === 0) {
      this.pathText_ = null;
      return;
    }
    if (!radios.some((r) => r.id === this.pathRadio_)) this.pathRadio_ = radios[0].id;
    const sel = select(
      'ham-conn-path-radio',
      'Radio for signal path',
      radios.map((r) => ({ value: r.id, label: r.label })),
      this.pathRadio_
    );
    sel.classList.add('w-auto');
    this.pathText_ = h('code', { class: 'd-block small mt-1', id: 'ham-conn-path-text', 'data-testid': 'ham-conn-path-text', text: signalPath(m, this.pathRadio_) });
    const text = this.pathText_;
    sel.addEventListener('change', () => {
      this.pathRadio_ = sel.value;
      text.textContent = signalPath(this.ctx_.manager, sel.value);
    });
    this.pathHost_.append(h('h5', { text: 'Signal path' }), sel, this.pathText_);
  }
}
