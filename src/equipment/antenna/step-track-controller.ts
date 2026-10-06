import { SimClock } from '@app/simulation/sim-clock';
import { Degrees } from 'ootk';
import { AntennaCore } from './antenna-core';

/** One axis of the hill-climb */
type Axis = 'az' | 'el';

/** Where the controller is in its probe cycle */
type Phase = 'center' | 'plus' | 'minus';

/**
 * Step Track Controller - a dither hill-climb on the measured beacon (phase 19.4).
 *
 * Step-track adds az/el offsets on top of program-track and climbs the beacon:
 * on one axis at a time it measures the beacon C/N where it is, steps the
 * offset by +/-0.1 beamwidth (cross-elevation, so the azimuth step is divided
 * by cos el), measures again, and keeps the step that reads higher. Each
 * measurement waits for the pedestal to arrive and settle, then averages the
 * beacon receiver's C/N over a dwell, all on SimClock run time, so finding the
 * peak takes the real seconds the steps cost (servo travel, settle, dwell).
 * When neither direction improves on either axis the controller is converged
 * and keeps dithering, so it follows a drifting satellite.
 *
 * It reads the antenna's own beacon receiver (`measureBeaconMetrics`), which
 * knows nothing of the satellite's ephemeris error: the peak it finds is where
 * the beacon is. (Before phase 19.4 it eased the offsets toward the known
 * ephemeris error over 25 s, DEV-ANT-05.)
 */
export class StepTrackController {
  private readonly antenna_: AntennaCore;

  /** Is step tracking currently active */
  private isActive_: boolean = false;

  /** C/N threshold to acquire beacon lock, dB (tracking bandwidth) */
  private readonly lockThreshold_: number = 6.5;

  /** C/N below which the beacon is not trackable: the loop gives up, dB */
  private readonly beaconDetectableCN_: number = 3;

  /** Step size as a fraction of the -3 dB beamwidth */
  static readonly STEP_FRACTION = 0.1;

  /** Time the pedestal is given to settle after arriving at a step, ms */
  static readonly SETTLE_MS = 500;

  /** Beacon integration time per measurement, ms */
  static readonly DWELL_MS = 1000;

  /** A step must beat the centre by this much to be taken, dB (measurement hysteresis) */
  static readonly HYSTERESIS_DB = 0.02;

  /** Arrival tolerance as a fraction of the step */
  private static readonly ARRIVAL_FRACTION = 0.1;

  /** Current axis and probe phase */
  private axis_: Axis = 'az';
  private phase_: Phase = 'center';
  /** Offset (deg) the climb currently holds on each axis, without the probe */
  private held_ = { az: 0, el: 0 };
  /** Direction that last improved each axis: probed first next time */
  private lastDir_ = { az: 1, el: 1 };
  /** Centre reading for the current axis cycle, dB */
  private centerCn_: number | null = null;
  /** The direction being probed (+1 / -1) */
  private probeDir_ = 1;
  /** Probes taken this cycle */
  private probesThisCycle_ = 0;

  /** Run time the current measurement's dwell started (null: still slewing/settling) */
  private dwellStartMs_: number | null = null;
  /** Run time the pedestal arrived at the current step (null: not yet) */
  private arrivedAtMs_: number | null = null;
  /** Linear C/N accumulator for the current dwell */
  private sumLinear_ = 0;
  private samples_ = 0;
  /** A sample without a beacon in the window */
  private sawNoBeacon_ = false;

  /** Consecutive axis cycles that found no better step */
  private quietCycles_ = 0;

  /** Whether convergence is complete */
  private isConverged_: boolean = false;

  /** Run time step-track was started (ms) */
  private startTime_: number = 0;

  /** Run time convergence was first reached (ms), null until then */
  private convergedAtMs_: number | null = null;

  /** Last averaged beacon C/N the loop measured, dB */
  private lastMeasuredCn_: number | null = null;

  constructor(antenna: AntennaCore) {
    this.antenna_ = antenna;
  }

  /**
   * Start step tracking from the antenna's current offsets
   */
  start(): void {
    this.isActive_ = true;
    this.isConverged_ = false;
    this.convergedAtMs_ = null;
    this.startTime_ = SimClock.runMs();
    this.held_ = { az: this.antenna_.state.stepTrackAzOffset as number, el: this.antenna_.state.stepTrackElOffset as number };
    this.axis_ = 'az';
    this.quietCycles_ = 0;
    this.lastMeasuredCn_ = null;
    this.beginCycle_();
  }

  /**
   * Stop step tracking
   */
  stop(): void {
    this.isActive_ = false;
  }

  /**
   * Check if step tracking is currently active
   */
  get isActive(): boolean {
    return this.isActive_;
  }

  /**
   * Check if the algorithm has converged (a full pass over both axes found no better step)
   */
  get isConverged(): boolean {
    return this.isConverged_;
  }

  /** Step size on an axis, degrees of that axis (azimuth steps are cross-elevation) */
  stepDeg(axis: Axis): number {
    const step = this.antenna_.beamwidthAtTrackingDeg() * StepTrackController.STEP_FRACTION;
    if (axis === 'el') {
      return step;
    }
    const cosEl = Math.cos((Math.min(85, Math.max(0, this.antenna_.state.elevation as number)) * Math.PI) / 180);
    return step / cosEl;
  }

