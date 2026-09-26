// Core business logic

export type { BUCState, SpuriousOutput } from './buc-module-core';
export { BUCModuleCore } from './buc-module-core';
export type { BUCModuleUIType } from './buc-module-factory';

// Factory
export { createBUC } from './buc-module-factory';
// UI implementations
export { BUCModuleUIStandard } from './buc-module-ui-standard';
