import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { LNBModuleCore, LNBState } from "@app/equipment/rf-front-end/lnb-module/lnb-module-core";
import { qs } from "@app/engine/utils/query-selector";

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
  private lnbModule: LNBModuleCore;
  private containerEl: HTMLElement;
  private lastStateString: string = '';
  private boundHandlers: Map<string, EventListener> = new Map();
  private stateChangeHandler: (state: Partial<LNBState>) => void;

  constructor(lnbModule: LNBModuleCore, containerEl: HTMLElement) {
    this.lnbModule = lnbModule;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<LNBState>) => {
      // Sync DOM with state changes
      this.syncDomWithState(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Setup DOM event listeners for user input
    this.setupInputListeners();

    // Listen to LNB state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_LNB_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState(this.lnbModule.state);
  }

  private setupInputListeners(): void {
    // LO Frequency slider
    const loFreqSlider = qs('#lnb-lo-frequency', this.containerEl) as HTMLInputElement;
    const loFreqHandler = (e: Event) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.lnbModule.handleLoFrequencyChange(value);
    };
    loFreqSlider?.addEventListener('input', loFreqHandler);
    this.boundHandlers.set('loFreq', loFreqHandler);

    // Gain slider
    const gainSlider = qs('#lnb-gain', this.containerEl) as HTMLInputElement;
    const gainHandler = (e: Event) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.lnbModule.handleGainChange(value);
    };
    gainSlider?.addEventListener('input', gainHandler);
    this.boundHandlers.set('gain', gainHandler);

    // Power switch
    const powerSwitch = qs('#lnb-power', this.containerEl) as HTMLInputElement;
    const powerHandler = (e: Event) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.lnbModule.handlePowerToggle(isChecked);
    };
    powerSwitch?.addEventListener('change', powerHandler);
    this.boundHandlers.set('power', powerHandler);
  }

  private syncDomWithState(state: Partial<LNBState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update LO Frequency slider and display
    if (state.loFrequency !== undefined) {
      const slider = qs('#lnb-lo-frequency', this.containerEl) as HTMLInputElement;
      const display = qs('#lnb-lo-frequency-display', this.containerEl);
      if (slider) slider.value = state.loFrequency.toString();
      if (display) display.textContent = `${state.loFrequency.toFixed(0)} MHz`;
    }

    // Update Gain slider and display
    if (state.gain !== undefined) {
      const slider = qs('#lnb-gain', this.containerEl) as HTMLInputElement;
      const display = qs('#lnb-gain-display', this.containerEl);
      if (slider) slider.value = state.gain.toString();
      if (display) display.textContent = `${state.gain.toFixed(1)} dB`;
    }

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = qs('#lnb-power', this.containerEl) as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update status indicators
    if (state.noiseTemperature !== undefined) {
      const display = qs('#lnb-noise-temp-display', this.containerEl);
      if (display) display.textContent = `${state.noiseTemperature.toFixed(0)} K`;
    }

    if (state.isExtRefLocked !== undefined) {
      const led = qs('#lnb-lock-led', this.containerEl);
      if (led) {
        led.className = state.isExtRefLocked ? 'led led-green' : 'led led-red';
      }
    }
  }

  public dispose(): void {
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.RF_FE_LNB_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const loFreqSlider = qs('#lnb-lo-frequency', this.containerEl) as HTMLInputElement;
    const gainSlider = qs('#lnb-gain', this.containerEl) as HTMLInputElement;
    const powerSwitch = qs('#lnb-power', this.containerEl) as HTMLInputElement;

    const loFreqHandler = this.boundHandlers.get('loFreq');
    const gainHandler = this.boundHandlers.get('gain');
    const powerHandler = this.boundHandlers.get('power');

    if (loFreqSlider && loFreqHandler) loFreqSlider.removeEventListener('input', loFreqHandler);
    if (gainSlider && gainHandler) gainSlider.removeEventListener('input', gainHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);

    this.boundHandlers.clear();
  }
}
