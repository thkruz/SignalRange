import { RFFrontEndCore } from '../rf-front-end-core';
import { HPAModuleCore, HPAState } from './hpa-module-core';
import { HPAModuleUIStandard } from './hpa-module-ui-standard';

export type HPAModuleUIType = 'standard' | 'basic' | 'headless';

/**
 * Factory function to create HPA module instances
 * Enables switching between UI implementations
 */
export function createHPA(
  state: HPAState,
  rfFrontEnd: RFFrontEndCore,
  unit: number = 1,
  parentId: string,
  uiType: HPAModuleUIType = 'standard'
): HPAModuleCore {
  switch (uiType) {
    case 'standard':
      return new HPAModuleUIStandard(state, rfFrontEnd, unit, parentId);
    case 'basic':
      throw new Error('HPAModuleUIBasic not yet implemented');
    case 'headless':
      throw new Error('HPAModuleUIHeadless not yet implemented');
    default:
      return new HPAModuleUIStandard(state, rfFrontEnd, unit, parentId);
  }
}
