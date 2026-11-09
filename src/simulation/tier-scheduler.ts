import type { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { PropagationSample, PropagationService, PropagationStation } from '@app/simulation/propagation/propagation-service';
import type { SatelliteRegistry } from '@app/simulation/satellite-registry';
import { FIXED_STEP_MS } from '@app/simulation/sim-clock';

/**
 * Tier scheduler (Phase 3, P3-WP4, plan 2.3). One `Events.UPDATE` subscription
 * replaces the per-satellite ones.
 *
 * - Hot: authored satellites and every hydrated member (selected, pinned,
 *   dirty, antenna-tracked, or kept by the hot-hold below). Full `update()`
 *   every tick, in a stable order: authored in scenario order, then members by
 *   NORAD id.
 * - Warm: not hydrated, but inside a station's visibility circle plus a
 *   promotion margin. Served from the propagation service's 1 s grid.
 * - Cold: everything else, served from the 60 s sweep.
 *
 * Tier membership is recomputed at each 60 s sweep grid point from sweep data
 * only (never from whether the worker has answered), so one scenario at one
 * time always yields the same tiers. The promotion margin covers the angular
 * motion of the member and the station over the 60 s until the next
 * recompute, so a member is warm before it can clear the horizon.
 *
 * Hysteresis: a member enters warm at the margin and leaves only at the margin
 * plus `HYSTERESIS_DEG`; a hydrated member that is in range is touched every
 * sweep, so it stays hot until it has been out of range for the registry's
 * cold TTL (10 sim minutes).
 *
 * Fewer than `SMALL_SCENARIO_THRESHOLD` satellites (or no constellation
 * members, or no service): everything is hot and the service is not used.
 */

export const SMALL_SCENARIO_THRESHOLD = 64;
export const SWEEP_PERIOD_MS = 60_000;
/** Extra margin on top of the 60 s motion allowance, degrees of earth-central angle */
export const PROMOTION_MARGIN_DEG = 1;
/** Leave-warm threshold above the enter-warm threshold, degrees of earth-central angle */
export const HYSTERESIS_DEG = 2;

const EARTH_RADIUS_KM = 6378.137;
const EARTH_ROTATION_RAD_S = 7.292115e-5;
const RAD = Math.PI / 180;

export enum Tier {
  Cold = 0,
  Warm = 1,
  Hot = 2,
}

/**
 * Enter/keep decision for a non-hydrated member at one station.
 * `gammaDeg` is the earth-central angle from the station to the member,
 * `edgeDeg` the visibility radius plus the full promotion margin.
 */
export function classifyWarm(gammaDeg: number, edgeDeg: number, wasWarm: boolean): boolean {
  return wasWarm ? gammaDeg <= edgeDeg + HYSTERESIS_DEG : gammaDeg <= edgeDeg;
}

export interface TierSchedulerOptions {
  registry: SatelliteRegistry;
  /** Null: no tiering, everything hydrated is hot */
  service?: PropagationService | null;
  /** Same stations (same order) the service was built with */
  stations?: PropagationStation[];
  /** Horizon elevation, degrees */
  minElevationDeg?: number;
  /** Current sim time, ms (the clock satellites propagate against) */
  now: () => number;
  /** Sim speed multiplier, for service prefetch */
  speed?: () => number;
  smallThreshold?: number;
  /** Extra subscription target for tests; defaults to the global EventBus */
  bus?: Pick<EventBus, 'on' | 'off'>;
  /** How long to wait for the worker before falling back to the main thread, ms (real time) */
  primeTimeoutMs?: number;
  /** Scenario time after the next step, ms. Default: `now` plus one fixed step. */
  nextStepMs?: () => number;
}

export class TierScheduler {
  private readonly registry_: SatelliteRegistry;
  private readonly service_: PropagationService | null;
  private readonly stations_: PropagationStation[];
  private readonly minEl_: number;
  private readonly now_: () => number;
  private readonly speed_: () => number;
  private readonly bus_: Pick<EventBus, 'on' | 'off'>;
  private readonly tiered_: boolean;
  private readonly boundUpdate_ = this.onUpdate_.bind(this);
  private readonly boundElements_ = this.invalidate.bind(this);
  private started_ = false;
  private primed_ = false;
  private tiersComputed_ = false;
  private primeStartedAt_: number | null = null;
  private inSkip_ = false;
  private readonly nextStepMs_: () => number;
  private holdStartedAt_: number | null = null;
  private holdGaveUp_ = false;
  private readonly primeTimeoutMs_: number;
  private readonly boundSkipStart_ = () => {
    this.inSkip_ = true;
  };
  private readonly boundSkipEnd_ = () => {
    this.inSkip_ = false;
  };
  /** Phase the startup/skip wait is in, for loading text: 'worker' | 'positions' | 'done' */
  primePhase: 'worker' | 'positions' | 'done' = 'worker';
  /** True when priming gave up on the worker (timeout or no Worker) and the main thread computes the grid */
  primeFellBack = false;

  private tier_: Uint8Array;
  /** Bit s set: member is inside station s's margin circle (warm or hot) */
  private stationMask_: Uint8Array;
  private warmNorads_: number[] = [];
  private warmKey_ = '';
  private hotOrder_: Satellite[] = [];
  private hotRevision_ = -1;
  private lastNowMs_ = Number.NaN;
  private lastSecond_ = Number.NaN;
  private lastSweepMs_ = Number.NaN;
  /** Times the tier sets were recomputed (tests, perf) */
  recomputes = 0;
  /** Steps held back because the worker had not delivered grid points yet (count of gate refusals) */
  holds = 0;
  /** Distinct hold episodes (a run of consecutive refusals) */
  holdEpisodes = 0;
  /** Longest hold episode, real ms */
  maxHoldMs = 0;
  /** Members released by the periodic cold sweep */
  released = 0;

  constructor(opts: TierSchedulerOptions) {
    this.registry_ = opts.registry;
    this.service_ = opts.service ?? null;
    this.stations_ = opts.stations ?? [];
    this.minEl_ = (opts.minElevationDeg ?? 0) * RAD;
    this.now_ = opts.now;
    this.nextStepMs_ = opts.nextStepMs ?? (() => opts.now() + FIXED_STEP_MS);
    this.speed_ = opts.speed ?? (() => 1);
    this.bus_ = opts.bus ?? EventBus.getInstance();
    this.primeTimeoutMs_ = opts.primeTimeoutMs ?? 15_000;
    const threshold = opts.smallThreshold ?? SMALL_SCENARIO_THRESHOLD;
    this.tiered_ = this.service_ !== null && this.registry_.memberCount > 0 && this.registry_.size >= threshold && this.stations_.length > 0;
    this.primed_ = !this.tiered_;
    this.tier_ = new Uint8Array(this.registry_.memberCount);
    this.stationMask_ = new Uint8Array(this.registry_.memberCount);
    if (!this.tiered_ && this.registry_.memberCount > 0) {
      // Small scenario: every member is hot from the start
      for (let i = 0; i < this.registry_.memberCount; i++) {
        this.registry_.get(this.registry_.memberNorad(i));
        this.tier_[i] = Tier.Hot;
      }
    }
  }

  /** True when members are tiered; false when everything is hot. */
  get isTiered(): boolean {
    return this.tiered_;
  }

  get service(): PropagationService | null {
    return this.tiered_ ? this.service_ : null;
  }

  /** Subscribe to the simulation tick. Idempotent. */
  start(): void {
    if (this.started_) {
      return;
    }
    this.started_ = true;
    this.bus_.on(Events.UPDATE, this.boundUpdate_);
    this.bus_.on(Events.SATELLITE_ELEMENTS_CHANGED, this.boundElements_);
    this.bus_.on(Events.TIME_SKIP_STARTED, this.boundSkipStart_);
    this.bus_.on(Events.TIME_SKIP_ENDED, this.boundSkipEnd_);
  }

  stop(): void {
    if (!this.started_) {
      return;
    }
    this.started_ = false;
    this.bus_.off(Events.UPDATE, this.boundUpdate_);
    this.bus_.off(Events.SATELLITE_ELEMENTS_CHANGED, this.boundElements_);
    this.bus_.off(Events.TIME_SKIP_STARTED, this.boundSkipStart_);
    this.bus_.off(Events.TIME_SKIP_ENDED, this.boundSkipEnd_);
  }

  dispose(): void {
    this.stop();
    this.service_?.dispose();
  }

  /**
   * Time skip, backward jump, or changed elements: drop cached samples and
   * restart tiering from the current time (non-hydrated members go cold until
   * the next recompute, which happens on the next tick).
   */
  invalidate(): void {
    this.service_?.invalidate();
    this.lastSecond_ = Number.NaN;
    this.lastSweepMs_ = Number.NaN;
    this.lastNowMs_ = Number.NaN;
    this.primed_ = !this.tiered_;
    this.tiersComputed_ = false;
    this.primeStartedAt_ = null;
    this.holdStartedAt_ = null;
    this.holdGaveUp_ = false;
    this.primePhase = 'worker';
    this.warmKey_ = '';
    this.warmNorads_ = [];
    if (this.tiered_) {
      this.tier_.fill(Tier.Cold);
      this.stationMask_.fill(0);
    }
  }

  /**
   * Gate for the next fixed step. Returns false to hold the sim for a frame
   * when the worker has not yet delivered the grid points the step will read;
   * the caller gives the step back to the clock. Never computes on the main
   * thread: after `primeTimeoutMs` of continuous holding it gives up (logs a
   * warning) and lets the service fall back. The tier recompute for a new
   * sweep minute runs here, before the step, so the new warm set's points are
   * requested (and waited for) before anything samples them.
   */
  canStep(): boolean {
    if (!this.tiered_ || !this.primed_ || this.inSkip_ || this.holdGaveUp_) {
      return true;
    }
    const service = this.service_ as PropagationService;
    if (!service.hasBackend || !service.isReady) {
      return true;
    }
    const nextMs = this.nextStepMs_();
    const sweepMs = Math.floor(nextMs / SWEEP_PERIOD_MS) * SWEEP_PERIOD_MS;
    let ok = service.hasSweep(sweepMs) && service.hasSweep(sweepMs + SWEEP_PERIOD_MS);
    if (ok && sweepMs !== this.lastSweepMs_) {
      this.lastSweepMs_ = sweepMs;
      this.recompute_(sweepMs, nextMs);
      service.update(nextMs, this.speed_());
    }
    ok = ok && service.hasWarmCoverage(nextMs);
    const now = performance.now();
    if (ok) {
      if (this.holdStartedAt_ !== null) {
        this.maxHoldMs = Math.max(this.maxHoldMs, now - this.holdStartedAt_);
        this.holdStartedAt_ = null;
      }
      return true;
    }
    if (this.holdStartedAt_ === null) {
      this.holdStartedAt_ = now;
      this.holdEpisodes++;
    } else if (now - this.holdStartedAt_ > this.primeTimeoutMs_) {
      console.warn(`[TierScheduler] Propagation worker did not deliver within ${this.primeTimeoutMs_} ms; computing on the main thread`);
      this.holdGaveUp_ = true;
      return true;
    }
    this.holds++;
    service.update(nextMs, this.speed_());
    return false;
  }

  /** True when the worker's first grid points for the current time are in (or tiering is off). */
  get isPrimed(): boolean {
    return this.primed_;
  }

  /**
   * One non-blocking step toward having the worker's grid points for `nowMs`:
   * worker ready, the 60 s sweep at the start time delivered, tiers computed
   * from it, and the first warm 1 s points delivered. Returns true once primed.
   * After `primeTimeoutMs` of real time, or with no Worker, gives up, logs a
   * warning and lets the main thread compute grid points (fallbacks count).
   */
  prime(nowMs: number): boolean {
    if (this.primed_) {
      return true;
    }
    const service = this.service_ as PropagationService;
    if (!service.hasBackend) {
      console.warn('[TierScheduler] No propagation worker available; computing the grid on the main thread');
      this.primeFellBack = true;
      return this.finishPrime_(nowMs);
    }
    this.primeStartedAt_ ??= performance.now();
    if (performance.now() - this.primeStartedAt_ > this.primeTimeoutMs_) {
      console.warn(`[TierScheduler] Propagation worker did not answer within ${this.primeTimeoutMs_} ms; computing the grid on the main thread`);
      this.primeFellBack = true;
      return this.finishPrime_(nowMs);
    }
    if (!service.isReady) {
      this.primePhase = 'worker';
      return false;
    }
    this.primePhase = 'positions';
    service.update(nowMs, this.speed_());
    const sweepMs = Math.floor(nowMs / SWEEP_PERIOD_MS) * SWEEP_PERIOD_MS;
    if (!(service.hasSweep(sweepMs) && service.hasSweep(sweepMs + SWEEP_PERIOD_MS))) {
      return false;
    }
    if (!this.tiersComputed_) {
      this.recompute_(sweepMs, nowMs);
      this.tiersComputed_ = true;
      this.lastSweepMs_ = sweepMs;
      service.update(nowMs, this.speed_());
    }
    const g0 = Math.floor(nowMs / 1000) * 1000;
    if (!(service.hasWarmPoint(g0) && service.hasWarmPoint(g0 + 1000))) {
      return false;
    }
    return this.finishPrime_(nowMs);
  }

  private finishPrime_(nowMs: number): boolean {
    if (!this.tiersComputed_) {
      // Main-thread path: the same grid values, computed here (counted as fallbacks)
      const sweepMs = Math.floor(nowMs / SWEEP_PERIOD_MS) * SWEEP_PERIOD_MS;
      this.recompute_(sweepMs, nowMs);
      this.lastSweepMs_ = sweepMs;
      this.tiersComputed_ = true;
    }
    this.primed_ = true;
    this.primePhase = 'done';
    this.lastSecond_ = Number.NaN;
    return true;
  }

  /**
   * Resolve once primed (polling, so the page can show progress while the sim
   * is paused for loading). `onProgress` receives loading-screen text.
   */
  async whenPrimed(nowMs: () => number = this.now_, onProgress?: (text: string) => void, pollMs = 25): Promise<void> {
    let last = '';
    while (!this.prime(nowMs())) {
      const text = this.primePhase === 'worker' ? 'Starting propagation worker' : 'Computing initial positions';
      if (text !== last) {
        last = text;
        onProgress?.(text);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
    }
  }

  tierOf(norad: number): Tier {
    if (this.registry_.peek(norad)) {
      return Tier.Hot;
    }
    const idx = this.registry_.memberIndexOf(norad);
    if (idx < 0) {
      return Tier.Cold;
    }
    return this.tiered_ ? (this.tier_[idx] as Tier) : Tier.Hot;
  }

  /** Copy of the tier of every member in member-index order (hydrated members read as hot). */
  tierSnapshot(): Uint8Array {
    const out = new Uint8Array(this.tier_.length);
    for (let i = 0; i < out.length; i++) {
      out[i] = this.registry_.isHydrated(this.registry_.memberNorad(i)) ? Tier.Hot : this.tier_[i];
    }
    return out;
  }

  get warmCount(): number {
    return this.warmNorads_.length;
  }

  /** NORAD ids of the warm tier (not hydrated, inside a station margin circle). */
  warmNoradIds(): readonly number[] {
    return this.warmNorads_;
  }

  /**
   * Warm members inside station `station`'s margin circle, as of the last
   * sweep. WP5 promotes members from here to hot (`registry.get`) when an
   * antenna's per-carrier cone contains them.
   */
  warmFor(station: number): number[] {
    const out: number[] = [];
    const bit = 1 << station;
    for (const norad of this.warmNorads_) {
      const idx = this.registry_.memberIndexOf(norad);
      if (idx >= 0 && this.stationMask_[idx] & bit) {
        out.push(norad);
      }
    }
    return out;
  }

  /** Interpolated state of a warm or cold member from the service grid (false when unavailable). */
  sampleAt(norad: number, simMs: number, out: PropagationSample): boolean {
    return this.service_ ? this.service_.sampleAt(norad, simMs, out) : false;
  }

  /**
   * Satellites an antenna should consider: every hot satellite (authored plus
   * hydrated members), in the stable update order. WP5 narrows this by band,
   * horizon and beam cone and adds warm members promoted into the cone.
   * `station` is the index into the scenario's ground stations (reserved for
   * that narrowing).
   */
  candidatesFor(_station?: number): readonly Satellite[] {
    return this.hotOrder_.length > 0 && this.hotRevision_ === this.registry_.revision ? this.hotOrder_ : this.refreshOrder_();
  }

  // === RF candidate narrowing support (P3-WP5) ===

  /** RF narrowing on/off. Off: antennas see every hot satellite, as before WP5. Default on when the scenario has members. */
  rfNarrowing = true;
  /** Aggregate sidelobe noise term (P3-D3) on/off. Default on when the scenario has members. */
  rfAggregate = true;

  /** True when antennas should narrow candidates (members exist and the flag is on). */
  get rfNarrowingActive(): boolean {
    return this.rfNarrowing && this.registry_.memberCount > 0;
  }

  get registry(): SatelliteRegistry {
    return this.registry_;
  }

  /** Current sim time, ms. */
  nowMs(): number {
    return this.now_();
  }

  /** Index of the scenario ground station at this position (the order the service was built with), or -1. */
  stationIndexOf(latDeg: number, lonDeg: number): number {
    return this.stations_.findIndex((s) => Math.abs(s.latDeg - latDeg) < 1e-6 && Math.abs(s.lonDeg - lonDeg) < 1e-6);
  }

  station(index: number): PropagationStation | undefined {
    return this.stations_[index];
  }

  private readonly rfHold_ = new Map<number, number>();

  /** Keep a member that antennas promoted hydrated until `untilMs` (sim time). */
  holdRf(norad: number, untilMs: number): void {
    if ((this.rfHold_.get(norad) ?? Number.NEGATIVE_INFINITY) < untilMs) {
      this.rfHold_.set(norad, untilMs);
    }
  }

  /**
   * Release promoted members whose hold ran out (unless pinned, dirty or
   * authored). A released member that is still inside a station circle goes
   * back to the warm list at once rather than waiting for the next sweep.
   */
  releaseRfExpired(nowMs: number): number {
    let released = 0;
    let warmChanged = false;
    for (const [norad, until] of [...this.rfHold_]) {
      if (until > nowMs) continue;
      this.rfHold_.delete(norad);
      if (this.registry_.isHydrated(norad) && this.registry_.release(norad)) {
        released++;
        const idx = this.registry_.memberIndexOf(norad);
        if (idx >= 0 && this.stationMask_[idx] !== 0) {
          this.tier_[idx] = Tier.Warm;
          if (!this.warmNorads_.includes(norad)) {
            this.warmNorads_ = [...this.warmNorads_, norad];
            warmChanged = true;
          }
        } else if (idx >= 0) {
          this.tier_[idx] = Tier.Cold;
        }
      }
    }
    if (warmChanged) {
      this.warmKey_ = this.warmNorads_.join(',');
      this.service_?.setWarm(this.warmNorads_);
    }
    this.released += released;

    return released;
  }

  /** Hot satellites in update order. */
  hot(): readonly Satellite[] {
    return this.candidatesFor();
  }

  private refreshOrder_(): Satellite[] {
    const hydrated = this.registry_.hydrated;
    const authored = this.registry_.authoredCount;
    const members = hydrated.slice(authored).sort((a, b) => a.noradId - b.noradId);
    this.hotOrder_ = hydrated.slice(0, authored).concat(members);
    this.hotRevision_ = this.registry_.revision;
    return this.hotOrder_;
  }

  private onUpdate_(): void {
    const nowMs = this.now_();
    if (this.tiered_) {
      if (nowMs < this.lastNowMs_) {
        // Backward jump (checkpoint restore, new scenario earlier on the calendar)
        this.invalidate();
      }
      this.lastNowMs_ = nowMs;
      // After a jump, grid work waits for the worker's new points (never computed here
      // unless the worker times out); a skip in progress keeps waiting until it ends
      if (this.primed_ || (!this.inSkip_ && this.prime(nowMs))) {
        this.advanceGrid_(nowMs);
      }
    }
    const order = this.candidatesFor();
    for (let i = 0; i < order.length; i++) {
      order[i].update();
    }
  }

  private advanceGrid_(nowMs: number): void {
    const service = this.service_ as PropagationService;
    const second = Math.floor(nowMs / 1000);
    if (second !== this.lastSecond_) {
      this.lastSecond_ = second;
      service.update(nowMs, this.speed_());
    }
    const sweepMs = Math.floor(nowMs / SWEEP_PERIOD_MS) * SWEEP_PERIOD_MS;
    if (sweepMs !== this.lastSweepMs_) {
      this.lastSweepMs_ = sweepMs;
      this.recompute_(sweepMs, nowMs);
    }
  }

  /** Recompute tiers from the sweep at `sweepMs`, keep in-range hydrated members hot, release the idle ones. */
  recompute_(sweepMs: number, nowMs: number): void {
    const service = this.service_ as PropagationService;
    const registry = this.registry_;
    const sweep = service.sweepAt(sweepMs);
    const stations = this.stations_;
    const nStations = stations.length;
    const n = registry.memberCount;
    const rg = stations.map((s) => EARTH_RADIUS_KM + s.altKm);
    const g0Cos = rg.map((r) => r * Math.cos(this.minEl_));
    const marginRad = PROMOTION_MARGIN_DEG * RAD;
    const warm: number[] = [];
    this.recomputes++;

    for (let i = 0; i < n; i++) {
      const p = i * 6;
      const x = sweep.pos[p];
      const y = sweep.pos[p + 1];
      const z = sweep.pos[p + 2];
      const rs = Math.hypot(x, y, z);
      const vs = Math.hypot(sweep.pos[p + 3], sweep.pos[p + 4], sweep.pos[p + 5]);
      const motion = (vs / rs + EARTH_ROTATION_RAD_S) * (SWEEP_PERIOD_MS / 1000);
      const norad = registry.memberNorad(i);
      const hydrated = registry.isHydrated(norad);
      const wasWarm = this.tier_[i] === Tier.Warm;
      let enter = false;
      let keep = false;
      let mask = 0;
      for (let s = 0; s < nStations; s++) {
        const rho = sweep.look[(i * nStations + s) * 2 + 1];
        const cosGamma = Math.max(-1, Math.min(1, (rs * rs + rg[s] * rg[s] - rho * rho) / (2 * rs * rg[s])));
        const gamma = Math.acos(cosGamma);
        const radius = Math.acos(Math.min(1, g0Cos[s] / rs)) - this.minEl_;
        const edgeDeg = (radius + motion + marginRad) / RAD;
        const gammaDeg = gamma / RAD;
        if (classifyWarm(gammaDeg, edgeDeg, false)) {
          enter = true;
          mask |= 1 << s;
        }
        if (classifyWarm(gammaDeg, edgeDeg, wasWarm)) {
          keep = true;
        }
      }
      this.stationMask_[i] = mask;
      if (hydrated) {
        this.tier_[i] = Tier.Hot;
        if (enter) {
          registry.touch(norad, nowMs);
        }
      } else if (keep) {
        this.tier_[i] = Tier.Warm;
        warm.push(norad);
      } else {
        this.tier_[i] = Tier.Cold;
      }
    }

    const key = warm.join(',');
    if (key !== this.warmKey_) {
      this.warmKey_ = key;
      this.warmNorads_ = warm;
      service.setWarm(warm);
    }
    // Hot members only pass through hydrated; release the ones that have been out of range for the TTL
    this.released += registry.sweepCold(nowMs);
    for (let i = 0; i < n; i++) {
      // A released member is now warm or cold by its own geometry; the next sweep settles it
      if (this.tier_[i] === Tier.Hot && !registry.isHydrated(registry.memberNorad(i))) {
        this.tier_[i] = Tier.Cold;
      }
    }
  }
}
