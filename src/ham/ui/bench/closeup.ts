/**
 * @file closeup - What you see when you look closely at one thing on the bench
 * @description Shows the selected device or cable with the physical things you can do to it
 * (inspect, power switch, tighten, unplug, repair, swap a spare, carry it elsewhere) and, for
 * devices that have controls, that device's own controls: the receiver program on the laptop,
 * a radio's front panel, a meter, a power supply. Instrument panels are the existing panel
 * classes, mounted once and moved in and out of the close-up as the selection changes.
 *
 * Keeps the connection-panel test ids for the physical actions:
 * ham-conn-<deviceId|connectionId|faultId|spareId>-<inspect|seat|disconnect|power|dctest|repair|install|move|clue>.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { RadioPanel } from '../panels/radio-panel';
import type { PanelContext, StationPanel } from '../station-panel';
import { badge, button, h, PASSIVE_KINDS, PORTABLE_KINDS, RADIO_KINDS, Rebuilder, tid } from '../ui-kit';
import { artForKind } from './bench-art';
import type { BenchScene, BenchSelection } from './bench-scene';
import { Faceplate } from './faceplate';
import { buildJobTagSection } from './job-tag-section';
import { jobTags } from './job-tags';
import { SdrApp } from './sdr-app';

const KIND_NAME: Record<string, string> = {
  sdr: 'USB receiver',
  handheld: 'Handheld radio',
  'dmr-handheld': 'DMR handheld',
  mobile: 'Mobile radio',
  'hf-rig': 'HF transceiver',
  laptop: 'Laptop',
  'power-supply': 'Power supply',
  battery: 'Battery',
  charger: 'Charger',
  multimeter: 'Multimeter',
  'swr-meter': 'SWR meter',
  'dummy-load': 'Dummy load',
  'cal-load': 'Calibration load',
  analyzer: 'Antenna analyzer',
  antenna: 'Antenna',
  coax: 'Coax cable',
  'dc-lead': 'DC power lead',
  adapter: 'Adapter',
  'audio-interface': 'Audio interface',
  'circuit-board': 'Circuit board',
  'noise-source': 'Noise source',
  duplexer: 'Duplexer',
  headphones: 'Headphones',
};

/**
 * Which instrument panels belong to a device kind. A scenario without a multimeter on the bench
 * still has one in the toolbox: it opens on the things it measures (`toolMeter`).
 */
function panelsFor(kind: string, toolMeter = false): string[] {
  if (toolMeter && METER_TARGET_KINDS.includes(kind)) return [...panelsForKind(kind), 'meter'];

  return panelsForKind(kind);
}

const METER_TARGET_KINDS = ['power-supply', 'battery', 'dc-lead', 'circuit-board'];

function panelsForKind(kind: string): string[] {
  if (RADIO_KINDS.includes(kind)) return ['radio'];
  switch (kind) {
    case 'laptop':
      return ['packet', 'satellite'];
    case 'multimeter':
      return ['meter'];
    case 'swr-meter':
    case 'dummy-load':
      return ['swr'];
    case 'analyzer':
    case 'cal-load':
      return ['analyzer'];
    case 'antenna':
      return ['antenna'];
    case 'circuit-board':
      return ['board'];
    case 'power-supply':
    case 'battery':
    case 'charger':
    case 'dc-lead':
      return ['dc'];
    case 'audio-interface':
      return ['packet'];
    default:
      return [];
  }
}

export class Closeup {
  readonly el: HTMLElement;
  private readonly ctx_: PanelContext;
  private readonly scene_: BenchScene;
  private readonly head_: HTMLElement;
  private readonly instruments_: HTMLElement;
  private readonly panels_: Map<string, StationPanel>;
  private readonly hosts_ = new Map<string, HTMLElement>();
  private readonly mounted_ = new Set<string>();
  private readonly sdrApp_: SdrApp;
  private readonly faceplate_: Faceplate;
  private readonly clues_ = new Map<string, string>();
  private readonly rebuild_ = new Rebuilder();
  private selection_: BenchSelection = null;
  private shownPanels_: string[] = [];

