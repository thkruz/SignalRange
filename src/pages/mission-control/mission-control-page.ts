import { GroundStation } from "@app/assets/ground-station/ground-station";
import { GroundStationConfig } from "@app/assets/ground-station/ground-station-state";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { ScenarioManager } from "@app/scenario-manager";
import { BasePage } from "../base-page";
import { Body } from "../layout/body/body";
import { GlobalCommandBar } from "./global-command-bar";
import './mission-control-page.css';
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

  // Components (placeholder for now)
  private commandBarCenter_!: GlobalCommandBar;
  private timelineDeck_!: TimelineDeck;
  // private assetTreeSidebar_: AssetTreeSidebar;
  // private tabbedCanvas_: TabbedCanvas;

  private groundStations_: GroundStation[] = [];

  private constructor() {
    super();
    this.init_();

    console.log(this.commandBarCenter_, this.timelineDeck_, this.groundStations_);
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
    <div id="${this.id}" class="app-shell-page">
      <header id="global-command-bar-container"></header>

      <!-- Main Workspace -->
      <div class="app-shell-main">
        <!-- Asset Tree Sidebar (Left) -->
        <aside id="asset-tree-sidebar-container" class="app-shell-sidebar">
          <div class="sidebar-header">
            <h3>Assets</h3>
          </div>
          <div class="sidebar-content">
            <p class="placeholder-text">Ground stations will appear here</p>
          </div>
        </aside>

        <!-- Tabbed Canvas (Center) -->
        <main id="tabbed-canvas-container" class="app-shell-canvas">
          <div class="canvas-header">
            <div class="tab-bar">
              <div class="tab tab-active">Dashboard</div>
            </div>
          </div>
          <div class="canvas-content">
            <h2>Welcome to Mission Control</h2>
            <p>Select a ground station from the asset tree to begin.</p>
          </div>
        </main>
      </div>

      <!-- Timeline Deck (Bottom) (Component) -->
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

    // Initialize components (placeholder)
    this.initializePlaceholderComponents_();

    // Start clock
    this.startClock_();
  }

  /**
   * Initialize placeholder components (Phase 1)
   */
  private initializePlaceholderComponents_(): void {
    // TODO: Initialize actual components in Phase 3-4
    // Other components will be initialized here.
  }

  /**
   * Creates GroundStation instances from the current scenario config.
   */
  private createGroundStationsFromScenario_(): void {
    const scenario = ScenarioManager.getInstance();

    this.groundStations_ = scenario.getScenario().groundStations.map((config: GroundStationConfig) => new GroundStation(config));
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
