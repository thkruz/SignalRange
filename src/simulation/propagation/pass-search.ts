/**
 * Pass and visibility searches over a `PropagatorCore` (Phase 3, P3-WP9).
 *
 * Pure and resumable: a job does a slice of work in `run(budgetMs)` and returns
 * true when finished, so the worker handler can interleave it with the 1 s and
 * 60 s grid requests the sim is waiting for. The same code runs in-process when
 * there is no worker (tests), with an unlimited budget.
 *
 * Pass search follows `PassPlannerService.getPasses` (coarse sweep for
 * threshold crossings, bisection to refine, 5 s sampling for the peak) so the
 * two agree to well under a second; it differs only in the elevation model
 * (geodetic-up dot product, as the grid uses, rather than ootk `rae`) and in
 * using the stored element set rather than a satellite's prediction set.
 */
import type { PropagatorCore } from './propagation-core';

export const PASS_STRIDE = 9;
/** Record layout in the result array. */
export const PassField = { Member: 0, Station: 1, Aos: 2, Los: 3, MaxElTime: 4, MaxEl: 5, AosAz: 6, LosAz: 7, MaxElRange: 8 } as const;

export interface PassSearchSpec {
  /** Member indices to search */
  indices: Int32Array;
  /** AOS/LOS elevation per entry of `indices`, deg */
  minEl: Float64Array;
  /** Passes whose peak stays below this are dropped, deg */
  minPeak: number;
  startMs: number;
  horizonMs: number;
  /** Coarse step, ms (default 60 000) */
  stepMs: number;
  /** Per member and station */
  maxPasses: number;
  /** Station indices to search */
  stations: Int32Array;
}

export interface WorkerJob {
  /** Do up to `budgetMs` of work (Infinity runs to the end). Returns true when finished. */
  run(budgetMs: number): boolean;
}

const REFINE_ITERATIONS = 10;
const PEAK_STEP_MS = 5000;
const YIELD_EVERY_STEPS = 24;
const FRAME_CACHE_MAX = 4000;

export class PassSearchJob implements WorkerJob {
  private readonly gen_: Generator<void, void, void>;
  private readonly out_: number[] = [];
  private readonly frames_ = new Map<number, Float64Array>();
  private readonly look_ = new Float64Array(3);

  constructor(
    private readonly core_: PropagatorCore,
    private readonly spec_: PassSearchSpec
  ) {
    this.gen_ = this.search_();
  }

  run(budgetMs: number): boolean {
    const t0 = performance.now();
    do {
      if (this.gen_.next().done) {
        return true;
      }
    } while (performance.now() - t0 < budgetMs);
    return false;
  }

  /** Packed records, `PASS_STRIDE` doubles each, in search order (member, station, time). */
  result(): Float64Array {
    return Float64Array.from(this.out_);
  }

  private framesAt_(ms: number, cache: boolean): Float64Array {
    if (!cache) {
      return this.core_.stationFrames(new Date(ms));
    }
    let f = this.frames_.get(ms);
    if (!f) {
      if (this.frames_.size >= FRAME_CACHE_MAX) {
        this.frames_.clear();
      }
      f = this.core_.stationFrames(new Date(ms));
      this.frames_.set(ms, f);
    }
    return f;
  }

  private el_(member: number, station: number, ms: number, cache: boolean): number {
    this.core_.lookAt(member, station, new Date(ms), this.framesAt_(ms, cache), this.look_);
    return this.look_[0];
  }

