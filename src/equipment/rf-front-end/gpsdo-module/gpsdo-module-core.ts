import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { RFFrontEndModule } from '@app/equipment/rf-front-end/rf-front-end-module';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { clamp } from 'ootk';
import { defaultGpsdoState, GPSDOState } from './gpsdo-state';
import { ReferenceDisturbances } from './reference-disturbance';

/**
 * Reference-chain constants (Phase 19.6; class values for a GPS-disciplined
 * double-oven OCXO such as the SRS FS752's, DEV-RF-06).
 */
const OCXO = {
  /** Fractional frequency error while disciplined (24 h average spec, ±) */
  lockedAccuracy: 2e-12,
  /** Allan deviation at τ = 1 s (the oscillator's own short-term stability) */
  allanDeviation1s: 1e-11,
  /** Free-running offset once discipline is lost: 1.67 µs/hour of time error */
  holdoverOffset: 1.67e-6 / 3600,
  /** Phase noise at 10 Hz, dBc/Hz (the OCXO's own, locked or not) */
  phaseNoise10Hz: -127,
  /** UTC (1PPS) accuracy while GNSS-disciplined, ns */
  lockedUtcAccuracyNs: 30,
} as const;

/** Seeded draws for this module (see simulation/rng.ts). */
const random = (): number => Rng.stream('gpsdo').next();

/**
 * GPSDO Module Core - Business Logic Layer
 * Contains oscillator physics, timing algorithms, state management
 * No UI dependencies
 */
export abstract class GPSDOModuleCore extends RFFrontEndModule<GPSDOState> {
  // GPSDO characteristics
  protected warmupInterval_: number | null = null;
  protected stabilityInterval_: number | null = null;
  protected holdoverInterval_: number | null = null;
  /** Scenario-staged GNSS outage (signal absent regardless of the switch) */
  private gnssOutage_ = false;

  /** Stability ticks (5 s each) between satellite-count changes: one change a minute at most */
  private static readonly SV_DRIFT_TICKS = 12;
  /** Fallback tracked-satellite count when the config gives none */
  private static readonly DEFAULT_NOMINAL_SV_COUNT = 9;
  /**
   * Satellites this station's sky view normally tracks. The live count drifts
   * at most one either side of it, so the Dashboard, the GPS tab and a brief
   * read the same number within a minute (s01-F7); a random walk across 4-12
   * and a fresh 4-12 draw on every reacquire made them disagree.
   */
  private readonly nominalSvCount_: number;
  private svDriftTicks_ = 0;

  constructor(state: GPSDOState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super({ ...defaultGpsdoState, ...state }, rfFrontEnd, 'rf-fe-gpsdo', unit);

    this.nominalSvCount_ = GPSDOModuleCore.resolveNominalSvCount_(this.state);

    // Initialize intervals if needed
    if (this.state.isPowered && this.state.warmupTimeRemaining === 0 && !this.state.isLocked) {
      this.startHoldoverMonitor_();
    }
    if (this.state.isPowered && this.state.warmupTimeRemaining > 0) {
      this.startWarmupTimer_();
    }
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Update lock status
    this.updateLockStatus_();

    // Update signal quality parameters
    this.updateSignalQuality_();

    // Update thermal state
    this.updateThermalState_();
  }

  /**
   * Update lock status based on power, warmup, and GNSS availability
   */
  private updateLockStatus_(): void {
    const canLock = this.state.isPowered && this.state.isGnssSwitchUp && this.state.warmupTimeRemaining === 0;

    if (canLock) {
      if (!this.state.isLocked && this.state.gnssSignalPresent) {
        // Achieve lock
        this.achieveLock_();
      }
    } else {
      this.state.isLocked = false;
      this.state.lockDuration = 0;
    }
  }

  /**
   * The reference's condition (Phase 19.6): disciplined to GNSS, coasting in
   * holdover, free-running (warm-up, or never locked), or off.
   */
  referenceCondition(): 'locked' | 'holdover' | 'free-run' | 'off' {
    if (!this.state.isPowered) return 'off';
    if (this.state.warmupTimeRemaining > 0) return 'free-run';
    if (this.state.isInHoldover) return 'holdover';
    if (this.state.isLocked) return 'locked';

    return 'free-run';
  }

