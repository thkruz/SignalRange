/**
 * @file ham-station-manager - The Campaign 3 (ham-sdr) station simulation
 * @description One manager composes the pure ham models (devices, RF path, DC power, radios,
 * ops modules) into a station the UI and headless tests drive the same way: `act(action)` for
 * everything the player does, `tick(nowS)` for time, query methods for evidence. Opt-in through
 * `settings.hamStation`; nothing here touches the EventBus (see ham-station-service.ts).
 */

import type { MeterMode, MeterPlacement, RedSocket } from './dc/multimeter';
import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from './ham-station-config';
import type { HamContactRecord, HamLocationId, HamMeasurement, RadioSettings, TxIntent } from './ham-types';
import type { PacketAudioConfig, PacketRadioCtx, PacketState, PacketStationConfig } from './ops/packet';
import { applySetting, recallMemory, returnToVfo, selectDmrChannel, storeMemory } from './radio/radio-settings';
import type { AntennaState } from './rf/antenna-model';
import { type ActionResult, done, type HamStationState, refuse, type SatelliteGeometryProvider, StationCore } from './station/station-core';
import { type DeviceRuntime, profileOf } from './station/station-devices';
import { analyzerCalibrate, analyzerRun, coaxTest, meterMode, meterPlace, meterRead, meterSocket, swrRead } from './station/station-instruments';
import type { BestReception, ReceptionLogEntry, StationEvent } from './station/station-log';
import { boardSwitch, connect, disconnect, go, inspect, install, move, type PortRef, power, repair, seat } from './station/station-physical';
import { evaluateReceivers } from './station/station-rx';
import { endTx, isPrepared, prepareTx, ptt, stepPower } from './station/station-tx';

export type { ActionResult, HamStationState } from './station/station-core';

export type HamAction =
  | { type: 'connect'; a: PortRef; b: PortRef }
  | { type: 'disconnect'; connectionId: string }
  | { type: 'seat'; connectionId: string }
  | { type: 'inspect'; targetId: string }
  | { type: 'repair'; faultId: string }
  | { type: 'install'; spareId: string; replaces: string }
  | { type: 'move'; deviceId: string; location: HamLocationId }
  | { type: 'power'; deviceId: string; on: boolean }
  | { type: 'board.switch'; deviceId: string; on: boolean }
  | { type: 'go'; location: HamLocationId }
  | { type: 'radio.set'; deviceId: string; patch: Partial<RadioSettings> }
  | { type: 'radio.store'; deviceId: string; slot: number; name: string }
  | { type: 'radio.recall'; deviceId: string; slot: number }
  | { type: 'radio.vfo'; deviceId: string }
  | { type: 'radio.dmrChannel'; deviceId: string; index: number }
  | { type: 'ptt'; deviceId: string; intent: TxIntent; holdS?: number }
  | { type: 'pttRelease' }
  | { type: 'meter.mode'; mode: MeterMode }
  | { type: 'meter.socket'; socket: RedSocket }
  | ({ type: 'meter.place'; targetId: string } & MeterPlacement)
  | { type: 'meter.read' }
  | { type: 'swr.read'; deviceId: string }
  | { type: 'analyzer.calibrate'; referenceDeviceId: string | null; deviceId?: string }
  | { type: 'analyzer.sweep'; start: number; stop: number; points: number; deviceId?: string }
  | ({ type: 'antenna.adjust'; deviceId: string } & Partial<Pick<AntennaState, 'elementLengthsM' | 'orientation' | 'azDeg' | 'elDeg' | 'polAngleDeg'>>)
  | { type: 'coax.dcTest'; deviceId: string }
  | { type: 'packet.config'; patch: { audio?: Partial<PacketAudioConfig>; station?: Partial<PacketStationConfig> } }
  | { type: 'packet.connect' }
  | { type: 'packet.send'; text: string; ui?: boolean }
  | { type: 'packet.disconnect' }
  | { type: 'packet.injectCorruption' }
  | { type: 'worksheet.answer'; id: string; values: Record<string, string | number | Record<string, string>> }
  | { type: 'decision'; id: string; choice: string }
  | { type: 'hint'; objectiveId: string }
  | { type: 'log.note'; text: string };

