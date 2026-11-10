/**
 * @file packet - AX.25 packet radio through a laptop sound interface
 * @description PROTOCOL CHOICE: AX.25 *connected mode* (SABM/UA, I-frames with
 * N(S), RR acks with N(R), T1 retry timer with N2 max retries, DISC) at 1200 baud
 * AFSK over FM, to a fictional BBS node. Window size is 1 (one unacked I-frame)
 * with modulo-8 sequence numbers. Connected mode was chosen because it teaches the
 * key lesson: "sent" is not "delivered" until the remote's RR acknowledges it.
 * UI frames (APRS-style position beacons) are also supported and are never
 * acknowledged, which teaches that APRS is fire-and-forget.
 *
 * Audio chain rules (bounded model, not DSP):
 *  - RX decode needs: data cable connected, input device = 'interface', rx level
 *    >= 3 (below: too quiet, no decode) and <= 7 (above: clipped, FCS failures).
 *    Clean window is 4..6.
 *  - TX needs a PTT method that keys this interface ('rts' in the Digirig-style
 *    fixture; 'cat' has no CAT configured, 'vox' does not key a data port, 'none'
 *    never keys), output device = 'interface' for any modulation, tx level in
 *    3..7 for a decodable signal (<3 too weak, >7 over-deviation, FCS fails).
 *  - System sounds routed to the interface can key the radio and radiate garbage.
 * The module never computes link budgets: `hears` decides RF decodability.
 */
import type { LocalPosition, OnAirEmission, PacketFrame } from '../ham-types';
import { clone, type HearsFn, Outbox, type OutboxState } from './ops-common';

export interface PacketAudioConfig {
  inputDevice: 'interface' | 'laptop-mic';
  outputDevice: 'interface' | 'laptop-speakers';
  rxLevel: number;
  txLevel: number;
  ptt: 'cat' | 'rts' | 'vox' | 'none';
  systemSoundsToInterface: boolean;
  dataCableConnected: boolean;
}

export interface PacketStationConfig {
  mycall: string;
  destination: string;
  path: string[];
}

export interface PacketNodeConfig {
  id: string;
  callsign: string;
  freqMHz: number;
  position: LocalPosition;
  erpDbm: number;
  replyDelayS: number;
  banner: string;
}

export interface PacketRadioCtx {
  freqHz: number;
  erpDbm: number;
  position?: LocalPosition;
}

export interface PacketStationOpts {
  node: PacketNodeConfig;
  hears: HearsFn;
  audio?: Partial<PacketAudioConfig>;
  station?: Partial<PacketStationConfig>;
  t1S?: number;
  n2?: number;
  /** PTT methods that really key this interface */
  workingPtt?: PacketAudioConfig['ptt'][];
}

export interface PacketTxResult {
  rf: boolean;
  reason?: string;
  emissions: OnAirEmission[];
}

export type LinkState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

interface Outstanding {
  frame: PacketFrame;
  sentS: number;
  retries: number;
}

export interface PacketState {
  audio: PacketAudioConfig;
  station: PacketStationConfig;
  link: LinkState;
  vs: number;
  outstanding: Outstanding | null;
  queue: string[];
  delivered: string[];
  failed: string[];
  uiSent: string[];
  remote: { connected: boolean; vr: number; received: string[]; uiReceived: string[] };
  corruptNext: boolean;
  rxLog: { tS: number; type: string; ok: boolean; reason?: string }[];
  notes: string[];
  retryCount: number;
  radio: PacketRadioCtx | null;
  outbox: OutboxState;
  txSeq: number;
}

const DEFAULT_AUDIO: PacketAudioConfig = {
  inputDevice: 'laptop-mic',
  outputDevice: 'laptop-speakers',
  rxLevel: 5,
  txLevel: 5,
  ptt: 'none',
  systemSoundsToInterface: false,
  dataCableConnected: true,
};

export const PACKET_LEVEL_MIN = 3;
export const PACKET_LEVEL_MAX = 7;
const FRAME_DUR_S = 1.5;

export class PacketStation {
  private readonly o_: PacketStationOpts;
  private readonly outbox_ = new Outbox('pkt-remote');
  private audio_: PacketAudioConfig;
  private station_: PacketStationConfig;
  private link_: LinkState = 'disconnected';
  private vs_ = 0;
  private outstanding_: Outstanding | null = null;
  private queue_: string[] = [];
  private delivered_: string[] = [];
  private failed_: string[] = [];
  private uiSent_: string[] = [];
  private remote_ = { connected: false, vr: 0, received: [] as string[], uiReceived: [] as string[] };
  private corruptNext_ = false;
  private rxLog_: PacketState['rxLog'] = [];
  private notes_: string[] = [];
  private retryCount_ = 0;
  private radio_: PacketRadioCtx | null = null;
  private txSeq_ = 0;
  private readonly t1S_: number;
  private readonly n2_: number;

