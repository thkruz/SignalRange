import { RFFrontEnd } from '../rf-front-end';
import { BUCModuleUIStandard } from './buc-module-ui-standard';
import { BUCState } from './buc-module-core';

/**
 * @deprecated Use BUCModuleUIStandard or createBUC() factory instead
 *
 * This class is maintained for backward compatibility.
 * Existing code using BUCModule will continue to work without changes.
 */
export class BUCModule extends BUCModuleUIStandard {
  constructor(
    state: BUCState,
    rfFrontEnd: RFFrontEnd,
    unit: number = 1,
    parentId: string = ''
  ) {
    super(state, rfFrontEnd, unit, parentId);
  }
}

// Re-export types for backward compatibility
export type { BUCState, SpuriousOutput } from './buc-module-core';
