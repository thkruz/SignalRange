import activityPng from '@app/assets/icons/activity.png';
import downlinkPng from '@app/assets/icons/arrow-big-down-lines.png';
import uplinkPng from '@app/assets/icons/arrow-big-up-lines.png';
import checklistPng from '@app/assets/icons/checklist.png';
import dashboardPng from '@app/assets/icons/dashboard.png';
import gpsPng from '@app/assets/icons/gps.png';
import radarPng from '@app/assets/icons/radar.png';
import radioPng from '@app/assets/icons/radio.png';
import satellitePng from '@app/assets/icons/satellite.png';
import sharePng from '@app/assets/icons/share.png';
import stopwatchPng from '@app/assets/icons/stopwatch.png';
import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events, type ObjectiveObservationPendingData } from '@app/events/events';
import { ImmersiveView } from '@app/presentation/immersive-view';
import { type LaptopApp, LaptopShell } from '@app/presentation/laptop-shell';
import { revealPanel } from '@app/presentation/transitions';
import { ScenarioManager } from '@app/scenario-manager';
import { hasOrbitalSatellites } from '@app/simulation/sim-queries';
import { SimulationManager } from '@app/simulation/simulation-manager';
import './tabbed-canvas.css';
import type { GroundStation } from '@app/assets/ground-station/ground-station';
import { ModalConfirm } from '@app/engine/ui/modal-confirm';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { HamStationService } from '@app/ham/ham-station-service';
import { type AntennaPage, AntennaPageRegistry, STATION_TAB_PREFIX, type StationTabFactory } from '@app/pages/mission-control/antenna-page-registry';
import { fieldDefaultTabId } from '@app/pages/mission-control/field-default-tab';
import { ACUControlTab } from '@app/pages/mission-control/tabs/acu-control-tab';
import { ClipboardShell } from '@app/pages/mission-control/tabs/clipboard/clipboard-shell';
import { clipboardPages } from '@app/pages/mission-control/tabs/clipboard/clipboard-view';
import { CommandingTab } from '@app/pages/mission-control/tabs/commanding-tab';
import { ContactScheduleTab } from '@app/pages/mission-control/tabs/contact-schedule-tab';
import { DashboardTab } from '@app/pages/mission-control/tabs/dashboard-tab';
import { type DocumentsPage, DocumentsShell } from '@app/pages/mission-control/tabs/documents/documents-shell';
import { EaAssessmentTab } from '@app/pages/mission-control/tabs/ea-assessment-tab';
import { FIELD_KIT, type KitSheet, kitObjectFor, offeredSheets } from '@app/pages/mission-control/tabs/field-kit';
import { GeolocationTab } from '@app/pages/mission-control/tabs/geolocation-tab';
import { GPSTimingTab } from '@app/pages/mission-control/tabs/gps-timing-tab';
import { GroundTrackTab } from '@app/pages/mission-control/tabs/ground-track-tab';
import { HamSdrConsoleTab } from '@app/pages/mission-control/tabs/ham-sdr-console-tab';
import { HamStationTab } from '@app/pages/mission-control/tabs/ham-station-tab';
import { LinkBudgetTab } from '@app/pages/mission-control/tabs/link-budget-tab';
import { MissionOverviewTab } from '@app/pages/mission-control/tabs/mission-overview-tab';
import { PassScheduleTab } from '@app/pages/mission-control/tabs/pass-schedule-tab';
import { RxAnalysisTab } from '@app/pages/mission-control/tabs/rx-analysis-tab';
import { SatelliteDashboardTab } from '@app/pages/mission-control/tabs/satellite-dashboard-tab';
import { SdrConsoleTab } from '@app/pages/mission-control/tabs/sdr-console-tab';
import { SecurityConsoleTab } from '@app/pages/mission-control/tabs/security-console-tab';
import { SiteTab } from '@app/pages/mission-control/tabs/site-tab';
import { TelemetryTab } from '@app/pages/mission-control/tabs/telemetry-tab';
import { TxChainTab } from '@app/pages/mission-control/tabs/tx-chain-tab';
import { TentControl } from '@app/pages/mission-control/tent-control';
import { FieldTabPolicy } from '@app/physical/field-tab-policy';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { MinimalHud } from '@app/presentation/minimal-hud/minimal-hud';
import { minimalHudActive } from '@app/presentation/minimal-hud/minimal-hud-policy';
import { SandboxLoadoutService } from '@app/sandbox/sandbox-loadout';
import { KeepTrackEmbedHost } from '@app/services/keeptrack-embed-host';
import { SettingsManager } from '@app/settings/settings-manager';

/** A single entry in the tab bar. */
interface TabDescriptor {
  id: string;
  label: string;
  icon: string;
  isDisabled?: boolean;
}

/**
 * TabbedCanvas - Dynamic tabbed interface for ground station equipment
 *
 * Displays different tabs based on selected asset:
 * - Ground Station: ACU Control, RX Analysis, TX Chain, GPS Timing
 * - Satellite: Placeholder (Phase 8+)
 */
export class TabbedCanvas extends BaseElement {
  private readonly immersive_ = new ImmersiveView();
  static readonly containerId = 'tabbed-canvas-container';
  private static instance_: TabbedCanvas | null = null;

  /**
   * Memory key for the mission overview, which has no asset id. Deliberately
   * not a valid ground-station or satellite id so it can never collide.
   */
  private static readonly OVERVIEW_KEY = '__overview__';

  private activeTab_: string = 'mission-overview';
  private notebookReturnTab_ = 'site';
  /** Observation tabs (id or prefix) whose button pulses until the tab is opened (Phase 35 D3) */
  private readonly pulseTabs_ = new Set<string>();
  private selectedAssetId_: string | null = null;
  private selectedAssetType_: 'ground-station' | 'satellite' | null = null;
  /** True while the canvas re-announces the current asset to resync the sidebar highlight. */
  private resyncing_ = false;
  /**
   * Last tab the operator had open on each asset, keyed by asset id.
   * Reselecting an asset returns to where they left off instead of resetting
   * to its first tab, so switching between assets doesn't lose a workflow.
   */
  private readonly lastTabByAsset_: Map<string, string> = new Map();
  /** Tab ids on screen at a locked 'field' station; null elsewhere. Event-driven switches to other tabs are ignored. */
  private fieldTabIds_: Set<string> | null = null;
  private unsubscribeFieldPolicy_: (() => void) | null = null;
  private readonly tabInstances_: Map<
    string,
    | ACUControlTab
    | AntennaPage
    | DashboardTab
    | RxAnalysisTab
    | TxChainTab
    | GPSTimingTab
    | SatelliteDashboardTab
    | MissionOverviewTab
    | PassScheduleTab
    | SdrConsoleTab
    | HamSdrConsoleTab
    | HamStationTab
    | GeolocationTab
    | EaAssessmentTab
    | LinkBudgetTab
    | CommandingTab
    | TelemetryTab
    | ContactScheduleTab
    | SecurityConsoleTab
    | SiteTab
    | GroundTrackTab
  > = new Map();

