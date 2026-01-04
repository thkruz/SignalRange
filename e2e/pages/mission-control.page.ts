import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page object for the Mission Control page.
 * This is the main simulation interface with equipment controls.
 */
export class MissionControlPage extends BasePage {
  readonly url = /\/campaigns\/[^/]+\/scenarios\/[^/]+$/;

  // Main layout elements - use specific selectors to avoid duplicate ID issues
  readonly pageContainer: Locator;
  readonly globalCommandBar: Locator;
  readonly assetTreeSidebar: Locator;
  readonly tabbedCanvas: Locator;

  // Command bar elements
  readonly missionBriefButton: Locator;
  readonly checklistButton: Locator;
  readonly dialogHistoryButton: Locator;
  readonly opsLogButton: Locator;

  // Tab bar
  readonly tabBar: Locator;

  // Modals and overlays
  readonly missionBriefBox: Locator;
  readonly objectivesChecklist: Locator;
  readonly quizModal: Locator;
  readonly dialogOverlay: Locator;

  constructor(page: Page) {
    super(page);
    this.pageContainer = page.locator('#app-shell-page');
    // Use header.app-shell-header to get the correct command bar (not the inner div)
    this.globalCommandBar = page.locator('header.app-shell-header');
    this.assetTreeSidebar = page.locator('#asset-tree-sidebar-container');
    this.tabbedCanvas = page.locator('#tabbed-canvas-container');

    // Command bar buttons in the sidebar
    this.missionBriefButton = page.locator('.mission-brief-icon');
    this.checklistButton = page.locator('.checklist-icon');
    this.dialogHistoryButton = page.locator('.dialog-icon');
    this.opsLogButton = page.locator('.ops-log-icon');

    // Tab bar within tabbed canvas
    this.tabBar = page.locator('#tab-bar');

    // Modals - draggable boxes have class 'draggable-box' and ID 'draggable-html-box-{name}'
    this.missionBriefBox = page.locator('#draggable-html-box-mission-brief, .draggable-box:has(.draggable-box__title:has-text("Mission Brief"))');
    this.objectivesChecklist = page.locator('#draggable-html-box-checklist, .draggable-box:has(.draggable-box__title:has-text("Checklist"))');
    this.quizModal = page.locator('.quiz-modal');
    this.dialogOverlay = page.locator('.dialog-overlay.dialog-visible');
  }

  protected async waitForPageLoad(): Promise<void> {
    await expect(this.pageContainer).toBeVisible();
    await expect(this.assetTreeSidebar).toBeVisible();
    await expect(this.tabbedCanvas).toBeVisible();
    // Wait for simulation to initialize (ground stations to load)
    await this.page.waitForTimeout(2000);
  }

  /**
   * Navigate directly to a scenario.
   */
  async gotoScenario(campaignId: string, scenarioId: string): Promise<void> {
    await this.page.goto(`/campaigns/${campaignId}/scenarios/${scenarioId}`);
    await this.waitForPageLoad();
  }

  /**
   * Dismiss any visible dialog overlay that might be blocking interactions.
   */
  async dismissDialogIfPresent(): Promise<void> {
    try {
      // Check if dialog is visible
      if (await this.dialogOverlay.isVisible({ timeout: 1000 })) {
        // Try clicking the continue/close button
        const closeBtn = this.dialogOverlay.locator('button:has-text("Continue"), button:has-text("OK"), .close-btn, .dialog-close').first();
        if (await closeBtn.isVisible({ timeout: 500 })) {
          await closeBtn.click();
          // Wait for dialog to close
          await expect(this.dialogOverlay).not.toBeVisible({ timeout: 5000 });
        }
      }
    } catch {
      // No dialog present, that's fine
    }
  }

  /**
   * Open the mission brief panel.
   */
  async openMissionBrief(): Promise<void> {
    await this.dismissDialogIfPresent();
    await this.missionBriefButton.click();
    await expect(this.missionBriefBox).toBeVisible();
  }

  /**
   * Close the mission brief panel.
   */
  async closeMissionBrief(): Promise<void> {
    // Close button has class 'draggable-box__close-btn' or ID ending in '-close'
    const closeButton = this.missionBriefBox.locator('.draggable-box__close-btn, [id$="-close"]').first();
    await closeButton.click();
    await expect(this.missionBriefBox).not.toBeVisible();
  }