export interface HamManagerOptions {
  nowS?: number;
  geometry?: SatelliteGeometryProvider | null;
  /** Called after every tick and every successful action */
  onUpdate?: (stateVersion: number, nowS: number) => void;
}

export interface ReceptionQuery {
  deviceId?: string;
  sinceRevision?: number;
  minIntelligibility?: number;
  /** Only receptions logged after the first occurrence of this event */
  afterEvent?: string;
}

export interface MeasurementFilter {
  instrument?: HamMeasurement['instrument'];
  quantity?: string;
  placement?: Record<string, string>;
  underLoad?: boolean;
  sinceRevision?: number;
  afterEvent?: string;
}

const measurementSeq = (m: HamMeasurement): number => Number(m.id.slice(2)) || 0;

export class HamStationManager {
  private static instance_: HamStationManager | null = null;
  readonly config: HamStationConfig;
  protected core_: StationCore;
  private readonly onUpdate_?: (stateVersion: number, nowS: number) => void;
  private readonly lastLogged_: Map<string, number> = new Map();

  protected constructor(config: HamStationConfig, opts: HamManagerOptions = {}) {
    this.config = config;
    this.onUpdate_ = opts.onUpdate;
    this.core_ = new StationCore(config, opts.nowS ?? 0, opts.geometry ?? null);
    this.refreshGeometry_();
    evaluateReceivers(this.core_, 0, this.lastLogged_);
  }

  // ---- singleton ----

  static initialize(config: HamStationConfig, opts: HamManagerOptions = {}): HamStationManager {
    HamStationManager.instance_ = new HamStationManager(config, opts);

    return HamStationManager.instance_;
  }

  static getInstance(): HamStationManager {
    if (!HamStationManager.instance_) throw new Error('HamStationManager is not initialized');

    return HamStationManager.instance_;
  }

  static isInitialized(): boolean {
    return HamStationManager.instance_ !== null;
  }

  static destroy(): void {
    HamStationManager.instance_ = null;
  }

  /** A standalone manager (not the singleton) for headless tests */
  static createForTest(config: HamStationConfig, opts: HamManagerOptions = {}): HamStationManager {
    return new HamStationManager(config, opts);
  }

  // ---- time ----

  tick(nowS: number): void {
    const s = this.core_.state;
    const dt = nowS - s.nowS;
    if (!(dt > 0)) return;
    s.nowS = nowS;
    this.refreshGeometry_();
    stepPower(this.core_, dt);
    s.air.push(...this.core_.ops.tick(nowS));
    this.core_.reconcileFaults();
    evaluateReceivers(this.core_, dt, this.lastLogged_);
    this.changed_();
  }

  private refreshGeometry_(): void {
    const sat = this.config.satellite;
    if (!sat || !this.core_.geometry) return;
    this.core_.ops.setGeometry(this.core_.geometry(sat.satelliteNoradId, this.core_.state.nowS));
  }

  private changed_(): void {
    this.core_.state.stateVersion += 1;
    this.onUpdate_?.(this.core_.state.stateVersion, this.core_.state.nowS);
  }

  // ---- actions ----

  act(action: HamAction): ActionResult {
    const res = this.dispatch_(action);
    if (res.ok) {
      this.core_.reconcileFaults();
      evaluateReceivers(this.core_, 0, this.lastLogged_);
      this.changed_();
    }

    return res;
  }

