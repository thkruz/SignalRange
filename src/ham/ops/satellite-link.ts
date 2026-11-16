/**
 * @file satellite-link - FM amateur satellite (CUBEHOP training bird, U/V mode)
 * @description Uplink 435.900 MHz FM with a 67.0 Hz access tone, downlink 145.900
 * MHz. The manager feeds satellite geometry each tick; slant-range path loss is
 * computed by the manager inside `hears`. Doppler: `dopplerFactor` multiplies a
 * frequency as seen at the far end (f_seen = f_sent * dopplerFactor), so the
 * satellite sees the uplink at f*factor and the ground sees the downlink at
 * 145.900 MHz * factor. The player must pre-correct the uplink.
 *
 * Also models desense/isolation between the HT uplink and the SDR downlink path.
 */
import type { HamContactRecord, LocalPosition, OnAirEmission, TxIntent } from '../ham-types';
import { clone, type HearsFn, Outbox, type OutboxState, sameCall } from './ops-common';

export interface SatGeometry {
  az: number;
  el: number;
  rangeKm: number;
  dopplerFactor: number;
  isAboveHorizon: boolean;
}

export interface SatGroundStation {
  id: string;
  callsign: string;
  name: string;
  grid: string;
  position: LocalPosition;
  replyDelayS: number;
}

export interface SatLinkConfig {
  id: string;
  name: string;
  uplinkMHz: number;
  downlinkMHz: number;
  accessToneHz: number;
  uplinkWindowHz: number;
  downlinkErpDbm: number;
  groundStation: SatGroundStation;
  /** Optional downlink beacon (the reference signal to find before transmitting) and its period */
  beaconText?: string;
  beaconPeriodS?: number;
  playerCallsign: string;
  hears: HearsFn;
  /** SDR front-end overload threshold, dBm */
  overloadDbm?: number;
  /** Level that can damage the SDR front end, dBm */
  damageDbm?: number;
  revision?: () => number;
}

export type IsolationStatus = 'ok' | 'desense' | 'unsafe';

export interface IsolationResult {
  isolationDb: number;
  txPowerDbm: number;
  /** Uplink power arriving at the SDR input, dBm */
  arrivalDbm: number;
  status: IsolationStatus;
  /** Noise-floor rise the manager should apply to the SDR when desensed, dB */
  sdrNoiseRaiseDb: number;
}

/** Typical isolation figures for the training choices, dB */
export const ISOLATION_DB = { duplexer: 60, spacedAntennas: 30, splitter: 6 } as const;

export type UplinkCode = 'relayed' | 'below-horizon' | 'out-of-window' | 'wrong-tone' | 'weak' | 'unsafe' | 'not-uplink';

export interface UplinkResult {
  code: UplinkCode;
  message: string;
  /** Uplink offset from the satellite receiver as the satellite sees it, Hz */
  offsetHz: number;
  emissions: OnAirEmission[];
}

export interface SatLinkState {
  geometry: SatGeometry | null;
  isolationDb: number;
  outbox: OutboxState;
  contacts: HamContactRecord[];
  active: string | null;
  emissionToContact: Record<string, string>;
  ownRelayIds: string[];
  selfHeard: boolean;
  relaySeq: number;
  seq: number;
  beaconHeard?: boolean;
  nextBeaconS?: number;
  beaconSeq?: number;
}

export class SatelliteLink {
  private readonly cfg_: SatLinkConfig;
  private readonly outbox_ = new Outbox('sat');
  private geometry_: SatGeometry | null = null;
  private isolationDb_ = ISOLATION_DB.duplexer as number;
  private contacts_: HamContactRecord[] = [];
  private active_: string | null = null;
  private emissionToContact_: Record<string, string> = {};
  private ownRelayIds_: string[] = [];
  private selfHeard_ = false;
  private relaySeq_ = 0;
  private seq_ = 0;
  private beaconHeard_ = false;
  private nextBeaconS_: number | null = null;
  private beaconSeq_ = 0;
  /** The beacon keeps quiet until this time so it never collides with a relay or a ground-station reply */
  private beaconQuietUntilS_ = 0;

  constructor(cfg: SatLinkConfig) {
    this.cfg_ = cfg;
  }

  setGeometry(g: SatGeometry): void {
    this.geometry_ = { ...g };
  }

  setIsolation(isolationDb: number): void {
    this.isolationDb_ = isolationDb;
  }

