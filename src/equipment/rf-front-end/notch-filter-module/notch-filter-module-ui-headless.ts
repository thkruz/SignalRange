import { RFFrontEndCore } from '../rf-front-end-core';
import { NotchFilterModuleCore, NotchFilterState } from './notch-filter-module-core';

/**
 * Headless implementation of NotchFilterModule
 *
 * This implementation provides no DOM/UI elements since all UI is
 * handled by NotchFilterAdapter in the RX Analysis Tab.
 * Only business logic from the core class is used.
 */
export class NotchFilterModuleUIHeadless extends NotchFilterModuleCore {
  constructor(state: NotchFilterState, rfFrontEnd: RFFrontEndCore, unit: number = 1) {
    super(
      { ...NotchFilterModuleCore.getDefaultState(), ...state },
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
   * All UI interaction is handled by NotchFilterAdapter
   */
  addEventListeners(_cb: (state: NotchFilterState) => void): void {
    // No DOM listeners - adapter handles all UI
  }

  /**
   * No DOM to sync for headless implementation
   */
  protected syncDomWithState_(): void {
    // No DOM to sync
  }
}
