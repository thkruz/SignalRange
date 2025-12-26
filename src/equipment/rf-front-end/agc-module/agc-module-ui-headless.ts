import { RFFrontEndCore } from '../rf-front-end-core';
import { AGCModuleCore, AGCState } from './agc-module-core';

/**
 * Headless implementation of AGCModule
 *
 * This implementation provides no DOM/UI elements since all UI is
 * handled by an adapter in the RX Analysis Tab.
 * Only business logic from the core class is used.
 */
export class AGCModuleUIHeadless extends AGCModuleCore {
  constructor(state: AGCState, rfFrontEnd: RFFrontEndCore, unit: number = 1) {
    super(
      { ...AGCModuleCore.getDefaultState(), ...state },
      rfFrontEnd,
      unit
    );
  }

  /**
   * No DOM initialization needed for headless implementation
   */
  protected initializeDom(_parentId: string): HTMLElement {
    // Return empty div - no DOM for headless implementation
    return document.createElement('div') as unknown as HTMLElement;
  }

  /**
   * No event listeners needed for headless implementation
   * All UI interaction is handled by adapter
   */
  addEventListeners(_cb: (state: AGCState) => void): void {
    // No DOM listeners - adapter handles all UI
  }

  /**
   * No DOM to sync for headless implementation
   */
  protected syncDomWithState_(): void {
    // No DOM to sync
  }
}
