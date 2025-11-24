import { CampaignManager } from "@app/campaigns/campaign-manager";
import { CampaignData } from "@app/campaigns/campaign-types";
import { ModalConfirm } from "@app/engine/ui/modal-confirm";
import { qs, qsa } from "@app/engine/utils/query-selector";
import { Logger } from "@app/logging/logger";
import { Router } from "@app/router";
import { getNextPrerequisiteScenario, getPrerequisiteScenarioNames, isScenarioLocked, SCENARIOS } from "@app/scenario-manager";
import { ScenarioData } from '@app/ScenarioData';
import { getUserDataService } from "@app/user-account/user-data-service";
import { getAssetUrl } from "@app/utils/asset-url";
import { html } from "../engine/utils/development/formatter";
import { BasePage } from "./base-page";
import "./scenario-selection.css";

/**
 * Scenario selection page implementation
 */
export class ScenarioSelectionPage extends BasePage {
  id = 'scenario-selection-page';
  private static instance_: ScenarioSelectionPage;
  private readonly scenarioCheckpoints_: Map<string, boolean> = new Map();
  private completedScenarioIds_: string[] = [];
  private checkpointsLoaded_ = false;
  private currentCampaignId_: string | null = null;
  private currentCampaign_: CampaignData | null = null;

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
   * Set the campaign to display scenarios for
   */
  setCampaign(campaignId: string | null): void {
    this.currentCampaignId_ = campaignId;
    if (campaignId) {
      const campaignManager = CampaignManager.getInstance();
      this.currentCampaign_ = campaignManager.getCampaign(campaignId) || null;
    } else {
      this.currentCampaign_ = null;
    }
    // Re-render with new campaign filter
    this.updateScenarioCards_();
  }

  /**
   * Get scenarios to display (filtered by campaign if set)
   */
  private getScenariosToDisplay_(): ScenarioData[] {
    if (this.currentCampaignId_ && this.currentCampaign_) {
      return this.currentCampaign_.scenarios;
    }
    // Fallback to all scenarios if no campaign is set
    return SCENARIOS;
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

      const progress = await userDataService.getUserProgress().catch(() => null);
      const signalForge = progress?.signalForge ?? [];

      // Build a map of scenario IDs that have checkpoints
      signalForge.forEach(checkpoint => {
        this.scenarioCheckpoints_.set(checkpoint.scenarioId, true);
      });

      // Load completed scenarios - convert scenario numbers to IDs
      const completedScenarioNumbers = progress?.completedScenarios ?? [];
      this.completedScenarioIds_ = completedScenarioNumbers
        .map(num => SCENARIOS.find(s => s.number === num)?.id)
        .filter(Boolean);

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

    const scenarios = this.getScenariosToDisplay_();

    // Re-render all scenario cards with updated checkpoint data
    scenarioGrid.innerHTML = scenarios.map(scenario => this.renderScenarioCard_(scenario)).join('');

    // Update header with campaign info
    this.updateHeader_();

    // Re-attach event listeners for the new cards
    this.attachScenarioCardListeners_();
  }

  /**
   * Update the page header with campaign context
   */
  private updateHeader_(): void {
    const headerEl = qs('.scenario-selection-header', this.dom_);
    if (!headerEl) return;

    if (this.currentCampaign_) {
      const campaignManager = CampaignManager.getInstance();
      const progress = campaignManager.getCampaignProgress(
        this.currentCampaign_.id,
        this.completedScenarioIds_
      );

      headerEl.innerHTML = html`
        <h1>${this.currentCampaign_.title}</h1>
        <div class="subtitle">${this.currentCampaign_.subtitle}</div>
        <div class="campaign-progress">
          ${progress.completedScenarios.length} of ${progress.totalScenarios} scenarios completed
          (${progress.completionPercentage}%)
        </div>
        <div class="back-button" onclick="window.history.back()">
          ← Back to Campaigns
        </div>
      `;
    } else {
      headerEl.innerHTML = html`
        <h1>Training Scenarios</h1>
        <div class="subtitle">Select a scenario to begin</div>
      `;
    }
  }

  /**
   * Attach event listeners to scenario cards and buttons
   */
  private attachScenarioCardListeners_(): void {
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

    // Add click handlers for Play Again buttons
    const playAgainButtons = qsa('.btn-play-again', this.dom_);
    playAgainButtons.forEach(btn => {
      btn.addEventListener('click', this.handlePlayAgain_.bind(this));
    });

    // Add click handlers for Play Again buttons
    const startButtons = qsa('.btn-start', this.dom_);
    startButtons.forEach(btn => {
      btn.addEventListener('click', this.handlePlayAgain_.bind(this));
    });
  }

  protected html_ = html`
    <div id="${this.id}" class="scenario-selection-page">
      <div class="scenario-selection-header">
        <h1>Training Scenarios</h1>
        <div class="subtitle">Select a scenario to begin</div>
      </div>

      <div class="scenario-grid">
        ${this.getScenariosToDisplay_().map(scenario => this.renderScenarioCard_(scenario)).join('')}
      </div>
    </div>
  `;

