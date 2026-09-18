import { ANTENNA_CONFIG_KEYS } from './antenna-config-keys';
import { AntennaCore, AntennaState } from './antenna-core';
import { type AntennaConfigId, AntennaRegistry } from './antenna-registry';
import { AntennaUIBasic } from './antenna-ui-basic';
import { AntennaUIHeadless } from './antenna-ui-headless';
import { AntennaUIModern } from './antenna-ui-modern';
import { AntennaUIStandard } from './antenna-ui-standard';

/**
 * UI type options for antenna creation
 */
export type AntennaUIType = 'standard' | 'basic' | 'headless' | 'modern';

/**
 * Create an antenna instance with the specified UI type
 *
 * When the config id was registered by a plugin together with a core factory
 * (custom AntennaCore subclass), the headless variant is built by that factory
 * so Mission Control gets the plugin's behaviour. The DOM-bearing UI types keep
 * the engine classes: a plugin that needs its own control surface supplies a
 * tab, not a UI subclass.
 *
 * @param parentId - DOM container ID
 * @param uiType - UI type: 'standard' (full featured), 'basic' (simplified), 'headless' (no UI), 'modern'
 * @param configId - Antenna configuration ID (built-in enum member or a plugin-registered id)
 * @param initialState - Initial state values
 * @param teamId - Team ID for multi-team scenarios
 * @param serverId - Server ID
 * @returns Antenna instance with the specified UI implementation
 *
 * @example
 * // Create full-featured antenna
 * const antenna = createAntenna('antenna1-container', 'standard', ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, { isPowered: true });
 *
 * @example
 * // Create headless antenna for testing
 * const antenna = createAntenna('test-container', 'headless', ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK);
 */
export function createAntenna(
  parentId: string,
  uiType: AntennaUIType = 'standard',
  configId: AntennaConfigId = ANTENNA_CONFIG_KEYS.C_BAND_3M_ANTESTAR,
  initialState: Partial<AntennaState> = {},
  teamId: number = 1,
  serverId: number = 1
): AntennaCore {
  switch (uiType) {
    case 'standard':
      return new AntennaUIStandard(parentId, configId, initialState, teamId, serverId);
    case 'basic':
      return new AntennaUIBasic(parentId, configId, initialState, teamId, serverId);
    case 'headless': {
      const coreFactory = AntennaRegistry.getInstance().find(configId)?.core;

      if (coreFactory) {
        return coreFactory(parentId, configId, initialState, teamId, serverId);
      }

      return new AntennaUIHeadless(parentId, configId, initialState, teamId, serverId);
    }
    case 'modern':
      return new AntennaUIModern(parentId, configId, initialState, teamId, serverId);
    default:
      // TypeScript should prevent this, but provide fallback
      throw new Error(`Unknown antenna UI type: ${uiType}`);
  }
}