  /**
   * Fractional frequency error of the 10 MHz output (dimensionless). Every
   * converter locked to this reference carries it on its LO (Δf = y·f_LO):
   * a few parts in 10^12 disciplined; the OCXO's free-running offset (plus
   * ageing) in holdover; the warm-up error while the oven settles; and, while
   * a spoofer walks the GNSS time and the GPSDO still trusts it, the rate of
   * that walk.
   */
  fractionalFrequencyError(): number {
    switch (this.referenceCondition()) {
      case 'off':
        return 0;
      case 'locked': {
        const spoof = ReferenceDisturbances.forStation(this.rfFrontEnd_.groundStationId);

        return this.unitLockedOffset_ + (spoof?.fractionalFrequencyError ?? 0);
      }
      case 'holdover': {
        const agingPerS = (this.state.agingRate * 1e-6) / (365 * 86400);

        return this.unitHoldoverSign_ * OCXO.holdoverOffset + agingPerS * this.state.holdoverDuration;
      }
      case 'free-run':
      default:
        // During warm-up the displayed accuracy (×10^-11) tracks the oven
        return this.unitHoldoverSign_ * Math.max(OCXO.holdoverOffset, this.state.frequencyAccuracy * 1e-11);
    }
  }

  /** Time (1PPS) error of the reference, µs: the holdover walk plus any spoofed offset */
  timeErrorUs(): number {
    if (!this.state.isPowered) return 0;
    const spoof = ReferenceDisturbances.forStation(this.rfFrontEnd_.groundStationId);

    return (this.state.isInHoldover ? this.state.holdoverError : 0) + (spoof?.timeOffsetUs ?? 0);
  }

  /** This unit's disciplined offset: a fixed draw within ±2×10^-12 */
  private readonly unitLockedOffset_ = (Rng.hashUniform('gpsdo-locked-offset') * 2 - 1) * OCXO.lockedAccuracy;
  /** Sign of this unit's free-running offset */
  private readonly unitHoldoverSign_ = Rng.hashUniform('gpsdo-holdover-sign') < 0.5 ? -1 : 1;

  /**
   * Signal-quality readouts from the reference's condition (Phase 19.6; they
   * used to be fresh random draws every frame). Frequency accuracy and Allan
   * deviation are in parts in 10^11.
   */
  private updateSignalQuality_(): void {
    const condition = this.referenceCondition();
    if (condition === 'off') {
      this.state.phaseNoise = 0;
      this.state.frequencyAccuracy = 999;
      this.state.allanDeviation = 99;
      this.state.utcAccuracy = 0;
      return;
    }
    if (this.state.warmupTimeRemaining > 0) {
      // improveSpecsDuringWarmup_ owns the readouts while the oven settles
      return;
    }

    this.state.frequencyAccuracy = Math.abs(this.fractionalFrequencyError()) * 1e11;
    // σy(1 s) is the OCXO's own short-term stability, disciplined or not
    this.state.allanDeviation = OCXO.allanDeviation1s * 1e11;
    this.state.phaseNoise = OCXO.phaseNoise10Hz;
    this.state.utcAccuracy = condition === 'locked' && this.state.gnssSignalPresent ? OCXO.lockedUtcAccuracyNs + Math.abs(this.timeErrorUs()) * 1000 : 0;
  }

  /**
   * Update thermal state
   */
  private updateThermalState_(): void {
    if (!this.state.isPowered) {
      // Cooling down toward ambient
      const ambientTemp = 25;
      const coolRateInSeconds = 0.0001; // Per second
      // Convert to ms
      const coolRate = 1 - (1 - coolRateInSeconds) ** (1 / 60);
      this.state.temperature += (ambientTemp - this.state.temperature) * coolRate;
      return;
    }

    // OCXO oven-controlled to ~70°C
    const targetTemp = 70;
    const heatRate = 0.00005;
    this.state.temperature += (targetTemp - this.state.temperature) * heatRate;
  }

  /**
   * Reset state when powering on
   */
  private resetToWarmupState_(): void {
    // Double-oven OCXO warmup: ~10 minutes (600 seconds)
    // Each tick increases temp by 0.1C, so estimate remaining ticks
    const targetTemp = 70;
    const estimatedTicks = (targetTemp - this.state.temperature) / 0.1;
    this.state.warmupTimeRemaining = Math.ceil(estimatedTicks);

    this.state.isLocked = false;
    this.state.lockDuration = 0;
    this.state.allanDeviation = 99;
    this.state.phaseNoise = -80;
    this.state.isInHoldover = false;
    this.state.holdoverDuration = 0;
    this.state.holdoverError = 0;
    this.state.satelliteCount = 0;
  }

