import { App } from "@app/app";
import { GroundStation } from "@app/assets/ground-station/ground-station";
import { GroundStationConfig } from "@app/assets/ground-station/ground-station-state";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Logger } from "@app/logging/logger";
import { ObjectivesManager } from "@app/objectives/objectives-manager";
import { NavigationOptions } from "@app/router";
import { ScenarioManager } from "@app/scenario-manager";
import { ScenarioDialogManager } from "@app/scenarios/scenario-dialog-manager";
import { AlarmService } from "@app/services/alarm-service";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { QuizModal } from "@app/modal/quiz-modal";
import { syncEquipmentWithStore } from "@app/sync";
import { AppState, syncManager } from "@app/sync/storage";
import { Auth } from "@app/user-account/auth";
import { BasePage } from "../base-page";
import { Body } from "../layout/body/body";
import { AssetTreeSidebar } from "./asset-tree-sidebar";
import { GlobalCommandBar } from "./global-command-bar";
import './mission-control-page.css';
import { TabbedCanvas } from "./tabbed-canvas";
import { TimelineDeck } from "./timeline-deck";


/**
 * AppShellPage - Mission Control Interface
*
* Modern web-based ground station control system
* Displays asset tree, tabbed canvas for equipment control, and timeline
*/
export class MissionControlPage extends BasePage {
  readonly id = 'app-shell-page';
  static readonly containerId = 'app-shell-page-container';
  private static instance_: MissionControlPage | null = null;

  // Components
  private commandBarCenter_!: GlobalCommandBar;
  private timelineDeck_!: TimelineDeck;
  private assetTreeSidebar_!: AssetTreeSidebar;
  private tabbedCanvas_!: TabbedCanvas;

  private groundStations_: GroundStation[] = [];

  private constructor(options?: NavigationOptions) {
    super();
    this.navigationOptions_ = options || {};
    this.init_()

    console.log(this.commandBarCenter_, this.timelineDeck_, this.assetTreeSidebar_, this.tabbedCanvas_, this.groundStations_);
  }

  static create(options?: NavigationOptions): MissionControlPage {
    if (this.instance_) {
      throw new Error("AppShellPage instance already exists.");
    }

    this.instance_ = new MissionControlPage(options);
    return this.instance_;
  }

  static getInstance(): MissionControlPage | null {
    return this.instance_;
  }

  protected html_ = html`
    <div id="${this.id}" class="app-shell-page flex-column" style="display: flex;">
      <header id="global-command-bar-container"></header>

      <!-- Main Workspace -->
      <div class="app-shell-main d-flex flex-fill overflow-hidden">
        <!-- Asset Tree Sidebar (Left) - Rendered by component -->
        <aside id="asset-tree-sidebar-container" class="app-shell-sidebar flex-shrink-0"></aside>

        <!-- Tabbed Canvas (Center) - Rendered by component -->
        <main id="tabbed-canvas-container" class="app-shell-canvas d-flex flex-column flex-fill overflow-hidden"></main>
      </div>

      <!-- Timeline Deck (Bottom) - Rendered by component -->
    </div>
  `;

  init_(): void {
    const parentDom = document.getElementById(Body.containerId);

    try {
      // Remove any existing instance
      const existing = qs(`#${this.id}`, parentDom);
      if (existing) {
        existing.remove();
      }
    } catch {
      // Ignore errors
    }

    super.init_(Body.containerId, 'add');
    this.dom_ = qs(`#${this.id}`, parentDom);

    this.commandBarCenter_ = new GlobalCommandBar('global-command-bar-container');

    this.timelineDeck_ = new TimelineDeck(this.id);

    // Create ground stations BEFORE UI components (they depend on ground stations existing)
    this.createGroundStationsFromScenario_();

    // Initialize components
    this.assetTreeSidebar_ = new AssetTreeSidebar('asset-tree-sidebar-container');
    this.tabbedCanvas_ = new TabbedCanvas('tabbed-canvas-container');

    // Start clock
    this.startClock_();

    // Initialize progress save manager
    this.initProgressSaveManager_();

    // Initialize equipment and objectives asynchronously
    this.initializeAsync_();
  }

  /**
   * Handle async initialization of equipment and objectives
   */
  private async initializeAsync_(): Promise<void> {
    // Initialize SimulationManager first (before objectives can subscribe to events)
    SimulationManager.getInstance();

    // Initialize AlarmService for global alarm aggregation
    AlarmService.getInstance();

    // Load checkpoint from backend and write to local storage (before sync)
    await this.loadCheckpointIfExists_();

    // Sync equipment with storage - will read checkpoint state from local storage if loaded
    syncEquipmentWithStore(null, this.groundStations_);

    await this.initializeObjectivesAndDialogs_();
  }