  private refine_(member: number, station: number, minEl: number, belowMs: number, aboveMs: number, rising: boolean): number {
    let lo = belowMs;
    let hi = aboveMs;
    for (let i = 0; i < REFINE_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      const isUp = this.el_(member, station, mid, false) > minEl;
      if (isUp === rising) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return Math.round((lo + hi) / 2);
  }

  private *search_(): Generator<void, void, void> {
    const { indices, minEl, minPeak, startMs, horizonMs, stepMs, maxPasses, stations } = this.spec_;
    const endMs = startMs + horizonMs;
    let steps = 0;
    for (let k = 0; k < indices.length; k++) {
      const member = indices[k];
      const lim = minEl[k];
      for (let si = 0; si < stations.length; si++) {
        const station = stations[si];
        let kept = 0;
        let prevMs = startMs;
        let prevUp = this.el_(member, station, startMs, true) > lim;
        let aosMs: number | null = prevUp ? startMs : null;
        for (let t = startMs + stepMs; t <= endMs && kept < maxPasses; t += stepMs) {
          const up = this.el_(member, station, t, true) > lim;
          if (up && !prevUp) {
            aosMs = this.refine_(member, station, lim, prevMs, t, true);
          } else if (!up && prevUp && aosMs !== null) {
            const losMs = this.refine_(member, station, lim, prevMs, t, false);
            if (this.record_(member, station, aosMs, losMs, minPeak)) {
              kept++;
            }
            aosMs = null;
          }
          prevUp = up;
          prevMs = t;
          if (++steps % YIELD_EVERY_STEPS === 0) {
            yield;
          }
        }
      }
    }
  }

  private record_(member: number, station: number, aosMs: number, losMs: number, minPeak: number): boolean {
    const look = this.look_;
    this.core_.lookAt(member, station, new Date(aosMs), this.framesAt_(aosMs, false), look);
    const aosAz = look[1];
    this.core_.lookAt(member, station, new Date(losMs), this.framesAt_(losMs, false), look);
    const losAz = look[1];
    let maxEl = -90;
    let maxElMs = aosMs;
    let maxRange = 0;
    for (let t = aosMs; t <= losMs; t += PEAK_STEP_MS) {
      this.core_.lookAt(member, station, new Date(t), this.framesAt_(t, false), look);
      if (look[0] > maxEl) {
        maxEl = look[0];
        maxElMs = t;
        maxRange = look[2];
      }
    }
    if (maxEl < minPeak) {
      return false;
    }
    this.out_.push(member, station, aosMs, losMs, maxElMs, maxEl, aosAz, losAz, maxRange);
    return true;
  }
}

export interface VisibilitySpec {
  startMs: number;
  stepMs: number;
  count: number;
  /** Horizon, deg */
  minEl: number;
  /** Group (lane) per member index */
  groupOf: Uint16Array;
  groupCount: number;
}

/** Mean motion below this (rev/day) is treated as geostationary: visibility is computed once. */
const STATIC_MEAN_MOTION = 1.2;
const VIS_CHECK_EVERY = 64;

/**
 * Counts, per grid time, lane (group) and station, how many members are above
 * `minEl`. Layout: counts[g * stations + s] for each emitted grid point.
 * Geostationary members are evaluated at the first point only (constant band).
 */
export class VisibilityJob implements WorkerJob {
  private t_ = 0;
  private m_ = 0;
  private counts_: Uint16Array;
  private readonly staticCounts_: Uint16Array;
  private readonly isStatic_: Uint8Array;
  private readonly stations_: number;
  private readonly el_: Float64Array;
  private frames_: Float64Array | null = null;
  private date_ = new Date(0);

  constructor(
    private readonly core_: PropagatorCore,
    private readonly spec_: VisibilitySpec,
    private readonly onPoint_: (index: number, counts: Uint16Array) => void
  ) {
    this.stations_ = core_.stationCount;
    const size = spec_.groupCount * this.stations_;
    this.counts_ = new Uint16Array(size);
    this.staticCounts_ = new Uint16Array(size);
    this.el_ = new Float64Array(Math.max(1, this.stations_));
    this.isStatic_ = new Uint8Array(core_.memberCount);
    for (let i = 0; i < core_.memberCount; i++) {
      this.isStatic_[i] = core_.meanMotionRevPerDay(i) < STATIC_MEAN_MOTION ? 1 : 0;
    }
  }

  run(budgetMs: number): boolean {
    const t0 = performance.now();
    const n = this.core_.memberCount;
    const { count, startMs, stepMs, minEl, groupOf } = this.spec_;
    const stations = this.stations_;
    while (this.t_ < count) {
      if (this.m_ === 0) {
        this.date_ = new Date(startMs + this.t_ * stepMs);
        this.frames_ = this.core_.stationFrames(this.date_);
        this.counts_ = new Uint16Array(this.staticCounts_.length);
        if (this.t_ > 0) {
          this.counts_.set(this.staticCounts_);
        }
      }
      const frames = this.frames_ as Float64Array;
      while (this.m_ < n) {
        const end = Math.min(n, this.m_ + VIS_CHECK_EVERY);
        for (; this.m_ < end; this.m_++) {
          const isStatic = this.isStatic_[this.m_] === 1;
          if (isStatic && this.t_ > 0) {
            continue;
          }
          if (!this.core_.elevations(this.m_, this.date_, frames, this.el_)) {
            continue;
          }
          const base = groupOf[this.m_] * stations;
          for (let s = 0; s < stations; s++) {
            if (this.el_[s] > minEl) {
              this.counts_[base + s]++;
              if (isStatic) {
                this.staticCounts_[base + s]++;
              }
            }
          }
        }
        if (performance.now() - t0 >= budgetMs && this.m_ < n) {
          return false;
        }
      }
      this.onPoint_(this.t_, this.counts_);
      this.t_++;
      this.m_ = 0;
      if (performance.now() - t0 >= budgetMs) {
        return this.t_ >= count;
      }
    }
    return true;
  }
}
