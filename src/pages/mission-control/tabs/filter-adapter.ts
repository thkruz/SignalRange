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
  private filterModule: IfFilterBankModuleCore;
  private containerEl: HTMLElement;
  private lastStateString: string = '';
  private boundHandlers: Map<string, EventListener> = new Map();
  private stateChangeHandler: (state: Partial<IfFilterBankState>) => void;

  constructor(filterModule: IfFilterBankModuleCore, containerEl: HTMLElement) {
    this.filterModule = filterModule;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<IfFilterBankState>) => {
      // Sync DOM with state changes
      this.syncDomWithState(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Setup DOM event listeners for user input
    this.setupInputListeners();

    // Listen to Filter state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_FILTER_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState(this.filterModule.state);
  }

  private setupInputListeners(): void {
    // Bandwidth selector
    const bandwidthSelect = qs('#filter-bandwidth', this.containerEl) as HTMLSelectElement;
    const bandwidthHandler = (e: Event) => {
      const index = parseInt((e.target as HTMLSelectElement).value, 10);
      this.filterModule.handleBandwidthChange(index);
    };
    bandwidthSelect?.addEventListener('change', bandwidthHandler);
    this.boundHandlers.set('bandwidth', bandwidthHandler);
  }

  private syncDomWithState(state: Partial<IfFilterBankState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update bandwidth selector
    if (state.bandwidthIndex !== undefined) {
      const select = qs('#filter-bandwidth', this.containerEl) as HTMLSelectElement;
      if (select) select.value = state.bandwidthIndex.toString();
    }

    // Update bandwidth display
    if (state.bandwidth !== undefined) {
      const display = qs('#filter-bandwidth-display', this.containerEl);
      const config = FILTER_BANDWIDTH_CONFIGS[state.bandwidthIndex || 0];
      if (display) display.textContent = config.label;
    }

    // Update insertion loss display
    if (state.insertionLoss !== undefined) {
      const display = qs('#filter-insertion-loss-display', this.containerEl);
      if (display) display.textContent = `${state.insertionLoss.toFixed(1)} dB`;
    }

    // Update noise floor display
    if (state.noiseFloor !== undefined) {
      const display = qs('#filter-noise-floor-display', this.containerEl);
      if (display) display.textContent = `${state.noiseFloor.toFixed(0)} dBm`;
    }
  }

  public dispose(): void {
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
