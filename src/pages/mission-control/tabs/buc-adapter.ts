import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { BUCModuleCore, BUCState } from "@app/equipment/rf-front-end/buc-module/buc-module-core";
import { qs } from "@app/engine/utils/query-selector";
import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { AlarmStatus } from "@app/equipment/base-equipment";

/**
 * BUCAdapter - Bridges BUCModuleCore state to web controls
 *
 * Provides bidirectional synchronization between:
 * - DOM input controls (sliders, switches) → BUC Core handlers
 * - BUC Core state changes → DOM updates
 *
 * Prevents circular updates via state comparison
 */
export class BUCAdapter {
  private readonly bucModule: BUCModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<BUCState>) => void;
  private readonly alarmBadge_: CardAlarmBadge;

  // Staged values - not applied until Apply button is clicked
  private stagedLoFrequency_: number = 6425;
  private stagedGain_: number = 58;

  constructor(bucModule: BUCModuleCore, containerEl: HTMLElement) {
    this.bucModule = bucModule;
    this.containerEl = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('buc-alarm-badge-led');
    const badgeContainer = qs('#buc-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<BUCState>) => {
      this.syncDomWithState_(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to BUC state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_BUC_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState_(this.bucModule.state);
  }

  private setupDomCache_(): void {
    // LO Frequency controls (input field is now the display)
    this.domCache_.set('loFreqInput', qs('#buc-lo-frequency', this.containerEl));
    this.domCache_.set('loDecCoarse', qs('#buc-lo-dec-coarse', this.containerEl));
    this.domCache_.set('loDecFine', qs('#buc-lo-dec-fine', this.containerEl));
    this.domCache_.set('loIncFine', qs('#buc-lo-inc-fine', this.containerEl));
    this.domCache_.set('loIncCoarse', qs('#buc-lo-inc-coarse', this.containerEl));

    // Gain controls (input field is now the display)
    this.domCache_.set('gainInput', qs('#buc-gain', this.containerEl));
    this.domCache_.set('gainDecCoarse', qs('#buc-gain-dec-coarse', this.containerEl));
    this.domCache_.set('gainDecFine', qs('#buc-gain-dec-fine', this.containerEl));
    this.domCache_.set('gainIncFine', qs('#buc-gain-inc-fine', this.containerEl));
    this.domCache_.set('gainIncCoarse', qs('#buc-gain-inc-coarse', this.containerEl));

    // Apply button
    this.domCache_.set('applyBtn', qs('#buc-apply-btn', this.containerEl));

    // Switches
    this.domCache_.set('powerSwitch', qs('#buc-power', this.containerEl));
    this.domCache_.set('muteSwitch', qs('#buc-mute', this.containerEl));

    // RF Status displays
    this.domCache_.set('outputPowerDisplay', qs('#buc-output-power-display', this.containerEl));
    this.domCache_.set('p1dbMarginDisplay', qs('#buc-p1db-margin-display', this.containerEl));
    this.domCache_.set('lockStatus', qs('#buc-lock-status', this.containerEl));

    // Thermal displays
    this.domCache_.set('temperatureDisplay', qs('#buc-temperature-display', this.containerEl));
    this.domCache_.set('currentDisplay', qs('#buc-current-display', this.containerEl));

    // Signal Quality displays
    this.domCache_.set('phaseNoiseDisplay', qs('#buc-phase-noise-display', this.containerEl));
    this.domCache_.set('freqErrorDisplay', qs('#buc-freq-error-display', this.containerEl));
  }

  private setupInputListeners_(): void {
    // Initialize staged values from current state
    this.stagedLoFrequency_ = this.bucModule.state.loFrequency;
    this.stagedGain_ = this.bucModule.state.gain;

    // LO Frequency input and buttons - update staged values only
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const loDecCoarse = this.domCache_.get('loDecCoarse') as HTMLButtonElement;
    const loDecFine = this.domCache_.get('loDecFine') as HTMLButtonElement;
    const loIncFine = this.domCache_.get('loIncFine') as HTMLButtonElement;
    const loIncCoarse = this.domCache_.get('loIncCoarse') as HTMLButtonElement;

    loFreqInput?.addEventListener('change', this.loFreqInputHandler_.bind(this));
    this.boundHandlers.set('loFreqInput', this.loFreqInputHandler_.bind(this));

    loDecCoarse?.addEventListener('click', () => this.adjustStagedLoFrequency_(-100));
    loDecFine?.addEventListener('click', () => this.adjustStagedLoFrequency_(-10));
    loIncFine?.addEventListener('click', () => this.adjustStagedLoFrequency_(10));
    loIncCoarse?.addEventListener('click', () => this.adjustStagedLoFrequency_(100));

    // Gain input and buttons - update staged values only
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const gainDecCoarse = this.domCache_.get('gainDecCoarse') as HTMLButtonElement;
    const gainDecFine = this.domCache_.get('gainDecFine') as HTMLButtonElement;
    const gainIncFine = this.domCache_.get('gainIncFine') as HTMLButtonElement;
    const gainIncCoarse = this.domCache_.get('gainIncCoarse') as HTMLButtonElement;

    gainInput?.addEventListener('change', this.gainInputHandler_.bind(this));
    this.boundHandlers.set('gainInput', this.gainInputHandler_.bind(this));

    gainDecCoarse?.addEventListener('click', () => this.adjustStagedGain_(-1));
    gainDecFine?.addEventListener('click', () => this.adjustStagedGain_(-0.5));
    gainIncFine?.addEventListener('click', () => this.adjustStagedGain_(0.5));
    gainIncCoarse?.addEventListener('click', () => this.adjustStagedGain_(1));

    // Apply button - applies staged values to core
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    applyBtn?.addEventListener('click', this.applyHandler_.bind(this));
    this.boundHandlers.set('apply', this.applyHandler_.bind(this));

    // Power switch - immediate effect
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));

    // Mute switch - immediate effect
    const muteSwitch = this.domCache_.get('muteSwitch') as HTMLInputElement;
    muteSwitch?.addEventListener('change', this.muteHandler_.bind(this));
    this.boundHandlers.set('mute', this.muteHandler_.bind(this));
  }

  private loFreqInputHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.stagedLoFrequency_ = Math.max(6000, Math.min(7000, value));
      this.updateStagedDisplay_();
    }
  }

  private adjustStagedLoFrequency_(delta: number): void {
    this.stagedLoFrequency_ = Math.max(6000, Math.min(7000, this.stagedLoFrequency_ + delta));
    this.updateStagedDisplay_();
  }

  private gainInputHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.stagedGain_ = Math.max(0, Math.min(70, value));
      this.updateStagedDisplay_();
    }
  }

  private adjustStagedGain_(delta: number): void {
    this.stagedGain_ = Math.max(0, Math.min(70, this.stagedGain_ + delta));
    this.updateStagedDisplay_();
  }

  private updateStagedDisplay_(): void {
    // Update input fields with staged values
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    if (loFreqInput) loFreqInput.value = this.stagedLoFrequency_.toString();
    if (gainInput) gainInput.value = this.stagedGain_.toString();
  }

  private applyHandler_(): void {
    // Apply staged values to the core module
    this.bucModule.handleLoFrequencyChange(this.stagedLoFrequency_);
    this.bucModule.handleGainChange(this.stagedGain_);
    this.syncDomWithState_(this.bucModule.state);
  }

  private powerHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.bucModule.handlePowerToggle(isChecked);
    this.syncDomWithState_(this.bucModule.state);
  }

  private muteHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.bucModule.handleMuteToggle(isChecked);
    this.syncDomWithState_(this.bucModule.state);
  }

  update(): void {
    this.syncDomWithState_(this.bucModule.state);
  }

  private syncDomWithState_(state: Partial<BUCState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update LO Frequency input (input field is now the display)
    if (state.loFrequency !== undefined) {
      const input = this.domCache_.get('loFreqInput') as HTMLInputElement;
      if (input) input.value = state.loFrequency.toString();
    }

    // Update Gain input (input field is now the display)
    if (state.gain !== undefined) {
      const input = this.domCache_.get('gainInput') as HTMLInputElement;
      if (input) input.value = state.gain.toString();
    }

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update Mute switch
    if (state.isMuted !== undefined) {
      const muteSwitch = this.domCache_.get('muteSwitch') as HTMLInputElement;
      if (muteSwitch) muteSwitch.checked = state.isMuted;
    }

    // Update RF Status displays
    if (state.outputPower !== undefined) {
      const display = this.domCache_.get('outputPowerDisplay');
      if (display) display.textContent = `${state.outputPower.toFixed(1)} dBm`;
    }

    // Calculate and display P1dB margin
    if (state.outputPower !== undefined && state.saturationPower !== undefined) {
      const p1dbMargin = state.saturationPower - state.outputPower;
      const display = this.domCache_.get('p1dbMarginDisplay');
      if (display) display.textContent = `${p1dbMargin.toFixed(1)} dB`;
    }

    if (state.isExtRefLocked !== undefined) {
      const status = this.domCache_.get('lockStatus');
      if (status) {
        status.textContent = state.isExtRefLocked ? 'Locked' : 'Unlocked';
        status.className = state.isExtRefLocked
          ? 'status-badge status-badge-locked'
          : 'status-badge status-badge-unlocked';
      }
    }

    // Update Thermal displays
    if (state.temperature !== undefined) {
      const display = this.domCache_.get('temperatureDisplay');
      if (display) display.textContent = `${state.temperature.toFixed(1)} °C`;
    }

    if (state.currentDraw !== undefined) {
      const display = this.domCache_.get('currentDisplay');
      if (display) display.textContent = `${state.currentDraw.toFixed(2)} A`;
    }

    // Update Signal Quality displays
    if (state.phaseNoise !== undefined) {
      const display = this.domCache_.get('phaseNoiseDisplay');
      if (display) display.textContent = `${state.phaseNoise.toFixed(0)} dBc/Hz`;
    }

    if (state.frequencyError !== undefined) {
      const display = this.domCache_.get('freqErrorDisplay');
      if (display) {
        // Format frequency error - show in Hz or kHz depending on magnitude
        const absError = Math.abs(state.frequencyError);
        if (absError >= 1000) {
          display.textContent = `${(state.frequencyError / 1000).toFixed(1)} kHz`;
        } else {
          display.textContent = `${state.frequencyError.toFixed(0)} Hz`;
        }
      }
    }

    // Update alarm badge - immediate feedback
    const alarms = this.getAlarmsFromModule_();
    this.alarmBadge_.update(alarms);
  }

  /**
   * Get current alarms from BUC module as AlarmStatus array
   */
  private getAlarmsFromModule_(): AlarmStatus[] {
    const alarmStrings = this.bucModule.getAlarms();
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
    if (lowerMsg.includes('error') || lowerMsg.includes('fault') || lowerMsg.includes('fail')) {
      return 'error';
    }
    if (lowerMsg.includes('not locked') || lowerMsg.includes('saturation') || lowerMsg.includes('approaching')) {
      return 'warning';
    }
    return 'warning'; // Default to warning for any alarm
  }

  dispose(): void {
    // Dispose alarm badge
    this.alarmBadge_.dispose();

    // Remove EventBus listeners
    EventBus.getInstance().off(Events.RF_FE_BUC_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners for inputs
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    const muteSwitch = this.domCache_.get('muteSwitch') as HTMLInputElement;

    const loFreqHandler = this.boundHandlers.get('loFreqInput');
    const gainHandler = this.boundHandlers.get('gainInput');
    const powerHandler = this.boundHandlers.get('power');
    const muteHandler = this.boundHandlers.get('mute');

    if (loFreqInput && loFreqHandler) loFreqInput.removeEventListener('change', loFreqHandler);
    if (gainInput && gainHandler) gainInput.removeEventListener('change', gainHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);
    if (muteSwitch && muteHandler) muteSwitch.removeEventListener('change', muteHandler);

    // Note: Button click handlers use inline arrow functions and are cleaned up when DOM is removed
    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
