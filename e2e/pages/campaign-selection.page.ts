import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page object for the Campaign Selection page.
 * This is the root page where users select a campaign to play.
 */
export class CampaignSelectionPage extends BasePage {
  readonly url = '/';

  // Main elements
  readonly pageContainer: Locator;
  readonly pageTitle: Locator;
  readonly subtitle: Locator;
  readonly campaignGrid: Locator;
  readonly loginWarning: Locator;

  // Campaign cards
  readonly campaignCards: Locator;

  constructor(page: Page) {
    super(page);
    this.pageContainer = page.locator('#campaign-selection-page');
    this.pageTitle = page.locator('.campaign-selection-header h1');
    this.subtitle = page.locator('.campaign-selection-header .subtitle');
    this.campaignGrid = page.locator('.campaign-grid');
    this.loginWarning = page.locator('.login-warning');
    this.campaignCards = page.locator('.campaign-card');
  }

  protected async waitForPageLoad(): Promise<void> {
    await expect(this.pageContainer).toBeVisible();
    await expect(this.pageTitle).toBeVisible();
    await expect(this.campaignGrid).toBeVisible();
  }

  /**
   * Get a specific campaign card by its ID.
   */
  getCampaignCard(campaignId: string): Locator {
    return this.page.locator(`[data-campaign-id="${campaignId}"]`);
  }

  /**
   * Select a campaign by clicking on its card.
   * Waits for navigation to the scenario selection page.
   */
  async selectCampaign(campaignId: string): Promise<void> {
    const card = this.getCampaignCard(campaignId);
    await expect(card).toBeVisible();
    await expect(card).not.toHaveClass(/disabled/);
    await card.click();
    await this.page.waitForURL(`/campaigns/${campaignId}`);
  }

  /**
   * Get the count of available (non-disabled) campaigns.
   */
  async getAvailableCampaignCount(): Promise<number> {
    return this.campaignCards.filter({ hasNot: this.page.locator('.disabled') }).count();
  }

  /**
   * Check if a campaign is locked.
   */
  async isCampaignLocked(campaignId: string): Promise<boolean> {
    const card = this.getCampaignCard(campaignId);
    const lockedBanner = card.locator('.locked-banner');
    return lockedBanner.isVisible();
  }

  /**
   * Check if a campaign is completed.
   */
  async isCampaignCompleted(campaignId: string): Promise<boolean> {
    const card = this.getCampaignCard(campaignId);
    const completedBanner = card.locator('.completed-banner');
    return completedBanner.isVisible();
  }

  /**
   * Check if the login warning is visible.
   */
  async isLoginWarningVisible(): Promise<boolean> {
    const display = await this.loginWarning.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }
}
