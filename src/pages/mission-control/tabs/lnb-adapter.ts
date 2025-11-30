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
    this.domCache_.set('loFreqSlider', qs('#lnb-lo-frequency', this.containerEl));
    this.domCache_.set('loFreqDisplay', qs('#lnb-lo-frequency-display', this.containerEl));
    this.domCache_.set('gainInput', qs('#lnb-gain', this.containerEl));
    this.domCache_.set('gainDecCoarse', qs('#lnb-gain-dec-coarse', this.containerEl));
    this.domCache_.set('gainDecFine', qs('#lnb-gain-dec-fine', this.containerEl));
    this.domCache_.set('gainIncFine', qs('#lnb-gain-inc-fine', this.containerEl));
    this.domCache_.set('gainIncCoarse', qs('#lnb-gain-inc-coarse', this.containerEl));
    this.domCache_.set('powerSwitch', qs('#lnb-power', this.containerEl));
    this.domCache_.set('noiseTempDisplay', qs('#lnb-noise-temp-display', this.containerEl));
    this.domCache_.set('lockLed', qs('#lnb-lock-led', this.containerEl));
  }

  private setupInputListeners_(): void {
    const loFreqSlider = this.domCache_.get('loFreqSlider') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const gainDecCoarse = this.domCache_.get('gainDecCoarse') as HTMLButtonElement;
    const gainDecFine = this.domCache_.get('gainDecFine') as HTMLButtonElement;
    const gainIncFine = this.domCache_.get('gainIncFine') as HTMLButtonElement;
    const gainIncCoarse = this.domCache_.get('gainIncCoarse') as HTMLButtonElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;

    // LO Frequency slider
    loFreqSlider?.addEventListener('input', this.loFreqHandler_.bind(this));
    this.boundHandlers.set('loFreq', this.loFreqHandler_.bind(this));

    // Gain input and buttons
    gainInput?.addEventListener('change', this.gainInputHandler_.bind(this));
    this.boundHandlers.set('gainInput', this.gainInputHandler_.bind(this));

    gainDecCoarse?.addEventListener('click', () => this.adjustGain_(-1));
    gainDecFine?.addEventListener('click', () => this.adjustGain_(-0.1));
    gainIncFine?.addEventListener('click', () => this.adjustGain_(0.1));
    gainIncCoarse?.addEventListener('click', () => this.adjustGain_(1));

    this.boundHandlers.set('gainDecCoarse', () => this.adjustGain_(-1));
    this.boundHandlers.set('gainDecFine', () => this.adjustGain_(-0.1));
    this.boundHandlers.set('gainIncFine', () => this.adjustGain_(0.1));
    this.boundHandlers.set('gainIncCoarse', () => this.adjustGain_(1));

    // Power switch
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));
  }

  private loFreqHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.lnbModule.handleLoFrequencyChange(value);
    this.syncDomWithState_(this.lnbModule.state);
  }

  private gainInputHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    const clampedValue = Math.max(0, Math.min(65, value));
    this.lnbModule.handleGainChange(clampedValue);
    this.syncDomWithState_(this.lnbModule.state);
  }

  private adjustGain_(delta: number): void {
    const currentGain = this.lnbModule.state.gain ?? 0;
    const newGain = Math.max(0, Math.min(65, currentGain + delta));
    // Round to 1 decimal place to avoid floating point issues
    const roundedGain = Math.round(newGain * 10) / 10;
    this.lnbModule.handleGainChange(roundedGain);
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

    // Update LO Frequency slider and display
    if (state.loFrequency !== undefined) {
      const slider = this.domCache_.get('loFreqSlider') as HTMLInputElement;
      const display = this.domCache_.get('loFreqDisplay');
      if (slider) slider.value = state.loFrequency.toString();
      if (display) display.textContent = `${state.loFrequency.toFixed(0)} MHz`;
    }

    // Update Gain input
    if (state.gain !== undefined) {
      const input = this.domCache_.get('gainInput') as HTMLInputElement;
      if (input) input.value = state.gain.toFixed(1);
    }

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
      const led = this.domCache_.get('lockLed');
      if (led) {
        led.className = state.isExtRefLocked ? 'led led-green' : 'led led-red';
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
    const loFreqSlider = this.domCache_.get('loFreqSlider') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const gainDecCoarse = this.domCache_.get('gainDecCoarse') as HTMLButtonElement;
    const gainDecFine = this.domCache_.get('gainDecFine') as HTMLButtonElement;
    const gainIncFine = this.domCache_.get('gainIncFine') as HTMLButtonElement;
    const gainIncCoarse = this.domCache_.get('gainIncCoarse') as HTMLButtonElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;

    const loFreqHandler = this.boundHandlers.get('loFreq');
    const gainInputHandler = this.boundHandlers.get('gainInput');
    const powerHandler = this.boundHandlers.get('power');

    if (loFreqSlider && loFreqHandler) loFreqSlider.removeEventListener('input', loFreqHandler);
    if (gainInput && gainInputHandler) gainInput.removeEventListener('change', gainInputHandler);
    if (gainDecCoarse) gainDecCoarse.removeEventListener('click', this.boundHandlers.get('gainDecCoarse')!);
    if (gainDecFine) gainDecFine.removeEventListener('click', this.boundHandlers.get('gainDecFine')!);
    if (gainIncFine) gainIncFine.removeEventListener('click', this.boundHandlers.get('gainIncFine')!);
    if (gainIncCoarse) gainIncCoarse.removeEventListener('click', this.boundHandlers.get('gainIncCoarse')!);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);

    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
