import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { HPAModuleCore, HPAState } from "@app/equipment/rf-front-end/hpa-module/hpa-module-core";
import { qs } from "@app/engine/utils/query-selector";

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
  private hpaModule: HPAModuleCore;
  private containerEl: HTMLElement;
  private lastStateString: string = '';
  private boundHandlers: Map<string, EventListener> = new Map();
  private stateChangeHandler: (state: Partial<HPAState>) => void;

  constructor(hpaModule: HPAModuleCore, containerEl: HTMLElement) {
    this.hpaModule = hpaModule;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<HPAState>) => {
      // Sync DOM with state changes
      this.syncDomWithState(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Setup DOM event listeners for user input
    this.setupInputListeners();

    // Listen to HPA state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_HPA_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState(this.hpaModule.state);
  }

  private setupInputListeners(): void {
    // Back-off slider
    const backOffSlider = qs('#hpa-backoff', this.containerEl) as HTMLInputElement;
    const backOffHandler = (e: Event) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.hpaModule['handleBackOffChange'](value);
    };
    backOffSlider?.addEventListener('input', backOffHandler);
    this.boundHandlers.set('backOff', backOffHandler);

    // Power switch
    const powerSwitch = qs('#hpa-power', this.containerEl) as HTMLInputElement;
    const powerHandler = (e: Event) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.hpaModule['handlePowerToggle'](isChecked, (state: HPAState) => {
        // Callback after power toggle
        this.syncDomWithState(state);
      });
    };
    powerSwitch?.addEventListener('change', powerHandler);
    this.boundHandlers.set('power', powerHandler);

    // HPA Enable switch
    const hpaEnableSwitch = qs('#hpa-enable', this.containerEl) as HTMLInputElement;
    const hpaEnableHandler = () => {
      this.hpaModule['handleHpaToggle']();
    };
    hpaEnableSwitch?.addEventListener('change', hpaEnableHandler);
    this.boundHandlers.set('hpaEnable', hpaEnableHandler);
  }

  private syncDomWithState(state: Partial<HPAState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update Back-off slider and display
    if (state.backOff !== undefined) {
      const slider = qs('#hpa-backoff', this.containerEl) as HTMLInputElement;
      const display = qs('#hpa-backoff-display', this.containerEl);
      if (slider) slider.value = state.backOff.toString();
      if (display) display.textContent = `${state.backOff.toFixed(1)} dB`;
    }

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = qs('#hpa-power', this.containerEl) as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update HPA Enable switch
    if (state.isHpaEnabled !== undefined) {
      const hpaEnableSwitch = qs('#hpa-enable', this.containerEl) as HTMLInputElement;
      if (hpaEnableSwitch) hpaEnableSwitch.checked = state.isHpaEnabled;
    }

    // Update status indicators
    if (state.outputPower !== undefined) {
      const display = qs('#hpa-output-power-display', this.containerEl);
      if (display) display.textContent = `${state.outputPower.toFixed(1)} dBm`;
    }

    if (state.temperature !== undefined) {
      const display = qs('#hpa-temperature-display', this.containerEl);
      if (display) display.textContent = `${state.temperature.toFixed(1)} °C`;
    }

    if (state.isOverdriven !== undefined) {
      const led = qs('#hpa-overdrive-led', this.containerEl);
      if (led) {
        led.className = state.isOverdriven ? 'led led-red' : 'led led-green';
      }
    }

    if (state.imdLevel !== undefined) {
      const display = qs('#hpa-imd-display', this.containerEl);
      if (display) display.textContent = `${state.imdLevel.toFixed(1)} dBc`;
    }

    if (state.gain !== undefined) {
      const display = qs('#hpa-gain-display', this.containerEl);
      if (display) display.textContent = `${state.gain.toFixed(1)} dB`;
    }
  }

  public dispose(): void {
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.RF_FE_HPA_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const backOffSlider = qs('#hpa-backoff', this.containerEl) as HTMLInputElement;
    const powerSwitch = qs('#hpa-power', this.containerEl) as HTMLInputElement;
    const hpaEnableSwitch = qs('#hpa-enable', this.containerEl) as HTMLInputElement;

    const backOffHandler = this.boundHandlers.get('backOff');
    const powerHandler = this.boundHandlers.get('power');
    const hpaEnableHandler = this.boundHandlers.get('hpaEnable');

    if (backOffSlider && backOffHandler) backOffSlider.removeEventListener('input', backOffHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);
    if (hpaEnableSwitch && hpaEnableHandler) hpaEnableSwitch.removeEventListener('change', hpaEnableHandler);

    this.boundHandlers.clear();
  }
}
