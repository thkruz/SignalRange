import { RFFrontEndCore } from '../rf-front-end-core';
import { AGCModuleCore, AGCState } from './agc-module-core';
import { AGCModuleUIHeadless } from './agc-module-ui-headless';

export type AGCModuleUIType = 'headless';

/**
 * Factory function to create AGC module instances
 *
 * Currently only supports 'headless' type since UI is handled
 * by an adapter in the RX Analysis Tab.
 *
 * @param state - Initial state for the module
 * @param rfFrontEnd - Parent RF Front End instance
 * @param unit - Unit number (default 1)
 * @param uiType - UI type (default 'headless')
 * @returns AGCModuleCore instance
 */
export function createAGC(
  state: AGCState,
  rfFrontEnd: RFFrontEndCore,
  unit: number = 1,
  uiType: AGCModuleUIType = 'headless'
): AGCModuleCore {
  switch (uiType) {
    case 'headless':
    default:
      return new AGCModuleUIHeadless(state, rfFrontEnd, unit);
  }
}
