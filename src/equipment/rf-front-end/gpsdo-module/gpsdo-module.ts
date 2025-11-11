import { App } from '@app/app';
import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { ToggleSwitch } from '@app/components/toggle-switch/toggle-switch';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { clamp } from 'ootk';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './gpsdo-module.css';

/**
 * GLOSSARY:
 * GPSDO - GPS Disciplined Oscillator
 * OCXO - Oven-Controlled Crystal Oscillator
 * 1PPS - One Pulse Per Second
 * GNSS - Global Navigation Satellite System (ie. GPS, GLONASS, etc.)
 */

/**
 * GPS Disciplined Oscillator Module State
 * Models a 10 MHz reference distribution amplifier with GPS disciplining
 * Based on SRS FS752 specifications
 */
export interface GPSDOState {
  // ═══ Power & Operational State ═══
  /** Module power state */
  isPowered: boolean;
  /** Warm-up time remaining in seconds (OCXO needs ~10 minutes) */
  warmupTimeRemaining: number;
  /** Operating temperature in °C (oven-controlled ~70°C) */
  temperature: number;

  // ═══ GNSS Receiver State ═══
  /** GPS/GNSS signal present */
  gnssSignalPresent: boolean;
  /** GNSS switch state */
  isGnssSwitchUp: boolean;
  /** GNSS Attempting to Acquire Lock */
  isGnssAcquiringLock: boolean;
  /** Number of satellites being tracked */
  satelliteCount: number;
  /** UTC time accuracy in nanoseconds */
  utcAccuracy: number;
  /** Selected constellation: GPS, GLONASS, BEIDOU, GALILEO */
  constellation: 'GPS' | 'GLONASS' | 'BEIDOU' | 'GALILEO' | 'MULTI';

  // ═══ Lock & Stability ═══
  /** Reference is locked and stable */
  isLocked: boolean;
  /** Time elapsed since achieving lock (seconds) */
  lockDuration: number;
  /** Frequency accuracy in parts per trillion (×10⁻¹¹) */
  frequencyAccuracy: number;
  /** Short-term stability (Allan deviation at 1s) in ×10⁻¹¹ */
  allanDeviation: number;
  /** Phase noise at 10 Hz offset in dBc/Hz */
  phaseNoise: number;

  // ═══ Holdover Performance ═══
  /** Currently in holdover mode (GNSS lost) */
  isInHoldover: boolean;
  /** Time in holdover in seconds */
  holdoverDuration: number;
  /** Holdover accuracy degradation in microseconds */
  holdoverError: number;

  // ═══ Distribution Outputs ═══
  /** Number of 10 MHz outputs enabled */
  active10MHzOutputs: number;
  /** Total available 10 MHz outputs */
  max10MHzOutputs: number;
  /** 10 MHz output level in dBm */
  output10MHzLevel: number;
  /** 1PPS outputs enabled */
  ppsOutputsEnabled: boolean;

  // ═══ Health Monitoring ═══
  /** Hours of operation since last maintenance */
  operatingHours: number;
  /** Self-test status */
  selfTestPassed: boolean;
  /** Aging rate (free-running) in ppm/year */
  agingRate: number;
}

/**
 * GPSDOModule - GPS Disciplined Oscillator
 * Provides ultra-stable 10 MHz reference and 1PPS timing
 * Critical frequency standard for RF Front-End equipment
 */
export class GPSDOModule extends RFFrontEndModule<GPSDOState> {
  // GPSDO characteristics - TODO: These should not be null
  private warmupInterval_: number | null = null;
  private stabilityInterval_: number | null = null;
  private holdoverInterval_: number | null = null;

  // UI Components
  private readonly gnssSwitch_: ToggleSwitch;
  protected readonly powerSwitch_: PowerSwitch;

  // TODO: Implement DOM caching on other modules
  private domCache_: Record<string, HTMLElement> = {};