  /**
   * Subscriptions are held as stable references because EventBus.off() matches
   * by function identity - re-binding or re-declaring at teardown removes
   * nothing and leaves the canvas listening after it is gone.
   */
  private readonly boundAssetSelected_ = (data: { type: 'ground-station' | 'satellite'; id: string }): void => {
    if (this.resyncing_) {
      return;
    }
    if (this.isGated_()) {
      this.confirmLeaveSite_(() => EventBus.getInstance().emit(Events.ASSET_SELECTED, data));
      this.resyncSidebar_();

      return;
    }
    this.handleAssetSelected_(data.type, data.id);
  };

  private readonly boundObservationPending_ = (data: ObjectiveObservationPendingData): void => {
    this.pulseTabs_.add(data.tab);
    this.applyTabPulse_();
  };

  private readonly boundSwitchTab_ = (data: { tabId: string; desktop?: boolean }): void => {
    if (data.desktop) SiteTab.requestDesktop();
    this.requestTab_(data.tabId);
  };

  private readonly boundMissionOverviewSelected_ = (): void => {
    this.immersive_.close();
    if (this.isGated_()) {
      this.confirmLeaveSite_(() => EventBus.getInstance().emit(Events.MISSION_OVERVIEW_SELECTED));

      return;
    }
    this.selectedAssetId_ = null;
    this.tabInstances_.forEach((tab) => tab.dispose());
    this.tabInstances_.clear();
    this.showMissionOverview_();
  };

  private tentControl_: TentControl | null = null;
  private hud_: MinimalHud | null = null;
  private readonly boundTentSync_ = (): void => this.tentControl_?.sync();

  protected html_ = html`
    <div class="tabbed-canvas">
      <div class="canvas-header">
        <ul id="tab-bar" class="nav nav-tabs" role="tablist"></ul>
      </div>
      <div id="canvas-content" class="canvas-content tab-content"></div>
    </div>
  `;

  constructor(parentId: string) {
    super();
    TabbedCanvas.instance_ = this;
    this.init_(parentId, 'replace');
    this.dom_ = qs('.tabbed-canvas');
    this.tentControl_ = new TentControl(qs('.canvas-header', this.dom_));
    // The watch's Pause pusher opens the game menu (lazy, like the command bar's menu button, to keep it out of this module's imports)
    this.hud_ = new MinimalHud(this.dom_, {
      onPause: () => void import('@app/game-menu/game-menu').then(({ GameMenu }) => GameMenu.getInstance().openMenu()),
    });
    EventBus.getInstance().on(Events.UPDATE, this.boundTentSync_);
    this.showMissionOverview_();
    this.preloadMapEmbed_();
  }

  /**
   * Boot the KeepTrack world map in the background as soon as mission control
   * opens, so the first World Map tab is instant. Skipped when the scenario has
   * no orbital satellites (no map tab) or the built-in renderer is selected.
   */
  private preloadMapEmbed_(): void {
    const hasOrbitalSats = hasOrbitalSatellites(SimulationManager.getInstance());

    if (hasOrbitalSats && SettingsManager.getInstance().groundTrackRenderer === 'embed') {
      KeepTrackEmbedHost.getInstance().preload();
    }
  }

  /**
   * Get the currently active tab ID
   * Used by ObjectivesManager for tab-active condition evaluation
   */
  static getActiveTab(): string | null {
    return TabbedCanvas.instance_?.activeTab_ ?? null;
  }

  /**
   * The asset (ground station or satellite id) whose tabs are open, or null on
   * the Mission Overview. ObjectivesManager reads it so an observation row for
   * one station is not read while another is selected (Phase 35 D11).
   */
  static getSelectedAssetId(): string | null {
    return TabbedCanvas.instance_?.selectedAssetId_ ?? null;
  }

  protected addEventListeners_(): void {
    const eventBus = EventBus.getInstance();

    // An observation row reads true but its tab is closed: pulse the tab button (Phase 35 D3)
    eventBus.on(Events.OBJECTIVE_OBSERVATION_PENDING, this.boundObservationPending_);

    // Listen for asset selection changes
    eventBus.on(Events.ASSET_SELECTED, this.boundAssetSelected_);

    // Listen for tab switch requests from other components (e.g., dashboard cards)
    eventBus.on(Events.SWITCH_TAB, this.boundSwitchTab_);

    // Listen for mission overview selection
    eventBus.on(Events.MISSION_OVERVIEW_SELECTED, this.boundMissionOverviewSelected_);

    // Trainer toggled the engineering tabs at a field station: rebuild the tab set
    this.unsubscribeFieldPolicy_ = FieldTabPolicy.onChange(() => {
      if (this.selectedAssetType_ === 'ground-station' && this.selectedAssetId_) {
        this.showGroundStationAsset_();
      }
    });
  }

  /**
   * Handle asset selection from the asset tree
   */
  private handleAssetSelected_(type: 'ground-station' | 'satellite', id: string): void {
    this.immersive_.close();
    // The Overview's look-angle card follows the last station picked (phase 31 D16)
    if (type === 'ground-station') {
      MissionOverviewTab.rememberStation(id);
    }

    // Clean up old tabs when switching assets
    if (this.selectedAssetId_ !== id) {
      this.tabInstances_.forEach((tab) => tab.dispose());
      this.tabInstances_.clear();
    }

    this.selectedAssetId_ = id;
    this.selectedAssetType_ = type;

    if (type === 'ground-station') {
      this.showGroundStationAsset_();
    } else if (type === 'satellite') {
      this.showSatelliteAsset_();
    }
  }

  /** Memory key for the asset whose tab set is currently on screen. */
  private assetKey_(): string {
    return this.selectedAssetId_ ?? TabbedCanvas.OVERVIEW_KEY;
  }

  /**
   * Pick which tab to open for the asset now being shown: the one the operator
   * last had open on it, if that tab still exists and is enabled, otherwise the
   * asset's default first tab.
   */
  private resolveActiveTab_(tabs: TabDescriptor[], defaultTabId: string): string {
    const remembered = this.lastTabByAsset_.get(this.assetKey_());
    const match = tabs.find((tab) => tab.id === remembered && !tab.isDisabled);

    return match?.id ?? defaultTabId;
  }

  /**
   * Show the mission overview (no asset selected): build its tab bar, then open
   * the remembered tab.
   */
  /**
   * Field stations (Campaign 6) and the ham bench (Campaign 3) are worked with physical equipment: the station
   * computer's sidebar, command bar and tab bar give way to the minimal HUD, and the tent caption moves beside
   * the watch. Everything else keeps the full chrome. Called on every asset or overview change.
   */
  private syncMinimalHud_(stationClass: string | null | undefined): void {
    let sandbox = false;
    try {
      sandbox = SandboxLoadoutService.isSandboxScenario(ScenarioManager.getInstance().data);
    } catch {
      sandbox = false;
    }
    const active = minimalHudActive({
      stationClass,
      engineeringUnlocked: FieldTabPolicy.isEngineeringUnlocked(),
      sandbox,
      hamBench: HamStationService.getInstance() !== null,
    });
    this.hud_?.setActive(active);
    const tent = this.tentControl_?.element;
    const home = active ? this.hud_?.tentSlot : this.dom_?.querySelector('.canvas-header');
    if (tent && home && tent.parentElement !== home) home.append(tent);
  }

