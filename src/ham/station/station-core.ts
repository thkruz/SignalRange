/**
 * @file station-core - Shared mutable state and helpers for the C3 station manager
 * @description Holds the JSON state, the live model instances (DC systems, board, meter, ops
 * modules) and the helpers every action family uses: positions, power, RF paths, fault bookkeeping.
 * No EventBus or ScenarioManager here so it runs headless in tests.
 */

import { type BoardState, CircuitBoard } from '../dc/circuit-board';
import { DcPowerSystem, type DcSystemState, SUPPLY_LIMIT_A } from '../dc/dc-power-system';
import { type MeterState, Multimeter } from '../dc/multimeter';
import { HAM_STATION_SCHEMA, type HamFaultConfig, type HamStationConfig } from '../ham-station-config';
import type { HamConnection, HamLocationId, HamMeasurement, LocalPosition, OnAirEmission, PortDef, ReceptionResult, TxIntent } from '../ham-types';
import { fsplDb } from '../ops/hf-propagation';
import type { SatGeometry } from '../ops/satellite-link';
import { linkLoss, noiseFloorDbm } from '../radio/link-model';
import { rxFrequencyMHz } from '../radio/radio-settings';
import { snrToIntelligibility } from '../radio/reception-model';
import { antennaResonanceMHz } from '../rf/antenna-model';
import type { AnalyzerCalibration, AnalyzerPoint } from '../rf/instruments';
import type { RfPath } from '../rf/rf-path';
import { createDeviceRuntime, type DeviceRuntime, isPortable, pathFrom, portsFor, profileOf, sdrUsbConnected } from './station-devices';
import { emptyLog, StationLog, type StationLogState } from './station-log';
import { StationOps, type StationOpsState } from './station-ops';

export type SatelliteGeometryProvider = (noradId: number, nowS: number) => SatGeometry | null;

export interface FaultRuntime extends HamFaultConfig {
  cleared: boolean;
  clearedAtS?: number;
  repairRevision?: number;
}

export interface KeyedTx {
  deviceId: string;
  emission: OnAirEmission;
  intent: TxIntent;
  untilS: number;
  outputW: number;
  deliveredW: number;
  termination: string;
}

export interface HamStationState {
  schema: typeof HAM_STATION_SCHEMA;
  nowS: number;
  revision: number;
  stateVersion: number;
  location: HamLocationId;
  devices: Record<string, DeviceRuntime>;
  connections: HamConnection[];
  faults: FaultRuntime[];
  dc: Record<string, DcSystemState>;
  boards: Record<string, BoardState>;
  meter: MeterState & { targetId: string | null };
  analyzerCal: AnalyzerCalibration;
  keyed: KeyedTx | null;
  /** A packet frame holding the radio's TX load until `untilS` (the radio is keyed for the frame, not through `keyed`) */
  pktKey?: { radioId: string; untilS: number } | null;
  /** Ops and player emissions still on the air */
  air: OnAirEmission[];
  latest: Record<string, ReceptionResult[]>;
  transcripts: Record<string, { text: string; intelligibility: number }>;
  worksheets: Record<string, { attempts: number; correct: boolean; correctAtS?: number }>;
  log: StationLogState;
  ops: StationOpsState;
  resetCounts: Record<string, number>;
  emSeq: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  refusal?: string;
  data?: Record<string, unknown>;
}

export const refuse = (message: string, refusal = 'refused'): ActionResult => ({ ok: false, message, refusal });
export const done = (message: string, data?: Record<string, unknown>): ActionResult => ({ ok: true, message, data });

export class StationCore {
  readonly cfg: HamStationConfig;
  state: HamStationState;
  log: StationLog;
  ops: StationOps;
  readonly ports: Record<string, PortDef[]> = {};
  readonly dcSystems: Map<string, DcPowerSystem> = new Map();
  readonly boards: Map<string, CircuitBoard> = new Map();
  readonly meter: Multimeter = new Multimeter();
  /** Last analyzer sweep, kept so a remounted panel can redraw it */
  lastSweep: { points: AnalyzerPoint[]; flags: string[]; measurement: HamMeasurement } | null = null;
  readonly geometry: SatelliteGeometryProvider | null;
  /** Spectrum rows per SDR (UI only, not checkpointed) */
  readonly spectrum: Map<string, Float32Array> = new Map();

