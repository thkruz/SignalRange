/**
 * A unit's temperature log and its trend (nats-s13-F1).
 *
 * Samples a reading every `sampleIntervalS` of SimClock run time and keeps
 * `windowS` of them, the way a station's monitor-and-control system logs a
 * BUC's case temperature. The trend is the least-squares slope over the last
 * `trendWindowS`, °C per minute.
 *
 * A unit staged hot by a scenario has a past: `backfill` writes the
 * `windowS` before "now" along a first-order approach to `targetC` with time
 * constant `tauS` (the unit's own thermal model run backwards), so the log
 * shows the curve that got it there instead of starting empty.
 */

export interface ThermalSample {
  /** SimClock run time, ms */
  tMs: number;
  celsius: number;
}

export class ThermalTrendLog {
  private readonly samples_: ThermalSample[] = [];

  constructor(
    readonly sampleIntervalS = 10,
    readonly windowS = 30 * 60,
    readonly trendWindowS = 5 * 60
  ) {}

  /** Record a reading if a sample is due (or the log is empty) */
  record(tMs: number, celsius: number): void {
    const last = this.samples_.at(-1);
    if (last && tMs < last.tMs) {
      // Run time restarted (a new scenario): the old log is someone else's
      this.samples_.length = 0;
    } else if (last && tMs - last.tMs < this.sampleIntervalS * 1000) {
      return;
    }
    this.samples_.push({ tMs, celsius });
    const oldest = tMs - this.windowS * 1000;
    while (this.samples_.length > 0 && this.samples_[0].tMs < oldest) {
      this.samples_.shift();
    }
  }

  /**
   * Replace the log with the `windowS` that led to `celsius` at `nowMs`: a
   * first-order approach to `targetC` with time constant `tauS`, run backwards
   * (T(t) = target + (T_now - target) e^(-t/tau) for t < 0).
   */
  backfill(nowMs: number, celsius: number, targetC: number, tauS: number): void {
    this.samples_.length = 0;
    const steps = Math.floor(this.windowS / this.sampleIntervalS);
    for (let i = steps; i >= 0; i--) {
      const tS = -i * this.sampleIntervalS;
      this.samples_.push({ tMs: nowMs + tS * 1000, celsius: targetC + (celsius - targetC) * Math.exp(-tS / tauS) });
    }
  }

  clear(): void {
    this.samples_.length = 0;
  }

  get samples(): readonly ThermalSample[] {
    return this.samples_;
  }

  /** Reading `minutesAgo` before the latest sample (nearest logged), or null when the log is shorter */
  readingMinutesAgo(minutesAgo: number): number | null {
    const last = this.samples_.at(-1);
    if (!last) return null;
    const target = last.tMs - minutesAgo * 60_000;
    if (this.samples_[0].tMs > target + this.sampleIntervalS * 500) return null;
    let best = this.samples_[0];
    for (const s of this.samples_) {
      if (Math.abs(s.tMs - target) < Math.abs(best.tMs - target)) best = s;
    }
    return best.celsius;
  }

  /** Least-squares slope over the last `trendWindowS`, °C/min; null with fewer than 3 samples */
  trendCPerMin(): number | null {
    const last = this.samples_.at(-1);
    if (!last) return null;
    const from = last.tMs - this.trendWindowS * 1000;
    const window = this.samples_.filter((s) => s.tMs >= from);
    if (window.length < 3) return null;
    const n = window.length;
    const meanT = window.reduce((a, s) => a + s.tMs, 0) / n;
    const meanC = window.reduce((a, s) => a + s.celsius, 0) / n;
    let num = 0;
    let den = 0;
    for (const s of window) {
      num += (s.tMs - meanT) * (s.celsius - meanC);
      den += (s.tMs - meanT) ** 2;
    }

    return den > 0 ? (num / den) * 60_000 : 0;
  }
}
