import { Page, Locator } from '@playwright/test';

/**
 * Abstract base class for all page objects.
 * Provides common functionality for page navigation and waiting.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * URL pattern for this page. Can be a string or RegExp.
   */
  abstract readonly url: string | RegExp;

  /**
   * Navigate to this page and wait for it to load.
   */
  async goto(): Promise<void> {
    if (typeof this.url === 'string') {
      await this.page.goto(this.url);
    }
    await this.waitForPageLoad();
  }

  /**
   * Wait for page-specific elements to indicate the page is ready.
   * Override in subclasses to wait for page-specific conditions.
   */
  protected abstract waitForPageLoad(): Promise<void>;

  /**
   * Get a locator for an element by test ID.
   */
  protected getByTestId(testId: string): Locator {
    return this.page.locator(`[data-testid="${testId}"]`);
  }

  /**
   * Get a locator for an element by its ID attribute.
   */
  protected getById(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  /**
   * Wait for navigation to complete after an action.
   */
  protected async waitForNavigation(action: () => Promise<void>): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/.*/),
      action(),
    ]);
  }
}
