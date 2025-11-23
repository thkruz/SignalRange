import { qs, qsa } from "@app/engine/utils/query-selector";
import { Logger } from "@app/logging/logger";
import { Router } from "@app/router";
import { ScenarioData, SCENARIOS } from "@app/scenario-manager";
import { getUserDataService } from "@app/user-account/user-data-service";
import { html } from "../engine/utils/development/formatter";
import { BasePage } from "./base-page";
import "./scenario-selection.css";

/**
 * Scenario selection page implementation
 */
export class ScenarioSelectionPage extends BasePage {
  id = 'scenario-selection-page';
  private static instance_: ScenarioSelectionPage;
  private selectedScenario_: string | null = null;
  private readonly scenarioCheckpoints_: Map<string, boolean> = new Map();
  private checkpointsLoaded_ = false;

  private constructor() {
    super();
    // Initialize the page immediately so it can be shown
    this.init_('body-content-container', 'add');
  }

  static getInstance(): ScenarioSelectionPage {
    if (!this.instance_) {
      this.instance_ = new ScenarioSelectionPage();
      // Start loading checkpoints after instance is created
      this.instance_.startLoadingCheckpoints_();
    }

    return this.instance_;
  }

  /**
   * Start loading checkpoints in the background
   */
  private startLoadingCheckpoints_(): void {
    if (this.checkpointsLoaded_) return;
    this.checkpointsLoaded_ = true;

    // Load checkpoints asynchronously and update the UI when ready
    this.loadCheckpointsAndUpdate_().catch(error => {
      Logger.error('Failed to initialize checkpoint loading:', error);
    });
  }

  /**
   * Load checkpoint status and update the UI
   */
  private async loadCheckpointsAndUpdate_(): Promise<void> {
    try {
      // Wait for auth to be initialized before trying to load user data
      const { App } = await import('../app');
      await App.authReady;

      const userDataService = getUserDataService();

      const progress = await userDataService.getUserProgress();
      const signalForge = progress.signalForge || [];

      // Build a map of scenario IDs that have checkpoints
      signalForge.forEach(checkpoint => {
        this.scenarioCheckpoints_.set(checkpoint.scenarioId, true);
      });

      // Re-render the scenario grid with checkpoint data
      this.updateScenarioCards_();
    } catch (error) {
      Logger.error('Failed to load checkpoint status:', error);
      // Continue without checkpoint info - user may not be authenticated
    }
  }

  /**
   * Update the scenario cards in the DOM with current checkpoint data
   */
  private updateScenarioCards_(): void {
    const scenarioGrid = qs('.scenario-grid', this.dom_);
    if (!scenarioGrid) return;

    // Re-render all scenario cards with updated checkpoint data
    scenarioGrid.innerHTML = SCENARIOS.map(scenario => this.renderScenarioCard_(scenario)).join('');

    // Re-attach event listeners for the new cards
    this.attachScenarioCardListeners_();
  }

  /**
   * Attach event listeners to scenario cards and buttons
   */
  private attachScenarioCardListeners_(): void {
    // Add click handlers for scenario cards
    const cards = qsa('.scenario-card', this.dom_);
    cards.forEach(card => {
      card.addEventListener('click', this.handleScenarioCardClick_.bind(this));
    });

    // Add click handlers for Continue buttons
    const continueButtons = qsa('.btn-continue', this.dom_);
    continueButtons.forEach(btn => {
      btn.addEventListener('click', this.handleContinueScenario_.bind(this));
    });

    // Add click handlers for Start Fresh buttons
    const startFreshButtons = qsa('.btn-start-fresh', this.dom_);
    startFreshButtons.forEach(btn => {
      btn.addEventListener('click', this.handleStartFresh_.bind(this));
    });
  }

  protected html_ = html`
    <div id="${this.id}" class="scenario-selection-page">
      <div class="scenario-selection-header">
        <h1>Training Scenarios</h1>
        <div class="subtitle">Select a scenario to begin</div>
      </div>

      <div class="scenario-grid">
        ${SCENARIOS.map(scenario => this.renderScenarioCard_(scenario)).join('')}
      </div>

      <div class="scenario-actions">
        <button type="button" class="btn-back" id="btn-back">Back</button>
        <button type="button" class="btn-start-scenario" id="btn-start" disabled>
          Start Scenario
        </button>
      </div>
    </div>
  `;

