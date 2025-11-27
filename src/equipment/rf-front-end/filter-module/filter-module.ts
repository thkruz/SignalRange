import { RFFrontEnd } from '../rf-front-end';
import { IfFilterBankModuleUIStandard } from './filter-module-ui-standard';
import { IfFilterBankState } from './filter-module-core';

/**
 * @deprecated Use IfFilterBankModuleUIStandard or createIfFilterBank() factory instead
 *
 * This class is maintained for backward compatibility.
 * Existing code using IfFilterBankModule will continue to work without changes.
 */
export class IfFilterBankModule extends IfFilterBankModuleUIStandard {
  constructor(
    state: IfFilterBankState,
    rfFrontEnd: RFFrontEnd,
    unit: number = 1,
    parentId: string = ''
  ) {
    super(state, rfFrontEnd, unit, parentId);
  }
}

// Re-export types and constants for backward compatibility
export type { IfFilterBankState, FilterBandwidthConfig } from './filter-module-core';
export { FILTER_BANDWIDTH_CONFIGS } from './filter-module-core';
