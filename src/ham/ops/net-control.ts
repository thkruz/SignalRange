/**
 * @file net-control - S12 club net with a scripted net control station
 * @description Script: opening -> call for check-ins -> player checks in (must give
 * their call sign) -> NCS announces the planned repeater outage and the simplex
 * fallback frequency -> NCS assigns traffic: relay an exact authored message to
 * the receiving station, who reads back what the player actually sent. The
 * receiver "fills" (repeats the authored text) on request. Message fidelity is
 * an exact-text comparison after normalizing case and whitespace. Radiogram
 * header fields are validated; the check must equal the text word count.
 */
import type { LocalPosition, OnAirEmission, TxIntent } from '../ham-types';
import { clone, type HearsFn, normalizeText, Outbox, type OutboxState, sameCall } from './ops-common';

export interface NetControlConfig {
  freqMHz: number;
  ncs: { id: string; callsign: string; name: string; position: LocalPosition; erpDbm: number };
  receiver: { id: string; callsign: string; name: string; position: LocalPosition; erpDbm: number };
  playerCallsign: string;
  openingS: number;
  /** Planned repeater outage the NCS announces after check-in */
  outage: { startsAtS: number; fallbackMHz: number };
  /** Authored message, deliberately containing unusual words that need phonetics */
  message: string;
  hears: HearsFn;
}

export type NetStage = 'pre' | 'opened' | 'checked-in' | 'traffic-assigned' | 'message-delivered' | 'closed';

export interface MessageAttempt {
  tS: number;
  text: string;
  exact: boolean;
  /** Words that differ from the authored message (position-wise) */
  wrongWords: string[];
}

export interface Radiogram {
  number: string;
  precedence: string;
  hx?: string;
  origin: string;
  check: number | string;
  place: string;
  time: string;
  date: string;
  text: string;
}

export interface RadiogramResult {
  ok: boolean;
  errors: string[];
  expectedCheck: number;
}

export interface NetState {
  stage: NetStage;
  checkedIn: boolean;
  checkInAttempts: number;
  identified: boolean;
  outageAnnounced: boolean;
  heardAssignment: boolean;
  assignmentIds: string[];
  attempts: MessageAttempt[];
  fills: number;
  radiograms: { tS: number; result: RadiogramResult }[];
  notes: string[];
  openingQueued: boolean;
  outbox: OutboxState;
}

const PRECEDENCES = ['R', 'W', 'P', 'EMERGENCY', 'ROUTINE', 'WELFARE', 'PRIORITY'];

export function wordCount(text: string): number {
  const t = text.trim();
  return t === '' ? 0 : t.split(/\s+/u).length;
}

export function compareMessage(sent: string, authored: string): { exact: boolean; wrongWords: string[] } {
  const a = normalizeText(authored).split(' ');
  const s = normalizeText(sent).split(' ');
  const exact = normalizeText(sent) === normalizeText(authored);
  const wrongWords: string[] = [];
  if (!exact) {
    for (let i = 0; i < Math.max(a.length, s.length); i++) {
      if (a[i] !== s[i]) wrongWords.push(a[i] ?? '(extra)');
    }
  }
  return { exact, wrongWords };
}

export function validateRadiogram(rg: Radiogram): RadiogramResult {
  const errors: string[] = [];
  const expectedCheck = wordCount(rg.text);
  if (!rg.number || String(rg.number).trim() === '') errors.push('Missing message number.');
  if (!PRECEDENCES.includes(String(rg.precedence).toUpperCase())) errors.push('Invalid precedence.');
  if (!rg.origin || rg.origin.trim() === '') errors.push('Missing station of origin.');
  if (!rg.place || rg.place.trim() === '') errors.push('Missing place of origin.');
  if (!rg.time || rg.time.trim() === '') errors.push('Missing filing time.');
  if (!rg.date || rg.date.trim() === '') errors.push('Missing filing date.');
  if (Number(rg.check) !== expectedCheck) {
    errors.push(`Check must equal the word count of the text (${expectedCheck}), got ${String(rg.check)}.`);
  }
  return { ok: errors.length === 0, errors, expectedCheck };
}

