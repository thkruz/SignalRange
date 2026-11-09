import { POS_STRIDE, PropagatorCore, STATION_STRIDE } from './propagation-core';
import { createPropagationHandler } from './propagation-handler';
import { type PropagationRequest, type PropagationResponse, type SlotKind, SWEEP_GRID_MS, WARM_GRID_MS } from './propagation-protocol';

/** Transport to the propagation worker (or an in-process stand-in). */
export interface PropagationBackend {
  post(msg: PropagationRequest, transfer?: Transferable[]): void;
  onMessage: ((msg: PropagationResponse) => void) | null;
  dispose(): void;
}

/** Real dedicated worker, bundled by rspack. Returns null where Worker is unavailable (vitest, old browsers). */
export function createWorkerBackend(): PropagationBackend | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL('./propagation.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  const backend: PropagationBackend = {
    onMessage: null,
    post: (msg, transfer = []) => worker.postMessage(msg, transfer),
    dispose: () => worker.terminate(),
  };
  worker.onmessage = (e: MessageEvent<PropagationResponse>) => backend.onMessage?.(e.data);
  return backend;
}

/**
 * Runs the worker's handler in-process. `autoDeliver` true answers
 * synchronously; false queues answers until `deliver()` (tests use this to
 * model a late or absent worker).
 */
export class InlineBackend implements PropagationBackend {
  onMessage: ((msg: PropagationResponse) => void) | null = null;
  private readonly queue_: PropagationResponse[] = [];
  private readonly handle_: (msg: PropagationRequest) => void;

  constructor(public autoDeliver = true) {
    this.handle_ = createPropagationHandler((msg) => {
      if (this.autoDeliver) this.onMessage?.(msg);
      else this.queue_.push(msg);
    });
  }

  post(msg: PropagationRequest): void {
    this.handle_(msg);
  }

  deliver(max = Number.POSITIVE_INFINITY): number {
    let n = 0;
    while (this.queue_.length > 0 && n < max) {
      this.onMessage?.(this.queue_.shift() as PropagationResponse);
      n++;
    }
    return n;
  }

  dispose(): void {
    this.queue_.length = 0;
  }
}

export interface PropagationStation {
  latDeg: number;
  lonDeg: number;
  altKm: number;
}

export interface PropagationServiceOptions {
  tle1: string[];
  tle2: string[];
  /** NORAD ids in member-index order (same order as the TLE arrays) */
  norad: Int32Array;
  stations: PropagationStation[];
  /** Worker transport. Omit for no worker: every sample is then computed on the calling thread. */
  backend?: PropagationBackend | null;
  /** Warm grid seconds requested ahead of sim time at 1x (scaled by speed). Default 5. */
  warmLookaheadS?: number;
  /** Sweep grid points requested ahead. Default 2. */
  sweepLookahead?: number;
}

/** Result of `sampleAt`. Reuse one object per caller to avoid allocation. */
export interface PropagationSample {
  /** TEME ECI position, km */
  x: number;
  y: number;
  z: number;
  /** TEME ECI velocity, km/s */
  vx: number;
  vy: number;
  vz: number;
  /** Per station, linearly interpolated between grid samples */
  elDeg: Float64Array;
  rangeKm: Float64Array;
  /** Grid spacing the sample was built from: 1000 (warm) or 60000 (cold), sim ms */
  gridMs: number;
}

/** One 60 s sweep: ECI state and per-station look angles for every member. Read-only. */
export interface SweepView {
  gridMs: number;
  /** [x y z vx vy vz] per member index */
  pos: Float64Array;
  /** [el deg, range km] per station per member: look[(member * stations + station) * 2] */
  look: Float64Array;
  stations: number;
}

interface Slot {
  gridMs: number;
  pos: Float64Array;
  look: Float64Array;
}

const MIN_WARM_RING = 48;
const SWEEP_RING = 6;
/** Pending requests allowed at once; must exceed the largest warm lead (sim seconds) plus sweeps */
const MAX_PENDING = 96;
/** Lead = speed x (worker round trip x this factor) + base, in sim seconds */
const LATENCY_SAFETY = 4;
const LEAD_BASE_S = 2;
const RING_SPARE = 12;
const LOCAL_KEEP = 4;

