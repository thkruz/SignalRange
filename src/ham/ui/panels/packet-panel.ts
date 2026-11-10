/**
 * @file packet-panel - AX.25 packet terminal: audio interface, station config, link and frame log
 * @description Audio interface and station settings are applied with packet.config (interface
 * controls apply on change; call/destination/path use Save). Delivery status separates "sent"
 * (on the air, not yet acknowledged) from "acknowledged by <node>" (the node's RR arrived).
 *
 * Test ids (<p> = the packet radio's device id from the config, default "pkt"):
 *   ham-packet-<p>-input-device, -output-device, -rx-level, -tx-level, -ptt, -system-sounds,
 *   -data-cable, -mycall, -destination, -path, -save, -connect, -send-text, -send, -disconnect,
 *   -send-ui (unconnected UI test frame), -corrupt (test control: corrupt the next frame), -link, -frames (log container), -frame-<n> (row), -delivery (list), -notes
 */
import type { HamStationManager } from '../../ham-station-manager';
import type { PacketAudioConfig } from '../../ops/packet';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, h, select, textInput } from '../ui-kit';
import './instruments.css';
import { numInput, setText, T } from './panel-util';

interface FrameRow {
  tS: number;
  dir: 'TX' | 'RX';
  type: string;
  ns?: number;
  nr?: number;
  ok: boolean;
  reason?: string;
}

export class PacketPanel implements StationPanel {
  readonly id = 'packet';
  readonly title = 'Packet radio';
  private root_: HTMLElement | null = null;
  private p_ = 'pkt';
  private nodeCall_ = 'the node';
  private input_!: HTMLSelectElement;
  private output_!: HTMLSelectElement;
  private rx_!: HTMLInputElement;
  private tx_!: HTMLInputElement;
  private ptt_!: HTMLSelectElement;
  private sounds_!: HTMLInputElement;
  private cable_!: HTMLInputElement;
  private mycall_!: HTMLInputElement;
  private dest_!: HTMLInputElement;
  private path_!: HTMLInputElement;
  private text_!: HTMLInputElement;
  private link_!: HTMLElement;
  private frames_!: HTMLElement;
  private delivery_!: HTMLElement;
  private notes_!: HTMLElement;
  private stationDirty_ = false;
  private frameSig_ = '';