  private dispatch_(a: HamAction): ActionResult {
    const c = this.core_;
    switch (a.type) {
      case 'connect':
        return connect(c, a.a, a.b);
      case 'disconnect':
        return disconnect(c, a.connectionId);
      case 'seat':
        return seat(c, a.connectionId);
      case 'inspect':
        return inspect(c, a.targetId);
      case 'repair':
        return repair(c, a.faultId);
      case 'install':
        return install(c, a.spareId, a.replaces);
      case 'move':
        return move(c, a.deviceId, a.location);
      case 'power':
        return power(c, a.deviceId, a.on);
      case 'board.switch':
        return boardSwitch(c, a.deviceId, a.on);
      case 'go':
        return go(c, a.location);
      case 'radio.set':
      case 'radio.store':
      case 'radio.recall':
      case 'radio.vfo':
      case 'radio.dmrChannel':
        return this.radio_(a);
      case 'ptt':
        return ptt(c, a.deviceId, a.intent, a.holdS);
      case 'pttRelease':
        if (!c.state.keyed) return refuse('Nothing is keyed.', 'not-keyed');
        endTx(c, false);
        return done('PTT released.');
      case 'meter.mode':
        return meterMode(c, a.mode);
      case 'meter.socket':
        return meterSocket(c, a.socket);
      case 'meter.place':
        return meterPlace(c, a.targetId, { red: a.red, black: a.black, series: a.series, seriesReversed: a.seriesReversed });
      case 'meter.read':
        return meterRead(c);
      case 'swr.read':
        return swrRead(c, a.deviceId);
      case 'analyzer.calibrate':
        return analyzerCalibrate(c, a.referenceDeviceId, a.deviceId);
      case 'analyzer.sweep':
        return analyzerRun(c, a.start, a.stop, a.points, a.deviceId);
      case 'antenna.adjust':
        return this.adjustAntenna_(a);
      case 'coax.dcTest':
        return coaxTest(c, a.deviceId);
      case 'packet.config':
      case 'packet.connect':
      case 'packet.send':
      case 'packet.disconnect':
      case 'packet.injectCorruption':
        return this.packet_(a);
      case 'worksheet.answer':
        return this.answer_(a.id, a.values);
      case 'decision':
        c.event(`decision:${a.id}`, { choice: a.choice });
        return done('Noted.');
      case 'hint':
        c.event(`hint:${a.objectiveId}`);
        return done('Hint shown.');
      case 'log.note':
        c.log.state.notes.push({ tS: c.state.nowS, text: a.text });
        return done('Logged.');
      default:
        return refuse('Unknown action.', 'unknown-action');
    }
  }

  private radio_(a: Extract<HamAction, { type: 'radio.set' | 'radio.store' | 'radio.recall' | 'radio.vfo' | 'radio.dmrChannel' }>): ActionResult {
    const c = this.core_;
    const away = c.reachable(a.deviceId);
    if (away) return away;
    const d = c.inService(a.deviceId);
    const profile = profileOf(d);
    if (!d?.radio || !profile) return refuse(`${d?.label ?? a.deviceId} has no radio controls.`, 'not-a-radio');
    if (c.state.keyed?.deviceId === a.deviceId) return refuse('Release the PTT before changing settings.', 'keyed');
    const cur = d.radio;
    let next: RadioSettings;
    if (a.type === 'radio.vfo') {
      next = returnToVfo(cur);
    } else {
      const r =
        a.type === 'radio.set'
          ? applySetting(profile, cur, a.patch)
          : a.type === 'radio.store'
            ? storeMemory(cur, a.slot, a.name, profile)
            : a.type === 'radio.recall'
              ? recallMemory(cur, a.slot)
              : selectDmrChannel(profile, cur, a.index);
      if (!r.ok) return refuse(r.refusal ?? 'The radio refused that setting.', 'radio');
      next = r.settings;
    }
    d.radio = next;
    c.bump();

    return done('Radio updated.', { settings: next });
  }