  constructor(ctx: PanelContext, scene: BenchScene, panels: StationPanel[]) {
    this.ctx_ = ctx;
    this.scene_ = scene;
    this.panels_ = new Map(panels.map((p) => [p.id, p]));
    this.head_ = h('div', { class: 'ham-closeup-head' });
    this.instruments_ = h('div', { class: 'ham-closeup-instruments' });
    this.sdrApp_ = new SdrApp(ctx);
    this.faceplate_ = new Faceplate(this.instruments_);
    this.el = h('div', { class: 'ham-closeup', id: 'ham-closeup', 'data-testid': 'ham-closeup' }, this.head_, this.instruments_);
  }

  select(s: BenchSelection): void {
    this.selection_ = s;
    this.update(this.ctx_.manager, true);
  }

  dispose(): void {
    this.faceplate_.dispose();
    this.sdrApp_.dispose();
    for (const id of this.mounted_) this.panels_.get(id)?.dispose();
    this.el.remove();
  }

  update(m: HamStationManager, force = false): void {
    const s = this.selection_;
    const sig = JSON.stringify([
      s,
      m.location,
      m.devices().map((d) => [d.id, d.powered, d.location, d.spare, d.removed]),
      m.connections().map((c) => [c.id, c.seated]),
      m.faults().map((f) => [f.id, f.cleared, m.events(`inspect:${f.target}`).length]),
      [...this.clues_.entries()],
      jobTags.version(m),
    ]);
    if (force) this.rebuild_.run(this.head_, `${sig}#${Date.now()}`, () => this.buildHead_(m));
    else this.rebuild_.run(this.head_, sig, () => this.buildHead_(m));
    this.placeInstruments_(m);
    if (this.faceplate_.active) this.faceplate_.update(m, force);
    for (const id of this.shownPanels_) {
      const p = this.panels_.get(id);
      if (p?.isRelevant(m)) p.update(m);
    }
    if (s?.kind === 'device' && m.device(s.id)?.kind === 'laptop') this.sdrApp_.update(m);
  }

  private act_(a: Parameters<PanelContext['act']>[0], clueFor?: string): void {
    const r = this.ctx_.act(a);
    if (clueFor && r.ok) this.clues_.set(clueFor, r.message);
    this.update(this.ctx_.manager, true);
  }

  private placeInstruments_(m: HamStationManager): void {
    const s = this.selection_;
    const dev = s?.kind === 'device' ? m.device(s.id) : undefined;
    const toolMeter = !m.devices().some((d) => d.kind === 'multimeter' && !d.spare && !d.removed);
    const want = dev ? panelsFor(dev.kind, toolMeter).filter((id) => this.panels_.get(id)?.isRelevant(m)) : [];
    const showSdr = dev?.kind === 'laptop';
    const key = `${dev?.id ?? ''}|${showSdr}|${want.join(',')}`;
    if (key === this.instruments_.dataset.key) return;
    this.instruments_.dataset.key = key;
    this.instruments_.replaceChildren();
    if (dev && artForKind(dev.kind)) {
      this.instruments_.append(this.faceplate_.el);
      this.faceplate_.show(dev.id);
      this.faceplate_.update(m, true);
    } else {
      this.faceplate_.hide();
    }
    if (showSdr && dev) {
      this.instruments_.append(this.sdrApp_.el);
      this.sdrApp_.show(dev.id);
    }
    for (const id of want) {
      const p = this.panels_.get(id);
      if (!p) continue;
      let host = this.hosts_.get(id);
      if (!host) {
        host = h('div', { class: 'ham-closeup-panel', 'data-panel': id });
        this.hosts_.set(id, host);
      }
      this.instruments_.append(host);
      if (!this.mounted_.has(id)) {
        p.mount(host, this.ctx_);
        this.mounted_.add(id);
      }
      if (id === 'radio' && dev) (p as RadioPanel).showDevice(dev.id);
    }
    this.shownPanels_ = want;
  }

