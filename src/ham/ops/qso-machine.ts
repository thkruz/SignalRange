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
  /** When true, fromS and toS count from the first moment a powered radio monitors this frequency */
  relativeToMonitor?: boolean;
  /** Authored remote chatter radiated while the window is open, so the player can hear the conversation */
  traffic?: BusyTraffic;
}

/** Scripted two-way chatter that occupies a busy channel */
export interface BusyTraffic {
  lines: { sourceId: string; callsign: string; text: string; position: LocalPosition }[];
  /** Seconds between the start of one line and the next */
  gapS: number;
  erpDbm: number;
  mode: HamMode;
}

/** What a remote station reported about the player's transmitted audio */
export type AudioVerdict = 'clean' | 'overdrive' | 'feedback' | 'both';

export interface AudioReport {
  tS: number;
  verdict: AudioVerdict;
  drive: number;
  powerW: number;
}

export interface QsoMachineConfig {
  playerCallsign: string;
  stations: RemoteStationConfig[];
  hears: HearsFn;
  busy?: BusyWindow[];
  /** Stations answer a voice test transmission with an audio report (no contact is started) */
  audioCheck?: boolean;
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
  /** First call that went out on a clear channel, with the clear listening time before it */
  firstClearCall?: { freqMHz: number; clearS: number; tS: number } | null;
  clearMonitoredS?: Record<string, number>;
  busyStartS?: Record<string, number>;
  busyLinesSent?: Record<string, number>;
  rfFlagged?: Record<string, number>;
  audioReports?: AudioReport[];
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
  private firstClearCall_: NonNullable<QsoState['firstClearCall']> | null = null;
  private clearMonitoredS_: Record<string, number> = {};
  private busyStartS_: Record<string, number> = {};
  private busyLinesSent_: Record<string, number> = {};
  /** contactId -> transmit power (W) at which RF feedback was reported */
  private rfFlagged_: Record<string, number> = {};
  private audioReports_: AudioReport[] = [];
  private lastIdS_: number | null = null;
  private idOverdueCount_ = 0;
  private micFlagged_: Record<string, boolean> = {};
  private notes_: QsoNote[] = [];
  private lastBeaconS_: Record<string, number> = {};
  private seq_ = 0;
  private lastNowS_ = 0;

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
  noteMonitoring(freqMHz: number, squelchOpen: boolean, dtS: number, nowS?: number): void {
    const k = this.key_(freqMHz);
    const t = nowS ?? this.lastNowS_;
    (this.cfg_.busy ?? []).forEach((b, i) => {
      if (b.relativeToMonitor && this.key_(b.freqMHz) === k && this.busyStartS_[String(i)] === undefined) this.busyStartS_[String(i)] = t;
    });
    this.monitoredS_[k] = (this.monitoredS_[k] ?? 0) + dtS;
    if (squelchOpen) this.squelchOpenS_[k] = (this.squelchOpenS_[k] ?? 0) + dtS;
    if (!this.isChannelBusy(freqMHz * 1e6, t)) this.clearMonitoredS_[k] = (this.clearMonitoredS_[k] ?? 0) + dtS;
  }

  /** Seconds the player monitored this frequency while it was free of authored traffic */
  clearMonitoredFor(freqMHz: number): number {
    return this.clearMonitoredS_[this.key_(freqMHz)] ?? 0;
  }

  monitoredFor(freqMHz: number): number {
    return this.monitoredS_[this.key_(freqMHz)] ?? 0;
  }

  /** True when the first call that went out on a clear channel followed at least `minS` of listening while it was clear */
  listenedBeforeFirstCall(minS = 10): boolean {
    return !!this.firstClearCall_ && this.firstClearCall_.clearS >= minS;
  }

  /** Voice reports the remote gave on the player's audio, oldest first */
  getAudioReports(): AudioReport[] {
    return clone(this.audioReports_);
  }

  getFirstCall(): QsoState['firstCall'] {
    return this.firstCall_ ? { ...this.firstCall_ } : null;
  }

  private busyBounds_(b: BusyWindow, i: number): { from: number; to: number } | null {
    if (!b.relativeToMonitor) return { from: b.fromS, to: b.toS };
    const start = this.busyStartS_[String(i)];

    return start === undefined ? null : { from: start + b.fromS, to: start + b.toS };
  }

