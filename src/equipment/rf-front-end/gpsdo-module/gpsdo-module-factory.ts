import { RFFrontEndCore } from '../rf-front-end-core';
import { GPSDOModuleCore } from './gpsdo-module-core';
import { GPSDOModuleUIStandard } from './gpsdo-module-ui-standard';
import { GPSDOState } from './gpsdo-state';

export type GPSDOModuleUIType = 'standard' | 'basic' | 'headless';

/**
 * Factory function to create GPSDO module instances
 * Enables switching between UI implementations
 */
export function createGPSDO(
  state: GPSDOState,
  rfFrontEnd: RFFrontEndCore,
  unit: number = 1,
  parentId: string = '',
  uiType: GPSDOModuleUIType = 'standard'
): GPSDOModuleCore {
  switch (uiType) {
    case 'standard':
      return new GPSDOModuleUIStandard(state, rfFrontEnd, unit, parentId);
    case 'basic':
      throw new Error('GPSDOModuleUIBasic not yet implemented');
    case 'headless':
      throw new Error('GPSDOModuleUIHeadless not yet implemented');
    default:
      return new GPSDOModuleUIStandard(state, rfFrontEnd, unit, parentId);
  }
}