  private renderScenarioCard_(scenario: ScenarioData): string {
    const hasCheckpoint = this.scenarioCheckpoints_.get(scenario.id);

    return html`
      <div class="scenario-card ${scenario.isDisabled ? 'disabled' : ''}" data-scenario-url="${scenario.url}" data-scenario-id="${scenario.id}" data-scenario="${scenario.title}">
      ${scenario.isDisabled ? `
        <div class="coming-soon-banner">Coming Soon</div>
      ` : ''}
      ${hasCheckpoint && !scenario.isDisabled ? `
        <div class="checkpoint-banner">
          <span class="checkpoint-icon">💾</span>
          Checkpoint Available
        </div>
      ` : ''}
        <div class="scenario-card-inner">
          <div class="scenario-card-header">
            <div class="scenario-number">Scenario ${scenario.number}</div>
            <div class="scenario-badges">
            <span class="badge duration">${scenario.duration}</span>
            <span class="badge difficulty-${scenario.difficulty}">${scenario.difficulty}</span>
            </div>
          </div>

          <div class="scenario-image">
            <img src="/images/scenarios/${scenario.imageUrl}" alt="${scenario.title} Image"/>
          </div>

          <div class="scenario-card-body">
            <h2 class="scenario-title">${scenario.title}</h2>
            <div class="scenario-subtitle">${scenario.subtitle}</div>
            <div class="scenario-mission-type">${scenario.missionType}</div>
            <p class="scenario-description">${scenario.description}</p>

            <div class="scenario-equipment">
            <div class="scenario-equipment-title">Equipment Configuration</div>
            <div class="equipment-list">
              ${scenario.equipment.map(item => `
              <div class="equipment-item">
                <div class="equipment-icon"></div>
                <span>${item}</span>
              </div>
              `).join('')}
            </div>
            </div>

            ${hasCheckpoint && !scenario.isDisabled ? `
              <div class="scenario-checkpoint-actions">
                <button type="button" class="btn-continue" data-scenario-url="${scenario.url}">
                  Continue from Checkpoint
                </button>
                <button type="button" class="btn-start-fresh" data-scenario-id="${scenario.id}" data-scenario-url="${scenario.url}">
                  Start Fresh
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const parentDom = super.initDom_(parentId, type);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.domCacehe_['btn-start'] = qs('#btn-start', parentDom);
    this.domCacehe_['btn-back'] = qs('#btn-back', parentDom);

    return parentDom;
  }

  protected addEventListeners_(): void {
    // Add click handlers for scenario cards
    const cards = qsa('.scenario-card', this.dom_);
    cards.forEach(card => {
      card.addEventListener('click', this.handleScenarioCardClick_.bind(this));
    });

    // Add click handlers for Continue buttons
    const continueButtons = qsa('.btn-continue', this.dom_);
    continueButtons.forEach(btn => {
      btn.addEventListener('click', this.handleContinueScenario_.bind(this));
    });

    // Add click handlers for Start Fresh buttons
    const startFreshButtons = qsa('.btn-start-fresh', this.dom_);
    startFreshButtons.forEach(btn => {
      btn.addEventListener('click', this.handleStartFresh_.bind(this));
    });

    // Add click handler for start button
    this.domCacehe_['btn-start'].addEventListener('click', this.handleStartScenario_.bind(this));

    // Add click handler for back button
    this.domCacehe_['btn-back'].addEventListener('click', this.handleBack_.bind(this));
  }

  private handleScenarioCardClick_(event: Event): void {
    const card = (event.currentTarget as HTMLElement);
    const scenarioUrl = card.dataset.scenarioUrl;

    if (!scenarioUrl || card.classList.contains('disabled')) return;

    // Remove selection from all cards
    const allCards = qsa('.scenario-card', this.dom_);
    allCards.forEach(c => c.classList.remove('selected'));

    // Add selection to clicked card
    card.classList.add('selected');
    this.selectedScenario_ = scenarioUrl;

    // Enable start button
    (this.domCacehe_['btn-start'] as HTMLButtonElement).disabled = false;
  }

  private handleStartScenario_(): void {
    if (!this.selectedScenario_) {
      return;
    }

    Router.getInstance().navigate(this.selectedScenario_);
  }

  private handleBack_(): void {
    Router.getInstance().navigate('/');
  }

  /**
   * Handle Continue from Checkpoint button click
   */
  private handleContinueScenario_(event: Event): void {
    event.stopPropagation(); // Prevent card selection
    const button = event.currentTarget as HTMLElement;
    const scenarioUrl = button.dataset.scenarioUrl;

    if (scenarioUrl) {
      Router.getInstance().navigate(scenarioUrl);
    }
  }

  /**
   * Handle Start Fresh button click
   */
  private async handleStartFresh_(event: Event): Promise<void> {
    event.stopPropagation(); // Prevent card selection
    const button = event.currentTarget as HTMLElement;
    const scenarioId = button.dataset.scenarioId;
    const scenarioUrl = button.dataset.scenarioUrl;

    if (!scenarioId || !scenarioUrl) {
      return;
    }

    // Show confirmation modal
    const confirmed = confirm(
      'Starting fresh will clear your saved checkpoint for this scenario. Your achievements will be preserved.\n\nAre you sure you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      // Clear the checkpoint
      const userDataService = getUserDataService();
      await userDataService.clearScenarioCheckpoint(scenarioId);

      Logger.info(`Checkpoint cleared for scenario: ${scenarioId}`);

      // Navigate to scenario
      Router.getInstance().navigate(scenarioUrl);
    } catch (error) {
      Logger.error('Failed to clear checkpoint:', error);
      alert('Failed to clear checkpoint. Please try again.');
    }
  }
}