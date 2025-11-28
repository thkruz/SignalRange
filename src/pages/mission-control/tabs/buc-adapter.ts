import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { BUCModuleCore, BUCState } from "@app/equipment/rf-front-end/buc-module/buc-module-core";
import { qs } from "@app/engine/utils/query-selector";

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
  private bucModule: BUCModuleCore;
  private containerEl: HTMLElement;
  private lastStateString: string = '';
  private boundHandlers: Map<string, EventListener> = new Map();
  private stateChangeHandler: (state: Partial<BUCState>) => void;

  constructor(bucModule: BUCModuleCore, containerEl: HTMLElement) {
    this.bucModule = bucModule;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<BUCState>) => {
      // Sync DOM with state changes
      this.syncDomWithState(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Setup DOM event listeners for user input
    this.setupInputListeners();

    // Listen to BUC state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_BUC_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState(this.bucModule.state);
  }

  private setupInputListeners(): void {
    // LO Frequency slider
    const loFreqSlider = qs('#buc-lo-frequency', this.containerEl) as HTMLInputElement;
    const loFreqHandler = (e: Event) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.bucModule['handleLoFrequencyChange'](value);
    };
    loFreqSlider?.addEventListener('input', loFreqHandler);
    this.boundHandlers.set('loFreq', loFreqHandler);

    // Gain slider
    const gainSlider = qs('#buc-gain', this.containerEl) as HTMLInputElement;
    const gainHandler = (e: Event) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.bucModule['handleGainChange'](value);
    };
    gainSlider?.addEventListener('input', gainHandler);
    this.boundHandlers.set('gain', gainHandler);

    // Power switch
    const powerSwitch = qs('#buc-power', this.containerEl) as HTMLInputElement;
    const powerHandler = (e: Event) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.bucModule['handlePowerToggle'](isChecked);
    };
    powerSwitch?.addEventListener('change', powerHandler);
    this.boundHandlers.set('power', powerHandler);

    // Mute switch
    const muteSwitch = qs('#buc-mute', this.containerEl) as HTMLInputElement;
    const muteHandler = (e: Event) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.bucModule['handleMuteToggle'](isChecked);
    };
    muteSwitch?.addEventListener('change', muteHandler);
    this.boundHandlers.set('mute', muteHandler);
  }

  private syncDomWithState(state: Partial<BUCState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update LO Frequency slider and display
    if (state.loFrequency !== undefined) {
      const slider = qs('#buc-lo-frequency', this.containerEl) as HTMLInputElement;
      const display = qs('#buc-lo-frequency-display', this.containerEl);
      if (slider) slider.value = state.loFrequency.toString();
      if (display) display.textContent = `${state.loFrequency.toFixed(0)} MHz`;
    }

    // Update Gain slider and display
    if (state.gain !== undefined) {
      const slider = qs('#buc-gain', this.containerEl) as HTMLInputElement;
      const display = qs('#buc-gain-display', this.containerEl);
      if (slider) slider.value = state.gain.toString();
      if (display) display.textContent = `${state.gain.toFixed(1)} dB`;
    }

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = qs('#buc-power', this.containerEl) as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update Mute switch
    if (state.isMuted !== undefined) {
      const muteSwitch = qs('#buc-mute', this.containerEl) as HTMLInputElement;
      if (muteSwitch) muteSwitch.checked = state.isMuted;
    }

    // Update status indicators
    if (state.outputPower !== undefined) {
      const display = qs('#buc-output-power-display', this.containerEl);
      if (display) display.textContent = `${state.outputPower.toFixed(1)} dBm`;
    }

    if (state.temperature !== undefined) {
      const display = qs('#buc-temperature-display', this.containerEl);
      if (display) display.textContent = `${state.temperature.toFixed(1)} °C`;
    }

    if (state.isExtRefLocked !== undefined) {
      const led = qs('#buc-lock-led', this.containerEl);
      if (led) {
        led.className = state.isExtRefLocked ? 'led led-green' : 'led led-red';
      }
    }
  }

  public dispose(): void {
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
