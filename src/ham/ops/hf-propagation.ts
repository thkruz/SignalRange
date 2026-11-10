/**
 * @file hf-propagation - Bounded ten-metre propagation model and remote HF agents
 * @description Unlike the VHF/UHF modules this one owns its (simple) path model,
 * because ten-metre skip is time-varying. A schedule gives 'open' | 'marginal' |
 * 'closed'. Distant stations (> LOCAL_KM) are reached by one F2 hop:
 *   loss = FSPL(slant) + absorption(condition) + slow fade
 * with closed = no path at any power. Local stations use ground wave/line of sight.
 * The manager should apply `getEmissionPathLossDb(emissionId)` when the player
 * receives an emission produced here (the generic VHF budget does not apply).
 */
import type { HamContactRecord, LocalPosition, OnAirEmission, TxIntent } from '../ham-types';
import { clone, distanceKm, Outbox, type OutboxState, sameCall } from './ops-common';

export type TenMetreCondition = 'open' | 'marginal' | 'closed';

export interface ConditionSlot {
  fromS: number;
  toS: number;
  state: TenMetreCondition;
}

export interface HfStationConfig {
  id: string;
  callsign: string;
  name: string;
  grid: string;
  position: LocalPosition;
  /** Frequency the station listens on (USB), MHz, e.g. 28.425 */
  freqMHz: number;
  erpDbm: number;
  replyDelayS: number;
}

export interface HfConfig {
  schedule: ConditionSlot[];
  defaultCondition: TenMetreCondition;
  stations: HfStationConfig[];
  playerPosition?: LocalPosition;
  playerCallsign: string;
  revision?: () => number;
}

export interface HfEvaluation {
  decoded: boolean;
  snrDb: number;
  pathLossDb: number;
  condition: TenMetreCondition;
  reason: 'ok' | 'closed' | 'weak' | 'off-frequency' | 'wrong-mode';
}

export interface HfState {
  outbox: OutboxState;
  contacts: HamContactRecord[];
  active: Record<string, string>;
  emissionToContact: Record<string, string>;
  emissionLoss: Record<string, { km: number; stationId: string }>;
  seq: number;
}

export const LOCAL_KM = 40;
const F2_HEIGHT_KM = 300;
const NOISE_FLOOR_DBM = -120; // 2.4 kHz including man-made noise
const REQUIRED_SNR_DB = 3;
const TUNE_TOL_HZ = 300;
const ABSORPTION: Record<TenMetreCondition, number> = { open: 12, marginal: 28, closed: 200 };
const FADE_DB: Record<TenMetreCondition, number> = { open: 2, marginal: 6, closed: 0 };

/** Authored example emissions living in their own segments (28.0 to 28.3 MHz) */
export const HF_BACKGROUND = [
  { id: 'hf-bg-cw', freqMHz: 28.06, mode: 'CW' as const, text: 'CQ CQ DE W0XQT W0XQT K', callsign: 'W0XQT', km: 1800 },
  { id: 'hf-bg-ft8', freqMHz: 28.074, mode: 'FT8' as const, text: 'CQ N0FTX EM38', callsign: 'N0FTX', km: 2200 },
];

export function fsplDb(distKm: number, freqHz: number): number {
  return 32.44 + 20 * Math.log10(freqHz / 1e6) + 20 * Math.log10(Math.max(distKm, 0.1));
}

export class HfPropagation {
  private readonly cfg_: HfConfig;
  private readonly outbox_ = new Outbox('hf');
  private contacts_: HamContactRecord[] = [];
  private active_: Record<string, string> = {};
  private emissionToContact_: Record<string, string> = {};
  private emissionLoss_: HfState['emissionLoss'] = {};
  private seq_ = 0;

  constructor(cfg: HfConfig) {
    this.cfg_ = cfg;
  }

  private player_(): LocalPosition {
    return this.cfg_.playerPosition ?? { xKm: 0, yKm: 0, heightM: 10 };
  }

  condition(nowS: number): TenMetreCondition {
    const slot = this.cfg_.schedule.find((s) => nowS >= s.fromS && nowS < s.toS);
    return slot ? slot.state : this.cfg_.defaultCondition;
  }

  /** Path loss between the player and a point at `km` (one-way, symmetric) */
  pathLossDb(km: number, freqHz: number, nowS: number, phase = 0): { lossDb: number; condition: TenMetreCondition } {
    const cond = this.condition(nowS);
    if (km <= LOCAL_KM) {
      return { lossDb: fsplDb(km, freqHz) + 8, condition: cond }; // ground wave: unaffected by skip
    }
    const half = km / 2;
    const slant = 2 * Math.sqrt(half * half + F2_HEIGHT_KM * F2_HEIGHT_KM);
    const fade = FADE_DB[cond] * Math.sin((2 * Math.PI * nowS) / 300 + phase);
    return { lossDb: fsplDb(slant, freqHz) + ABSORPTION[cond] + fade, condition: cond };
  }

  /** RIT shifts only the receiver; the transmit frequency is untouched */
  rxFrequencyHz(txHz: number, ritHz: number, ritOn: boolean): { txHz: number; rxHz: number } {
    return { txHz, rxHz: ritOn ? txHz + ritHz : txHz };
  }