  /**
   * Get default state for GPSDO module
   */
  static getDefaultState(): GPSDOState {
    return {
      isPowered: true,
      isLocked: true,
      warmupTimeRemaining: 0, // seconds
      temperature: 70, // °C
      gnssSignalPresent: true,
      isGnssSwitchUp: true,
      isGnssAcquiringLock: false,
      satelliteCount: 9,
      utcAccuracy: 0,
      constellation: 'GPS',
      lockDuration: 0,
      frequencyAccuracy: 0,
      allanDeviation: 0,
      phaseNoise: 0,
      isInHoldover: false,
      holdoverDuration: 0,
      holdoverError: 0,
      active10MHzOutputs: 2,
      max10MHzOutputs: 5,
      output10MHzLevel: 0,
      ppsOutputsEnabled: false,
      operatingHours: 6,
      selfTestPassed: true,
      agingRate: 0,
    };
  }

  constructor(state: GPSDOState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-gpsdo', unit);

    // Create UI components
    this.powerSwitch_ = PowerSwitch.create(
      `${this.uniqueId}-power`,
      this.state_.isPowered,
      false,
      true,
    );

    this.gnssSwitch_ = ToggleSwitch.create(
      `${this.uniqueId}-gnss`,
      this.state_.isGnssSwitchUp,
      false
    );

    this.html_ = html`
      <div class="rf-fe-module gpsdo-module">
        <div class="module-label">GPS Disciplined Oscillator</div>
        <div class="module-controls">
          <div class="split-top-section">
            <!-- Input Knobs -->
            <div class="input-knobs">
              <div class="control-group">
                <label>GNSS</label>
                ${this.gnssSwitch_.html}
              </div>
            </div>
            <!-- Status LEDs -->
            <div class="led-indicators">
              <div id="lock-led" class="led-indicator">
                <span class="indicator-label">LOCK</span>
                <div class="led ${this.getLockLedStatus_()}"></div>
              </div>
              <div id="gnss-led" class="led-indicator">
                <span class="indicator-label">GNSS</span>
                <div class="led ${this.getGnssLedStatus_()}"></div>
              </div>
              <div id="warm-led" class="led-indicator">
                <span class="indicator-label">WARM</span>
                <div class="led ${this.getWarmupLedStatus_()}"></div>
              </div>
            </div>
          </div>

          <!-- Status Displays -->
          <div class="status-displays">
            <div class="control-group">
              <label>FREQ ACCURACY (×10⁻¹¹)</label>
              <div class="digital-display gpsdo-freq-accuracy">${this.state_.frequencyAccuracy.toFixed(3)}</div>
            </div>
            <div class="control-group">
              <label>STABILITY (×10⁻¹¹)</label>
              <div class="digital-display gpsdo-stability">${this.state_.allanDeviation.toFixed(3)}</div>
            </div>
            <div class="control-group">
              <label>PHASE NOISE (dBc/Hz)</label>
              <div class="digital-display gpsdo-phase-noise">${this.state_.phaseNoise.toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>SATELLITES</label>
              <div class="digital-display gpsdo-sats">${this.state_.satelliteCount}</div>
            </div>
            <div class="control-group">
              <label>UTC (ns)</label>
              <div class="digital-display gpsdo-utc">${this.state_.utcAccuracy.toFixed(0)}</div>
            </div>
            <div class="control-group">
              <label>TEMP (°C)</label>
              <div class="digital-display gpsdo-temp">${this.state_.temperature.toFixed(1)}</div>
            </div>
            <div class="control-group">
              <label>WARMUP</label>
              <div class="digital-display gpsdo-warmup">${this.formatWarmupTime_()}</div>
            </div>
            <div class="control-group">
              <label>OUTPUTS</label>
              <div class="digital-display gpsdo-outputs">${this.state_.active10MHzOutputs}/${this.state_.max10MHzOutputs}</div>
            </div>
            <div class="control-group">
              <label>HOLDOVER (μs)</label>
              <div class="digital-display gpsdo-holdover">${this.state_.holdoverError.toFixed(1)}</div>
            </div>
          </div>

          <!-- Controls -->
        </div>
        <div class="control-group power-switch">
          ${this.powerSwitch_.html}
        </div>
      </div>
    `;
  }

  private getLockLedStatus_(): string {
    if (!this.state_.isPowered) return 'led-off';
    if (!this.state_.isLocked && !this.state_.isGnssAcquiringLock) return 'led-red';
    if (this.state_.isGnssAcquiringLock) return 'led-amber';
    // Must be locked
    return 'led-green';
  }

