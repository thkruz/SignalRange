import { RFFrontEndCore } from '../rf-front-end-core';
import { LNBModuleCore, LNBState } from './lnb-module-core';
import { LNBModuleUIStandard } from './lnb-module-ui-standard';

export type LNBModuleUIType = 'standard' | 'basic' | 'headless';

/**
 * Factory function to create LNB module instances
 * Enables switching between UI implementations
 */
export function createLNB(
  state: LNBState,
  rfFrontEnd: RFFrontEndCore,
  unit: number = 1,
  parentId: string = '',
  uiType: LNBModuleUIType = 'standard'
): LNBModuleCore {
  switch (uiType) {
    case 'standard':
      return new LNBModuleUIStandard(state, rfFrontEnd, unit, parentId);
    case 'basic':
      throw new Error('LNBModuleUIBasic not yet implemented');
    case 'headless':
      throw new Error('LNBModuleUIHeadless not yet implemented');
    default:
      return new LNBModuleUIStandard(state, rfFrontEnd, unit, parentId);
  }
}
