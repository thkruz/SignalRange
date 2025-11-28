import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { GPSDOModuleCore } from "@app/equipment/rf-front-end/gpsdo-module/gpsdo-module-core";
import { GPSDOState } from "@app/equipment/rf-front-end/gpsdo-module/gpsdo-state";
import { qs } from "@app/engine/utils/query-selector";

/**
 * GPSDOAdapter - Bridges GPSDOModuleCore state to web controls
 *
 * Provides bidirectional synchronization between:
 * - DOM input controls (switches) → GPSDO Core handlers
 * - GPSDO Core state changes → DOM updates
 *
 * Prevents circular updates via state comparison
 */
export class GPSDOAdapter {
  private gpsdoModule: GPSDOModuleCore;
  private containerEl: HTMLElement;
  private lastStateString: string = '';
  private boundHandlers: Map<string, EventListener> = new Map();
  private stateChangeHandler: (state: Partial<GPSDOState>) => void;

  constructor(gpsdoModule: GPSDOModuleCore, containerEl: HTMLElement) {
    this.gpsdoModule = gpsdoModule;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<GPSDOState>) => {
      // Sync DOM with state changes
      this.syncDomWithState(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Setup DOM event listeners for user input
    this.setupInputListeners();

    // Listen to GPSDO state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_GPSDO_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState(this.gpsdoModule.state);
  }

  private setupInputListeners(): void {
    // Power switch
    const powerSwitch = qs('#gpsdo-power', this.containerEl) as HTMLInputElement;
    const powerHandler = (e: Event) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.gpsdoModule['handlePowerToggle'](isChecked);
    };
    powerSwitch?.addEventListener('change', powerHandler);
    this.boundHandlers.set('power', powerHandler);

    // GNSS switch
    const gnssSwitch = qs('#gpsdo-gnss-switch', this.containerEl) as HTMLInputElement;
    const gnssHandler = (e: Event) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.gpsdoModule['handleGnssToggle'](isChecked, (state: GPSDOState) => {
        // Callback after GNSS toggle completes
        this.syncDomWithState(state);
      });
    };
    gnssSwitch?.addEventListener('change', gnssHandler);
    this.boundHandlers.set('gnss', gnssHandler);
  }

  private syncDomWithState(state: Partial<GPSDOState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = qs('#gpsdo-power', this.containerEl) as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update GNSS switch
    if (state.isGnssSwitchUp !== undefined) {
      const gnssSwitch = qs('#gpsdo-gnss-switch', this.containerEl) as HTMLInputElement;
      if (gnssSwitch) gnssSwitch.checked = state.isGnssSwitchUp;
    }

    // Update Lock Status LED and text
    if (state.isLocked !== undefined || state.isGnssAcquiringLock !== undefined || state.isPowered !== undefined) {
      const lockLed = qs('#gpsdo-lock-led', this.containerEl);
      const lockStatus = qs('#gpsdo-lock-status', this.containerEl);
      const ledStatus = this.gpsdoModule['getLockLedStatus_']();

      if (lockLed) {
        lockLed.className = `led ${ledStatus}`;
      }

      if (lockStatus) {
        if (!state.isPowered) {
          lockStatus.textContent = 'OFF';
        } else if (state.isGnssAcquiringLock) {
          lockStatus.textContent = 'ACQUIRING';
        } else if (state.isLocked) {
          lockStatus.textContent = 'LOCKED';
        } else {
          lockStatus.textContent = 'UNLOCKED';
        }
      }
    }

    // Update GNSS Status LED
    if (state.gnssSignalPresent !== undefined || state.satelliteCount !== undefined) {
      const gnssLed = qs('#gpsdo-gnss-led', this.containerEl);
      const ledStatus = this.gpsdoModule['getGnssLedStatus_']();
      if (gnssLed) {
        gnssLed.className = `led ${ledStatus}`;
      }
    }

    // Update Warmup Status LED and time
    if (state.warmupTimeRemaining !== undefined) {
      const warmupLed = qs('#gpsdo-warmup-led', this.containerEl);
      const warmupTime = qs('#gpsdo-warmup-time', this.containerEl);
      const ledStatus = this.gpsdoModule['getWarmupLedStatus_']();

      if (warmupLed) {
        warmupLed.className = `led ${ledStatus}`;
      }

      if (warmupTime) {
        warmupTime.textContent = this.gpsdoModule['formatWarmupTime_']();
      }
    }

    // Update satellite count
    if (state.satelliteCount !== undefined) {
      const satCount = qs('#gpsdo-satellite-count', this.containerEl);
      if (satCount) satCount.textContent = state.satelliteCount.toString();
    }

    // Update constellation
    if (state.constellation !== undefined) {
      const constellation = qs('#gpsdo-constellation', this.containerEl);
      if (constellation) constellation.textContent = state.constellation;
    }

    // Update frequency accuracy
    if (state.frequencyAccuracy !== undefined) {
      const freqAcc = qs('#gpsdo-freq-accuracy', this.containerEl);
      if (freqAcc) freqAcc.textContent = `${state.frequencyAccuracy.toFixed(2)} ×10⁻¹¹`;
    }

    // Update Allan deviation
    if (state.allanDeviation !== undefined) {
      const allanDev = qs('#gpsdo-allan-deviation', this.containerEl);
      if (allanDev) allanDev.textContent = `${state.allanDeviation.toFixed(2)} ×10⁻¹¹`;
    }

    // Update phase noise
    if (state.phaseNoise !== undefined) {
      const phaseNoise = qs('#gpsdo-phase-noise', this.containerEl);
      if (phaseNoise) phaseNoise.textContent = `${state.phaseNoise.toFixed(1)} dBc/Hz`;
    }

    // Update temperature
    if (state.temperature !== undefined) {
      const temp = qs('#gpsdo-temperature', this.containerEl);
      if (temp) temp.textContent = `${state.temperature.toFixed(1)} °C`;
    }

    // Update lock duration
    if (state.lockDuration !== undefined) {
      const lockDuration = qs('#gpsdo-lock-duration', this.containerEl);
      if (lockDuration) {
        const hours = Math.floor(state.lockDuration / 3600);
        const minutes = Math.floor((state.lockDuration % 3600) / 60);
        const seconds = state.lockDuration % 60;
        lockDuration.textContent = `${hours}h ${minutes}m ${seconds}s`;
      }
    }

    // Update holdover status
    if (state.isInHoldover !== undefined) {
      const holdoverLed = qs('#gpsdo-holdover-led', this.containerEl);
      if (holdoverLed) {
        holdoverLed.className = state.isInHoldover ? 'led led-amber' : 'led led-off';
      }
    }

    // Update holdover error
    if (state.holdoverError !== undefined) {
      const holdoverError = qs('#gpsdo-holdover-error', this.containerEl);
      if (holdoverError) holdoverError.textContent = `${state.holdoverError.toFixed(2)} μs`;
    }

    // Update 10 MHz outputs
    if (state.active10MHzOutputs !== undefined) {
      const outputs = qs('#gpsdo-10mhz-outputs', this.containerEl);
      if (outputs) outputs.textContent = `${state.active10MHzOutputs}/${state.max10MHzOutputs}`;
    }

    // Update UTC accuracy
    if (state.utcAccuracy !== undefined) {
      const utcAcc = qs('#gpsdo-utc-accuracy', this.containerEl);
      if (utcAcc) utcAcc.textContent = `${state.utcAccuracy.toFixed(0)} ns`;
    }

    // Update operating hours
    if (state.operatingHours !== undefined) {
      const opHours = qs('#gpsdo-operating-hours', this.containerEl);
      if (opHours) opHours.textContent = `${state.operatingHours.toFixed(1)} hrs`;
    }
  }

  public dispose(): void {
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.RF_FE_GPSDO_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const powerSwitch = qs('#gpsdo-power', this.containerEl) as HTMLInputElement;
    const gnssSwitch = qs('#gpsdo-gnss-switch', this.containerEl) as HTMLInputElement;

    const powerHandler = this.boundHandlers.get('power');
    const gnssHandler = this.boundHandlers.get('gnss');

    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);
    if (gnssSwitch && gnssHandler) gnssSwitch.removeEventListener('change', gnssHandler);

    this.boundHandlers.clear();
  }
}
