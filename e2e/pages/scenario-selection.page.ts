import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page object for the Scenario Selection page.
 * Displays scenarios for a selected campaign.
 */
export class ScenarioSelectionPage extends BasePage {
  readonly url = /\/campaigns\/[^/]+$/;

  // Main elements
  readonly pageContainer: Locator;
  readonly pageTitle: Locator;
  readonly subtitle: Locator;
  readonly scenarioGrid: Locator;
  readonly backButton: Locator;
  readonly campaignProgress: Locator;

  // Scenario cards - use .scenario-card to avoid matching buttons inside
  readonly scenarioCards: Locator;

  constructor(page: Page) {
    super(page);
    this.pageContainer = page.locator('#scenario-selection-page');
    this.pageTitle = page.locator('.scenario-selection-header h1');
    this.subtitle = page.locator('.scenario-selection-header .subtitle');
    this.scenarioGrid = page.locator('.scenario-grid');
    this.backButton = page.locator('a.back-button');
    this.campaignProgress = page.locator('.campaign-progress');
    // Only match the card divs, not buttons inside them
    this.scenarioCards = page.locator('.scenario-card');
  }

  protected async waitForPageLoad(): Promise<void> {
    await expect(this.pageContainer).toBeVisible();
    await expect(this.pageTitle).toBeVisible();
    await expect(this.scenarioGrid).toBeVisible();
  }

  /**
   * Navigate directly to a campaign's scenario selection page.
   */
  async gotoCampaign(campaignId: string): Promise<void> {
    await this.page.goto(`/campaigns/${campaignId}`);
    await this.waitForPageLoad();
  }

  /**
   * Get a specific scenario card by its ID.
   * Uses .scenario-card prefix to avoid matching buttons with same data attribute.
   */
  getScenarioCard(scenarioId: string): Locator {
    return this.page.locator(`.scenario-card[data-scenario-id="${scenarioId}"]`);
  }

  /**
   * Start a scenario (for new scenarios without checkpoint).
   */
  async startScenario(scenarioId: string): Promise<void> {
    const card = this.getScenarioCard(scenarioId);
    const startButton = card.locator('.btn-start');
    await expect(startButton).toBeVisible();
    await startButton.click();
  }

  /**
   * Continue a scenario from checkpoint.
   */
  async continueScenario(scenarioId: string): Promise<void> {
    const card = this.getScenarioCard(scenarioId);
    const continueButton = card.locator('.btn-continue');
    await expect(continueButton).toBeVisible();
    await continueButton.click();
  }

  /**
   * Play a scenario again (for completed scenarios).
   */
  async playAgain(scenarioId: string): Promise<void> {
    const card = this.getScenarioCard(scenarioId);
    const playAgainButton = card.locator('.btn-play-again');
    await expect(playAgainButton).toBeVisible();
    await playAgainButton.click();
  }

  /**
   * Start fresh (restart level) for a scenario with checkpoint.
   */
  async startFresh(scenarioId: string): Promise<void> {
    const card = this.getScenarioCard(scenarioId);
    const startFreshButton = card.locator('.btn-start-fresh');
    await expect(startFreshButton).toBeVisible();
    await startFreshButton.click();
    // Handle confirmation modal
    const confirmModal = this.page.locator('.modal-confirm');
    await expect(confirmModal).toBeVisible();
    await confirmModal.locator('button:has-text("Start Fresh")').click();
  }

  /**
   * Check if a scenario is locked.
   */
  async isScenarioLocked(scenarioId: string): Promise<boolean> {
    const card = this.getScenarioCard(scenarioId);
    const lockedBanner = card.locator('.locked-banner');
    return lockedBanner.isVisible();
  }

  /**
   * Check if a scenario is completed.
   */
  async isScenarioCompleted(scenarioId: string): Promise<boolean> {
    const card = this.getScenarioCard(scenarioId);
    const completedBanner = card.locator('.completed-banner');
    return completedBanner.isVisible();
  }

  /**
   * Check if a scenario has a checkpoint.
   */
  async hasCheckpoint(scenarioId: string): Promise<boolean> {
    const card = this.getScenarioCard(scenarioId);
    const checkpointBanner = card.locator('.checkpoint-banner');
    return checkpointBanner.isVisible();
  }

  /**
   * Navigate back to campaign selection.
   */
  async goBackToCampaigns(): Promise<void> {
    await this.backButton.click();
    // Wait for navigation - the URL will be /campaigns/ with trailing slash
    await this.page.waitForURL(/\/campaigns\/?$/);
  }

  /**
   * Get scenario count for this campaign.
   */
  async getScenarioCount(): Promise<number> {
    return this.scenarioCards.count();
  }
}