export function createPropagationServiceFromRegistry(
  registry: { memberTleLines(): { tle1: string[]; tle2: string[] }; memberNoradIds(): Int32Array },
  stations: PropagationStation[],
  backend: PropagationBackend | null = createWorkerBackend()
): PropagationService {
  const { tle1, tle2 } = registry.memberTleLines();
  return new PropagationService({ tle1, tle2, norad: registry.memberNoradIds(), stations, backend });
}

/**
 * Serves member state at arbitrary sim time from fixed grid samples.
 *
 * Determinism: `sampleAt` always interpolates between the two grid points that
 * bracket the time, using the 1 s grid for warm members and the 60 s grid for
 * everyone else. Where a grid point comes from (worker, or this thread when the
 * worker is absent or late) cannot change its value, because both run the same
 * SGP4 code, so the answer never depends on worker timing. A locally computed
 * grid point is counted in `fallbacks`.
 */
export class PropagationService {
  /** Grid points computed on this thread because the worker had not delivered (or there is no worker). */
  fallbacks = 0;
  /** Fallbacks by reason (diagnostics): warm/sweep point missing and why. */
  readonly fallbackReasons: Record<string, number> = {};
  /** Results accepted from the backend. */
  resultsReceived = 0;
  /** Stale results (older generation) dropped. */
  staleDropped = 0;
  /** Sum of worker compute time reported in results, ms */
  workerBusyMs = 0;
  readonly stationCount: number;

  private readonly opts_: PropagationServiceOptions;
  private readonly backend_: PropagationBackend | null;
  private readonly index_ = new Map<number, number>();
  private readonly warmSlots_ = new Map<number, Slot>();
  private readonly sweepSlots_ = new Map<number, Slot>();
  private readonly pending_ = new Set<string>();
  private readonly local_ = new Map<number, Map<number, { pos: Float64Array; look: Float64Array }>>();
  private warmPos_ = new Map<number, number>();
  private warmIndices_ = new Int32Array(0);
  private gen_ = 0;
  private nextId_ = 1;
  private core_: PropagatorCore | null = null;
  private readonly stationsPacked_: Float64Array;
  private ready_ = false;
  /** Sim time and speed of the last update(), reused to prefetch when the warm set or generation changes */
  private lastSimMs_ = Number.NaN;
  private lastSpeed_ = 1;
  /** Real post time per pending key, for round-trip measurement */
  private readonly postedAt_ = new Map<string, number>();
  /** Slowest recent worker round trip (decays), real ms */
  private latencyMs_ = 0;
  /** Warm-ring capacity, grown with the lead */
  private warmRing_ = MIN_WARM_RING;

  constructor(opts: PropagationServiceOptions) {
    this.opts_ = opts;
    this.backend_ = opts.backend ?? null;
    this.stationCount = opts.stations.length;
    this.stationsPacked_ = new Float64Array(opts.stations.length * STATION_STRIDE);
    opts.stations.forEach((s, i) => {
      this.stationsPacked_.set([s.latDeg, s.lonDeg, s.altKm], i * STATION_STRIDE);
    });
    for (let i = 0; i < opts.norad.length; i++) this.index_.set(opts.norad[i], i);
    if (this.backend_) {
      this.backend_.onMessage = (m) => this.onMessage_(m);
      this.backend_.post({ type: 'init', tle1: opts.tle1, tle2: opts.tle2, stations: this.stationsPacked_.slice() });
    }
  }

  get memberCount(): number {
    return this.opts_.norad.length;
  }

  /** True once the worker has built its satrecs and answered `ready` (always false without a worker). */
  get isReady(): boolean {
    return this.ready_;
  }

  /** Whether the worker has delivered the 60 s sweep at this grid time. */
  hasSweep(gridMs: number): boolean {
    return this.sweepSlots_.has(gridMs);
  }

  /** Whether the worker has delivered the 1 s warm grid point at this grid time (true when the warm set is empty). */
  hasWarmPoint(gridMs: number): boolean {
    return this.warmIndices_.length === 0 || this.warmSlots_.has(gridMs);
  }

  get hasBackend(): boolean {
    return this.backend_ !== null;
  }

  get warmCount(): number {
    return this.warmIndices_.length;
  }

  indexOf(norad: number): number {
    return this.index_.get(norad) ?? -1;
  }