  /**
   * Called on each simulation update
   */
  update(): void {
    if (!this.isActive_) {
      return;
    }

    const now = SimClock.runMs();
    const step = this.stepDeg(this.axis_);

    // Wait for the pedestal to arrive at the commanded offset, then settle
    if (this.arrivedAtMs_ === null) {
      if (this.hasArrived_(step)) {
        this.arrivedAtMs_ = now;
      }
      return;
    }
    if (this.dwellStartMs_ === null) {
      if (now - this.arrivedAtMs_ < StepTrackController.SETTLE_MS) {
        return;
      }
      this.dwellStartMs_ = now;
      this.sumLinear_ = 0;
      this.samples_ = 0;
      this.sawNoBeacon_ = false;
    }

    // Integrate the beacon receiver over the dwell
    const { cn } = this.antenna_.measureBeaconMetrics();
    if (cn === null) {
      this.sawNoBeacon_ = true;
    } else {
      this.sumLinear_ += 10 ** (cn / 10);
      this.samples_++;
    }
    if (now - this.dwellStartMs_ < StepTrackController.DWELL_MS) {
      return;
    }

    const measured = this.samples_ > 0 && !this.sawNoBeacon_ ? 10 * Math.log10(this.sumLinear_ / this.samples_) : null;
    this.lastMeasuredCn_ = measured;
    this.onMeasurement_(measured);
  }

  /** The pedestal is within a tenth of a step of the commanded position on both axes */
  private hasArrived_(step: number): boolean {
    const state = this.antenna_.state;
    const tolerance = step * StepTrackController.ARRIVAL_FRACTION;
    return !state.isSlewing || (Math.abs(state.targetAzimuth - state.azimuth) <= tolerance && Math.abs(state.targetElevation - state.elevation) <= tolerance);
  }

  /** A measurement finished: update the lock, then advance the probe cycle */
  private onMeasurement_(cn: number | null): void {
    const state = this.antenna_.state;

    if (this.phase_ === 'center') {
      // The centre reading is where the climb holds: it drives the lock and
      // decides whether there is a beacon to track at all
      state.isBeaconLocked = cn !== null && cn >= this.lockThreshold_;
      state.isLocked = state.isBeaconLocked;

      if (cn === null || cn < this.beaconDetectableCN_) {
        state.isBeaconLocked = false;
        state.isLocked = false;
        this.stop();
        state.isAutoTrackEnabled = false;
        state.isAutoTrackSwitchUp = false;
        return;
      }

      this.centerCn_ = cn;
      this.probeDir_ = this.lastDir_[this.axis_];
      this.probesThisCycle_ = 0;
      this.goProbe_();
      return;
    }

    // A probe: take it if it beats the centre
    const center = this.centerCn_ ?? -Infinity;
    if (cn !== null && cn > center + StepTrackController.HYSTERESIS_DB) {
      this.held_[this.axis_] += this.probeDir_ * this.stepDeg(this.axis_);
      this.lastDir_[this.axis_] = this.probeDir_;
      this.quietCycles_ = 0;
      this.nextAxis_();
      return;
    }

    if (this.probesThisCycle_ < 2) {
      // Try the other side
      this.probeDir_ = -this.probeDir_;
      this.goProbe_();
      return;
    }

    // Neither side was better: this axis is at the peak for now
    this.quietCycles_++;
    if (this.quietCycles_ >= 2 && !this.isConverged_) {
      this.isConverged_ = true;
      this.convergedAtMs_ = SimClock.runMs();
    }
    this.nextAxis_();
  }

  /** Command the probe offset on the current axis */
  private goProbe_(): void {
    this.probesThisCycle_++;
    this.phase_ = this.probeDir_ > 0 ? 'plus' : 'minus';
    const probe = { ...this.held_ };
    probe[this.axis_] += this.probeDir_ * this.stepDeg(this.axis_);
    this.command_(probe);
  }

  /** Move to the other axis and start its cycle at the held position */
  private nextAxis_(): void {
    this.axis_ = this.axis_ === 'az' ? 'el' : 'az';
    this.beginCycle_();
  }

  private beginCycle_(): void {
    this.phase_ = 'center';
    this.centerCn_ = null;
    this.command_(this.held_);
  }

  /** Command offsets and restart the arrive/settle/dwell sequence */
  private command_(offset: { az: number; el: number }): void {
    const state = this.antenna_.state;
    const moved = Math.abs((state.stepTrackAzOffset as number) - offset.az) > 1e-9 || Math.abs((state.stepTrackElOffset as number) - offset.el) > 1e-9;
    state.stepTrackAzOffset = offset.az as Degrees;
    state.stepTrackElOffset = offset.el as Degrees;
    // An unchanged command needs no travel: arrive now, settle as usual
    this.arrivedAtMs_ = moved ? null : SimClock.runMs();
    this.dwellStartMs_ = null;
  }

  /**
   * Check if the current C/N indicates a stable lock (>= 8 dB)
   */
  isLockStable(): boolean {
    const cn = this.antenna_.state.beaconCN;
    return cn !== null && cn >= 8;
  }

  /**
   * Get current controller state for debugging/display
   */
  getState(): {
    isActive: boolean;
    isConverged: boolean;
    axis: Axis;
    phase: Phase;
    heldAzOffset: number;
    heldElOffset: number;
    lastMeasuredCn: number | null;
    elapsedMs: number;
    convergedAfterMs: number | null;
    isLocked: boolean;
    isLockStable: boolean;
  } {
    return {
      isActive: this.isActive_,
      isConverged: this.isConverged_,
      axis: this.axis_,
      phase: this.phase_,
      heldAzOffset: this.held_.az,
      heldElOffset: this.held_.el,
      lastMeasuredCn: this.lastMeasuredCn_,
      elapsedMs: this.isActive_ ? SimClock.runMs() - this.startTime_ : 0,
      convergedAfterMs: this.convergedAtMs_ === null ? null : this.convergedAtMs_ - this.startTime_,
      isLocked: this.antenna_.state.isBeaconLocked,
      isLockStable: this.isLockStable(),
    };
  }
}
