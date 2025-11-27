// Core business logic
export { IfFilterBankModuleCore } from './filter-module-core';
export type { IfFilterBankState, FilterBandwidthConfig } from './filter-module-core';
export { FILTER_BANDWIDTH_CONFIGS } from './filter-module-core';

// UI implementations
export { IfFilterBankModuleUIStandard } from './filter-module-ui-standard';

// Factory
export { createIfFilterBank } from './filter-module-factory';
export type { IfFilterBankModuleUIType } from './filter-module-factory';

// Backward compatibility
export { IfFilterBankModule } from './filter-module';
