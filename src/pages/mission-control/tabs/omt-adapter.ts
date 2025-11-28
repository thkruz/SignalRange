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
  private omtModule: OMTModule;
  private containerEl: HTMLElement;
  private lastStateString: string = '';
  private stateChangeHandler: Function | null = null;

  constructor(omtModule: OMTModule, containerEl: HTMLElement) {
    this.omtModule = omtModule;
    this.containerEl = containerEl;
    this.initialize();
  }

  private initialize(): void {
    // Listen to OMT state changes
    this.stateChangeHandler = ((state: Partial<OMTState>) => {
      this.syncDomWithState(state);
    }) as Function;
    EventBus.getInstance().on(Events.RF_FE_OMT_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState(this.omtModule.state);
  }

  private syncDomWithState(state: Partial<OMTState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) {
      return;
    }
    this.lastStateString = stateStr;

    // Update TX polarization display
    if (state.effectiveTxPol !== undefined) {
      const display = this.containerEl.querySelector('#omt-tx-pol');
      if (display) {
        display.textContent = state.effectiveTxPol || 'None';
      }
    }

    // Update RX polarization display
    if (state.effectiveRxPol !== undefined) {
      const display = this.containerEl.querySelector('#omt-rx-pol');
      if (display) {
        display.textContent = state.effectiveRxPol || 'None';
      }
    }

    // Update cross-pol isolation
    if (state.crossPolIsolation !== undefined) {
      const display = this.containerEl.querySelector('#omt-isolation');
      if (display) {
        display.textContent = `${state.crossPolIsolation.toFixed(1)} dB`;
      }
    }

    // Update fault LED
    if (state.isFaulted !== undefined) {
      const led = this.containerEl.querySelector('#omt-fault-led');
      if (led) {
        led.className = state.isFaulted ? 'led led-red' : 'led led-green';
      }
    }
  }

  public dispose(): void {
    if (this.stateChangeHandler) {
      EventBus.getInstance().off(Events.RF_FE_OMT_CHANGED, this.stateChangeHandler as any);
      this.stateChangeHandler = null;
    }
  }
}
