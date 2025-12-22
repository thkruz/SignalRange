// Core business logic
export { AntennaCore } from './antenna-core';
export type { AntennaState } from './antenna-core';

// UI implementations
export { AntennaUIBasic } from './antenna-ui-basic';
export { AntennaUIHeadless } from './antenna-ui-headless';
export { AntennaUIStandard } from './antenna-ui-standard';

// Factory function
export { createAntenna } from './antenna-factory';
export type { AntennaUIType } from './antenna-factory';

// Configuration
export { ANTENNA_CONFIG_KEYS, ANTENNA_CONFIGS } from './antenna-configs';
export type { AntennaConfig } from './antenna-configs';

