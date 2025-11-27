import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { SimulationManager } from "@app/simulation/simulation-manager";
import './asset-tree-sidebar.css';

/**
 * AssetTreeSidebar - Hierarchical tree view of ground stations and satellites
 *
 * Displays:
 * - Ground Stations (expandable, shows equipment)
 * - Satellites (placeholder for Phase 8+)
 */
export class AssetTreeSidebar extends BaseElement {
  static readonly containerId = 'asset-tree-sidebar-container';

  private selectedAssetId_: string | null = null;
  private groundStations_: GroundStation[] = [];

  protected html_ = html`
    <div class="asset-tree-sidebar">
      <div class="sidebar-header">
        <h3>Assets</h3>
      </div>
      <div class="sidebar-content">
        <div id="asset-tree" class="asset-tree"></div>
      </div>
    </div>
  `;

  constructor(parentId: string) {
    super();
    this.init_(parentId, 'replace');
    this.dom_ = qs('.asset-tree-sidebar');
    this.groundStations_ = SimulationManager.getInstance().groundStations;
    this.renderAssetTree_();
  }

  protected addEventListeners_(): void {
    // Event listeners added dynamically when tree is rendered
  }

  /**
   * Render the asset tree with ground stations and satellites
   */
  private renderAssetTree_(): void {
    const treeContainer = qs('#asset-tree', this.dom_);

    const treeHtml = html`
      <div class="asset-category">
        <div class="category-header">
          <span class="category-icon">🛰️</span>
          <span class="category-title">Ground Stations</span>
        </div>
        <div class="category-items">
          ${this.groundStations_.map(gs => this.renderGroundStationNode_(gs)).join('')}
        </div>
      </div>

      <div class="asset-category">
        <div class="category-header">
          <span class="category-icon">📡</span>
          <span class="category-title">Satellites</span>
        </div>
        <div class="category-items">
          <div class="asset-item placeholder-item">
            <span class="item-icon">ℹ️</span>
            <span class="item-label">No satellites in scenario</span>
          </div>
        </div>
      </div>
    `;

    treeContainer.innerHTML = treeHtml;
    this.addTreeEventListeners_();
  }

  /**
   * Render a ground station node
   */
  private renderGroundStationNode_(gs: GroundStation): string {
    const isSelected = this.selectedAssetId_ === gs.state.id;

    return html`
      <div class="asset-item ${isSelected ? 'selected' : ''}"
           data-asset-type="ground-station"
           data-asset-id="${gs.state.id}">
        <span class="item-icon">📍</span>
        <span class="item-label">${gs.state.name}</span>
        <span class="item-status ${gs.state.isOperational ? 'operational' : 'offline'}"></span>
      </div>
    `;
  }

  /**
   * Add event listeners to tree items
   */
  private addTreeEventListeners_(): void {
    const assetItems = this.dom_.querySelectorAll('.asset-item:not(.placeholder-item)');

    assetItems.forEach(item => {
      item.addEventListener('click', () => {
        const type = item.getAttribute('data-asset-type') as 'ground-station' | 'satellite';
        const id = item.getAttribute('data-asset-id');

        if (!id) return;

        // Update selection state
        this.selectedAssetId_ = id;

        // Update UI
        assetItems.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        // Emit asset selected event
        EventBus.getInstance().emit(Events.ASSET_SELECTED, { type, id });
      });
    });
  }

  /**
   * Refresh the asset tree (called when ground stations change)
   */
  public refresh(): void {
    this.groundStations_ = SimulationManager.getInstance().groundStations;
    this.renderAssetTree_();
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    // Cleanup if needed
  }
}
