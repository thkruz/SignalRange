import { CampaignManager } from "@app/campaigns/campaign-manager";
import { CampaignData } from "@app/campaigns/campaign-types";
import { qs } from "@app/engine/utils/query-selector";
import { Logger } from "@app/logging/logger";
import { Router } from "@app/router";
import { sandboxData } from "@app/scenarios/sandbox";
import { getUserDataService } from "@app/user-account/user-data-service";
import { getAssetUrl } from "@app/utils/asset-url";
import { html } from "../engine/utils/development/formatter";
import { BasePage } from "./base-page";
import "./campaign-selection.css";

/**
 * Campaign selection page implementation
 * Displays available campaigns and the sandbox option
 */
export class CampaignSelectionPage extends BasePage {
  id = 'campaign-selection-page';
  private static instance_: CampaignSelectionPage;
  private completedScenarioIds_: string[] = [];
  private dataLoaded_ = false;
  private hasShown_ = false;

  private constructor() {
    super();
    // Initialize the page immediately so it can be shown
    this.init_('body-content-container', 'add');
  }

  static getInstance(): CampaignSelectionPage {
    if (!this.instance_) {
      this.instance_ = new CampaignSelectionPage();
      // Start loading user data after instance is created
      this.instance_.startLoadingUserData_();
    }

    return this.instance_;
  }

  /**
   * Start loading user data in the background
   */
  private startLoadingUserData_(): void {
    if (this.dataLoaded_) return;
    this.dataLoaded_ = true;

    // Load user progress asynchronously and update the UI when ready
    this.loadUserDataAndUpdate_().catch(error => {
      Logger.error('Failed to initialize user data loading:', error);
    });
  }

  /**
   * Load user progress and update the UI
   */
  private async loadUserDataAndUpdate_(): Promise<void> {
    try {
      // Wait for auth to be initialized before trying to load user data
      const { App } = await import('../app');
      await App.authReady;

      const userDataService = getUserDataService();
      const progress = await userDataService.getUserProgress().catch(() => null);

      // Load completed scenarios - convert scenario numbers to IDs
      const completedScenarioNumbers = progress?.completedScenarios ?? [];
      const campaignManager = CampaignManager.getInstance();
      const allScenarios = campaignManager.getAllScenarios();

      this.completedScenarioIds_ = completedScenarioNumbers
        .map(num => allScenarios.find(s => s.number === num)?.id)
        .filter(Boolean);

      // Re-render the campaign grid with progress data
      this.updateCampaignCards_();
    } catch (error) {
      Logger.error('Failed to load user progress:', error);
      // Continue without progress info - user may not be authenticated
    }
  }

  /**
   * Update the campaign cards in the DOM with current progress data
   */
  private updateCampaignCards_(): void {
    const campaignGrid = qs('.campaign-grid', this.dom_);
    if (!campaignGrid) return;

    const campaignManager = CampaignManager.getInstance();
    const campaigns = campaignManager.getAllCampaigns();
    const completedCampaignIds = campaignManager.getCompletedCampaigns(this.completedScenarioIds_);

    // Re-render all campaign cards with updated progress data
    campaignGrid.innerHTML = [
      ...campaigns.map(campaign => this.renderCampaignCard_(campaign, completedCampaignIds)),
      this.renderSandboxCard_()
    ].join('');

    // Re-attach event listeners for the new cards
    this.attachCampaignCardListeners_();
  }

  /**
   * Attach event listeners to campaign cards
   */
  private attachCampaignCardListeners_(): void {
    const campaignCards = this.dom_.querySelectorAll('.campaign-card:not(.disabled)');
    campaignCards.forEach(card => {
      card.addEventListener('click', this.handleCampaignClick_.bind(this));
    });
  }

  protected html_ = html`
    <div id="${this.id}" class="campaign-selection-page">
      <div class="campaign-selection-header">
        <h1>Signal Range Training</h1>
        <div class="subtitle">Select a campaign to begin your training</div>
      </div>

      <div class="campaign-grid">
        ${this.renderInitialCards_()}
      </div>
    </div>
  `;

  /**
   * Render initial cards (before user data is loaded)
   */
  private renderInitialCards_(): string {
    const campaignManager = CampaignManager.getInstance();
    const campaigns = campaignManager.getAllCampaigns();

    return [
      ...campaigns.map(campaign => this.renderCampaignCard_(campaign, [])),
      this.renderSandboxCard_()
    ].join('');
  }