  private adjustAntenna_(a: Extract<HamAction, { type: 'antenna.adjust' }>): ActionResult {
    const c = this.core_;
    const away = c.reachable(a.deviceId);
    if (away) return away;
    const ant = c.inService(a.deviceId)?.antenna;
    if (!ant) return refuse(`${a.deviceId} is not an antenna.`, 'not-antenna');
    if (c.state.keyed) return refuse('Never touch an antenna while a transmitter is keyed.', 'keyed');
    if (a.elementLengthsM) {
      if (ant.kind !== 'adjustable-dipole') return refuse('This antenna has no adjustable elements.', 'fixed');
      if (a.elementLengthsM.some((l) => !(l > 0.05 && l < 6))) return refuse('Element lengths must be between 0.05 m and 6 m.', 'bad-length');
      ant.elementLengthsM = [a.elementLengthsM[0], a.elementLengthsM[1]];
    }
    if (a.orientation) ant.orientation = a.orientation;
    if (a.azDeg !== undefined) ant.azDeg = ((a.azDeg % 360) + 360) % 360;
    if (a.elDeg !== undefined) ant.elDeg = Math.max(0, Math.min(90, a.elDeg));
    if (a.polAngleDeg !== undefined) ant.polAngleDeg = a.polAngleDeg;
    c.bump();
    c.event(`adjust:${a.deviceId}`);

    return done('Antenna adjusted.', { antenna: { ...ant } });
  }

  private packet_(a: Extract<HamAction, { type: `packet.${string}` }>): ActionResult {
    const c = this.core_;
    const pk = c.ops.packet;
    const radioId = this.config.packet?.radioId;
    if (!pk || !radioId) return refuse('There is no packet station here.', 'no-packet');
    if (a.type === 'packet.config') {
      if (a.patch.audio) pk.setAudio(a.patch.audio);
      if (a.patch.station) pk.setStation(a.patch.station);
      c.bump();
      return done('Packet settings saved.');
    }
    if (a.type === 'packet.injectCorruption') {
      pk.corruptNextFrame();
      return done('The next frame will be corrupted.');
    }
    const prep = prepareTx(c, radioId, { kind: 'test' });
    if (!isPrepared(prep)) return prep;
    const ctx: PacketRadioCtx = { freqHz: prep.emission.freqHz, erpDbm: prep.emission.erpDbm, position: prep.emission.position };
    const nowS = c.state.nowS;
    const res =
      a.type === 'packet.connect'
        ? pk.connect(nowS, ctx)
        : a.type === 'packet.disconnect'
          ? pk.disconnect(nowS, ctx)
          : a.type === 'packet.send' && a.ui
            ? pk.sendUi(a.text, nowS, ctx)
            : pk.sendText(a.type === 'packet.send' ? a.text : '', nowS, ctx);
    if (!res.rf) {
      c.event('packet:no-rf', { reason: res.reason ?? null });
      return refuse(res.reason ?? 'Nothing went out over the air.', 'packet');
    }
    c.state.air.push(...res.emissions);
    c.event(`packet:${a.type.slice(7)}`);

    return done(res.reason ?? 'Frame sent.', { emissions: res.emissions.length });
  }

  private answer_(id: string, values: Record<string, string | number | Record<string, string>>): ActionResult {
    const c = this.core_;
    const ws: Worksheet | undefined = this.config.worksheets.find((w) => w.id === id);
    if (!ws) return refuse('There is no such worksheet.', 'unknown-worksheet');
    const rec = (c.state.worksheets[id] ??= { attempts: 0, correct: false });
    rec.attempts += 1;
    const wrong: string[] = [];
    for (const f of ws.fields) {
      const v = values[f.id];
      let ok = false;
      if (f.kind === 'number') ok = typeof Number(v) === 'number' && Math.abs(Number(v) - Number(f.answer)) <= (f.tolerance ?? 0);
      else if (f.kind === 'choice') ok = String(v) === String(f.answer);
      else if (typeof f.answer === 'object' && v && typeof v === 'object') ok = Object.entries(f.answer).every(([k, want]) => (v as Record<string, string>)[k] === want);
      if (!ok) wrong.push(f.id);
    }
    if (wrong.length > 0) {
      c.event(`worksheet:${id}:wrong`, { fields: wrong.join(',') });
      const feedback = wrong.map((f) => ws.wrongFeedback?.[f]).filter(Boolean);

      return { ok: true, message: feedback.length > 0 ? feedback.join(' ') : 'Not quite. Check your working.', data: { correct: false, wrongFields: wrong } };
    }
    if (!rec.correct) {
      rec.correct = true;
      rec.correctAtS = c.state.nowS;
      c.event(`worksheet:${id}:correct`);
    }

    return done(ws.explanation, { correct: true });
  }

