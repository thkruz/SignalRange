import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './receiver-lock-module.css';

/**
 * Receiver lock status tracking
 * Models the lock acquisition stages in a digital receiver chain
 */
export interface ReceiverLockState {
  // ═══ Lock Status ═══
  /** Carrier Frequency Offset lock - CFO < threshold for 200ms */
  isFreqLocked: boolean;
  /** Symbol timing lock - timing error variance below threshold for 200ms */
  isSymbolLocked: boolean;
  /** Phase lock - Costas loop variance below threshold for 200ms */
  isPhaseLocked: boolean;
  /** Frame lock - ≥3 consecutive UWs with CRC-OK */
  isFrameLocked: boolean;

  // ═══ Lock Metrics ═══
  /** Residual carrier frequency offset in Hz */
  residualCFO: number;
  /** Symbol timing error variance (normalized) */
  timingErrorVariance: number;
  /** Costas loop phase variance in degrees */
  phaseVariance: number;
  /** Consecutive valid unique words detected */
  consecutiveUWs: number;

  // ═══ Thresholds ═══
  /** CFO threshold in Hz (typical ±100 Hz @ 1 Msps) */
  cfoThreshold: number;
  /** Timing error variance threshold */
  timingThreshold: number;
  /** Phase variance threshold in degrees */
  phaseThreshold: number;
  /** Required consecutive UWs for frame lock */
  requiredUWs: number;

  // ═══ Lock Timers ═══
  /** Time freq lock has been stable (ms) */
  freqLockDuration: number;
  /** Time symbol lock has been stable (ms) */
  symbolLockDuration: number;
  /** Time phase lock has been stable (ms) */
  phaseLockDuration: number;

  // ═══ Impact Tracking ═══
  /** Last time locks were updated */
  lastUpdateTime: number;
}

export class ReceiverLockModule extends RFFrontEndModule<ReceiverLockState> {
  private static instance_: ReceiverLockModule;

  static create(state: ReceiverLockState, rfFrontEnd: RFFrontEnd, unit: number = 1): ReceiverLockModule {
    this.instance_ ??= new ReceiverLockModule(state, rfFrontEnd, unit);
    return this.instance_;
  }

  static getInstance(): ReceiverLockModule {
    return this.instance_;
  }

