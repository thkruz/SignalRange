import { Degrees } from "ootk";
import { AntennaCore } from "./antenna-core";

/**
 * Step Track Controller
 *
 * Implements a hill-climbing algorithm to maximize beacon signal power.
 * The controller alternates between azimuth and elevation axes,
 * making small adjustments and tracking power improvement.
 *
 * Algorithm:
 * 1. Sample current beacon power
 * 2. Make small step in current search direction
 * 3. Sample new power
 * 4. If improved: continue direction
 * 5. If degraded: reverse direction, reduce step size
 * 6. Cycle between azimuth and elevation axes
 * 7. Converge when step size reaches minimum threshold
 *
 * TODO: Add spiral scan algorithm option for weak signal acquisition
 */
export class StepTrackController {
  private readonly antenna_: AntennaCore;

  /** Current step size in degrees */
  private stepSize_: number = 0.02;

  /** Minimum step size before convergence */
  private readonly minStepSize_: number = 0.005;

  /** Maximum step size */
  private readonly maxStepSize_: number = 0.2;

  /** Current search axis */
  private searchAxis_: 'az' | 'el' = 'az';

  /** Current search direction (1 = positive, -1 = negative) */
  private searchDirection_: 1 | -1 = 1;

  /** Previous beacon power sample for comparison */
  private lastPower_: number | null = null;

  /** Number of consecutive improvements in current direction */
  private consecutiveImprovements_: number = 0;

  /** Number of consecutive degradations (for convergence detection) */
  private consecutiveDegradations_: number = 0;

  /** Power improvement threshold in dB to consider "improved" */
  private readonly improvementThreshold_: number = 0.1;

  /** Update counter for rate limiting */
  private updateCounter_: number = 0;

  /** Updates between step track adjustments (rate limiting) */
  private readonly updateInterval_: number = 10;

  /** Lock threshold in dBm */
  private readonly lockThreshold_: number = -110;

  /** Is step tracking currently active */
  private isActive_: boolean = false;

  constructor(antenna: AntennaCore) {
    this.antenna_ = antenna;
  }

  /**
   * Start step tracking
   */
  start(): void {
    this.isActive_ = true;
    this.reset_();
  }

  /**
   * Stop step tracking
   */
  stop(): void {
    this.isActive_ = false;
  }

  /**
   * Reset controller state
   */
  private reset_(): void {
    this.stepSize_ = 0.02;
    this.searchAxis_ = 'az';
    this.searchDirection_ = 1;
    this.lastPower_ = null;
    this.consecutiveImprovements_ = 0;
    this.consecutiveDegradations_ = 0;
    this.updateCounter_ = 0;
  }

  /**
   * Called on each simulation update
   * Performs one step of the hill-climbing algorithm if active
   */
  update(): void {
    if (!this.isActive_) {
      return;
    }

    // Rate limit updates
    this.updateCounter_++;
    if (this.updateCounter_ < this.updateInterval_) {
      return;
    }
    this.updateCounter_ = 0;

    // Get current beacon power
    const currentPower = this.measureBeaconPower_();

    // Update antenna state with beacon power
    this.antenna_.state.beaconPower = currentPower;

    // Check if we have a signal
    if (currentPower === null || currentPower < this.lockThreshold_) {
      this.antenna_.state.isBeaconLocked = false;

      // If signal is getting weaker, reverse direction before stepping
      if (this.lastPower_ !== null && currentPower !== null && currentPower < this.lastPower_) {
        this.searchDirection_ *= -1;
      }

      // No signal or weak signal - try slightly larger steps
      this.stepSize_ = Math.min(this.stepSize_ * 1.2, this.maxStepSize_);
      this.lastPower_ = currentPower;
      this.executeStep_();
      return;
    }

    // First sample - just record baseline, don't step yet
    if (this.lastPower_ === null) {
      this.lastPower_ = currentPower;
      return;
    }

    // Compare with last power
    const powerDelta = currentPower - this.lastPower_;

    if (powerDelta > this.improvementThreshold_) {
      // Power improved - continue in same direction
      this.consecutiveImprovements_++;
      this.consecutiveDegradations_ = 0;

      // If consistently improving, we're locked
      if (this.consecutiveImprovements_ >= 3) {
        this.antenna_.state.isBeaconLocked = true;
      }

      // Potentially increase step size if consistently improving
      if (this.consecutiveImprovements_ >= 5) {
        this.stepSize_ = Math.min(this.stepSize_ * 1.2, this.maxStepSize_);
        this.consecutiveImprovements_ = 0;
      }
    } else if (powerDelta < -this.improvementThreshold_) {
      // Power degraded - reverse direction and reduce step size
      this.consecutiveDegradations_++;
      this.consecutiveImprovements_ = 0;

      this.searchDirection_ *= -1;
      this.stepSize_ = Math.max(this.stepSize_ * 0.7, this.minStepSize_);

      // If consistently degrading, switch axis
      if (this.consecutiveDegradations_ >= 3) {
        this.switchAxis_();
        this.consecutiveDegradations_ = 0;
      }
    } else {
      // Power stable - we're at or near the peak
      this.antenna_.state.isBeaconLocked = true;
      // Hold position, don't step - only resume if signal degrades
      this.lastPower_ = currentPower;
      return;
    }

    this.lastPower_ = currentPower;
    this.executeStep_();
  }

  /**
   * Execute one step in the current direction
   * Sets target position - actual position will slew in update loop
   */
  private executeStep_(): void {
    const delta = this.stepSize_ * this.searchDirection_;

    if (this.searchAxis_ === 'az') {
      const newAz = this.antenna_.state.targetAzimuth + delta;
      this.antenna_.state.targetAzimuth = newAz as Degrees;
    } else {
      // Clamp elevation between 0 and 90
      const newEl = Math.max(0, Math.min(90, this.antenna_.state.targetElevation + delta));
      this.antenna_.state.targetElevation = newEl as Degrees;
    }
  }

  /**
   * Switch search axis between azimuth and elevation
   */
  private switchAxis_(): void {
    this.searchAxis_ = this.searchAxis_ === 'az' ? 'el' : 'az';
    this.searchDirection_ = 1; // Reset direction on axis switch
  }

  /**
   * Measure current beacon power
   * Filters received signals to find beacon within configured frequency range
   */
  private measureBeaconPower_(): number | null {
    const state = this.antenna_.state;
    const beaconFreq = state.beaconFrequencyHz;
    const searchBw = state.beaconSearchBwHz;

    // Find signals within beacon search bandwidth
    const beaconSignals = state.rxSignalsIn.filter(sig => {
      const freqDiff = Math.abs((sig.frequency as number) - beaconFreq);
      return freqDiff <= searchBw / 2;
    });

    if (beaconSignals.length === 0) {
      return null;
    }

    // Return strongest signal power in beacon range
    const strongestPower = beaconSignals.reduce(
      (max, sig) => Math.max(max, sig.power as number),
      -Infinity
    );

    return strongestPower === -Infinity ? null : strongestPower;
  }

  /**
   * Get current controller state for debugging/display
   */
  getState(): {
    isActive: boolean;
    stepSize: number;
    searchAxis: 'az' | 'el';
    searchDirection: 1 | -1;
    lastPower: number | null;
    isLocked: boolean;
  } {
    return {
      isActive: this.isActive_,
      stepSize: this.stepSize_,
      searchAxis: this.searchAxis_,
      searchDirection: this.searchDirection_,
      lastPower: this.lastPower_,
      isLocked: this.antenna_.state.isBeaconLocked,
    };
  }
}
