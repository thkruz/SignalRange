// Core business logic

export type { HPAState } from './hpa-module-core';
export { HPAModuleCore } from './hpa-module-core';
export type { HPAModuleUIType } from './hpa-module-factory';

// Factory
export { createHPA } from './hpa-module-factory';
// UI implementations
export { HPAModuleUIStandard } from './hpa-module-ui-standard';
