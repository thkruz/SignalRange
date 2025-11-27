import { RFFrontEndCore } from '../rf-front-end-core';
import { BUCModuleCore, BUCState } from './buc-module-core';
import { BUCModuleUIStandard } from './buc-module-ui-standard';

export type BUCModuleUIType = 'standard' | 'basic' | 'headless';

/**
 * Factory function to create BUC module instances
 * Enables switching between UI implementations
 */
export function createBUC(
  state: BUCState,
  rfFrontEnd: RFFrontEndCore,
  unit: number = 1,
  parentId: string,
  uiType: BUCModuleUIType = 'standard'
): BUCModuleCore {
  switch (uiType) {
    case 'standard':
      return new BUCModuleUIStandard(state, rfFrontEnd, unit, parentId);
    case 'basic':
      throw new Error('BUCModuleUIBasic not yet implemented');
    case 'headless':
      throw new Error('BUCModuleUIHeadless not yet implemented');
    default:
      return new BUCModuleUIStandard(state, rfFrontEnd, unit, parentId);
  }
}
