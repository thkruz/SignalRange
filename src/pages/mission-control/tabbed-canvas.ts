import downlinkPng from '@app/assets/icons/arrow-big-down-lines.png';
import uplinkPng from '@app/assets/icons/arrow-big-up-lines.png';
import dashboardPng from '@app/assets/icons/dashboard.png';
import gpsPng from '@app/assets/icons/gps.png';
import radarPng from '@app/assets/icons/radar.png';
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { SimulationManager } from "@app/simulation/simulation-manager";
import './tabbed-canvas.css';
import { ACUControlTab } from './tabs/acu-control-tab';
import { GPSTimingTab } from './tabs/gps-timing-tab';
import { RxAnalysisTab } from './tabs/rx-analysis-tab';
import { TxChainTab } from './tabs/tx-chain-tab';

/**
 * TabbedCanvas - Dynamic tabbed interface for ground station equipment
 *
 * Displays different tabs based on selected asset:
 * - Ground Station: ACU Control, RX Analysis, TX Chain, GPS Timing
 * - Satellite: Placeholder (Phase 8+)
 */
export class TabbedCanvas extends BaseElement {
  static readonly containerId = 'tabbed-canvas-container';

  private activeTab_: string = 'welcome';
  private selectedAssetId_: string | null = null;
  private readonly tabInstances_: Map<string, ACUControlTab | RxAnalysisTab | TxChainTab | GPSTimingTab> = new Map();

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
    this.init_(parentId, 'replace');
    this.dom_ = qs('.tabbed-canvas');
    this.renderWelcomeScreen_();
  }

  protected addEventListeners_(): void {
    // Listen for asset selection changes
    EventBus.getInstance().on(Events.ASSET_SELECTED, (data) => {
      this.handleAssetSelected_(data.type, data.id);
    });
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
      this.renderGroundStationTabs_();
    } else if (type === 'satellite') {
      this.renderSatellitePlaceholder_();
    }
  }

  /**
   * Render welcome screen (no asset selected)
   */
  private renderWelcomeScreen_(): void {
    const tabBar = qs('#tab-bar', this.dom_);
    const content = qs('#canvas-content', this.dom_);

    tabBar.innerHTML = '';
    content.innerHTML = html`
      <div class="welcome-screen">
        <div class="welcome-icon">🛰️</div>
        <h2>Welcome to Mission Control</h2>
        <p>Select a ground station from the asset tree to begin.</p>
      </div>
    `;
  }

  /**
   * Render tabs for ground station equipment
   */
  private renderGroundStationTabs_(): void {
    const groundStation = SimulationManager.getInstance().groundStations.find(
      gs => gs.state.id === this.selectedAssetId_
    );

    if (!groundStation) {
      console.error(`Ground station ${this.selectedAssetId_} not found`);
      return;
    }

    const tabs = [
      { id: 'dashboard', label: 'Dashboard', icon: dashboardPng },
      { id: 'acu-control', label: 'ACU Control', icon: radarPng, isDisabled: groundStation.state.isOperational === false },
      { id: 'rx-analysis', label: 'RX Analysis', icon: downlinkPng, isDisabled: groundStation.state.isOperational === false },
      { id: 'tx-chain', label: 'TX Chain', icon: uplinkPng, isDisabled: groundStation.state.isOperational === false },
      { id: 'gps-timing', label: 'GPS Timing', icon: gpsPng, isDisabled: groundStation.state.isOperational === false },
    ];

    this.renderTabs_(tabs);
    this.switchTab_('dashboard');
  }

  /**
   * Render satellite placeholder
   */
  private renderSatellitePlaceholder_(): void {
    const tabBar = qs('#tab-bar', this.dom_);
    const content = qs('#canvas-content', this.dom_);

    tabBar.innerHTML = html`
      <li class="nav-item" role="presentation">
        <a class="nav-link active" href="#" role="tab">
          <span class="tab-icon">🛰️</span>
          <span class="tab-label">Satellite Control</span>
        </a>
      </li>
    `;

    content.innerHTML = html`
      <div class="placeholder-screen">
        <div class="placeholder-icon">🚧</div>
        <h2>Satellite Control</h2>
        <p>Satellite control interface is not yet implemented.</p>
        <p class="placeholder-note">This feature is planned for Phase 8.</p>
      </div>
    `;
  }

  /**
   * Render tab bar using Bootstrap nav-tabs
   */
  private renderTabs_(tabs: Array<{ id: string; label: string; icon: string, isDisabled?: boolean }>): void {
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

    // Phase 4: ACU Control implemented
    // Phase 5+: Actual tab implementations for other tabs (RxAnalysisTab, etc.)
    switch (tabId) {
      case 'dashboard':
        content.innerHTML = html`
          <div class="tab-content-placeholder">
            <h3>Dashboard</h3>
            <p>Ground station overview and status will be displayed here.</p>
            <div class="placeholder-note">Coming in Phase 4+</div>
          </div>
        `;
        break;

      case 'acu-control':
        this.renderACUControlTab_(content);
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
   * Render ACU Control tab (Phase 4)
   */
  private renderACUControlTab_(content: HTMLElement): void {
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
    const tabKey = `acu-control-${this.selectedAssetId_}`;
    let acuTab = this.tabInstances_.get(tabKey) as ACUControlTab;

    if (acuTab && !document.contains(acuTab.dom)) {
      // DOM was destroyed (e.g., by switching to a placeholder tab), recreate
      acuTab.dispose();
      this.tabInstances_.delete(tabKey);
      acuTab = null!;
    }

    if (!acuTab) {
      // Create new tab instance
      acuTab = new ACUControlTab(groundStation, 'canvas-content');
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
   * Cleanup
   */
  public destroy(): void {
    // Dispose all tab instances
    this.tabInstances_.forEach(tab => tab.dispose());
    this.tabInstances_.clear();

    // Remove event listeners
    EventBus.getInstance().off(Events.ASSET_SELECTED, this.handleAssetSelected_.bind(this));
  }
}