  private constructor(state: ReceiverLockState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-rx-lock', unit);

    this.html_ = html`
      <div class="rf-fe-module receiver-lock-module">
        <div class="module-label">Receiver Lock Status</div>
        <div class="module-controls">
          <div class="lock-indicators">
            <!-- Frequency Lock -->
            <div class="lock-indicator-group">
              <div class="led-indicator">
                <span class="indicator-label">FREQ LOCK</span>
                <div class="led ${this.getFreqLockStatus_()}"></div>
              </div>
              <div class="lock-metric">
                <span class="metric-label">CFO:</span>
                <span class="metric-value">${this.state_.residualCFO.toFixed(1)} Hz</span>
              </div>
            </div>

            <!-- Symbol Lock -->
            <div class="lock-indicator-group">
              <div class="led-indicator">
                <span class="indicator-label">SYM LOCK</span>
                <div class="led ${this.getSymbolLockStatus_()}"></div>
              </div>
              <div class="lock-metric">
                <span class="metric-label">T.ERR:</span>
                <span class="metric-value">${this.state_.timingErrorVariance.toFixed(3)}</span>
              </div>
            </div>

            <!-- Phase Lock -->
            <div class="lock-indicator-group">
              <div class="led-indicator">
                <span class="indicator-label">PHASE LOCK</span>
                <div class="led ${this.getPhaseLockStatus_()}"></div>
              </div>
              <div class="lock-metric">
                <span class="metric-label">Φ.VAR:</span>
                <span class="metric-value">${this.state_.phaseVariance.toFixed(1)}°</span>
              </div>
            </div>

            <!-- Frame Lock -->
            <div class="lock-indicator-group">
              <div class="led-indicator">
                <span class="indicator-label">FRAME LOCK</span>
                <div class="led ${this.getFrameLockStatus_()}"></div>
              </div>
              <div class="lock-metric">
                <span class="metric-label">UWs:</span>
                <span class="metric-value">${this.state_.consecutiveUWs}/${this.state_.requiredUWs}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private getFreqLockStatus_(): string {
    return this.state_.isFreqLocked ? 'led-green' : 'led-red';
  }

  private getSymbolLockStatus_(): string {
    return this.state_.isSymbolLocked ? 'led-green' : 'led-red';
  }

  private getPhaseLockStatus_(): string {
    return this.state_.isPhaseLocked ? 'led-green' : 'led-red';
  }

  private getFrameLockStatus_(): string {
    return this.state_.isFrameLocked ? 'led-green' : 'led-red';
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(_cb: (state: ReceiverLockState) => void): void {
    // This module is display-only, no user interactions
    // Lock status is driven by receiver state
  }

  /**
   * Update component state and check for lock conditions
   */
  update(): void {
    const now = Date.now();
    const dt = now - this.state_.lastUpdateTime;
    this.state_.lastUpdateTime = now;

    // Check if parent RF Front End and LNB are powered and locked
    const parentPowered = this.rfFrontEnd_.state.isPowered;
    const lnbPowered = this.rfFrontEnd_.state.lnb.isPowered;
    const lnbLocked = this.rfFrontEnd_.state.lnb.isExtRefLocked;

    if (!parentPowered || !lnbPowered || !lnbLocked) {
      // Cannot achieve lock without powered and locked LNB
      this.resetAllLocks_();
      return;
    }

    // Simulate lock acquisition process
    this.updateFrequencyLock_(dt);
    this.updateSymbolLock_(dt);
    this.updatePhaseLock_(dt);
    this.updateFrameLock_(dt);
  }

  /**
   * Update frequency lock status
   * Requires residual CFO < threshold for 200ms
   */
  private updateFrequencyLock_(dt: number): void {
    // Simulate CFO tracking - gradually converges to zero when conditions are good
    const lnbLocked = this.rfFrontEnd_.state.lnb.isExtRefLocked;

    if (lnbLocked) {
      // Converge toward zero
      this.state_.residualCFO *= 0.95;
      this.state_.residualCFO += (Math.random() - 0.5) * 10; // Small random walk
    } else {
      // Drift when LNB unlocked
      this.state_.residualCFO += (Math.random() - 0.5) * 50;
    }

    // Check lock condition
    const isWithinThreshold = Math.abs(this.state_.residualCFO) < this.state_.cfoThreshold;

    if (isWithinThreshold) {
      this.state_.freqLockDuration += dt;
      if (this.state_.freqLockDuration >= 200) {
        this.state_.isFreqLocked = true;
      }
    } else {
      this.state_.freqLockDuration = 0;
      this.state_.isFreqLocked = false;
    }
  }

  /**
   * Update symbol timing lock status
   * Requires timing error variance below threshold for 200ms
   * Depends on frequency lock
   */
  private updateSymbolLock_(dt: number): void {
    if (!this.state_.isFreqLocked) {
      this.state_.symbolLockDuration = 0;
      this.state_.isSymbolLocked = false;
      this.state_.timingErrorVariance = 0.5 + Math.random() * 0.5; // High variance
      return;
    }

    // Simulate timing error tracking - converges when freq locked
    this.state_.timingErrorVariance *= 0.92;
    this.state_.timingErrorVariance += (Math.random() - 0.5) * 0.01;

    // Check lock condition
    const isWithinThreshold = this.state_.timingErrorVariance < this.state_.timingThreshold;

    if (isWithinThreshold) {
      this.state_.symbolLockDuration += dt;
      if (this.state_.symbolLockDuration >= 200) {
        this.state_.isSymbolLocked = true;
      }
    } else {
      this.state_.symbolLockDuration = 0;
      this.state_.isSymbolLocked = false;
    }
  }

  /**
   * Update phase lock status (Costas loop)
   * Requires phase variance below threshold for 200ms
   * Depends on symbol lock
   */
  private updatePhaseLock_(dt: number): void {
    if (!this.state_.isSymbolLocked) {
      this.state_.phaseLockDuration = 0;
      this.state_.isPhaseLocked = false;
      this.state_.phaseVariance = 30 + Math.random() * 30; // High variance
      return;
    }

    // Simulate phase tracking - converges when symbol locked
    this.state_.phaseVariance *= 0.90;
    this.state_.phaseVariance += (Math.random() - 0.5) * 0.5;

    // Check lock condition
    const isWithinThreshold = this.state_.phaseVariance < this.state_.phaseThreshold;

    if (isWithinThreshold) {
      this.state_.phaseLockDuration += dt;
      if (this.state_.phaseLockDuration >= 200) {
        this.state_.isPhaseLocked = true;
      }
    } else {
      this.state_.phaseLockDuration = 0;
      this.state_.isPhaseLocked = false;
    }
  }

  /**
   * Update frame lock status
   * Requires ≥3 consecutive UWs with CRC-OK
   * Depends on phase lock
   */
  private updateFrameLock_(_dt: number): void {
    if (!this.state_.isPhaseLocked) {
      this.state_.consecutiveUWs = 0;
      this.state_.isFrameLocked = false;
      return;
    }

    // Simulate UW detection - probabilistic when phase locked
    // In real system, this would be driven by frame sync hardware/software
    const uwDetectionProb = 0.01; // 1% chance per update when phase locked

    if (Math.random() < uwDetectionProb) {
      this.state_.consecutiveUWs++;
      if (this.state_.consecutiveUWs >= this.state_.requiredUWs) {
        this.state_.isFrameLocked = true;
      }
    }

    // Small chance of losing UW even when locked (e.g., due to burst errors)
    if (this.state_.isFrameLocked && Math.random() < 0.001) {
      this.state_.consecutiveUWs = Math.max(0, this.state_.consecutiveUWs - 1);
      if (this.state_.consecutiveUWs < this.state_.requiredUWs) {
        this.state_.isFrameLocked = false;
      }
    }
  }

  /**
   * Reset all locks (called when upstream conditions fail)
   */
  private resetAllLocks_(): void {
    this.state_.isFreqLocked = false;
    this.state_.isSymbolLocked = false;
    this.state_.isPhaseLocked = false;
    this.state_.isFrameLocked = false;
    this.state_.freqLockDuration = 0;
    this.state_.symbolLockDuration = 0;
    this.state_.phaseLockDuration = 0;
    this.state_.consecutiveUWs = 0;
    this.state_.residualCFO = (Math.random() - 0.5) * 1000; // Random large offset
    this.state_.timingErrorVariance = 0.5 + Math.random() * 0.5;
    this.state_.phaseVariance = 30 + Math.random() * 30;
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<ReceiverLockState>): void {
    super.sync(state);
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    const parentPowered = this.rfFrontEnd_.state.isPowered;
    const lnbPowered = this.rfFrontEnd_.state.lnb.isPowered;

    if (!parentPowered || !lnbPowered) {
      return alarms; // Don't alarm if not powered
    }

    if (!this.state_.isFreqLocked) {
      alarms.push(`Receiver frequency unlocked (CFO: ${this.state_.residualCFO.toFixed(1)} Hz)`);
    }

    if (this.state_.isFreqLocked && !this.state_.isSymbolLocked) {
      alarms.push('Receiver symbol timing unlocked');
    }

    if (this.state_.isSymbolLocked && !this.state_.isPhaseLocked) {
      alarms.push(`Receiver phase unlocked (var: ${this.state_.phaseVariance.toFixed(1)}°)`);
    }

    if (this.state_.isPhaseLocked && !this.state_.isFrameLocked) {
      alarms.push('Receiver frame sync lost');
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

    const container = qs('.receiver-lock-module');
    if (!container) return;

    // Update all LED indicators
    this.updateLockLEDs_(container);

    // Update all metric displays
    this.updateMetricDisplays_(container);
  }

  /**
   * Update LED indicators
   */
  private updateLockLEDs_(container: Element): void {
    const indicators = container.querySelectorAll('.led-indicator');

    // Freq lock LED
    const freqLed = indicators[0]?.querySelector('.led');
    if (freqLed) {
      freqLed.className = `led ${this.getFreqLockStatus_()}`;
    }

    // Symbol lock LED
    const symLed = indicators[1]?.querySelector('.led');
    if (symLed) {
      symLed.className = `led ${this.getSymbolLockStatus_()}`;
    }

    // Phase lock LED
    const phaseLed = indicators[2]?.querySelector('.led');
    if (phaseLed) {
      phaseLed.className = `led ${this.getPhaseLockStatus_()}`;
    }

    // Frame lock LED
    const frameLed = indicators[3]?.querySelector('.led');
    if (frameLed) {
      frameLed.className = `led ${this.getFrameLockStatus_()}`;
    }
  }

  /**
   * Update metric value displays
   */
  private updateMetricDisplays_(container: Element): void {
    const metricValues = container.querySelectorAll('.metric-value');

    // CFO
    if (metricValues[0]) {
      metricValues[0].textContent = `${this.state_.residualCFO.toFixed(1)} Hz`;
    }

    // Timing error variance
    if (metricValues[1]) {
      metricValues[1].textContent = this.state_.timingErrorVariance.toFixed(3);
    }

    // Phase variance
    if (metricValues[2]) {
      metricValues[2].textContent = `${this.state_.phaseVariance.toFixed(1)}°`;
    }

    // UW count
    if (metricValues[3]) {
      metricValues[3].textContent = `${this.state_.consecutiveUWs}/${this.state_.requiredUWs}`;
    }
  }

  /**
   * Get lock cascade status for debugging
   */
  getLockCascadeStatus(): {
    freqLock: boolean;
    symbolLock: boolean;
    phaseLock: boolean;
    frameLock: boolean;
    fullLock: boolean;
  } {
    return {
      freqLock: this.state_.isFreqLocked,
      symbolLock: this.state_.isSymbolLocked,
      phaseLock: this.state_.isPhaseLocked,
      frameLock: this.state_.isFrameLocked,
      fullLock: this.state_.isFreqLocked &&
        this.state_.isSymbolLocked &&
        this.state_.isPhaseLocked &&
        this.state_.isFrameLocked,
    };
  }
}
