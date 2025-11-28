import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { FILTER_BANDWIDTH_CONFIGS, IfFilterBankModuleCore, IfFilterBankState } from "@app/equipment/rf-front-end/filter-module/filter-module-core";
import { qs } from "@app/engine/utils/query-selector";

/**
 * FilterAdapter - Bridges IfFilterBankModuleCore state to web controls
 *
 * Provides bidirectional synchronization between:
 * - DOM select control (bandwidth selector) → Filter Core handler
 * - Filter Core state changes → DOM updates
 *
 * Prevents circular updates via state comparison
 */
export class FilterAdapter {
  private readonly filterModule: IfFilterBankModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<IfFilterBankState>) => void;

  constructor(filterModule: IfFilterBankModuleCore, containerEl: HTMLElement) {
    this.filterModule = filterModule;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<IfFilterBankState>) => {
      this.syncDomWithState_(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to Filter state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_FILTER_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState_(this.filterModule.state);
  }

  private setupDomCache_(): void {
    this.domCache_.set('bandwidthSelect', qs('#filter-bandwidth', this.containerEl));
    this.domCache_.set('bandwidthDisplay', qs('#filter-bandwidth-display', this.containerEl));
    this.domCache_.set('insertionLossDisplay', qs('#filter-insertion-loss-display', this.containerEl));
    this.domCache_.set('noiseFloorDisplay', qs('#filter-noise-floor-display', this.containerEl));
  }

  private setupInputListeners_(): void {
    const bandwidthSelect = this.domCache_.get('bandwidthSelect') as HTMLSelectElement;

    // Bandwidth selector
    bandwidthSelect?.addEventListener('change', this.bandwidthHandler_.bind(this));
    this.boundHandlers.set('bandwidth', this.bandwidthHandler_.bind(this));
  }

  private bandwidthHandler_(e: Event): void {
    const index = parseInt((e.target as HTMLSelectElement).value, 10);
    this.filterModule.handleBandwidthChange(index);
    this.syncDomWithState_(this.filterModule.state);
  }

  update(): void {
    this.syncDomWithState_(this.filterModule.state);
  }

  private syncDomWithState_(state: Partial<IfFilterBankState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update bandwidth selector
    if (state.bandwidthIndex !== undefined) {
      const select = this.domCache_.get('bandwidthSelect') as HTMLSelectElement;
      if (select) select.value = state.bandwidthIndex.toString();
    }

    // Update bandwidth display
    if (state.bandwidth !== undefined) {
      const display = this.domCache_.get('bandwidthDisplay');
      const config = FILTER_BANDWIDTH_CONFIGS[state.bandwidthIndex || 0];
      if (display) display.textContent = config.label;
    }

    // Update insertion loss display
    if (state.insertionLoss !== undefined) {
      const display = this.domCache_.get('insertionLossDisplay');
      if (display) display.textContent = `${state.insertionLoss.toFixed(1)} dB`;
    }

    // Update noise floor display
    if (state.noiseFloor !== undefined) {
      const display = this.domCache_.get('noiseFloorDisplay');
      if (display) display.textContent = `${state.noiseFloor.toFixed(0)} dBm`;
    }
  }

  dispose(): void {
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.RF_FE_FILTER_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const bandwidthSelect = qs('#filter-bandwidth', this.containerEl) as HTMLSelectElement;
    const bandwidthHandler = this.boundHandlers.get('bandwidth');

    if (bandwidthSelect && bandwidthHandler) {
      bandwidthSelect.removeEventListener('change', bandwidthHandler);
    }

    this.boundHandlers.clear();
  }
}
