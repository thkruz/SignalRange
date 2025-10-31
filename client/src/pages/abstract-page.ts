/**
 * Abstract base class for page components
 * Contains common functionality shared across different pages
 */
export abstract class AbstractPage {
  protected container: HTMLElement | null = null;
  protected isInitialized: boolean = false;

  constructor(protected containerId: string) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container with id '${containerId}' not found`);
    }
  }

  /**
   * Initialize the page - must be implemented by subclasses
   */
  abstract init(): void;

  /**
   * Render the page content - must be implemented by subclasses
   */
  abstract render(): void;

  /**
   * Clean up resources when page is destroyed
   */
  destroy(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.isInitialized = false;
  }

  /**
   * Show the page
   */
  show(): void {
    if (this.container) {
      this.container.style.display = 'block';
      if (!this.isInitialized) {
        this.init();
        this.isInitialized = true;
      }
    }
  }

  /**
   * Hide the page
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Common method to attach event listeners
   */
  protected attachEventListeners(
    selector: string,
    event: string,
    handler: EventListener
  ): void {
    if (!this.container) return;

    const elements = this.container.querySelectorAll(selector);
    elements.forEach(element => {
      element.addEventListener(event, handler);
    });
  }

  /**
   * Common method to show loading state
   */
  protected showLoading(message: string = 'Loading...'): void {
    if (this.container) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading';
      loadingDiv.textContent = message;
      this.container.appendChild(loadingDiv);
    }
  }

  /**
   * Common method to hide loading state
   */
  protected hideLoading(): void {
    if (this.container) {
      const loadingElements = this.container.querySelectorAll('.loading');
      loadingElements.forEach(el => el.remove());
    }
  }

  /**
   * Common method to display errors
   */
  protected showError(error: string): void {
    if (this.container) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error';
      errorDiv.textContent = error;
      this.container.appendChild(errorDiv);
    }
  }

  /**
   * Common method to clear errors
   */
  protected clearErrors(): void {
    if (this.container) {
      const errorElements = this.container.querySelectorAll('.error');
      errorElements.forEach(el => el.remove());
    }
  }

  /**
   * Common validation helper
   */
  protected validateRequired(value: string, fieldName: string): boolean {
    if (!value || value.trim() === '') {
      this.showError(`${fieldName} is required`);
      return false;
    }
    return true;
  }

  /**
   * Common method to get form data
   */
  protected getFormData(formSelector: string): FormData | null {
    if (!this.container) return null;

    const form = this.container.querySelector(formSelector) as HTMLFormElement;
    return form ? new FormData(form) : null;
  }
}