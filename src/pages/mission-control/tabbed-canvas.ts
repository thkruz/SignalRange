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
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { ScenarioManager } from "@app/scenario-manager";
import { SimulationManager } from "@app/simulation/simulation-manager";
import './tabbed-canvas.css';
import { ACUControlTab } from '@app/pages/mission-control/tabs/acu-control-tab';
import { CommandingTab } from '@app/pages/mission-control/tabs/commanding-tab';
import { ContactScheduleTab } from '@app/pages/mission-control/tabs/contact-schedule-tab';
import { DashboardTab } from '@app/pages/mission-control/tabs/dashboard-tab';
import { EaAssessmentTab } from '@app/pages/mission-control/tabs/ea-assessment-tab';
import { GeolocationTab } from '@app/pages/mission-control/tabs/geolocation-tab';
import { GPSTimingTab } from '@app/pages/mission-control/tabs/gps-timing-tab';
import { GroundTrackTab } from '@app/pages/mission-control/tabs/ground-track-tab';
import { LinkBudgetTab } from '@app/pages/mission-control/tabs/link-budget-tab';
import { MissionOverviewTab } from '@app/pages/mission-control/tabs/mission-overview-tab';
import { PassScheduleTab } from '@app/pages/mission-control/tabs/pass-schedule-tab';
import { RxAnalysisTab } from '@app/pages/mission-control/tabs/rx-analysis-tab';
import { SatelliteDashboardTab } from '@app/pages/mission-control/tabs/satellite-dashboard-tab';
import { SdrConsoleTab } from '@app/pages/mission-control/tabs/sdr-console-tab';
import { SecurityConsoleTab } from '@app/pages/mission-control/tabs/security-console-tab';
import { TxChainTab } from '@app/pages/mission-control/tabs/tx-chain-tab';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';

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
  static readonly containerId = 'tabbed-canvas-container';
  private static instance_: TabbedCanvas | null = null;

  /**
   * Memory key for the mission overview, which has no asset id. Deliberately
   * not a valid ground-station or satellite id so it can never collide.
   */
  private static readonly OVERVIEW_KEY = '__overview__';

  private activeTab_: string = 'mission-overview';
  private selectedAssetId_: string | null = null;
  /**
   * Last tab the operator had open on each asset, keyed by asset id.
   * Reselecting an asset returns to where they left off instead of resetting
   * to its first tab, so switching between assets doesn't lose a workflow.
   */
  private readonly lastTabByAsset_: Map<string, string> = new Map();
  private readonly tabInstances_: Map<string, ACUControlTab | DashboardTab | RxAnalysisTab | TxChainTab | GPSTimingTab | SatelliteDashboardTab | MissionOverviewTab | PassScheduleTab | SdrConsoleTab | GeolocationTab | EaAssessmentTab | LinkBudgetTab | CommandingTab | ContactScheduleTab | SecurityConsoleTab | GroundTrackTab> = new Map();

  /**
   * Subscriptions are held as stable references because EventBus.off() matches
   * by function identity - re-binding or re-declaring at teardown removes
   * nothing and leaves the canvas listening after it is gone.
   */
  private readonly boundAssetSelected_ = (data: { type: 'ground-station' | 'satellite', id: string }): void => {
    this.handleAssetSelected_(data.type, data.id);
  };

  private readonly boundSwitchTab_ = (data: { tabId: string }): void => {
    this.switchTab_(data.tabId);
  };

  private readonly boundMissionOverviewSelected_ = (): void => {
    this.selectedAssetId_ = null;
    this.tabInstances_.forEach(tab => tab.dispose());
    this.tabInstances_.clear();
    this.showMissionOverview_();
  };

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
    this.showMissionOverview_();
  }

  /**
   * Get the currently active tab ID
   * Used by ObjectivesManager for tab-active condition evaluation
   */
  static getActiveTab(): string | null {
    return TabbedCanvas.instance_?.activeTab_ ?? null;
  }

  protected addEventListeners_(): void {
    const eventBus = EventBus.getInstance();

    // Listen for asset selection changes
    eventBus.on(Events.ASSET_SELECTED, this.boundAssetSelected_);

    // Listen for tab switch requests from other components (e.g., dashboard cards)
    eventBus.on(Events.SWITCH_TAB, this.boundSwitchTab_);

    // Listen for mission overview selection
    eventBus.on(Events.MISSION_OVERVIEW_SELECTED, this.boundMissionOverviewSelected_);
  }

  /**
   * Handle asset selection from the asset tree
   */
  private handleAssetSelected_(type: 'ground-station' | 'satellite', id: string): void {
    // Clean up old tabs when switching assets
    if (this.selectedAssetId_ !== id) {
      this.tabInstances_.forEach(tab => tab.dispose());
      this.tabInstances_.clear();
    }

    this.selectedAssetId_ = id;

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
    const match = tabs.find(tab => tab.id === remembered && !tab.isDisabled);

    return match?.id ?? defaultTabId;
  }

  /**
   * Show the mission overview (no asset selected): build its tab bar, then open
   * the remembered tab.
   */
  private showMissionOverview_(): void {
    const hasOrbitalSats = SimulationManager.getInstance().satellites.some(
      (sat) => sat instanceof OrbitalSatellite,
    );

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
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

    if (!groundStation) {
      console.error(`Ground station ${this.selectedAssetId_} not found`);
      return;
    }

    const hasOrbitalSats = SimulationManager.getInstance().satellites.some((sat) => sat instanceof OrbitalSatellite);

    // Backyard stations (Campaign 3+) are hobbyist SDR rigs: no ACU racks, no
    // professional RX/TX chains, no dashboard of links to those tabs. The SDR
    // Console (with its rotator panel) is the whole rig; Observations covers
    // planning. Absent stationClass renders the professional tab set as before.
    if (groundStation.state.stationClass === 'backyard') {
      const backyardTabs: TabDescriptor[] = [
        { id: 'sdr-console', label: 'SDR Console', icon: radarPng, isDisabled: groundStation.state.isOperational === false },
      ];
      if (hasOrbitalSats) {
        backyardTabs.push({ id: 'pass-schedule', label: 'Observations', icon: stopwatchPng, isDisabled: groundStation.state.isOperational === false });
      }
      this.renderTabs_(backyardTabs);
      this.switchTab_(this.resolveActiveTab_(backyardTabs, 'sdr-console'));
      return;
    }

    const tabs: TabDescriptor[] = [
      { id: 'dashboard', label: 'Dashboard', icon: dashboardPng },
    ];

    // Add one ACU tab per antenna with band/size label
    groundStation.antennas.forEach((antenna, index) => {
      const config = antenna.config;
      const label = groundStation.antennas.length === 1
        ? 'ACU Control'
        : `ACU: ${config.band}-Band ${config.diameter}m`;
      tabs.push({
        id: `acu-control-${index}`,
        label,
        icon: radarPng,
        isDisabled: groundStation.state.isOperational === false
      });
    });

    // Add remaining tabs
    tabs.push(
      { id: 'rx-analysis', label: 'RX Analysis', icon: downlinkPng, isDisabled: groundStation.state.isOperational === false },
      { id: 'tx-chain', label: 'TX Chain', icon: uplinkPng, isDisabled: groundStation.state.isOperational === false },
      { id: 'gps-timing', label: 'GPS Timing', icon: gpsPng, isDisabled: groundStation.state.isOperational === false },
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
    if (settings.security || settings.transec) {
      tabs.push({ id: 'security-console', label: 'Security', icon: activityPng, isDisabled: groundStation.state.isOperational === false });
    }

    this.renderTabs_(tabs);
    this.switchTab_(this.resolveActiveTab_(tabs, 'dashboard'));
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
    const satellite = this.selectedSatellite_();

    if (!satellite) {
      qs('#tab-bar', this.dom_).innerHTML = '';
      this.renderSatelliteNotFound_(qs('#canvas-content', this.dom_));
      return;
    }

    const tabs: TabDescriptor[] = [
      { id: 'sat-dashboard', label: 'Dashboard', icon: satellitePng },
    ];

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

    tabBar.innerHTML = tabs.map(tab => html`
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
    `).join('');

    // Add click listeners to nav-links
    tabBar.querySelectorAll('.nav-link').forEach((tabElement: HTMLElement) => {
      tabElement.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default link behavior
        const tabId = tabElement.dataset.tabId;
        if (tabId) {
          this.switchTab_(tabId);
        }
      });
    });
  }

  /**
   * Switch to a different tab
   */
  private switchTab_(tabId: string): void {
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

    // Render tab content
    this.renderTabContent_(tabId);
  }

  /**
   * Render content for the selected tab
   */
  private renderTabContent_(tabId: string): void {
    const content = qs('#canvas-content', this.dom_);

    // Deactivate all existing tabs
    this.tabInstances_.forEach(tab => tab.deactivate());

    // Handle dynamic acu-control-N tabs
    if (tabId.startsWith('acu-control-')) {
      const antennaIndex = parseInt(tabId.split('-')[2], 10);
      this.renderACUControlTab_(content, antennaIndex);
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

      case 'sdr-console':
        this.renderSdrConsoleTab_(content);
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
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

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
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

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
    let acuTab = this.tabInstances_.get(tabKey) as ACUControlTab;

    if (acuTab && !document.contains(acuTab.dom)) {
      // DOM was destroyed (e.g., by switching to a placeholder tab), recreate
      acuTab.dispose();
      this.tabInstances_.delete(tabKey);
      acuTab = null!;
    }

    if (!acuTab) {
      // Create new tab instance with antenna index
      acuTab = new ACUControlTab(groundStation, 'canvas-content', antennaIndex);
      this.tabInstances_.set(tabKey, acuTab);
    }

    // Activate the tab
    acuTab.activate();
  }

  /**
   * Render RX Analysis tab (Phase 5)
   */
  private renderRxAnalysisTab_(content: HTMLElement): void {
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

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
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

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
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

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
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

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
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

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
    let sdrTab = this.tabInstances_.get(tabKey) as SdrConsoleTab;

    if (sdrTab && !document.contains(sdrTab.dom)) {
      sdrTab.dispose();
      this.tabInstances_.delete(tabKey);
      sdrTab = null!;
    }

    if (!sdrTab) {
      sdrTab = new SdrConsoleTab(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, sdrTab);
    }

    sdrTab.activate();
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    // Remove event listeners first, so a late event cannot resurrect a tab
    // while we are tearing them down.
    const eventBus = EventBus.getInstance();

    eventBus.off(Events.ASSET_SELECTED, this.boundAssetSelected_);
    eventBus.off(Events.SWITCH_TAB, this.boundSwitchTab_);
    eventBus.off(Events.MISSION_OVERVIEW_SELECTED, this.boundMissionOverviewSelected_);

    // Dispose all tab instances. Their dispose() releases resources the
    // EventBus teardown cannot (canvas pointer handlers, detached DOM).
    this.tabInstances_.forEach(tab => tab.dispose());
    this.tabInstances_.clear();
    this.lastTabByAsset_.clear();

    // A destroyed canvas must stop answering getActiveTab() for the
    // ObjectivesManager. Guarded so a replacement instance survives.
    if (TabbedCanvas.instance_ === this) {
      TabbedCanvas.instance_ = null;
    }
  }
}
