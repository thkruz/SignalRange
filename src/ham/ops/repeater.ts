/**
 * @file repeater - Analog FM repeater with CTCSS access and a club operator agent
 * @description Receives on the input, retransmits on the output. Access needs the
 * right input frequency, the right tone and adequate SNR. A courtesy tone is a
 * property of the repeater, never a contact. A club operator listens to the output
 * and answers through the repeater (the reply is radiated on the output).
 *
 * Fixture: output 146.940, input 146.340 (-600 kHz), access 100.0 Hz. The radio
 * boots with 123.0 Hz (wrong) so first keying fails silently.
 */
import type { HamContactRecord, LocalPosition, OnAirEmission, TxIntent } from '../ham-types';
import { clone, type HearsFn, Outbox, type OutboxState, sameCall, sameFreq } from './ops-common';

export const RADIO_BOOT_TONE_HZ = 123.0;

export interface ClubOperatorConfig {
  id: string;
  callsign: string;
  name: string;
  location: string;
  position: LocalPosition;
  replyDelayS: number;
  lines: string[];
}

export interface RepeaterConfig {
  id: string;
  callsign: string;
  outputMHz: number;
  inputMHz: number;
  accessToneHz: number;
  courtesyTone: boolean;
  idIntervalS: number;
  hangTimeS: number;
  timeoutS: number;
  position: LocalPosition;
  erpDbm: number;
  clubOperator?: ClubOperatorConfig;
  hears: HearsFn;
  playerCallsign: string;
  revision?: () => number;
}

export type RepeaterAccessCode = 'relayed' | 'outage' | 'wrong-frequency' | 'no-tone' | 'wrong-tone' | 'weak' | 'timed-out' | 'not-addressed';

export interface RepeaterAccessResult {
  code: RepeaterAccessCode;
  message: string;
  /** Emissions radiated now (relay, courtesy tone). Operator replies come from tick(). */
  emissions: OnAirEmission[];
}

export interface RepeaterState {
  outage: boolean;
  lastActivityS: number | null;
  lastIdS: number | null;
  contacts: HamContactRecord[];
  emissionToContact: Record<string, string>;
  active: string | null;
  outbox: OutboxState;
  accessLog: { tS: number; code: RepeaterAccessCode }[];
  seq: number;
  relaySeq: number;
}

const TONE_TOL_HZ = 0.5;

export function makeClubRepeaterConfig(hears: HearsFn, playerCallsign: string): RepeaterConfig {
  return {
    id: 'rptr-146940',
    callsign: 'W0CLB',
    outputMHz: 146.94,
    inputMHz: 146.34,
    accessToneHz: 100.0,
    courtesyTone: true,
    idIntervalS: 600,
    hangTimeS: 2,
    timeoutS: 180,
    position: { xKm: 3, yKm: 6, heightM: 90 },
    erpDbm: 47,
    hears,
    playerCallsign,
    clubOperator: {
      id: 'club-op',
      callsign: 'N0CLB',
      name: 'Pat',
      location: 'the clubhouse',
      position: { xKm: 5, yKm: 4, heightM: 10 },
      replyDelayS: 3,
      lines: ['Welcome to the club repeater.'],
    },
  };
}

export class Repeater {
  private readonly cfg_: RepeaterConfig;
  private readonly outbox_ = new Outbox('rptr');
  private outage_ = false;
  private lastActivityS_: number | null = null;
  private lastIdS_: number | null = null;
  private contacts_: HamContactRecord[] = [];
  private emissionToContact_: Record<string, string> = {};
  private active_: string | null = null;
  private accessLog_: { tS: number; code: RepeaterAccessCode }[] = [];
  private seq_ = 0;
  private relaySeq_ = 0;

  constructor(cfg: RepeaterConfig) {
    this.cfg_ = cfg;
  }

  /** S12 hook: the repeater goes off the air (or returns) */
  setOutage(on: boolean): void {
    this.outage_ = on;
  }

  get isOutage(): boolean {
    return this.outage_;
  }

  getAccessLog(): { tS: number; code: RepeaterAccessCode }[] {
    return clone(this.accessLog_);
  }

