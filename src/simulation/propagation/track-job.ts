/**
 * Look-angle grid job (PA-WP5b): elevation and azimuth of a set of members from
 * one station at evenly spaced times. Runs in slices so the worker keeps
 * answering grid requests. Output layout: `data[(k * count + i) * 2]` = el,
 * `+ 1` = az for member k at time i; NaN when propagation failed.
 */

import type { WorkerJob } from './pass-search';
import type { PropagatorCore } from './propagation-core';

export interface TrackSpec {
  indices: Int32Array;
  station: number;
  startMs: number;
  stepMs: number;
  count: number;
}

export class TrackJob implements WorkerJob {
  private readonly data_: Float32Array;
  private readonly look_ = new Float64Array(3);
  private step_ = 0;

  constructor(
    private readonly core_: PropagatorCore,
    private readonly spec_: TrackSpec
  ) {
    this.data_ = new Float32Array(spec_.indices.length * spec_.count * 2).fill(Number.NaN);
  }

  /** Runs whole time steps until the budget (ms) is spent. Returns true when finished. */
  run(budgetMs: number): boolean {
    const { indices, station, startMs, stepMs, count } = this.spec_;
    const t0 = performance.now();

    while (this.step_ < count) {
      const i = this.step_;
      const date = new Date(startMs + i * stepMs);
      const frames = this.core_.stationFrames(date);

      for (let k = 0; k < indices.length; k++) {
        if (this.core_.lookAt(indices[k], station, date, frames, this.look_)) {
          this.data_[(k * count + i) * 2] = this.look_[0];
          this.data_[(k * count + i) * 2 + 1] = this.look_[1];
        }
      }
      this.step_++;
      if (performance.now() - t0 >= budgetMs) {
        break;
      }
    }

    return this.step_ >= count;
  }

  result(): Float32Array {
    return this.data_;
  }
}
