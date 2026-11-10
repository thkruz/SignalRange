/**
 * @file qso-machine - Simplex contact flow against remote station agents
 * @description A contact is only valid when the remote decoded the player's call
 * and the player heard the reply. Carriers and beacons never complete one.
 * Flow: call/CQ -> remote reply -> exchange items -> identify -> closed.
 */
import type { HamContactRecord, HamMode, LocalPosition, OnAirEmission, TxIntent } from '../ham-types';
import { clone, type HearsFn, Outbox, type OutboxState, sameCall, sameFreq } from './ops-common';

export interface RemoteStationConfig {
  id: string;
  callsign: string;
  name: string;
  location: string;
  grid: string;
  position: LocalPosition;
  freqMHz: number;
  mode: HamMode;
  erpDbm: number;
  replyDelayS: number;
  personality: string[];
  /** Optional beacon the station sends alone (never a contact) */
  beacon?: { intervalS: number; text: string };
}

/** An authored ongoing conversation that occupies a frequency */
export interface BusyWindow {
  freqMHz: number;
  fromS: number;
  toS: number;
}

export interface QsoMachineConfig {
  playerCallsign: string;
  stations: RemoteStationConfig[];
  hears: HearsFn;
  busy?: BusyWindow[];
  /** Revision stamped on contact records */
  revision?: () => number;
}

export interface QsoNote {
  tS: number;
  code: string;
  text: string;
}

export interface QsoState {
  contacts: HamContactRecord[];
  active: Record<string, string>; // stationId -> contactId
  emissionToContact: Record<string, string>;
  monitoredS: Record<string, number>;
  squelchOpenS: Record<string, number>;
  firstCall: { freqMHz: number; monitoredS: number; tS: number } | null;
  lastIdS: number | null;
  idOverdueCount: number;
  micFlagged: Record<string, boolean>;
  notes: QsoNote[];
  outbox: OutboxState;
  lastBeaconS: Record<string, number>;
  seq: number;
}

const ID_INTERVAL_S = 600;
const CALL_DUR_S = 4;

export class QsoMachine {
  private readonly cfg_: QsoMachineConfig;
  private readonly outbox_ = new Outbox('qso');
  private contacts_: HamContactRecord[] = [];
  private active_: Record<string, string> = {};
  private emissionToContact_: Record<string, string> = {};
  private monitoredS_: Record<string, number> = {};
  private squelchOpenS_: Record<string, number> = {};
  private firstCall_: QsoState['firstCall'] = null;
  private lastIdS_: number | null = null;
  private idOverdueCount_ = 0;
  private micFlagged_: Record<string, boolean> = {};
  private notes_: QsoNote[] = [];
  private lastBeaconS_: Record<string, number> = {};
  private seq_ = 0;

  constructor(cfg: QsoMachineConfig) {
    this.cfg_ = cfg;
  }

  private key_(freqMHz: number): string {
    return freqMHz.toFixed(3);
  }

  private note_(tS: number, code: string, text: string): void {
    this.notes_.push({ tS, code, text });
  }

  /** Time the player has monitored a frequency (squelchOpen = activity heard) */
  noteMonitoring(freqMHz: number, squelchOpen: boolean, dtS: number): void {
    const k = this.key_(freqMHz);
    this.monitoredS_[k] = (this.monitoredS_[k] ?? 0) + dtS;
    if (squelchOpen) this.squelchOpenS_[k] = (this.squelchOpenS_[k] ?? 0) + dtS;
  }

  monitoredFor(freqMHz: number): number {
    return this.monitoredS_[this.key_(freqMHz)] ?? 0;
  }

  /** True when the player listened at least `minS` before their first call */
  listenedBeforeFirstCall(minS = 10): boolean {
    return !!this.firstCall_ && this.firstCall_.monitoredS >= minS;
  }

  getFirstCall(): QsoState['firstCall'] {
    return this.firstCall_ ? { ...this.firstCall_ } : null;
  }

  isChannelBusy(freqHz: number, nowS: number): boolean {
    return (this.cfg_.busy ?? []).some((b) => sameFreq(b.freqMHz * 1e6, freqHz, 2500) && nowS >= b.fromS && nowS < b.toS);
  }

  /** 97.119: true when a contact is active and the last ID is older than 10 min */
  identificationOverdue(nowS: number): boolean {
    const hasActive = Object.keys(this.active_).length > 0;
    return hasActive && this.lastIdS_ !== null && nowS - this.lastIdS_ > ID_INTERVAL_S;
  }

  private contact_(id: string): HamContactRecord | undefined {
    return this.contacts_.find((c) => c.id === id);
  }