  /**
   * Open the objectives checklist.
   */
  async openChecklist(): Promise<void> {
    await this.dismissDialogIfPresent();
    await this.checklistButton.click();
    await expect(this.objectivesChecklist).toBeVisible();
  }

  /**
   * Close the objectives checklist.
   */
  async closeChecklist(): Promise<void> {
    // Clicking the button again toggles it off
    await this.checklistButton.click();
    await expect(this.objectivesChecklist).not.toBeVisible();
  }

  /**
   * Get all objective items from the checklist.
   */
  getObjectiveItems(): Locator {
    return this.objectivesChecklist.locator('.objective-item');
  }

  /**
   * Get a specific objective by its ID.
   */
  getObjective(objectiveId: string): Locator {
    return this.objectivesChecklist.locator(`[data-objective-id="${objectiveId}"]`);
  }

  /**
   * Check if an objective is marked as completed.
   */
  async isObjectiveCompleted(objectiveId: string): Promise<boolean> {
    const objective = this.getObjective(objectiveId);
    return objective.locator('.completed, .objective-completed').isVisible();
  }

  /**
   * Check if an objective is currently active.
   */
  async isObjectiveActive(objectiveId: string): Promise<boolean> {
    const objective = this.getObjective(objectiveId);
    const classList = await objective.getAttribute('class');
    return classList?.includes('active') ?? false;
  }

  /**
   * Answer a quiz question by clicking an option.
   * @param optionIndex 0-based index of the option to select
   */
  async answerQuiz(optionIndex: number): Promise<void> {
    await expect(this.quizModal).toBeVisible();
    const options = this.quizModal.locator('.quiz-option');
    await options.nth(optionIndex).click();
    // Click continue/submit button
    const continueButton = this.quizModal.locator('.quiz-continue-btn, .quiz-submit-btn, button:has-text("Continue")');
    await continueButton.click();
  }

  /**
   * Select a ground station in the asset tree by ID.
   */
  async selectGroundStation(gsId: string): Promise<void> {
    await this.dismissDialogIfPresent();
    const gsItem = this.assetTreeSidebar.locator(`[data-asset-id="${gsId}"], [data-gs-id="${gsId}"]`);
    await gsItem.click();
  }

  /**
   * Get tabs from the tab bar.
   */
  getTabs(): Locator {
    return this.tabBar.locator('.nav-link');
  }

  /**
   * Select a tab by clicking it.
   * Supports prefix matching for tabs like 'acu-control' which become 'acu-control-0'.
   */
  async selectTab(tabId: string): Promise<void> {
    await this.dismissDialogIfPresent();
    // Try exact match first, then prefix match (for dynamic tabs like acu-control-0)
    const exactTab = this.tabBar.locator(`.nav-link[data-tab-id="${tabId}"]`);
    const prefixTab = this.tabBar.locator(`.nav-link[data-tab-id^="${tabId}-"]`);

    if (await exactTab.count() > 0) {
      await exactTab.click();
    } else {
      await prefixTab.first().click();
    }
  }

  /**
   * Get the currently active tab.
   */
  getActiveTab(): Locator {
    return this.tabBar.locator('.nav-link.active');
  }

  /**
   * Wait for the simulation to be ready (ground stations loaded).
   */
  async waitForSimulationReady(): Promise<void> {
    // Wait for at least one ground station to appear in the asset tree
    const gsItems = this.assetTreeSidebar.locator('[data-asset-type="ground-station"], .ground-station-item, .asset-tree-item');
    await expect(gsItems.first()).toBeVisible({ timeout: 15000 });
  }

  /**
   * Wait for a dialog box to appear.
   */
  async waitForDialog(): Promise<Locator> {
    await expect(this.dialogOverlay).toBeVisible({ timeout: 10000 });
    return this.dialogOverlay;
  }

  /**
   * Dismiss a dialog by clicking continue or close.
   */
  async dismissDialog(): Promise<void> {
    const closeButton = this.dialogOverlay.locator('button:has-text("Continue"), button:has-text("OK"), .close-btn').first();
    await closeButton.click();
    await expect(this.dialogOverlay).not.toBeVisible();
  }
}
