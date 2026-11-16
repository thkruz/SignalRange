/**
 * Coverage screen (PA-WP5c): which of a large set of members are above the
 * horizon, and inside a scan cone, at any of `count` coarse times from one
 * station. Sparse result: only members that clear the cone at least once.
 * Runs in slices (member by member) so the worker keeps answering grid
 * requests. Output: `SCREEN_STRIDE` floats per hit: member index, steps in
 * the cone, steps above the horizon.
 */

import type { WorkerJob } from './pass-search';
import type { PropagatorCore } from './propagation-core';

export const SCREEN_STRIDE = 3;
const D2R = Math.PI / 180;

export interface ScreenSpec {
  indices: Int32Array;
  station: number;
  startMs: number;
  stepMs: number;
  count: number;
  /** Cone axis as a unit (east, north, up) vector */
  normal: [number, number, number];
  /** cos of the cone half angle; -1 accepts every direction above the horizon */
  cosMaxScan: number;
}

export class ScreenJob implements WorkerJob {
  private readonly out_: number[] = [];
  private readonly look_ = new Float64Array(3);
  private readonly dates_: Date[] = [];
  private readonly frames_: Float64Array[] = [];
  private next_ = 0;

  constructor(
    private readonly core_: PropagatorCore,
    private readonly spec_: ScreenSpec
  ) {
    for (let i = 0; i < spec_.count; i++) {
      const d = new Date(spec_.startMs + i * spec_.stepMs);

      this.dates_.push(d);
      this.frames_.push(core_.stationFrames(d).slice());
    }
  }

  run(budgetMs: number): boolean {
    const { indices, station, count, normal, cosMaxScan } = this.spec_;
    const t0 = performance.now();

    while (this.next_ < indices.length) {
      const m = indices[this.next_++];
      let inCone = 0;
      let above = 0;

      for (let i = 0; i < count; i++) {
        if (!this.core_.lookAt(m, station, this.dates_[i], this.frames_[i], this.look_)) {
          continue;
        }
        const el = this.look_[0];

        if (el <= 0) {
          continue;
        }
        above++;
        const az = this.look_[1] * D2R;
        const ce = Math.cos(el * D2R);
        const dot = Math.sin(az) * ce * normal[0] + Math.cos(az) * ce * normal[1] + Math.sin(el * D2R) * normal[2];

        if (dot >= cosMaxScan) {
          inCone++;
        }
      }
      if (inCone > 0) {
        this.out_.push(m, inCone, above);
      }
      if ((this.next_ & 15) === 0 && performance.now() - t0 >= budgetMs) {
        break;
      }
    }

    return this.next_ >= indices.length;
  }

  result(): Float32Array {
    return Float32Array.from(this.out_);
  }
}
