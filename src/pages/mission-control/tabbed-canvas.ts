import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { ACUControlTab } from './tabs/acu-control-tab';
import './tabbed-canvas.css';

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
  private tabInstances_: Map<string, ACUControlTab> = new Map();

  protected html_ = html`
    <div class="tabbed-canvas">
      <div class="canvas-header">
        <div id="tab-bar" class="tab-bar"></div>
      </div>
      <div id="canvas-content" class="canvas-content"></div>
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
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'acu-control', label: 'ACU Control', icon: '📡' },
      { id: 'rx-analysis', label: 'RX Analysis', icon: '📥' },
      { id: 'tx-chain', label: 'TX Chain', icon: '📤' },
      { id: 'gps-timing', label: 'GPS Timing', icon: '🛰️' },
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
      <div class="tab tab-active">
        <span class="tab-icon">🛰️</span>
        <span class="tab-label">Satellite Control</span>
      </div>
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
   * Render tab bar
   */
  private renderTabs_(tabs: Array<{ id: string; label: string; icon: string }>): void {
    const tabBar = qs('#tab-bar', this.dom_);

    tabBar.innerHTML = tabs.map(tab => html`
      <div class="tab ${tab.id === this.activeTab_ ? 'tab-active' : ''}"
           data-tab-id="${tab.id}">
        <span class="tab-icon">${tab.icon}</span>
        <span class="tab-label">${tab.label}</span>
      </div>
    `).join('');

    // Add click listeners
    tabBar.querySelectorAll('.tab').forEach(tabElement => {
      tabElement.addEventListener('click', () => {
        const tabId = tabElement.getAttribute('data-tab-id');
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

    // Update tab active state
    const tabBar = qs('#tab-bar', this.dom_);
    tabBar.querySelectorAll('.tab').forEach(tab => {
      if (tab.getAttribute('data-tab-id') === tabId) {
        tab.classList.add('tab-active');
      } else {
        tab.classList.remove('tab-active');
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
        content.innerHTML = html`
          <div class="tab-content-placeholder">
            <h3>RX Analysis</h3>
            <p>Receiver chain control with spectrum analyzer and signal analysis.</p>
            <div class="placeholder-note">Coming in Phase 5</div>
          </div>
        `;
        break;

      case 'tx-chain':
        content.innerHTML = html`
          <div class="tab-content-placeholder">
            <h3>TX Chain</h3>
            <p>Transmitter chain control with BUC and HPA management.</p>
            <div class="placeholder-note">Coming in Phase 6</div>
          </div>
        `;
        break;

      case 'gps-timing':
        content.innerHTML = html`
          <div class="tab-content-placeholder">
            <h3>GPS Timing</h3>
            <p>GPS Disciplined Oscillator (GPSDO) timing reference display.</p>
            <div class="placeholder-note">Coming in Phase 7</div>
          </div>
        `;
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

    // Check if tab instance already exists
    const tabKey = `acu-control-${this.selectedAssetId_}`;
    let acuTab = this.tabInstances_.get(tabKey);

    if (!acuTab) {
      // Create new tab instance
      acuTab = new ACUControlTab(groundStation, 'canvas-content');
      this.tabInstances_.set(tabKey, acuTab);
    }

    // Activate the tab
    acuTab.activate();
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
