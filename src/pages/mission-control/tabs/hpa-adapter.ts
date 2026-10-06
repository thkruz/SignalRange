import { CardAlarmBadge } from '@app/components/card-alarm-badge/card-alarm-badge';
import { qs } from '@app/engine/utils/query-selector';
import { AlarmStatus } from '@app/equipment/base-equipment';
import { HPAModuleCore, HPAState } from '@app/equipment/rf-front-end/hpa-module/hpa-module-core';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { parseLocalizedNumber } from '@app/utils/parse-number';

/**
 * HPAAdapter - Bridges HPAModuleCore state to web controls
 *
 * Provides bidirectional synchronization between:
 * - DOM input controls (sliders, switches) → HPA Core handlers
 * - HPA Core state changes → DOM updates
 *
 * Prevents circular updates via state comparison
 */
export class HPAAdapter {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly hpaModule: HPAModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<HPAState>) => void;
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;

  // Staged values - not applied until Apply button is clicked
  private stagedBackOff_: number = 6;
  /**
   * True while the player has a staged back-off that differs from the applied
   * one. Toggles and external state events must not overwrite it; it clears on
   * Apply or when the staged value is brought back to the applied value.
   */
  private hasPendingEdit_ = false;

  constructor(hpaModule: HPAModuleCore, containerEl: HTMLElement) {
    this.hpaModule = hpaModule;
    this.containerEl = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('hpa-alarm-badge-led');
    const badgeContainer = qs('#hpa-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<HPAState>) => {
      this.syncDomWithState_(state);
    };

    // Bind update handler for periodic sync
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners();

    // Listen to HPA state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_HPA_CHANGED, this.stateChangeHandler as any);

    // Listen to UPDATE event for periodic sync of continuously-changing values
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    // Initial sync
    this.syncDomWithState_(this.hpaModule.state);
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < HPAAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    // Only sync read-only displays, not user-editable inputs
    this.syncReadOnlyDisplays_();
  }

  /**
   * Sync only read-only status displays (not user inputs)
   * Used by throttled UPDATE handler to avoid overwriting staged values
   */
  private syncReadOnlyDisplays_(): void {
    const state = this.hpaModule.state;
    const isPowered = state.isPowered;

    // Sync power switch in case HPA was auto-powered-off by BUC
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    if (powerSwitch && powerSwitch.checked !== isPowered) {
      powerSwitch.checked = isPowered;
      // Also update staged display since power state changed
      this.updateStagedDisplay_();
    }

    // Sync HPA enable switch in case it was changed externally (scenario/fault)
    const hpaEnableSwitch = this.domCache_.get('hpaEnableSwitch') as HTMLInputElement;
    if (hpaEnableSwitch && hpaEnableSwitch.checked !== state.isHpaEnabled) {
      hpaEnableSwitch.checked = state.isHpaEnabled;
    }

    // Applied value can change without an event (scenario/fault); keep the
    // staged input and pending indicator honest
    this.syncStagedFromState_(state.backOff);

    // Update Input Power display - shows BUC output, or "--" when BUC in loopback
    const inputPowerDisplay = this.domCache_.get('inputPowerDisplay');
    if (inputPowerDisplay) {
      const inputSignals = this.hpaModule.inputSignals;
      if (isPowered && inputSignals.length > 0) {
        inputPowerDisplay.textContent = `${inputSignals[0].power.toFixed(1)} dBm`;
      } else {
        inputPowerDisplay.textContent = '-- dBm';
      }
    }

    // Update Power Output displays
    const outputPowerDisplay = this.domCache_.get('outputPowerDisplay');
    if (outputPowerDisplay) {
      outputPowerDisplay.textContent = isPowered ? `${state.outputPower.toFixed(1)} dBm` : '-- dBm';
    }

    // Update power meter visualization
    if (isPowered) {
      this.updatePowerMeter_(state.outputPower);
    } else {
      this.clearPowerMeter_();
    }

    // Update power in watts
    const powerWatts = this.domCache_.get('powerWatts');
    if (powerWatts) {
      if (isPowered) {
        const watts = 10 ** ((state.outputPower - 30) / 10);
        if (watts >= 1) {
          powerWatts.textContent = `${watts.toFixed(0)} W`;
        } else {
          powerWatts.textContent = `${(watts * 1000).toFixed(0)} mW`;
        }
      } else {
        powerWatts.textContent = '-- W';
      }
    }

    // Update P1dB display
    const p1dbDisplay = this.domCache_.get('p1dbDisplay');
    if (p1dbDisplay) {
      p1dbDisplay.textContent = isPowered ? `${this.hpaModule.p1db.toFixed(1)} dBm` : '-- dBm';
    }

    // Update temperature display
    const temperatureDisplay = this.domCache_.get('temperatureDisplay');
    if (temperatureDisplay) {
      temperatureDisplay.textContent = isPowered ? `${state.temperature.toFixed(1)} °C` : '-- °C';
    }

    // Update overdrive status
    const overdriveStatus = this.domCache_.get('overdriveStatus');
    if (overdriveStatus) {
      if (isPowered) {
        overdriveStatus.textContent = state.isOverdriven ? 'OVERDRIVE' : 'Normal';
        overdriveStatus.className = state.isOverdriven ? 'status-badge status-badge-warning' : 'status-badge status-badge-good';
      } else {
        overdriveStatus.textContent = '--';
        overdriveStatus.className = 'status-badge status-badge-off';
      }
    }

    // Update IMD display
    const imdDisplay = this.domCache_.get('imdDisplay');
    if (imdDisplay) {
      imdDisplay.textContent = isPowered ? `${state.imdLevel.toFixed(1)} dBc` : '-- dBc';
    }

    // Update gain display
    const gainDisplay = this.domCache_.get('gainDisplay');
    if (gainDisplay) {
      gainDisplay.textContent = isPowered && state.isHpaEnabled ? `${state.gain.toFixed(1)} dB` : '-- dB';
    }

    // Update alarm badge
    const alarms = this.getAlarmsFromModule_();
    this.alarmBadge_.update(alarms);
  }

  private clearPowerMeter_(): void {
    const powerMeter = this.domCache_.get('powerMeter');
    if (!powerMeter) return;
    const segments = powerMeter.querySelectorAll('.power-segment');
    segments.forEach((segment) => {
      segment.className = 'power-segment led-off';
    });
  }

  private setupDomCache_() {
    // Back-off controls (input field is now the display)
    this.domCache_.set('backOffInput', qs('#hpa-backoff', this.containerEl));
    this.domCache_.set('backOffDecCoarse', qs('#hpa-backoff-dec-coarse', this.containerEl));
    this.domCache_.set('backOffDecFine', qs('#hpa-backoff-dec-fine', this.containerEl));
    this.domCache_.set('backOffIncFine', qs('#hpa-backoff-inc-fine', this.containerEl));
    this.domCache_.set('backOffIncCoarse', qs('#hpa-backoff-inc-coarse', this.containerEl));

    // Apply button
    this.domCache_.set('applyBtn', qs('#hpa-apply-btn', this.containerEl));

    // Switches
    this.domCache_.set('powerSwitch', qs('#hpa-power', this.containerEl));
    this.domCache_.set('hpaEnableSwitch', qs('#hpa-enable', this.containerEl));

    // Power displays
    this.domCache_.set('inputPowerDisplay', qs('#hpa-input-power-display', this.containerEl));
    this.domCache_.set('outputPowerDisplay', qs('#hpa-output-power-display', this.containerEl));
    this.domCache_.set('powerMeter', qs('#hpa-power-meter', this.containerEl));
    this.domCache_.set('powerWatts', qs('#hpa-power-watts', this.containerEl));
    this.domCache_.set('p1dbDisplay', qs('#hpa-p1db-display', this.containerEl));

    // Amplifier Status displays
    this.domCache_.set('gainDisplay', qs('#hpa-gain-display', this.containerEl));
    this.domCache_.set('temperatureDisplay', qs('#hpa-temperature-display', this.containerEl));

    // Signal Quality displays
    this.domCache_.set('imdDisplay', qs('#hpa-imd-display', this.containerEl));
    this.domCache_.set('overdriveStatus', qs('#hpa-overdrive-status', this.containerEl));
  }

  private setupInputListeners(): void {
    // Initialize staged value from current state
    this.stagedBackOff_ = this.hpaModule.state.backOff;

    // Back-off input and buttons - update staged values only
    const backOffInput = this.domCache_.get('backOffInput') as HTMLInputElement;
    const backOffDecCoarse = this.domCache_.get('backOffDecCoarse') as HTMLButtonElement;
    const backOffDecFine = this.domCache_.get('backOffDecFine') as HTMLButtonElement;
    const backOffIncFine = this.domCache_.get('backOffIncFine') as HTMLButtonElement;
    const backOffIncCoarse = this.domCache_.get('backOffIncCoarse') as HTMLButtonElement;

    backOffInput?.addEventListener('change', this.backOffInputHandler_.bind(this));
    this.boundHandlers.set('backOffInput', this.backOffInputHandler_.bind(this));

    backOffDecCoarse?.addEventListener('click', () => this.adjustStagedBackOff_(-5));
    backOffDecFine?.addEventListener('click', () => this.adjustStagedBackOff_(-1));
    backOffIncFine?.addEventListener('click', () => this.adjustStagedBackOff_(1));
    backOffIncCoarse?.addEventListener('click', () => this.adjustStagedBackOff_(5));

    // Apply button - applies staged values to core
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    applyBtn?.addEventListener('click', this.applyHandler_.bind(this));
    this.boundHandlers.set('apply', this.applyHandler_.bind(this));

    // Power switch - immediate effect
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));

    // HPA Enable switch - immediate effect
    const hpaEnableSwitch = this.domCache_.get('hpaEnableSwitch') as HTMLInputElement;
    hpaEnableSwitch?.addEventListener('change', this.hpaEnableHandler_.bind(this));
    this.boundHandlers.set('hpaEnable', this.hpaEnableHandler_.bind(this));
  }

  private backOffInputHandler_(e: Event) {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.setStagedBackOff_(value);
    }
  }

  private adjustStagedBackOff_(delta: number): void {
    this.setStagedBackOff_(this.stagedBackOff_ + delta);
  }

  /** Player edit: stage a new back-off and mark it pending until applied. */
  private setStagedBackOff_(value: number): void {
    this.stagedBackOff_ = Math.max(0, Math.min(30, value));
    this.hasPendingEdit_ = this.stagedBackOff_ !== this.hpaModule.state.backOff;
    this.updateStagedDisplay_(true);
  }

  /**
   * Follow the applied back-off only when the player has no pending edit, so a
   * toggle or external state event never silently discards a staged value.
   */
  private syncStagedFromState_(appliedBackOff: number | undefined): void {
    if (appliedBackOff === undefined) {
      return;
    }

    if (!this.hasPendingEdit_) {
      this.stagedBackOff_ = appliedBackOff;
    } else if (this.stagedBackOff_ === appliedBackOff) {
      this.hasPendingEdit_ = false;
    }

    this.updateStagedDisplay_();
  }

  /**
   * @param isUserEdit true when called from the player's own edit; otherwise a
   *   focused input is left alone (CLAUDE.md "Protecting Input Fields").
   */
  private updateStagedDisplay_(isUserEdit = false): void {
    const isPowered = this.hpaModule.state.isPowered;
    const backOffInput = this.domCache_.get('backOffInput') as HTMLInputElement;

    if (backOffInput && (isUserEdit || document.activeElement !== backOffInput)) {
      backOffInput.value = isPowered ? this.stagedBackOff_.toString() : '--';
    }
    if (backOffInput) {
      backOffInput.disabled = !isPowered;
    }

    // Disable adjust buttons when powered off
    this.setControlButtonsEnabled_(isPowered);
    this.updatePendingIndicator_();
  }

  /** Staged vs applied: pending style on the input and Apply, applied value in the tooltip. */
  private updatePendingIndicator_(): void {
    const appliedBackOff = this.hpaModule.state.backOff;
    const isPending = this.hpaModule.state.isPowered && this.stagedBackOff_ !== appliedBackOff;
    const backOffInput = this.domCache_.get('backOffInput') as HTMLInputElement;
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;

    if (backOffInput) {
      backOffInput.classList.toggle('is-pending', isPending);
      backOffInput.title = `Applied: ${appliedBackOff} dB${isPending ? ' (staged change not applied)' : ''}`;
    }
    applyBtn?.classList.toggle('is-pending', isPending);
  }

  private setControlButtonsEnabled_(enabled: boolean): void {
    const buttonKeys = ['backOffDecCoarse', 'backOffDecFine', 'backOffIncFine', 'backOffIncCoarse', 'applyBtn'];
    for (const key of buttonKeys) {
      const btn = this.domCache_.get(key) as HTMLButtonElement;
      if (btn) btn.disabled = !enabled;
    }
  }

  private applyHandler_(): void {
    // Apply staged value to the core module
    this.hpaModule.handleBackOffChange(this.stagedBackOff_);
    this.hasPendingEdit_ = false;
    this.syncDomWithState_(this.hpaModule.state);
    this.updateStagedDisplay_();
  }

  private powerHandler_(e: Event) {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.hpaModule.handlePowerToggle(isChecked, (state: HPAState) => {
      this.syncDomWithState_(state);
    });
  }

  private hpaEnableHandler_(e: Event) {
    const isChecked = (e.target as HTMLInputElement).checked;
    // Only toggle if state doesn't match checkbox value
    if (this.hpaModule.state.isHpaEnabled !== isChecked) {
      this.hpaModule.handleHpaToggle();
    }
    this.syncDomWithState_(this.hpaModule.state);
  }

  private syncDomWithState_(state: Partial<HPAState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    const isPowered = state.isPowered ?? this.hpaModule.state.isPowered;

    // Follow the applied back-off unless the player has a pending staged edit
    this.syncStagedFromState_(state.backOff);
    this.updateStagedDisplay_();

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update HPA Enable switch
    if (state.isHpaEnabled !== undefined) {
      const hpaEnableSwitch = this.domCache_.get('hpaEnableSwitch') as HTMLInputElement;
      if (hpaEnableSwitch) hpaEnableSwitch.checked = state.isHpaEnabled;
    }

    // Update Input Power display - shows BUC output, or "--" when BUC in loopback
    const inputPowerDisplay = this.domCache_.get('inputPowerDisplay');
    if (inputPowerDisplay) {
      const inputSignals = this.hpaModule.inputSignals;
      if (isPowered && inputSignals.length > 0) {
        inputPowerDisplay.textContent = `${inputSignals[0].power.toFixed(1)} dBm`;
      } else {
        inputPowerDisplay.textContent = '-- dBm';
      }
    }

    // Update Power Output displays - show "--" when powered off
    const outputPowerDisplay = this.domCache_.get('outputPowerDisplay');
    if (outputPowerDisplay) {
      if (isPowered && state.outputPower !== undefined) {
        outputPowerDisplay.textContent = `${state.outputPower.toFixed(1)} dBm`;
      } else if (!isPowered) {
        outputPowerDisplay.textContent = '-- dBm';
      }
    }

    // Update power meter visualization
    if (isPowered && state.outputPower !== undefined) {
      this.updatePowerMeter_(state.outputPower);
    } else if (!isPowered) {
      this.clearPowerMeter_();
    }

    // Update power in watts
    const wattsDisplay = this.domCache_.get('powerWatts');
    if (wattsDisplay) {
      if (isPowered && state.outputPower !== undefined) {
        const watts = 10 ** ((state.outputPower - 30) / 10);
        if (watts >= 1) {
          wattsDisplay.textContent = `${watts.toFixed(0)} W`;
        } else {
          wattsDisplay.textContent = `${(watts * 1000).toFixed(0)} mW`;
        }
      } else if (!isPowered) {
        wattsDisplay.textContent = '-- W';
      }
    }

    // Update P1dB display
    const p1dbDisplay = this.domCache_.get('p1dbDisplay');
    if (p1dbDisplay) {
      p1dbDisplay.textContent = isPowered ? '50.0 dBm' : '-- dBm';
    }

    // Update temperature display
    const temperatureDisplay = this.domCache_.get('temperatureDisplay');
    if (temperatureDisplay) {
      if (isPowered && state.temperature !== undefined) {
        temperatureDisplay.textContent = `${state.temperature.toFixed(1)} °C`;
      } else if (!isPowered) {
        temperatureDisplay.textContent = '-- °C';
      }
    }

    // Update overdrive status
    const overdriveStatus = this.domCache_.get('overdriveStatus');
    if (overdriveStatus) {
      if (isPowered && state.isOverdriven !== undefined) {
        overdriveStatus.textContent = state.isOverdriven ? 'OVERDRIVE' : 'Normal';
        overdriveStatus.className = state.isOverdriven ? 'status-badge status-badge-warning' : 'status-badge status-badge-good';
      } else if (!isPowered) {
        overdriveStatus.textContent = '--';
        overdriveStatus.className = 'status-badge status-badge-off';
      }
    }

    // Update IMD display
    const imdDisplay = this.domCache_.get('imdDisplay');
    if (imdDisplay) {
      if (isPowered && state.imdLevel !== undefined) {
        imdDisplay.textContent = `${state.imdLevel.toFixed(1)} dBc`;
      } else if (!isPowered) {
        imdDisplay.textContent = '-- dBc';
      }
    }

    // Update gain display
    // Gain is only meaningful while the HPA is enabled and amplifying
    const gainDisplay = this.domCache_.get('gainDisplay');
    if (gainDisplay) {
      const isEnabled = state.isHpaEnabled ?? this.hpaModule.state.isHpaEnabled;
      if (isPowered && isEnabled && state.gain !== undefined) {
        gainDisplay.textContent = `${state.gain.toFixed(1)} dB`;
      } else if (!isPowered || !isEnabled) {
        gainDisplay.textContent = '-- dB';
      }
    }

    // Update alarm badge - immediate feedback
    const alarms = this.getAlarmsFromModule_();
    this.alarmBadge_.update(alarms);
  }

  /**
   * Update power meter LED segments based on output power
   * Green: normal operation (0-70%), Yellow: approaching saturation (70-90%), Red: overdrive (90-100%)
   */
  private updatePowerMeter_(outputPowerDbm: number): void {
    const powerMeter = this.domCache_.get('powerMeter');
    if (!powerMeter) return;

    // P1dB is 50 dBm, so scale from ~30 dBm (low) to 50 dBm (max)
    const minPower = 30;
    const maxPower = 63;
    const normalized = Math.max(0, Math.min(1, (outputPowerDbm - minPower) / (maxPower - minPower)));
    const activeSegments = Math.round(normalized * 10);

    const segments = powerMeter.querySelectorAll('.power-segment');
    segments.forEach((segment, index) => {
      if (index < activeSegments) {
        // Determine color based on segment position (10 segments total)
        // Green: 0-6 (70%), Yellow: 7-8 (70-90%), Red: 9 (90-100%)
        if (index >= 9) {
          segment.className = 'power-segment led-red';
        } else if (index >= 7) {
          segment.className = 'power-segment led-yellow';
        } else {
          segment.className = 'power-segment led-green';
        }
      } else {
        segment.className = 'power-segment led-off';
      }
    });
  }

  /**
   * Get current alarms from HPA module as AlarmStatus array
   */
  private getAlarmsFromModule_(): AlarmStatus[] {
    const alarmStrings = this.hpaModule.getAlarms();
    return alarmStrings.map((message) => ({
      severity: this.classifySeverity_(message),
      message,
    }));
  }

  /**
   * Classify alarm message severity based on content
   */
  private classifySeverity_(message: string): AlarmStatus['severity'] {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('overdrive') || lowerMsg.includes('over-temperature')) {
      return 'error';
    }
    if (lowerMsg.includes('warning') || lowerMsg.includes('enabled without')) {
      return 'warning';
    }
    return 'warning'; // Default to warning for any alarm
  }

  dispose(): void {
    // Dispose alarm badge
    this.alarmBadge_.dispose();

    // Remove EventBus listeners
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    EventBus.getInstance().off(Events.RF_FE_HPA_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners for inputs
    const backOffInput = this.domCache_.get('backOffInput') as HTMLInputElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    const hpaEnableSwitch = this.domCache_.get('hpaEnableSwitch') as HTMLInputElement;

    const backOffHandler = this.boundHandlers.get('backOffInput');
    const powerHandler = this.boundHandlers.get('power');
    const hpaEnableHandler = this.boundHandlers.get('hpaEnable');

    if (backOffInput && backOffHandler) backOffInput.removeEventListener('change', backOffHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);
    if (hpaEnableSwitch && hpaEnableHandler) hpaEnableSwitch.removeEventListener('change', hpaEnableHandler);

    // Note: Button click handlers use inline arrow functions and are cleaned up when DOM is removed
    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
