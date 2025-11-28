import { qs } from "@app/engine/utils/query-selector";
import { HPAModuleCore, HPAState } from "@app/equipment/rf-front-end/hpa-module/hpa-module-core";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";

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
  private readonly hpaModule: HPAModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<HPAState>) => void;

  constructor(hpaModule: HPAModuleCore, containerEl: HTMLElement) {
    this.hpaModule = hpaModule;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<HPAState>) => {
      this.syncDomWithState_(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners();

    // Listen to HPA state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_HPA_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState_(this.hpaModule.state);
  }

  private setupDomCache_() {
    this.domCache_.set('backOffSlider', qs('#hpa-backoff', this.containerEl));
    this.domCache_.set('powerSwitch', qs('#hpa-power', this.containerEl));
    this.domCache_.set('hpaEnableSwitch', qs('#hpa-enable', this.containerEl));
    this.domCache_.set('outputPowerDisplay', qs('#hpa-output-power-display', this.containerEl));
    this.domCache_.set('temperatureDisplay', qs('#hpa-temperature-display', this.containerEl));
    this.domCache_.set('overdriveLed', qs('#hpa-overdrive-led', this.containerEl));
    this.domCache_.set('imdDisplay', qs('#hpa-imd-display', this.containerEl));
    this.domCache_.set('gainDisplay', qs('#hpa-gain-display', this.containerEl));
    this.domCache_.set('backOffDisplay', qs('#hpa-backoff-display', this.containerEl));
  }

  private setupInputListeners(): void {
    const backOffSlider = this.domCache_.get('backOffSlider') as HTMLInputElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    const hpaEnableSwitch = this.domCache_.get('hpaEnableSwitch') as HTMLInputElement;

    // Back-off slider
    backOffSlider?.addEventListener('input', this.backOffHandler_.bind(this));
    this.boundHandlers.set('backOff', this.backOffHandler_.bind(this));

    // Power switch
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));

    // HPA Enable switch
    hpaEnableSwitch?.addEventListener('change', this.hpaEnableHandler_.bind(this));
    this.boundHandlers.set('hpaEnable', this.hpaEnableHandler_.bind(this));
  }

  private backOffHandler_(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.hpaModule.handleBackOffChange(value);
    this.syncDomWithState_(this.hpaModule.state);
  }

  private powerHandler_(e: Event) {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.hpaModule.handlePowerToggle(isChecked, (state: HPAState) => {
      this.syncDomWithState_(state);
    });
  }

  private hpaEnableHandler_() {
    this.hpaModule.handleHpaToggle();
    this.syncDomWithState_(this.hpaModule.state);
  }

  update(): void {
    this.syncDomWithState_(this.hpaModule.state);
  }

  private syncDomWithState_(state: Partial<HPAState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update Back-off slider and display
    if (state.backOff !== undefined) {
      const slider: HTMLInputElement = this.domCache_.get('backOffSlider') as HTMLInputElement;
      const display = this.domCache_.get('backOffDisplay');
      if (slider) slider.value = state.backOff.toString();
      if (display) display.textContent = `${state.backOff.toFixed(1)} dB`;
    }

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch: HTMLInputElement = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update HPA Enable switch
    if (state.isHpaEnabled !== undefined) {
      const hpaEnableSwitch: HTMLInputElement = this.domCache_.get('hpaEnableSwitch') as HTMLInputElement;
      if (hpaEnableSwitch) hpaEnableSwitch.checked = state.isHpaEnabled;
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

    if (state.isOverdriven !== undefined) {
      const led = this.domCache_.get('overdriveLed');
      if (led) {
        led.className = state.isOverdriven ? 'led led-red' : 'led led-green';
      }
    }

    if (state.imdLevel !== undefined) {
      const display = this.domCache_.get('imdDisplay');
      if (display) display.textContent = `${state.imdLevel.toFixed(1)} dBc`;
    }

    if (state.gain !== undefined) {
      const display = this.domCache_.get('gainDisplay');
      if (display) display.textContent = `${state.gain.toFixed(1)} dB`;
    }
  }

  dispose(): void {
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.RF_FE_HPA_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const backOffSlider: HTMLInputElement = qs('#hpa-backoff', this.containerEl);
    const powerSwitch: HTMLInputElement = qs('#hpa-power', this.containerEl);
    const hpaEnableSwitch: HTMLInputElement = qs('#hpa-enable', this.containerEl);

    const backOffHandler = this.boundHandlers.get('backOff');
    const powerHandler = this.boundHandlers.get('power');
    const hpaEnableHandler = this.boundHandlers.get('hpaEnable');

    if (backOffSlider && backOffHandler) backOffSlider.removeEventListener('input', backOffHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);
    if (hpaEnableSwitch && hpaEnableHandler) hpaEnableSwitch.removeEventListener('change', hpaEnableHandler);

    this.boundHandlers.clear();
  }
}