  constructor(opts: PacketStationOpts) {
    this.o_ = opts;
    this.audio_ = { ...DEFAULT_AUDIO, ...opts.audio };
    this.station_ = { mycall: 'N0CALL', destination: opts.node.callsign, path: [], ...opts.station };
    this.t1S_ = opts.t1S ?? 10;
    this.n2_ = opts.n2 ?? 3;
  }

  setAudio(p: Partial<PacketAudioConfig>): void {
    this.audio_ = { ...this.audio_, ...p };
  }

  getAudio(): PacketAudioConfig {
    return { ...this.audio_ };
  }

  setStation(p: Partial<PacketStationConfig>): void {
    this.station_ = { ...this.station_, ...p };
  }

  getStation(): PacketStationConfig {
    return clone(this.station_);
  }

  /** One-shot: the next frame the player sends fails its FCS at the remote */
  corruptNextFrame(): void {
    this.corruptNext_ = true;
  }

  get linkState(): LinkState {
    return this.link_;
  }

  /** Only frames the remote acknowledged with RR */
  getDelivered(): string[] {
    return [...this.delivered_];
  }

  getFailed(): string[] {
    return [...this.failed_];
  }

  /** Text the TNC has sent (or queued) that the remote has not acknowledged */
  getUnacked(): string[] {
    const out = this.outstanding_?.frame.type === 'I' ? [this.outstanding_.frame.info ?? ''] : [];
    return [...out, ...this.queue_];
  }

  getUiSent(): string[] {
    return [...this.uiSent_];
  }

  getRemoteReceived(): string[] {
    return [...this.remote_.received];
  }

  getRxLog(): PacketState['rxLog'] {
    return clone(this.rxLog_);
  }

  getNotes(): string[] {
    return [...this.notes_];
  }

  get retries(): number {
    return this.retryCount_;
  }

  private note_(s: string): void {
    this.notes_.push(s);
  }

  /** Why (if at all) the interface cannot key the radio */
  private pttProblem_(): string | null {
    const a = this.audio_;
    if (!a.dataCableConnected) return 'The radio data cable is not connected.';
    const working = this.o_.workingPtt ?? ['rts'];
    if (a.ptt === 'none') return 'PTT method is none: the radio never keys, nothing is transmitted.';
    if (!working.includes(a.ptt)) return `PTT method ${a.ptt} does not key this interface; the radio stays in receive.`;
    return null;
  }

  private rxChain_(): { ok: boolean; clipped: boolean; reason?: string } {
    const a = this.audio_;
    if (!a.dataCableConnected) return { ok: false, clipped: false, reason: 'no-cable' };
    if (a.inputDevice !== 'interface') return { ok: false, clipped: false, reason: 'wrong-input-device' };
    if (a.rxLevel < PACKET_LEVEL_MIN) return { ok: false, clipped: false, reason: 'rx-level-low' };
    if (a.rxLevel > PACKET_LEVEL_MAX) return { ok: true, clipped: true, reason: 'rx-level-high' };
    return { ok: true, clipped: false };
  }

  private mkEmission_(frame: PacketFrame, nowS: number, radio: PacketRadioCtx, carrierOnly = false): OnAirEmission {
    this.txSeq_++;
    const e: OnAirEmission = {
      id: `pkt-tx-${this.txSeq_}`,
      sourceId: 'player-packet',
      isPlayer: true,
      freqHz: radio.freqHz,
      mode: 'PKT',
      bandwidthHz: 15000,
      erpDbm: radio.erpDbm,
      polarization: 'V',
      ctcssHz: null,
      payload: carrierOnly ? { kind: 'carrier', text: '(unmodulated carrier)' } : { kind: 'packet', frame, text: frame.info },
      startS: nowS,
      endS: nowS + FRAME_DUR_S,
    };
    if (radio.position) e.position = radio.position;
    return e;
  }

  private newFrame_(type: PacketFrame['type'], extra: Partial<PacketFrame> = {}): PacketFrame {
    return {
      src: this.station_.mycall,
      dst: this.station_.destination,
      path: [...this.station_.path],
      type,
      fcsOk: true,
      ...extra,
    };
  }

