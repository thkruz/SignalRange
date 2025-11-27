import { RFFrontEndCore } from '../rf-front-end-core';
import { OMTModule, OMTState } from './omt-module';

export type OMTModuleUIType = 'standard' | 'basic' | 'headless';

/**
 * Factory function to create OMT module instances
 * Note: OMT module hasn't been refactored into core/UI pattern yet
 */
export function createOMT(
  state: OMTState,
  rfFrontEnd: RFFrontEndCore,
  unit: number = 1,
  _parentId: string = '',
  _uiType: OMTModuleUIType = 'standard'
): OMTModule {
  // Only standard variant exists currently
  return new OMTModule(state, rfFrontEnd, unit);
}
