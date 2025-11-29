import { GroundStation } from "@app/assets/ground-station/ground-station";
import { GroundStationConfig } from "@app/assets/ground-station/ground-station-state";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { ObjectivesManager } from "@app/objectives/objectives-manager";
import { NavigationOptions } from "@app/router";
import { ScenarioManager } from "@app/scenario-manager";
import { ScenarioDialogManager } from "@app/scenarios/scenario-dialog-manager";
import { AlarmService } from "@app/services/alarm-service";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { syncEquipmentWithStore } from "@app/sync";
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
    EventBus.destroy();
  }
}