  /** Uplink power arriving at the SDR and what the manager should do about it */
  evaluateIsolation(txPowerW: number): IsolationResult {
    const txPowerDbm = 10 * Math.log10(Math.max(txPowerW, 1e-6) * 1000);
    const arrivalDbm = txPowerDbm - this.isolationDb_;
    const over = this.cfg_.overloadDbm ?? -20;
    const dmg = this.cfg_.damageDbm ?? 10;
    const status: IsolationStatus = arrivalDbm >= dmg ? 'unsafe' : arrivalDbm >= over ? 'desense' : 'ok';
    return {
      isolationDb: this.isolationDb_,
      txPowerDbm,
      arrivalDbm,
      status,
      sdrNoiseRaiseDb: status === 'ok' ? 0 : Math.min(40, arrivalDbm - over + 10),
    };
  }

  /** Frequency the player should transmit so the satellite sees the nominal uplink */
  correctedUplinkHz(): number {
    const f = this.geometry_?.dopplerFactor ?? 1;
    return Math.round((this.cfg_.uplinkMHz * 1e6) / f);
  }

  /** Where the downlink currently appears at the ground */
  downlinkHz(): number {
    const f = this.geometry_?.dopplerFactor ?? 1;
    return Math.round(this.cfg_.downlinkMHz * 1e6 * f);
  }

  onPlayerUplink(e: OnAirEmission, intent: TxIntent | null, nowS: number, txPowerW = 5): UplinkResult {
    const c = this.cfg_;
    const g = this.geometry_;
    const factor = g?.dopplerFactor ?? 1;
    const seenHz = e.freqHz * factor;
    const offsetHz = seenHz - c.uplinkMHz * 1e6;
    const res = (code: UplinkCode, message: string, emissions: OnAirEmission[] = []): UplinkResult => ({
      code,
      message,
      offsetHz,
      emissions,
    });
    if (e.freqHz < 400e6 || e.freqHz > 450e6) return res('not-uplink', 'Not on the 70 cm uplink band.');
    if (this.evaluateIsolation(txPowerW).status === 'unsafe') {
      return res('unsafe', 'Keying blocked: your uplink would destroy the SDR front end. Add isolation first.');
    }
    if (!g || !g.isAboveHorizon) return res('below-horizon', 'The satellite is below the horizon.');
    if (Math.abs(offsetHz) > c.uplinkWindowHz) {
      return res('out-of-window', `Uplink arrives ${Math.round(offsetHz)} Hz off the satellite receiver: correct for Doppler.`);
    }
    if (e.ctcssHz === null || e.ctcssHz === undefined || Math.abs(e.ctcssHz - c.accessToneHz) > 0.5) {
      return res('wrong-tone', 'Satellite ignored you: wrong or missing access tone.');
    }
    if (!c.hears(e, c.id).decoded) return res('weak', 'Uplink too weak for the satellite receiver.');

    this.relaySeq_++;
    const downHz = this.downlinkHz();
    const relay: OnAirEmission = {
      ...clone(e),
      id: `sat-relay-${this.relaySeq_}`,
      sourceId: c.id,
      isPlayer: false,
      freqHz: downHz,
      mode: 'FM',
      erpDbm: c.downlinkErpDbm,
      polarization: 'RHCP',
      viaSatellite: c.id,
      ctcssHz: null,
      startS: e.startS + 0.1,
      endS: e.endS,
    };
    delete relay.position;
    this.ownRelayIds_.push(relay.id);
    this.beaconQuietUntilS_ = Math.max(this.beaconQuietUntilS_, (relay.endS ?? nowS + 4) + (intent ? this.cfg_.groundStation.replyDelayS + 5 : 1));
    this.groundStationListens_(relay, intent, nowS);
    return res('relayed', 'Uplink accepted and relayed on the downlink.', [relay]);
  }

