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
    super(parentId, configId, initialState, teamId, serverId);
    super.build(parentId);
  }

  protected override initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    // Create minimal hidden DOM stub
    const container = document.createElement('div');
    container.id = this.uuid;
    container.className = 'antenna-headless';
    container.style.display = 'none'; // Hidden

    parentDom.appendChild(container);

    this.domCache['parent'] = container;

    return parentDom;
  }

  protected override addListeners_(): void {
    // No UI components = no listeners
  }

  protected syncDomWithState(): void {
    // No DOM to sync
    // State changes are still tracked in AntennaCore
  }

  draw(): void {
    // No visualization in headless mode
  }
}
