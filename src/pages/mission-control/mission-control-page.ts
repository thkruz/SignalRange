import { App } from '@app/app';
import { GroundStation } from '@app/assets/ground-station/ground-station';
import { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { CommandingManager } from '@app/commanding/commanding-manager';
import { ContactScheduleManager } from '@app/contact-schedule/contact-schedule-manager';
import { ElectronicAttackManager } from '@app/electronic-attack/electronic-attack-manager';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { GeolocationConsoleCore } from '@app/equipment/geolocation-console/geolocation-console-core';
import { EventBus } from '@app/events/event-bus';
import { HardwareFaultManager } from '@app/faults/hardware-fault-manager';
import { GnssThreatManager } from '@app/gnss-threat/gnss-threat-manager';
import { InterferenceManager } from '@app/interference/interference-manager';
import { LinkBudgetManager } from '@app/link-budget/link-budget-manager';
import { Logger } from '@app/logging/logger';
import { DecisionManager } from '@app/modal/decision-manager';
import { DecisionModal } from '@app/modal/decision-modal';
import { PendingQuizIndicator } from '@app/modal/pending-quiz-indicator';
import { QuizModal } from '@app/modal/quiz-modal';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { BasePage } from '@app/pages/base-page';
import { Body } from '@app/pages/layout/body/body';
import { MissionLoadingScreen } from '@app/pages/mission-loading-screen';
import { NavigationOptions, Router } from '@app/router';
import { ScenarioManager } from '@app/scenario-manager';
import { CampaignRecordPanel } from '@app/scenarios/campaign-record-panel';
import { ScenarioDialogManager } from '@app/scenarios/scenario-dialog-manager';
import { WorkingDocumentManager } from '@app/scenarios/working-document-manager';
import { SecurityConsoleCore } from '@app/security-console/security-console-core';
import { AlarmService } from '@app/services/alarm-service';
import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { SoundEvents } from '@app/sound/sound-events';
import { SpaceEventManager } from '@app/space-events/space-event-manager';
import { syncEquipmentWithStore } from '@app/sync';
import { AppState, syncManager } from '@app/sync/storage';
import { TelemetryManager } from '@app/telemetry/telemetry-manager';
import { TransecManager } from '@app/transec/transec-manager';
import { Auth } from '@app/user-account/auth';
import { ReplaySession } from '@app/user-account/replay-session';
import { WeatherManager } from '@app/weather/weather-manager';
import { AssetTreeSidebar } from './asset-tree-sidebar';
import { GlobalCommandBar } from './global-command-bar';
import './mission-control-page.css';
import { TabbedCanvas } from './tabbed-canvas';
import { TimelineDeck } from './timeline-deck';

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
  /** Only constructed when the scenario opts in via settings.contactTimeline. */
  private timelineDeck_: TimelineDeck | null = null;
  private assetTreeSidebar_!: AssetTreeSidebar;
  private tabbedCanvas_!: TabbedCanvas;

  private groundStations_: GroundStation[] = [];
  private loadingScreen_: MissionLoadingScreen | null = null;
  private disposed_ = false;

  private constructor(options?: NavigationOptions) {
    super();
    this.navigationOptions_ = options || {};
    try {
      this.init_();
    } catch (error) {
      this.loadingScreen_?.dispose();
      SimClock.resume('loading');
      throw error;
    }

    Logger.info(
      `
        ${this.commandBarCenter_},
        ${this.timelineDeck_},
        ${this.assetTreeSidebar_},
        ${this.tabbedCanvas_},
        ${this.groundStations_}
      `
    );
  }

  static create(options?: NavigationOptions): MissionControlPage {
    if (this.instance_) {
      throw new Error('AppShellPage instance already exists.');
    }

    this.instance_ = new MissionControlPage(options);
    return this.instance_;
  }

  static getInstance(): MissionControlPage | null {
    return this.instance_;
  }

  protected html_ = html`
    <div id="${this.id}" class="app-shell-page flex-column" style="display: flex;">
      <div id="mission-command-bar-mount" class="flex-shrink-0"></div>

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
    const returnPath = /^\/campaigns\/[^/]+/u.exec(globalThis.location.pathname)?.[0] ?? '/';
    SimClock.pause('loading');
    this.loadingScreen_ = new MissionLoadingScreen(ScenarioManager.getInstance().data, () => Router.getInstance().navigate(returnPath));

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
    this.dom_.inert = true;

    this.commandBarCenter_ = new GlobalCommandBar('mission-command-bar-mount');

    // Opt-in per scenario: campaigns that don't declare settings.contactTimeline
    // (Campaign 1's GEO work) never mount the deck, so the shell keeps its
    // original layout.
    const timelineConfig = ScenarioManager.getInstance().settings.contactTimeline;

    if (timelineConfig) {
      this.timelineDeck_ = new TimelineDeck(this.id, timelineConfig);
    }

    // Create ground stations BEFORE UI components (they depend on ground stations existing)
    this.createGroundStationsFromScenario_();

    // Initialize components
    this.assetTreeSidebar_ = new AssetTreeSidebar('asset-tree-sidebar-container');
    this.tabbedCanvas_ = new TabbedCanvas('tabbed-canvas-container');

    // Initialize progress save manager
    this.initProgressSaveManager_();

    // Initialize equipment and objectives asynchronously
    void this.initializeAsync_().catch((error) => {
      if (this.disposed_) return;
      Logger.error('Failed to prepare mission:', error);
      SimClock.pause('loading');
      this.dom_.inert = true;
      this.loadingScreen_?.fail();
    });
  }

  /**
   * Handle async initialization of equipment and objectives
   */
  private async initializeAsync_(): Promise<void> {
    // Initialize SimulationManager first (before objectives can subscribe to events)
    SimulationManager.getInstance();

    // Initialize AlarmService for global alarm aggregation
    AlarmService.getInstance();
    SoundEvents.start();

    // Load checkpoint from backend and write to local storage (before sync)
    await this.loadCheckpointIfExists_();
    if (this.disposed_) return;

    // Sync equipment with storage - will read checkpoint state from local storage if loaded
    syncEquipmentWithStore(null, this.groundStations_);

    await this.loadingScreen_?.reveal();
    if (this.disposed_) return;
    this.dom_.inert = false;
    SimClock.resume('loading');
    await this.initializeObjectivesAndDialogs_();
    if (this.disposed_) return;
    SoundEvents.arm();
  }

  /**
   * Creates GroundStation instances from the current scenario config.
   */
  private createGroundStationsFromScenario_(): void {
    const scenario = ScenarioManager.getInstance();

    this.groundStations_ = scenario.getScenario().groundStations.map((config: GroundStationConfig) => new GroundStation(config));

    // Initialize equipment immediately so AlarmService can poll alarms
    this.groundStations_.forEach((gs) => gs.initializeEquipment());
  }

  /**
   * Load checkpoint from backend if it exists for the current scenario.
   * Manually syncs equipment states since:
   * 1. syncFromStorage in SyncManager early-returns when equipment is null
   * 2. GroundStation.sync() checks UUID which changes on each page load
   */
  private async loadCheckpointIfExists_(): Promise<void> {
    // Skip checkpoint loading if replaying (starting fresh)
    if (this.navigationOptions_.forceReplay) {
      Logger.info('loadCheckpointIfExists_: Skipping checkpoint load due to forceReplay');
      return;
    }

    if (!this.progressSaveManager_) {
      Logger.warn('loadCheckpointIfExists_: progressSaveManager not initialized');
      return;
    }

    // Wait for auth to be ready before checking login status
    await App.authReady;
    if (this.disposed_) return;

    // Check if user is logged in before trying to load from backend. A replay
    // supplies its checkpoint from memory, so it needs no sign-in.
    const isLoggedIn = ReplaySession.checkpointFor(ScenarioManager.getInstance().data.id) !== null || (await Auth.isLoggedIn());
    if (this.disposed_) return;
    if (!isLoggedIn) {
      Logger.info('loadCheckpointIfExists_: User not logged in, skipping checkpoint load');
      return;
    }

    try {
      const scenario = ScenarioManager.getInstance();
      Logger.info(`loadCheckpointIfExists_: Loading checkpoint for scenario: ${scenario.data.id}`);

      const checkpoint = (await this.progressSaveManager_.loadCheckpoint(scenario.data.id)) as {
        state: AppState;
      };
      if (this.disposed_) return;

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
      } else {
        // No checkpoint found for logged-in user - skip completion modal and start fresh
        Logger.info('loadCheckpointIfExists_: No checkpoint data found, starting fresh');
        this.navigationOptions_.forceReplay = true;
      }
    } catch (error) {
      Logger.error('Failed to load checkpoint:', error);
      // The loading screen offers Retry. A connection failure is not a missing save.
      throw error;
    }
  }

  protected addEventListeners_(): void {
    // Event listeners handled by child components
    // Will be implemented in later phases
  }

  hide(): void {
    // Hide first: if teardown throws, the player must still leave the page
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
    MissionControlPage.destroy();
  }

  static destroy(): void {
    // Clean up resources
    if (MissionControlPage.instance_) {
      MissionControlPage.instance_.disposed_ = true;
      MissionControlPage.instance_.loadingScreen_?.dispose();
      SimClock.resume('loading');
      // Clean up progress save manager
      MissionControlPage.instance_.disposeProgressSaveManager_();

      // The deck subscribes to Events.UPDATE, so it must be torn down or it
      // keeps predicting passes for a scenario that is gone.
      MissionControlPage.instance_.timelineDeck_?.dispose();
      MissionControlPage.instance_.timelineDeck_ = null;

      // The command bar holds a 1 Hz interval and (when the scenario opts into
      // settings.timeSkip) the fast-forward overlay's EventBus subscriptions,
      // so leaving it up meant a second scenario stacked a second overlay.
      MissionControlPage.instance_.commandBarCenter_?.dispose();

      // The canvas owns every open tab, and a tab's dispose() releases things
      // the EventBus teardown below cannot - GeoMap's canvas pointer/wheel
      // handlers, detached DOM. Without this the tabs were simply abandoned.
      MissionControlPage.instance_.tabbedCanvas_?.destroy();

      // TODO: Clean up remaining components and ground stations
      MissionControlPage.instance_ = null;
    }

    // Clean up singletons (matches SandboxPage.destroy())
    AlarmService.destroy();
    SimulationManager.destroy();
    ObjectivesManager.destroy();
    ScenarioDialogManager.reset();
    WorkingDocumentManager.reset();
    CampaignRecordPanel.reset();
    WeatherManager.destroy();
    InterferenceManager.destroy();
    GeolocationConsoleCore.destroy();
    ElectronicAttackManager.destroy();
    HardwareFaultManager.destroy();
    LinkBudgetManager.destroy();
    CommandingManager.destroy();
    ContactScheduleManager.destroy();
    SpaceEventManager.destroy();
    SecurityConsoleCore.destroy();
    TransecManager.destroy();
    GnssThreatManager.destroy();
    TelemetryManager.destroy();
    QuizModal.destroy();
    DecisionModal.destroy();
    DecisionManager.destroy();
    PendingQuizIndicator.destroy();
    SoundEvents.destroy();
    EventBus.destroy();
  }
}