  /**
   * Render a single campaign card
   */
  private renderCampaignCard_(campaign: CampaignData, completedCampaignIds: string[]): string {
    const campaignManager = CampaignManager.getInstance();
    const progress = campaignManager.getCampaignProgress(campaign.id, this.completedScenarioIds_);
    const isLocked = campaignManager.isCampaignLocked(campaign, completedCampaignIds);
    const isDisabledOrLocked = campaign.isDisabled || isLocked;
    const isCompleted = progress.isCompleted;

    let statusBanner = '';
    if (campaign.isDisabled) {
      statusBanner = `
        <div class="coming-soon-banner">Coming Soon</div>
      `;
    } else if (isLocked) {
      statusBanner = `
        <div class="locked-banner" title="Complete prerequisite campaigns to unlock">
          <div>
            <span class="locked-icon">🔒</span> Locked
          </div>
        </div>
      `;
    }

    let progressBanner = '';
    if (isCompleted && !isDisabledOrLocked) {
      progressBanner = `
        <div class="completed-banner">
          <span class="completed-icon">🏆</span>
          Campaign Completed
        </div>
      `;
    } else if (progress.completionPercentage > 0 && !isDisabledOrLocked) {
      progressBanner = `
        <div class="progress-banner">
          <span class="progress-icon">📊</span>
          ${progress.completionPercentage}% Complete (${progress.completedScenarios.length}/${progress.totalScenarios})
        </div>
      `;
    }

    return html`
      <div class="campaign-card ${isDisabledOrLocked ? 'disabled' : ''}" data-campaign-id="${campaign.id}">
        ${statusBanner}
        ${progressBanner}
        <div class="campaign-card-inner">
          <div class="campaign-card-header">
            <div class="campaign-badges">
              <span class="badge duration">${campaign.totalDuration}</span>
              <span class="badge difficulty-${campaign.difficulty}">${campaign.difficulty}</span>
            </div>
          </div>

          <div class="campaign-image">
            <img src="${getAssetUrl('/assets/campaigns/' + campaign.imageUrl)}" alt="${campaign.title}"/>
            <div class="campaign-image-overlay">
              <h2 class="campaign-title">${campaign.title}</h2>
              <div class="campaign-subtitle">${campaign.subtitle}</div>
            </div>
          </div>

          <div class="campaign-card-body">
            <p class="campaign-description">${campaign.description}</p>

            <div class="campaign-info">
              <div class="campaign-info-item">
                <div class="info-label">Scenarios</div>
                <div class="info-value">${campaign.scenarios.length}</div>
              </div>
              <div class="campaign-info-item">
                <div class="info-label">Type</div>
                <div class="info-value">${campaign.campaignType}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render the sandbox card (special case)
   */
  private renderSandboxCard_(): string {
    return html`
      <div class="campaign-card sandbox-card" data-campaign-id="sandbox" data-scenario-url="${sandboxData.url}">
        <div class="campaign-card-inner">
          <div class="campaign-card-header">
            <div class="campaign-badges">
              <span class="badge special">Sandbox</span>
            </div>
          </div>

          <div class="campaign-image">
            <img src="${getAssetUrl('/assets/campaigns/sandbox/' + sandboxData.imageUrl)}" alt="${sandboxData.title}"/>
            <div class="campaign-image-overlay">
              <h2 class="campaign-title">${sandboxData.title}</h2>
              <div class="campaign-subtitle">${sandboxData.subtitle}</div>
            </div>
          </div>

          <div class="campaign-card-body">
            <p class="campaign-description">${sandboxData.description}</p>

            <div class="campaign-info">
              <div class="campaign-info-item">
                <div class="info-label">Mode</div>
                <div class="info-value">Free Play</div>
              </div>
            </div>
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

    // Only refresh on subsequent shows (after initial load)
    // to reflect any completion updates from playing scenarios
    if (this.hasShown_) {
      this.loadUserDataAndUpdate_().catch(error => {
        Logger.error('Failed to refresh campaign data:', error);
      });
    }
    this.hasShown_ = true;
  }

  protected addEventListeners_(): void {
    this.attachCampaignCardListeners_();
  }

  /**
   * Handle campaign card click
   */
  private handleCampaignClick_(event: Event): void {
    const card = (event.currentTarget as HTMLElement).closest('.campaign-card') as HTMLElement;
    if (!card) return;

    const campaignId = card.dataset.campaignId;
    const scenarioUrl = card.dataset.scenarioUrl; // For sandbox

    if (campaignId === 'sandbox' && scenarioUrl) {
      // Navigate directly to sandbox
      Router.getInstance().navigate(scenarioUrl);
    } else if (campaignId) {
      // Navigate to campaign's scenario selection page
      Router.getInstance().navigate(`campaigns/${campaignId}`);
    }
  }
}