  constructor(cfg: HamStationConfig, nowS: number, geometry: SatelliteGeometryProvider | null) {
    this.cfg = cfg;
    this.geometry = geometry;
    const devices: Record<string, DeviceRuntime> = {};
    for (const d of cfg.devices) {
      devices[d.id] = createDeviceRuntime(d);
      this.ports[d.id] = portsFor(d);
      if (d.dcSystem) {
        const dc = new DcPowerSystem(d.dcSystem);
        for (const f of d.dcSystem.faults ?? []) dc.injectFault(f);
        this.dcSystems.set(d.id, dc);
      }
      if (d.board) this.boards.set(d.id, new CircuitBoard({ powered: d.powered ?? false }));
    }
    this.state = {
      schema: HAM_STATION_SCHEMA,
      nowS,
      revision: 0,
      stateVersion: 0,
      location: cfg.startLocation,
      devices,
      connections: cfg.connections.map((c) => ({ ...c, a: { ...c.a }, b: { ...c.b } })),
      faults: cfg.faults.map((f) => ({ ...f, cleared: false })),
      dc: {},
      boards: {},
      meter: { ...this.meter.state, targetId: null },
      analyzerCal: { done: false, referenceDeviceId: null },
      keyed: null,
      air: [],
      latest: {},
      transcripts: {},
      worksheets: {},
      log: emptyLog(),
      ops: {},
      resetCounts: {},
      emSeq: 0,
    };
    this.log = new StationLog(this.state.log);
    this.ops = new StationOps(cfg, this.hears_.bind(this), () => this.state.revision);
    this.applyFaultEffects_();
    for (const [id, dc] of this.dcSystems) this.state.resetCounts[id] = dc.state.resetCount;
  }

  // ---- lookup ----

  device(id: string): DeviceRuntime | undefined {
    return this.state.devices[id];
  }

  inService(id: string): DeviceRuntime | undefined {
    const d = this.state.devices[id];
    return d && !d.spare && !d.removed ? d : undefined;
  }

  positionOf(id: string): LocalPosition {
    const d = this.state.devices[id];
    if (d?.position) return d.position;
    const loc = this.cfg.locations.find((l) => l.id === d?.location);

    return loc?.position ?? this.cfg.stationPosition;
  }

  /** Physical actions need the player at the device (feedlines and leads reach everywhere) */
  reachable(id: string): ActionResult | null {
    const d = this.inService(id) ?? this.device(id);
    if (!d) return refuse(`There is no ${id} at this station.`, 'unknown-device');
    if (d.removed) return refuse(`${d.label} has been removed from the station.`, 'removed');
    if (d.spare || isPortable(d.kind) || d.location === this.state.location) return null;
    const loc = this.cfg.locations.find((l) => l.id === d.location);

    return refuse(`${d.label} is at the ${loc?.label ?? d.location}. Go there first.`, 'wrong-location');
  }

  dcFor(radioId: string): { id: string; dc: DcPowerSystem } | undefined {
    for (const d of this.cfg.devices) {
      if (d.dcSystem?.radioId === radioId && this.inService(d.id)) {
        const dc = this.dcSystems.get(d.id);
        if (dc) return { id: d.id, dc };
      }
    }

    return undefined;
  }

  /** Is this radio/receiver actually running? */
  energized(id: string): boolean {
    const d = this.inService(id);
    if (!d?.powered) return false;
    if (d.kind === 'sdr') return sdrUsbConnected(this.state.devices, this.state.connections, id);
    if (this.openFault(id, 'battery-unseated') || this.openFault(id, 'battery-depleted')) return false;
    const feed = this.dcFor(id);
    if (feed) {
      const s = feed.dc.state;
      if (!s.sourceConnected || s.fuseBlown || s.fuseOut || s.polarityReversed || s.radioState !== 'on') return false;
      const min = profileOf(d)?.power.minOperatingV ?? 0;
      if (s.source === 'battery' && s.battery.energyWh <= 0) return false;

      return feed.dc.measure().vRadio >= min;
    }

    return true;
  }