  /** Transmit a frame through the audio chain; the remote reacts if it decodes it */
  private transmit_(frame: PacketFrame, nowS: number, radio: PacketRadioCtx): PacketTxResult {
    this.radio_ = radio;
    const problem = this.pttProblem_();
    if (problem) {
      this.note_(problem);
      return { rf: false, reason: problem, emissions: [] };
    }
    const a = this.audio_;
    if (a.outputDevice !== 'interface') {
      const em = this.mkEmission_(frame, nowS, radio, true);
      this.note_('Output device is not the interface: the radio keyed but no modem audio reached it (carrier only).');
      return { rf: true, reason: 'no-modulation', emissions: [em] };
    }
    if (a.txLevel < PACKET_LEVEL_MIN) {
      frame.fcsOk = false;
      this.note_('TX audio level too low: signal is under-deviated and the remote cannot decode it.');
    } else if (a.txLevel > PACKET_LEVEL_MAX) {
      frame.fcsOk = false;
      this.note_('TX audio level too high: over-deviation, the remote sees FCS failures.');
    }
    if (this.corruptNext_) {
      this.corruptNext_ = false;
      frame.fcsOk = false;
      this.note_('A frame was corrupted on the air.');
    }
    const em = this.mkEmission_(frame, nowS, radio);
    this.remoteReceive_(frame, em, nowS);
    return { rf: true, emissions: [em] };
  }

  private remoteReceive_(frame: PacketFrame, em: OnAirEmission, nowS: number): void {
    const node = this.o_.node;
    if (!this.o_.hears(em, node.id).decoded) return;
    if (!frame.fcsOk) {
      this.rxLog_.push({ tS: nowS, type: `remote:${frame.type}`, ok: false, reason: 'fcs-fail' });
      return;
    }
    const r = this.remote_;
    const reply = (f: Partial<PacketFrame> & Pick<PacketFrame, 'type'>): void =>
      this.outbox_.push({
        dueS: nowS + node.replyDelayS,
        durS: FRAME_DUR_S,
        sourceId: node.id,
        text: f.info ?? '',
        freqHz: em.freqHz,
        mode: 'PKT',
        erpDbm: node.erpDbm,
        position: node.position,
        payload: {
          kind: 'packet',
          text: f.info,
          frame: { src: node.callsign, dst: this.station_.mycall, path: [], fcsOk: true, ...f },
        },
      });
    switch (frame.type) {
      case 'SABM':
        r.connected = true;
        r.vr = 0;
        reply({ type: 'UA' });
        break;
      case 'I': {
        if (!r.connected) break;
        if (frame.ns === r.vr) {
          r.received.push(frame.info ?? '');
          r.vr = (r.vr + 1) % 8;
          reply({ type: 'RR', nr: r.vr });
        } else {
          reply({ type: 'REJ', nr: r.vr });
        }
        break;
      }
      case 'DISC':
        r.connected = false;
        reply({ type: 'UA' });
        break;
      case 'UI':
        r.uiReceived.push(frame.info ?? ''); // never acknowledged
        break;
      default:
        break;
    }
  }

  private setOutstanding_(frame: PacketFrame, nowS: number): void {
    this.outstanding_ = { frame, sentS: nowS, retries: 0 };
  }

  /** Begin a connection (SABM) */
  connect(nowS: number, radio: PacketRadioCtx): PacketTxResult {
    const f = this.newFrame_('SABM');
    this.link_ = 'connecting';
    this.setOutstanding_(f, nowS);
    return this.transmit_(f, nowS, radio);
  }

  /** Queue a text line for delivery (connected mode). Not delivered until RR. */
  sendText(text: string, nowS: number, radio: PacketRadioCtx): PacketTxResult {
    if (this.link_ !== 'connected') {
      const reason = 'Not connected: connect to the node before sending data.';
      this.note_(reason);
      return { rf: false, reason, emissions: [] };
    }
    this.queue_.push(text);
    return this.pump_(nowS, radio);
  }

  private pump_(nowS: number, radio: PacketRadioCtx): PacketTxResult {
    if (this.outstanding_ || this.queue_.length === 0 || this.link_ !== 'connected') {
      return { rf: true, emissions: [] };
    }
    const info = this.queue_.shift() as string;
    const f = this.newFrame_('I', { ns: this.vs_, nr: 0, info });
    this.setOutstanding_(clone(f), nowS);
    return this.transmit_(f, nowS, radio);
  }

  /** APRS-style unconnected beacon: never acknowledged */
  sendUi(text: string, nowS: number, radio: PacketRadioCtx): PacketTxResult {
    const f = this.newFrame_('UI', { info: text });
    const res = this.transmit_(f, nowS, radio);
    if (res.rf) this.uiSent_.push(text);
    return res;
  }

  disconnect(nowS: number, radio: PacketRadioCtx): PacketTxResult {
    if (this.link_ === 'disconnected') return { rf: false, reason: 'Already disconnected.', emissions: [] };
    const f = this.newFrame_('DISC');
    this.link_ = 'disconnecting';
    this.setOutstanding_(f, nowS);
    return this.transmit_(f, nowS, radio);
  }