  isChannelBusy(freqHz: number, nowS: number): boolean {
    return (this.cfg_.busy ?? []).some((b, i) => {
      if (!sameFreq(b.freqMHz * 1e6, freqHz, 2500)) return false;
      const w = this.busyBounds_(b, i);

      return w !== null && nowS >= w.from && nowS < w.to;
    });
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
    this.lastNowS_ = nowS;
    if (intent?.kind === 'test' && this.cfg_.audioCheck) {
      this.handleAudioTest_(e, nowS);
      return;
    }
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
    if (!this.firstClearCall_) this.firstClearCall_ = { freqMHz, clearS: this.clearMonitoredFor(freqMHz), tS: nowS };
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
      const mic = this.micTalk_(st, rec, e, nowS);
      this.say_(st, nowS, `${this.callsign_(e)} this is ${st.callsign}, you're five by nine here.${mic} ${st.personality[0] ?? ''}`.trim(), id);
      return; // one station answers per call
    }
    if (candidates.length > 0) {
      this.note_(nowS, 'not-decoded', 'No station decoded the call (signal too weak or wrong settings).');
    }
  }

  private audioVerdict_(e: OnAirEmission): AudioVerdict {
    const over = e.audioDrive !== undefined && e.audioDrive > 7;
    const fb = e.rfFeedback === true;
    if (over && fb) return 'both';

    return over ? 'overdrive' : fb ? 'feedback' : 'clean';
  }

  /** Remote station report on the audio of one transmission; flags and clears the two audio problems */
  private micTalk_(st: RemoteStationConfig, rec: HamContactRecord, e: OnAirEmission, nowS: number): string {
    const drive = e.audioDrive;
    const verdict = this.audioVerdict_(e);
    let text = '';
    if (verdict === 'overdrive' || verdict === 'both') {
      this.micFlagged_[rec.id] = true;
      this.note_(nowS, 'mic-distorted', `${st.callsign} reports distorted audio.`);
      text += ' Your audio is distorted at every power level and it gets worse as the mic gain goes up. Back off from the microphone.';
    }
    if (verdict === 'feedback' || verdict === 'both') {
      this.rfFlagged_[rec.id] = e.txPowerW ?? 0;
      this.note_(nowS, 'rf-feedback', `${st.callsign} hears hum and squeal on the carrier at high power.`);
      text += ' I hear hum and a squeal on your carrier, and only when you run high power. Your voice itself is not overdriven.';
    }
    if (text) return text;
    if (this.micFlagged_[rec.id] && drive !== undefined && drive >= 4 && drive <= 6) {
      this.micFlagged_[rec.id] = false;
      if (!rec.exchanged.includes('mic-adjusted')) rec.exchanged.push('mic-adjusted');
      return ' Much better, your audio is clean now.';
    }
    const fbPower = this.rfFlagged_[rec.id];
    if (fbPower !== undefined && (e.txPowerW ?? 0) >= fbPower) {
      delete this.rfFlagged_[rec.id];
      if (!rec.exchanged.includes('feedback-cleared')) rec.exchanged.push('feedback-cleared');
      return ' The hum and squeal are gone, even at that power. Clean.';
    }

    return '';
  }

  /** A voice test transmission: the station answers with what it hears, and no contact starts */
  private handleAudioTest_(e: OnAirEmission, nowS: number): void {
    const st = this.cfg_.stations.find((s) => sameFreq(s.freqMHz * 1e6, e.freqHz) && s.mode === e.mode);
    if (!st || !this.cfg_.hears(e, st.id).decoded) {
      this.note_(nowS, 'not-decoded', 'No station decoded the test transmission.');
      return;
    }
    const verdict = this.audioVerdict_(e);
    this.audioReports_.push({ tS: nowS, verdict, drive: e.audioDrive ?? 5, powerW: e.txPowerW ?? 0 });
    const say: Record<AudioVerdict, string> = {
      clean: 'Your audio is clean at this power and gain.',
      overdrive: 'Your audio is distorted at all power levels. It follows the mic gain, not the power.',
      feedback: 'Your voice is fine, but there is a hum and squeal on your carrier when you run this much power.',
      both: 'Your audio is distorted, and there is also a hum and squeal on the carrier at this power.',
    };
    this.say_(st, nowS, `${this.callsign_(e)}, ${st.callsign} here. ${say[verdict]}`);
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
    const mic = this.micTalk_(st, rec, e, nowS);
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
    this.lastNowS_ = nowS;
    this.emitBusyTraffic_(nowS);
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

  /** Radiate the next scripted line of each open busy window */
  private emitBusyTraffic_(nowS: number): void {
    (this.cfg_.busy ?? []).forEach((b, i) => {
      const t = b.traffic;
      const w = this.busyBounds_(b, i);
      if (!t || !w || nowS < w.from || nowS >= w.to) return;
      const k = String(i);
      const idx = Math.floor((nowS - w.from) / t.gapS);
      if (idx < (this.busyLinesSent_[k] ?? 0)) return;
      const line = t.lines[idx % t.lines.length];
      this.busyLinesSent_[k] = idx + 1;
      this.outbox_.push({
        dueS: nowS,
        durS: Math.min(CALL_DUR_S, t.gapS),
        sourceId: line.sourceId,
        callsign: line.callsign,
        text: line.text,
        freqHz: Math.round(b.freqMHz * 1e6),
        mode: t.mode,
        erpDbm: t.erpDbm,
        position: line.position,
        tag: 'beacon',
      });
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
      firstClearCall: this.firstClearCall_,
      clearMonitoredS: this.clearMonitoredS_,
      busyStartS: this.busyStartS_,
      busyLinesSent: this.busyLinesSent_,
      rfFlagged: this.rfFlagged_,
      audioReports: this.audioReports_,
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
    this.firstClearCall_ = c.firstClearCall ?? null;
    this.clearMonitoredS_ = c.clearMonitoredS ?? {};
    this.busyStartS_ = c.busyStartS ?? {};
    this.busyLinesSent_ = c.busyLinesSent ?? {};
    this.rfFlagged_ = c.rfFlagged ?? {};
    this.audioReports_ = c.audioReports ?? [];
    this.lastIdS_ = c.lastIdS;
    this.idOverdueCount_ = c.idOverdueCount;
    this.micFlagged_ = c.micFlagged;
    this.notes_ = c.notes;
    this.outbox_.restoreState(c.outbox);
    this.lastBeaconS_ = c.lastBeaconS;
    this.seq_ = c.seq;
  }
}
