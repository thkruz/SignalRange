import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { NotchFilterModuleCore, NotchFilterState } from './notch-filter-module-core';
import { NotchFilterModuleUIHeadless } from './notch-filter-module-ui-headless';

export type NotchFilterModuleUIType = 'headless';

/**
 * Factory function to create Notch Filter module instances
 *
 * Currently only supports 'headless' type since UI is handled
 * by NotchFilterAdapter in the RX Analysis Tab.
 *
 * @param state - Initial state for the module
 * @param rfFrontEnd - Parent RF Front End instance
 * @param unit - Unit number (default 1)
 * @param uiType - UI type (default 'headless')
 * @returns NotchFilterModuleCore instance
 */
export function createNotchFilter(
  state: NotchFilterState,
  rfFrontEnd: RFFrontEndCore,
  unit: number = 1,
  uiType: NotchFilterModuleUIType = 'headless'
): NotchFilterModuleCore {
  switch (uiType) {
    case 'headless':
    default:
      return new NotchFilterModuleUIHeadless(state, rfFrontEnd, unit);
  }
}