export class NetControl {
  private readonly cfg_: NetControlConfig;
  private readonly outbox_ = new Outbox('net');
  private stage_: NetStage = 'pre';
  private checkedIn_ = false;
  private checkInAttempts_ = 0;
  private identified_ = false;
  private outageAnnounced_ = false;
  private heardAssignment_ = false;
  private assignmentIds_: string[] = [];
  private attempts_: MessageAttempt[] = [];
  private fills_ = 0;
  private radiograms_: NetState['radiograms'] = [];
  private notes_: string[] = [];
  private openingQueued_ = false;

  constructor(cfg: NetControlConfig) {
    this.cfg_ = cfg;
  }

  get stage(): NetStage {
    return this.stage_;
  }

  /** Planned outage is in effect: announced to the player and its start time passed */
  outageActive(nowS: number): boolean {
    return this.outageAnnounced_ && nowS >= this.cfg_.outage.startsAtS;
  }

  private speak_(who: 'ncs' | 'receiver', dueS: number, text: string, tag?: string, freqMHz?: number): void {
    const s = this.cfg_[who];
    this.outbox_.push({
      dueS,
      durS: 5,
      sourceId: s.id,
      callsign: s.callsign,
      text,
      freqHz: Math.round((freqMHz ?? this.cfg_.freqMHz) * 1e6),
      mode: 'FM',
      erpDbm: s.erpDbm,
      position: s.position,
      tag,
    });
  }

  tick(nowS: number): OnAirEmission[] {
    const c = this.cfg_;
    if (!this.openingQueued_ && nowS >= c.openingS) {
      this.openingQueued_ = true;
      this.stage_ = 'opened';
      this.speak_('ncs', c.openingS, `This is ${c.ncs.callsign}, net control. The club net is now open. All stations please stand by.`);
      this.speak_('ncs', c.openingS + 8, `Net control calling for check-ins. Stations wishing to check in, give your call sign now.`);
    }
    return this.outbox_.popDue(nowS).map(({ emission, out }) => {
      if (out.tag === 'assignment') this.assignmentIds_.push(emission.id);
      return emission;
    });
  }

  onPlayerEmission(e: OnAirEmission, intent: TxIntent | null, nowS: number): void {
    const c = this.cfg_;
    if (!intent || this.stage_ === 'pre') return;
    if (Math.abs(e.freqHz - c.freqMHz * 1e6) > 3000 && !this.onFallback_(e)) return;
    if (!c.hears(e, c.ncs.id).decoded) {
      this.notes_.push('Net control did not copy a transmission.');
      return;
    }
    const due = nowS + 2;
    switch (intent.kind) {
      case 'net-checkin': {
        this.checkInAttempts_++;
        if (!sameCall(e.payload.callsign, c.playerCallsign)) {
          this.speak_('ncs', due, 'Station calling the net, you did not identify. Say again with your call sign.');
          this.notes_.push('Check-in without a valid call sign.');
          return;
        }
        if (this.checkedIn_) return;
        this.checkedIn_ = true;
        this.identified_ = true;
        this.stage_ = 'checked-in';
        this.speak_('ncs', due, `${c.playerCallsign}, copy, you are checked in. Thanks for joining the net.`);
        this.speak_(
          'ncs',
          due + 7,
          `Announcement: the repeater will be taken down for planned maintenance. When it goes off the air, move to simplex on ${c.outage.fallbackMHz.toFixed(3)} megahertz.`
        );
        this.outageAnnounced_ = true;
        this.speak_('ncs', due + 15, `${c.playerCallsign}, I have traffic for you. Relay this message to ${c.receiver.callsign}: ${c.message}`, 'assignment');
        this.stage_ = 'traffic-assigned';
        return;
      }
      case 'message': {
        if (this.stage_ !== 'traffic-assigned' && this.stage_ !== 'message-delivered') {
          this.notes_.push('Message sent before traffic was assigned.');
          return;
        }
        const cmp = compareMessage(intent.text, c.message);
        this.attempts_.push({ tS: nowS, text: intent.text, exact: cmp.exact, wrongWords: cmp.wrongWords });
        // The receiver reads back exactly what the player sent, so errors are audible
        this.speak_('receiver', due, `${c.receiver.callsign}, readback: ${intent.text}`, 'readback');
        if (cmp.exact) {
          this.stage_ = 'message-delivered';
          this.speak_('ncs', due + 8, `${c.playerCallsign}, readback is correct. Thank you, traffic complete.`);
        } else {
          this.speak_('ncs', due + 8, `${c.playerCallsign}, the readback does not match the message. Please send it again.`);
        }
        return;
      }
      case 'reply': {
        if (intent.item === 'fill' || intent.item === 'say-again') {
          if (this.stage_ === 'traffic-assigned' || this.stage_ === 'message-delivered') {
            this.fills_++;
            this.speak_('receiver', due, `Fill: ${c.message}`, 'assignment');
          }
        }
        return;
      }
      case 'identify':
        this.identified_ = true;
        this.speak_('ncs', due, `${c.playerCallsign}, 73.`);
        if (this.stage_ === 'message-delivered') this.stage_ = 'closed';
        return;
      default:
        return;
    }
  }