  isRelevant(m: HamStationManager): boolean {
    return m.packetState() !== undefined;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    const m = ctx.manager;
    const p = (this.p_ = m.config.packet?.radioId ?? 'pkt');
    this.nodeCall_ = m.config.packet?.node.callsign ?? 'the node';
    const id = (c: string): string => T('ham-packet', p, c);
    const cfg = (audio: Partial<PacketAudioConfig>): void => {
      const r = ctx.act({ type: 'packet.config', patch: { audio } });
      if (!r.ok) ctx.feedback(r.message, 'warning');
    };

    this.input_ = select(
      id('input-device'),
      'Input device',
      [
        { value: 'laptop-mic', label: 'Laptop microphone' },
        { value: 'interface', label: 'Radio interface' },
      ],
      'laptop-mic'
    );
    this.input_.addEventListener('change', () => cfg({ inputDevice: this.input_.value as PacketAudioConfig['inputDevice'] }));
    this.output_ = select(
      id('output-device'),
      'Output device',
      [
        { value: 'laptop-speakers', label: 'Laptop speakers' },
        { value: 'interface', label: 'Radio interface' },
      ],
      'laptop-speakers'
    );
    this.output_.addEventListener('change', () => cfg({ outputDevice: this.output_.value as PacketAudioConfig['outputDevice'] }));
    this.rx_ = numInput(id('rx-level'), 'RX level', 5, 1, 0, 10);
    this.rx_.addEventListener('change', () => cfg({ rxLevel: Number(this.rx_.value) }));
    this.tx_ = numInput(id('tx-level'), 'TX level', 5, 1, 0, 10);
    this.tx_.addEventListener('change', () => cfg({ txLevel: Number(this.tx_.value) }));
    this.ptt_ = select(
      id('ptt'),
      'PTT method',
      [
        { value: 'none', label: 'None' },
        { value: 'vox', label: 'VOX' },
        { value: 'rts', label: 'Serial RTS' },
        { value: 'cat', label: 'CAT command' },
      ],
      'none'
    );
    this.ptt_.addEventListener('change', () => cfg({ ptt: this.ptt_.value as PacketAudioConfig['ptt'] }));
    const check = (cid: string, label: string, key: 'systemSoundsToInterface' | 'dataCableConnected'): { wrap: HTMLElement; input: HTMLInputElement } => {
      const input = h('input', { type: 'checkbox', class: 'form-check-input', id: cid, 'data-testid': cid });
      input.addEventListener('change', () => cfg({ [key]: input.checked }));

      return { wrap: h('label', { class: 'form-check form-switch me-3' }, input, h('span', { class: 'form-check-label', text: label })), input };
    };
    const sounds = check(id('system-sounds'), 'System sounds routed to the interface', 'systemSoundsToInterface');
    const cable = check(id('data-cable'), 'Data cable connected', 'dataCableConnected');
    this.sounds_ = sounds.input;
    this.cable_ = cable.input;

    this.mycall_ = textInput(id('mycall'), 'My call sign', '');
    this.dest_ = textInput(id('destination'), 'Destination', '');
    this.path_ = textInput(id('path'), 'Digipeater path (comma separated)', '');
    for (const i of [this.mycall_, this.dest_, this.path_]) i.addEventListener('input', () => (this.stationDirty_ = true));
    const save = button(id('save'), 'Save station', () => {
      const path = this.path_.value
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const r = ctx.act({
        type: 'packet.config',
        patch: { station: { mycall: this.mycall_.value.trim().toUpperCase(), destination: this.dest_.value.trim().toUpperCase(), path } },
      });
      this.stationDirty_ = !r.ok;
      ctx.feedback(r.message, r.ok ? 'success' : 'warning');
    });
    this.text_ = textInput(id('send-text'), 'Text to send', '');
    this.link_ = h('span', { class: 'badge bg-secondary-lt', 'data-testid': id('link') });
    this.frames_ = h('div', { class: 'ham-framelog border rounded p-1', 'data-testid': id('frames') });
    this.delivery_ = h('ul', { class: 'list-unstyled small mb-0', 'data-testid': id('delivery') });
    this.notes_ = h('div', { class: 'small text-muted mt-1', 'data-testid': id('notes') });

    const act = (a: Parameters<PanelContext['act']>[0]): void => {
      const r = ctx.act(a);
      ctx.feedback(r.message, r.ok ? 'info' : 'warning');
    };
    const f = (label: string, el: HTMLElement, cls = 'col-6'): HTMLElement => h('div', { class: cls }, h('label', { class: 'form-label small mb-1', text: label }), el);
    this.root_ = h(
      'div',
      { class: 'ham-instr', 'data-testid': id('panel') },
      h(
        'div',
        { class: 'row g-1 mb-1' },
        f('Input device', this.input_),
        f('Output device', this.output_),
        f('RX level', this.rx_, 'col-4'),
        f('TX level', this.tx_, 'col-4'),
        f('PTT method', this.ptt_, 'col-4')
      ),
      h('div', { class: 'ham-row' }, sounds.wrap, cable.wrap),
      h('div', { class: 'row g-1 mb-1' }, f('My call', this.mycall_, 'col-4'), f('To', this.dest_, 'col-4'), f('Via', this.path_, 'col-4')),
      h('div', { class: 'ham-row' }, save),
      h(
        'div',
        { class: 'ham-row' },
        button(id('connect'), 'Connect', () => act({ type: 'packet.connect' }), 'btn btn-sm btn-primary'),
        button(id('disconnect'), 'Disconnect', () => act({ type: 'packet.disconnect' }), 'btn btn-sm btn-outline-secondary'),
        this.link_
      ),
      h(
        'div',
        { class: 'input-group input-group-sm mb-2' },
        this.text_,
        button(
          id('send'),
          'Send',
          () => {
            const t = this.text_.value.trim();
            if (!t) return;
            act({ type: 'packet.send', text: t });
            this.text_.value = '';
          },
          'btn btn-primary'
        )
      ),
      h(
        'div',
        { class: 'ham-row' },
        button(
          id('send-ui'),
          'Send test frame',
          () => {
            const t = this.text_.value.trim() || 'test';
            act({ type: 'packet.send', text: t, ui: true });
            this.text_.value = '';
          },
          'btn btn-sm btn-outline-primary'
        ),
        button(id('corrupt'), 'Corrupt next frame (test)', () => act({ type: 'packet.injectCorruption' }), 'btn btn-sm btn-outline-warning')
      ),
      h('div', { class: 'small fw-bold' }, 'Frame log'),
      this.frames_,
      h('div', { class: 'small fw-bold mt-2' }, 'Delivery'),
      this.delivery_,
      this.notes_
    );
    host.append(this.root_);
    this.update(m);
  }