  private say_(st: RemoteStationConfig, nowS: number, text: string, contactId?: string): void {
    this.outbox_.push({
      dueS: nowS + st.replyDelayS,
      durS: CALL_DUR_S,
      sourceId: st.id,
      callsign: st.callsign,
      text,
      freqHz: Math.round(st.freqMHz * 1e6),
      mode: st.mode,
      erpDbm: st.erpDbm,
      position: st.position,
      tag: contactId,
    });
  }

  private callsign_(e: OnAirEmission): string {
    return e.payload.callsign ?? this.cfg_.playerCallsign;
  }

  /** The player keyed up. `intent` is the content choice behind the transmission. */
  onPlayerEmission(e: OnAirEmission, intent: TxIntent | null, nowS: number): void {
    if (intent === null || intent.kind === 'carrier' || intent.kind === 'test') {
      // A bare carrier or test tone never starts or advances a contact
      this.note_(nowS, 'carrier-only', 'Carrier/test transmission carries no call and starts no contact.');
      return;
    }
    const candidates = this.cfg_.stations.filter((s) => sameFreq(s.freqMHz * 1e6, e.freqHz) && s.mode === e.mode);
    if (intent.kind === 'cq' || intent.kind === 'call') {
      this.handleCall_(e, intent, candidates, nowS);
    } else if (intent.kind === 'reply' || intent.kind === 'identify') {
      this.handleExchange_(e, intent, candidates, nowS);
    } else {
      this.note_(nowS, 'ignored', `Intent ${intent.kind} has no meaning on a simplex contact.`);
    }
    if (intent.kind === 'cq' || intent.kind === 'call' || intent.kind === 'identify') {
      if (e.payload.callsign === undefined || sameCall(e.payload.callsign, this.cfg_.playerCallsign)) {
        this.lastIdS_ = nowS;
      }
    }
  }

  private handleCall_(e: OnAirEmission, intent: TxIntent, candidates: RemoteStationConfig[], nowS: number): void {
    const freqMHz = e.freqHz / 1e6;
    if (!this.firstCall_) {
      this.firstCall_ = { freqMHz, monitoredS: this.monitoredFor(freqMHz), tS: nowS };
    }
    if (this.isChannelBusy(e.freqHz, nowS)) {
      this.note_(nowS, 'channel-busy', 'Called over an ongoing conversation: collision, nobody decoded you. Listen first.');
      return;
    }
    const target = intent.kind === 'call' ? intent.target : null;
    for (const st of candidates) {
      if (target && !sameCall(target, st.callsign)) continue;
      if (this.active_[st.id]) continue;
      if (!this.cfg_.hears(e, st.id).decoded) continue;
      const id = `contact-${++this.seq_}`;
      const rec: HamContactRecord = {
        id,
        remoteId: st.id,
        remoteCallsign: st.callsign,
        path: 'simplex',
        freqMHz: st.freqMHz,
        mode: st.mode,
        startedS: nowS,
        remoteHeardPlayer: true,
        playerHeardRemote: false,
        exchanged: [],
        identified: false,
        closed: false,
        revision: this.cfg_.revision?.() ?? 0,
      };
      this.contacts_.push(rec);
      this.active_[st.id] = id;
      const mic = this.micTalk_(st, rec, e.audioDrive, nowS);
      this.say_(st, nowS, `${this.callsign_(e)} this is ${st.callsign}, you're five by nine here.${mic} ${st.personality[0] ?? ''}`.trim(), id);
      return; // one station answers per call
    }
    if (candidates.length > 0) {
      this.note_(nowS, 'not-decoded', 'No station decoded the call (signal too weak or wrong settings).');
    }
  }

  private micTalk_(st: RemoteStationConfig, rec: HamContactRecord, drive: number | undefined, nowS: number): string {
    if (drive !== undefined && drive > 7) {
      this.micFlagged_[rec.id] = true;
      this.note_(nowS, 'mic-distorted', `${st.callsign} reports distorted audio.`);
      return ' Your audio is distorted, please back off from the microphone.';
    }
    if (this.micFlagged_[rec.id] && drive !== undefined && drive >= 4 && drive <= 6) {
      this.micFlagged_[rec.id] = false;
      if (!rec.exchanged.includes('mic-adjusted')) rec.exchanged.push('mic-adjusted');
      return ' Much better, your audio is clean now.';
    }
    return '';
  }

