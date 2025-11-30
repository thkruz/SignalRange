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
  private readonly gpsdoModule: GPSDOModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<GPSDOState>) => void;

  constructor(gpsdoModule: GPSDOModuleCore, containerEl: HTMLElement) {
    this.gpsdoModule = gpsdoModule;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<GPSDOState>) => {
      this.syncDomWithState_(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to GPSDO state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_GPSDO_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState_(this.gpsdoModule.state);
  }

  private setupDomCache_(): void {
    this.domCache_.set('powerSwitch', qs('#gpsdo-power', this.containerEl));
    this.domCache_.set('gnssSwitch', qs('#gpsdo-gnss-switch', this.containerEl));
    this.domCache_.set('lockBadge', qs('#gpsdo-lock-badge', this.containerEl));
    this.domCache_.set('gnssBadge', qs('#gpsdo-gnss-badge', this.containerEl));
    this.domCache_.set('warmupBadge', qs('#gpsdo-warmup-badge', this.containerEl));
    this.domCache_.set('holdoverBadge', qs('#gpsdo-holdover-badge', this.containerEl));
    this.domCache_.set('satelliteCount', qs('#gpsdo-satellite-count', this.containerEl));
    this.domCache_.set('constellation', qs('#gpsdo-constellation', this.containerEl));
    this.domCache_.set('freqAccuracy', qs('#gpsdo-freq-accuracy', this.containerEl));
    this.domCache_.set('allanDeviation', qs('#gpsdo-allan-deviation', this.containerEl));
    this.domCache_.set('phaseNoise', qs('#gpsdo-phase-noise', this.containerEl));
    this.domCache_.set('temperature', qs('#gpsdo-temperature', this.containerEl));
    this.domCache_.set('lockDuration', qs('#gpsdo-lock-duration', this.containerEl));
    this.domCache_.set('holdoverError', qs('#gpsdo-holdover-error', this.containerEl));
    this.domCache_.set('10mhzOutputs', qs('#gpsdo-10mhz-outputs', this.containerEl));
    this.domCache_.set('utcAccuracy', qs('#gpsdo-utc-accuracy', this.containerEl));
    this.domCache_.set('operatingHours', qs('#gpsdo-operating-hours', this.containerEl));
  }

  /**
   * Convert LED class to badge class
   */
  private getBadgeClass_(ledClass: string): string {
    switch (ledClass) {
      case 'led-green': return 'status-badge-green';
      case 'led-red': return 'status-badge-red';
      case 'led-amber': return 'status-badge-amber';
      default: return 'status-badge-off';
    }
  }

  private setupInputListeners_(): void {
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    const gnssSwitch = this.domCache_.get('gnssSwitch') as HTMLInputElement;

    // Power switch
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));

    // GNSS switch
    gnssSwitch?.addEventListener('change', this.gnssHandler_.bind(this));
    this.boundHandlers.set('gnss', this.gnssHandler_.bind(this));
  }

  private powerHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.gpsdoModule.handlePowerToggle(isChecked);
    this.syncDomWithState_(this.gpsdoModule.state);
  }

  private gnssHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.gpsdoModule.handleGnssToggle(isChecked, (state: GPSDOState) => {
      this.syncDomWithState_(state);
    });
  }

  update(): void {
    this.syncDomWithState_(this.gpsdoModule.state);
  }

  private syncDomWithState_(state: Partial<GPSDOState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update GNSS switch
    if (state.isGnssSwitchUp !== undefined) {
      const gnssSwitch = this.domCache_.get('gnssSwitch') as HTMLInputElement;
      if (gnssSwitch) gnssSwitch.checked = state.isGnssSwitchUp;
    }

    // Update Lock Status Badge
    if (state.isLocked !== undefined || state.isGnssAcquiringLock !== undefined || state.isPowered !== undefined) {
      const lockBadge = this.domCache_.get('lockBadge');
      const ledStatus = this.gpsdoModule.getLockLedStatus_();
      const badgeClass = this.getBadgeClass_(ledStatus);

      if (lockBadge) {
        let text: string;
        if (!this.gpsdoModule.state.isPowered) {
          text = 'OFF';
        } else if (this.gpsdoModule.state.isGnssAcquiringLock) {
          text = 'ACQUIRING';
        } else if (this.gpsdoModule.state.isLocked) {
          text = 'LOCKED';
        } else {
          text = 'UNLOCKED';
        }
        lockBadge.textContent = text;
        lockBadge.className = `status-badge ${badgeClass}`;
      }
    }

    // Update GNSS Status Badge
    if (state.gnssSignalPresent !== undefined || state.satelliteCount !== undefined || state.isPowered !== undefined) {
      const gnssBadge = this.domCache_.get('gnssBadge');
      const ledStatus = this.gpsdoModule.getGnssLedStatus_();
      const badgeClass = this.getBadgeClass_(ledStatus);

      if (gnssBadge) {
        let text: string;
        if (!this.gpsdoModule.state.isPowered) {
          text = 'OFF';
        } else if (!this.gpsdoModule.state.gnssSignalPresent) {
          text = 'NO SIGNAL';
        } else if ((this.gpsdoModule.state.satelliteCount ?? 0) < 4) {
          text = 'WEAK';
        } else {
          text = `${this.gpsdoModule.state.satelliteCount} SATS`;
        }
        gnssBadge.textContent = text;
        gnssBadge.className = `status-badge ${badgeClass}`;
      }
    }

    // Update Warmup Status Badge
    if (state.warmupTimeRemaining !== undefined || state.isPowered !== undefined) {
      const warmupBadge = this.domCache_.get('warmupBadge');
      const ledStatus = this.gpsdoModule.getWarmupLedStatus_();
      const badgeClass = this.getBadgeClass_(ledStatus);

      if (warmupBadge) {
        warmupBadge.textContent = this.gpsdoModule.formatWarmupTime_();
        warmupBadge.className = `status-badge ${badgeClass}`;
      }
    }

    // Update satellite count
    if (state.satelliteCount !== undefined) {
      const satCount = this.domCache_.get('satelliteCount');
      if (satCount) satCount.textContent = state.satelliteCount.toString();
    }

    // Update constellation
    if (state.constellation !== undefined) {
      const constellation = this.domCache_.get('constellation');
      if (constellation) constellation.textContent = state.constellation;
    }

    // Update frequency accuracy
    if (state.frequencyAccuracy !== undefined) {
      const freqAcc = this.domCache_.get('freqAccuracy');
      if (freqAcc) freqAcc.textContent = `${state.frequencyAccuracy.toFixed(2)} ×10⁻¹¹`;
    }

    // Update Allan deviation
    if (state.allanDeviation !== undefined) {
      const allanDev = this.domCache_.get('allanDeviation');
      if (allanDev) allanDev.textContent = `${state.allanDeviation.toFixed(2)} ×10⁻¹¹`;
    }

    // Update phase noise
    if (state.phaseNoise !== undefined) {
      const phaseNoise = this.domCache_.get('phaseNoise');
      if (phaseNoise) phaseNoise.textContent = `${state.phaseNoise.toFixed(1)} dBc/Hz`;
    }

    // Update temperature
    if (state.temperature !== undefined) {
      const temp = this.domCache_.get('temperature');
      if (temp) temp.textContent = `${state.temperature.toFixed(1)} °C`;
    }

    // Update lock duration
    if (state.lockDuration !== undefined) {
      const lockDuration = this.domCache_.get('lockDuration');
      if (lockDuration) {
        const hours = Math.floor(state.lockDuration / 3600);
        const minutes = Math.floor((state.lockDuration % 3600) / 60);
        const seconds = state.lockDuration % 60;
        lockDuration.textContent = `${hours}h ${minutes}m ${seconds}s`;
      }
    }

    // Update holdover status badge
    if (state.isInHoldover !== undefined || state.isPowered !== undefined) {
      const holdoverBadge = this.domCache_.get('holdoverBadge');
      if (holdoverBadge) {
        let text: string;
        let badgeClass: string;
        if (!this.gpsdoModule.state.isPowered) {
          text = 'OFF';
          badgeClass = 'status-badge-off';
        } else if (this.gpsdoModule.state.isInHoldover) {
          text = 'ACTIVE';
          badgeClass = 'status-badge-amber';
        } else {
          text = 'INACTIVE';
          badgeClass = 'status-badge-off';
        }
        holdoverBadge.textContent = text;
        holdoverBadge.className = `status-badge ${badgeClass}`;
      }
    }

    // Update holdover error
    if (state.holdoverError !== undefined) {
      const holdoverError = this.domCache_.get('holdoverError');
      if (holdoverError) holdoverError.textContent = `${state.holdoverError.toFixed(2)} μs`;
    }

    // Update 10 MHz outputs
    if (state.active10MHzOutputs !== undefined) {
      const outputs = this.domCache_.get('10mhzOutputs');
      if (outputs) outputs.textContent = `${state.active10MHzOutputs}/${state.max10MHzOutputs}`;
    }

    // Update UTC accuracy
    if (state.utcAccuracy !== undefined) {
      const utcAcc = this.domCache_.get('utcAccuracy');
      if (utcAcc) utcAcc.textContent = `${state.utcAccuracy.toFixed(0)} ns`;
    }

    // Update operating hours
    if (state.operatingHours !== undefined) {
      const opHours = this.domCache_.get('operatingHours');
      if (opHours) opHours.textContent = `${state.operatingHours.toFixed(1)} hrs`;
    }
  }

  dispose(): void {
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