  path(deviceId: string, freqMHz: number, portId = 'ant'): RfPath {
    return pathFrom(this.state.devices, this.ports, this.state.connections, deviceId, freqMHz, portId);
  }

  rxFreqMHz(deviceId: string): number {
    const r = this.inService(deviceId)?.radio;

    return r ? rxFrequencyMHz(r) : 0;
  }

  // ---- bookkeeping ----

  bump(): void {
    this.state.revision += 1;
  }

  event(name: string, data?: Record<string, string | number | boolean | null>): void {
    this.log.event(name, this.state.nowS, this.state.revision, data);
  }

  openFault(target: string, kind: HamFaultConfig['kind']): FaultRuntime | undefined {
    return this.state.faults.find((f) => !f.cleared && f.target === target && f.kind === kind);
  }

  clearFault(f: FaultRuntime, how: string): void {
    if (f.cleared) return;
    f.cleared = true;
    f.clearedAtS = this.state.nowS;
    f.repairRevision = this.state.revision;
    this.event(`repair:${f.id}`, { how });
  }

  /** Push baseline faults into the models that carry them */
  private applyFaultEffects_(): void {
    for (const f of this.state.faults) {
      const dc = this.dcSystems.get(f.target);
      if (dc && (f.kind === 'high-resistance-lead' || f.kind === 'supply-current-limit')) dc.injectFault(f.kind);
      if (dc && f.kind === 'blown-fuse') dc.state.fuseBlown = true;
      const board = this.boards.get(f.target);
      if (board && (f.kind === 'open-switch-contact' || f.kind === 'reversed-led' || f.kind === 'blown-fuse')) board.injectFault(f.kind);
      if (f.kind === 'loose-connector') {
        const c = this.state.connections.find((x) => x.id === f.target);
        if (c) c.seated = false;
      }
    }
  }

  /** Model-side effect of a repair action; null when the fault kind has no model hook */
  repairModel(f: FaultRuntime): string | null {
    const dc = this.dcSystems.get(f.target);
    const board = this.boards.get(f.target);
    if (dc && f.kind === 'high-resistance-lead') {
      const r = dc.replaceLead();
      return r.ok ? null : (r.reason ?? 'Repair refused.');
    }
    if (dc && f.kind === 'supply-current-limit') dc.setSupplyLimit(SUPPLY_LIMIT_A);
    if (dc && f.kind === 'blown-fuse') dc.replaceFuse(15);
    if (board && (f.kind === 'open-switch-contact' || f.kind === 'reversed-led')) board.repair(f.kind);

    return null;
  }

  /** Clear auto faults whose fix the simulation can now see */
  reconcileFaults(): void {
    for (const f of this.state.faults) {
      if (f.cleared || (f.clearedBy.action !== 'auto' && f.clearedBy.action !== 'seat')) continue;
      if (f.kind === 'usb-unplugged' && sdrUsbConnected(this.state.devices, this.state.connections, f.target)) this.clearFault(f, 'usb');
      if (f.kind === 'long-elements') {
        const a = this.inService(f.target)?.antenna;
        if (a && Math.abs(antennaResonanceMHz(a) - (f.value ?? 146.55)) <= 1.5) this.clearFault(f, 'adjust');
      }
      if (f.kind === 'wrong-tone') {
        const r = this.inService(f.target)?.radio;
        if (r && r.txToneHz !== null && Math.abs((r.txToneHz ?? 0) - (f.value ?? 0)) < 0.05) this.clearFault(f, 'tone');
      }
      const audio = this.ops.packet?.getAudio();
      if (audio && f.kind === 'wrong-input-device' && audio.inputDevice === 'interface') this.clearFault(f, 'audio');
      if (audio && f.kind === 'overdriven-mic' && audio.txLevel <= (f.value ?? 7)) this.clearFault(f, 'audio');
      if (f.kind === 'loose-connector' && this.state.connections.find((c) => c.id === f.target)?.seated) this.clearFault(f, 'seat');
    }
  }

