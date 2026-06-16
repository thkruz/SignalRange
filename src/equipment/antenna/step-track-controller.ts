import { Hertz } from "@app/types";
import { Degrees } from "ootk";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { TapPoint } from "@app/equipment/rf-front-end/coupler-module/tap-points";
import { AntennaCore } from "./antenna-core";

/**
 * Step Track Controller - Timer-Based Convergence
 *
 * Gradually moves step-track offsets from (0,0) to the negative of the
 * satellite's ephemeris error over a configurable time period (~20-30 seconds).
 *
 * This simulates the step-track algorithm "finding" the beacon peak by
 * correcting for TLE prediction errors.
 */
export class StepTrackController {
  private readonly antenna_: AntennaCore;

  /** Is step tracking currently active */
  private isActive_: boolean = false;

  /** Update counter for rate limiting beacon measurements */
  private updateCounter_: number = 0;

  /** Updates between beacon measurements (~1 second at 60fps) */
  private readonly updateInterval_: number = 60;

  /** C/N threshold to acquire beacon lock */
  private readonly lockThreshold_: number = 6.5;

  /** C/N threshold below which beacon is not detectable */
  private readonly beaconDetectableCN_: number = 3;

  /** Time when step-track was started (ms) */
  private startTime_: number = 0;

  /** Duration to converge to target offset (ms) */
  private readonly convergenceDuration_: number = 25000; // 25 seconds

  /** Target offset in azimuth (negative of ephemeris error) */
  private targetAzOffset_: number = 0;

  /** Target offset in elevation (negative of ephemeris error) */
  private targetElOffset_: number = 0;

  /** Whether convergence is complete */
  private isConverged_: boolean = false;

  constructor(antenna: AntennaCore) {
    this.antenna_ = antenna;
  }

  /**
   * Start step tracking
   */
  start(): void {
    this.isActive_ = true;
    this.isConverged_ = false;
    this.startTime_ = Date.now();
    this.updateCounter_ = 0;

    // Get target satellite's ephemeris error
    const satId = this.antenna_.state.targetSatelliteId;
    if (satId !== null) {
      const sat = SimulationManager.getInstance().getSatByNoradId(satId);
      if (sat) {
        // Target offset is negative of ephemeris error (corrects the TLE inaccuracy)
        this.targetAzOffset_ = -(sat.ephemerisErrorAz as number);
        this.targetElOffset_ = -(sat.ephemerisErrorEl as number);
      }
    }
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
   * Check if the algorithm has converged
   */
  get isConverged(): boolean {
    return this.isConverged_;
  }

  /**
   * Called on each simulation update
   */
  update(): void {
    if (!this.isActive_) {
      return;
    }

    // Update offsets based on elapsed time (smooth interpolation)
    this.updateOffsets_();

    // Rate limit beacon measurements (~1 per second at 60fps)
    this.updateCounter_++;
    if (this.updateCounter_ < this.updateInterval_) {
      return;
    }
    this.updateCounter_ = 0;

    // Measure and update beacon metrics
    const { power, cn } = this.measureBeaconMetrics_();

    this.antenna_.state.beaconPower = power;
    this.antenna_.state.beaconCN = cn;

    // Update lock state based on C/N threshold
    this.antenna_.state.isBeaconLocked = cn !== null && cn >= this.lockThreshold_;
    this.antenna_.state.isLocked = this.antenna_.state.isBeaconLocked;

    // Auto-disable if beacon is not detectable
    if (cn === null || cn < this.beaconDetectableCN_) {
      this.antenna_.state.isBeaconLocked = false;
      this.antenna_.state.isLocked = false;
      this.stop();
      this.antenna_.state.isAutoTrackEnabled = false;
      this.antenna_.state.isAutoTrackSwitchUp = false;
    }
  }

  /**
   * Update step-track offsets using smooth interpolation
   */
  private updateOffsets_(): void {
    const elapsed = Date.now() - this.startTime_;
    const progress = Math.min(1, elapsed / this.convergenceDuration_);

    // Use easeOutQuad for natural deceleration as it approaches target
    const eased = 1 - (1 - progress) * (1 - progress);

    // Interpolate from 0 to target
    const azOffset = this.targetAzOffset_ * eased;
    const elOffset = this.targetElOffset_ * eased;

    this.antenna_.state.stepTrackAzOffset = azOffset as Degrees;
    this.antenna_.state.stepTrackElOffset = elOffset as Degrees;

    // Mark as converged when we reach 100%
    if (progress >= 1) {
      this.isConverged_ = true;
    }
  }

  /**
   * Measure current beacon power and C/N ratio
   */
  private measureBeaconMetrics_(): { power: number | null; cn: number | null } {
    const state = this.antenna_.state;
    const beaconFreq = this.antenna_.rfFrontEnd.lnbModule.state.loFrequency * 1e6 - state.beaconFrequencyHz;
    const searchBw = state.beaconSearchBwHz;

    const beaconSignals = this.antenna_.rfFrontEnd.agcModule.outputSignals.filter(sig => {
      const freqDiff = Math.abs((sig.frequency as number) - beaconFreq);
      return freqDiff <= searchBw / 2;
    });

    if (beaconSignals.length === 0) {
      return { power: null, cn: null };
    }

    const strongestPower = beaconSignals.reduce(
      (max, sig) => Math.max(max, sig.power as number),
      -Infinity
    );

    if (strongestPower === -Infinity) {
      return { power: null, cn: null };
    }

    const rfFrontEnd = this.antenna_.rfFrontEnd;
    if (!rfFrontEnd) {
      return { power: strongestPower, cn: null };
    }

    const trackingBw = state.beaconTrackingBwHz;
    const { noiseFloorNoGain } =
      rfFrontEnd.couplerModule.signalPathManager.getNoiseFloorAt(
        TapPoint.RX_IF,
        trackingBw as Hertz
      );

    const cn = strongestPower - noiseFloorNoGain;

    return { power: strongestPower, cn };
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
    targetAzOffset: number;
    targetElOffset: number;
    progress: number;
    isLocked: boolean;
    isLockStable: boolean;
  } {
    const elapsed = Date.now() - this.startTime_;
    const progress = this.isActive_ ? Math.min(1, elapsed / this.convergenceDuration_) : 0;

    return {
      isActive: this.isActive_,
      isConverged: this.isConverged_,
      targetAzOffset: this.targetAzOffset_,
      targetElOffset: this.targetElOffset_,
      progress,
      isLocked: this.antenna_.state.isBeaconLocked,
      isLockStable: this.isLockStable(),
    };
  }
}