  private getGnssLedStatus_(): string {
    if (!this.state_.isPowered) return 'led-off';
    if (!this.state_.gnssSignalPresent) return 'led-red';
    if (this.state_.satelliteCount < 4) return 'led-amber';
    return 'led-green';
  }

  private getWarmupLedStatus_(): string {
    if (!this.state_.isPowered) return 'led-off';
    if (this.state_.warmupTimeRemaining > 0) return 'led-amber';
    return 'led-green';
  }

  private formatWarmupTime_(): string {
    if (this.state_.warmupTimeRemaining === 0) {
      return 'READY';
    }
    const minutes = Math.floor(this.state_.warmupTimeRemaining / 60);
    const seconds = this.state_.warmupTimeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: GPSDOState) => void): void {
    if (!this.powerSwitch_ || !this.gnssSwitch_) {
      console.warn('GPSDOModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Power switch handler
    this.powerSwitch_.addEventListeners((isPowered: boolean) => {
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

      this.syncDomWithState_();
      cb(this.state_);
    });

    // GNSS switch handler
    this.gnssSwitch_.addEventListeners((isGnssSwitchUp: boolean) => {
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
          this.syncDomWithState_();
          cb(this.state_);
        }, 5000);
      } else if (this.state_.isLocked) {
        this.state.isGnssAcquiringLock = false;
        // GNSS lost - enter holdover mode
        this.state_.isInHoldover = true;
        this.state_.satelliteCount = 0;
        this.startHoldoverMonitor_();
      }

      this.updateLockStatus_();
      this.syncDomWithState_();
      cb(this.state_);
    });

    this.initializeDomCache_();
  }

  private initializeDomCache_() {
    const container = qs('.gpsdo-module');
    if (!container) {
      throw new Error('GPSDOModule: Cannot initialize DOM cache - container not found');
    }

    const lockLedElement = qs('#lock-led .led', container);
    const gnssLedElement = qs('#gnss-led .led', container);
    const warmLedElement = qs('#warm-led .led', container);
    const freqAccuracyElement = qs('.gpsdo-freq-accuracy', container);
    const stabilityElement = qs('.gpsdo-stability', container);
    const phaseNoiseElement = qs('.gpsdo-phase-noise', container);
    const satsElement = qs('.gpsdo-sats', container);
    const utcElement = qs('.gpsdo-utc', container);
    const tempElement = qs('.gpsdo-temp', container);
    const warmupLedElement = qs('.gpsdo-warmup', container);
    const outputsElement = qs('.gpsdo-outputs', container);
    const holdoverElement = qs('.gpsdo-holdover', container);

    if (!lockLedElement || !gnssLedElement || !warmLedElement ||
      !freqAccuracyElement || !stabilityElement || !phaseNoiseElement ||
      !satsElement || !utcElement || !tempElement || !warmupLedElement ||
      !outputsElement || !holdoverElement) {
      throw new Error('GPSDOModule: Cannot initialize DOM cache - one or more elements not found');
    }

    this.domCache_ = {
      container,
      lockLed: lockLedElement,
      gnssLed: gnssLedElement,
      warmLed: warmLedElement,
      freqAccuracy: freqAccuracyElement,
      stability: stabilityElement,
      phaseNoise: phaseNoiseElement,
      sats: satsElement,
      utc: utcElement,
      temp: tempElement,
      warmup: warmupLedElement,
      outputs: outputsElement,
      holdover: holdoverElement,
    };
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
      const coolRate = 0.0001;
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
    this.state_.warmupTimeRemaining = App.getInstance().isDeveloperMode ? 20 : 600;
    this.state_.isLocked = false;
    this.state_.lockDuration = 0;
    this.state_.temperature = 25; // Room temp
    this.state_.frequencyAccuracy = 999; // Poor when cold
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
  private startWarmupTimer_(): void {
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

      this.syncDomWithState_();
    }, 1000); // Update every second
  }

  /**
   * Stop warmup timer
   */
  private stopWarmupTimer_(): void {
    if (this.warmupInterval_) {
      clearInterval(this.warmupInterval_);
      this.warmupInterval_ = null;
    }
  }

  /**
   * Improve specs gradually during warmup
   */
  private improveSpecsDuringWarmup_(): void {
    const warmupProgress = 1 - (this.state_.warmupTimeRemaining / (App.getInstance().isDeveloperMode ? 20 : 600));

    // Accuracy improves exponentially
    this.state_.frequencyAccuracy = 1000 * Math.pow(2 / 1000, warmupProgress);
    this.state_.allanDeviation = 100 * Math.pow(2 / 100, warmupProgress);
    this.state_.phaseNoise = -80 + (-127 + 80) * warmupProgress;
  }

  /**
   * Start stability monitoring (updates specs when locked)
   */
  private startStabilityMonitor_(): void {
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

      this.syncDomWithState_();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Stop stability monitor
   */
  private stopStabilityMonitor_(): void {
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
  private startHoldoverMonitor_(): void {
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

      this.syncDomWithState_();
    }, 1000); // Update every second
  }

  /**
   * Stop holdover monitor
   */
  private stopHoldoverMonitor_(): void {
    if (this.holdoverInterval_) {
      clearInterval(this.holdoverInterval_);
      this.holdoverInterval_ = null;
    }
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<GPSDOState>): void {
    super.sync(state);

    // Update UI components
    if (this.powerSwitch_ && state.isPowered !== undefined) {
      this.powerSwitch_.sync(state.isPowered);
    }
    if (this.gnssSwitch_ && state.gnssSignalPresent !== undefined) {
      this.gnssSwitch_.sync(state.gnssSignalPresent);
    }
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
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    if (!this.hasStateChanged()) {
      return; // No changes, skip update
    }

    if (this.state.isPowered && this.stabilityInterval_ === null) {
      this.startStabilityMonitor_();
    }

    // Update LEDs
    this.domCache_.lockLed.className = `led ${this.getLockLedStatus_()}`;
    this.domCache_.gnssLed.className = `led ${this.getGnssLedStatus_()}`;
    this.domCache_.warmLed.className = `led ${this.getWarmupLedStatus_()}`;

    if (!this.state.isPowered) {
      // If powered off, make all screens blank and greyed out using a CSS class
      const statusDisplays = this.domCache_.container.querySelector('.status-displays');
      if (statusDisplays) {
        statusDisplays.classList.add('status-displays-off');
      }
      this.domCache_.freqAccuracy.textContent = '---.--';
      this.domCache_.stability.textContent = '---.--';
      this.domCache_.phaseNoise.textContent = '---.-';
      this.domCache_.sats.textContent = '--';
      this.domCache_.utc.textContent = '---';
      this.domCache_.temp.textContent = '--.-';
      this.domCache_.warmup.textContent = '----';
      this.domCache_.outputs.textContent = '--/--';
      this.domCache_.holdover.textContent = '---.-';
    } else {
      // Remove powered-off class
      const statusDisplays = this.domCache_.container.querySelector('.status-displays');
      if (statusDisplays) {
        statusDisplays.classList.remove('status-displays-off');
      }
      // Update displays
      this.domCache_.freqAccuracy.textContent = this.state_.frequencyAccuracy.toFixed(3);
      this.domCache_.stability.textContent = this.state_.allanDeviation.toFixed(3);
      this.domCache_.phaseNoise.textContent = this.state_.phaseNoise.toFixed(1);
      this.domCache_.sats.textContent = this.state_.satelliteCount.toString();
      this.domCache_.utc.textContent = this.state_.utcAccuracy.toFixed(0);
      this.domCache_.temp.textContent = this.state_.temperature.toFixed(1);
      this.domCache_.warmup.textContent = this.formatWarmupTime_();
      this.domCache_.outputs.textContent = `${this.state_.active10MHzOutputs}/${this.state_.max10MHzOutputs}`;

      this.domCache_.holdover.textContent = (this.state_.holdoverError).toFixed(3);
      // Color code: green when GPS locked, yellow in holdover, red when excessive
      if (!this.state_.isInHoldover) {
        this.domCache_.holdover.style.color = '#0f0';
      } else if (this.state_.holdoverError < 30) {
        this.domCache_.holdover.style.color = '#ff0';
      } else {
        this.domCache_.holdover.style.color = '#f00';
      }
    }


    // Sync UI components
    this.powerSwitch_.sync(this.state_.isPowered);
    this.gnssSwitch_.sync(this.state_.isGnssSwitchUp);
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
}