  private buildHead_(m: HamStationManager): void {
    const s = this.selection_;
    const host = this.head_;
    if (!s) {
      host.append(h('div', { class: 'ham-closeup-empty', text: 'Click something on the bench to look at it closely.' }));
      this.appendSpares_(m, null);

      return;
    }
    if (s.kind === 'conn') {
      this.buildConn_(m, s.id);

      return;
    }
    const d = m.device(s.id);
    if (!d) return;
    const passive = PASSIVE_KINDS.includes(d.kind);
    host.append(
      h(
        'div',
        { class: 'ham-closeup-title' },
        h('strong', { text: d.label }),
        (KIND_NAME[d.kind] ?? d.kind) === d.label ? null : h('span', { class: 'text-secondary small ms-2', text: KIND_NAME[d.kind] ?? d.kind }),
        passive ? null : badge(m.energized(d.id) ? 'on' : 'off', m.energized(d.id) ? 'success' : 'secondary')
      )
    );
    const actions = h('div', { class: 'ham-closeup-actions' });
    actions.append(
      button(tid('ham-conn', d.id, 'inspect'), 'Look closely', () => this.act_({ type: 'inspect', targetId: d.id }, d.id), 'btn btn-sm btn-outline-secondary', `Inspect ${d.label}`)
    );
    if (d.kind === 'sdr') {
      actions.append(h('span', { class: 'small text-secondary', 'data-testid': tid('ham-conn', d.id, 'usb-power'), text: 'No power switch: it runs from the laptop USB port.' }));
    } else if (!passive) {
      const board = d.kind === 'circuit-board';
      const sw = button(
        tid('ham-conn', d.id, 'power'),
        d.powered ? 'Switch off' : 'Switch on',
        () => this.act_(board ? { type: 'board.switch', deviceId: d.id, on: !d.powered } : { type: 'power', deviceId: d.id, on: !d.powered }),
        `ham-power-switch${d.powered ? ' is-on' : ''}`,
        `${d.powered ? 'Switch off' : 'Switch on'} ${d.label}`
      );
      sw.setAttribute('aria-pressed', String(d.powered));
      actions.append(sw);
    }
    if (d.kind === 'coax') {
      actions.append(
        button(
          tid('ham-conn', d.id, 'dctest'),
          'Continuity test',
          () => this.act_({ type: 'coax.dcTest', deviceId: d.id }, d.id),
          'btn btn-sm btn-outline-secondary',
          `DC test ${d.label}`
        )
      );
    }
    if (m.config.locations.length > 1 && !PORTABLE_KINDS.includes(d.kind)) {
      for (const loc of m.config.locations) {
        if (loc.id === d.location) continue;
        actions.append(
          button(
            tid('ham-conn', d.id, 'move', loc.id),
            `Carry to ${loc.label}`,
            () => this.act_({ type: 'move', deviceId: d.id, location: loc.id }),
            'btn btn-sm btn-outline-secondary',
            `Carry ${d.label} to ${loc.label}`
          )
        );
      }
    }
    host.append(actions);
    const clue = this.clues_.get(d.id);
    if (clue) host.append(h('div', { class: 'ham-closeup-clue', role: 'note', 'data-testid': tid('ham-conn', d.id, 'clue'), text: clue }));
    const jobSection = buildJobTagSection(m, d.id, () => {
      this.update(this.ctx_.manager, true);
      this.scene_.render(this.ctx_.manager, true);
    });
    if (jobSection) host.append(jobSection);
    this.appendFaults_(m, [d.id]);
    // Connectors on this device
    const ports = m.ports(d.id);
    if (ports.length > 0) {
      const list = h('ul', { class: 'ham-closeup-ports', 'aria-label': `Connectors on ${d.label}` });
      for (const p of ports) {
        const c = m.connectionAt(d.id, p.id);
        const other = c ? (c.a.deviceId === d.id && c.a.portId === p.id ? c.b : c.a) : null;
        const otherLabel = other ? `${m.device(other.deviceId)?.label ?? other.deviceId}` : '';
        list.append(
          h(
            'li',
            { 'data-testid': tid('ham-conn', d.id, 'port', p.id) },
            h('span', { class: 'ham-closeup-port-name', text: p.label }),
            other
              ? button(
                  tid('ham-closeup-port', d.id, p.id),
                  `to ${otherLabel}`,
                  () => this.scene_.clickPort(d.id, p.id),
                  'btn btn-link btn-sm p-0',
                  `${p.label} connection to ${otherLabel}`
                )
              : button(
                  tid('ham-closeup-port', d.id, p.id),
                  p.gender === 'plug' ? 'not plugged in' : 'nothing plugged in',
                  () => this.scene_.clickPort(d.id, p.id),
                  'ham-closeup-port-free',
                  p.gender === 'plug' ? `Pick up the ${p.label} of ${d.label}` : `Plug something into the ${p.label} of ${d.label}`
                )
          )
        );
      }
      host.append(list);
    }
    if (d.kind === 'sdr') {
      const laptop = m.devices().find((x) => x.kind === 'laptop' && !x.removed && x.location === m.location);
      host.append(h('div', { class: 'small text-secondary mt-1', text: 'This receiver has no knobs or screen. It is run from a program on the computer it is plugged into.' }));
      if (laptop)
        host.append(
          button('ham-closeup-goto-laptop', `Look at the ${laptop.label}`, () => this.scene_.select({ kind: 'device', id: laptop.id }), 'btn btn-sm btn-outline-primary mt-1')
        );
    }
    this.appendSpares_(m, d.kind);
  }