  isWarm(norad: number): boolean {
    const i = this.index_.get(norad);
    return i !== undefined && this.warmPos_.has(i);
  }

  /** Replace the warm set. Invalidates warm slots (the answer for a member depends on its tier, not on timing). */
  setWarm(noradIds: Iterable<number>): void {
    const idx: number[] = [];
    for (const n of noradIds) {
      const i = this.index_.get(n);
      if (i !== undefined) idx.push(i);
    }
    idx.sort((a, b) => a - b);
    this.warmIndices_ = Int32Array.from(new Set(idx));
    this.warmPos_ = new Map();
    this.warmIndices_.forEach((m, k) => this.warmPos_.set(m, k));
    this.gen_++;
    this.dropSlots_(this.warmSlots_);
    this.dropPending_('warm');
    this.backend_?.post({ type: 'warm', indices: this.warmIndices_.slice(), gen: this.gen_ });
    // Newly warmed members get their grid points requested now, before anyone samples them
    this.prefetch_();
  }

  /** Forget every cached grid point (backward jump, time skip, element change). Results in flight are dropped. */
  invalidate(): void {
    this.gen_++;
    this.dropSlots_(this.warmSlots_);
    this.dropSlots_(this.sweepSlots_);
    this.pending_.clear();
    this.local_.clear();
    this.postedAt_.clear();
    this.backend_?.post({ type: 'warm', indices: this.warmIndices_.slice(), gen: this.gen_ });
    this.prefetch_();
  }

  /**
   * Request grid points ahead of `simMs`. Call once per tick or frame. Never
   * blocks and never changes what `sampleAt` returns.
   */
  update(simMs: number, speed = 1): void {
    this.lastSimMs_ = simMs;
    this.lastSpeed_ = Math.max(1, speed);
    this.prefetch_();
  }

  /**
   * Warm lead in sim seconds: proportional to speed and to the measured worker
   * round trip, never below the configured base.
   */
  get warmLeadS(): number {
    const speed = this.lastSpeed_;
    const base = (this.opts_.warmLookaheadS ?? 5) * speed;
    const measured = speed * ((this.latencyMs_ * LATENCY_SAFETY) / 1000) + LEAD_BASE_S;
    return Math.ceil(Math.max(base, measured)) + 1;
  }

  /** True when the worker has delivered (or nothing needs) the warm points a sample at `simMs` reads. */
  hasWarmCoverage(simMs: number): boolean {
    const g0 = Math.floor(simMs / WARM_GRID_MS) * WARM_GRID_MS;
    return this.hasWarmPoint(g0) && this.hasWarmPoint(g0 + WARM_GRID_MS);
  }

  private prefetch_(): void {
    if (!this.backend_ || !this.ready_ || Number.isNaN(this.lastSimMs_)) {
      return;
    }
    const simMs = this.lastSimMs_;
    const look = this.warmLeadS;
    this.warmRing_ = Math.max(MIN_WARM_RING, look + RING_SPARE);
    if (this.warmIndices_.length > 0) {
      const g0 = Math.floor(simMs / WARM_GRID_MS) * WARM_GRID_MS;
      for (let k = 0; k <= look; k++) this.request_('warm', g0 + k * WARM_GRID_MS);
    }
    const s0 = Math.floor(simMs / SWEEP_GRID_MS) * SWEEP_GRID_MS;
    const sweeps = Math.max(this.opts_.sweepLookahead ?? 2, Math.ceil((look * WARM_GRID_MS) / SWEEP_GRID_MS) + 1);
    for (let k = 0; k <= sweeps; k++) this.request_('sweep', s0 + k * SWEEP_GRID_MS);
  }

