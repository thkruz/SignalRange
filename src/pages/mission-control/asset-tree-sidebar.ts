import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { SimulationManager } from "@app/simulation/simulation-manager";
import antenna2Png from '../../assets/icons/antenna2.png';
import satellitePng from '../../assets/icons/satellite.png';
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
        <button class="sidebar-collapse-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="icon icon-tabler icons-tabler-filled icon-tabler-layout-sidebar-left-collapse"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 3a3 3 0 0 1 2.995 2.824l.005 .176v12a3 3 0 0 1 -2.824 2.995l-.176 .005h-12a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-12a3 3 0 0 1 2.824 -2.995l.176 -.005h12zm0 2h-9v14h9a1 1 0 0 0 .993 -.883l.007 -.117v-12a1 1 0 0 0 -.883 -.993l-.117 -.007zm-2.293 4.293a1 1 0 0 1 .083 1.32l-.083 .094l-1.292 1.293l1.292 1.293a1 1 0 0 1 .083 1.32l-.083 .094a1 1 0 0 1 -1.32 .083l-.094 -.083l-2 -2a1 1 0 0 1 -.083 -1.32l.083 -.094l2 -2a1 1 0 0 1 1.414 0z" />
          </svg>
        </button>
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
    const sidebar = qs('#asset-tree-sidebar-container');
    const collapseBtn = qs('.sidebar-collapse-btn', sidebar);
    collapseBtn?.addEventListener('click', () => {
      sidebar?.classList.toggle('collapsed');
      // If collapsed, change svg icon to new svg
      const isCollapsed = sidebar?.classList.contains('collapsed');
      collapseBtn.children[0].innerHTML = isCollapsed
        ? `<path d="M18 3a3 3 0 0 1 2.995 2.824l.005 .176v12a3 3 0 0 1 -2.824 2.995l-.176 .005h-12a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-12a3 3 0 0 1 2.824 -2.995l.176 -.005h12zm-3 2h-9a1 1 0 0 0 -.993 .883l-.007 .117v12a1 1 0 0 0 .883 .993l.117 .007h9v-14zm-5.387 4.21l.094 .083l2 2a1 1 0 0 1 .083 1.32l-.083 .094l-2 2a1 1 0 0 1 -1.497 -1.32l.083 -.094l1.292 -1.293l-1.292 -1.293a1 1 0 0 1 -.083 -1.32l.083 -.094a1 1 0 0 1 1.32 -.083z" />`
        : `<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 3a3 3 0 0 1 2.995 2.824l.005 .176v12a3 3 0 0 1 -2.824 2.995l-.176 .005h-12a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-12a3 3 0 0 1 2.824 -2.995l.176 -.005h12zm0 2h-9v14h9a1 1 0 0 0 .993 -.883l.007 -.117v-12a1 1 0 0 0 -.883 -.993l-.117 -.007zm-2.293 4.293a1 1 0 0 1 .083 1.32l-.083 .094l-1.292 1.293l1.292 1.293a1 1 0 0 1 .083 1.32l-.083 .094a1 1 0 0 1 -1.32 .083l-.094 -.083l-2 -2a1 1 0 0 1 -.083 -1.32l.083 -.094l2 -2a1 1 0 0 1 1.414 0z" />`;

    });
  }

  /**
   * Render the asset tree with ground stations and satellites
   */
  private renderAssetTree_(): void {
    const treeContainer = qs('#asset-tree', this.dom_);

    const treeHtml = html`
      <div class="list-group list-group-flush mb-3">
        <div class="list-group-header sticky-top">
          <span class="list-group-header-text">Ground Stations</span>
        </div>
        ${this.groundStations_.map(gs => this.renderGroundStationNode_(gs)).join('')}
      </div>

      <div class="list-group list-group-flush">
        <div class="list-group-header sticky-top">
          <span class="list-group-header-text">Satellites</span>
        </div>
        <div class="list-group-item placeholder-item">
          <span class="item-icon">
            <img src="${satellitePng}" alt="Satellite" style="filter: invert(1);" />
          </span>
          <span class="flex-fill">No satellites in scenario</span>
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
      <a class="list-group-item list-group-item-action d-flex align-items-center ${isSelected ? 'active' : ''}"
         data-asset-type="ground-station"
         data-asset-id="${gs.state.id}">
         <span class="item-icon">
          <img src="${antenna2Png}" alt="Antenna" style="filter: invert(1);" />
         </span>
         <span class="item-status ${gs.state.isOperational ? 'operational' : 'offline'}"></span>
         <span class="flex-fill">${gs.state.name}</span>
      </a>
    `;
  }

  /**
   * Add event listeners to tree items
   */
  private addTreeEventListeners_(): void {
    const assetItems = this.dom_.querySelectorAll('.list-group-item-action:not(.placeholder-item)');

    assetItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const type = item.getAttribute('data-asset-type') as 'ground-station' | 'satellite';
        const id = item.getAttribute('data-asset-id');

        if (!id) return;

        // Update selection state
        this.selectedAssetId_ = id;

        // Update UI
        assetItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

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