  private showMissionOverview_(): void {
    this.syncMinimalHud_(null);
    this.fieldTabIds_ = null;
    const hasOrbitalSats = hasOrbitalSatellites(SimulationManager.getInstance());

    // With orbital satellites the overview gains a whole-world map alongside
    // it; otherwise it keeps its historical no-tab-bar look.
    if (hasOrbitalSats) {
      const tabs: TabDescriptor[] = [
        { id: 'mission-overview', label: 'Overview', icon: dashboardPng },
        { id: 'ground-track', label: 'World Map', icon: radarPng },
      ];

      this.renderTabs_(tabs);
      this.switchTab_(this.resolveActiveTab_(tabs, 'mission-overview'));
    } else {
      qs('#tab-bar', this.dom_).innerHTML = '';
      this.switchTab_('mission-overview');
    }
  }

  /**
   * Render the mission overview tab's content (tab bar untouched)
   */
  private renderMissionOverviewTab_(): void {
    const tabKey = 'mission-overview';
    let overviewTab = this.tabInstances_.get(tabKey) as MissionOverviewTab;

    if (overviewTab && !document.contains(overviewTab.dom)) {
      overviewTab.dispose();
      this.tabInstances_.delete(tabKey);
      overviewTab = null!;
    }

    if (!overviewTab) {
      overviewTab = new MissionOverviewTab('canvas-content');
      this.tabInstances_.set(tabKey, overviewTab);
    }

    overviewTab.activate();
  }