  /**
   * State of a member at `simMs` (cubic Hermite on ECI pos/vel, linear on look angles).
   * Returns false for unknown members or failed propagation.
   */
  sampleAt(norad: number, simMs: number, out: PropagationSample): boolean {
    const m = this.index_.get(norad);
    if (m === undefined) {
      return false;
    }
    const warmK = this.warmPos_.get(m);
    const step = warmK === undefined ? SWEEP_GRID_MS : WARM_GRID_MS;
    const g0 = Math.floor(simMs / step) * step;
    const a = this.point_(m, warmK, g0, step);
    const b = this.point_(m, warmK, g0 + step, step);
    if (!a || !b) {
      return false;
    }
    const s = (simMs - g0) / step;
    const h = step / 1000;
    hermite_(a.pos, a.po, b.pos, b.po, s, h, out);
    out.gridMs = step;
    const st = this.stationCount;
    if (out.elDeg.length < st) {
      return false;
    }
    for (let i = 0; i < st; i++) {
      out.elDeg[i] = a.look[a.lo + i * 2] + (b.look[b.lo + i * 2] - a.look[a.lo + i * 2]) * s;
      out.rangeKm[i] = a.look[a.lo + i * 2 + 1] + (b.look[b.lo + i * 2 + 1] - a.look[a.lo + i * 2 + 1]) * s;
    }
    return !Number.isNaN(out.x);
  }

