import { RFFrontEnd } from '../rf-front-end';
import { GPSDOModuleUIStandard } from './gpsdo-module-ui-standard';
import { GPSDOState } from './GPSDOState';

/**
 * @deprecated Use GPSDOModuleUIStandard or createGPSDO() factory instead
 *
 * This class is maintained for backward compatibility.
 * Existing code using GPSDOModule will continue to work without changes.
 */
export class GPSDOModule extends GPSDOModuleUIStandard {
  constructor(
    state: GPSDOState,
    rfFrontEnd: RFFrontEnd,
    unit: number = 1,
    parentId: string = ''
  ) {
    super(state, rfFrontEnd, unit, parentId);
  }
}

// Re-export types for backward compatibility
export type { GPSDOState } from './GPSDOState';
