import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Satellite } from "@app/equipment/satellite/satellite";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { DialogHistoryBox } from "@app/modal/dialog-history-box";
import { DraggableHtmlBox } from "@app/modal/draggable-html-box";
import { HintManager } from "@app/modal/hint-manager";
import { HintModal } from "@app/modal/hint-modal";
import { PendingQuizIndicator } from "@app/modal/pending-quiz-indicator";
import { QuizManager } from "@app/modal/quiz-manager";
import { ObjectivesManager } from "@app/objectives";
import { OpsLogModal } from "@app/ops-log/ops-log-modal";
import { ScenarioManager } from "@app/scenario-manager";
import { SimulationManager } from "@app/simulation/simulation-manager";
import activityPng from '../../assets/icons/activity.png';
import antennaPng from '../../assets/icons/antenna.png';
import checklistPng from "../../assets/icons/checklist.png";
import dashboardPng from '../../assets/icons/dashboard.png';
import historyPng from '../../assets/icons/history.png';
import layoutSidebarLeftCollapsePng from '../../assets/icons/layout-sidebar-left-collapse.png';
import layoutSidebarLeftExpandPng from '../../assets/icons/layout-sidebar-left-expand.png';
import satelliteOffPng from '../../assets/icons/satellite-off.png';
import satellitePng from '../../assets/icons/satellite.png';
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
  private satellites_: Satellite[] = [];
  private checklistRefreshIntervalId_: number | null = null;
  private lastChecklistHtml_: string | null = null;
  private missionBriefUrl_: string | null = null;
  private quizDelegationSetup_: boolean = false;

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
    this.satellites_ = SimulationManager.getInstance().satellites;
    this.missionBriefUrl_ = ScenarioManager.getInstance().settings.missionBriefUrl ?? null;
    this.renderAssetTree_();
    this.initMissionSection_();
    this.initSidebarLock_();
  }

  /**
   * Initialize sidebar lock state if scenario has a freezing objective
   */
  private initSidebarLock_(): void {
    // Scenarios with mission briefs start locked - the user must acknowledge
    // the mission brief before other sidebar items become accessible.
    // The SCENARIO_UNLOCKED event (emitted when freezing objective completes)
    // will unlock the sidebar.
    if (this.missionBriefUrl_) {
      // Check if we're resuming a scenario where mission brief was already acknowledged
      // Use static methods that safely handle uninitialized state
      const objectivesLoaded = ObjectivesManager.hasLoadedObjectives();
      const isLocked = ObjectivesManager.isScenarioLocked();

      // Only stay unlocked if objectives have loaded AND confirm we're unlocked
      // (i.e., no incomplete freezing objectives)
      const alreadyUnlocked = objectivesLoaded && !isLocked;

      if (!alreadyUnlocked) {
        this.dom_.classList.add('sidebar-locked');
      }

      // If objectives aren't loaded yet, listen for DOM_READY which fires after
      // ObjectivesManager initializes AND checkpoint states are restored.
      if (!objectivesLoaded) {
        EventBus.getInstance().on(Events.DOM_READY, () => {
          this.checkAndUpdateLockState_();
        });
      }
    }
  }

  /**
   * Re-check lock state after objectives are loaded
   */
  private checkAndUpdateLockState_(): void {
    if (!ObjectivesManager.isScenarioLocked()) {
      this.unlockSidebar_();
    }
  }

  /**
   * Unlock the sidebar when the scenario is unlocked
   */
  private unlockSidebar_(): void {
    this.dom_.classList.remove('sidebar-locked');
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

    // Listen for asset selection from other components (e.g., Mission Overview cards)
    EventBus.getInstance().on(Events.ASSET_SELECTED, (data) => {
      this.updateSelectionUI_(data.id);
    });

    // Listen for scenario unlock to enable sidebar items
    EventBus.getInstance().on(Events.SCENARIO_UNLOCKED, () => {
      this.unlockSidebar_();
    });
  }

  /**
   * Update the sidebar selection UI when an asset is selected externally
   */
  private updateSelectionUI_(assetId: string): void {
    this.selectedAssetId_ = assetId;

    // Update UI - remove active from all items and add to the selected one
    const assetItems = this.dom_.querySelectorAll('.list-group-item-action:not(.placeholder-item):not(.mission-brief-icon):not(.checklist-icon):not(.dialog-icon)');
    assetItems.forEach(item => {
      const itemId = item.getAttribute('data-asset-id');
      if (itemId === assetId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * Initialize the mission section if missionBriefUrl is set
   */
  private initMissionSection_(): void {
    if (!this.missionBriefUrl_) {
      console.warn('No mission brief URL set; hiding mission section.');
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
    this.addOpsLogListener_();
  }

  private addMissionBriefListener_(): void {
    const btn = qs('.mission-brief-icon', this.dom_);
    btn?.addEventListener('click', () => {
      SimulationManager.getInstance().missionBriefBox ??= new DraggableHtmlBox('Mission Brief', 'mission-brief', this.missionBriefUrl_, 'app-shell-page');
      SimulationManager.getInstance().missionBriefBox.open();
    });
  }

  private addChecklistListener_(): void {
    // Initialize the pending quiz indicator
    PendingQuizIndicator.getInstance();

    const btn = qs('.checklist-icon', this.dom_);
    btn?.addEventListener('click', () => {
      SimulationManager.getInstance().checklistBox ??= new DraggableHtmlBox('Checklist', 'checklist', '', 'app-shell-page');

      // Set up event delegation for quiz buttons (only once)
      this.setupQuizButtonDelegation_();

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

  /**
   * Set up event delegation for quiz and hint buttons in the checklist
   * Since checklist content regenerates every second, we delegate on the container
   */
  private setupQuizButtonDelegation_(): void {
    if (this.quizDelegationSetup_) return;

    const checklistBox = SimulationManager.getInstance().checklistBox;
    if (!checklistBox) return;

    checklistBox.popupDom.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;

      // Handle quiz button clicks
      const quizBtn = target.closest<HTMLButtonElement>('.condition-quiz-btn');
      if (quizBtn) {
        const objectiveId = quizBtn.dataset.objectiveId;
        const conditionIndex = parseInt(quizBtn.dataset.conditionIndex ?? '0', 10);

        if (objectiveId) {
          QuizManager.getInstance().showQuiz(objectiveId, conditionIndex);
        }
        return;
      }

      // Handle hint button clicks
      const hintBtn = target.closest<HTMLButtonElement>('.condition-hint-btn');
      if (hintBtn) {
        const objectiveId = hintBtn.dataset.objectiveId;
        const conditionIndex = parseInt(hintBtn.dataset.conditionIndex ?? '0', 10);
        const isHintAlreadyUsed = hintBtn.dataset.hintUsed === 'true';

        if (objectiveId) {
          const hintManager = HintManager.getInstance();
          const hint = hintManager.getHint(objectiveId, conditionIndex);

          if (hint) {
            if (isHintAlreadyUsed) {
              // Hint already revealed - show directly without confirmation
              HintModal.getInstance().showHintDirectly(objectiveId, conditionIndex, hint);
            } else {
              // First time - show confirmation with penalty warning
              const penaltyPoints = hintManager.getPenaltyPoints(objectiveId);
              const objectiveTitle = ObjectivesManager.getInstance()
                .getObjectiveStates()
                .find(s => s.objective.id === objectiveId)?.objective.title ?? 'Unknown';

              HintModal.getInstance().showConfirmation(
                objectiveId,
                conditionIndex,
                hint,
                penaltyPoints,
                objectiveTitle
              );
            }
          }
        }
      }
    });

    this.quizDelegationSetup_ = true;
  }

  private addDialogHistoryListener_(): void {
    const btn = qs('.dialog-icon', this.dom_);
    btn?.addEventListener('click', () => {
      SimulationManager.getInstance().dialogHistoryBox ??= new DialogHistoryBox('app-shell-page');
      SimulationManager.getInstance().dialogHistoryBox.open();
    });
  }

  private addOpsLogListener_(): void {
    const btn = qs('.ops-log-icon', this.dom_);
    btn?.addEventListener('click', () => {
      OpsLogModal.getInstance().open();
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

    const isMissionOverviewSelected = this.selectedAssetId_ === null;

    const treeHtml = html`
      <div class="list-group list-group-flush mb-3">
        <a class="list-group-item list-group-item-action d-flex align-items-center mission-overview-item ${isMissionOverviewSelected ? 'active' : ''}"
           data-asset-type="mission-overview"
           data-tooltip="Mission Overview">
          <span class="item-icon">
            <img src="${dashboardPng}" alt="Mission Overview"/>
          </span>
          <span class="flex-fill">Mission Overview</span>
        </a>
      </div>

      <div id="mission-icons-section" class="mission-icons-section list-group list-group-flush" style="display: none;">
        <div class="list-group-header">
          <span class="list-group-header-text">Mission</span>
        </div>
        <a class="list-group-item list-group-item-action d-flex align-items-center mission-brief-icon" data-tooltip="Mission Brief">
          <span class="item-icon">
            <img src="${targetArrowPng}" alt="Mission Brief"/>
          </span>
          <span class="flex-fill">Mission Brief</span>
        </a>
        <a class="list-group-item list-group-item-action d-flex align-items-center checklist-icon" data-tooltip="Checklist">
          <span class="item-icon">
            <img src="${checklistPng}" alt="Checklist"/>
          </span>
          <span class="flex-fill">Checklist</span>
        </a>
        <a class="list-group-item list-group-item-action d-flex align-items-center dialog-icon" data-tooltip="Dialog History">
          <span class="item-icon">
            <img src="${historyPng}" alt="Dialog History"/>
          </span>
          <span class="flex-fill">Dialog History</span>
        </a>
        <a class="list-group-item list-group-item-action d-flex align-items-center ops-log-icon" data-tooltip="Operations Log">
          <span class="item-icon">
            <img src="${activityPng}" alt="Operations Log"/>
          </span>
          <span class="flex-fill">Ops Log</span>
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
        ${this.satellites_.length > 0
        ? this.satellites_.map(sat => this.renderSatelliteNode_(sat)).join('')
        : `<div class="list-group-item placeholder-item">
              <span class="item-icon">
                <img src="${satelliteOffPng}" alt="Satellite"/>
              </span>
              <span class="flex-fill">No satellites in scenario</span>
            </div>`
      }
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
         data-asset-id="${gs.state.id}"
         data-tooltip="${gs.state.name}">
         <span class="item-icon">
          <img src="${antennaPng}" alt="Antenna"/>
         </span>
         <span class="flex-fill">${gs.state.name}</span>
         <span class="item-status ${gs.state.isOperational ? 'operational' : 'offline'}"></span>
      </a>
    `;
  }

  /**
   * Render a satellite node
   */
  private renderSatelliteNode_(sat: Satellite): string {
    const satId = `sat-${sat.noradId}`;
    const isSelected = this.selectedAssetId_ === satId;
    const isHealthy = sat.health >= 0.9;
    const satName = `${sat.name}`;

    return html`
      <a class="list-group-item list-group-item-action d-flex align-items-center ${isSelected ? 'active' : ''}"
         data-asset-type="satellite"
         data-asset-id="${satId}"
         data-tooltip="${satName}">
         <span class="item-icon">
          <img src="${satellitePng}" alt="Satellite"/>
         </span>
         <span class="flex-fill">${satName}</span>
         <span class="item-status ${isHealthy ? 'operational' : 'degraded'}"></span>
      </a>
    `;
  }

  /**
   * Add event listeners to tree items
   */
  private addTreeEventListeners_(): void {
    const assetItems = this.dom_.querySelectorAll('.list-group-item-action:not(.placeholder-item):not(.mission-brief-icon):not(.checklist-icon):not(.dialog-icon)');

    assetItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const type = item.getAttribute('data-asset-type') as 'ground-station' | 'satellite' | 'mission-overview';

        // Handle Mission Overview selection
        if (type === 'mission-overview') {
          this.selectedAssetId_ = null;

          // Update UI
          assetItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');

          // Emit mission overview selected event
          EventBus.getInstance().emit(Events.MISSION_OVERVIEW_SELECTED);
          return;
        }

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
   * Refresh the asset tree (called when assets change)
   */
  public refresh(): void {
    this.groundStations_ = SimulationManager.getInstance().groundStations;
    this.satellites_ = SimulationManager.getInstance().satellites;
    this.renderAssetTree_();
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.stopChecklistRefreshTimer_();
  }
}