  // ---- hears callback for the ops modules ----

  private hears_(e: OnAirEmission, listenerId: string): { snrDb: number; decoded: boolean } {
    const bw = Math.max(e.bandwidthHz, 100);
    if (listenerId === 'player') return this.playerHears_(e);
    const sat = this.cfg.satellite;
    if (sat && listenerId === sat.id) {
      const g = this.ops.satGeometry();
      if (!g?.isAboveHorizon) return { snrDb: -99, decoded: false };
      const snr = e.erpDbm - fsplDb(g.rangeKm, e.freqHz) + 12 - noiseFloorDbm(bw, 2);
      return { snrDb: snr, decoded: snrToIntelligibility(snr, e.mode) >= 0.5 };
    }
    const l = this.ops.listeners.get(listenerId);
    if (!l) return { snrDb: -99, decoded: false };
    let pl: number;
    if (e.viaSatellite) pl = this.ops.pathLossOverride(e, this.state.nowS) ?? 300;
    else if (e.position) pl = linkLoss({ freqHz: e.freqHz, tx: e.position, rx: l.position }).pathLossDb;
    else pl = 200;
    const snr = e.erpDbm - pl + l.gainDbi - noiseFloorDbm(bw, l.noiseFigureDb);

    return { snrDb: snr, decoded: snrToIntelligibility(snr, e.mode) >= 0.5 };
  }

  /** The player's packet radio hearing a node frame */
  private playerHears_(e: OnAirEmission): { snrDb: number; decoded: boolean } {
    const radioId = this.cfg.packet?.radioId;
    if (!radioId || !this.energized(radioId)) return { snrDb: -99, decoded: false };
    const best = (this.state.latest[radioId] ?? []).find((r) => r.emissionId === e.id);
    if (best) return { snrDb: best.snrDb, decoded: best.intelligibility >= 0.5 };
    const rxMHz = this.rxFreqMHz(radioId);
    if (Math.abs(rxMHz * 1e6 - e.freqHz) > 5000) return { snrDb: -99, decoded: false };
    const p = this.path(radioId, rxMHz);
    if (p.termination !== 'antenna') return { snrDb: -99, decoded: false };
    const pl = e.position ? linkLoss({ freqHz: e.freqHz, tx: e.position, rx: this.positionOf(p.antennaDeviceId ?? radioId) }).pathLossDb : 200;
    const snr = e.erpDbm - pl - p.totalLossDb - noiseFloorDbm(Math.max(e.bandwidthHz, 100), 8);

    return { snrDb: snr, decoded: snrToIntelligibility(snr, e.mode) >= 0.5 };
  }

  // ---- persistence ----

  snapshot(): HamStationState {
    for (const [id, dc] of this.dcSystems) this.state.dc[id] = dc.state;
    for (const [id, b] of this.boards) this.state.boards[id] = b.state;
    this.state.meter = { ...this.meter.state, targetId: this.state.meter.targetId };
    this.state.ops = this.ops.getState();

    return JSON.parse(JSON.stringify(this.state)) as HamStationState;
  }

  restore(s: HamStationState): void {
    const c = JSON.parse(JSON.stringify(s)) as HamStationState;
    this.state = c;
    this.log = new StationLog(c.log);
    for (const [id, dc] of this.dcSystems) if (c.dc[id]) dc.state = c.dc[id];
    for (const [id, b] of this.boards) if (c.boards[id]) b.state = c.boards[id];
    const { targetId: _t, ...meter } = c.meter;
    this.meter.state = meter;
    this.ops = new StationOps(this.cfg, this.hears_.bind(this), () => this.state.revision);
    this.ops.restoreState(c.ops);
    this.spectrum.clear();
  }
}
