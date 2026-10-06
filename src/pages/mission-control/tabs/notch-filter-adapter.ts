import { qs } from '@app/engine/utils/query-selector';
import { NotchConfig, NotchFilterModuleCore, NotchFilterState } from '@app/equipment/rf-front-end/notch-filter-module';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { dB, MHz } from '@app/types';
import { parseLocalizedNumber } from '@app/utils/parse-number';

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
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly notchFilterModule: NotchFilterModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<NotchFilterState>) => void;
  private readonly boundUpdateHandler_: () => void;
  private lastSyncTime_: number = 0;

  // Staged values for each notch (3 slots)
  private stagedNotches_: NotchConfig[] = [];
  /**
   * Per-notch pending edit flags. A notch the player has edited but not
   * applied keeps its staged values through power toggles and external state
   * events; it clears on Apply or when staged matches applied again.
   */
  private hasPendingEdit_: boolean[] = [false, false, false];

  constructor(notchFilterModule: NotchFilterModuleCore, containerEl: HTMLElement) {
    this.notchFilterModule = notchFilterModule;
    this.containerEl = containerEl;

    // Initialize staged values from current state
    this.stagedNotches_ = this.notchFilterModule.state.notches.map((n) => ({ ...n }));

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<NotchFilterState>) => {
      this.syncDomWithState_(state);
    };

    // Applied notch state can change without an event (scenario/fault)
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to Notch Filter state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_NOTCH_FILTER_CHANGED, this.stateChangeHandler as any);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    // Initial sync
    this.syncDomWithState_(this.notchFilterModule.state);
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < NotchFilterAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;

    const state = this.notchFilterModule.state;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement | undefined;
    if (powerSwitch && document.activeElement !== powerSwitch && powerSwitch.checked !== state.isPowered) {
      powerSwitch.checked = state.isPowered;
    }
    this.syncStagedFromState_(state.notches);
    this.updateStagedDisplays_();
  }

  private setupDomCache_(): void {
    // Cache elements for each notch slot (0, 1, 2)
    for (let i = 0; i < 3; i++) {
      this.cacheNotchElements_(i);
    }
    this.domCache_.set('applyBtn', qs('#notch-apply-btn', this.containerEl));
    this.domCache_.set('powerSwitch', qs('#notch-power', this.containerEl));
  }

  /** Per-notch applied-state badge (optional element). */
  private getAppliedStatusEl_(index: number): HTMLElement | null {
    return this.containerEl.querySelector<HTMLElement>(`#notch-${index}-applied-status`);
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
      this.markEdited_(index);
    };
    enabledSwitch?.addEventListener('change', enableHandler);
    this.boundHandlers.set(`${prefix}-enabled`, enableHandler);

    // Frequency input
    const freqInput = this.domCache_.get(`${prefix}-freq`) as HTMLInputElement;
    const freqHandler = () => {
      const val = parseLocalizedNumber(freqInput.value);
      if (!isNaN(val)) {
        this.stagedNotches_[index].centerFrequency = Math.max(950, Math.min(2150, val)) as MHz;
        this.markEdited_(index, true);
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
        this.markEdited_(index, true);
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
        this.markEdited_(index, true);
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
    this.stagedNotches_[index].centerFrequency = Math.max(950, Math.min(2150, current + delta)) as MHz;
    this.markEdited_(index, true);
  }

  private adjustStagedBandwidth_(index: number, delta: number): void {
    const current = this.stagedNotches_[index].bandwidth;
    this.stagedNotches_[index].bandwidth = Math.max(0.1, Math.min(50, current + delta)) as MHz;
    this.markEdited_(index, true);
  }

  private adjustStagedDepth_(index: number, delta: number): void {
    const current = this.stagedNotches_[index].depth;
    this.stagedNotches_[index].depth = Math.max(1, Math.min(60, current + delta)) as dB;
    this.markEdited_(index, true);
  }

  /** Player edit on one notch: flag it pending (unless it now matches applied) and redraw. */
  private markEdited_(index: number, isUserEdit = false): void {
    const applied = this.notchFilterModule.state.notches[index];
    this.hasPendingEdit_[index] = !applied || !NotchFilterAdapter.isSameNotch_(this.stagedNotches_[index], applied);
    this.updateStagedDisplays_(isUserEdit);
  }

  private static isSameNotch_(a: NotchConfig, b: NotchConfig): boolean {
    return a.enabled === b.enabled && a.centerFrequency === b.centerFrequency && a.bandwidth === b.bandwidth && a.depth === b.depth;
  }

  /**
   * Follow the applied notches only where the player has no pending edit, so a
   * power toggle or external state event never silently discards a staged notch.
   */
  private syncStagedFromState_(appliedNotches: NotchConfig[] | undefined): void {
    if (!appliedNotches) {
      return;
    }

    for (let i = 0; i < appliedNotches.length; i++) {
      const applied = appliedNotches[i];
      const staged = this.stagedNotches_[i];

      if (!this.hasPendingEdit_[i] || !staged) {
        this.stagedNotches_[i] = { ...applied };
        this.hasPendingEdit_[i] = false;
      } else if (NotchFilterAdapter.isSameNotch_(staged, applied)) {
        this.hasPendingEdit_[i] = false;
      }
    }
  }

  /**
   * @param isUserEdit true when called from the player's own edit; otherwise a
   *   focused input is left alone (CLAUDE.md "Protecting Input Fields").
   */
  private updateStagedDisplays_(isUserEdit = false): void {
    const isPowered = this.notchFilterModule.state.isPowered;
    const canWrite = (input: HTMLInputElement): boolean => isUserEdit || document.activeElement !== input;
    let isAnyPending = false;

    for (let i = 0; i < 3; i++) {
      const prefix = `notch-${i}`;
      const notch = this.stagedNotches_[i];
      if (!notch) continue;

      const enabledSwitch = this.domCache_.get(`${prefix}-enabled`) as HTMLInputElement;
      const freqInput = this.domCache_.get(`${prefix}-freq`) as HTMLInputElement;
      const bwInput = this.domCache_.get(`${prefix}-bw`) as HTMLInputElement;
      const depthInput = this.domCache_.get(`${prefix}-depth`) as HTMLInputElement;

      if (enabledSwitch) enabledSwitch.checked = notch.enabled;

      if (freqInput) {
        if (canWrite(freqInput)) freqInput.value = isPowered ? notch.centerFrequency.toString() : '--';
        freqInput.disabled = !isPowered;
      }
      if (bwInput) {
        if (canWrite(bwInput)) bwInput.value = isPowered ? notch.bandwidth.toString() : '--';
        bwInput.disabled = !isPowered;
      }
      if (depthInput) {
        if (canWrite(depthInput)) depthInput.value = isPowered ? notch.depth.toString() : '--';
        depthInput.disabled = !isPowered;
      }

      // Disable buttons when powered off
      this.setNotchButtonsEnabled_(i, isPowered);

      isAnyPending = this.updateNotchIndicator_(i, isPowered) || isAnyPending;
    }

    // Disable apply button when powered off; highlight it only when there is something to apply
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    if (applyBtn) {
      applyBtn.disabled = !isPowered;
      applyBtn.classList.toggle('is-pending', isPowered && isAnyPending);
    }
  }

  /**
   * Per-notch staged-vs-applied indicator: the header badge shows what is
   * applied (ON/OFF, or PENDING with an unapplied edit) and changed inputs get
   * the pending style. Returns true when this notch has an unapplied diff.
   */
  private updateNotchIndicator_(index: number, isPowered: boolean): boolean {
    const prefix = `notch-${index}`;
    const staged = this.stagedNotches_[index];
    const applied = this.notchFilterModule.state.notches[index];
    if (!staged || !applied) return false;

    const isFreqPending = staged.centerFrequency !== applied.centerFrequency;
    const isBwPending = staged.bandwidth !== applied.bandwidth;
    const isDepthPending = staged.depth !== applied.depth;
    const isEnablePending = staged.enabled !== applied.enabled;
    const isPending = isFreqPending || isBwPending || isDepthPending || isEnablePending;

    this.domCache_.get(`${prefix}-freq`)?.classList.toggle('is-pending', isPowered && isFreqPending);
    this.domCache_.get(`${prefix}-bw`)?.classList.toggle('is-pending', isPowered && isBwPending);
    this.domCache_.get(`${prefix}-depth`)?.classList.toggle('is-pending', isPowered && isDepthPending);

    const statusEl = this.getAppliedStatusEl_(index);
    if (statusEl) {
      const appliedText = `Applied: ${applied.enabled ? 'ON' : 'OFF'}, ${applied.centerFrequency} MHz / ${applied.bandwidth} MHz / ${applied.depth} dB`;
      if (!isPowered) {
        statusEl.textContent = 'OFF';
        statusEl.className = 'status-badge status-badge-off ms-1';
      } else if (isPending) {
        statusEl.textContent = 'PENDING';
        statusEl.className = 'status-badge status-badge-degraded ms-1';
      } else if (applied.enabled) {
        statusEl.textContent = 'ON';
        statusEl.className = 'status-badge status-badge-good ms-1';
      } else {
        statusEl.textContent = 'OFF';
        statusEl.className = 'status-badge status-badge-off ms-1';
      }
      statusEl.title = isPending ? `${appliedText} (staged change not applied)` : appliedText;
    }

    return isPending;
  }

  private setNotchButtonsEnabled_(index: number, enabled: boolean): void {
    const prefix = `notch-${index}`;
    const buttonKeys = [
      `${prefix}-freq-dec-coarse`,
      `${prefix}-freq-dec-fine`,
      `${prefix}-freq-inc-fine`,
      `${prefix}-freq-inc-coarse`,
      `${prefix}-bw-dec`,
      `${prefix}-bw-inc`,
      `${prefix}-depth-dec`,
      `${prefix}-depth-inc`,
    ];
    for (const key of buttonKeys) {
      const btn = this.domCache_.get(key) as HTMLButtonElement;
      if (btn) btn.disabled = !enabled;
    }
  }

  private applyHandler_(): void {
    // Snapshot first so nothing triggered by applying one notch can disturb the others
    const toApply = this.stagedNotches_.map((n) => ({ ...n }));
    for (let i = 0; i < toApply.length; i++) {
      this.notchFilterModule.handleNotchChange(i, toApply[i]);
    }
    this.hasPendingEdit_ = [false, false, false];
    this.syncDomWithState_(this.notchFilterModule.state);
    this.updateStagedDisplays_();
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

    // Follow applied notches unless the player has a pending staged edit
    this.syncStagedFromState_(state.notches);

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
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);

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
