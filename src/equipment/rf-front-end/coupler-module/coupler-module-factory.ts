import { RFFrontEnd } from '../rf-front-end';
import { CouplerModule, CouplerState } from './coupler-module';

export type CouplerModuleUIType = 'standard' | 'basic' | 'headless';

/**
 * Factory function to create Coupler module instances
 * Note: Coupler module hasn't been refactored into core/UI pattern yet
 */
export function createCoupler(
  state: CouplerState,
  rfFrontEnd: any, // Using any to accept both RFFrontEnd and RFFrontEndCore
  unit: number = 1,
  _parentId: string = '',
  _uiType: CouplerModuleUIType = 'standard'
): CouplerModule {
  // Only standard variant exists currently
  return new CouplerModule(state, rfFrontEnd as RFFrontEnd, unit);
}
