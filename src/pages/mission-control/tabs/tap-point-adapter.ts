import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { CouplerModule, CouplerState } from "@app/equipment/rf-front-end/coupler-module/coupler-module";
import { RealTimeSpectrumAnalyzer } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import { qs } from "@app/engine/utils/query-selector";
import { TapPoint } from "@app/equipment/rf-front-end/coupler-module/tap-points";

/**
 * TapPointAdapter - Bridges CouplerModule state to web controls
 *
 * Provides bidirectional synchronization between:
 * - DOM input controls (toggles, selects) -> CouplerModule handlers
 * - CouplerModule state changes -> DOM updates
 *
 * Supports two modes:
 * - Default: Single tap point selector (TX_IF or RX_IF)
 * - Engineering: Dual tap points (A for TX path, B for RX path)
 */
export class TapPointAdapter {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly couplerModule: CouplerModule;
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<CouplerState>) => void;
  private readonly boundUpdateHandler_: () => void;

  constructor(
    couplerModule: CouplerModule,
    spectrumAnalyzer: RealTimeSpectrumAnalyzer,
    containerEl: HTMLElement
  ) {
    this.couplerModule = couplerModule;
    this.spectrumAnalyzer = spectrumAnalyzer;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<CouplerState>) => {
      this.syncDomWithState_(state);
    };

    // Bind update handler for periodic sync
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);

    this.initialize_();
  }

  private initialize_(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to coupler state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_COUPLER_CHANGED, this.stateChangeHandler as any);

    // Listen to UPDATE event for periodic sync
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    // Initial sync
    this.syncDomWithState_(this.couplerModule.state);
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < TapPointAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.syncReadOnlyDisplays_();
  }

  /**
   * Sync only read-only status displays
   */
  private syncReadOnlyDisplays_(): void {
    const state = this.couplerModule.state;

    // Update status displays for default mode
    const defaultStatus = this.domCache_.get('defaultStatus');
    if (defaultStatus) {
      const isEnabled = state.isEngineeringMode ? state.isEnabledB : state.isEnabledB;
      defaultStatus.textContent = isEnabled ? 'Active' : '--';
      defaultStatus.className = isEnabled ? 'text-success' : 'text-muted';
    }

    // Update status displays for engineering mode
    this.updateStatusDisplay_('tapAStatus', state.isActiveA);
    this.updateStatusDisplay_('tapBStatus', state.isActiveB);
  }

  private updateStatusDisplay_(cacheKey: string, isActive: boolean): void {
    const el = this.domCache_.get(cacheKey);
    if (el) {
      el.textContent = isActive ? 'Active' : '--';
      el.className = isActive ? 'text-success' : 'text-muted';
    }
  }

  private setupDomCache_(): void {
    // Engineering mode toggle
    this.domCache_.set('engineeringToggle', qs('#tap-engineering-mode', this.containerEl));

    // Default mode elements
    this.domCache_.set('defaultModeContainer', qs('#tap-default-mode', this.containerEl));
    this.domCache_.set('defaultEnable', qs('#tap-default-enable', this.containerEl));
    this.domCache_.set('defaultSelect', qs('#tap-default-select', this.containerEl));
    this.domCache_.set('defaultStatus', qs('#tap-default-status', this.containerEl));
    this.domCache_.set('defaultCoupling', qs('#tap-default-coupling', this.containerEl));

    // Engineering mode container
    this.domCache_.set('engineeringContainer', qs('#tap-engineering-mode-container', this.containerEl));

    // Engineering mode - Tap A elements
    this.domCache_.set('tapAEnable', qs('#tap-a-enable', this.containerEl));
    this.domCache_.set('tapASelect', qs('#tap-a-select', this.containerEl));
    this.domCache_.set('tapAStatus', qs('#tap-a-status', this.containerEl));
    this.domCache_.set('tapACoupling', qs('#tap-a-coupling', this.containerEl));

    // Engineering mode - Tap B elements
    this.domCache_.set('tapBEnable', qs('#tap-b-enable', this.containerEl));
    this.domCache_.set('tapBSelect', qs('#tap-b-select', this.containerEl));
    this.domCache_.set('tapBStatus', qs('#tap-b-status', this.containerEl));
    this.domCache_.set('tapBCoupling', qs('#tap-b-coupling', this.containerEl));
  }

  private setupInputListeners_(): void {
    // Engineering mode toggle
    const engToggle = this.domCache_.get('engineeringToggle') as HTMLInputElement;
    const engHandler = this.engineeringModeHandler_.bind(this);
    engToggle?.addEventListener('change', engHandler);
    this.boundHandlers.set('engineeringToggle', engHandler);

    // Default mode handlers
    const defaultEnable = this.domCache_.get('defaultEnable') as HTMLInputElement;
    const defaultSelect = this.domCache_.get('defaultSelect') as HTMLSelectElement;

    const defaultEnableHandler = this.defaultEnableHandler_.bind(this);
    const defaultSelectHandler = this.defaultSelectHandler_.bind(this);

    defaultEnable?.addEventListener('change', defaultEnableHandler);
    defaultSelect?.addEventListener('change', defaultSelectHandler);

    this.boundHandlers.set('defaultEnable', defaultEnableHandler);
    this.boundHandlers.set('defaultSelect', defaultSelectHandler);

    // Engineering mode - Tap A handlers
    const tapAEnable = this.domCache_.get('tapAEnable') as HTMLInputElement;
    const tapASelect = this.domCache_.get('tapASelect') as HTMLSelectElement;

    const tapAEnableHandler = this.tapAEnableHandler_.bind(this);
    const tapASelectHandler = this.tapASelectHandler_.bind(this);

    tapAEnable?.addEventListener('change', tapAEnableHandler);
    tapASelect?.addEventListener('change', tapASelectHandler);

    this.boundHandlers.set('tapAEnable', tapAEnableHandler);
    this.boundHandlers.set('tapASelect', tapASelectHandler);

    // Engineering mode - Tap B handlers
    const tapBEnable = this.domCache_.get('tapBEnable') as HTMLInputElement;
    const tapBSelect = this.domCache_.get('tapBSelect') as HTMLSelectElement;

    const tapBEnableHandler = this.tapBEnableHandler_.bind(this);
    const tapBSelectHandler = this.tapBSelectHandler_.bind(this);

    tapBEnable?.addEventListener('change', tapBEnableHandler);
    tapBSelect?.addEventListener('change', tapBSelectHandler);

    this.boundHandlers.set('tapBEnable', tapBEnableHandler);
    this.boundHandlers.set('tapBSelect', tapBSelectHandler);
  }

  private engineeringModeHandler_(e: Event): void {
    const isEngineering = (e.target as HTMLInputElement).checked;
    this.couplerModule.setEngineeringMode(isEngineering);
    this.updateModeVisibility_(isEngineering);
    this.syncSpectrumAnalyzerTaps_();
    EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, this.couplerModule.state);
  }

  private defaultEnableHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    // In default mode, we use tap B for the single tap point
    this.couplerModule.setEnabledB(isEnabled);
    this.syncSpectrumAnalyzerTaps_();
    EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, this.couplerModule.state);
  }

  private defaultSelectHandler_(e: Event): void {
    const tapPoint = (e.target as HTMLSelectElement).value as TapPoint;
    // In default mode, we use tap B for the single tap point
    this.couplerModule.state.tapPointB = tapPoint;
    this.couplerModule.update();
    this.syncSpectrumAnalyzerTaps_();
    EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, this.couplerModule.state);
  }

  private tapAEnableHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    this.couplerModule.setEnabledA(isEnabled);
    this.syncSpectrumAnalyzerTaps_();
    EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, this.couplerModule.state);
  }

  private tapASelectHandler_(e: Event): void {
    const tapPoint = (e.target as HTMLSelectElement).value as TapPoint;
    this.couplerModule.state.tapPointA = tapPoint;
    this.couplerModule.update();
    this.syncSpectrumAnalyzerTaps_();
    EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, this.couplerModule.state);
  }

  private tapBEnableHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    this.couplerModule.setEnabledB(isEnabled);
    this.syncSpectrumAnalyzerTaps_();
    EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, this.couplerModule.state);
  }

  private tapBSelectHandler_(e: Event): void {
    const tapPoint = (e.target as HTMLSelectElement).value as TapPoint;
    this.couplerModule.state.tapPointB = tapPoint;
    this.couplerModule.update();
    this.syncSpectrumAnalyzerTaps_();
    EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, this.couplerModule.state);
  }

  private updateModeVisibility_(isEngineering: boolean): void {
    const defaultContainer = this.domCache_.get('defaultModeContainer');
    const engineeringContainer = this.domCache_.get('engineeringContainer');

    if (defaultContainer) {
      defaultContainer.classList.toggle('d-none', isEngineering);
    }
    if (engineeringContainer) {
      engineeringContainer.classList.toggle('d-none', !isEngineering);
    }
  }

  /**
   * Sync spectrum analyzer isUseTapA/isUseTapB based on coupler state
   */
  private syncSpectrumAnalyzerTaps_(): void {
    const state = this.couplerModule.state;

    if (state.isEngineeringMode) {
      // Engineering mode: direct mapping
      this.spectrumAnalyzer.state.isUseTapA = state.isEnabledA;
      this.spectrumAnalyzer.state.isUseTapB = state.isEnabledB;
    } else {
      // Default mode: single tap point controls both
      // Use tap B for the single selector
      const tapPoint = state.tapPointB;
      const isEnabled = state.isEnabledB;

      // TX tap points go to A, RX tap points go to B
      const isTxTap = tapPoint === TapPoint.TX_IF;
      this.spectrumAnalyzer.state.isUseTapA = isEnabled && isTxTap;
      this.spectrumAnalyzer.state.isUseTapB = isEnabled && !isTxTap;
    }
  }

  private syncDomWithState_(state: Partial<CouplerState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    const fullState = this.couplerModule.state;

    // Update engineering mode toggle
    if (state.isEngineeringMode !== undefined) {
      const engToggle = this.domCache_.get('engineeringToggle') as HTMLInputElement;
      if (engToggle) engToggle.checked = state.isEngineeringMode;
      this.updateModeVisibility_(state.isEngineeringMode);
    }

    // Update default mode controls
    const defaultEnable = this.domCache_.get('defaultEnable') as HTMLInputElement;
    const defaultSelect = this.domCache_.get('defaultSelect') as HTMLSelectElement;
    const defaultStatus = this.domCache_.get('defaultStatus');
    const defaultCoupling = this.domCache_.get('defaultCoupling');

    if (defaultEnable && state.isEnabledB !== undefined) {
      defaultEnable.checked = state.isEnabledB;
    }
    if (defaultSelect && state.tapPointB !== undefined) {
      defaultSelect.value = state.tapPointB;
    }
    if (defaultStatus) {
      const isActive = fullState.isActiveB;
      defaultStatus.textContent = isActive ? 'Active' : '--';
      defaultStatus.className = isActive ? 'text-success' : 'text-muted';
    }
    if (defaultCoupling) {
      defaultCoupling.textContent = `${fullState.couplingFactorB} dB`;
    }

    // Update engineering mode - Tap A controls
    const tapAEnable = this.domCache_.get('tapAEnable') as HTMLInputElement;
    const tapASelect = this.domCache_.get('tapASelect') as HTMLSelectElement;
    const tapAStatus = this.domCache_.get('tapAStatus');
    const tapACoupling = this.domCache_.get('tapACoupling');

    if (tapAEnable && state.isEnabledA !== undefined) {
      tapAEnable.checked = state.isEnabledA;
    }
    if (tapASelect && state.tapPointA !== undefined) {
      tapASelect.value = state.tapPointA;
    }
    if (tapAStatus) {
      const isActive = fullState.isActiveA;
      tapAStatus.textContent = isActive ? 'Active' : '--';
      tapAStatus.className = isActive ? 'text-success' : 'text-muted';
    }
    if (tapACoupling) {
      tapACoupling.textContent = `${fullState.couplingFactorA} dB`;
    }

    // Update engineering mode - Tap B controls
    const tapBEnable = this.domCache_.get('tapBEnable') as HTMLInputElement;
    const tapBSelect = this.domCache_.get('tapBSelect') as HTMLSelectElement;
    const tapBStatus = this.domCache_.get('tapBStatus');
    const tapBCoupling = this.domCache_.get('tapBCoupling');

    if (tapBEnable && state.isEnabledB !== undefined) {
      tapBEnable.checked = state.isEnabledB;
    }
    if (tapBSelect && state.tapPointB !== undefined) {
      tapBSelect.value = state.tapPointB;
    }
    if (tapBStatus) {
      const isActive = fullState.isActiveB;
      tapBStatus.textContent = isActive ? 'Active' : '--';
      tapBStatus.className = isActive ? 'text-success' : 'text-muted';
    }
    if (tapBCoupling) {
      tapBCoupling.textContent = `${fullState.couplingFactorB} dB`;
    }

    // Sync spectrum analyzer state
    this.syncSpectrumAnalyzerTaps_();
  }

  dispose(): void {
    // Remove EventBus listeners
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    EventBus.getInstance().off(Events.RF_FE_COUPLER_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const engToggle = this.domCache_.get('engineeringToggle') as HTMLInputElement;
    const defaultEnable = this.domCache_.get('defaultEnable') as HTMLInputElement;
    const defaultSelect = this.domCache_.get('defaultSelect') as HTMLSelectElement;
    const tapAEnable = this.domCache_.get('tapAEnable') as HTMLInputElement;
    const tapASelect = this.domCache_.get('tapASelect') as HTMLSelectElement;
    const tapBEnable = this.domCache_.get('tapBEnable') as HTMLInputElement;
    const tapBSelect = this.domCache_.get('tapBSelect') as HTMLSelectElement;

    const engHandler = this.boundHandlers.get('engineeringToggle');
    const defaultEnableHandler = this.boundHandlers.get('defaultEnable');
    const defaultSelectHandler = this.boundHandlers.get('defaultSelect');
    const tapAEnableHandler = this.boundHandlers.get('tapAEnable');
    const tapASelectHandler = this.boundHandlers.get('tapASelect');
    const tapBEnableHandler = this.boundHandlers.get('tapBEnable');
    const tapBSelectHandler = this.boundHandlers.get('tapBSelect');

    if (engToggle && engHandler) engToggle.removeEventListener('change', engHandler);
    if (defaultEnable && defaultEnableHandler) defaultEnable.removeEventListener('change', defaultEnableHandler);
    if (defaultSelect && defaultSelectHandler) defaultSelect.removeEventListener('change', defaultSelectHandler);
    if (tapAEnable && tapAEnableHandler) tapAEnable.removeEventListener('change', tapAEnableHandler);
    if (tapASelect && tapASelectHandler) tapASelect.removeEventListener('change', tapASelectHandler);
    if (tapBEnable && tapBEnableHandler) tapBEnable.removeEventListener('change', tapBEnableHandler);
    if (tapBSelect && tapBSelectHandler) tapBSelect.removeEventListener('change', tapBSelectHandler);

    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
