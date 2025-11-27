import { RFFrontEnd } from '../rf-front-end';
import { LNBModuleUIStandard } from './lnb-module-ui-standard';
import { LNBState } from './lnb-module-core';

/**
 * @deprecated Use LNBModuleUIStandard or createLNB() factory instead
 *
 * This class is maintained for backward compatibility.
 * Existing code using LNBModule will continue to work without changes.
 */
export class LNBModule extends LNBModuleUIStandard {
  constructor(
    state: LNBState,
    rfFrontEnd: RFFrontEnd,
    unit: number = 1,
    parentId: string = ''
  ) {
    super(state, rfFrontEnd, unit, parentId);
  }
}

// Re-export types for backward compatibility
export type { LNBState } from './lnb-module-core';