  private handleExchange_(e: OnAirEmission, intent: TxIntent, candidates: RemoteStationConfig[], nowS: number): void {
    const st = candidates.find((s) => this.active_[s.id]);
    if (!st) {
      this.note_(nowS, 'no-active-contact', 'Nobody is in contact with you on this frequency.');
      return;
    }
    const rec = this.contact_(this.active_[st.id]) as HamContactRecord;
    if (!this.cfg_.hears(e, st.id).decoded) {
      this.note_(nowS, 'not-decoded', `${st.callsign} did not copy that transmission.`);
      return;
    }
    const mic = this.micTalk_(st, rec, e.audioDrive, nowS);
    if (intent.kind === 'reply') {
      const item = intent.item;
      if (!rec.exchanged.includes(item)) rec.exchanged.push(item);
      this.say_(st, nowS, `Roger your ${item}. ${this.ownItem_(st, item)}${mic}`.trim(), rec.id);
    } else if (intent.kind === 'identify') {
      if (e.payload.callsign !== undefined && !sameCall(e.payload.callsign, this.cfg_.playerCallsign)) {
        this.note_(nowS, 'wrong-callsign', 'Identification carried a call sign that is not yours.');
        return;
      }
      rec.identified = true;
      rec.closed = true;
      rec.completedS = nowS;
      delete this.active_[st.id];
      this.say_(st, nowS, `${this.cfg_.playerCallsign}, thanks for the contact, 73. ${st.callsign} clear.`, rec.id);
    }
  }

  private ownItem_(st: RemoteStationConfig, item: string): string {
    switch (item) {
      case 'report':
        return 'You are five by nine. ';
      case 'name':
        return `My name is ${st.name}. `;
      case 'location':
        return `I am in ${st.location}. `;
      case 'grid':
        return `My grid is ${st.grid}. `;
      default:
        return '';
    }
  }

  /** The player's reception model reported how intelligible an emission was */
  notePlayerHeard(emissionId: string, intelligibility: number): void {
    const cid = this.emissionToContact_[emissionId];
    if (!cid) return; // beacon or unrelated emission: never a contact
    const rec = this.contact_(cid);
    if (rec && intelligibility >= 0.6) rec.playerHeardRemote = true;
  }

  /** A contact counts only when two-way, exchanged, identified and closed */
  isValidContact(contactId: string): boolean {
    const c = this.contact_(contactId);
    return !!c && c.remoteHeardPlayer && c.playerHeardRemote && c.exchanged.length > 0 && c.identified && c.closed;
  }

  getContacts(): HamContactRecord[] {
    return clone(this.contacts_);
  }

  getNotes(): QsoNote[] {
    return clone(this.notes_);
  }

  /** Radiate due replies and beacons */
  tick(nowS: number): OnAirEmission[] {
    const lastId = this.lastIdS_;
    if (lastId !== null && this.identificationOverdue(nowS)) {
      if (!this.notes_.some((n) => n.code === 'id-overdue' && n.tS > lastId)) {
        this.idOverdueCount_++;
        this.note_(nowS, 'id-overdue', 'More than 10 minutes since your last identification (97.119).');
      }
    }
    for (const st of this.cfg_.stations) {
      if (!st.beacon) continue;
      const last = this.lastBeaconS_[st.id] ?? -Infinity;
      if (nowS - last >= st.beacon.intervalS) {
        this.lastBeaconS_[st.id] = nowS;
        this.outbox_.push({
          dueS: nowS,
          durS: 3,
          sourceId: st.id,
          callsign: st.callsign,
          text: st.beacon.text,
          freqHz: Math.round(st.freqMHz * 1e6),
          mode: st.mode,
          erpDbm: st.erpDbm,
          position: st.position,
          tag: 'beacon',
        });
      }
    }
    return this.outbox_.popDue(nowS).map(({ emission, out }) => {
      if (out.tag && out.tag !== 'beacon') this.emissionToContact_[emission.id] = out.tag;
      return emission;
    });
  }

  getState(): QsoState {
    return clone({
      contacts: this.contacts_,
      active: this.active_,
      emissionToContact: this.emissionToContact_,
      monitoredS: this.monitoredS_,
      squelchOpenS: this.squelchOpenS_,
      firstCall: this.firstCall_,
      lastIdS: this.lastIdS_,
      idOverdueCount: this.idOverdueCount_,
      micFlagged: this.micFlagged_,
      notes: this.notes_,
      outbox: this.outbox_.getState(),
      lastBeaconS: this.lastBeaconS_,
      seq: this.seq_,
    });
  }

  restoreState(s: QsoState): void {
    const c = clone(s);
    this.contacts_ = c.contacts;
    this.active_ = c.active;
    this.emissionToContact_ = c.emissionToContact;
    this.monitoredS_ = c.monitoredS;
    this.squelchOpenS_ = c.squelchOpenS;
    this.firstCall_ = c.firstCall;
    this.lastIdS_ = c.lastIdS;
    this.idOverdueCount_ = c.idOverdueCount;
    this.micFlagged_ = c.micFlagged;
    this.notes_ = c.notes;
    this.outbox_.restoreState(c.outbox);
    this.lastBeaconS_ = c.lastBeaconS;
    this.seq_ = c.seq;
  }
}