  private log_(tS: number, code: RepeaterAccessCode, message: string, emissions: OnAirEmission[] = []): RepeaterAccessResult {
    this.accessLog_.push({ tS, code });
    return { code, message, emissions };
  }

  onPlayerEmission(e: OnAirEmission, intent: TxIntent | null, nowS: number): RepeaterAccessResult {
    const c = this.cfg_;
    const onInput = sameFreq(e.freqHz, c.inputMHz * 1e6, 2500);
    const onOutput = sameFreq(e.freqHz, c.outputMHz * 1e6, 2500);
    if (!onInput) {
      return onOutput
        ? this.log_(nowS, 'wrong-frequency', 'You transmitted on the repeater output. Nothing listens there; transmit on the input.')
        : this.log_(nowS, 'not-addressed', 'Not on the repeater input.');
    }
    if (this.outage_) return this.log_(nowS, 'outage', 'The repeater is off the air.');
    if (e.ctcssHz === null || e.ctcssHz === undefined) {
      return this.log_(nowS, 'no-tone', 'No access tone sent. The repeater stayed silent.');
    }
    if (Math.abs(e.ctcssHz - c.accessToneHz) > TONE_TOL_HZ) {
      return this.log_(nowS, 'wrong-tone', 'Wrong access tone. The repeater stayed silent.');
    }
    if (!c.hears(e, c.id).decoded) {
      return this.log_(nowS, 'weak', 'Your signal is too weak to open the repeater.');
    }
    this.lastActivityS_ = nowS;
    const durS = (e.endS ?? e.startS + 4) - e.startS;
    const timedOut = durS > c.timeoutS;
    const relayEnd = timedOut ? e.startS + c.timeoutS : (e.endS ?? e.startS + 4);
    this.relaySeq_++;
    const relay: OnAirEmission = {
      ...clone(e),
      id: `rptr-relay-${this.relaySeq_}`,
      sourceId: c.id,
      isPlayer: false,
      freqHz: Math.round(c.outputMHz * 1e6),
      erpDbm: c.erpDbm,
      position: c.position,
      ctcssHz: null,
      startS: e.startS,
      endS: relayEnd,
    };
    const out: OnAirEmission[] = [relay];
    if (c.courtesyTone) {
      this.relaySeq_++;
      out.push({
        id: `rptr-relay-${this.relaySeq_}`,
        sourceId: c.id,
        isPlayer: false,
        freqHz: relay.freqHz,
        mode: 'FM',
        bandwidthHz: relay.bandwidthHz,
        erpDbm: c.erpDbm,
        polarization: 'V',
        position: c.position,
        ctcssHz: null,
        payload: { kind: 'carrier', text: '(courtesy tone)' },
        startS: relayEnd + 0.2,
        endS: relayEnd + 0.4,
      });
    }
    this.operatorListens_(relay, intent, nowS, relayEnd);
    return this.log_(
      nowS,
      timedOut ? 'timed-out' : 'relayed',
      timedOut ? 'You held the key past the time-out timer; the repeater dropped you.' : 'Repeater keyed and relayed your transmission.',
      out
    );
  }

