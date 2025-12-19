import { qs } from "@app/engine/utils/query-selector";
import { GPSDOModuleCore } from "@app/equipment/rf-front-end/gpsdo-module/gpsdo-module-core";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";

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
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly gpsdoModule: GPSDOModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString_: string = '';
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly boundUpdateHandler_: () => void;

  constructor(gpsdoModule: GPSDOModuleCore, containerEl: HTMLElement) {
    this.gpsdoModule = gpsdoModule;
    this.containerEl = containerEl;
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    this.initialize();
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < GPSDOAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to UPDATE event for periodic updates (warmup timer, stability, etc.)
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    // Initial sync
    this.syncDomWithState_();
  }

  private setupDomCache_(): void {
    this.domCache_.set('powerSwitch', qs('#gpsdo-power', this.containerEl));
    this.domCache_.set('gnssSwitch', qs('#gpsdo-gnss-switch', this.containerEl));
    this.domCache_.set('lockBadge', qs('#gpsdo-lock-badge', this.containerEl));
    this.domCache_.set('gnssBadge', qs('#gpsdo-gnss-badge', this.containerEl));
    this.domCache_.set('warmupBadge', qs('#gpsdo-warmup-badge', this.containerEl));
    this.domCache_.set('holdoverBadge', qs('#gpsdo-holdover-badge', this.containerEl));
    this.domCache_.set('holdoverDuration', qs('#gpsdo-holdover-duration', this.containerEl));
    this.domCache_.set('holdoverProgress', qs('#gpsdo-holdover-progress', this.containerEl));
    this.domCache_.set('holdoverTtl', qs('#gpsdo-holdover-ttl', this.containerEl));
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
    this.lastStateString_ = ''; // Force update after power change
    this.syncDomWithState_();
  }

  private gnssHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.gpsdoModule.handleGnssToggle(isChecked, () => {
      this.lastStateString_ = ''; // Force update after GNSS callback
      this.syncDomWithState_();
    });
  }

  update(): void {
    this.syncDomWithState_();
  }

  private syncDomWithState_(): void {
    const state = this.gpsdoModule.state;

    // Prevent unnecessary updates by comparing full state
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString_) return;
    this.lastStateString_ = stateStr;

    const isPowered = state.isPowered;

    // Update Power switch
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    if (powerSwitch) powerSwitch.checked = isPowered;

    // Update GNSS switch
    const gnssSwitch = this.domCache_.get('gnssSwitch') as HTMLInputElement;
    if (gnssSwitch) gnssSwitch.checked = state.isGnssSwitchUp;

    // Update Lock Status Badge
    const lockBadge = this.domCache_.get('lockBadge');
    if (lockBadge) {
      const ledStatus = this.gpsdoModule.getLockLedStatus_();
      const badgeClass = this.getBadgeClass_(ledStatus);
      let text: string;
      if (!isPowered) {
        text = 'OFF';
      } else if (state.isGnssAcquiringLock) {
        text = 'ACQUIRING';
      } else if (state.isLocked) {
        text = 'LOCKED';
      } else {
        text = 'UNLOCKED';
      }
      lockBadge.textContent = text;
      lockBadge.className = `status-badge ${badgeClass}`;
    }

    // Update GNSS Status Badge
    const gnssBadge = this.domCache_.get('gnssBadge');
    if (gnssBadge) {
      const ledStatus = this.gpsdoModule.getGnssLedStatus_();
      const badgeClass = this.getBadgeClass_(ledStatus);
      let text: string;
      if (!isPowered) {
        text = 'OFF';
      } else if (!state.gnssSignalPresent) {
        text = 'NO SIGNAL';
      } else if ((state.satelliteCount ?? 0) < 4) {
        text = 'WEAK';
      } else {
        text = `${state.satelliteCount} SATS`;
      }
      gnssBadge.textContent = text;
      gnssBadge.className = `status-badge ${badgeClass}`;
    }

    // Update Warmup Status Badge
    const warmupBadge = this.domCache_.get('warmupBadge');
    if (warmupBadge) {
      const ledStatus = this.gpsdoModule.getWarmupLedStatus_();
      const badgeClass = this.getBadgeClass_(ledStatus);
      warmupBadge.textContent = isPowered ? this.gpsdoModule.formatWarmupTime_() : 'OFF';
      warmupBadge.className = `status-badge ${badgeClass}`;
    }

    // Update Holdover Status Badge
    const holdoverBadge = this.domCache_.get('holdoverBadge');
    if (holdoverBadge) {
      let text: string;
      let badgeClass: string;
      if (!isPowered) {
        text = 'OFF';
        badgeClass = 'status-badge-off';
      } else if (state.isInHoldover) {
        text = 'ACTIVE';
        badgeClass = 'status-badge-amber';
      } else {
        text = 'INACTIVE';
        badgeClass = 'status-badge-off';
      }
      holdoverBadge.textContent = text;
      holdoverBadge.className = `status-badge ${badgeClass}`;
    }

    // Update satellite count
    const satCount = this.domCache_.get('satelliteCount');
    if (satCount) satCount.textContent = isPowered ? state.satelliteCount.toString() : '--';

    // Update constellation
    const constellation = this.domCache_.get('constellation');
    if (constellation) constellation.textContent = isPowered ? state.constellation : '--';

    // Update UTC accuracy
    const utcAcc = this.domCache_.get('utcAccuracy');
    if (utcAcc) utcAcc.textContent = isPowered ? `${state.utcAccuracy.toFixed(0)} ns` : '-- ns';

    // Update temperature (always shows - even cooling down when off)
    const temp = this.domCache_.get('temperature');
    if (temp) temp.textContent = `${state.temperature.toFixed(1)} °C`;

    // Update operating hours (always shows)
    const opHours = this.domCache_.get('operatingHours');
    if (opHours) opHours.textContent = `${state.operatingHours.toFixed(1)} hrs`;

    // Update frequency accuracy
    const freqAcc = this.domCache_.get('freqAccuracy');
    if (freqAcc) freqAcc.textContent = isPowered ? `${state.frequencyAccuracy.toFixed(2)} ×10⁻¹¹` : '-- ×10⁻¹¹';

    // Update Allan deviation
    const allanDev = this.domCache_.get('allanDeviation');
    if (allanDev) allanDev.textContent = isPowered ? `${state.allanDeviation.toFixed(2)} ×10⁻¹¹` : '-- ×10⁻¹¹';

    // Update phase noise
    const phaseNoise = this.domCache_.get('phaseNoise');
    if (phaseNoise) phaseNoise.textContent = isPowered ? `${state.phaseNoise.toFixed(1)} dBc/Hz` : '-- dBc/Hz';

    // Update lock duration
    const lockDuration = this.domCache_.get('lockDuration');
    if (lockDuration) {
      if (isPowered) {
        const hours = Math.floor(state.lockDuration / 3600);
        const minutes = Math.floor((state.lockDuration % 3600) / 60);
        const seconds = state.lockDuration % 60;
        lockDuration.textContent = `${hours}h ${minutes}m ${seconds}s`;
      } else {
        lockDuration.textContent = '--h --m --s';
      }
    }

    // Update holdover error
    const holdoverError = this.domCache_.get('holdoverError');
    if (holdoverError) holdoverError.textContent = isPowered ? `${state.holdoverError.toFixed(2)} μs` : '-- μs';

    // Update holdover duration
    const holdoverDuration = this.domCache_.get('holdoverDuration');
    if (holdoverDuration) {
      if (isPowered && state.isInHoldover) {
        const hours = Math.floor(state.holdoverDuration / 3600);
        const minutes = Math.floor((state.holdoverDuration % 3600) / 60);
        const seconds = state.holdoverDuration % 60;
        holdoverDuration.textContent = `${hours}h ${minutes}m ${seconds}s`;
      } else {
        holdoverDuration.textContent = isPowered ? '0h 0m 0s' : '--';
      }
    }

    // Update holdover progress bar
    const holdoverProgress = this.domCache_.get('holdoverProgress');
    if (holdoverProgress) {
      const percentage = Math.min(100, (state.holdoverError / 40) * 100);
      holdoverProgress.style.width = `${percentage}%`;
      // Change color based on severity
      holdoverProgress.classList.remove('bg-success', 'bg-warning', 'bg-danger');
      if (percentage < 50) {
        holdoverProgress.classList.add('bg-success');
      } else if (percentage < 75) {
        holdoverProgress.classList.add('bg-warning');
      } else {
        holdoverProgress.classList.add('bg-danger');
      }
    }

    // Update time to limit
    const holdoverTtl = this.domCache_.get('holdoverTtl');
    if (holdoverTtl) {
      if (isPowered && state.isInHoldover && state.holdoverError < 40) {
        // Drift rate is ~1.67 μs/hour
        const remaining = (40 - state.holdoverError) / 1.67;
        holdoverTtl.textContent = `~${remaining.toFixed(1)} hrs`;
      } else if (isPowered && state.isInHoldover) {
        holdoverTtl.textContent = 'EXCEEDED';
      } else {
        holdoverTtl.textContent = '--';
      }
    }

    // Update 10 MHz outputs
    const outputs = this.domCache_.get('10mhzOutputs');
    if (outputs) outputs.textContent = isPowered ? `${state.active10MHzOutputs}/${state.max10MHzOutputs}` : '--/--';
  }

  dispose(): void {
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);

    // Remove DOM event listeners
    const powerSwitch = qs('#gpsdo-power', this.containerEl);
    const gnssSwitch = qs('#gpsdo-gnss-switch', this.containerEl);

    const powerHandler = this.boundHandlers.get('power');
    const gnssHandler = this.boundHandlers.get('gnss');

    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);
    if (gnssSwitch && gnssHandler) gnssSwitch.removeEventListener('change', gnssHandler);

    this.boundHandlers.clear();
  }
}