  private renderScenarioCard_(scenario: ScenarioData): string {
    const hasCheckpoint = this.scenarioCheckpoints_.get(scenario.id);
    const isLocked = isScenarioLocked(scenario, this.completedScenarioIds_);
    const prerequisiteNames = isLocked ? getPrerequisiteScenarioNames(scenario) : [];
    const isDisabledOrLocked = scenario.isDisabled || isLocked;
    const isCompleted = this.completedScenarioIds_.includes(scenario.id);

    let statusBanner = '';
    if (scenario.isDisabled) {
      statusBanner = `
        <div class="coming-soon-banner">Coming Soon</div>
      `;
    } else if (isLocked) {
      const nextPrereqScenario = getNextPrerequisiteScenario(scenario, this.completedScenarioIds_);
      statusBanner = `
        <div class="locked-banner" title="Complete ${prerequisiteNames.join(', ')} to unlock">
          <div>
            <span class="locked-icon">🔒</span> Locked
          </div>
          <div class="locked-requirement">
            ${nextPrereqScenario ? `<strong>${nextPrereqScenario.title}</strong> must be completed first to unlock this scenario.` : ''}
          </div>
        </div>
      `;
    }

    let actionButtons = '';
    if (!isDisabledOrLocked) {
      if (isCompleted) {
        actionButtons = `
          <div class="scenario-checkpoint-actions">
          <button type="button" class="btn-play-again" data-scenario-id="${scenario.id}" data-scenario-url="${scenario.url}">
            Play Again
          </button>
          </div>
        `;
      } else if (hasCheckpoint) {
        actionButtons = `
          <div class="scenario-checkpoint-actions">
          <button type="button" class="btn-continue" data-scenario-url="${scenario.url}">
            Continue from Checkpoint
          </button>
          <button type="button" class="btn-start-fresh" data-scenario-id="${scenario.id}" data-scenario-url="${scenario.url}">
            Start Fresh
          </button>
          </div>
        `;
      } else {
        actionButtons = `
          <div class="scenario-checkpoint-actions">
          <button type="button" class="btn-start" data-scenario-id="${scenario.id}" data-scenario-url="${scenario.url}">
            Start
          </button>
          </div>
        `;
      }
    }

    let progressBanner = '';
    if (isCompleted && !isDisabledOrLocked) {
      progressBanner = `
        <div class="completed-banner">
          <span class="completed-icon">🏆</span>
          Completed
        </div>
      `;
    } else if (hasCheckpoint && !isDisabledOrLocked) {
      progressBanner = `
        <div class="checkpoint-banner">
          <span class="checkpoint-icon">💾</span>
          Checkpoint Available
        </div>
      `;
    }

    return html`
      <div class="scenario-card ${isDisabledOrLocked ? 'disabled' : ''}" data-scenario-url="${scenario.url}" data-scenario-id="${scenario.id}" data-scenario="${scenario.title}">
      ${statusBanner}
      ${progressBanner}
      <div class="scenario-card-inner">
        <div class="scenario-card-header">
        <div class="scenario-number">Scenario ${scenario.number}</div>
        <div class="scenario-badges">
        <span class="badge duration">${scenario.duration}</span>
        <span class="badge difficulty-${scenario.difficulty}">${scenario.difficulty}</span>
        </div>
        </div>

        <div class="scenario-image">
        <img src="${getAssetUrl('/assets/campaigns/' + scenario.imageUrl)}" alt="${scenario.title} Image"/>
        <div class="scenario-image-overlay">
          <h2 class="scenario-title">${scenario.title}</h2>
          <div class="scenario-subtitle">${scenario.subtitle}</div>
        </div>
        </div>

        <div class="scenario-card-body">
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

        ${actionButtons}
        </div>
      </div>
      </div>
    `;
  }

  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const parentDom = super.initDom_(parentId, type);
    this.dom_ = qs(`#${this.id}`, parentDom);

    return parentDom;
  }

  show(): void {
    super.show();
    // Refresh scenario data when page is shown to reflect any completion updates
    this.loadCheckpointsAndUpdate_().catch(error => {
      Logger.error('Failed to refresh scenario data:', error);
    });
  }

  protected addEventListeners_(): void {
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

    // Add click handlers for Play Again buttons
    const playAgainButtons = qsa('.btn-play-again', this.dom_);
    playAgainButtons.forEach(btn => {
      btn.addEventListener('click', this.handlePlayAgain_.bind(this));
    });
  }

  /**
   * Handle Continue from Checkpoint button click
   */
  private handleContinueScenario_(event: Event): void {
    event.stopPropagation(); // Prevent card selection
    const button = event.currentTarget as HTMLElement;
    const scenarioUrl = button.dataset.scenarioUrl;

    if (scenarioUrl) {
      Router.getInstance().navigate(scenarioUrl, { continueFromCheckpoint: true });
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
    ModalConfirm.getInstance().open(
      async () => {
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
      },
      {
        title: 'Start Fresh?',
        message: '<p>Starting fresh will clear your saved checkpoint for this scenario. Your achievements will be preserved.</p><p>Are you sure you want to continue?</p>',
        confirmText: 'Start Fresh',
        cancelText: 'Cancel',
        isDestructive: true,
      }
    );
  }

  /**
   * Handle Play Again button click for completed scenarios
   */
  private handlePlayAgain_(event: Event): void {
    event.stopPropagation(); // Prevent card selection
    const button = event.currentTarget as HTMLElement;
    const scenarioUrl = button.dataset.scenarioUrl;

    if (scenarioUrl) {
      Router.getInstance().navigate(scenarioUrl);
    }
  }
}