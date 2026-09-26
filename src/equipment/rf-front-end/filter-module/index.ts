// Core business logic

export type { FilterBandwidthConfig, IfFilterBankState } from './filter-module-core';
export { FILTER_BANDWIDTH_CONFIGS, IfFilterBankModuleCore } from './filter-module-core';
export type { IfFilterBankModuleUIType } from './filter-module-factory';

// Factory
export { createIfFilterBank } from './filter-module-factory';
// UI implementations
export { IfFilterBankModuleUIStandard } from './filter-module-ui-standard';
