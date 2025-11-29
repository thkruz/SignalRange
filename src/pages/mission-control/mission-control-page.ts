import { GroundStation } from "@app/assets/ground-station/ground-station";
import { GroundStationConfig } from "@app/assets/ground-station/ground-station-state";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { Logger } from "@app/logging/logger";
import { Character } from "@app/modal/character-enum";
import { DialogManager } from "@app/modal/dialog-manager";
import { ObjectivesManager } from "@app/objectives";
import { NavigationOptions } from "@app/router";
import { ScenarioManager } from "@app/scenario-manager";
import { ScenarioDialogManager } from "@app/scenarios/scenario-dialog-manager";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { AppState, syncEquipmentWithStore } from "@app/sync";
import { Auth } from "@app/user-account/auth";
import { ProgressSaveManager } from "@app/user-account/progress-save-manager";
import { getAssetUrl } from "@app/utils/asset-url";
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
  progressSaveManager_: ProgressSaveManager;
  navigationOptions_: NavigationOptions;

  private constructor(options?: NavigationOptions) {
    super();
    this.navigationOptions_ = options || {};
    this.init_()

    console.log(this.commandBarCenter_, this.timelineDeck_, this.assetTreeSidebar_, this.tabbedCanvas_, this.groundStations_);
  }

  static create(): MissionControlPage {
    if (this.instance_) {
      throw new Error("AppShellPage instance already exists.");
    }

    this.instance_ = new MissionControlPage();
    return this.instance_;
  }

  static getInstance(): MissionControlPage | null {
    return this.instance_;
  }

  protected html_ = html`
    <div id="${this.id}" class="app-shell-page d-flex flex-column">
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

    this.createGroundStationsFromScenario_();

    // Initialize components
    this.assetTreeSidebar_ = new AssetTreeSidebar('asset-tree-sidebar-container');
    this.tabbedCanvas_ = new TabbedCanvas('tabbed-canvas-container');

    // Start clock
    this.startClock_();

    // Initialize progress save manager
    this.progressSaveManager_ = new ProgressSaveManager();
    this.progressSaveManager_.initialize();

    // Initialize equipment and objectives asynchronously
    this.initializeAsync_();
  }

  /**
   * Handle async initialization of equipment and objectives
   */
  private async initializeAsync_(): Promise<void> {
    SimulationManager.getInstance();

    // Initialize objectives manager if scenario has objectives
    const scenario = ScenarioManager.getInstance();
    if (scenario.data?.objectives && scenario.data.objectives.length > 0) {
      ObjectivesManager.initialize(scenario.data.objectives);
      SimulationManager.getInstance().objectivesManager = ObjectivesManager.getInstance();

      // Initialize scenario dialog manager for objective completion dialogs
      ScenarioDialogManager.getInstance().initialize();

      // If we're continuing from a checkpoint, restore objective states
      if (this.navigationOptions_.continueFromCheckpoint) {
        await this.restoreObjectiveStatesFromCheckpoint_();
      }
    }

    EventBus.getInstance().emit(Events.DOM_READY);

    // Show intro dialog if available and not continuing from checkpoint
    const introClip = scenario.data?.dialogClips?.intro;
    if (introClip && !this.navigationOptions_.continueFromCheckpoint) {
      DialogManager.getInstance().show(
        introClip.text,
        introClip.character,
        introClip.audioUrl,
        'Introduction'
      );

      // Schedule login prompt dialog to show 5 seconds after intro dialog is closed
      this.scheduleLoginPrompt_();
    }
  }

  /**
     * Restore objective states from checkpoint after ObjectivesManager has been initialized
     */
  private async restoreObjectiveStatesFromCheckpoint_(): Promise<void> {
    if (!this.progressSaveManager_) {
      return;
    }

    try {
      const scenario = ScenarioManager.getInstance();
      const checkpoint = await this.progressSaveManager_.loadCheckpoint(scenario.data.id) as {
        state: AppState;
      };

      if (checkpoint?.state?.objectiveStates) {
        const objectivesManager = ObjectivesManager.getInstance();
        objectivesManager.restoreState(checkpoint.state.objectiveStates);
        Logger.info('Objective states restored from checkpoint');
      }
    } catch (error) {
      Logger.error('Failed to restore objective states from checkpoint:', error);
      // Continue without restoring objectives - they'll start fresh
    }
  }

  /**
     * Schedule login prompt dialog to show 5 seconds after the intro dialog is closed
     */
  private scheduleLoginPrompt_(): void {
    // Check periodically if the intro dialog has been closed
    const checkDialogClosed = setInterval(() => {
      const dialogManager = DialogManager.getInstance();

      if (!dialogManager.isShowing()) {
        // Dialog is closed, clear the interval and schedule the login prompt
        clearInterval(checkDialogClosed);

        // Wait 5 seconds, then check if user is logged in
        setTimeout(async () => {
          const isLoggedIn = await Auth.isLoggedIn();

          if (!isLoggedIn) {
            // User is not logged in, show the login prompt dialog
            dialogManager.show(
              `
                <p>
                Hey, normally you make an account on the computer and log what you are doing.
                </p>
                <p>
                If you want to keep your notes on your desk, that's up to you, but just know none of us will have any idea what you did today if you ask us tomorrow!
                </p>

                <p>
                (You can make an account in the top right corner of the screen in order to save your progress automatically. It's free and only takes a minute!)
                </p>
                `,
              Character.CHARLIE_BROOKS,
              getAssetUrl('/assets/campaigns/login-first.mp3'),
              'Login Reminder'
            );
          }
        }, 5000);
      }
    }, 100); // Check every 100ms
  }

  /**
   * Creates GroundStation instances from the current scenario config.
   */
  private createGroundStationsFromScenario_(): void {
    const scenario = ScenarioManager.getInstance();

    this.groundStations_ = scenario.getScenario().groundStations.map((config: GroundStationConfig) => new GroundStation(config));

    syncEquipmentWithStore(null, this.groundStations_);
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
      // TODO: Clean up components and ground stations
      // this.commandBarCenter_.destroy();
      // this.timelineDeck_.destroy();
      MissionControlPage.instance_ = null;
    }
  }
}
