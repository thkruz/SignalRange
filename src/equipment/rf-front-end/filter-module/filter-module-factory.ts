import { RFFrontEnd } from '../rf-front-end';
import { IfFilterBankModuleCore, IfFilterBankState } from './filter-module-core';
import { IfFilterBankModuleUIStandard } from './filter-module-ui-standard';

export type IfFilterBankModuleUIType = 'standard' | 'basic' | 'headless';

/**
 * Factory function to create IF Filter Bank module instances
 * Enables switching between UI implementations
 */
export function createIfFilterBank(
  state: IfFilterBankState,
  rfFrontEnd: RFFrontEnd,
  unit: number = 1,
  parentId: string,
  uiType: IfFilterBankModuleUIType = 'standard'
): IfFilterBankModuleCore {
  switch (uiType) {
    case 'standard':
      return new IfFilterBankModuleUIStandard(state, rfFrontEnd, unit, parentId);
    case 'basic':
      throw new Error('IfFilterBankModuleUIBasic not yet implemented');
    case 'headless':
      throw new Error('IfFilterBankModuleUIHeadless not yet implemented');
    default:
      return new IfFilterBankModuleUIStandard(state, rfFrontEnd, unit, parentId);
  }
}