  /**
   * Achieve lock state
   */
  private achieveLock_(): void {
    this.state.isLocked = true;
    this.state.lockDuration = 0;
    this.state.frequencyAccuracy = Math.abs(this.unitLockedOffset_) * 1e11;
    this.state.allanDeviation = OCXO.allanDeviation1s * 1e11;
    this.state.phaseNoise = OCXO.phaseNoise10Hz;
  }

  /**
   * Start warmup countdown timer
   */
  protected startWarmupTimer_(): void {
    if (this.warmupInterval_) return;

    this.warmupInterval_ = SimClock.setInterval(() => {
      if (!this.state.isPowered) {
        this.stopWarmupTimer_();
        return;
      }

      if (this.state.warmupTimeRemaining > 0) {
        this.state.warmupTimeRemaining -= 1;

        // Temperature rises during warmup
        const targetTemp = 70;
        this.state.temperature += (targetTemp - this.state.temperature) * 0.02;

        // Specs improve as warmup progresses
        this.improveSpecsDuringWarmup_();
      } else if (!this.state.isLocked && this.state.gnssSignalPresent) {
        // Warmup complete - achieve lock if GNSS available
        this.achieveLock_();
      }

      this.onWarmupTick();
    }, 1000); // Update every second
  }

  /**
   * Hook for UI layer to update DOM during warmup
   */
  protected onWarmupTick(): void {
    // Override in UI layer
  }

  /**
   * Stop warmup timer
   */
  protected stopWarmupTimer_(): void {
    if (this.warmupInterval_) {
      SimClock.clearTimer(this.warmupInterval_);
      this.warmupInterval_ = null;
    }
  }

  /**
   * Improve specs gradually during warmup
   */
  private improveSpecsDuringWarmup_(): void {
    const warmupProgress = 1 - this.state.warmupTimeRemaining / (SimulationManager.getInstance().isDeveloperMode ? 20 : 600);

    // Accuracy improves exponentially as the oven settles
    this.state.frequencyAccuracy = 1000 * ((OCXO.holdoverOffset * 1e11) / 1000) ** warmupProgress;
    this.state.allanDeviation = 100 * ((OCXO.allanDeviation1s * 1e11) / 100) ** warmupProgress;
    this.state.phaseNoise = -80 + (OCXO.phaseNoise10Hz + 80) * warmupProgress;
  }

  /**
   * Start stability monitoring (updates specs when locked)
   */
  protected startStabilityMonitor_(): void {
    if (this.stabilityInterval_) return;

    this.stabilityInterval_ = SimClock.setInterval(() => {
      if (!this.state.isPowered || !this.state.isLocked) {
        return;
      }

      // Increment lock duration
      this.state.lockDuration += 5;

      // Increment operating hours
      this.state.operatingHours += 5 / 3600; // 5 seconds to hours

      // Satellite count drifts slowly around the nominal count (at most once a minute)
      if (this.state.gnssSignalPresent && this.state.satelliteCount < 4) {
        // Signal present but nothing counted yet (e.g. after a power cycle)
        this.reacquireSvCount_();
      } else if (this.state.gnssSignalPresent) {
        this.svDriftTicks_++;
        if (this.svDriftTicks_ >= GPSDOModuleCore.SV_DRIFT_TICKS) {
          this.svDriftTicks_ = 0;
          this.state.satelliteCount = this.driftedSvCount_();
        }
      }

      this.onStabilityTick();
    }, 5000); // Update every 5 seconds
  }

  /** Nominal count from config: explicit nominalSatelliteCount, else a usable starting count, else 9. */
  private static resolveNominalSvCount_(state: GPSDOState): number {
    const configured = state.nominalSatelliteCount ?? (state.satelliteCount >= 4 ? state.satelliteCount : GPSDOModuleCore.DEFAULT_NOMINAL_SV_COUNT);
    return clamp(Math.round(configured), 4, 12);
  }

  /** The nominal satellite count this module drifts around. */
  get nominalSatelliteCount(): number {
    return this.nominalSvCount_;
  }

