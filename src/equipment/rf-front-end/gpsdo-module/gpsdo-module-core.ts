import { SimulationManager } from '@app/simulation/simulation-manager';
import { clamp } from 'ootk';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import { GPSDOState } from './GPSDOState';

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

  constructor(state: GPSDOState, rfFrontEnd: RFFrontEnd, unit: number) {
    super(state, rfFrontEnd, 'rf-fe-gpsdo', unit);

    // Initialize intervals if needed
    if (this.state_.isPowered && this.state_.warmupTimeRemaining === 0 && !this.state_.isLocked) {
      this.startHoldoverMonitor_();
    }
    if (this.state_.isPowered && this.state_.warmupTimeRemaining > 0) {
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
    const canLock = this.state_.isPowered &&
      this.state_.isGnssSwitchUp &&
      this.state_.warmupTimeRemaining === 0;

    if (canLock) {
      if (!this.state_.isLocked && this.state_.gnssSignalPresent) {
        // Achieve lock
        this.achieveLock_();
      }
    } else {
      this.state_.isLocked = false;
      this.state_.lockDuration = 0;
    }
  }

  /**
   * Update signal quality parameters
   */
  private updateSignalQuality_(): void {
    if (!this.state_.isPowered || (!this.state_.isLocked && !this.state_.isInHoldover)) {
      this.state_.phaseNoise = 0;
      this.state_.frequencyAccuracy = 999; // Poor when unlocked
      this.state_.allanDeviation = 99;
      return;
    }

    if (this.state_.isInHoldover) {
      // In holdover: maintain specs with OCXO, but degrade slowly
      this.state_.phaseNoise = -120 + Math.random() * 5; // -120 to -125 dBc/Hz
      this.state_.frequencyAccuracy = 0.5 + Math.random() * 4.5 + this.state_.holdoverError * 0.05; // degrade with error
      this.state_.allanDeviation = 0.5 + Math.random() * 4.5 + this.state_.holdoverError * 0.05;
      this.state_.utcAccuracy = 0; // No GPS timing
      return;
    }

    // Phase noise: < -125 dBc/Hz at 10 Hz when locked
    this.state_.phaseNoise = this.state_.gnssSignalPresent && !this.state_.isInHoldover
      ? -125 - Math.random() * 5  // -125 to -130 dBc/Hz when GPS locked
      : -100 - Math.random() * 10; // -100 to -110 dBc/Hz in holdover

    // Frequency accuracy: < 5×10⁻¹¹ at 1s when GPS locked
    if (this.state_.gnssSignalPresent && !this.state_.isInHoldover) {
      this.state_.frequencyAccuracy = 0.5 + Math.random() * 4.5; // 0.5-5 ×10⁻¹¹
      this.state_.allanDeviation = 0.5 + Math.random() * 4.5;
    }

    // UTC accuracy: < 100 ns when GPS locked
    if (this.state_.gnssSignalPresent) {
      this.state_.utcAccuracy = 20 + Math.random() * 80; // 20-100 ns
    } else {
      this.state_.utcAccuracy = 0; // No GPS timing
    }
  }

  /**
   * Update thermal state
   */
  private updateThermalState_(): void {
    if (!this.state_.isPowered) {
      // Cooling down toward ambient
      const ambientTemp = 25;
      const coolRateInSeconds = 0.0001; // Per second
      // Convert to ms
      const coolRate = 1 - Math.pow(1 - coolRateInSeconds, 1 / 60);
      this.state_.temperature = this.state_.temperature +
        (ambientTemp - this.state_.temperature) * coolRate;
      return;
    }

    // OCXO oven-controlled to ~70°C
    const targetTemp = 70;
    const heatRate = 0.00005;
    this.state_.temperature = this.state_.temperature +
      (targetTemp - this.state_.temperature) * heatRate;
  }

  /**
   * Reset state when powering on
   */
  private resetToWarmupState_(): void {
    // Double-oven OCXO warmup: ~10 minutes (600 seconds)
    // Each tick increases temp by 0.1C, so estimate remaining ticks
    const targetTemp = 70;
    const estimatedTicks = (targetTemp - this.state_.temperature) / 0.1;
    this.state_.warmupTimeRemaining = Math.ceil(estimatedTicks);

    this.state_.isLocked = false;
    this.state_.lockDuration = 0;
    this.state_.allanDeviation = 99;
    this.state_.phaseNoise = -80;
    this.state_.isInHoldover = false;
    this.state_.holdoverDuration = 0;
    this.state_.holdoverError = 0;
    this.state_.satelliteCount = 0;
  }

  /**
   * Achieve lock state
   */
  private achieveLock_(): void {
    this.state_.isLocked = true;
    this.state_.lockDuration = 0;
    this.state_.frequencyAccuracy = 2; // ~2×10⁻¹¹
    this.state_.allanDeviation = 2;
    this.state_.phaseNoise = -127; // Excellent phase noise
  }

  /**
   * Start warmup countdown timer
   */
  protected startWarmupTimer_(): void {
    if (this.warmupInterval_) return;

    this.warmupInterval_ = window.setInterval(() => {
      if (!this.state_.isPowered) {
        this.stopWarmupTimer_();
        return;
      }

      if (this.state_.warmupTimeRemaining > 0) {
        this.state_.warmupTimeRemaining -= 1;

        // Temperature rises during warmup
        const targetTemp = 70;
        this.state_.temperature += (targetTemp - this.state_.temperature) * 0.02;

        // Specs improve as warmup progresses
        this.improveSpecsDuringWarmup_();
      } else if (!this.state_.isLocked && this.state_.gnssSignalPresent) {
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
      clearInterval(this.warmupInterval_);
      this.warmupInterval_ = null;
    }
  }

  /**
   * Improve specs gradually during warmup
   */
  private improveSpecsDuringWarmup_(): void {
    const warmupProgress = 1 - (this.state_.warmupTimeRemaining / (SimulationManager.getInstance().isDeveloperMode ? 20 : 600));

    // Accuracy improves exponentially
    this.state_.frequencyAccuracy = 1000 * Math.pow(2 / 1000, warmupProgress);
    this.state_.allanDeviation = 100 * Math.pow(2 / 100, warmupProgress);
    this.state_.phaseNoise = -80 + (-127 + 80) * warmupProgress;
  }

  /**
   * Start stability monitoring (updates specs when locked)
   */
  protected startStabilityMonitor_(): void {
    if (this.stabilityInterval_) return;

    this.stabilityInterval_ = window.setInterval(() => {
      if (!this.state_.isPowered || !this.state_.isLocked) {
        return;
      }

      // Increment lock duration
      this.state_.lockDuration += 5;

      // Increment operating hours
      this.state_.operatingHours += 5 / 3600; // 5 seconds to hours

      // Add small random variations to metrics
      this.addMetricVariations_();

      // Satellite count should increase/decrease slightly, staying between 4-12
      if (this.state_.gnssSignalPresent && Math.random() < 0.2) {
        const satChange = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
        this.state_.satelliteCount = clamp(this.state_.satelliteCount + satChange, 4, 12);
      }

      this.onStabilityTick();
    }, 5000); // Update every 5 seconds
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
      clearInterval(this.stabilityInterval_);
      this.stabilityInterval_ = null;
    }
  }

  /**
   * Add small random variations to locked metrics
   */
  private addMetricVariations_(): void {
    if (!this.state_.gnssSignalPresent || this.state_.isInHoldover) return;

    // Very small variations around target values
    this.state_.frequencyAccuracy = 2 + (Math.random() - 0.5) * 0.5;
    this.state_.allanDeviation = 2 + (Math.random() - 0.5) * 0.5;
    this.state_.phaseNoise = -127 + (Math.random() - 0.5) * 2;
  }

  /**
   * Start holdover monitoring
   */
  protected startHoldoverMonitor_(): void {
    // Only start if not already running
    if (this.holdoverInterval_) return;

    this.holdoverInterval_ = window.setInterval(() => {
      if (!this.state_.isInHoldover || !this.state_.isPowered) {
        this.stopHoldoverMonitor_();
        return;
      }

      this.state_.holdoverDuration += 1;

      // Holdover spec: < 40 μs over 24 hours
      // Degrade at ~1.67 μs per hour, plus aging
      const hourlyDrift = 1.67; // μs/hour
      const elapsedHours = this.state_.holdoverDuration / 3600;
      this.state_.holdoverError = hourlyDrift * elapsedHours;

      // Frequency accuracy degrades in holdover at aging rate
      this.state_.frequencyAccuracy += this.state_.agingRate * 0.05 / (365 * 86400); // ppm/year → per second

      // If holdover error exceeds spec
      if (this.state_.holdoverError > 40) {
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
      clearInterval(this.holdoverInterval_);
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

    if (!this.state_.isPowered) {
      return alarms;
    }

    // Lock alarm
    if (!this.state_.isLocked && this.state_.warmupTimeRemaining === 0) {
      alarms.push('GPSDO not locked');
    }

    // GNSS signal alarm
    if (!this.state_.gnssSignalPresent) {
      alarms.push('GNSS signal lost');
    }

    // Holdover alarm
    if (this.state_.isInHoldover) {
      alarms.push(`GPSDO in holdover (${this.state_.holdoverError.toFixed(1)} μs error)`);
    }

    // Holdover approaching limit
    if (this.state_.holdoverError > 30) {
      alarms.push('GPSDO holdover approaching limit (>30 μs)');
    }

    // High temperature alarm
    if (this.state_.temperature > 75 || this.state_.temperature < 65) {
      alarms.push(`GPSDO oven temperature out of range (${this.state_.temperature.toFixed(1)} °C)`);
    }

    // Self-test failure
    if (!this.state_.selfTestPassed) {
      alarms.push('GPSDO self-test failed');
    }

    return alarms;
  }

  /**
   * Check if reference is providing stable output
   */
  isOutputStable(): boolean {
    return this.state_.isPowered &&
      this.state_.isLocked &&
      this.state_.warmupTimeRemaining === 0;
  }

  /**
   * Get current frequency accuracy (for external equipment to query)
   */
  getFrequencyAccuracy(): number {
    return this.state_.frequencyAccuracy * 1e-11; // Convert to fraction
  }

  get10MhzOutput(): {
    isPresent: boolean;
    isWarmedUp: boolean;
  } {
    return {
      isPresent: this.state_.isPowered,
      isWarmedUp: this.state_.warmupTimeRemaining === 0,
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
      isPresent: this.state_.isPowered,
      isLocked: this.isOutputStable(),
      accuracy: this.getFrequencyAccuracy(),
      phaseNoise: this.state_.phaseNoise,
    };
  }

  // Protected handlers for UI layer
  protected handlePowerToggle(isPowered: boolean): void {
    this.state_.isPowered = isPowered;

    if (isPowered) {
      this.resetToWarmupState_();
      this.startWarmupTimer_();
      this.startStabilityMonitor_();
    } else {
      this.state_.isLocked = false;
      this.state_.isInHoldover = false;
      this.state_.holdoverDuration = 0;
      this.state_.gnssSignalPresent = false;
      this.state_.isGnssAcquiringLock = false;
      this.state_.satelliteCount = 0;
      this.state_.lockDuration = 0;
      this.stopWarmupTimer_();
      this.stopStabilityMonitor_();
      this.stopHoldoverMonitor_();
    }
  }

  protected handleGnssToggle(isGnssSwitchUp: boolean, callback: (state: GPSDOState) => void): void {
    // Change the GNSS switch state
    this.state_.isGnssSwitchUp = isGnssSwitchUp;
    this.state_.gnssSignalPresent = false;

    if (isGnssSwitchUp && this.state_.isPowered) {
      this.state.isGnssAcquiringLock = true;
      setTimeout(() => {
        // GNSS acquired - exit holdover
        this.state_.gnssSignalPresent = true;
        this.state_.isGnssAcquiringLock = false;
        this.state_.satelliteCount = 4 + Math.floor(Math.random() * 8); // 4-12 sats
        this.state_.isInHoldover = false;
        this.state_.holdoverError = 0;
        this.updateLockStatus_();
        callback(this.state_);
      }, 5000);
    } else if (this.state_.isLocked) {
      this.state.isGnssAcquiringLock = false;
      // GNSS lost - enter holdover mode
      this.state_.isInHoldover = true;
      this.state_.satelliteCount = 0;
      this.startHoldoverMonitor_();
    }

    this.updateLockStatus_();
  }

  protected formatWarmupTime_(): string {
    if (this.state_.warmupTimeRemaining === 0) {
      return 'READY';
    }
    const minutes = Math.floor(this.state_.warmupTimeRemaining / 60);
    const seconds = this.state_.warmupTimeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  protected getLockLedStatus_(): string {
    if (!this.state_.isPowered) return 'led-off';
    if (!this.state_.isLocked && !this.state_.isGnssAcquiringLock) return 'led-red';
    if (this.state_.isGnssAcquiringLock) return 'led-amber';
    // Must be locked
    return 'led-green';
  }

  protected getGnssLedStatus_(): string {
    if (!this.state_.isPowered) return 'led-off';
    if (!this.state_.gnssSignalPresent) return 'led-red';
    if (this.state_.satelliteCount < 4) return 'led-amber';
    return 'led-green';
  }

  protected getWarmupLedStatus_(): string {
    if (!this.state_.isPowered) return 'led-off';
    if (this.state_.warmupTimeRemaining > 0) return 'led-amber';
    return 'led-green';
  }
}
