import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { DialogHistoryBox } from "@app/modal/dialog-history-box";
import { DraggableHtmlBox } from "@app/modal/draggable-html-box";
import { ObjectivesManager } from "@app/objectives";
import { ScenarioManager } from "@app/scenario-manager";
import { SimulationManager } from "@app/simulation/simulation-manager";
import antennaPng from '../../assets/icons/antenna.png';
import checklistPng from "../../assets/icons/checklist.png";
import historyPng from '../../assets/icons/history.png';
import layoutSidebarLeftCollapsePng from '../../assets/icons/layout-sidebar-left-collapse.png';
import layoutSidebarLeftExpandPng from '../../assets/icons/layout-sidebar-left-expand.png';
import satelliteOffPng from '../../assets/icons/satellite-off.png';
import targetArrowPng from '../../assets/icons/target-arrow.png';
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
  private checklistRefreshIntervalId_: number | null = null;
  private lastChecklistHtml_: string | null = null;
  private missionBriefUrl_: string | null = null;

  protected html_ = html`
    <div class="asset-tree-sidebar">
      <div class="sidebar-header">
        <h3>Assets</h3>
        <button class="sidebar-collapse-btn">
          <img src="${layoutSidebarLeftCollapsePng}" alt="Collapse Sidebar" />
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
    this.missionBriefUrl_ = ScenarioManager.getInstance().settings.missionBriefUrl ?? null;
    this.renderAssetTree_();
    this.initMissionSection_();
  }

  protected addEventListeners_(): void {
    const sidebar = qs('#asset-tree-sidebar-container');
    const collapseBtn = qs('.sidebar-collapse-btn', sidebar);
    collapseBtn?.addEventListener('click', () => {
      sidebar?.classList.toggle('collapsed');
      // If collapsed, change svg icon to new svg
      const isCollapsed = sidebar?.classList.contains('collapsed');
      collapseBtn.innerHTML = isCollapsed
        ? `<img src="${layoutSidebarLeftExpandPng}" alt="Expand Sidebar" />`
        : `<img src="${layoutSidebarLeftCollapsePng}" alt="Collapse Sidebar" />`;
    });

    EventBus.getInstance().on(Events.ROUTE_CHANGED, () => {
      this.stopChecklistRefreshTimer_();
    });
  }

  /**
   * Initialize the mission section if missionBriefUrl is set
   */
  private initMissionSection_(): void {
    if (!this.missionBriefUrl_) {
      return;
    }

    // Show the mission section
    const missionSection = qs('#mission-icons-section', this.dom_);
    if (missionSection) {
      missionSection.style.display = 'block';
    }

    // Add listeners
    this.addMissionBriefListener_();
    this.addChecklistListener_();
    this.addDialogHistoryListener_();
  }

  private addMissionBriefListener_(): void {
    const btn = qs('.mission-brief-icon', this.dom_);
    btn?.addEventListener('click', () => {
      SimulationManager.getInstance().missionBriefBox ??= new DraggableHtmlBox('Mission Brief', 'mission-brief', this.missionBriefUrl_, 'app-shell-page');
      SimulationManager.getInstance().missionBriefBox.open();
    });
  }

  private addChecklistListener_(): void {
    const btn = qs('.checklist-icon', this.dom_);
    btn?.addEventListener('click', () => {
      SimulationManager.getInstance().checklistBox ??= new DraggableHtmlBox('Checklist', 'checklist', '', 'app-shell-page');
      const objectivesManager = ObjectivesManager.getInstance();
      objectivesManager.syncCollapsedStatesFromDOM();
      this.lastChecklistHtml_ = objectivesManager.generateHtmlChecklist();
      SimulationManager.getInstance().checklistBox.updateContent(this.lastChecklistHtml_);
      SimulationManager.getInstance().checklistBox.open();
      this.startChecklistRefreshTimer_(SimulationManager.getInstance().checklistBox);
    });

    EventBus.getInstance().on(Events.OBJECTIVE_ACTIVATED, () => {
      if (!SimulationManager.getInstance().checklistBox) {
        return;
      }
      const objectivesManager = ObjectivesManager.getInstance();
      this.lastChecklistHtml_ = objectivesManager.generateHtmlChecklist();
      SimulationManager.getInstance().checklistBox.updateContent(this.lastChecklistHtml_);
    });
  }

  private addDialogHistoryListener_(): void {
    const btn = qs('.dialog-icon', this.dom_);
    btn?.addEventListener('click', () => {
      SimulationManager.getInstance().dialogHistoryBox ??= new DialogHistoryBox('app-shell-page');
      SimulationManager.getInstance().dialogHistoryBox.open();
    });
  }

  private startChecklistRefreshTimer_(draggableBox: DraggableHtmlBox): void {
    this.stopChecklistRefreshTimer_();

    const refreshChecklist = () => {
      if (!draggableBox.isOpen) {
        this.stopChecklistRefreshTimer_();
        return;
      }

      const objectivesManager = ObjectivesManager.getInstance();
      objectivesManager.syncCollapsedStatesFromDOM();
      const nextChecklistHtml = objectivesManager.generateHtmlChecklist();
      if (nextChecklistHtml !== this.lastChecklistHtml_) {
        this.lastChecklistHtml_ = nextChecklistHtml;
        draggableBox.updateContent(nextChecklistHtml);
      }
    };

    draggableBox.onClose = () => this.stopChecklistRefreshTimer_();
    this.checklistRefreshIntervalId_ = window.setInterval(refreshChecklist, 1000);
  }

  private stopChecklistRefreshTimer_(): void {
    if (this.checklistRefreshIntervalId_ !== null) {
      window.clearInterval(this.checklistRefreshIntervalId_);
      this.checklistRefreshIntervalId_ = null;
    }
    this.lastChecklistHtml_ = null;
  }

  /**
   * Render the asset tree with ground stations and satellites
   */
  private renderAssetTree_(): void {
    const treeContainer = qs('#asset-tree', this.dom_);

    const treeHtml = html`
      <div id="mission-icons-section" class="mission-icons-section list-group list-group-flush" style="display: none;">
        <div class="list-group-header">
          <span class="list-group-header-text">Mission</span>
        </div>
        <a class="list-group-item list-group-item-action d-flex align-items-center mission-brief-icon" title="Mission Brief">
          <span class="item-icon">
            <img src="${targetArrowPng}" alt="Mission Brief"/>
          </span>
          <span class="flex-fill">Mission Brief</span>
        </a>
        <a class="list-group-item list-group-item-action d-flex align-items-center checklist-icon" title="Mission Checklist">
          <span class="item-icon">
            <img src="${checklistPng}" alt="Checklist"/>
          </span>
          <span class="flex-fill">Checklist</span>
        </a>
        <a class="list-group-item list-group-item-action d-flex align-items-center dialog-icon" title="Dialog History">
          <span class="item-icon">
            <img src="${historyPng}" alt="Dialog History"/>
          </span>
          <span class="flex-fill">Dialog History</span>
        </a>
      </div>

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
            <img src="${satelliteOffPng}" alt="Satellite"/>
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
          <img src="${antennaPng}" alt="Antenna"/>
         </span>
         <span class="flex-fill">${gs.state.name}</span>
         <span class="item-status ${gs.state.isOperational ? 'operational' : 'offline'}"></span>
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
    this.stopChecklistRefreshTimer_();
  }
}
