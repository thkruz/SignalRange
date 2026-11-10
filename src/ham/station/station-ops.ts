/**
 * @file station-ops - Owns the optional operating modules (QSO, repeater, DMR, packet, HF, satellite, net)
 * @description Builds each module from its config block with one shared `hears` callback, routes
 * player emissions to them, collects what they radiate each tick and bundles their JSON state.
 */

import type { HamStationConfig } from '../ham-station-config';
import type { LocalPosition, OnAirEmission, TxIntent } from '../ham-types';
import { DmrRepeater, type DmrState } from '../ops/dmr';
import { fsplDb, HfPropagation, type HfState } from '../ops/hf-propagation';
import { NetControl, type NetState } from '../ops/net-control';
import type { HearsFn } from '../ops/ops-common';
import { type PacketState, PacketStation } from '../ops/packet';
import { QsoMachine, type QsoState } from '../ops/qso-machine';
import { Repeater, type RepeaterState } from '../ops/repeater';
import { SatelliteLink, type SatGeometry, type SatLinkState } from '../ops/satellite-link';

export interface StationOpsState {
  qso?: QsoState;
  repeater?: RepeaterState;
  dmr?: DmrState;
  packet?: PacketState;
  hf?: HfState;
  sat?: SatLinkState;
  net?: NetState;
}

export interface Listener {
  position: LocalPosition;
  gainDbi: number;
  noiseFigureDb: number;
}

export interface OpsResult {
  events: { name: string; data?: Record<string, string | number | boolean | null> }[];
  emissions: OnAirEmission[];
}

export class StationOps {
  readonly qso?: QsoMachine;
  readonly repeater?: Repeater;
  readonly dmr?: DmrRepeater;
  readonly packet?: PacketStation;
  readonly hf?: HfPropagation;
  readonly sat?: SatelliteLink;
  readonly net?: NetControl;
  /** Listener positions for the hears callback (remote stations, repeaters, nodes, net stations) */
  readonly listeners: Map<string, Listener> = new Map();

  constructor(cfg: HamStationConfig, hears: HearsFn, revision: () => number) {
    const call = cfg.operator.callsign;
    const L = (id: string, position: LocalPosition, gainDbi = 2, noiseFigureDb = 6): void => {
      this.listeners.set(id, { position, gainDbi, noiseFigureDb });
    };
    if (cfg.remoteStations) {
      this.qso = new QsoMachine({ playerCallsign: call, stations: cfg.remoteStations.stations, busy: cfg.remoteStations.busy, hears, revision });
      for (const s of cfg.remoteStations.stations) L(s.id, s.position);
    }
    if (cfg.repeater) {
      this.repeater = new Repeater({ ...cfg.repeater, hears, playerCallsign: call, revision });
      L(cfg.repeater.id, cfg.repeater.position, 6, 5);
      if (cfg.repeater.clubOperator) L(cfg.repeater.clubOperator.id, cfg.repeater.clubOperator.position);
    }
    if (cfg.dmr) {
      this.dmr = new DmrRepeater({ ...cfg.dmr, hears });
      L(cfg.dmr.id, cfg.dmr.position, 6, 5);
    }
    if (cfg.packet) {
      const p = cfg.packet;
      this.packet = new PacketStation({ node: p.node, hears, audio: p.audio, station: p.station, t1S: p.t1S, n2: p.n2, workingPtt: p.workingPtt });
      L(p.node.id, p.node.position, 4, 6);
    }
    if (cfg.hf) {
      this.hf = new HfPropagation({ ...cfg.hf, playerCallsign: call, playerPosition: cfg.hf.playerPosition ?? cfg.stationPosition, revision });
    }
    if (cfg.satellite) {
      this.sat = new SatelliteLink({ ...cfg.satellite, playerCallsign: call, hears, revision });
      this.sat.setIsolation(cfg.satellite.isolationDb ?? 60);
      L(cfg.satellite.groundStation.id, cfg.satellite.groundStation.position, 10, 2);
    }
    if (cfg.net) {
      this.net = new NetControl({ ...cfg.net, playerCallsign: call, hears });
      L(cfg.net.ncs.id, cfg.net.ncs.position);
      L(cfg.net.receiver.id, cfg.net.receiver.position);
    }
  }

  setGeometry(g: SatGeometry | null): void {
    if (this.sat && g) this.sat.setGeometry(g);
  }

  satGeometry(): SatGeometry | null {
    return this.sat?.getState().geometry ?? null;
  }

