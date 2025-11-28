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
 */
export class OMTAdapter {
  private readonly omtModule: OMTModule;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly stateChangeHandler: (state: Partial<OMTState>) => void;

  constructor(omtModule: OMTModule, containerEl: HTMLElement) {
    this.omtModule = omtModule;
    this.containerEl = containerEl;

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

    // Initial sync
    this.syncDomWithState_(this.omtModule.state);
  }

  private setupDomCache_(): void {
    const txPolDisplay = this.containerEl.querySelector('#omt-tx-pol');
    const rxPolDisplay = this.containerEl.querySelector('#omt-rx-pol');
    const isolationDisplay = this.containerEl.querySelector('#omt-isolation');
    const faultLed = this.containerEl.querySelector('#omt-fault-led');

    if (txPolDisplay) this.domCache_.set('txPolDisplay', txPolDisplay as HTMLElement);
    if (rxPolDisplay) this.domCache_.set('rxPolDisplay', rxPolDisplay as HTMLElement);
    if (isolationDisplay) this.domCache_.set('isolationDisplay', isolationDisplay as HTMLElement);
    if (faultLed) this.domCache_.set('faultLed', faultLed as HTMLElement);
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

    // Update fault LED
    if (state.isFaulted !== undefined) {
      const led = this.domCache_.get('faultLed');
      if (led) {
        led.className = state.isFaulted ? 'led led-red' : 'led led-green';
      }
    }
  }

  dispose(): void {
    EventBus.getInstance().off(Events.RF_FE_OMT_CHANGED, this.stateChangeHandler as any);
  }
}
