import { Hertz } from "@app/types";
import { Degrees } from "ootk";
import { TapPoint } from "../rf-front-end/coupler-module/tap-points";
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

  /** Smoothed C/N value (exponential moving average) */
  private smoothedCN_: number | null = null;

  /** Smoothing factor for C/N (0-1, lower = more smoothing) */
  private readonly cnSmoothingAlpha_: number = 0.3;

  /** Smoothed power value for step-track decisions */
  private smoothedPower_: number | null = null;

  /** Smoothing factor for power (0-1, lower = more smoothing) */
  private readonly powerSmoothingAlpha_: number = 0.15;

  /** Last smoothed power for comparison */
  private lastSmoothedPower_: number | null = null;

  /** Counter for confirming degradation before reversing */
  private confirmationCount_: number = 0;

  /** Required confirmations before direction reversal */
  private readonly confirmationsRequired_: number = 2;

  /** Number of consecutive improvements in current direction */
  private consecutiveImprovements_: number = 0;

  /** Number of consecutive degradations (for convergence detection) */
  private consecutiveDegradations_: number = 0;

  /** Power improvement threshold in dB to consider "improved" */
  private readonly improvementThreshold_: number = 0.2;

  /** Update counter for rate limiting */
  private updateCounter_: number = 0;

  /** Updates between step track adjustments (rate limiting) */
  private readonly updateInterval_: number = 10;

  /** Minimum C/N for beacon to be considered detectable (auto-disable below this) */
  private readonly beaconDetectableCN_: number = 3;

  /** Minimum C/N for step-track algorithm to operate */
  private readonly stepTrackMinCN_: number = 5;

  /** C/N threshold to acquire beacon lock */
  private readonly lockAcquireCN_: number = 6.5;

  /** C/N threshold for stable lock (hysteresis - must exceed this to stay locked) */
  private readonly lockStableCN_: number = 8;

  /** Is step tracking currently active */
  private isActive_: boolean = false;

  /** Startup grace period - skips auto-disable for first N measurement cycles */
  private startupGraceCycles_: number = 0;

  /** Number of grace cycles after start (allows RF chain to initialize) */
  private readonly startupGraceCycleCount_: number = 3;

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
   * Check if step tracking is currently active
   */
  get isActive(): boolean {
    return this.isActive_;
  }

  /**
   * Reset controller state
   */
  private reset_(): void {
    this.stepSize_ = 0.02;
    this.searchAxis_ = 'az';
    this.searchDirection_ = 1;
    this.lastPower_ = null;
    this.smoothedCN_ = null;
    this.smoothedPower_ = null;
    this.lastSmoothedPower_ = null;
    this.confirmationCount_ = 0;
    this.consecutiveImprovements_ = 0;
    this.consecutiveDegradations_ = 0;
    this.updateCounter_ = 0;
    this.startupGraceCycles_ = this.startupGraceCycleCount_;
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

    // Decrement startup grace period counter
    if (this.startupGraceCycles_ > 0) {
      this.startupGraceCycles_--;
    }

    // Get current beacon metrics (power and C/N)
    const { power: currentPower, cn } = this.measureBeaconMetrics_();

    // Update antenna state with beacon metrics
    this.antenna_.state.beaconPower = currentPower;

    // Apply exponential smoothing to C/N for stable display
    if (cn !== null) {
      if (this.smoothedCN_ === null) {
        this.smoothedCN_ = cn;
      } else {
        this.smoothedCN_ = this.cnSmoothingAlpha_ * cn + (1 - this.cnSmoothingAlpha_) * this.smoothedCN_;
      }
      this.antenna_.state.beaconCN = this.smoothedCN_;
    } else {
      this.smoothedCN_ = null;
      this.antenna_.state.beaconCN = null;
    }

    // Apply EMA smoothing to power for stable step-track decisions
    if (currentPower !== null) {
      if (this.smoothedPower_ === null) {
        this.smoothedPower_ = currentPower;
      } else {
        this.smoothedPower_ = this.powerSmoothingAlpha_ * currentPower +
          (1 - this.powerSmoothingAlpha_) * this.smoothedPower_;
      }
    } else {
      this.smoothedPower_ = null;
    }

    // Auto-disable if beacon is not detectable (C/N < 3 dB)
    // Skip during startup grace period to allow RF chain to initialize
    if (this.startupGraceCycles_ === 0 && (cn === null || cn < this.beaconDetectableCN_)) {
      this.antenna_.state.isBeaconLocked = false;
      this.antenna_.state.isLocked = false;
      // Auto-disable step tracking - user must manually restart
      this.stop();
      this.antenna_.state.isAutoTrackEnabled = false;
      this.antenna_.state.isAutoTrackSwitchUp = false;
      return;
    }

    // Check if C/N is sufficient for step-track to operate (5 dB)
    if (cn < this.stepTrackMinCN_) {
      this.antenna_.state.isBeaconLocked = false;
      this.antenna_.state.isLocked = false;

      // If signal is getting weaker, reverse direction before stepping
      if (this.lastPower_ !== null && currentPower !== null && currentPower < this.lastPower_) {
        this.searchDirection_ *= -1;
      }

      // Weak C/N - try slightly larger steps to find better signal
      this.stepSize_ = Math.min(this.stepSize_ * 1.2, this.maxStepSize_);
      this.lastPower_ = currentPower;
      this.executeStep_();
      return;
    }

    // Update lock state with hysteresis
    // Lock acquire: C/N >= 6.5 dB, Lock stable: C/N >= 8 dB
    const wasLocked = this.antenna_.state.isBeaconLocked;
    if (!wasLocked && cn >= this.lockAcquireCN_) {
      // Acquire lock at 6.5 dB
      this.antenna_.state.isBeaconLocked = true;
      this.antenna_.state.isLocked = true;
    } else if (wasLocked && cn < this.lockAcquireCN_) {
      // Lose lock if we drop below acquire threshold
      this.antenna_.state.isBeaconLocked = false;
      this.antenna_.state.isLocked = false;
    }

    // First sample - just record baseline, don't step yet
    if (this.lastSmoothedPower_ === null || this.smoothedPower_ === null) {
      this.lastSmoothedPower_ = this.smoothedPower_;
      this.lastPower_ = currentPower;
      return;
    }

    // Compare smoothed values for decisions (filters out beacon noise)
    const powerDelta = this.smoothedPower_ - this.lastSmoothedPower_;

    if (powerDelta > this.improvementThreshold_) {
      // Power improved - continue in same direction, reset confirmation
      this.consecutiveImprovements_++;
      this.consecutiveDegradations_ = 0;
      this.confirmationCount_ = 0;

      // Potentially increase step size if consistently improving
      if (this.consecutiveImprovements_ >= 5) {
        this.stepSize_ = Math.min(this.stepSize_ * 1.2, this.maxStepSize_);
        this.consecutiveImprovements_ = 0;
      }
    } else if (powerDelta < -this.improvementThreshold_) {
      // Possible degradation - require confirmation before reversing
      this.confirmationCount_++;

      if (this.confirmationCount_ >= this.confirmationsRequired_) {
        // Confirmed degradation - reverse direction and reduce step size
        this.consecutiveDegradations_++;
        this.consecutiveImprovements_ = 0;
        this.confirmationCount_ = 0;

        this.searchDirection_ *= -1;
        this.stepSize_ = Math.max(this.stepSize_ * 0.6, this.minStepSize_);

        // If consistently degrading, switch axis
        if (this.consecutiveDegradations_ >= 3) {
          this.switchAxis_();
          this.consecutiveDegradations_ = 0;
        }
      }
      // If not yet confirmed, don't reverse - wait for more samples
    } else {
      // Power stable - we're at or near the peak, reset confirmation
      this.confirmationCount_ = 0;
      this.lastSmoothedPower_ = this.smoothedPower_;
      this.lastPower_ = currentPower;
      return;
    }

    this.lastSmoothedPower_ = this.smoothedPower_;
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
   * Measure current beacon power and C/N ratio
   * Filters received signals to find beacon within configured frequency range
   * @returns Object with power (dBm) and cn (dB), both null if no signal
   */
  private measureBeaconMetrics_(): { power: number | null; cn: number | null } {
    const state = this.antenna_.state;
    const beaconFreq = this.antenna_.rfFrontEnd.lnbModule.state.loFrequency * 1e6 - state.beaconFrequencyHz;
    const searchBw = state.beaconSearchBwHz;

    // Find signals within beacon search bandwidth (look at the IF signals post LNA)
    const beaconSignals = this.antenna_.rfFrontEnd.filterModule.outputSignals.filter(sig => {
      const freqDiff = Math.abs((sig.frequency as number) - beaconFreq);
      return freqDiff <= searchBw / 2;
    });

    if (beaconSignals.length === 0) {
      return { power: null, cn: null };
    }

    // Get strongest signal power in beacon range
    const strongestPower = beaconSignals.reduce(
      (max, sig) => Math.max(max, sig.power as number),
      -Infinity
    );

    if (strongestPower === -Infinity) {
      return { power: null, cn: null };
    }

    // Calculate C/N ratio using the same method as the Receiver class
    const rfFrontEnd = this.antenna_.rfFrontEnd;
    if (!rfFrontEnd) {
      return { power: strongestPower, cn: null };
    }

    // Get noise floor using TRACKING bandwidth (narrow beacon receiver)
    // NOT the search bandwidth or IF filter bandwidth
    // C/N is gain-independent: both signal and noise experience the same gain
    const trackingBw = state.beaconTrackingBwHz; // 25 kHz default
    const { noiseFloorNoGain } =
      rfFrontEnd.couplerModule.signalPathManager.getNoiseFloorAt(
        TapPoint.RX_IF,
        trackingBw as Hertz
      );

    // C/N = Signal Power - Noise Floor (both in pre-gain reference frame)
    const cn = strongestPower - noiseFloorNoGain;

    return { power: strongestPower, cn };
  }

  /**
   * Check if the current C/N indicates a stable lock (>= 8 dB)
   */
  isLockStable(): boolean {
    const cn = this.antenna_.state.beaconCN;
    return cn !== null && cn >= this.lockStableCN_;
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
    smoothedPower: number | null;
    confirmationCount: number;
    isLocked: boolean;
    isLockStable: boolean;
  } {
    return {
      isActive: this.isActive_,
      stepSize: this.stepSize_,
      searchAxis: this.searchAxis_,
      searchDirection: this.searchDirection_,
      lastPower: this.lastPower_,
      smoothedPower: this.smoothedPower_,
      confirmationCount: this.confirmationCount_,
      isLocked: this.antenna_.state.isBeaconLocked,
      isLockStable: this.isLockStable(),
    };
  }
}
