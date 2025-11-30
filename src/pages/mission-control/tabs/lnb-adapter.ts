import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { LNBModuleCore, LNBState } from "@app/equipment/rf-front-end/lnb-module/lnb-module-core";
import { qs } from "@app/engine/utils/query-selector";
import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { AlarmStatus } from "@app/equipment/base-equipment";

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
  private readonly lnbModule: LNBModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<LNBState>) => void;
  private readonly alarmBadge_: CardAlarmBadge;

  // Staged values for Apply pattern
  private stagedLoFrequency_: number = 6080;
  private stagedGain_: number = 0;

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

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to LNB state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_LNB_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState_(this.lnbModule.state);
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
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.stagedLoFrequency_ = Math.max(5000, Math.min(7000, value));
    this.updateStagedDisplays_();
  }

  private adjustStagedLoFreq_(delta: number): void {
    this.stagedLoFrequency_ = Math.max(5000, Math.min(7000, this.stagedLoFrequency_ + delta));
    this.updateStagedDisplays_();
  }

  private gainInputHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.stagedGain_ = Math.max(0, Math.min(65, value));
    this.updateStagedDisplays_();
  }

  private adjustStagedGain_(delta: number): void {
    const newGain = this.stagedGain_ + delta;
    this.stagedGain_ = Math.round(Math.max(0, Math.min(65, newGain)) * 10) / 10;
    this.updateStagedDisplays_();
  }

  private updateStagedDisplays_(): void {
    const loInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    if (loInput) loInput.value = this.stagedLoFrequency_.toString();
    if (gainInput) gainInput.value = this.stagedGain_.toFixed(1);
  }

  private applyHandler_(): void {
    this.lnbModule.handleLoFrequencyChange(this.stagedLoFrequency_);
    this.lnbModule.handleGainChange(this.stagedGain_);
    this.syncDomWithState_(this.lnbModule.state);
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

    // Update staged values from state and refresh displays
    if (state.loFrequency !== undefined) {
      this.stagedLoFrequency_ = state.loFrequency;
    }
    if (state.gain !== undefined) {
      this.stagedGain_ = state.gain;
    }
    this.updateStagedDisplays_();

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update status indicators
    if (state.noiseTemperature !== undefined) {
      const display = this.domCache_.get('noiseTempDisplay');
      if (display) display.textContent = `${state.noiseTemperature.toFixed(0)} K`;
    }

    if (state.isExtRefLocked !== undefined) {
      const status = this.domCache_.get('lockStatus');
      if (status) {
        if (state.isExtRefLocked) {
          status.className = 'status-badge status-badge-locked';
          status.textContent = 'Locked';
        } else {
          status.className = 'status-badge status-badge-unlocked';
          status.textContent = 'Unlocked';
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
  private getAlarmsFromModule_(): AlarmStatus[] {
    const alarmStrings = this.lnbModule.getAlarms();
    return alarmStrings.map(message => ({
      severity: this.classifySeverity_(message),
      message
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
