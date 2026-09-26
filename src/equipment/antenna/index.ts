// Core business logic

// Configuration
export { ANTENNA_CONFIG_KEYS } from './antenna-config-keys';
export type { AntennaConfig } from './antenna-configs';
export { ANTENNA_CONFIGS } from './antenna-configs';
export type { AntennaState } from './antenna-core';
export { AntennaCore } from './antenna-core';
export type { AntennaUIType } from './antenna-factory';
// Factory function
export { createAntenna } from './antenna-factory';
// Open registry (plugins add hardware configs here)
export type { AntennaConfigId, AntennaCoreFactory, AntennaRegistryEntry, AntennaSource, RegisterAntennaOptions } from './antenna-registry';
export { AntennaRegistry } from './antenna-registry';
// UI implementations
export { AntennaUIBasic } from './antenna-ui-basic';
export { AntennaUIHeadless } from './antenna-ui-headless';
export { AntennaUIStandard } from './antenna-ui-standard';