  /**
   * Creates GroundStation instances from the current scenario config.
   */
  private createGroundStationsFromScenario_(): void {
    const scenario = ScenarioManager.getInstance();

    this.groundStations_ = scenario.getScenario().groundStations.map((config: GroundStationConfig) => new GroundStation(config));

    // Initialize equipment immediately so AlarmService can poll alarms
    this.groundStations_.forEach(gs => gs.initializeEquipment());
  }

  /**
   * Load checkpoint from backend if it exists for the current scenario.
   * Manually syncs equipment states since:
   * 1. syncFromStorage in SyncManager early-returns when equipment is null
   * 2. GroundStation.sync() checks UUID which changes on each page load
   */
  private async loadCheckpointIfExists_(): Promise<void> {
    if (!this.progressSaveManager_) {
      Logger.warn('loadCheckpointIfExists_: progressSaveManager not initialized');
      return;
    }

    // Wait for auth to be ready before checking login status
    await App.authReady;

    // Check if user is logged in before trying to load from backend
    const isLoggedIn = await Auth.isLoggedIn();
    if (!isLoggedIn) {
      Logger.info('loadCheckpointIfExists_: User not logged in, skipping checkpoint load');
      return;
    }

    try {
      const scenario = ScenarioManager.getInstance();
      Logger.info(`loadCheckpointIfExists_: Loading checkpoint for scenario: ${scenario.data.id}`);

      const checkpoint = await this.progressSaveManager_.loadCheckpoint(scenario.data.id) as {
        state: AppState;
      };

      Logger.info(`loadCheckpointIfExists_: Checkpoint result:`, checkpoint ? 'found' : 'not found');

      if (checkpoint?.state) {
        // Manually sync ground station equipment states
        // Note: GroundStation.sync() checks UUID which won't match (UUIDs are regenerated on page load)
        // So we need to sync equipment directly by index
        const gsStates = checkpoint.state.groundStationStates;
        Logger.info(`loadCheckpointIfExists_: Found ${gsStates?.length ?? 0} ground station states to restore`);

        if (gsStates) {
          gsStates.forEach((gsState, gsIndex) => {
            const gs = this.groundStations_[gsIndex];
            if (!gs || !gsState.equipment) return;

            // Sync antennas
            gsState.equipment.antennas?.forEach((antennaState, i) => {
              gs.antennas[i]?.sync(antennaState);
            });

            // Sync RF front ends (includes GPSDO, LNB, BUC, HPA, Filter)
            gsState.equipment.rfFrontEnds?.forEach((rfState, i) => {
              gs.rfFrontEnds[i]?.sync(rfState);
            });

            // Sync spectrum analyzers
            gsState.equipment.spectrumAnalyzers?.forEach((specState, i) => {
              gs.spectrumAnalyzers[i]?.sync(specState);
            });

            // Sync transmitters
            gsState.equipment.transmitters?.forEach((txState, i) => {
              gs.transmitters[i]?.sync(txState);
            });

            // Sync receivers
            gsState.equipment.receivers?.forEach((rxState, i) => {
              gs.receivers[i]?.sync(rxState);
            });

            Logger.info(`loadCheckpointIfExists_: Synced equipment for ground station ${gsIndex}`);
          });
        }

        // Write checkpoint state to local storage for persistence
        await syncManager['provider'].write(checkpoint.state);

        // Set flag so objectives get restored and intro dialog is skipped
        this.navigationOptions_.continueFromCheckpoint = true;

        Logger.info(`Checkpoint loaded for scenario: ${scenario.data.id}`);
      }
    } catch (error) {
      Logger.error('Failed to load checkpoint:', error);
      // Continue without restoring - mission will start fresh
    }
  }

  /**
   * Start UTC clock
   */
  private startClock_(): void {
    const updateClock = () => {
      const now = new Date();
      const utcString = now.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
      const clockElement = qs('#utc-clock', this.dom_);
      if (clockElement) {
        clockElement.textContent = utcString;
      }
    };

    updateClock();
    setInterval(updateClock, 1000);
  }

  protected addEventListeners_(): void {
    // Event listeners handled by child components
    // Will be implemented in later phases
  }

  hide(): void {
    MissionControlPage.destroy();
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  static destroy(): void {
    // Clean up resources
    if (MissionControlPage.instance_) {
      // Clean up progress save manager
      MissionControlPage.instance_.disposeProgressSaveManager_();

      // TODO: Clean up components and ground stations
      // this.commandBarCenter_.destroy();
      // this.timelineDeck_.destroy();
      MissionControlPage.instance_ = null;
    }

    // Clean up singletons (matches SandboxPage.destroy())
    AlarmService.destroy();
    SimulationManager.destroy();
    ObjectivesManager.destroy();
    ScenarioDialogManager.reset();
    QuizModal.destroy();
    EventBus.destroy();
  }
}
