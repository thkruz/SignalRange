import { CardAlarmBadge } from '@app/components/card-alarm-badge/card-alarm-badge';
import { qs } from '@app/engine/utils/query-selector';
import { AlarmStatus } from '@app/equipment/base-equipment';
import { LNBModuleCore, LNBState } from '@app/equipment/rf-front-end/lnb-module/lnb-module-core';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { parseLocalizedNumber } from '@app/utils/parse-number';

/**
 * LNBAdapter - Bridges LNBModuleCore state to web controls
 *
 * Provides bidirectional synchronization between:
 * - DOM input controls (sliders, switches) → LNB Core handlers
 * - LNB Core state changes → DOM updates
 *
 * Prevents circular updates via state comparison
 */
export class LNBAdapter {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly lnbModule: LNBModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<LNBState>) => void;
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;

  // Staged values for Apply pattern
  private stagedLoFrequency_: number = 6080;
  private stagedGain_: number = 0;
  /**
   * Pending (staged but not applied) edits. Power toggles and external state
   * events must not overwrite a pending staged value; it clears on Apply or
   * when the staged value is brought back to the applied one.
   */
  private hasPendingLoEdit_ = false;
  private hasPendingGainEdit_ = false;

  constructor(lnbModule: LNBModuleCore, containerEl: HTMLElement) {
    this.lnbModule = lnbModule;
    this.containerEl = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('lnb-alarm-badge-led');
    const badgeContainer = qs('#lnb-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<LNBState>) => {
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
    this.setupInputListeners_();

    // Listen to LNB state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_LNB_CHANGED, this.stateChangeHandler as any);

    // Listen to UPDATE event for periodic sync of continuously-changing values
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    // Initial sync
    this.syncDomWithState_(this.lnbModule.state);
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < LNBAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    // Only sync read-only displays, not user-editable inputs
    this.syncReadOnlyDisplays_();
  }

  /**
   * Sync only read-only status displays (not user inputs)
   * Used by throttled UPDATE handler to avoid overwriting staged values
   */
  private syncReadOnlyDisplays_(): void {
    const state = this.lnbModule.state;
    const isPowered = state.isPowered;

    // Sync power switch from external changes (scenario events, faults)
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement | undefined;
    if (powerSwitch && document.activeElement !== powerSwitch && powerSwitch.checked !== isPowered) {
      powerSwitch.checked = isPowered;
    }

    // Applied values can change without an event; keep staged inputs and the
    // pending indicator honest (pending edits are preserved)
    this.syncStagedFromState_(state.loFrequency, state.gain);

    // Update noise temperature display
    const noiseTempDisplay = this.domCache_.get('noiseTempDisplay');
    if (noiseTempDisplay) {
      noiseTempDisplay.textContent = isPowered ? `${state.noiseTemperature.toFixed(0)} K` : '-- K';
    }

    this.syncThermalAndLoError_();

    // Update lock status
    const lockStatus = this.domCache_.get('lockStatus');
    if (lockStatus) {
      if (!isPowered) {
        lockStatus.className = 'status-badge status-badge-off';
        lockStatus.textContent = '--';
      } else if (state.isExtRefLocked) {
        lockStatus.className = 'status-badge status-badge-locked';
        lockStatus.textContent = 'Locked';
      } else {
        lockStatus.className = 'status-badge status-badge-unlocked';
        lockStatus.textContent = 'Unlocked';
      }
    }

    // Update alarm badge
    const alarms = this.getAlarmsFromModule_();
    this.alarmBadge_.update(alarms);
  }

  private setupDomCache_(): void {
    // LO Frequency controls
    this.domCache_.set('loFreqInput', qs('#lnb-lo-frequency', this.containerEl));
    this.domCache_.set('loDecCoarse', qs('#lnb-lo-dec-coarse', this.containerEl));
    this.domCache_.set('loDecFine', qs('#lnb-lo-dec-fine', this.containerEl));
    this.domCache_.set('loIncFine', qs('#lnb-lo-inc-fine', this.containerEl));
    this.domCache_.set('loIncCoarse', qs('#lnb-lo-inc-coarse', this.containerEl));

    // Gain controls
    this.domCache_.set('gainInput', qs('#lnb-gain', this.containerEl));
    this.domCache_.set('gainDecCoarse', qs('#lnb-gain-dec-coarse', this.containerEl));
    this.domCache_.set('gainDecFine', qs('#lnb-gain-dec-fine', this.containerEl));
    this.domCache_.set('gainIncFine', qs('#lnb-gain-inc-fine', this.containerEl));
    this.domCache_.set('gainIncCoarse', qs('#lnb-gain-inc-coarse', this.containerEl));

    // Apply button, power switch, status displays
    this.domCache_.set('applyBtn', qs('#lnb-apply-btn', this.containerEl));
    this.domCache_.set('powerSwitch', qs('#lnb-power', this.containerEl));
    this.domCache_.set('noiseTempDisplay', qs('#lnb-noise-temp-display', this.containerEl));
    this.domCache_.set('lockStatus', qs('#lnb-lock-status', this.containerEl));
    // Phase 19.6 readouts (optional: older layouts may not have them)
    const thermalStatus = this.containerEl.querySelector<HTMLElement>('#lnb-thermal-status');
    if (thermalStatus) this.domCache_.set('thermalStatus', thermalStatus);
    const loError = this.containerEl.querySelector<HTMLElement>('#lnb-lo-error-display');
    if (loError) this.domCache_.set('loErrorDisplay', loError);
  }

  private setupInputListeners_(): void {
    // LO Frequency controls
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const loDecCoarse = this.domCache_.get('loDecCoarse') as HTMLButtonElement;
    const loDecFine = this.domCache_.get('loDecFine') as HTMLButtonElement;
    const loIncFine = this.domCache_.get('loIncFine') as HTMLButtonElement;
    const loIncCoarse = this.domCache_.get('loIncCoarse') as HTMLButtonElement;

    // Gain controls
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const gainDecCoarse = this.domCache_.get('gainDecCoarse') as HTMLButtonElement;
    const gainDecFine = this.domCache_.get('gainDecFine') as HTMLButtonElement;
    const gainIncFine = this.domCache_.get('gainIncFine') as HTMLButtonElement;
    const gainIncCoarse = this.domCache_.get('gainIncCoarse') as HTMLButtonElement;

    // Apply button and power switch
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;

    // LO Frequency input change updates staged value
    loFreqInput?.addEventListener('change', this.loFreqInputHandler_.bind(this));
    this.boundHandlers.set('loFreqInput', this.loFreqInputHandler_.bind(this));

    // LO Frequency buttons
    loDecCoarse?.addEventListener('click', () => this.adjustStagedLoFreq_(-100));
    loDecFine?.addEventListener('click', () => this.adjustStagedLoFreq_(-10));
    loIncFine?.addEventListener('click', () => this.adjustStagedLoFreq_(10));
    loIncCoarse?.addEventListener('click', () => this.adjustStagedLoFreq_(100));

    this.boundHandlers.set('loDecCoarse', () => this.adjustStagedLoFreq_(-100));
    this.boundHandlers.set('loDecFine', () => this.adjustStagedLoFreq_(-10));
    this.boundHandlers.set('loIncFine', () => this.adjustStagedLoFreq_(10));
    this.boundHandlers.set('loIncCoarse', () => this.adjustStagedLoFreq_(100));

    // Gain input change updates staged value
    gainInput?.addEventListener('change', this.gainInputHandler_.bind(this));
    this.boundHandlers.set('gainInput', this.gainInputHandler_.bind(this));

    // Gain buttons
    gainDecCoarse?.addEventListener('click', () => this.adjustStagedGain_(-1));
    gainDecFine?.addEventListener('click', () => this.adjustStagedGain_(-0.1));
    gainIncFine?.addEventListener('click', () => this.adjustStagedGain_(0.1));
    gainIncCoarse?.addEventListener('click', () => this.adjustStagedGain_(1));

    this.boundHandlers.set('gainDecCoarse', () => this.adjustStagedGain_(-1));
    this.boundHandlers.set('gainDecFine', () => this.adjustStagedGain_(-0.1));
    this.boundHandlers.set('gainIncFine', () => this.adjustStagedGain_(0.1));
    this.boundHandlers.set('gainIncCoarse', () => this.adjustStagedGain_(1));

    // Apply button
    applyBtn?.addEventListener('click', this.applyHandler_.bind(this));
    this.boundHandlers.set('apply', this.applyHandler_.bind(this));

    // Power switch
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));
  }

  private loFreqInputHandler_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) {
      this.setStagedLoFrequency_(value);
    }
  }

  private adjustStagedLoFreq_(delta: number): void {
    this.setStagedLoFrequency_(this.stagedLoFrequency_ + delta);
  }

  /** Player edit: stage a new LO and mark it pending until applied. */
  private setStagedLoFrequency_(value: number): void {
    this.stagedLoFrequency_ = Math.max(5000, Math.min(7000, value));
    this.hasPendingLoEdit_ = this.stagedLoFrequency_ !== this.lnbModule.state.loFrequency;
    this.updateStagedDisplays_(true);
  }

  private gainInputHandler_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) {
      this.setStagedGain_(Math.max(0, Math.min(65, value)));
    }
  }

  private adjustStagedGain_(delta: number): void {
    const newGain = this.stagedGain_ + delta;
    this.setStagedGain_(Math.round(Math.max(0, Math.min(65, newGain)) * 10) / 10);
  }

  /** Player edit: stage a new gain and mark it pending until applied. */
  private setStagedGain_(value: number): void {
    this.stagedGain_ = value;
    this.hasPendingGainEdit_ = this.stagedGain_ !== this.lnbModule.state.gain;
    this.updateStagedDisplays_(true);
  }

  /**
   * Follow the applied values only where the player has no pending edit, so a
   * power toggle or external state event never silently discards a staged value.
   */
  private syncStagedFromState_(appliedLo: number | undefined, appliedGain: number | undefined): void {
    if (appliedLo !== undefined) {
      if (!this.hasPendingLoEdit_) {
        this.stagedLoFrequency_ = appliedLo;
      } else if (this.stagedLoFrequency_ === appliedLo) {
        this.hasPendingLoEdit_ = false;
      }
    }
    if (appliedGain !== undefined) {
      if (!this.hasPendingGainEdit_) {
        this.stagedGain_ = appliedGain;
      } else if (this.stagedGain_ === appliedGain) {
        this.hasPendingGainEdit_ = false;
      }
    }
    this.updateStagedDisplays_();
  }

  /**
   * @param isUserEdit true when called from the player's own edit; otherwise a
   *   focused input is left alone (CLAUDE.md "Protecting Input Fields").
   */
  private updateStagedDisplays_(isUserEdit = false): void {
    const isPowered = this.lnbModule.state.isPowered;
    const loInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;

    if (loInput) {
      if (isUserEdit || document.activeElement !== loInput) {
        loInput.value = isPowered ? this.stagedLoFrequency_.toString() : '--';
      }
      loInput.disabled = !isPowered;
    }
    if (gainInput) {
      if (isUserEdit || document.activeElement !== gainInput) {
        gainInput.value = isPowered ? this.stagedGain_.toFixed(1) : '--';
      }
      gainInput.disabled = !isPowered;
    }

    // Disable adjust buttons when powered off
    this.setControlButtonsEnabled_(isPowered);
    this.updatePendingIndicator_();
  }

  /** Staged vs applied: pending style on the inputs and Apply, applied value in the tooltip. */
  private updatePendingIndicator_(): void {
    const state = this.lnbModule.state;
    const isLoPending = state.isPowered && this.stagedLoFrequency_ !== state.loFrequency;
    const isGainPending = state.isPowered && this.stagedGain_ !== state.gain;
    const loInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;

    if (loInput) {
      loInput.classList.toggle('is-pending', isLoPending);
      loInput.title = `Applied: ${state.loFrequency} MHz${isLoPending ? ' (staged change not applied)' : ''}`;
    }
    if (gainInput) {
      gainInput.classList.toggle('is-pending', isGainPending);
      gainInput.title = `Applied: ${Number(state.gain).toFixed(1)} dB${isGainPending ? ' (staged change not applied)' : ''}`;
    }
    applyBtn?.classList.toggle('is-pending', isLoPending || isGainPending);
  }

  private setControlButtonsEnabled_(enabled: boolean): void {
    const buttonKeys = ['loDecCoarse', 'loDecFine', 'loIncFine', 'loIncCoarse', 'gainDecCoarse', 'gainDecFine', 'gainIncFine', 'gainIncCoarse', 'applyBtn'];
    for (const key of buttonKeys) {
      const btn = this.domCache_.get(key) as HTMLButtonElement;
      if (btn) btn.disabled = !enabled;
    }
  }

  private applyHandler_(): void {
    this.lnbModule.handleLoFrequencyChange(this.stagedLoFrequency_);
    this.lnbModule.handleGainChange(this.stagedGain_);
    this.hasPendingLoEdit_ = false;
    this.hasPendingGainEdit_ = false;
    this.syncDomWithState_(this.lnbModule.state);
    this.updateStagedDisplays_();
  }

  private powerHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.lnbModule.handlePowerToggle(isChecked);
    this.syncDomWithState_(this.lnbModule.state);
  }

  update(): void {
    this.syncDomWithState_(this.lnbModule.state);
  }

  private syncDomWithState_(state: Partial<LNBState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    const isPowered = state.isPowered ?? this.lnbModule.state.isPowered;

    // Follow applied values unless the player has a pending staged edit
    this.syncStagedFromState_(state.loFrequency, state.gain);

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update status indicators - show "--" when powered off
    const noiseTempDisplay = this.domCache_.get('noiseTempDisplay');
    if (noiseTempDisplay) {
      if (!isPowered) {
        noiseTempDisplay.textContent = '-- K';
      } else if (state.noiseTemperature !== undefined) {
        noiseTempDisplay.textContent = `${state.noiseTemperature.toFixed(0)} K`;
      }
    }

    const lockStatus = this.domCache_.get('lockStatus');
    if (lockStatus) {
      if (!isPowered) {
        lockStatus.className = 'status-badge status-badge-off';
        lockStatus.textContent = '--';
      } else if (state.isExtRefLocked !== undefined) {
        if (state.isExtRefLocked) {
          lockStatus.className = 'status-badge status-badge-locked';
          lockStatus.textContent = 'Locked';
        } else {
          lockStatus.className = 'status-badge status-badge-unlocked';
          lockStatus.textContent = 'Unlocked';
        }
      }
    }

    // Update alarm badge - immediate feedback
    const alarms = this.getAlarmsFromModule_();
    this.alarmBadge_.update(alarms);
  }

  /**
   * Get current alarms from LNB module as AlarmStatus array
   */
  /**
   * Thermal stabilization and LO error readouts (Phase 19.6): "Warming 1:20"
   * until the LNB has been on for its stabilization time, then "Stable"; the
   * LO's frequency error (the reference's when locked, the free-running
   * oscillator's when not).
   */
  private syncThermalAndLoError_(): void {
    const lnb = this.lnbModule;
    const state = lnb.state;
    const thermal = this.domCache_.get('thermalStatus');
    if (thermal) {
      if (!state.isPowered) {
        thermal.textContent = '--';
      } else if (lnb.isThermallyStable()) {
        thermal.textContent = `Stable (${state.temperature.toFixed(0)} °C)`;
      } else {
        const settleS = Math.max(state.thermalStabilizationTime, state.noiseTemperatureStabilizationTime);
        const leftS = Math.max(0, Math.ceil(settleS - lnb.secondsSincePowerOn));
        thermal.textContent = `Warming ${Math.floor(leftS / 60)}:${String(leftS % 60).padStart(2, '0')} (${state.temperature.toFixed(0)} °C)`;
      }
    }
    const loError = this.domCache_.get('loErrorDisplay');
    if (loError) {
      if (!state.isPowered || state.isDirectSampling) {
        loError.textContent = '--';
      } else {
        const hz = state.frequencyError;
        loError.textContent = Math.abs(hz) >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${hz.toFixed(Math.abs(hz) < 10 ? 2 : 0)} Hz`;
      }
    }
  }

  private getAlarmsFromModule_(): AlarmStatus[] {
    const alarmStrings = this.lnbModule.getAlarms();
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
    if (lowerMsg.includes('not locked') || lowerMsg.includes('error')) {
      return 'warning';
    }
    return 'warning'; // Default to warning for any alarm
  }

  dispose(): void {
    // Dispose alarm badge
    this.alarmBadge_.dispose();
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    EventBus.getInstance().off(Events.RF_FE_LNB_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const loDecCoarse = this.domCache_.get('loDecCoarse') as HTMLButtonElement;
    const loDecFine = this.domCache_.get('loDecFine') as HTMLButtonElement;
    const loIncFine = this.domCache_.get('loIncFine') as HTMLButtonElement;
    const loIncCoarse = this.domCache_.get('loIncCoarse') as HTMLButtonElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const gainDecCoarse = this.domCache_.get('gainDecCoarse') as HTMLButtonElement;
    const gainDecFine = this.domCache_.get('gainDecFine') as HTMLButtonElement;
    const gainIncFine = this.domCache_.get('gainIncFine') as HTMLButtonElement;
    const gainIncCoarse = this.domCache_.get('gainIncCoarse') as HTMLButtonElement;
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;

    const loFreqInputHandler = this.boundHandlers.get('loFreqInput');
    const gainInputHandler = this.boundHandlers.get('gainInput');
    const applyHandler = this.boundHandlers.get('apply');
    const powerHandler = this.boundHandlers.get('power');

    if (loFreqInput && loFreqInputHandler) loFreqInput.removeEventListener('change', loFreqInputHandler);
    if (loDecCoarse) loDecCoarse.removeEventListener('click', this.boundHandlers.get('loDecCoarse')!);
    if (loDecFine) loDecFine.removeEventListener('click', this.boundHandlers.get('loDecFine')!);
    if (loIncFine) loIncFine.removeEventListener('click', this.boundHandlers.get('loIncFine')!);
    if (loIncCoarse) loIncCoarse.removeEventListener('click', this.boundHandlers.get('loIncCoarse')!);
    if (gainInput && gainInputHandler) gainInput.removeEventListener('change', gainInputHandler);
    if (gainDecCoarse) gainDecCoarse.removeEventListener('click', this.boundHandlers.get('gainDecCoarse')!);
    if (gainDecFine) gainDecFine.removeEventListener('click', this.boundHandlers.get('gainDecFine')!);
    if (gainIncFine) gainIncFine.removeEventListener('click', this.boundHandlers.get('gainIncFine')!);
    if (gainIncCoarse) gainIncCoarse.removeEventListener('click', this.boundHandlers.get('gainIncCoarse')!);
    if (applyBtn && applyHandler) applyBtn.removeEventListener('click', applyHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);

    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