  /**
   * Show a ground station: build its tab bar, then open the remembered tab.
   * Dynamically generates one ACU tab per antenna when multiple antennas exist
   */
  private showGroundStationAsset_(): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      console.error(`Ground station ${this.selectedAssetId_} not found`);
      return;
    }

    const hasOrbitalSats = hasOrbitalSatellites(SimulationManager.getInstance());

    this.fieldTabIds_ = null;
    this.syncMinimalHud_(groundStation.state.stationClass);

    // Backyard stations (Campaign 3+) are hobbyist SDR rigs: no ACU racks, no
    // professional RX/TX chains, no dashboard of links to those tabs. The SDR
    // Console (with its rotator panel) is the whole rig; Observations covers
    // planning. Absent stationClass renders the professional tab set as before.
    if (groundStation.state.stationClass === 'backyard') {
      // The physical bench and the receiver software have separate workspaces.
      const hamStation = HamStationService.getInstance() !== null;
      const backyardTabs: TabDescriptor[] = hamStation
        ? [
            { id: 'ham-station', label: 'Station', icon: radioPng },
            { id: 'sdr-console', label: 'SDR Console', icon: radarPng },
          ]
        : [{ id: 'sdr-console', label: 'SDR Console', icon: radarPng, isDisabled: groundStation.state.isOperational === false }];
      if (hasOrbitalSats) {
        backyardTabs.push({ id: 'pass-schedule', label: 'Observations', icon: stopwatchPng, isDisabled: groundStation.state.isOperational === false });
      }
      this.renderTabs_(backyardTabs);
      this.switchTab_(this.resolveActiveTab_(backyardTabs, hamStation ? 'ham-station' : 'sdr-console'));
      return;
    }

    // Field stations (Campaign 6): the Site tab, tabs plugins register for the
    // class (the terminal app), and only the engineering tabs the scenario allows.
    // The trainer unlock restores the full professional set below, plus the station tabs.
    const fieldMode = groundStation.state.stationClass === 'field' && !FieldTabPolicy.isEngineeringUnlocked();
    if (fieldMode) {
      this.showFieldStationTabs_(groundStation);

      return;
    }

    const tabs: TabDescriptor[] = [{ id: 'dashboard', label: 'Dashboard', icon: dashboardPng }];

    // Add one ACU tab per antenna with band/size label
    groundStation.antennas.forEach((antenna, index) => {
      const config = antenna.config;
      const customLabel = AntennaPageRegistry.getInstance().tabLabel(config.kind);
      const label = customLabel ?? (groundStation.antennas.length === 1 ? 'ACU Control' : `ACU: ${config.band}-Band ${config.diameter}m`);
      tabs.push({
        id: `acu-control-${index}`,
        label,
        icon: radarPng,
        isDisabled: groundStation.state.isOperational === false,
      });
    });

    // Add remaining tabs
    tabs.push(
      { id: 'rx-analysis', label: 'RX Analysis', icon: downlinkPng, isDisabled: groundStation.state.isOperational === false },
      { id: 'tx-chain', label: 'TX Chain', icon: uplinkPng, isDisabled: groundStation.state.isOperational === false },
      { id: 'gps-timing', label: 'GPS Timing', icon: gpsPng, isDisabled: groundStation.state.isOperational === false }
    );

    // Pass Schedule only exists for scenarios with orbital (SGP4) satellites.
    // (Any OrbitalSatellite qualifies — MEO birds like GPS included.)
    if (hasOrbitalSats) {
      tabs.push({ id: 'pass-schedule', label: 'Pass Schedule', icon: stopwatchPng, isDisabled: groundStation.state.isOperational === false });
    }

    // Geolocation console only exists for scenarios that opt in via
    // settings.geolocation (Campaign 5). Invisible to all other campaigns.
    if (ScenarioManager.getInstance().settings.geolocation) {
      tabs.push({ id: 'geolocation', label: 'Geolocation', icon: radarPng, isDisabled: groundStation.state.isOperational === false });
    }

    // EA Assessment console only exists for scenarios that opt in via
    // settings.electronicAttack (Campaign 4). Invisible to all other campaigns.
    if (ScenarioManager.getInstance().settings.electronicAttack) {
      tabs.push({ id: 'ea-assessment', label: 'EA Assessment', icon: radarPng, isDisabled: groundStation.state.isOperational === false });
    }

    // nats-eu (Campaign 2 European Operations) operator consoles. Each tab only
    // exists for scenarios that opt in via its settings block, so legacy
    // campaigns are unaffected.
    const settings = ScenarioManager.getInstance().settings;
    if (settings.linkBudget) {
      tabs.push({ id: 'link-budget', label: 'Link Analysis', icon: checklistPng, isDisabled: groundStation.state.isOperational === false });
    }
    if (settings.commanding) {
      tabs.push({ id: 'commanding', label: 'TT&C', icon: radioPng, isDisabled: groundStation.state.isOperational === false });
    }
    if (settings.contactSchedule) {
      tabs.push({ id: 'contact-schedule', label: 'Contact Plan', icon: sharePng, isDisabled: groundStation.state.isOperational === false });
    }
    if (settings.telemetry) {
      tabs.push({ id: 'telemetry', label: 'Telemetry', icon: activityPng, isDisabled: groundStation.state.isOperational === false });
    }
    if (settings.security || settings.transec) {
      tabs.push({ id: 'security-console', label: 'Security', icon: activityPng, isDisabled: groundStation.state.isOperational === false });
    }

    // Phase 38.1 physical-layer sandbox: the site view only exists with a plant
    if (settings.physicalPlant) {
      tabs.push({ id: 'site', label: 'Site', icon: radarPng });
    }

    // Unlocked field station: the terminal app stays beside the engineering tabs
    if (groundStation.state.stationClass === 'field') {
      AntennaPageRegistry.getInstance()
        .stationTabsFor('field')
        .forEach((reg) => tabs.push({ id: `${STATION_TAB_PREFIX}${reg.id}`, label: reg.label, icon: radarPng, isDisabled: groundStation.state.isOperational === false }));
    }

    if (settings.physicalPlant) {
      tabs.push(...SiteTab.availableWorkspaces().map((tab) => ({ ...tab, icon: checklistPng })));
    }
    this.renderTabs_(tabs);
    this.switchTab_(this.resolveActiveTab_(tabs, 'dashboard'));
  }

  /**
   * Tab set for a 'field' station with the engineering tabs locked: Site, then
   * plugin station tabs for the class, then the engineering tabs the scenario
   * lists in `settings.fieldTabs`. The default tab is a registered station tab
   * marked `isDefault`, else Site.
   */
  private showFieldStationTabs_(groundStation: GroundStation): void {
    const settings = ScenarioManager.getInstance().settings;
    const registered = AntennaPageRegistry.getInstance().stationTabsFor(groundStation.state.stationClass);
    const disabled = groundStation.state.isOperational === false;
    const tabs: TabDescriptor[] = [];

    if (settings.physicalPlant) {
      tabs.push({ id: 'site', label: 'Site', icon: radarPng });
    }
    registered.forEach((reg) => tabs.push({ id: `${STATION_TAB_PREFIX}${reg.id}`, label: reg.label, icon: radarPng, isDisabled: disabled }));
    if (settings.physicalPlant) {
      tabs.push(...SiteTab.availableWorkspaces().map((tab) => ({ ...tab, icon: checklistPng })));
    }

    const allowed = new Set(settings.fieldTabs ?? []);
    const engineering: TabDescriptor[] = [
      { id: 'dashboard', label: 'Dashboard', icon: dashboardPng },
      ...groundStation.antennas.map((antenna, index) => ({
        id: `acu-control-${index}`,
        label:
          AntennaPageRegistry.getInstance().tabLabel(antenna.config.kind) ??
          (groundStation.antennas.length === 1 ? 'ACU Control' : `ACU: ${antenna.config.band}-Band ${antenna.config.diameter}m`),
        icon: radarPng,
        isDisabled: disabled,
      })),
      { id: 'rx-analysis', label: 'RX Analysis', icon: downlinkPng, isDisabled: disabled },
      { id: 'tx-chain', label: 'TX Chain', icon: uplinkPng, isDisabled: disabled },
      { id: 'gps-timing', label: 'GPS Timing', icon: gpsPng, isDisabled: disabled },
      { id: 'pass-schedule', label: 'Pass Schedule', icon: stopwatchPng, isDisabled: disabled },
    ];
    // 'acu-control' allows every antenna's ACU tab
    tabs.push(...engineering.filter((tab) => allowed.has(tab.id) || (tab.id.startsWith('acu-control-') && allowed.has('acu-control'))));

    const defaultReg = registered.find((reg) => reg.isDefault);
    const fallback = fieldDefaultTabId(
      tabs.some((tab) => tab.id === 'site'),
      defaultReg ? `${STATION_TAB_PREFIX}${defaultReg.id}` : null,
      tabs[0]?.id ?? 'site'
    );

    this.fieldTabIds_ = new Set(tabs.map((tab) => tab.id));
    this.renderTabs_(tabs);
    this.switchTab_(this.resolveActiveTab_(tabs, fallback));
  }

  /**
   * The satellite the selected asset id refers to, or null when the asset is
   * not a satellite (or the NORAD ID is unknown to the simulation).
   */
  private selectedSatellite_() {
    if (!this.selectedAssetId_?.startsWith('sat-')) {
      return null;
    }

    // Extract NORAD ID from the asset ID (format: "sat-12345")
    const noradId = parseInt(this.selectedAssetId_.replace('sat-', ''), 10);

    return SimulationManager.getInstance().getSatByNoradId(noradId);
  }

  private renderSatelliteNotFound_(content: HTMLElement): void {
    const noradId = parseInt(this.selectedAssetId_?.replace('sat-', '') ?? '0', 10);

    content.innerHTML = html`
      <div class="placeholder-screen">
        <div class="placeholder-icon">⚠️</div>
        <h2>Satellite Not Found</h2>
        <p>Could not find satellite with NORAD ID ${noradId}.</p>
      </div>
    `;
  }

  /**
   * Show a satellite: build its tab bar, then open the remembered tab.
   */
  private showSatelliteAsset_(): void {
    this.syncMinimalHud_(null);
    this.fieldTabIds_ = null;
    const satellite = this.selectedSatellite_();

    if (!satellite) {
      qs('#tab-bar', this.dom_).innerHTML = '';
      this.renderSatelliteNotFound_(qs('#canvas-content', this.dom_));
      return;
    }

    const tabs: TabDescriptor[] = [{ id: 'sat-dashboard', label: 'Dashboard', icon: satellitePng }];

    // Ground Track sits next to the satellite it tracks. Only SGP4 birds have
    // a meaningful sub-point path, so fixed/GEO-modeled satellites don't get it.
    if (satellite instanceof OrbitalSatellite) {
      tabs.push({ id: 'ground-track', label: 'Ground Track', icon: radarPng });
    }

    this.renderTabs_(tabs);
    this.switchTab_(this.resolveActiveTab_(tabs, 'sat-dashboard'));
  }

  /**
   * Render the satellite dashboard tab's content (tab bar untouched)
   */
  private renderSatelliteDashboardTab_(content: HTMLElement): void {
    const satellite = this.selectedSatellite_();

    if (!satellite) {
      this.renderSatelliteNotFound_(content);
      return;
    }

    const tabKey = `sat-dashboard-${this.selectedAssetId_}`;
    let satTab = this.tabInstances_.get(tabKey) as SatelliteDashboardTab;

    if (satTab && !document.contains(satTab.dom)) {
      satTab.dispose();
      this.tabInstances_.delete(tabKey);
      satTab = null!;
    }

    if (!satTab) {
      satTab = new SatelliteDashboardTab(satellite, 'canvas-content');
      this.tabInstances_.set(tabKey, satTab);
    }

    satTab.activate();
  }

  /**
   * Render tab bar using Bootstrap nav-tabs
   */
  private renderTabs_(tabs: TabDescriptor[]): void {
    const tabBar = qs('#tab-bar', this.dom_);

    tabBar.innerHTML = tabs
      .map(
        (tab) => html`
      <li class="nav-item" role="presentation">
      <a class="nav-link ${tab.id === this.activeTab_ ? 'active' : ''} ${tab.isDisabled ? 'disabled' : ''}"
        href="#"
        role="tab"
        data-tab-id="${tab.id}"
        ${tab.isDisabled ? 'aria-disabled="true"' : ''}>
        <span class="tab-icon">
          <img
          src="${tab.icon}"
          class="tab-icon-image"
          alt="${tab.label}"
          />
        </span>
        <span class="tab-label">${tab.label}</span>
      </a>
      </li>
    `
      )
      .join('');

    this.applyTabPulse_();

    // Add click listeners to nav-links
    tabBar.querySelectorAll('.nav-link').forEach((tabElement: HTMLElement) => {
      tabElement.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default link behavior
        const tabId = tabElement.dataset.tabId;
        if (tabId) {
          if (tabId === 'field-service') SiteTab.requestDesktop();
          this.requestTab_(tabId);
        }
      });
    });
  }

  /** Whether a tab id is the observation tab or one of its per-asset variants */
  private static matchesTab_(tabId: string, observationTab: string): boolean {
    return tabId === observationTab || tabId.startsWith(`${observationTab}-`);
  }

  /** Pulse the buttons of pending observation tabs; opening the tab ends its pulse */
  private applyTabPulse_(): void {
    const tabBar = this.dom_?.querySelector('#tab-bar');
    if (!tabBar) return;
    for (const pending of [...this.pulseTabs_]) {
      if (TabbedCanvas.matchesTab_(this.activeTab_, pending)) {
        this.pulseTabs_.delete(pending);
      }
    }
    tabBar.querySelectorAll('.nav-link').forEach((navLink: HTMLElement) => {
      const tabId = navLink.dataset.tabId ?? '';
      const pulsing = [...this.pulseTabs_].some((pending) => TabbedCanvas.matchesTab_(tabId, pending));
      navLink.classList.toggle('tab-pulse', pulsing);
    });
    // With the tab bar hidden (field HUD), the kit object that holds a pending page pulses instead
    const pendingKits = new Set([...this.pulseTabs_].map((pending) => kitObjectFor(pending)?.id).filter(Boolean));
    this.dom_?.querySelectorAll<HTMLElement>('[data-field-kit]').forEach((item) => {
      item.classList.toggle('tab-pulse', pendingKits.has(item.dataset.fieldKit as never));
    });
  }

  /**
   * Tab-switch guard for user and event routes. While the player is outside the
   * tent (Frontline physical plant), the laptop and equipment tabs are out of
   * reach: ask whether to go back inside first. A no-op without a plant, so
   * C1-C5 behaviour is unchanged.
   */
  private requestTab_(tabId: string): void {
    if (this.fieldTabIds_ && !this.fieldTabIds_.has(tabId)) {
      return;
    }
    const portable =
      ['field-power', 'field-path', 'field-notebook', 'field-handover', 'field-records'].includes(tabId) ||
      (tabId === 'field-service' && ['pilot-report', 'endpoint-report'].includes(SiteTab.source));
    if (!this.isGated_() || portable || tabId === 'site' || tabId === this.activeTab_) {
      this.switchTab_(tabId);

      return;
    }
    this.confirmLeaveSite_(() => this.switchTab_(tabId));
  }

  /** True while the player is outside the tent: laptop and equipment are out of reach. */
  private isGated_(): boolean {
    return PhysicalPlantService.plantOrNull()?.isOutside() ?? false;
  }

  /**
   * The one outside-the-tent confirm, shared by tab switches and sidebar asset
   * switches. On confirm the player goes back inside, then `proceed` runs.
   */
  private confirmLeaveSite_(proceed: () => void): void {
    const plant = PhysicalPlantService.plantOrNull();

    ModalConfirm.getInstance().open(
      () => {
        plant?.returnInside();
        proceed();
      },
      {
        title: 'You are outside',
        message: "You're outside with the dishes, generator and cables. The laptop and equipment panels are in the tent.",
        confirmText: 'Go back in',
        cancelText: 'Stay outside',
      }
    );
  }

  /** A refused sidebar switch: put the sidebar highlight back on the asset still on screen. */
  private resyncSidebar_(): void {
    if (!this.selectedAssetId_ || !this.selectedAssetType_) {
      return;
    }
    this.resyncing_ = true;
    try {
      EventBus.getInstance().emit(Events.ASSET_SELECTED, { type: this.selectedAssetType_, id: this.selectedAssetId_ });
    } finally {
      this.resyncing_ = false;
    }
  }

  /**
   * Switch to a different tab
   */
  private switchTab_(tabId: string): void {
    this.immersive_.close();
    if (tabId === 'field-notebook' && this.activeTab_ !== 'field-notebook') this.notebookReturnTab_ = this.activeTab_ || 'site';
    this.activeTab_ = tabId;

    // Remember where the operator was on this asset so reselecting it later
    // returns here instead of resetting to the asset's first tab.
    this.lastTabByAsset_.set(this.assetKey_(), tabId);

    // Update tab active state using Bootstrap classes
    const tabBar = qs('#tab-bar', this.dom_);
    tabBar.querySelectorAll('.nav-link').forEach((navLink: HTMLElement) => {
      if (navLink.dataset.tabId === tabId) {
        navLink.classList.add('active');
      } else {
        navLink.classList.remove('active');
      }
    });

    this.applyTabPulse_();

    // Keep an in-world workstation's applications mounted while changing focus.
    const immersiveCampaign = PhysicalPlantService.plantOrNull() !== null || !!HamStationService.getInstance()?.manager;
    let park = this.dom_?.querySelector<HTMLElement>('.immersive-park');
    if (immersiveCampaign && !park) {
      park = document.createElement('section');
      park.className = 'immersive-park';
      park.hidden = true;
      this.dom_?.append(park);
    }
    if (immersiveCampaign && park) {
      for (const tab of this.tabInstances_.values()) if (tab.dom?.parentElement?.id === 'canvas-content') park.append(tab.dom);
    }
    // Render tab content
    this.renderTabContent_(tabId);
    if (immersiveCampaign && park) {
      const host = this.dom_?.querySelector('#canvas-content');
      for (const tab of this.tabInstances_.values()) if (tab.dom?.parentElement === park && tab.dom.style.display !== 'none') host?.append(tab.dom);
    }
    const field = PhysicalPlantService.plantOrNull() !== null;
    const ham = HamStationService.getInstance()?.manager;
    const computer =
      (field && (tabId === 'field-service' || tabId === 'field-workload' || tabId.startsWith(STATION_TAB_PREFIX))) ||
      (!!ham && (tabId === 'sdr-console' || tabId === 'pass-schedule'));
    const paper = field && ['field-power', 'field-path', 'field-handover', 'field-records'].includes(tabId);
    if (computer || paper) {
      const content = this.dom_?.querySelector<HTMLElement>('#canvas-content');
      if (!content) return;
      let frame: ((content: HTMLElement, leave: HTMLButtonElement) => { element: HTMLElement; dispose: () => void }) | undefined;
      const radioSource = tabId === 'field-service' && ['pilot-report', 'endpoint-report'].includes(SiteTab.source);
      if (computer && field && !radioSource) {
        const apps: LaptopApp[] = [
          { id: 'netprobe', label: 'NetProbe', icon: 'probe', open: () => SiteTab.openSource('local-probe') },
          { id: 'browser', label: 'Browser', icon: 'browser', open: () => SiteTab.openSource('provider-portal') },
        ];
        for (const link of this.dom_!.querySelectorAll<HTMLElement>(`[data-tab-id^="${STATION_TAB_PREFIX}"]`)) {
          const label = link.textContent?.trim() ?? 'Terminal';
          apps.push({ id: link.dataset.tabId!, label, icon: /skylink/iu.test(label) ? 'dish' : 'modem', open: () => this.requestTab_(link.dataset.tabId!) });
        }
        if (SiteTab.availableWorkspaces().some((t) => t.id === 'field-workload'))
          apps.push({ id: 'field-workload', label: 'MissionRunner', icon: 'apps', open: () => this.requestTab_('field-workload') });
        const activeId = tabId === 'field-service' ? (SiteTab.source === 'provider-portal' ? 'browser' : 'netprobe') : tabId;
        const showDesktop = SiteTab.takeDesktopRequest();
        frame = (inner, leave) => {
          const shell = new LaptopShell(inner, leave, { apps, activeId, showDesktop });
          return { element: shell.element, dispose: () => shell.dispose() };
        };
      }
      if (computer && ham) {
        // The bench laptop: the receiver program and the pass planner are its applications
        const apps: LaptopApp[] = [{ id: 'sdr-console', label: 'SkyWatcher SDR', icon: 'probe', open: () => this.requestTab_('sdr-console') }];
        if (this.dom_?.querySelector('[data-tab-id="pass-schedule"]'))
          apps.push({ id: 'pass-schedule', label: 'Observations', icon: 'dish', open: () => this.requestTab_('pass-schedule') });
        frame = (inner, leave) => {
          const shell = new LaptopShell(inner, leave, { apps, activeId: tabId, showDesktop: false, brand: 'BENCHMATE 14' });
          return { element: shell.element, dispose: () => shell.dispose() };
        };
      }
      const radio = radioSource;
      // Dialog history is the call-log pad's second page (Conversations), so the held radio has no nav strip
      if (paper) {
        const offered = new Set(SiteTab.availableWorkspaces().map((item) => item.id));
        if (tabId === 'field-handover' || tabId === 'field-records') {
          // The handover form and the equipment log are sheets on the clipboard
          const pages = clipboardPages(
            offered,
            SiteTab.missionAvailable,
            () => {
              this.requestTab_('site');
              SiteTab.openClipboard();
            },
            SiteTab.unreadNotices
          );
          frame = (inner, leave) => {
            const shell = new ClipboardShell(inner, leave, { pages, activeId: tabId });
            return { element: shell.element, dispose: () => shell.dispose() };
          };
        } else {
          // The wiring diagram (laminate) and the power plan (graph paper) are the two documents held
          const docs = FIELD_KIT.find((item) => item.id === 'documents');
          const pages: DocumentsPage[] = offeredSheets(docs!, offered, SiteTab.missionAvailable)
            .filter((sheet): sheet is KitSheet & { tabId: string } => 'tabId' in sheet)
            .map((sheet) => ({ id: sheet.tabId, label: sheet.label, open: () => SiteTab.openSheet(sheet) }));
          frame = (inner, leave) => {
            const shell = new DocumentsShell(inner, leave, { pages, activeId: tabId });
            return { element: shell.element, dispose: () => shell.dispose() };
          };
        }
      }
      this.immersive_.open(
        content,
        paper ? 'Field documents' : radio ? 'Field radio' : 'Laptop',
        paper ? 'paper' : radio ? 'equipment' : frame ? 'laptop' : 'computer',
        () => this.requestTab_(field ? 'site' : 'ham-station'),
        undefined,
        frame
      );
    }
  }

  /**
   * Render content for the selected tab
   */
  private renderTabContent_(tabId: string): void {
    // The persistent map embed sits outside #canvas-content; park it before the
    // content is rewritten. GroundTrackTab.activate() brings it back.
    KeepTrackEmbedHost.getInstance().hide();
    const content = qs('#canvas-content', this.dom_);
    revealPanel(content);

    // Deactivate all existing tabs
    this.tabInstances_.forEach((tab) => tab.deactivate());

    if (tabId.startsWith('field-') && SiteTab.availableWorkspaces().some((tab) => tab.id === tabId)) {
      this.renderSiteTab_(tabId);
      return;
    }

    // Handle dynamic acu-control-N tabs
    if (tabId.startsWith('acu-control-')) {
      const antennaIndex = parseInt(tabId.split('-')[2], 10);
      this.renderACUControlTab_(content, antennaIndex);
      return;
    }

    const stationTab = AntennaPageRegistry.getInstance().stationTabByTabId(tabId);
    if (stationTab) {
      this.renderStationTab_(tabId, stationTab.factory);

      return;
    }

    switch (tabId) {
      case 'dashboard':
        this.renderDashboardTab_(content);
        break;

      case 'rx-analysis':
        this.renderRxAnalysisTab_(content);
        break;

      case 'tx-chain':
        this.renderTxChainTab_(content);
        break;

      case 'gps-timing':
        this.renderGPSTimingTab_(content);
        break;

      case 'pass-schedule':
        this.renderPassScheduleTab_();
        break;

      case 'geolocation':
        this.renderGeolocationTab_();
        break;

      case 'ea-assessment':
        this.renderEaAssessmentTab_();
        break;

      case 'link-budget':
        this.renderLinkBudgetTab_(content);
        break;

      case 'commanding':
        this.renderCommandingTab_();
        break;

      case 'contact-schedule':
        this.renderContactScheduleTab_();
        break;

      case 'security-console':
        this.renderSecurityConsoleTab_();
        break;

      case 'site':
        this.renderSiteTab_();
        break;

      case 'telemetry':
        this.renderTelemetryTab_();
        break;

      case 'sdr-console':
        this.renderSdrConsoleTab_(content);
        break;

      case 'ham-station':
        this.renderHamStationTab_(content);
        break;

      case 'mission-overview':
        this.renderMissionOverviewTab_();
        break;

      case 'sat-dashboard':
        this.renderSatelliteDashboardTab_(content);
        break;

      case 'ground-track':
        this.renderGroundTrackTab_();
        break;

      default:
        content.innerHTML = html`
          <div class="tab-content-placeholder">
            <h3>Unknown Tab</h3>
            <p>This tab is not yet implemented.</p>
          </div>
        `;
    }
  }

  /**
   * Render Dashboard tab
   */
  private renderDashboardTab_(content: HTMLElement): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      content.innerHTML = html`
        <div class="tab-content-placeholder">
          <h3>Error</h3>
          <p>Ground station not found.</p>
        </div>
      `;
      return;
    }

    // Check if tab instance already exists and its DOM is still attached
    const tabKey = `dashboard-${this.selectedAssetId_}`;
    let dashTab = this.tabInstances_.get(tabKey) as DashboardTab;

    if (dashTab && !document.contains(dashTab.dom)) {
      // DOM was destroyed (e.g., by switching to a placeholder tab), recreate
      dashTab.dispose();
      this.tabInstances_.delete(tabKey);
      dashTab = null!;
    }

    if (!dashTab) {
      // Create new tab instance
      dashTab = new DashboardTab(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, dashTab);
    }

    // Activate the tab
    dashTab.activate();
  }

  /**
   * Render ACU Control tab for a specific antenna
   * @param content - The content container element
   * @param antennaIndex - Index of the antenna to control (default 0)
   */
  private renderACUControlTab_(content: HTMLElement, antennaIndex: number = 0): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      content.innerHTML = html`
        <div class="tab-content-placeholder">
          <h3>Error</h3>
          <p>Ground station not found.</p>
        </div>
      `;
      return;
    }

    // Check if tab instance already exists and its DOM is still attached
    const tabKey = `acu-control-${this.selectedAssetId_}-ant${antennaIndex}`;
    let acuTab = this.tabInstances_.get(tabKey) as ACUControlTab | AntennaPage;

    if (acuTab && !document.contains(acuTab.dom)) {
      // DOM was destroyed (e.g., by switching to a placeholder tab), recreate
      acuTab.dispose();
      this.tabInstances_.delete(tabKey);
      acuTab = null!;
    }

    if (!acuTab) {
      // Create new tab instance with antenna index
      const customFactory = AntennaPageRegistry.getInstance().get(groundStation.antennas[antennaIndex]?.config.kind);
      acuTab = customFactory ? customFactory(groundStation, 'canvas-content', antennaIndex) : new ACUControlTab(groundStation, 'canvas-content', antennaIndex);
      this.tabInstances_.set(tabKey, acuTab);
    }

    // Activate the tab
    acuTab.activate();
  }

  /** Render a plugin-registered station tab; same lifecycle as a custom antenna page. */
  private renderStationTab_(tabId: string, factory: StationTabFactory): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      return;
    }

    const tabKey = `${tabId}-${this.selectedAssetId_}`;
    let page = this.tabInstances_.get(tabKey) as AntennaPage | undefined;

    if (page && !document.contains(page.dom)) {
      // DOM was destroyed (e.g., by switching to a placeholder tab), recreate
      page.dispose();
      this.tabInstances_.delete(tabKey);
      page = undefined;
    }

    if (!page) {
      page = factory(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, page);
    }

    page.activate();
  }

  /**
   * Render RX Analysis tab (Phase 5)
   */
  private renderRxAnalysisTab_(content: HTMLElement): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      content.innerHTML = html`
        <div class="tab-content-placeholder">
          <h3>Error</h3>
          <p>Ground station not found.</p>
        </div>
      `;
      return;
    }

    // Check if tab instance already exists and its DOM is still attached
    const tabKey = `rx-analysis-${this.selectedAssetId_}`;
    let rxTab = this.tabInstances_.get(tabKey) as RxAnalysisTab;

    if (rxTab && !document.contains(rxTab.dom)) {
      // DOM was destroyed (e.g., by switching to a placeholder tab), recreate
      rxTab.dispose();
      this.tabInstances_.delete(tabKey);
      rxTab = null!;
    }

    if (!rxTab) {
      // Create new tab instance
      rxTab = new RxAnalysisTab(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, rxTab);
    }

    // Activate the tab
    rxTab.activate();
  }

  /**
   * Render TX Chain tab (Phase 6)
   */
  private renderTxChainTab_(content: HTMLElement): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      content.innerHTML = html`
        <div class="tab-content-placeholder">
          <h3>Error</h3>
          <p>Ground station not found.</p>
        </div>
      `;
      return;
    }

    // Check if tab instance already exists and its DOM is still attached
    const tabKey = `tx-chain-${this.selectedAssetId_}`;
    let txTab = this.tabInstances_.get(tabKey) as TxChainTab;

    if (txTab && !document.contains(txTab.dom)) {
      // DOM was destroyed (e.g., by switching to a placeholder tab), recreate
      txTab.dispose();
      this.tabInstances_.delete(tabKey);
      txTab = null!;
    }

    if (!txTab) {
      // Create new tab instance
      txTab = new TxChainTab(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, txTab);
    }

    // Activate the tab
    txTab.activate();
  }

  /**
   * Render GPS Timing tab (Phase 7)
   */
  private renderGPSTimingTab_(content: HTMLElement): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      content.innerHTML = html`
        <div class="tab-content-placeholder">
          <h3>Error</h3>
          <p>Ground station not found.</p>
        </div>
      `;
      return;
    }

    // Check if tab instance already exists and its DOM is still attached
    const tabKey = `gps-timing-${this.selectedAssetId_}`;
    let gpsTab = this.tabInstances_.get(tabKey) as GPSTimingTab;

    if (gpsTab && !document.contains(gpsTab.dom)) {
      // DOM was destroyed (e.g., by switching to a placeholder tab), recreate
      gpsTab.dispose();
      this.tabInstances_.delete(tabKey);
      gpsTab = null!;
    }

    if (!gpsTab) {
      // Create new tab instance
      gpsTab = new GPSTimingTab(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, gpsTab);
    }

    // Activate the tab
    gpsTab.activate();
  }

  /**
   * Render Pass Schedule tab (Campaign 2+ orbital satellites)
   */
  private renderPassScheduleTab_(): void {
    const tabKey = 'pass-schedule';
    let passTab = this.tabInstances_.get(tabKey) as PassScheduleTab;

    if (passTab && !document.contains(passTab.dom)) {
      passTab.dispose();
      this.tabInstances_.delete(tabKey);
      passTab = null!;
    }

    if (!passTab) {
      passTab = new PassScheduleTab('canvas-content');
      this.tabInstances_.set(tabKey, passTab);
    }

    passTab.activate();
  }

  /**
   * Render Geolocation tab (Campaign 5 interference geolocation console)
   */
  private renderGeolocationTab_(): void {
    const tabKey = 'geolocation';
    let geoTab = this.tabInstances_.get(tabKey) as GeolocationTab;

    if (geoTab && !document.contains(geoTab.dom)) {
      geoTab.dispose();
      this.tabInstances_.delete(tabKey);
      geoTab = null!;
    }

    if (!geoTab) {
      geoTab = new GeolocationTab('canvas-content');
      this.tabInstances_.set(tabKey, geoTab);
    }

    geoTab.activate();
  }

  /**
   * Render the Ground Track tab (2D world map).
   *
   * One component, two placements: keyed per focused satellite when opened
   * from the satellite tab set, and once as 'all' for the mission-overview
   * world map. Keying by focus means switching satellites builds a fresh map
   * centered on the new bird instead of reusing the previous one's view.
   */
  private renderGroundTrackTab_(): void {
    const satellite = this.selectedSatellite_();
    const focus = satellite instanceof OrbitalSatellite ? satellite : undefined;

    const tabKey = `ground-track-${focus?.noradId ?? 'all'}`;
    let gtTab = this.tabInstances_.get(tabKey) as GroundTrackTab;

    if (gtTab && !document.contains(gtTab.dom)) {
      gtTab.dispose();
      this.tabInstances_.delete(tabKey);
      gtTab = null!;
    }

    if (!gtTab) {
      gtTab = new GroundTrackTab('canvas-content', focus);
      this.tabInstances_.set(tabKey, gtTab);
    }

    gtTab.activate();
  }

  /**
   * Render EA Assessment tab (Campaign 4 electronic-attack / denial BDA)
   */
  private renderEaAssessmentTab_(): void {
    const tabKey = 'ea-assessment';
    let eaTab = this.tabInstances_.get(tabKey) as EaAssessmentTab;

    if (eaTab && !document.contains(eaTab.dom)) {
      eaTab.dispose();
      this.tabInstances_.delete(tabKey);
      eaTab = null!;
    }

    if (!eaTab) {
      eaTab = new EaAssessmentTab('canvas-content');
      this.tabInstances_.set(tabKey, eaTab);
    }

    eaTab.activate();
  }

  /**
   * Render Link Budget tab (nats-eu M1 link planning console)
   */
  private renderLinkBudgetTab_(content: HTMLElement): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      content.innerHTML = html`
        <div class="tab-content-placeholder">
          <h3>Error</h3>
          <p>Ground station not found.</p>
        </div>
      `;
      return;
    }

    const tabKey = `link-budget-${this.selectedAssetId_}`;
    let lbTab = this.tabInstances_.get(tabKey) as LinkBudgetTab;

    if (lbTab && !document.contains(lbTab.dom)) {
      lbTab.dispose();
      this.tabInstances_.delete(tabKey);
      lbTab = null!;
    }

    if (!lbTab) {
      lbTab = new LinkBudgetTab(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, lbTab);
    }

    lbTab.activate();
  }

  /**
   * Render Commanding tab (nats-eu M2/M5 TT&C commanding console)
   */
  private renderCommandingTab_(): void {
    const tabKey = 'commanding';
    let cmdTab = this.tabInstances_.get(tabKey) as CommandingTab;

    if (cmdTab && !document.contains(cmdTab.dom)) {
      cmdTab.dispose();
      this.tabInstances_.delete(tabKey);
      cmdTab = null!;
    }

    if (!cmdTab) {
      cmdTab = new CommandingTab('canvas-content');
      this.tabInstances_.set(tabKey, cmdTab);
    }

    cmdTab.activate();
  }

  /**
   * Render Telemetry tab (phase 18 E spacecraft state of health)
   */
  private renderTelemetryTab_(): void {
    const tabKey = 'telemetry';
    let tlmTab = this.tabInstances_.get(tabKey) as TelemetryTab;

    if (tlmTab && !document.contains(tlmTab.dom)) {
      tlmTab.dispose();
      this.tabInstances_.delete(tabKey);
      tlmTab = null!;
    }

    if (!tlmTab) {
      tlmTab = new TelemetryTab('canvas-content');
      this.tabInstances_.set(tabKey, tlmTab);
    }

    tlmTab.activate();
  }

  /**
   * Render Contact Schedule tab (nats-eu M3 multi-station pass allocation)
   */
  private renderContactScheduleTab_(): void {
    const tabKey = 'contact-schedule';
    let csTab = this.tabInstances_.get(tabKey) as ContactScheduleTab;

    if (csTab && !document.contains(csTab.dom)) {
      csTab.dispose();
      this.tabInstances_.delete(tabKey);
      csTab = null!;
    }

    if (!csTab) {
      csTab = new ContactScheduleTab('canvas-content');
      this.tabInstances_.set(tabKey, csTab);
    }

    csTab.activate();
  }

  /**
   * Render Site tab (Phase 38.1 physical-layer sandbox)
   */
  private renderSiteTab_(workspace = 'site'): void {
    const tabKey = 'site';
    let siteTab = this.tabInstances_.get(tabKey) as SiteTab;

    if (siteTab && !document.contains(siteTab.dom)) {
      siteTab.dispose();
      this.tabInstances_.delete(tabKey);
      siteTab = null!;
    }

    if (!siteTab) {
      siteTab = new SiteTab('canvas-content', () => {
        this.requestTab_(this.notebookReturnTab_);
        this.dom_?.querySelector<HTMLElement>(`[data-tab-id="${this.notebookReturnTab_}"]`)?.focus({ preventScroll: true });
      });
      this.tabInstances_.set(tabKey, siteTab);
    }

    siteTab.showWorkspace(workspace);
    siteTab.activate();
  }

  /**
   * Render Security tab (nats-eu M6 SOC-lite console + M7 TRANSEC)
   */
  private renderSecurityConsoleTab_(): void {
    const tabKey = 'security-console';
    let secTab = this.tabInstances_.get(tabKey) as SecurityConsoleTab;

    if (secTab && !document.contains(secTab.dom)) {
      secTab.dispose();
      this.tabInstances_.delete(tabKey);
      secTab = null!;
    }

    if (!secTab) {
      secTab = new SecurityConsoleTab('canvas-content');
      this.tabInstances_.set(tabKey, secTab);
    }

    secTab.activate();
  }

  /**
   * Render SDR Console tab (Campaign 3+ backyard stations)
   */
  private renderSdrConsoleTab_(content: HTMLElement): void {
    const groundStation = SimulationManager.getInstance().groundStations.find((gs) => gs.state.id === this.selectedAssetId_);

    if (!groundStation) {
      content.innerHTML = html`
        <div class="tab-content-placeholder">
          <h3>Error</h3>
          <p>Ground station not found.</p>
        </div>
      `;
      return;
    }

    const tabKey = `sdr-console-${this.selectedAssetId_}`;
    let sdrTab = this.tabInstances_.get(tabKey) as SdrConsoleTab | HamSdrConsoleTab;

    if (sdrTab && !document.contains(sdrTab.dom)) {
      sdrTab.dispose();
      this.tabInstances_.delete(tabKey);
      sdrTab = null!;
    }

    if (!sdrTab) {
      const ham = HamStationService.getInstance();
      sdrTab = ham ? new HamSdrConsoleTab(ham.manager, 'canvas-content') : new SdrConsoleTab(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, sdrTab);
    }

    sdrTab.activate();
  }

  /**
   * Render the Station tab (Campaign 3 ham-sdr): hosts the headless HamStationManager
   */
  private renderHamStationTab_(content: HTMLElement): void {
    const service = HamStationService.getInstance();

    if (!service) {
      content.innerHTML = html`
        <div class="tab-content-placeholder">
          <h3>Error</h3>
          <p>Ham station is not running.</p>
        </div>
      `;
      return;
    }

    const tabKey = `ham-station-${this.selectedAssetId_}`;
    let stationTab = this.tabInstances_.get(tabKey) as HamStationTab;

    if (stationTab && !document.contains(stationTab.dom)) {
      stationTab.dispose();
      this.tabInstances_.delete(tabKey);
      stationTab = null!;
    }

    if (!stationTab) {
      stationTab = new HamStationTab(service.manager, 'canvas-content');
      this.tabInstances_.set(tabKey, stationTab);
    }

    stationTab.activate();
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.immersive_.close();
    // Remove event listeners first, so a late event cannot resurrect a tab
    // while we are tearing them down.
    const eventBus = EventBus.getInstance();

    eventBus.off(Events.ASSET_SELECTED, this.boundAssetSelected_);
    eventBus.off(Events.OBJECTIVE_OBSERVATION_PENDING, this.boundObservationPending_);
    eventBus.off(Events.SWITCH_TAB, this.boundSwitchTab_);
    eventBus.off(Events.MISSION_OVERVIEW_SELECTED, this.boundMissionOverviewSelected_);
    eventBus.off(Events.UPDATE, this.boundTentSync_);
    this.tentControl_?.dispose();
    this.tentControl_ = null;
    this.hud_?.dispose();
    this.hud_ = null;
    this.unsubscribeFieldPolicy_?.();
    this.unsubscribeFieldPolicy_ = null;

    // Dispose all tab instances. Their dispose() releases resources the
    // EventBus teardown cannot (canvas pointer handlers, detached DOM).
    this.tabInstances_.forEach((tab) => tab.dispose());
    this.tabInstances_.clear();
    this.lastTabByAsset_.clear();
    MissionOverviewTab.resetRememberedStation();

    // A destroyed canvas must stop answering getActiveTab() for the
    // ObjectivesManager. Guarded so a replacement instance survives.
    if (TabbedCanvas.instance_ === this) {
      TabbedCanvas.instance_ = null;
    }
  }
}
