import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { NotchFilterModuleCore, NotchFilterState, NotchConfig } from "@app/equipment/rf-front-end/notch-filter-module";
import { qs } from "@app/engine/utils/query-selector";
import { MHz, dB } from "@app/types";
import { parseLocalizedNumber } from "@app/utils/parse-number";

/**
 * NotchFilterAdapter - Bridges NotchFilterModuleCore state to web controls
 *
 * Provides bidirectional synchronization between:
 * - DOM input controls (frequency, bandwidth, depth, enable) → Notch Filter Core handlers
 * - Notch Filter Core state changes → DOM updates
 *
 * Uses staged values pattern with Apply button for RF parameter changes.
 * Supports 3 independent notch slots.
 */
export class NotchFilterAdapter {
  private readonly notchFilterModule: NotchFilterModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<NotchFilterState>) => void;

  // Staged values for each notch (3 slots)
  private stagedNotches_: NotchConfig[] = [];

  constructor(notchFilterModule: NotchFilterModuleCore, containerEl: HTMLElement) {
    this.notchFilterModule = notchFilterModule;
    this.containerEl = containerEl;

    // Initialize staged values from current state
    this.stagedNotches_ = this.notchFilterModule.state.notches.map(n => ({ ...n }));

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<NotchFilterState>) => {
      this.syncDomWithState_(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to Notch Filter state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_NOTCH_FILTER_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState_(this.notchFilterModule.state);
  }

  private setupDomCache_(): void {
    // Cache elements for each notch slot (0, 1, 2)
    for (let i = 0; i < 3; i++) {
      this.cacheNotchElements_(i);
    }
    this.domCache_.set('applyBtn', qs('#notch-apply-btn', this.containerEl));
    this.domCache_.set('powerSwitch', qs('#notch-power', this.containerEl));
  }

  private cacheNotchElements_(index: number): void {
    const prefix = `notch-${index}`;

    // Enable switch
    this.domCache_.set(`${prefix}-enabled`, qs(`#${prefix}-enabled`, this.containerEl));

    // Frequency controls
    this.domCache_.set(`${prefix}-freq`, qs(`#${prefix}-freq`, this.containerEl));
    this.domCache_.set(`${prefix}-freq-dec-coarse`, qs(`#${prefix}-freq-dec-coarse`, this.containerEl));
    this.domCache_.set(`${prefix}-freq-dec-fine`, qs(`#${prefix}-freq-dec-fine`, this.containerEl));
    this.domCache_.set(`${prefix}-freq-inc-fine`, qs(`#${prefix}-freq-inc-fine`, this.containerEl));
    this.domCache_.set(`${prefix}-freq-inc-coarse`, qs(`#${prefix}-freq-inc-coarse`, this.containerEl));

    // Bandwidth controls
    this.domCache_.set(`${prefix}-bw`, qs(`#${prefix}-bw`, this.containerEl));
    this.domCache_.set(`${prefix}-bw-dec`, qs(`#${prefix}-bw-dec`, this.containerEl));
    this.domCache_.set(`${prefix}-bw-inc`, qs(`#${prefix}-bw-inc`, this.containerEl));

    // Depth controls
    this.domCache_.set(`${prefix}-depth`, qs(`#${prefix}-depth`, this.containerEl));
    this.domCache_.set(`${prefix}-depth-dec`, qs(`#${prefix}-depth-dec`, this.containerEl));
    this.domCache_.set(`${prefix}-depth-inc`, qs(`#${prefix}-depth-inc`, this.containerEl));
  }

  private setupInputListeners_(): void {
    for (let i = 0; i < 3; i++) {
      this.setupNotchListeners_(i);
    }

    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;

    applyBtn?.addEventListener('click', this.applyHandler_.bind(this));
    this.boundHandlers.set('apply', this.applyHandler_.bind(this));

    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));
  }

  private setupNotchListeners_(index: number): void {
    const prefix = `notch-${index}`;

    // Enable toggle
    const enabledSwitch = this.domCache_.get(`${prefix}-enabled`) as HTMLInputElement;
    const enableHandler = () => {
      this.stagedNotches_[index].enabled = enabledSwitch.checked;
      this.updateStagedDisplays_();
    };
    enabledSwitch?.addEventListener('change', enableHandler);
    this.boundHandlers.set(`${prefix}-enabled`, enableHandler);

    // Frequency input
    const freqInput = this.domCache_.get(`${prefix}-freq`) as HTMLInputElement;
    const freqHandler = () => {
      const val = parseLocalizedNumber(freqInput.value);
      if (!isNaN(val)) {
        this.stagedNotches_[index].centerFrequency = Math.max(950, Math.min(2150, val)) as MHz;
        this.updateStagedDisplays_();
      }
    };
    freqInput?.addEventListener('change', freqHandler);
    this.boundHandlers.set(`${prefix}-freq`, freqHandler);

    // Frequency buttons
    const freqDecCoarse = this.domCache_.get(`${prefix}-freq-dec-coarse`) as HTMLButtonElement;
    const freqDecFine = this.domCache_.get(`${prefix}-freq-dec-fine`) as HTMLButtonElement;
    const freqIncFine = this.domCache_.get(`${prefix}-freq-inc-fine`) as HTMLButtonElement;
    const freqIncCoarse = this.domCache_.get(`${prefix}-freq-inc-coarse`) as HTMLButtonElement;

    freqDecCoarse?.addEventListener('click', () => this.adjustStagedFreq_(index, -100));
    freqDecFine?.addEventListener('click', () => this.adjustStagedFreq_(index, -10));
    freqIncFine?.addEventListener('click', () => this.adjustStagedFreq_(index, 10));
    freqIncCoarse?.addEventListener('click', () => this.adjustStagedFreq_(index, 100));

    // Bandwidth input and buttons
    const bwInput = this.domCache_.get(`${prefix}-bw`) as HTMLInputElement;
    const bwHandler = () => {
      const val = parseLocalizedNumber(bwInput.value);
      if (!isNaN(val)) {
        this.stagedNotches_[index].bandwidth = Math.max(0.1, Math.min(50, val)) as MHz;
        this.updateStagedDisplays_();
      }
    };
    bwInput?.addEventListener('change', bwHandler);
    this.boundHandlers.set(`${prefix}-bw`, bwHandler);

    const bwDec = this.domCache_.get(`${prefix}-bw-dec`) as HTMLButtonElement;
    const bwInc = this.domCache_.get(`${prefix}-bw-inc`) as HTMLButtonElement;

    bwDec?.addEventListener('click', () => this.adjustStagedBandwidth_(index, -1));
    bwInc?.addEventListener('click', () => this.adjustStagedBandwidth_(index, 1));

    // Depth input and buttons
    const depthInput = this.domCache_.get(`${prefix}-depth`) as HTMLInputElement;
    const depthHandler = () => {
      const val = parseLocalizedNumber(depthInput.value);
      if (!isNaN(val)) {
        this.stagedNotches_[index].depth = Math.max(1, Math.min(60, val)) as dB;
        this.updateStagedDisplays_();
      }
    };
    depthInput?.addEventListener('change', depthHandler);
    this.boundHandlers.set(`${prefix}-depth`, depthHandler);

    const depthDec = this.domCache_.get(`${prefix}-depth-dec`) as HTMLButtonElement;
    const depthInc = this.domCache_.get(`${prefix}-depth-inc`) as HTMLButtonElement;

    depthDec?.addEventListener('click', () => this.adjustStagedDepth_(index, -5));
    depthInc?.addEventListener('click', () => this.adjustStagedDepth_(index, 5));
  }

  private adjustStagedFreq_(index: number, delta: number): void {
    const current = this.stagedNotches_[index].centerFrequency;
    this.stagedNotches_[index].centerFrequency =
      Math.max(950, Math.min(2150, current + delta)) as MHz;
    this.updateStagedDisplays_();
  }

  private adjustStagedBandwidth_(index: number, delta: number): void {
    const current = this.stagedNotches_[index].bandwidth;
    this.stagedNotches_[index].bandwidth =
      Math.max(0.1, Math.min(50, current + delta)) as MHz;
    this.updateStagedDisplays_();
  }

  private adjustStagedDepth_(index: number, delta: number): void {
    const current = this.stagedNotches_[index].depth;
    this.stagedNotches_[index].depth =
      Math.max(1, Math.min(60, current + delta)) as dB;
    this.updateStagedDisplays_();
  }

  private updateStagedDisplays_(): void {
    const isPowered = this.notchFilterModule.state.isPowered;

    for (let i = 0; i < 3; i++) {
      const prefix = `notch-${i}`;
      const notch = this.stagedNotches_[i];

      const enabledSwitch = this.domCache_.get(`${prefix}-enabled`) as HTMLInputElement;
      const freqInput = this.domCache_.get(`${prefix}-freq`) as HTMLInputElement;
      const bwInput = this.domCache_.get(`${prefix}-bw`) as HTMLInputElement;
      const depthInput = this.domCache_.get(`${prefix}-depth`) as HTMLInputElement;

      if (enabledSwitch) enabledSwitch.checked = notch.enabled;

      if (freqInput) {
        freqInput.value = isPowered ? notch.centerFrequency.toString() : '--';
        freqInput.disabled = !isPowered;
      }
      if (bwInput) {
        bwInput.value = isPowered ? notch.bandwidth.toString() : '--';
        bwInput.disabled = !isPowered;
      }
      if (depthInput) {
        depthInput.value = isPowered ? notch.depth.toString() : '--';
        depthInput.disabled = !isPowered;
      }

      // Disable buttons when powered off
      this.setNotchButtonsEnabled_(i, isPowered);
    }

    // Disable apply button when powered off
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    if (applyBtn) applyBtn.disabled = !isPowered;
  }

  private setNotchButtonsEnabled_(index: number, enabled: boolean): void {
    const prefix = `notch-${index}`;
    const buttonKeys = [
      `${prefix}-freq-dec-coarse`, `${prefix}-freq-dec-fine`,
      `${prefix}-freq-inc-fine`, `${prefix}-freq-inc-coarse`,
      `${prefix}-bw-dec`, `${prefix}-bw-inc`,
      `${prefix}-depth-dec`, `${prefix}-depth-inc`
    ];
    for (const key of buttonKeys) {
      const btn = this.domCache_.get(key) as HTMLButtonElement;
      if (btn) btn.disabled = !enabled;
    }
  }

  private applyHandler_(): void {
    for (let i = 0; i < 3; i++) {
      this.notchFilterModule.handleNotchChange(i, this.stagedNotches_[i]);
    }
    this.syncDomWithState_(this.notchFilterModule.state);
  }

  private powerHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.notchFilterModule.handlePowerToggle(isChecked);
    this.syncDomWithState_(this.notchFilterModule.state);
  }

  update(): void {
    this.syncDomWithState_(this.notchFilterModule.state);
  }

  private syncDomWithState_(state: Partial<NotchFilterState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update staged values from state
    if (state.notches) {
      this.stagedNotches_ = state.notches.map(n => ({ ...n }));
    }

    // Update power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    this.updateStagedDisplays_();
  }

  dispose(): void {
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.RF_FE_NOTCH_FILTER_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;

    const applyHandler = this.boundHandlers.get('apply');
    const powerHandler = this.boundHandlers.get('power');

    if (applyBtn && applyHandler) applyBtn.removeEventListener('click', applyHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);

    // Remove notch-specific listeners
    for (let i = 0; i < 3; i++) {
      const prefix = `notch-${i}`;

      const enabledSwitch = this.domCache_.get(`${prefix}-enabled`) as HTMLInputElement;
      const enabledHandler = this.boundHandlers.get(`${prefix}-enabled`);
      if (enabledSwitch && enabledHandler) {
        enabledSwitch.removeEventListener('change', enabledHandler);
      }

      const freqInput = this.domCache_.get(`${prefix}-freq`) as HTMLInputElement;
      const freqHandler = this.boundHandlers.get(`${prefix}-freq`);
      if (freqInput && freqHandler) {
        freqInput.removeEventListener('change', freqHandler);
      }

      const bwInput = this.domCache_.get(`${prefix}-bw`) as HTMLInputElement;
      const bwHandler = this.boundHandlers.get(`${prefix}-bw`);
      if (bwInput && bwHandler) {
        bwInput.removeEventListener('change', bwHandler);
      }

      const depthInput = this.domCache_.get(`${prefix}-depth`) as HTMLInputElement;
      const depthHandler = this.boundHandlers.get(`${prefix}-depth`);
      if (depthInput && depthHandler) {
        depthInput.removeEventListener('change', depthHandler);
      }
    }

    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
