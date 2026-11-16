/**
 * @file dmr - DMR repeater and talkgroup network (voice payload text only, no codec)
 * @description Access results are distinguishable codes the UI can display:
 *  - 'no-talk-permit'        wrong colour code, repeater ignores you
 *  - 'tg-not-on-slot'        talkgroup is not routed on the slot you used
 *  - 'empty-talkgroup'       delivered to a talkgroup nobody is listening to
 *  - 'ok'                    delivered and the remote talkgroup user answers
 */
import type { LocalPosition, OnAirEmission } from '../ham-types';
import { clone, type HearsFn, Outbox, type OutboxState, sameFreq } from './ops-common';

export interface DmrRemoteUser {
  id: string;
  callsign: string;
  name: string;
  talkgroup: number;
  /** Slot the repeater routes this talkgroup on */
  timeSlot: 1 | 2;
  replyDelayS: number;
  lines: string[];
}

export interface DmrRepeaterConfig {
  id: string;
  callsign: string;
  outputMHz: number;
  inputMHz: number;
  colorCode: number;
  /** Talkgroups routed per time slot (includes talkgroups nobody listens to) */
  slots: { 1: number[]; 2: number[] };
  position: LocalPosition;
  erpDbm: number;
  remote: DmrRemoteUser;
  hears: HearsFn;
}

export type DmrAccessCode = 'ok' | 'no-talk-permit' | 'tg-not-on-slot' | 'empty-talkgroup' | 'wrong-frequency' | 'wrong-mode' | 'weak' | 'outage';

export interface DmrAccessResult {
  code: DmrAccessCode;
  message: string;
  emissions: OnAirEmission[];
}

export interface DmrState {
  outage: boolean;
  outbox: OutboxState;
  log: { tS: number; code: DmrAccessCode; colorCode?: number; timeSlot?: number; talkgroup?: number }[];
  heardReply: boolean;
  replyIds: string[];
}

const MESSAGES: Record<DmrAccessCode, string> = {
  ok: 'Delivered. The talkgroup answered.',
  'no-talk-permit': 'No talk permit: the repeater ignored you (check colour code).',
  'tg-not-on-slot': 'Talkgroup not routed on this slot.',
  'empty-talkgroup': 'Delivered to the talkgroup, but nobody is listening there.',
  'wrong-frequency': 'Not on the repeater input frequency.',
  'wrong-mode': 'Not a DMR transmission.',
  weak: 'Signal too weak for the repeater to decode.',
  outage: 'The repeater is off the air.',
};

export class DmrRepeater {
  private readonly cfg_: DmrRepeaterConfig;
  private readonly outbox_ = new Outbox('dmr');
  private outage_ = false;
  private log_: DmrState['log'] = [];
  private heardReply_ = false;
  private replyIds_: string[] = [];

  constructor(cfg: DmrRepeaterConfig) {
    this.cfg_ = cfg;
  }

  setOutage(on: boolean): void {
    this.outage_ = on;
  }

  getAccessLog(): DmrState['log'] {
    return clone(this.log_);
  }

  private result_(e: OnAirEmission, nowS: number, code: DmrAccessCode, emissions: OnAirEmission[] = []): DmrAccessResult {
    this.log_.push({ tS: nowS, code, colorCode: e.dmr?.colorCode, timeSlot: e.dmr?.timeSlot, talkgroup: e.dmr?.talkgroup });
    return { code, message: MESSAGES[code], emissions };
  }

  onPlayerEmission(e: OnAirEmission, nowS: number): DmrAccessResult {
    const c = this.cfg_;
    if (e.mode !== 'DMR' || !e.dmr) return this.result_(e, nowS, 'wrong-mode');
    if (!sameFreq(e.freqHz, c.inputMHz * 1e6, 2500)) return this.result_(e, nowS, 'wrong-frequency');
    if (this.outage_) return this.result_(e, nowS, 'outage');
    if (e.dmr.colorCode !== c.colorCode) return this.result_(e, nowS, 'no-talk-permit');
    if (!c.hears(e, c.id).decoded) return this.result_(e, nowS, 'weak');
    const { timeSlot, talkgroup } = e.dmr;
    const routed = c.slots[timeSlot].includes(talkgroup);
    if (!routed) return this.result_(e, nowS, 'tg-not-on-slot');
    // Relay the player's voice on the output so other users hear it
    const relay: OnAirEmission = {
      ...clone(e),
      id: `dmr-relay-${this.log_.length}`,
      sourceId: c.id,
      isPlayer: false,
      freqHz: Math.round(c.outputMHz * 1e6),
      erpDbm: c.erpDbm,
      position: c.position,
    };
    const r = c.remote;
    if (talkgroup !== r.talkgroup || timeSlot !== r.timeSlot) {
      return this.result_(e, nowS, 'empty-talkgroup', [relay]);
    }
    const callsign = e.payload.callsign ?? 'the caller';
    this.outbox_.push({
      dueS: (e.endS ?? nowS + 4) + r.replyDelayS,
      durS: 4,
      sourceId: c.id,
      callsign: r.callsign,
      text: `${callsign} this is ${r.callsign}, ${r.name}, copy you fine on talkgroup ${talkgroup}. ${r.lines[0] ?? ''}`.trim(),
      freqHz: Math.round(c.outputMHz * 1e6),
      mode: 'DMR',
      erpDbm: c.erpDbm,
      position: c.position,
      dmr: { colorCode: c.colorCode, timeSlot: r.timeSlot, talkgroup: r.talkgroup },
      tag: 'reply',
    });
    return this.result_(e, nowS, 'ok', [relay]);
  }

  /** Remote talkgroup user answers; returns due DMR emissions */
  tick(nowS: number): OnAirEmission[] {
    if (this.outage_) return [];
    return this.outbox_.popDue(nowS).map(({ emission }) => {
      this.replyIds_.push(emission.id);
      return emission;
    });
  }

  notePlayerHeard(emissionId: string, intelligibility: number): void {
    if (this.replyIds_.includes(emissionId) && intelligibility >= 0.6) this.heardReply_ = true;
  }

  /** True once the player has actually heard a remote talkgroup reply */
  get playerHeardReply(): boolean {
    return this.heardReply_;
  }

  getState(): DmrState {
    return clone({ outage: this.outage_, outbox: this.outbox_.getState(), log: this.log_, heardReply: this.heardReply_, replyIds: this.replyIds_ });
  }

  restoreState(s: DmrState): void {
    const c = clone(s);
    this.outage_ = c.outage;
    this.outbox_.restoreState(c.outbox);
    this.log_ = c.log;
    this.heardReply_ = c.heardReply;
    this.replyIds_ = c.replyIds;
  }
}