  /** One seeded step: nominal -1, nominal or nominal +1 (kept within 4-12). */
  private driftedSvCount_(): number {
    const offset = Math.floor(random() * 3) - 1;
    return clamp(this.nominalSvCount_ + offset, 4, 12);
  }

  /** GNSS reacquired: the receiver comes back on the same sky, so the nominal count. */
  private reacquireSvCount_(): void {
    this.state.satelliteCount = this.nominalSvCount_;
    this.svDriftTicks_ = 0;
  }

  /**
   * Hook for UI layer to update DOM during stability monitoring
   */
  protected onStabilityTick(): void {
    // Override in UI layer
  }

  /**
   * Stop stability monitor
   */
  protected stopStabilityMonitor_(): void {
    if (this.stabilityInterval_) {
      SimClock.clearTimer(this.stabilityInterval_);
      this.stabilityInterval_ = null;
    }
  }

  /**
   * Start holdover monitoring
   */
  protected startHoldoverMonitor_(): void {
    // Only start if not already running
    if (this.holdoverInterval_) return;

    this.holdoverInterval_ = SimClock.setInterval(() => {
      if (!this.state.isInHoldover || !this.state.isPowered) {
        this.stopHoldoverMonitor_();
        return;
      }

      this.state.holdoverDuration += 1;

      // Holdover: the OCXO coasts on its free-running offset (1.67 µs of
      // time error per hour, < 40 µs over 24 h) plus ageing; the time error
      // is the integral of the frequency error
      this.state.holdoverError += Math.abs(this.fractionalFrequencyError()) * 1e6;

      // If holdover error exceeds spec
      if (this.state.holdoverError > 40) {
        // This is where the 10Mhz output would become unstable
        // TODO: Implement output instability behavior
      }

      this.onHoldoverTick();
    }, 1000); // Update every second
  }

  /**
   * Hook for UI layer to update DOM during holdover
   */
  protected onHoldoverTick(): void {
    // Override in UI layer
  }

  /**
   * Stop holdover monitor
   */
  protected stopHoldoverMonitor_(): void {
    if (this.holdoverInterval_) {
      SimClock.clearTimer(this.holdoverInterval_);
      this.holdoverInterval_ = null;
    }
  }

  /**
   * Sync state from external source
   */
  sync(state?: Partial<GPSDOState>): void {
    super.sync(state);
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    if (!this.state.isPowered) {
      return alarms;
    }

    // Lock alarm
    if (!this.state.isLocked && this.state.warmupTimeRemaining === 0) {
      alarms.push('GPSDO not locked');
    }

    // GNSS signal alarm
    if (!this.state.gnssSignalPresent) {
      alarms.push('GNSS signal lost');
    }

    // Holdover alarm
    if (this.state.isInHoldover) {
      alarms.push(`GPSDO in holdover (${this.state.holdoverError.toFixed(1)} μs error)`);
    }

    // Holdover approaching limit
    if (this.state.holdoverError > 30) {
      alarms.push('GPSDO holdover approaching limit (>30 μs)');
    }

    // High temperature alarm
    if (this.state.temperature > 75 || this.state.temperature < 65) {
      alarms.push(`GPSDO oven temperature out of range (${this.state.temperature.toFixed(1)} °C)`);
    }

    // Self-test failure
    if (!this.state.selfTestPassed) {
      alarms.push('GPSDO self-test failed');
    }

    return alarms;
  }

  /**
   * Check if reference is providing stable output
   */
  isOutputStable(): boolean {
    return this.state.isPowered && this.state.isLocked && this.state.warmupTimeRemaining === 0;
  }

  /**
   * Get current frequency accuracy (for external equipment to query)
   */
  getFrequencyAccuracy(): number {
    return this.state.frequencyAccuracy * 1e-11; // Convert to fraction
  }

  get10MhzOutput(): {
    isPresent: boolean;
    isWarmedUp: boolean;
  } {
    return {
      isPresent: this.state.isPowered,
      isWarmedUp: this.state.warmupTimeRemaining === 0,
    };
  }

  /**
   * Get reference status for RF Front-End
   */
  getReferenceStatus(): {
    isPresent: boolean;
    isLocked: boolean;
    accuracy: number;
    phaseNoise: number;
  } {
    return {
      isPresent: this.state.isPowered,
      isLocked: this.isOutputStable(),
      accuracy: this.getFrequencyAccuracy(),
      phaseNoise: this.state.phaseNoise,
    };
  }