  evaluate(e: OnAirEmission, st: HfStationConfig, nowS: number): HfEvaluation {
    const km = distanceKm(this.player_(), st.position);
    const { lossDb, condition } = this.pathLossDb(km, e.freqHz, nowS, st.freqMHz);
    const noise = NOISE_FLOOR_DBM + 10 * Math.log10(Math.max(e.bandwidthHz, 100) / 2400);
    const snrDb = e.erpDbm - lossDb - noise;
    const base = { snrDb, pathLossDb: lossDb, condition };
    if (e.mode !== 'USB') return { ...base, decoded: false, reason: 'wrong-mode' };
    if (Math.abs(e.freqHz - st.freqMHz * 1e6) > TUNE_TOL_HZ) return { ...base, decoded: false, reason: 'off-frequency' };
    if (km > LOCAL_KM && condition === 'closed') return { ...base, decoded: false, reason: 'closed' };
    if (snrDb < REQUIRED_SNR_DB) return { ...base, decoded: false, reason: 'weak' };
    return { ...base, decoded: true, reason: 'ok' };
  }

  private say_(st: HfStationConfig, nowS: number, text: string, tag: string): void {
    this.outbox_.push({
      dueS: nowS + st.replyDelayS,
      durS: 5,
      sourceId: st.id,
      callsign: st.callsign,
      text,
      freqHz: Math.round(st.freqMHz * 1e6),
      mode: 'USB',
      erpDbm: st.erpDbm,
      position: st.position,
      tag,
    });
  }

  onPlayerEmission(e: OnAirEmission, intent: TxIntent | null, nowS: number): HfEvaluation[] {
    const evals: HfEvaluation[] = [];
    if (!intent || intent.kind === 'carrier' || intent.kind === 'test') return evals;
    const me = e.payload.callsign ?? this.cfg_.playerCallsign;
    for (const st of this.cfg_.stations) {
      if (Math.abs(e.freqHz - st.freqMHz * 1e6) > 5000) continue;
      const ev = this.evaluate(e, st, nowS);
      evals.push(ev);
      if (!ev.decoded) continue;
      if (intent.kind === 'cq' || (intent.kind === 'call' && sameCall(intent.target, st.callsign))) {
        if (this.active_[st.id]) continue;
        const id = `hf-contact-${++this.seq_}`;
        this.contacts_.push({
          id,
          remoteId: st.id,
          remoteCallsign: st.callsign,
          path: 'hf',
          freqMHz: st.freqMHz,
          mode: 'USB',
          startedS: nowS,
          remoteHeardPlayer: true,
          playerHeardRemote: false,
          exchanged: [],
          identified: false,
          closed: false,
          revision: this.cfg_.revision?.() ?? 0,
        });
        this.active_[st.id] = id;
        this.say_(st, nowS, `${me} this is ${st.callsign}, ${st.name}, you are five and seven. Grid ${st.grid}.`, id);
      } else if (this.active_[st.id]) {
        const rec = this.contacts_.find((c) => c.id === this.active_[st.id]) as HamContactRecord;
        if (intent.kind === 'reply') {
          if (!rec.exchanged.includes(intent.item)) rec.exchanged.push(intent.item);
          this.say_(st, nowS, `Roger your ${intent.item}.`, rec.id);
        } else if (intent.kind === 'identify') {
          rec.identified = true;
          rec.closed = true;
          rec.completedS = nowS;
          delete this.active_[st.id];
          this.say_(st, nowS, `${me}, 73 and good DX, ${st.callsign} clear.`, rec.id);
        }
      }
    }
    return evals;
  }

  tick(nowS: number): OnAirEmission[] {
    return this.outbox_.popDue(nowS).map(({ emission, out }) => {
      if (out.tag) this.emissionToContact_[emission.id] = out.tag;
      const st = this.cfg_.stations.find((s) => s.id === out.sourceId);
      if (st) this.emissionLoss_[emission.id] = { km: distanceKm(this.player_(), st.position), stationId: st.id };
      return emission;
    });
  }

  /** Path loss the manager should apply for an emission produced by this module */
  getEmissionPathLossDb(emissionId: string, nowS: number): number | null {
    const rec = this.emissionLoss_[emissionId];
    if (rec) {
      const st = this.cfg_.stations.find((s) => s.id === rec.stationId);
      return this.pathLossDb(rec.km, (st?.freqMHz ?? 28.4) * 1e6, nowS, st?.freqMHz ?? 0).lossDb;
    }
    const bg = HF_BACKGROUND.find((b) => b.id === emissionId);
    return bg ? this.pathLossDb(bg.km, bg.freqMHz * 1e6, nowS, bg.freqMHz).lossDb : null;
  }

  /** Whether the path to a remote at `km` is currently usable at all */
  pathUsable(km: number, nowS: number): boolean {
    return km <= LOCAL_KM || this.condition(nowS) !== 'closed';
  }

  /** CW and FT8 example signals to find in their own segments */
  getBackgroundEmissions(nowS: number): OnAirEmission[] {
    return HF_BACKGROUND.map((b) => ({
      id: b.id,
      sourceId: b.id,
      isPlayer: false,
      freqHz: Math.round(b.freqMHz * 1e6),
      mode: b.mode,
      bandwidthHz: b.mode === 'CW' ? 150 : 50,
      erpDbm: b.mode === 'CW' ? 37 : 40,
      polarization: 'V' as const,
      position: { xKm: b.km, yKm: 0, heightM: 12 },
      payload: { kind: b.mode === 'CW' ? ('cw' as const) : ('ft8' as const), text: b.text, callsign: b.callsign },
      startS: nowS,
      endS: null,
    }));
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

  getState(): HfState {
    return clone({
      outbox: this.outbox_.getState(),
      contacts: this.contacts_,
      active: this.active_,
      emissionToContact: this.emissionToContact_,
      emissionLoss: this.emissionLoss_,
      seq: this.seq_,
    });
  }

  restoreState(s: HfState): void {
    const c = clone(s);
    this.outbox_.restoreState(c.outbox);
    this.contacts_ = c.contacts;
    this.active_ = c.active;
    this.emissionToContact_ = c.emissionToContact;
    this.emissionLoss_ = c.emissionLoss;
    this.seq_ = c.seq;
  }
}