  private groundStationListens_(relay: OnAirEmission, intent: TxIntent | null, nowS: number): void {
    const gs = this.cfg_.groundStation;
    if (!intent || !this.cfg_.hears(relay, gs.id).decoded) return;
    const dueBase = (relay.endS ?? nowS + 4) + gs.replyDelayS;
    const me = relay.payload.callsign ?? this.cfg_.playerCallsign;
    const speak = (text: string, tag: string): void =>
      this.outbox_.push({
        dueS: dueBase,
        durS: 4,
        sourceId: this.cfg_.id,
        callsign: gs.callsign,
        text,
        freqHz: this.downlinkHz(),
        mode: 'FM',
        erpDbm: this.cfg_.downlinkErpDbm,
        viaSatellite: this.cfg_.id,
        tag,
      });
    if (intent.kind === 'cq' || (intent.kind === 'call' && sameCall(intent.target, gs.callsign))) {
      if (this.active_) return;
      const id = `sat-contact-${++this.seq_}`;
      this.contacts_.push({
        id,
        remoteId: gs.id,
        remoteCallsign: gs.callsign,
        path: 'satellite',
        freqMHz: this.cfg_.downlinkMHz,
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
      speak(`${me} this is ${gs.callsign}, grid ${gs.grid}, thanks for the pass.`, id);
      return;
    }
    const rec = this.contacts_.find((c) => c.id === this.active_);
    if (!rec) return;
    if (intent.kind === 'reply') {
      if (!rec.exchanged.includes(intent.item)) rec.exchanged.push(intent.item);
      speak(`Roger your ${intent.item}.`, rec.id);
    } else if (intent.kind === 'identify') {
      rec.identified = true;
      rec.closed = true;
      rec.completedS = nowS;
      this.active_ = null;
      speak(`${me}, 73, ${gs.callsign}.`, rec.id);
    }
  }

  /** Radiate due ground-station replies (relayed through the satellite) */
  tick(nowS: number): OnAirEmission[] {
    const g = this.geometry_;
    if (!g || !g.isAboveHorizon) return [];
    const res = this.outbox_.popDue(nowS).map(({ emission, out }) => {
      if (out.tag) this.emissionToContact_[emission.id] = out.tag;
      return emission;
    });
    const beacon = this.beacon_(nowS);
    if (beacon) res.push(beacon);

    return res;
  }

  /** The satellite's periodic downlink beacon while it is above the horizon */
  private beacon_(nowS: number): OnAirEmission | null {
    const c = this.cfg_;
    if (!c.beaconText) return null;
    this.nextBeaconS_ ??= nowS;
    if (nowS < this.nextBeaconS_) return null;
    if (nowS < this.beaconQuietUntilS_) {
      this.nextBeaconS_ = this.beaconQuietUntilS_;
      return null;
    }
    const period = c.beaconPeriodS ?? 20;
    this.nextBeaconS_ = nowS + period;
    this.beaconSeq_++;
    const { emission } = this.outbox_.emitNow({
      dueS: nowS,
      durS: Math.min(6, period - 1),
      sourceId: c.id,
      callsign: c.groundStation.callsign,
      text: c.beaconText,
      freqHz: this.downlinkHz(),
      mode: 'FM',
      erpDbm: c.downlinkErpDbm,
      viaSatellite: c.id,
    });
    emission.id = `sat-beacon-${this.beaconSeq_}`;
    emission.polarization = 'RHCP';
    delete emission.payload.callsign;

    return emission;
  }

  notePlayerHeard(emissionId: string, intelligibility: number): void {
    if (emissionId.startsWith('sat-beacon-')) {
      if (intelligibility >= 0.6) this.beaconHeard_ = true;
      return;
    }
    if (this.ownRelayIds_.includes(emissionId)) {
      // Hearing yourself on the downlink proves the uplink works, nothing more
      if (intelligibility >= 0.6) this.selfHeard_ = true;
      return;
    }
    const cid = this.emissionToContact_[emissionId];
    const rec = cid ? this.contacts_.find((c) => c.id === cid) : undefined;
    if (rec && intelligibility >= 0.6) {
      rec.playerHeardRemote = true;
      if (!rec.exchanged.includes('grid')) rec.exchanged.push('grid');
    }
  }

  /** True once the player heard the satellite's own beacon clearly */
  get beaconHeard(): boolean {
    return this.beaconHeard_;
  }

  /** True once the player heard their own signal come back (never a contact) */
  get selfHeard(): boolean {
    return this.selfHeard_;
  }

  isValidContact(contactId: string): boolean {
    const c = this.contacts_.find((x) => x.id === contactId);
    return !!c && c.remoteHeardPlayer && c.playerHeardRemote && c.identified && c.closed;
  }

  getContacts(): HamContactRecord[] {
    return clone(this.contacts_);
  }

  getState(): SatLinkState {
    return clone({
      geometry: this.geometry_,
      isolationDb: this.isolationDb_,
      outbox: this.outbox_.getState(),
      contacts: this.contacts_,
      active: this.active_,
      emissionToContact: this.emissionToContact_,
      ownRelayIds: this.ownRelayIds_,
      selfHeard: this.selfHeard_,
      relaySeq: this.relaySeq_,
      seq: this.seq_,
      beaconHeard: this.beaconHeard_,
      nextBeaconS: this.nextBeaconS_ ?? undefined,
      beaconSeq: this.beaconSeq_,
    });
  }

  restoreState(s: SatLinkState): void {
    const c = clone(s);
    this.geometry_ = c.geometry;
    this.isolationDb_ = c.isolationDb;
    this.outbox_.restoreState(c.outbox);
    this.contacts_ = c.contacts;
    this.active_ = c.active;
    this.emissionToContact_ = c.emissionToContact;
    this.ownRelayIds_ = c.ownRelayIds;
    this.selfHeard_ = c.selfHeard;
    this.relaySeq_ = c.relaySeq;
    this.seq_ = c.seq;
    this.beaconHeard_ = c.beaconHeard ?? false;
    this.nextBeaconS_ = c.nextBeaconS ?? null;
    this.beaconSeq_ = c.beaconSeq ?? 0;
  }
}
