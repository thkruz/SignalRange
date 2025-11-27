import { RFFrontEnd } from '../rf-front-end';
import { HPAModuleUIStandard } from './hpa-module-ui-standard';
import { HPAState } from './hpa-module-core';

/**
 * @deprecated Use HPAModuleUIStandard or createHPA() factory instead
 *
 * This class is maintained for backward compatibility.
 * Existing code using HPAModule will continue to work without changes.
 */
export class HPAModule extends HPAModuleUIStandard {
  constructor(
    state: HPAState,
    rfFrontEnd: RFFrontEnd,
    unit: number = 1,
    parentId: string = ''
  ) {
    super(state, rfFrontEnd, unit, parentId);
  }
}

// Re-export types for backward compatibility
export type { HPAState } from './hpa-module-core';