  private buildConn_(m: HamStationManager, id: string): void {
    const c = m.connection(id);
    const host = this.head_;
    if (!c) return;
    const end = (e: { deviceId: string; portId: string }): string =>
      `${m.device(e.deviceId)?.label ?? e.deviceId} (${m.ports(e.deviceId).find((p) => p.id === e.portId)?.label ?? e.portId})`;
    const name = `${end(c.a)} to ${end(c.b)}`;
    const inspected = m.events(`inspect:${c.id}`).length > 0;
    host.append(
      h('div', { class: 'ham-closeup-title' }, h('strong', { text: 'Connection' }), inspected && !c.seated ? badge('loose', 'warning') : null),
      h('div', { class: 'small mb-2', text: name }),
      h(
        'div',
        { class: 'ham-closeup-actions' },
        button(
          tid('ham-conn', c.id, 'inspect'),
          'Look closely',
          () => this.act_({ type: 'inspect', targetId: c.id }, c.id),
          'btn btn-sm btn-outline-secondary',
          `Inspect connection ${name}`
        ),
        button(tid('ham-conn', c.id, 'seat'), 'Tighten', () => this.act_({ type: 'seat', connectionId: c.id }), 'btn btn-sm btn-outline-primary', `Seat connection ${name}`),
        button(tid('ham-conn', c.id, 'disconnect'), 'Unplug', () => this.act_({ type: 'disconnect', connectionId: c.id }), 'btn btn-sm btn-outline-danger', `Disconnect ${name}`)
      )
    );
    const clue = this.clues_.get(c.id);
    if (clue) host.append(h('div', { class: 'ham-closeup-clue', role: 'note', 'data-testid': tid('ham-conn', c.id, 'clue'), text: clue }));
    this.appendFaults_(m, [c.id]);
  }

  private appendFaults_(m: HamStationManager, targets: string[]): void {
    const found = m.faults().filter((f) => !f.cleared && targets.includes(f.target) && m.events(`inspect:${f.target}`).length > 0 && f.clearedBy.action === 'repair');
    for (const f of found) {
      this.head_.append(
        h(
          'div',
          { class: 'ham-closeup-fault', 'data-testid': tid('ham-conn', f.id, 'fault') },
          h('span', { class: 'small', text: f.inspectClue }),
          button(tid('ham-conn', f.id, 'repair'), 'Repair', () => this.act_({ type: 'repair', faultId: f.id }), 'btn btn-sm btn-outline-success', `Repair ${f.target}`)
        )
      );
    }
  }

  /** Spares on the shelf; with a device selected, only spares of its kind, each swapping in for it */
  private appendSpares_(m: HamStationManager, kind: string | null): void {
    const sel = this.selection_?.kind === 'device' ? this.selection_.id : null;
    const spares = m.devices().filter((d) => d.spare && !d.removed && (kind === null || d.kind === kind));
    if (spares.length === 0) return;
    const list = h('div', { class: 'ham-closeup-spares' }, h('div', { class: 'ham-closeup-section', text: 'Spares shelf' }));
    for (const s of spares) {
      const row = h('div', { class: 'd-flex align-items-center gap-2 mb-1', 'data-testid': tid('ham-conn', s.id, 'spare') }, h('span', { class: 'small', text: s.label }));
      if (sel) {
        row.append(
          button(
            tid('ham-conn', s.id, 'install'),
            'Swap in',
            () => this.act_({ type: 'install', spareId: s.id, replaces: sel }),
            'btn btn-sm btn-outline-success',
            `Install ${s.label} in place of the selected item`
          )
        );
      }
      list.append(row);
    }
    this.head_.append(list);
  }
}
