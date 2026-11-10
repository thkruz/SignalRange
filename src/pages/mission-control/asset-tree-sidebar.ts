import { GroundStation } from '@app/assets/ground-station/ground-station';
import activityPng from '@app/assets/icons/activity.png';
import antennaPng from '@app/assets/icons/antenna.png';
import checklistPng from '@app/assets/icons/checklist.png';
import dashboardPng from '@app/assets/icons/dashboard.png';
import historyPng from '@app/assets/icons/history.png';
import layoutSidebarLeftCollapsePng from '@app/assets/icons/layout-sidebar-left-collapse.png';
import layoutSidebarLeftExpandPng from '@app/assets/icons/layout-sidebar-left-expand.png';
import satellitePng from '@app/assets/icons/satellite.png';
import satelliteOffPng from '@app/assets/icons/satellite-off.png';
import targetArrowPng from '@app/assets/icons/target-arrow.png';
import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { DialogHistoryBox } from '@app/modal/dialog-history-box';
import { DraggableHtmlBox } from '@app/modal/draggable-html-box';
import { HintManager } from '@app/modal/hint-manager';
import { HintModal } from '@app/modal/hint-modal';
import { PendingQuizIndicator } from '@app/modal/pending-quiz-indicator';
import { QuizManager } from '@app/modal/quiz-manager';
import { SaveProgressToast } from '@app/modal/save-progress-toast';
import { ObjectivesManager } from '@app/objectives';
import { CountdownHold } from '@app/objectives/countdown-hold';
import { openReportForm } from '@app/objectives/report-form-dialog';
import { OpsLogModal } from '@app/ops-log/ops-log-modal';
import { ScenarioManager } from '@app/scenario-manager';
import { CampaignRecordPanel } from '@app/scenarios/campaign-record-panel';
import { WorkingDocumentManager } from '@app/scenarios/working-document-manager';
import { SelectionService } from '@app/services/selection-service';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { assetSelectionState } from './asset-selection-state';
import { ConstellationTreeView } from './constellation-tree-view';
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

  /**
   * Tooltip and toast text for a locked sidebar item (phase 31 D7). Stations,
   * satellites and Mission Overview wait for the brief; the record panels
   * (Working Doc, Campaign Record, Dialog History, Ops Log) never lock.
   */
  static readonly LOCKED_TEXT = 'Locked until you acknowledge the Mission Brief';

  /**
   * The asset last selected anywhere, and the ground station last selected.
   * Static so a surface built after the selection (a lazily created tab, the
   * timeline deck) can read the station the operator already picked instead of
   * learning it only from the next ASSET_SELECTED (D7).
   */
  static get selectedAssetId(): string | null {
    return assetSelectionState.assetId;
  }

  static set selectedAssetId(id: string | null) {
    assetSelectionState.assetId = id;
  }

  static get selectedGroundStationId(): string | null {
    return assetSelectionState.groundStationId;
  }

  static set selectedGroundStationId(id: string | null) {
    assetSelectionState.groundStationId = id;
  }

  private selectedAssetId_: string | null = null;
  private groundStations_: GroundStation[] = [];
  private satellites_: Satellite[] = [];
  private constellationView_: ConstellationTreeView | null = null;
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
    this.satellites_ = this.authoredSatellites_();
    this.missionBriefUrl_ = ScenarioManager.getInstance().settings.missionBriefUrl ?? null;
    this.renderAssetTree_();
    this.initMissionSection_();
    this.initSidebarLock_();
    this.openChecklistOnReady_();
  }

  /**
   * The field console has no other way to see the first objective: open the checklist docked beside the Site
   * stage once the page is ready (c6-s13). Narrow windows (under 1600 px) keep click-to-open: the docked strip
   * would cover part of the service diagram there. Other pages keep the click-to-open behaviour.
   */
  private openChecklistOnReady_(): void {
    if (!qs('.checklist-icon', this.dom_)) return;
    EventBus.getInstance().on(Events.DOM_READY, () => {
      if (document.getElementById('tent-control') && window.innerWidth >= 1600 && !SimulationManager.getInstance().checklistBox) {
        this.openChecklist_();
      }
    });
  }

  /**
   * Authored satellites only. At constellation scale `sim.satellites` also holds
   * hydrated members, which the virtualised constellation tree lists instead.
   */
  private authoredSatellites_(): Satellite[] {
    const sim = SimulationManager.getInstance();
    const registry = sim.registry;

    return registry && registry.memberCount > 0 ? sim.satellites.slice(0, registry.authoredCount) : sim.satellites;
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
        this.syncLockTooltips_();
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
    this.syncLockTooltips_();
    this.constellationView_?.refresh();
  }

  /** True while the brief objective still holds the stations, satellites and overview */
  private isLocked_(): boolean {
    return this.dom_.classList.contains('sidebar-locked');
  }

  /**
   * Swap each lockable item's tooltip between its name and the lock text. The
   * custom data-tooltip only shows on a collapsed sidebar, so a locked item
   * also carries a native title for the expanded one.
   */
  private syncLockTooltips_(): void {
    const isLocked = this.isLocked_();
    this.dom_.querySelectorAll<HTMLElement>('.sidebar-lockable').forEach((item) => {
      const name = item.dataset.itemName ?? '';
      if (isLocked) {
        item.dataset.tooltip = AssetTreeSidebar.LOCKED_TEXT;
        item.title = AssetTreeSidebar.LOCKED_TEXT;
        item.setAttribute('aria-disabled', 'true');
      } else {
        item.dataset.tooltip = name;
        item.removeAttribute('title');
        item.removeAttribute('aria-disabled');
      }
    });
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
      AssetTreeSidebar.selectedAssetId = data.id;
      if (data.type === 'ground-station') {
        AssetTreeSidebar.selectedGroundStationId = data.id;
      }
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
    assetItems.forEach((item) => {
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
      // No brief, but authored objectives (Campaign 6, constellation sandboxes): the player still needs the checklist,
      // dialog history, ops log and working document. Only the Mission Brief entry is hidden.
      if (ScenarioManager.getInstance().settings.constellations?.length || ScenarioManager.getInstance().data?.objectives?.length) {
        const section = qs('#mission-icons-section', this.dom_);
        if (section) {
          section.style.display = 'block';
          qs('.mission-brief-icon', this.dom_)?.setAttribute('hidden', '');
        }
        this.addChecklistListener_();
        this.addDialogHistoryListener_();
        this.addOpsLogListener_();
        this.addWorkingDocListener_();
        return;
      }
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
    this.addWorkingDocListener_();
  }

  private addWorkingDocListener_(): void {
    const btn = qs('.working-doc-icon', this.dom_);
    if (!btn) return;

    // Only surface the icon for scenarios that declare a working document
    if (WorkingDocumentManager.isEnabled()) {
      (btn as HTMLElement).hidden = false;
    }

    btn.addEventListener('click', () => {
      WorkingDocumentManager.getInstance().open();
    });

    // The campaign record: earlier scenarios' documents, read-only. Shown
    // when the scenario keeps a working document and there is history to read.
    const recordBtn = qs('.campaign-record-icon', this.dom_);
    if (recordBtn && WorkingDocumentManager.isEnabled() && CampaignRecordPanel.hasContent()) {
      (recordBtn as HTMLElement).hidden = false;
      recordBtn.addEventListener('click', () => CampaignRecordPanel.getInstance().open());
    }
  }

  private addMissionBriefListener_(): void {
    const btn = qs('.mission-brief-icon', this.dom_);
    btn?.addEventListener('click', () => {
      const sim = SimulationManager.getInstance();
      if (!sim.missionBriefBox) {
        sim.missionBriefBox = new DraggableHtmlBox('Mission Brief', 'mission-brief', this.missionBriefUrl_, 'app-shell-page');
        // Objective countdowns stop while the brief is open (Phase 26 D2)
        sim.missionBriefBox.onClose = () => CountdownHold.set('brief', false);
      }
      sim.missionBriefBox.open();
      CountdownHold.set('brief', true);
    });
  }

  private addChecklistListener_(): void {
    // Initialize the pending quiz indicator
    PendingQuizIndicator.getInstance();

    const btn = qs('.checklist-icon', this.dom_);
    btn?.addEventListener('click', () => this.openChecklist_());

    EventBus.getInstance().on(Events.OBJECTIVE_ACTIVATED, () => {
      if (!SimulationManager.getInstance().checklistBox) {
        return;
      }
      const objectivesManager = ObjectivesManager.getInstance();
      this.lastChecklistHtml_ = objectivesManager.generateHtmlChecklist();
      SimulationManager.getInstance().checklistBox.updateContent(this.lastChecklistHtml_);
      SimulationManager.getInstance().checklistBox.redockForObjectiveChange();
    });
  }

  private openChecklist_(): void {
    SimulationManager.getInstance().checklistBox ??= new DraggableHtmlBox('Checklist', 'checklist', '', 'app-shell-page');

    // Set up event delegation for quiz buttons (only once)
    this.setupQuizButtonDelegation_();

    const objectivesManager = ObjectivesManager.getInstance();
    objectivesManager.syncCollapsedStatesFromDOM();
    this.lastChecklistHtml_ = objectivesManager.generateHtmlChecklist();
    SimulationManager.getInstance().checklistBox.updateContent(this.lastChecklistHtml_);
    SimulationManager.getInstance().checklistBox.open();
    this.startChecklistRefreshTimer_(SimulationManager.getInstance().checklistBox);
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

      // Handle report form button clicks
      const formBtn = target.closest<HTMLButtonElement>('.condition-form-btn');
      if (formBtn?.dataset.reportForm) {
        openReportForm(formBtn.dataset.reportForm);
        return;
      }

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
              const objectiveTitle =
                ObjectivesManager.getInstance()
                  .getObjectiveStates()
                  .find((s) => s.objective.id === objectiveId)?.objective.title ?? 'Unknown';

              HintModal.getInstance().showConfirmation(objectiveId, conditionIndex, hint, penaltyPoints, objectiveTitle);
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

    // The asset-group-* classes carry no styling in the base theme. They exist
    // so a chrome variant can reorder the sections with `order` instead of
    // reordering them here - the DOM sequence stays put, which is what keeps
    // every existing selector and E2E locator valid.
    const treeHtml = html`
      <div class="list-group list-group-flush mb-3 asset-group-overview">
        <a class="list-group-item list-group-item-action d-flex align-items-center mission-overview-item sidebar-lockable ${isMissionOverviewSelected ? 'active' : ''}"
           data-asset-type="mission-overview"
           data-item-name="Mission Overview"
           data-tooltip="Mission Overview">
          <span class="item-icon">
            <img src="${dashboardPng}" alt="Mission Overview"/>
          </span>
          <span class="flex-fill">Mission Overview</span>
        </a>
      </div>

      <div id="mission-icons-section" class="mission-icons-section list-group list-group-flush asset-group-mission" style="display: none;">
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
        <a class="list-group-item list-group-item-action d-flex align-items-center working-doc-icon" data-tooltip="Working Document" hidden>
          <span class="item-icon">
            <img src="${checklistPng}" alt="Working Document"/>
          </span>
          <span class="flex-fill">Working Doc</span>
        </a>
        <a class="list-group-item list-group-item-action d-flex align-items-center campaign-record-icon" data-tooltip="Campaign Record" hidden>
          <span class="item-icon">
            <img src="${checklistPng}" alt="Campaign Record"/>
          </span>
          <span class="flex-fill">Campaign Record</span>
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

      <div class="list-group list-group-flush mb-3 asset-group-stations">
        <div class="list-group-header sticky-top">
          <span class="list-group-header-text">Ground Stations</span>
        </div>
        ${this.groundStations_.map((gs) => this.renderGroundStationNode_(gs)).join('')}
      </div>

      <div class="list-group list-group-flush asset-group-satellites">
        <div class="list-group-header sticky-top">
          <span class="list-group-header-text">Satellites</span>
        </div>
        ${
          this.satellites_.length > 0
            ? this.satellites_.map((sat) => this.renderSatelliteNode_(sat)).join('')
            : this.hasMembers_()
              ? ''
              : `<div class="list-group-item placeholder-item">
              <span class="item-icon">
                <img src="${satelliteOffPng}" alt="Satellite"/>
              </span>
              <span class="flex-fill">No satellites in scenario</span>
            </div>`
        }
      </div>
    `;

    this.constellationView_?.dispose();
    this.constellationView_ = null;
    treeContainer.innerHTML = treeHtml;
    this.mountConstellationTree_(treeContainer);
    this.addTreeEventListeners_();
    this.syncLockTooltips_();
  }

  private hasMembers_(): boolean {
    return (SimulationManager.getInstance().registry?.memberCount ?? 0) > 0;
  }

  /** Constellation scenarios get the virtualised member tree after the authored satellites. */
  private mountConstellationTree_(treeContainer: HTMLElement): void {
    const registry = SimulationManager.getInstance().registry;

    if (!registry || registry.memberCount === 0) {
      return;
    }
    this.constellationView_ = new ConstellationTreeView(registry, {
      isLocked: () => this.isLocked_(),
      onLockedClick: () => SaveProgressToast.getInstance().showError(AssetTreeSidebar.LOCKED_TEXT, 3000),
    });
    treeContainer.appendChild(this.constellationView_.element);
  }

  /** The member tree, for harnesses and tests (null for small scenarios). */
  get constellationView(): ConstellationTreeView | null {
    return this.constellationView_;
  }

  /**
   * Render a ground station node
   */
  private renderGroundStationNode_(gs: GroundStation): string {
    const isSelected = this.selectedAssetId_ === gs.state.id;

    return html`
      <a class="list-group-item list-group-item-action d-flex align-items-center sidebar-lockable ${isSelected ? 'active' : ''}"
         data-asset-type="ground-station"
         data-asset-id="${gs.state.id}"
         data-item-name="${gs.state.name}"
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
      <a class="list-group-item list-group-item-action d-flex align-items-center sidebar-lockable ${isSelected ? 'active' : ''}"
         data-asset-type="satellite"
         data-asset-id="${satId}"
         data-item-name="${satName}"
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
    const assetItems = this.dom_.querySelectorAll('.list-group-item-action:not(.placeholder-item):not(.mission-brief-icon):not(.checklist-icon):not(.dialog-icon):not(.ct-row)');

    assetItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();

        // A locked item keeps its pointer events so the hover explains the
        // lock; the click says it again instead of opening (phase 31 D7)
        if (this.isLocked_() && item.classList.contains('sidebar-lockable')) {
          SaveProgressToast.getInstance().showError(AssetTreeSidebar.LOCKED_TEXT, 3000);
          return;
        }

        const type = item.getAttribute('data-asset-type') as 'ground-station' | 'satellite' | 'mission-overview';

        // Handle Mission Overview selection
        if (type === 'mission-overview') {
          this.selectedAssetId_ = null;

          // Update UI
          assetItems.forEach((i) => i.classList.remove('active'));
          item.classList.add('active');

          // Emit mission overview selected event
          SelectionService.getInstance().selectOverview();
          return;
        }

        const id = item.getAttribute('data-asset-id');
        if (!id) return;

        // Update selection state
        this.selectedAssetId_ = id;

        // Update UI
        assetItems.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');

        // Emit asset selected event
        SelectionService.getInstance().selectAsset(type, id);
      });
    });
  }

  /**
   * Refresh the asset tree (called when assets change)
   */
  public refresh(): void {
    this.groundStations_ = SimulationManager.getInstance().groundStations;
    this.satellites_ = this.authoredSatellites_();
    this.renderAssetTree_();
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.constellationView_?.dispose();
    this.constellationView_ = null;
    AssetTreeSidebar.selectedAssetId = null;
    AssetTreeSidebar.selectedGroundStationId = null;
    this.stopChecklistRefreshTimer_();
  }
}
