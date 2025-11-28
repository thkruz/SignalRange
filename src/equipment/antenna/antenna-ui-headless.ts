import { ANTENNA_CONFIG_KEYS } from "./antenna-configs";
import { AntennaCore, AntennaState } from "./antenna-core";

/**
 * AntennaUIHeadless - No UI implementation for testing and backend simulations
 *
 * Purpose:
 * - Unit tests (avoid overhead of full UI components)
 * - Backend link budget calculations
 * - Batch scenario processing
 * - CI/CD automated testing
 *
 * Features:
 * - All business logic from AntennaCore
 * - Hidden DOM stub (not visible)
 * - All UI methods are no-ops
 * - Minimal memory footprint
 */
export class AntennaUIHeadless extends AntennaCore {
  constructor(
    parentId: string,
    configId: ANTENNA_CONFIG_KEYS = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
    initialState: Partial<AntennaState> = {},
    teamId: number = 1,
    serverId: number = 1,
  ) {
    // Call parent constructor
    super(configId, initialState, teamId, serverId);
    super.build(parentId);
  }

  protected override initializeDom(_parentId: string): HTMLElement {
    // For headless mode, create a hidden container directly in body
    // Don't require a specific parent element
    const container = document.createElement('div');
    container.id = `antenna-headless-${this.uuid}`;
    container.className = 'antenna-headless';
    container.style.display = 'none'; // Hidden
    container.style.position = 'absolute';
    container.style.visibility = 'hidden';

    // Append to body instead of looking for specific parent
    document.body.appendChild(container);

    this.domCache['parent'] = container;

    return container as unknown as HTMLElement;
  }

  protected override addListeners_(): void {
    // No UI components = no listeners
  }

  syncDomWithState(): void {
    // No DOM to sync
    // State changes are still tracked in AntennaCore
  }

  draw(): void {
    // No visualization in headless mode
  }
}
