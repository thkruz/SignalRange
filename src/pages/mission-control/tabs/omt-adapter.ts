import { EngineeringModeService } from '@app/engineering-mode/engineering-mode-service';
import { OMTModule, OMTState } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';

/**
 * OMTAdapter - Bridges OMT module state to web displays
 *
 * Responsibilities:
 * - Listen to OMT state changes
 * - Update polarization displays (TX/RX)
 * - Update cross-pol isolation display
 * - Update fault LED
 * - Clean up event listeners on dispose
 *
 * Note: OMT is read-only (no user controls)
 * Supports multi-instance mode via optional idPrefix parameter.
 */
export class OMTAdapter {
  private readonly omtModule: OMTModule;
  private readonly containerEl: HTMLElement;
  private readonly idPrefix_: string;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly stateChangeHandler: (state: Partial<OMTState>) => void;

  constructor(omtModule: OMTModule, containerEl: HTMLElement, idPrefix: string = '') {
    this.omtModule = omtModule;
    this.containerEl = containerEl;
    this.idPrefix_ = idPrefix;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<OMTState>) => {
      this.syncDomWithState_(state);
    };

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Listen to OMT state changes
    EventBus.getInstance().on(Events.RF_FE_OMT_CHANGED, this.stateChangeHandler as any);

    // Setup engineering mode listener
    this.setupEngineeringModeListener_();

    // Setup reverse polarization switch handler
    this.setupReversePolHandler_();

    // Initial sync
    this.syncDomWithState_(this.omtModule.state);
  }

  private setupEngineeringModeListener_(): void {
    const engService = EngineeringModeService.getInstance();

    // Listen for engineering mode changes
    engService.onChange((enabled) => {
      this.updateEngineeringModeVisibility_(enabled);
    });

    // Set initial visibility
    this.updateEngineeringModeVisibility_(engService.isEnabled());
  }

  private updateEngineeringModeVisibility_(enabled: boolean): void {
    const container = this.domCache_.get('engineeringControls');
    if (container) {
      container.style.display = enabled ? 'block' : 'none';
    }
  }

  private setupReversePolHandler_(): void {
    const reversePolSwitch = this.domCache_.get('reversePolSwitch') as HTMLInputElement | null;
    if (!reversePolSwitch) return;

    // Set initial state based on OMT module (reversed when txPolarization is 'V')
    reversePolSwitch.checked = this.omtModule.state.txPolarization === 'V';

    reversePolSwitch.addEventListener('change', () => {
      // Toggle polarization: 'H' (normal) or 'V' (reversed)
      const newPol = reversePolSwitch.checked ? 'V' : 'H';
      this.omtModule.state.txPolarization = newPol;
      this.omtModule.state.rxPolarization = reversePolSwitch.checked ? 'H' : 'V';

      // Trigger update to recalculate effective polarization
      this.omtModule.update();

      // Sync DOM with new state
      this.syncDomWithState_(this.omtModule.state);
    });
  }

  private setupDomCache_(): void {
    const p = this.idPrefix_;
    const txPolDisplay = this.containerEl.querySelector(`#${p}omt-tx-pol`);
    const rxPolDisplay = this.containerEl.querySelector(`#${p}omt-rx-pol`);
    const isolationDisplay = this.containerEl.querySelector(`#${p}omt-isolation`);
    const statusBadge = this.containerEl.querySelector(`#${p}omt-status`);
    const engineeringControls = this.containerEl.querySelector(`#${p}omt-engineering-controls`);
    const reversePolSwitch = this.containerEl.querySelector(`#${p}omt-reverse-pol`);

    if (txPolDisplay) this.domCache_.set('txPolDisplay', txPolDisplay as HTMLElement);
    if (rxPolDisplay) this.domCache_.set('rxPolDisplay', rxPolDisplay as HTMLElement);
    if (isolationDisplay) this.domCache_.set('isolationDisplay', isolationDisplay as HTMLElement);
    if (statusBadge) this.domCache_.set('statusBadge', statusBadge as HTMLElement);
    if (engineeringControls) this.domCache_.set('engineeringControls', engineeringControls as HTMLElement);
    if (reversePolSwitch) this.domCache_.set('reversePolSwitch', reversePolSwitch as HTMLElement);
  }

  update(): void {
    this.syncDomWithState_(this.omtModule.state);
  }

  private syncDomWithState_(state: Partial<OMTState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) {
      return;
    }
    this.lastStateString = stateStr;

    // Update TX polarization display
    if (state.effectiveTxPol !== undefined) {
      const display = this.domCache_.get('txPolDisplay');
      if (display) {
        display.textContent = state.effectiveTxPol || 'None';
      }
    }

    // Update RX polarization display
    if (state.effectiveRxPol !== undefined) {
      const display = this.domCache_.get('rxPolDisplay');
      if (display) {
        display.textContent = state.effectiveRxPol || 'None';
      }
    }

    // Update cross-pol isolation
    if (state.crossPolIsolation !== undefined) {
      const display = this.domCache_.get('isolationDisplay');
      if (display) {
        display.textContent = `${state.crossPolIsolation.toFixed(1)} dB`;
      }
    }

    // Update status badge
    if (state.isFaulted !== undefined) {
      const statusBadge = this.domCache_.get('statusBadge');
      if (statusBadge) {
        statusBadge.className = state.isFaulted
          ? 'status-badge status-badge-red'
          : 'status-badge status-badge-green';
        statusBadge.textContent = state.isFaulted ? 'FAULT' : 'OK';
      }
    }
  }

  dispose(): void {
    EventBus.getInstance().off(Events.RF_FE_OMT_CHANGED, this.stateChangeHandler as any);
  }
}