  /** The operator plays a system sound (chime). With the wrong routing it keys the radio. */
  playSystemSound(nowS: number): PacketTxResult {
    const radio = this.radio_;
    if (!this.audio_.systemSoundsToInterface) return { rf: false, emissions: [] };
    this.note_('System sounds are routed to the interface: a chime was sent to the radio.');
    if (!radio || this.pttProblem_()) return { rf: false, reason: 'chime reached an unkeyed interface', emissions: [] };
    const f = this.newFrame_('UI', { info: '\u0007\u0007\u0007', fcsOk: false });
    const em = this.mkEmission_(f, nowS, radio);
    em.payload = { kind: 'noise', text: '(garbage frame from system sound)' };
    return { rf: true, reason: 'spurious-keying', emissions: [em] };
  }

  /** Handle a frame arriving at the player's TNC */
  private playerReceive_(em: OnAirEmission, nowS: number): void {
    const frame = em.payload.frame;
    if (!frame) return;
    const chain = this.rxChain_();
    if (!chain.ok) {
      this.rxLog_.push({ tS: nowS, type: frame.type, ok: false, reason: chain.reason });
      return;
    }
    if (!this.o_.hears(em, 'player').decoded) {
      this.rxLog_.push({ tS: nowS, type: frame.type, ok: false, reason: 'rf-not-decoded' });
      return;
    }
    if (chain.clipped || !frame.fcsOk) {
      this.rxLog_.push({ tS: nowS, type: frame.type, ok: false, reason: chain.clipped ? 'rx-level-high' : 'fcs-fail' });
      return;
    }
    this.rxLog_.push({ tS: nowS, type: frame.type, ok: true });
    const out = this.outstanding_;
    switch (frame.type) {
      case 'UA':
        if (this.link_ === 'connecting' && out?.frame.type === 'SABM') {
          this.link_ = 'connected';
          this.vs_ = 0;
          this.outstanding_ = null;
          this.note_(`Connected to ${frame.src}.`);
        } else if (this.link_ === 'disconnecting') {
          this.link_ = 'disconnected';
          this.outstanding_ = null;
        }
        break;
      case 'RR':
        if (out?.frame.type === 'I' && frame.nr === ((out.frame.ns ?? 0) + 1) % 8) {
          this.delivered_.push(out.frame.info ?? '');
          this.vs_ = (this.vs_ + 1) % 8;
          this.outstanding_ = null;
          if (this.radio_) this.pump_(nowS, this.radio_);
        }
        break;
      case 'REJ':
        if (out?.frame.type === 'I') out.sentS = -1e9; // resend on next tick
        break;
      default:
        break;
    }
  }

  /** Drive remote replies and the T1 retry timer; returns every emission radiated this tick */
  tick(nowS: number): OnAirEmission[] {
    const res: OnAirEmission[] = [];
    for (const { emission } of this.outbox_.popDue(nowS)) {
      res.push(emission);
      this.playerReceive_(emission, nowS);
    }
    const out = this.outstanding_;
    if (out && this.radio_ && nowS - out.sentS >= this.t1S_) {
      out.retries++;
      this.retryCount_++;
      if (out.retries > this.n2_) {
        this.note_(`Retries exceeded (N2=${this.n2_}): link failure.`);
        if (out.frame.type === 'I') this.failed_.push(out.frame.info ?? '');
        this.outstanding_ = null;
        this.link_ = 'disconnected';
      } else {
        out.sentS = nowS;
        const f = clone(out.frame);
        f.fcsOk = true;
        const r = this.transmit_(f, nowS, this.radio_);
        res.push(...r.emissions);
      }
    }
    return res;
  }

  getState(): PacketState {
    return clone({
      audio: this.audio_,
      station: this.station_,
      link: this.link_,
      vs: this.vs_,
      outstanding: this.outstanding_,
      queue: this.queue_,
      delivered: this.delivered_,
      failed: this.failed_,
      uiSent: this.uiSent_,
      remote: this.remote_,
      corruptNext: this.corruptNext_,
      rxLog: this.rxLog_,
      notes: this.notes_,
      retryCount: this.retryCount_,
      radio: this.radio_,
      outbox: this.outbox_.getState(),
      txSeq: this.txSeq_,
    });
  }

  restoreState(s: PacketState): void {
    const c = clone(s);
    this.audio_ = c.audio;
    this.station_ = c.station;
    this.link_ = c.link;
    this.vs_ = c.vs;
    this.outstanding_ = c.outstanding;
    this.queue_ = c.queue;
    this.delivered_ = c.delivered;
    this.failed_ = c.failed;
    this.uiSent_ = c.uiSent;
    this.remote_ = c.remote;
    this.corruptNext_ = c.corruptNext;
    this.rxLog_ = c.rxLog;
    this.notes_ = c.notes;
    this.retryCount_ = c.retryCount;
    this.radio_ = c.radio;
    this.outbox_.restoreState(c.outbox);
    this.txSeq_ = c.txSeq;
  }
}