  // Public handlers for UI layer
  handlePowerToggle(isPowered: boolean): void {
    this.state.isPowered = isPowered;

    if (isPowered) {
      this.resetToWarmupState_();
      this.startWarmupTimer_();
      this.startStabilityMonitor_();
    } else {
      this.state.isLocked = false;
      this.state.isInHoldover = false;
      this.state.holdoverDuration = 0;
      this.state.gnssSignalPresent = false;
      this.state.isGnssAcquiringLock = false;
      this.state.satelliteCount = 0;
      this.state.lockDuration = 0;
      this.stopWarmupTimer_();
      this.stopStabilityMonitor_();
      this.stopHoldoverMonitor_();
    }
  }

  /**
   * Drop or restore the GNSS signal itself, switch position unchanged
   * (HardwareFaultManager `gpsdo-gnss-loss`). Losing the signal while locked
   * puts the reference into holdover on its oscillator with the satellite count
   * at zero - the tell that distinguishes an outage from a switch left down.
   * When the signal returns with the switch up the receiver re-locks and leaves
   * holdover, as the switch-up path does.
   */
  setGnssSignalPresent(present: boolean): void {
    this.gnssOutage_ = !present;

    if (!present) {
      this.state.gnssSignalPresent = false;
      this.state.satelliteCount = 0;
      this.state.isGnssAcquiringLock = false;
      if (this.state.isLocked && this.state.isPowered) {
        this.state.isInHoldover = true;
        this.startHoldoverMonitor_();
      }
      return;
    }

    if (this.state.isGnssSwitchUp && this.state.isPowered) {
      this.state.gnssSignalPresent = true;
      this.reacquireSvCount_();
      this.state.isInHoldover = false;
      this.state.holdoverError = 0;
      this.updateLockStatus_();
    }
  }

  /** True while a scenario-staged GNSS outage is in effect. */
  get isGnssOutage(): boolean {
    return this.gnssOutage_;
  }

  handleGnssToggle(isGnssSwitchUp: boolean, callback: (state: GPSDOState) => void): void {
    // Change the GNSS switch state
    this.state.isGnssSwitchUp = isGnssSwitchUp;
    this.state.gnssSignalPresent = false;

    if (isGnssSwitchUp && this.state.isPowered) {
      this.state.isGnssAcquiringLock = true;
      SimClock.setTimeout(() => {
        this.state.isGnssAcquiringLock = false;
        // During a staged outage there is no signal to acquire: the switch is
        // up, the count stays at zero, holdover continues.
        if (this.gnssOutage_) {
          this.state.satelliteCount = 0;
          callback(this.state);
          return;
        }
        // GNSS acquired - exit holdover
        this.state.gnssSignalPresent = true;
        this.reacquireSvCount_();
        this.state.isInHoldover = false;
        this.state.holdoverError = 0;
        this.updateLockStatus_();
        callback(this.state);
      }, 5000);
    } else if (this.state.isLocked) {
      this.state.isGnssAcquiringLock = false;
      // GNSS lost - enter holdover mode
      this.state.isInHoldover = true;
      this.state.satelliteCount = 0;
      this.startHoldoverMonitor_();
    }

    this.updateLockStatus_();
  }

  formatWarmupTime_(): string {
    if (this.state.warmupTimeRemaining === 0) {
      return 'READY';
    }
    const minutes = Math.floor(this.state.warmupTimeRemaining / 60);
    const seconds = this.state.warmupTimeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  getLockLedStatus_(): string {
    if (!this.state.isPowered) return 'led-off';
    if (!this.state.isLocked && !this.state.isGnssAcquiringLock) return 'led-red';
    if (this.state.isGnssAcquiringLock) return 'led-amber';
    // Must be locked
    return 'led-green';
  }

  getGnssLedStatus_(): string {
    if (!this.state.isPowered) return 'led-off';
    if (!this.state.gnssSignalPresent) return 'led-red';
    if (this.state.satelliteCount < 4) return 'led-amber';
    return 'led-green';
  }

  getWarmupLedStatus_(): string {
    if (!this.state.isPowered) return 'led-off';
    if (this.state.warmupTimeRemaining > 0) return 'led-amber';
    return 'led-green';
  }
}
