import { ANTENNA_CONFIG_KEYS } from "./antenna-configs";
import { AntennaCore, AntennaState } from "./antenna-core";
import { AntennaUIBasic } from "./antenna-ui-basic";
import { AntennaUIHeadless } from "./antenna-ui-headless";
import { AntennaUIModern } from "./antenna-ui-modern";
import { AntennaUIStandard } from "./antenna-ui-standard";

/**
 * UI type options for antenna creation
 */
export type AntennaUIType = 'standard' | 'basic' | 'headless' | 'modern';

/**
 * Create an antenna instance with the specified UI type
 *
 * @param parentId - DOM container ID
 * @param configId - Antenna configuration ID
 * @param initialState - Initial state values
 * @param teamId - Team ID for multi-team scenarios
 * @param serverId - Server ID
 * @param uiType - UI type: 'standard' (full featured), 'basic' (simplified), or 'headless' (no UI)
 * @returns Antenna instance with the specified UI implementation
 *
 * @example
 * // Create full-featured antenna
 * const antenna = createAntenna(
 *   'antenna1-container',
 *   ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
 *   { isPowered: true },
 *   1,
 *   1,
 *   'standard'
 * );
 *
 * @example
 * // Create simplified antenna for training
 * const antenna = createAntenna(
 *   'antenna1-container',
 *   ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
 *   { isPowered: false },
 *   1,
 *   1,
 *   'basic'
 * );
 *
 * @example
 * // Create headless antenna for testing
 * const antenna = createAntenna(
 *   'test-container',
 *   ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
 *   {},
 *   1,
 *   1,
 *   'headless'
 * );
 */
export function createAntenna(
  parentId: string,
  uiType: AntennaUIType = 'standard',
  configId: ANTENNA_CONFIG_KEYS = ANTENNA_CONFIG_KEYS.C_BAND_3M_ANTESTAR,
  initialState: Partial<AntennaState> = {},
  teamId: number = 1,
  serverId: number = 1,
): AntennaCore {
  switch (uiType) {
    case 'standard':
      return new AntennaUIStandard(parentId, configId, initialState, teamId, serverId);
    case 'basic':
      return new AntennaUIBasic(parentId, configId, initialState, teamId, serverId);
    case 'headless':
      return new AntennaUIHeadless(parentId, configId, initialState, teamId, serverId);
    case 'modern':
      return new AntennaUIModern(parentId, configId, initialState, teamId, serverId);
    default:
      // TypeScript should prevent this, but provide fallback
      throw new Error(`Unknown antenna UI type: ${uiType}`);
  }
}