  private operatorListens_(relay: OnAirEmission, intent: TxIntent | null, nowS: number, endS: number): void {
    const op = this.cfg_.clubOperator;
    if (!op || !intent) return;
    if (!this.cfg_.hears(relay, op.id).decoded) return;
    const speak = (text: string, tag: string): void =>
      this.outbox_.push({
        dueS: endS + op.replyDelayS,
        durS: 4,
        sourceId: this.cfg_.id,
        callsign: op.callsign,
        text,
        freqHz: Math.round(this.cfg_.outputMHz * 1e6),
        mode: 'FM',
        erpDbm: this.cfg_.erpDbm,
        position: this.cfg_.position,
        tag,
      });
    const player = relay.payload.callsign ?? this.cfg_.playerCallsign;
    if (intent.kind === 'cq' || (intent.kind === 'call' && sameCall(intent.target, op.callsign))) {
      if (this.active_) return;
      const id = `rptr-contact-${++this.seq_}`;
      this.contacts_.push({
        id,
        remoteId: op.id,
        remoteCallsign: op.callsign,
        path: 'repeater',
        freqMHz: this.cfg_.outputMHz,
        mode: 'FM',
        startedS: nowS,
        remoteHeardPlayer: true,
        playerHeardRemote: false,
        exchanged: [],
        identified: false,
        closed: false,
        revision: this.cfg_.revision?.() ?? 0,
      });
      this.active_ = id;
      speak(`${player} this is ${op.callsign}, good to hear you on the repeater. ${op.lines[0] ?? ''}`.trim(), id);
      return;
    }
    const rec = this.contacts_.find((c) => c.id === this.active_);
    if (!rec) return;
    if (intent.kind === 'reply') {
      if (!rec.exchanged.includes(intent.item)) rec.exchanged.push(intent.item);
      const own = intent.item === 'name' ? ` My name is ${op.name}.` : intent.item === 'location' ? ` I am at ${op.location}.` : '';
      speak(`Roger your ${intent.item}.${own}`, rec.id);
    } else if (intent.kind === 'identify') {
      rec.identified = true;
      rec.closed = true;
      rec.completedS = nowS;
      this.active_ = null;
      speak(`${player}, 73, ${op.callsign} clear.`, rec.id);
    }
  }

  notePlayerHeard(emissionId: string, intelligibility: number): void {
    const cid = this.emissionToContact_[emissionId];
    const rec = cid ? this.contacts_.find((c) => c.id === cid) : undefined;
    if (rec && intelligibility >= 0.6) rec.playerHeardRemote = true;
  }

  isValidContact(contactId: string): boolean {
    const c = this.contacts_.find((x) => x.id === contactId);
    return !!c && c.remoteHeardPlayer && c.playerHeardRemote && c.exchanged.length > 0 && c.identified && c.closed;
  }

  getContacts(): HamContactRecord[] {
    return clone(this.contacts_);
  }

  tick(nowS: number): OnAirEmission[] {
    const c = this.cfg_;
    const res: OnAirEmission[] = [];
    if (!this.outage_ && this.lastActivityS_ !== null && (this.lastIdS_ === null || this.lastIdS_ < this.lastActivityS_) && nowS - (this.lastIdS_ ?? -Infinity) >= c.idIntervalS) {
      this.lastIdS_ = nowS;
      this.relaySeq_++;
      res.push({
        id: `rptr-relay-${this.relaySeq_}`,
        sourceId: c.id,
        isPlayer: false,
        freqHz: Math.round(c.outputMHz * 1e6),
        mode: 'CW',
        bandwidthHz: 150,
        erpDbm: c.erpDbm,
        polarization: 'V',
        position: c.position,
        payload: { kind: 'cw', text: `DE ${c.callsign}/R`, callsign: c.callsign },
        startS: nowS,
        endS: nowS + 5,
      });
    }
    if (this.outage_) return res;
    for (const { emission, out } of this.outbox_.popDue(nowS)) {
      if (out.tag) this.emissionToContact_[emission.id] = out.tag;
      res.push(emission);
    }
    return res;
  }

  getState(): RepeaterState {
    return clone({
      outage: this.outage_,
      lastActivityS: this.lastActivityS_,
      lastIdS: this.lastIdS_,
      contacts: this.contacts_,
      emissionToContact: this.emissionToContact_,
      active: this.active_,
      outbox: this.outbox_.getState(),
      accessLog: this.accessLog_,
      seq: this.seq_,
      relaySeq: this.relaySeq_,
    });
  }

  restoreState(s: RepeaterState): void {
    const c = clone(s);
    this.outage_ = c.outage;
    this.lastActivityS_ = c.lastActivityS;
    this.lastIdS_ = c.lastIdS;
    this.contacts_ = c.contacts;
    this.emissionToContact_ = c.emissionToContact;
    this.active_ = c.active;
    this.outbox_.restoreState(c.outbox);
    this.accessLog_ = c.accessLog;
    this.seq_ = c.seq;
    this.relaySeq_ = c.relaySeq;
  }
}
