import { RFFrontEndCore, RFFrontEndState } from './rf-front-end-core';
import { RFFrontEndUIStandard } from './rf-front-end-ui-standard';

export type RFFrontEndUIType = 'standard' | 'basic' | 'headless';

/**
 * Factory function to create RFFrontEndCore instances
 * Enables switching between UI implementations
 *
 * @param parentId - DOM container ID for rendering
 * @param state - Partial state object for initialization
 * @param teamId - Team identifier
 * @param serverId - Server identifier
 * @param uiType - UI variant to instantiate ('standard', 'basic', 'headless')
 * @returns RFFrontEndCore instance with selected UI implementation
 */
export function createRFFrontEnd(
  parentId: string,
  state?: Partial<RFFrontEndState>,
  uiType: RFFrontEndUIType = 'standard',
  teamId: number = 1,
  serverId: number = 1,
): RFFrontEndCore {
  switch (uiType) {
    case 'standard':
      return new RFFrontEndUIStandard(parentId, state, teamId, serverId);
    case 'headless':
      throw new Error('RFFrontEndHeadless not yet implemented - user will implement later');
    case 'basic':
      throw new Error('RFFrontEndUIBasic not yet implemented');
    default:
      return new RFFrontEndUIStandard(parentId, state, teamId, serverId);
  }
}
