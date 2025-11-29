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
    this.domCache_.set('loFreqSlider', qs('#buc-lo-frequency', this.containerEl));
    this.domCache_.set('loFreqDisplay', qs('#buc-lo-frequency-display', this.containerEl));
    this.domCache_.set('gainSlider', qs('#buc-gain', this.containerEl));
    this.domCache_.set('gainDisplay', qs('#buc-gain-display', this.containerEl));
    this.domCache_.set('powerSwitch', qs('#buc-power', this.containerEl));
    this.domCache_.set('muteSwitch', qs('#buc-mute', this.containerEl));
    this.domCache_.set('outputPowerDisplay', qs('#buc-output-power-display', this.containerEl));
    this.domCache_.set('temperatureDisplay', qs('#buc-temperature-display', this.containerEl));
    this.domCache_.set('lockLed', qs('#buc-lock-led', this.containerEl));
  }

  private setupInputListeners_(): void {
    const loFreqSlider = this.domCache_.get('loFreqSlider') as HTMLInputElement;
    const gainSlider = this.domCache_.get('gainSlider') as HTMLInputElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    const muteSwitch = this.domCache_.get('muteSwitch') as HTMLInputElement;

    // LO Frequency slider
    loFreqSlider?.addEventListener('input', this.loFreqHandler_.bind(this));
    this.boundHandlers.set('loFreq', this.loFreqHandler_.bind(this));

    // Gain slider
    gainSlider?.addEventListener('input', this.gainHandler_.bind(this));
    this.boundHandlers.set('gain', this.gainHandler_.bind(this));

    // Power switch
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));

    // Mute switch
    muteSwitch?.addEventListener('change', this.muteHandler_.bind(this));
    this.boundHandlers.set('mute', this.muteHandler_.bind(this));
  }

  private loFreqHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.bucModule.handleLoFrequencyChange(value);
    this.syncDomWithState_(this.bucModule.state);
  }

  private gainHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.bucModule.handleGainChange(value);
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

    // Update LO Frequency slider and display
    if (state.loFrequency !== undefined) {
      const slider = this.domCache_.get('loFreqSlider') as HTMLInputElement;
      const display = this.domCache_.get('loFreqDisplay');
      if (slider) slider.value = state.loFrequency.toString();
      if (display) display.textContent = `${state.loFrequency.toFixed(0)} MHz`;
    }

    // Update Gain slider and display
    if (state.gain !== undefined) {
      const slider = this.domCache_.get('gainSlider') as HTMLInputElement;
      const display = this.domCache_.get('gainDisplay');
      if (slider) slider.value = state.gain.toString();
      if (display) display.textContent = `${state.gain.toFixed(1)} dB`;
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

    // Update status indicators
    if (state.outputPower !== undefined) {
      const display = this.domCache_.get('outputPowerDisplay');
      if (display) display.textContent = `${state.outputPower.toFixed(1)} dBm`;
    }

    if (state.temperature !== undefined) {
      const display = this.domCache_.get('temperatureDisplay');
      if (display) display.textContent = `${state.temperature.toFixed(1)} °C`;
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

    // Remove DOM event listeners
    const loFreqSlider = qs('#buc-lo-frequency', this.containerEl) as HTMLInputElement;
    const gainSlider = qs('#buc-gain', this.containerEl) as HTMLInputElement;
    const powerSwitch = qs('#buc-power', this.containerEl) as HTMLInputElement;
    const muteSwitch = qs('#buc-mute', this.containerEl) as HTMLInputElement;

    const loFreqHandler = this.boundHandlers.get('loFreq');
    const gainHandler = this.boundHandlers.get('gain');
    const powerHandler = this.boundHandlers.get('power');
    const muteHandler = this.boundHandlers.get('mute');

    if (loFreqSlider && loFreqHandler) loFreqSlider.removeEventListener('input', loFreqHandler);
    if (gainSlider && gainHandler) gainSlider.removeEventListener('input', gainHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);
    if (muteSwitch && muteHandler) muteSwitch.removeEventListener('change', muteHandler);

    this.boundHandlers.clear();
  }
}