  private onFallback_(e: OnAirEmission): boolean {
    return this.outageAnnounced_ && Math.abs(e.freqHz - this.cfg_.outage.fallbackMHz * 1e6) <= 3000;
  }

  /** The player's reception model reported intelligibility of an emission */
  notePlayerHeard(emissionId: string, intelligibility: number): void {
    if (this.assignmentIds_.includes(emissionId) && intelligibility >= 0.6) this.heardAssignment_ = true;
  }

  get heardAssignment(): boolean {
    return this.heardAssignment_;
  }

  get messageDelivered(): boolean {
    return this.attempts_.some((a) => a.exact);
  }

  getAttempts(): MessageAttempt[] {
    return clone(this.attempts_);
  }

  get checkedIn(): boolean {
    return this.checkedIn_;
  }

  get fills(): number {
    return this.fills_;
  }

  submitRadiogram(rg: Radiogram, nowS: number): RadiogramResult {
    const result = validateRadiogram(rg);
    this.radiograms_.push({ tS: nowS, result });
    return result;
  }

  getNotes(): string[] {
    return [...this.notes_];
  }

  getState(): NetState {
    return clone({
      stage: this.stage_,
      checkedIn: this.checkedIn_,
      checkInAttempts: this.checkInAttempts_,
      identified: this.identified_,
      outageAnnounced: this.outageAnnounced_,
      heardAssignment: this.heardAssignment_,
      assignmentIds: this.assignmentIds_,
      attempts: this.attempts_,
      fills: this.fills_,
      radiograms: this.radiograms_,
      notes: this.notes_,
      openingQueued: this.openingQueued_,
      outbox: this.outbox_.getState(),
    });
  }

  restoreState(s: NetState): void {
    const c = clone(s);
    this.stage_ = c.stage;
    this.checkedIn_ = c.checkedIn;
    this.checkInAttempts_ = c.checkInAttempts;
    this.identified_ = c.identified;
    this.outageAnnounced_ = c.outageAnnounced;
    this.heardAssignment_ = c.heardAssignment;
    this.assignmentIds_ = c.assignmentIds;
    this.attempts_ = c.attempts;
    this.fills_ = c.fills;
    this.radiograms_ = c.radiograms;
    this.notes_ = c.notes;
    this.openingQueued_ = c.openingQueued;
    this.outbox_.restoreState(c.outbox);
  }
}