  // ---- queries ----

  get nowS(): number {
    return this.core_.state.nowS;
  }

  get revision(): number {
    return this.core_.state.revision;
  }

  get stateVersion(): number {
    return this.core_.state.stateVersion;
  }

  get location(): HamLocationId {
    return this.core_.state.location;
  }

  /** Audible receptions of an emitter (authored id or ops station id), newest last */
  getReception(emitterId: string, q: ReceptionQuery = {}): ReceptionLogEntry[] {
    const after = this.core_.log.afterSeq(q.afterEvent);
    if (after === null) return [];

    return this.core_.log.state.receptions.filter(
      (r) =>
        r.emitterId === emitterId &&
        r.seq > after &&
        (!q.deviceId || r.deviceId === q.deviceId) &&
        (q.sinceRevision === undefined || r.revision >= q.sinceRevision) &&
        r.intelligibility >= (q.minIntelligibility ?? 0)
    );
  }

  bestIntelligibility(emitterId: string, q: ReceptionQuery = {}): number {
    const after = this.core_.log.afterSeq(q.afterEvent);
    if (after === null) return 0;
    const best: BestReception[] = this.core_.log.state.best[emitterId] ?? [];
    let v = 0;
    for (const b of best) {
      if (b.seq <= after || (q.deviceId && b.deviceId !== q.deviceId) || (q.sinceRevision !== undefined && b.revision < q.sinceRevision)) continue;
      v = Math.max(v, b.intelligibility);
    }
    for (const r of this.getReception(emitterId, q)) v = Math.max(v, r.intelligibility);

    return v;
  }

  /** Latest per-tick reception results for a receiver (what it hears right now) */
  liveReception(deviceId: string) {
    return this.core_.state.latest[deviceId] ?? [];
  }

  measurements(f: MeasurementFilter = {}): HamMeasurement[] {
    const after = this.core_.log.afterSeq(f.afterEvent);
    if (after === null) return [];

    return this.core_.log.state.measurements.filter(
      (m) =>
        measurementSeq(m) > after &&
        (!f.instrument || m.instrument === f.instrument) &&
        (!f.quantity || m.quantity === f.quantity) &&
        (f.underLoad === undefined || m.underLoad === f.underLoad) &&
        (f.sinceRevision === undefined || m.revision >= f.sinceRevision) &&
        Object.entries(f.placement ?? {}).every(([k, v]) => m.placement[k] === v)
    );
  }

  lastMeasurement(f: MeasurementFilter = {}): HamMeasurement | undefined {
    return this.measurements(f).at(-1);
  }

  /** Is this measurement still valid for the current station configuration? */
  isCurrent(m: HamMeasurement): boolean {
    return m.revision === this.core_.state.revision;
  }

  events(name: string): StationEvent[] {
    return this.core_.log.events(name);
  }

  eventsWithPrefix(prefix: string): StationEvent[] {
    return this.core_.log.eventsWithPrefix(prefix);
  }

  firstEvent(name: string): StationEvent | undefined {
    return this.core_.log.firstEvent(name);
  }

  /** Sequence number of the first `afterEvent` (0 when none given, null when it never happened) */
  afterSeq(afterEvent?: string): number | null {
    return this.core_.log.afterSeq(afterEvent);
  }

  contacts(): HamContactRecord[] {
    const o = this.core_.ops;

    return [...(o.qso?.getContacts() ?? []), ...(o.repeater?.getContacts() ?? []), ...(o.hf?.getContacts() ?? []), ...(o.sat?.getContacts() ?? [])];
  }

  /** Best contact with a remote id (most complete first) */
  contact(remoteId: string): HamContactRecord | undefined {
    const list = this.contacts().filter((x) => x.remoteId === remoteId || x.remoteCallsign === remoteId);
    list.sort((a, b) => Number(b.closed) - Number(a.closed) || b.exchanged.length - a.exchanged.length);

    return list[0];
  }