  /** Path-loss overrides the generic link model cannot compute (HF skip, satellite range) */
  pathLossOverride(e: OnAirEmission, nowS: number): number | undefined {
    if (this.hf) {
      const hf = this.hf.getEmissionPathLossDb(e.id, nowS);
      if (hf !== null) return hf;
    }
    if (e.viaSatellite) {
      const g = this.satGeometry();
      return g?.isAboveHorizon ? fsplDb(g.rangeKm, e.freqHz) : 300;
    }

    return undefined;
  }

  /** Route one keyed player emission to every module */
  onPlayerEmission(e: OnAirEmission, intent: TxIntent, nowS: number, txPowerW: number): OpsResult {
    const out: OpsResult = { events: [], emissions: [] };
    const relayed: OnAirEmission[] = [];
    if (this.repeater) {
      const r = this.repeater.onPlayerEmission(e, intent, nowS);
      if (r.code !== 'wrong-frequency') out.events.push({ name: `repeater:${r.code}`, data: { message: r.message } });
      out.emissions.push(...r.emissions);
      relayed.push(...r.emissions.filter((x) => x.payload.kind === 'voice'));
    }
    if (this.dmr && e.mode === 'DMR') {
      const r = this.dmr.onPlayerEmission(e, nowS);
      out.events.push({ name: `dmr:${r.code}`, data: { message: r.message } });
      out.emissions.push(...r.emissions);
    }
    if (this.hf && e.freqHz < 30e6) {
      for (const ev of this.hf.onPlayerEmission(e, intent, nowS)) {
        out.events.push({ name: `hf:${ev.reason}`, data: { condition: ev.condition, snrDb: Math.round(ev.snrDb * 10) / 10 } });
      }
    }
    if (this.sat) {
      const iso = this.sat.evaluateIsolation(txPowerW);
      const r = this.sat.onPlayerUplink(e, intent, nowS, txPowerW);
      if (r.code !== 'not-uplink') {
        out.events.push({ name: `sat:${r.code}`, data: { message: r.message, offsetHz: Math.round(r.offsetHz) } });
        out.events.push({ name: `isolation:${iso.status}` });
      }
      out.emissions.push(...r.emissions);
    }
    this.qso?.onPlayerEmission(e, intent, nowS);
    if (this.net) {
      this.net.onPlayerEmission(e, intent, nowS);
      for (const rl of relayed) this.net.onPlayerEmission({ ...rl, isPlayer: true }, intent, nowS);
    }

    return out;
  }

  tick(nowS: number): OnAirEmission[] {
    const res: OnAirEmission[] = [];
    if (this.net && this.repeater) {
      const outage = this.net.outageActive(nowS);
      if (outage !== this.repeater.isOutage) this.repeater.setOutage(outage);
    }
    if (this.qso) res.push(...this.qso.tick(nowS));
    if (this.repeater) res.push(...this.repeater.tick(nowS));
    if (this.dmr) res.push(...this.dmr.tick(nowS));
    if (this.packet) res.push(...this.packet.tick(nowS));
    if (this.hf) res.push(...this.hf.tick(nowS));
    if (this.sat) res.push(...this.sat.tick(nowS));
    if (this.net) res.push(...this.net.tick(nowS));

    return res;
  }

  background(nowS: number): OnAirEmission[] {
    return this.hf ? this.hf.getBackgroundEmissions(nowS) : [];
  }

  noteMonitoring(freqMHz: number, squelchOpen: boolean, dtS: number): void {
    this.qso?.noteMonitoring(freqMHz, squelchOpen, dtS);
  }

  notePlayerHeard(emissionId: string, intelligibility: number): void {
    this.qso?.notePlayerHeard(emissionId, intelligibility);
    this.repeater?.notePlayerHeard(emissionId, intelligibility);
    this.dmr?.notePlayerHeard(emissionId, intelligibility);
    this.hf?.notePlayerHeard(emissionId, intelligibility);
    this.sat?.notePlayerHeard(emissionId, intelligibility);
    this.net?.notePlayerHeard(emissionId, intelligibility);
  }

  getState(): StationOpsState {
    return {
      qso: this.qso?.getState(),
      repeater: this.repeater?.getState(),
      dmr: this.dmr?.getState(),
      packet: this.packet?.getState(),
      hf: this.hf?.getState(),
      sat: this.sat?.getState(),
      net: this.net?.getState(),
    };
  }

  restoreState(s: StationOpsState): void {
    if (s.qso) this.qso?.restoreState(s.qso);
    if (s.repeater) this.repeater?.restoreState(s.repeater);
    if (s.dmr) this.dmr?.restoreState(s.dmr);
    if (s.packet) this.packet?.restoreState(s.packet);
    if (s.hf) this.hf?.restoreState(s.hf);
    if (s.sat) this.sat?.restoreState(s.sat);
    if (s.net) this.net?.restoreState(s.net);
  }
}