  private rows_(m: HamStationManager): FrameRow[] {
    const s = m.packetState();
    if (!s) return [];
    const tx: FrameRow[] = (s.txLog ?? []).map((f) => ({ tS: f.tS, dir: 'TX', type: f.type, ns: f.ns, nr: f.nr, ok: f.fcsOk, reason: f.fcsOk ? undefined : 'fcs-fail' }));
    const rx: FrameRow[] = s.rxLog.map((f) => ({ tS: f.tS, dir: 'RX', type: f.type.replace('remote:', 'node '), ns: f.ns, nr: f.nr, ok: f.ok, reason: f.reason }));

    return [...tx, ...rx].sort((a, b) => a.tS - b.tS);
  }

  update(m: HamStationManager): void {
    const s = m.packetState();
    if (!s) return;
    const a = s.audio;
    const idle = (e: HTMLElement): boolean => document.activeElement !== e;
    if (idle(this.input_)) this.input_.value = a.inputDevice;
    if (idle(this.output_)) this.output_.value = a.outputDevice;
    if (idle(this.rx_)) this.rx_.value = String(a.rxLevel);
    if (idle(this.tx_)) this.tx_.value = String(a.txLevel);
    if (idle(this.ptt_)) this.ptt_.value = a.ptt;
    this.sounds_.checked = a.systemSoundsToInterface;
    this.cable_.checked = a.dataCableConnected;
    if (!this.stationDirty_) {
      if (idle(this.mycall_)) this.mycall_.value = s.station.mycall;
      if (idle(this.dest_)) this.dest_.value = s.station.destination;
      if (idle(this.path_)) this.path_.value = s.station.path.join(',');
    }
    setText(this.link_, `Link: ${s.link}${s.retryCount > 0 ? ` (retry ${s.retryCount})` : ''}`);
    this.link_.className = `badge ${s.link === 'connected' ? 'bg-success-lt' : 'bg-secondary-lt'}`;

    const rows = this.rows_(m);
    const sig = JSON.stringify(rows);
    if (sig !== this.frameSig_) {
      this.frameSig_ = sig;
      this.frames_.replaceChildren(
        ...rows.map((r, i) =>
          h(
            'div',
            { class: r.ok ? '' : 'bad', 'data-testid': T('ham-packet', this.p_, 'frame', i) },
            `${r.tS.toFixed(0).padStart(4, ' ')}s ${r.dir} ${r.type}${r.ns !== undefined ? ` N(S)=${r.ns}` : ''}${r.nr !== undefined ? ` N(R)=${r.nr}` : ''} FCS ${r.ok ? 'ok' : 'fail'}${r.reason && r.reason !== 'fcs-fail' ? ` (${r.reason})` : ''}`
          )
        )
      );
      this.frames_.scrollTop = this.frames_.scrollHeight;
    }

    const items: [string, string, string][] = [];
    for (const t of s.delivered) items.push([t, `acknowledged by ${this.nodeCall_}`, 'text-success']);
    if (s.outstanding?.frame.info) items.push([s.outstanding.frame.info, `sent, waiting for ${this.nodeCall_} to acknowledge`, 'text-warning']);
    for (const t of s.queue) items.push([t, 'queued', 'text-muted']);
    for (const t of s.failed) items.push([t, 'failed, no acknowledgement', 'text-danger']);
    for (const t of s.uiSent) items.push([t, 'sent (unconnected, never acknowledged)', 'text-muted']);
    this.delivery_.replaceChildren(...items.map(([t, st, cls]) => h('li', { class: cls }, `"${t}": ${st}`)));
    setText(this.notes_, s.notes.slice(-2).join(' '));
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
  }
}