  isValidContact(c: HamContactRecord): boolean {
    const o = this.core_.ops;
    const mod = c.path === 'repeater' ? o.repeater : c.path === 'hf' ? o.hf : c.path === 'satellite' ? o.sat : o.qso;

    return mod?.isValidContact(c.id) ?? false;
  }

  repeaterLog() {
    return this.core_.ops.repeater?.getAccessLog() ?? [];
  }

  dmrLog() {
    return this.core_.ops.dmr?.getAccessLog() ?? [];
  }

  dmrState() {
    return this.core_.ops.dmr?.getState();
  }

  packetState(): PacketState | undefined {
    return this.core_.ops.packet?.getState();
  }

  satelliteState() {
    return this.core_.ops.sat?.getState();
  }

  netState() {
    return this.core_.ops.net?.getState();
  }

  netAttempts() {
    return this.core_.ops.net?.getAttempts() ?? [];
  }

  qsoNotes() {
    return this.core_.ops.qso?.getNotes() ?? [];
  }

  listenedBeforeFirstCall(minS = 10): boolean {
    return this.core_.ops.qso?.listenedBeforeFirstCall(minS) ?? false;
  }

  device(id: string): Readonly<DeviceRuntime> | undefined {
    return this.core_.device(id);
  }

  devices(): Readonly<DeviceRuntime>[] {
    return Object.values(this.core_.state.devices);
  }

  radio(deviceId: string): Readonly<RadioSettings> | undefined {
    return this.core_.inService(deviceId)?.radio;
  }

  energized(deviceId: string): boolean {
    return this.core_.energized(deviceId);
  }

  connection(id: string) {
    return this.core_.state.connections.find((c) => c.id === id);
  }

  connections() {
    return this.core_.state.connections;
  }

  connectionAt(deviceId: string, portId: string) {
    return this.core_.state.connections.find((c) => (c.a.deviceId === deviceId && c.a.portId === portId) || (c.b.deviceId === deviceId && c.b.portId === portId));
  }

  ports(deviceId: string) {
    return this.core_.ports[deviceId] ?? [];
  }

  faults() {
    return this.core_.state.faults;
  }

  faultCleared(id: string): boolean {
    return this.core_.state.faults.find((f) => f.id === id)?.cleared ?? false;
  }

  dcSystem(id: string) {
    return this.core_.dcSystems.get(id);
  }

  board(id: string) {
    return this.core_.boards.get(id);
  }

  meterState() {
    return this.core_.state.meter;
  }

  keyed() {
    return this.core_.state.keyed;
  }

  rfPath(deviceId: string, freqMHz: number, portId = 'ant') {
    return this.core_.path(deviceId, freqMHz, portId);
  }

  energy(): { totalWh: number; remainingWh: number; reserveWh: number; satisfied: boolean } | null {
    const plan = this.config.energyPlan;
    const dc = plan ? this.core_.dcSystems.get(plan.dcDeviceId) : undefined;
    if (!plan || !dc) return null;
    const b = dc.state.battery;

    return { totalWh: b.capacityWh, remainingWh: b.energyWh, reserveWh: plan.reserveWh, satisfied: b.energyWh >= plan.reserveWh };
  }

  worksheet(id: string) {
    return this.core_.state.worksheets[id];
  }

  transcripts() {
    return this.core_.state.transcripts;
  }

  notes() {
    return this.core_.log.state.notes;
  }

  spectrum(deviceId: string): Float32Array | undefined {
    return this.core_.spectrum.get(deviceId);
  }

  resetCount(dcId: string): number {
    return this.core_.state.resetCounts[dcId] ?? 0;
  }

  // ---- persistence ----

  getState(): HamStationState {
    return this.core_.snapshot();
  }

  restoreState(s: HamStationState): boolean {
    if (!s || s.schema !== HAM_STATION_SCHEMA) return false;
    this.core_.restore(s);
    this.lastLogged_.clear();
    evaluateReceivers(this.core_, 0, this.lastLogged_);
    this.changed_();

    return true;
  }
}