  newSample(): PropagationSample {
    return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, elDeg: new Float64Array(this.stationCount), rangeKm: new Float64Array(this.stationCount), gridMs: 0 };
  }

  /**
   * The 60 s sweep at a grid time (multiple of 60 000 ms). Computed here (and
   * counted as one fallback) if the worker has not delivered it, so tier logic
   * that reads it is independent of worker timing.
   */
  sweepAt(gridMs: number): SweepView {
    const slot = this.sweepSlots_.get(gridMs) ?? this.computeSweepLocal_(gridMs);
    return { gridMs, pos: slot.pos, look: slot.look, stations: this.stationCount };
  }

  dispose(): void {
    this.backend_?.dispose();
    this.warmSlots_.clear();
    this.sweepSlots_.clear();
    this.pending_.clear();
  }

  private point_(m: number, warmK: number | undefined, gridMs: number, step: number): { pos: Float64Array; po: number; look: Float64Array; lo: number } | null {
    const kind: SlotKind = step === WARM_GRID_MS ? 'warm' : 'sweep';
    const slot = (kind === 'warm' ? this.warmSlots_ : this.sweepSlots_).get(gridMs);
    if (slot) {
      const k = kind === 'warm' ? (warmK as number) : m;
      return { pos: slot.pos, po: k * POS_STRIDE, look: slot.look, lo: k * this.stationCount * 2 };
    }
    // No worker data: compute this member's grid point here (same code, same value), memoised per member
    let perMember = this.local_.get(m);
    if (!perMember) {
      perMember = new Map();
      this.local_.set(m, perMember);
    }
    let hit = perMember.get(gridMs);
    if (!hit) {
      this.core_ ??= new PropagatorCore(this.opts_.tle1, this.opts_.tle2, this.stationsPacked_);
      hit = { pos: new Float64Array(POS_STRIDE), look: new Float64Array(Math.max(1, this.stationCount * 2)) };
      this.core_.computeOne(m, gridMs, hit.pos, hit.look);
      perMember.set(gridMs, hit);
      this.fallbacks++;
      this.noteFallback_(kind, gridMs);
      if (perMember.size > LOCAL_KEEP) {
        perMember.delete(perMember.keys().next().value as number);
      }
    }
    return { pos: hit.pos, po: 0, look: hit.look, lo: 0 };
  }

  private noteFallback_(kind: SlotKind | 'sweep-all', gridMs: number): void {
    const slots = kind === 'warm' ? this.warmSlots_ : this.sweepSlots_;
    let min = Number.POSITIVE_INFINITY;
    for (const g of slots.keys()) if (g < min) min = g;
    let why: string;
    if (!this.ready_ || !this.backend_) why = 'no-worker';
    else if (this.pending_.has(`${kind === 'sweep-all' ? 'sweep' : kind}:${gridMs}`)) why = 'pending';
    else if (slots.size > 0 && gridMs < min) why = 'evicted';
    else why = 'unrequested';
    const key = `${kind}:${why}`;
    this.fallbackReasons[key] = (this.fallbackReasons[key] ?? 0) + 1;
  }

  private computeSweepLocal_(gridMs: number): Slot {
    this.core_ ??= new PropagatorCore(this.opts_.tle1, this.opts_.tle2, this.stationsPacked_);
    const n = this.memberCount;
    const slot: Slot = { gridMs, pos: new Float64Array(n * POS_STRIDE), look: new Float64Array(n * this.stationCount * 2) };
    this.core_.compute(gridMs, null, slot.pos, slot.look);
    this.fallbacks++;
    this.noteFallback_('sweep-all', gridMs);
    this.store_(this.sweepSlots_, slot, SWEEP_RING);
    return slot;
  }

  private request_(kind: SlotKind, gridMs: number): void {
    const slots = kind === 'warm' ? this.warmSlots_ : this.sweepSlots_;
    const key = `${kind}:${gridMs}`;
    if (slots.has(gridMs) || this.pending_.has(key) || this.pending_.size >= MAX_PENDING) {
      return;
    }
    this.pending_.add(key);
    this.postedAt_.set(key, performance.now());
    this.backend_?.post({ type: 'compute', id: this.nextId_++, kind, gridMs, gen: this.gen_ });
  }

  private onMessage_(msg: PropagationResponse): void {
    if (msg.type === 'ready') {
      this.ready_ = true;
      return;
    }
    if (msg.type === 'error') {
      return;
    }
    const key = `${msg.kind}:${msg.gridMs}`;
    this.pending_.delete(key);
    const posted = this.postedAt_.get(key);
    if (posted !== undefined) {
      this.postedAt_.delete(key);
      if (msg.kind === 'warm' && msg.gen === this.gen_) {
        const rt = performance.now() - posted;
        // Slowest recent round trip, decaying slowly so one slow batch does not pin the lead
        this.latencyMs_ = Math.max(rt, this.latencyMs_ * 0.98);
      }
    }
    if (msg.gen !== this.gen_) {
      this.staleDropped++;
      this.backend_?.post({ type: 'recycle', buffers: [msg.pos.buffer as ArrayBuffer, msg.look.buffer as ArrayBuffer] }, [msg.pos.buffer, msg.look.buffer]);
      return;
    }
    this.resultsReceived++;
    this.workerBusyMs += msg.workMs;
    const slots = msg.kind === 'warm' ? this.warmSlots_ : this.sweepSlots_;
    this.store_(slots, { gridMs: msg.gridMs, pos: msg.pos, look: msg.look }, msg.kind === 'warm' ? this.warmRing_ : SWEEP_RING);
  }

  /** Ring insert: keep the newest `cap` grid times, hand evicted buffers back to the worker. */
  private store_(slots: Map<number, Slot>, slot: Slot, cap: number): void {
    const old = slots.get(slot.gridMs);
    if (old) this.recycle_(old);
    slots.set(slot.gridMs, slot);
    while (slots.size > cap) {
      let min = Number.POSITIVE_INFINITY;
      for (const g of slots.keys()) if (g < min) min = g;
      const ev = slots.get(min) as Slot;
      slots.delete(min);
      this.recycle_(ev);
    }
  }

  private recycle_(slot: Slot): void {
    if (this.backend_ && this.ready_ && slot.pos.buffer.byteLength > 0) {
      this.backend_.post({ type: 'recycle', buffers: [slot.pos.buffer as ArrayBuffer, slot.look.buffer as ArrayBuffer] }, [slot.pos.buffer, slot.look.buffer]);
    }
  }

  private dropSlots_(slots: Map<number, Slot>): void {
    for (const s of slots.values()) this.recycle_(s);
    slots.clear();
  }

  private dropPending_(kind: SlotKind): void {
    for (const k of [...this.pending_]) {
      if (k.startsWith(`${kind}:`)) {
        this.pending_.delete(k);
        this.postedAt_.delete(k);
      }
    }
  }
}

function hermite_(p0: Float64Array, o0: number, p1: Float64Array, o1: number, s: number, h: number, out: PropagationSample): void {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const d00 = 6 * s2 - 6 * s;
  const d10 = 3 * s2 - 4 * s + 1;
  const d01 = -6 * s2 + 6 * s;
  const d11 = 3 * s2 - 2 * s;
  const q = (i: number, vi: number): [number, number] => {
    const a = p0[o0 + i];
    const b = p1[o1 + i];
    const va = p0[o0 + vi];
    const vb = p1[o1 + vi];
    return [h00 * a + h10 * h * va + h01 * b + h11 * h * vb, (d00 * a + d01 * b) / h + d10 * va + d11 * vb];
  };
  [out.x, out.vx] = q(0, 3);
  [out.y, out.vy] = q(1, 4);
  [out.z, out.vz] = q(2, 5);
}
